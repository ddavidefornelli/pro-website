import { Clerk } from '@clerk/clerk-js/no-rhc';
import { apiFetch } from './api-fetch';
import type { AuthStatus } from './types';
import { webConfig } from './config';
import { clerkOrigin } from './clerk-config';
import { CloudError, httpError } from './http-error';
import { hasPrivacyAcknowledgement } from './privacy-state';

let instance: Clerk | null = null;
let loading: Promise<Clerk> | null = null;
export function clerkAccountEmail(): string | null { return instance?.user?.primaryEmailAddress?.emailAddress ?? null; }

export class ClerkCloud {
  onAccountChange: () => void = () => {};
  private accountKey: string | null = null;
  private userId: string | null = null;
  private signingOut = false;
  private listening = false;

  private async sdk(): Promise<Clerk> {
    if (!hasPrivacyAcknowledgement(localStorage)) throw new CloudError('privacy', 'Accept the Terms & Privacy before continuing.');
    if (!loading) {
      const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
      clerkOrigin(key);
      instance = new Clerk(key);
      // Hosted Account Portal supplies Google sign-in; no remote UI bundle,
      // inline styles, third-party avatar or CAPTCHA scripts in our document.
      loading = instance.load({ telemetry: false }).then(() => instance!).catch(() => {
        loading = null;
        throw new CloudError('auth', 'Could not connect to Clerk. Check your connection and try again.');
      });
    }
    const clerk = await loading;
    if (!this.listening) {
      this.listening = true;
      clerk.addListener(({ user }) => {
        if (this.accountKey && !this.signingOut && user?.id !== this.userId) {
          this.accountKey = null;
          queueMicrotask(() => this.onAccountChange());
        }
      });
    }
    return clerk;
  }

  private async request<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    const clerk = await this.sdk();
    const userId = clerk.user?.id;
    if (!userId || !clerk.session) throw new CloudError('unauthorized', 'Sign in to use prune.');
    if (this.userId && userId !== this.userId) throw new CloudError('account_changed', 'The account changed. Reload before accessing planner data.');
    const token = await clerk.session.getToken();
    if (!token) throw new CloudError('unauthorized', 'Your session has expired. Sign in again.');
    let response: Response;
    try {
      response = await apiFetch('/api/planner', {
        method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(command === 'generate_weekly_review' ? 110_000 : 20_000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ command, args }),
      }, command === 'generate_weekly_review' ? 110_000 : 20_000);
    } catch { throw new CloudError('network', 'Could not reach the planner. Your pending changes remain on this device.'); }
    const value = await response.json().catch(() => null);
    if (!response.ok) {
      const known: Record<string, string> = {
        configuration: 'You are signed in with Clerk, but the planner connection is not ready. The operator must configure the server and apply the Clerk database migration. Your saved data has not been changed.',
        identity_migration_required: 'Your account needs operator migration before you can access the planner. Existing planner data has not been changed.',
        identity_conflict: 'Your account mapping needs operator review. Existing planner data has not been changed.',
      };
      if (value && known[value.code]) throw new CloudError(value.code, known[value.code]!);
      throw httpError(response.status, value, command === 'generate_weekly_review', args.preview === true);
    }
    if (clerk.user?.id !== userId) throw new CloudError('account_changed', 'The account changed while loading. Reload before continuing.');
    return value as T;
  }

  async execute<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    const clerk = await this.sdk();
    switch (command) {
      case 'auth_status': {
        if (!clerk.user || !clerk.session) return { configured: true, email: null, accountKey: null } as T;
        const identity = await this.request<{ userId: string; email: string }>('auth_status');
        this.userId = clerk.user.id;
        this.accountKey = `${webConfig().url}:${identity.userId}`;
        return { configured: true, email: identity.email, accountKey: this.accountKey } satisfies AuthStatus as T;
      }
      case 'sign_in_with_google':
        await clerk.redirectToSignIn({ signInForceRedirectUrl: `${location.origin}/`, signUpForceRedirectUrl: `${location.origin}/` });
        return null as T;
      case 'sign_out':
        this.signingOut = true;
        try { await clerk.signOut(); this.accountKey = null; this.userId = null; }
        finally { this.signingOut = false; }
        return null as T;
      case 'planner_call': {
        const expected = (args.args as Record<string, unknown> | undefined)?._accountKey;
        if (expected && expected !== this.accountKey) throw new CloudError('account_changed', 'The account changed. Reload before continuing.');
        return this.request<T>(command, args);
      }
      case 'generate_weekly_review': return this.request<T>(command, args);
      default: throw new CloudError('validation', 'Unsupported browser command.');
    }
  }
}
