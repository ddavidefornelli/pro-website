import { createClient, type AuthError, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthStatus } from "./api";
import { webConfig, type PublicConfig } from "./config";
import { CloudError, httpError } from "./http-error";
import { hasPrivacyAcknowledgement } from "./privacy-state";

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

/** Bounded requests; no cookies or referrer are sent to the external API. */
async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const url = String(input);
  const timeout = setTimeout(abort, url.includes("/functions/") ? 110_000 : url.includes("/logout") ? 5000 : 20_000);
  if (init?.signal?.aborted) abort();
  init?.signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(input, { ...init, signal: controller.signal, credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer" });
    const reader = response.body?.getReader();
    if (!reader) return response;
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new CloudError("size", "The server response is too large. Please contact support.");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const headers = new Headers(response.headers);
    headers.delete("Content-Encoding");
    headers.delete("Content-Length");
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers });
  } finally {
    clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", abort);
  }
}

function authError(error: AuthError): CloudError {
  if (error.status === 429) return new CloudError("rate_limited", "Too many sign-in attempts. Wait at least a minute before trying again.");
  if (error.name === "AuthRetryableFetchError" || !error.status) return new CloudError("network", "Could not reach sign-in services. Check your connection and try again.");
  if (error.status >= 500) return new CloudError("server", "Sign-in services are temporarily unavailable. Please try later or contact support.");
  return new CloudError("auth", "Sign-in could not be completed. Check your email and code, or request a new code and try again.");
}

/**
 * Browser transport for the Mac app's existing RPC contract.
 * Supabase manages refresh rotation and cross-tab auth locking. Browser sessions
 * are stored separately from the planner outbox, never in planner snapshots.
 */
export class BrowserCloud {
  private client: SupabaseClient | null = null;
  private config: PublicConfig | null = null;
  private accountKey: string | null = null;
  private signingOut = false;
  private invalidated = false;
  onAccountChange: () => void = () => {};

  private sdk(): SupabaseClient {
    if (this.client) return this.client;
    // Constructing the SDK can restore/refresh a saved session. Defer even that
    // until the device-local notice has been durably acknowledged.
    if (!hasPrivacyAcknowledgement(localStorage)) throw new CloudError("privacy", "Accept the Terms & Privacy before continuing.");
    this.config = webConfig();
    this.client = createClient(this.config.url, this.config.publicKey, {
      auth: {
        storageKey: `prune:auth:${this.config.url}`,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      global: { fetch: apiFetch },
    });
    this.client.auth.onAuthStateChange((_event, session) => {
      if (!session || this.key(session.user.id) !== this.accountKey) this.invalidateAccount();
    });
    window.addEventListener("storage", (event) => {
      if (event.key !== `prune:auth:${this.config!.url}`) return;
      try {
        const saved = event.newValue ? JSON.parse(event.newValue) as Session : null;
        if (!saved?.user || this.key(saved.user.id) !== this.accountKey) this.invalidateAccount();
      } catch { this.invalidateAccount(); }
    });
    return this.client;
  }

  private invalidateAccount(): void {
    if (!this.accountKey || this.signingOut || this.invalidated) return;
    this.invalidated = true;
    // No SDK calls/await inside an auth event handler.
    queueMicrotask(() => this.onAccountChange());
  }

  private key(userId: string): string { return `${this.config!.url}:${userId}`; }

  private async session(expected = this.accountKey): Promise<Session> {
    const { data, error } = await this.sdk().auth.getSession();
    if (error) throw authError(error);
    if (!data.session) throw new CloudError("unauthorized", "Your session has expired. Please sign in again.");
    if (expected && this.key(data.session.user.id) !== expected) throw new CloudError("account_changed", "The account changed. Reload before accessing planner data.");
    return data.session;
  }

  private async status(): Promise<AuthStatus> {
    const sdk = this.sdk();
    const { data, error } = await sdk.auth.getSession();
    if (error) throw authError(error);
    if (!data.session) return { configured: true, email: null, accountKey: null };
    // Verify identity with Auth before exposing a persistent account cache.
    const result = await sdk.auth.getUser(data.session.access_token);
    if (result.error) {
      if (result.error.status === 401 || result.error.status === 403) {
        await sdk.auth.signOut({ scope: "local" });
        return { configured: true, email: null, accountKey: null };
      }
      throw authError(result.error);
    }
    const user = result.data.user;
    if (!user.email || user.is_anonymous || user.id !== data.session.user.id) throw new CloudError("unauthorized", "Sign in with an email account to use prune.");
    const latest = await sdk.auth.getSession();
    if (latest.data.session?.user.id !== user.id) throw new CloudError("account_changed", "The account changed during startup. Please sign in again.");
    this.accountKey = this.key(user.id);
    return { configured: true, email: user.email, accountKey: this.accountKey };
  }

  private async post<T>(route: string, body: Record<string, unknown>, expected = this.accountKey): Promise<T> {
    // Capture both identity and bearer token together. An account switch while
    // a request is in flight can never replay the old outbox into a new account.
    const session = await this.session(expected);
    let response: Response;
    try {
      response = await apiFetch(`${this.config!.url}${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: this.config!.publicKey, Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (error instanceof CloudError) throw error;
      throw new CloudError("network", "Could not reach Supabase. Your pending changes remain on this device and will retry.");
    }
    let value: unknown = null;
    try { value = await response.json(); }
    catch {
      if (response.ok) throw new CloudError("server", "The server returned an incomplete response. Your pending changes remain on this device.");
    }
    if (!response.ok) throw httpError(response.status, value, route.startsWith("/functions/"), body.preview === true);
    return value as T;
  }

  async execute<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    let result: unknown;
    switch (command) {
      case "auth_status": result = await this.status(); break;
      case "send_code": {
        const { error } = await this.sdk().auth.signInWithOtp({ email: String(args.email) });
        if (error) throw authError(error);
        result = null;
        break;
      }
      case "verify_code": {
        const { data, error } = await this.sdk().auth.verifyOtp({ email: String(args.email), token: String(args.code), type: "email" });
        if (error) throw authError(error);
        if (!data.session || !data.user?.email || data.user.is_anonymous) throw new CloudError("auth", "The sign-in response was incomplete. Please try again.");
        this.accountKey = this.key(data.user.id);
        result = { configured: true, email: data.user.email, accountKey: this.accountKey };
        break;
      }
      case "sign_out": {
        this.signingOut = true;
        try {
          const sdk = this.sdk();
          await sdk.auth.stopAutoRefresh();
          await sdk.auth.signOut({ scope: "local" });
          // A failed refresh of an expired offline session can prevent SDK
          // signOut from reaching its local-removal step. Forget that device's
          // credentials explicitly, but never erase a newly switched account.
          const storageKey = `prune:auth:${this.config!.url}`;
          const remaining = localStorage.getItem(storageKey);
          if (remaining) {
            const saved = JSON.parse(remaining) as Session;
            if (!saved.user || this.key(saved.user.id) !== this.accountKey) {
              this.invalidateAccount();
              throw new CloudError("account_changed", "The account changed while signing out. Reload before continuing.");
            }
            localStorage.removeItem(storageKey);
          }
          if (localStorage.getItem(storageKey)) throw new CloudError("storage", "Could not clear your browser session. Please try again.");
          this.accountKey = null;
          result = null;
        } finally { this.signingOut = false; }
        break;
      }
      case "planner_call": {
        const params = args.args as Record<string, unknown>;
        result = await this.post("/rest/v1/rpc/planner_call", { p_action: args.action, p_args: params, p_timezone: args.timezone }, typeof params._accountKey === "string" ? params._accountKey : this.accountKey);
        break;
      }
      case "generate_weekly_review":
        result = await this.post("/functions/v1/weekly-review", { timezone: args.timezone, ...(args.preview ? { preview: true } : {}) });
        break;
      default: throw new CloudError("validation", "Unsupported browser command.");
    }
    return result as T;
  }
}
