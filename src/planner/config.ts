export interface PublicConfig { url: string; publicKey: string }

/** Only public configuration belongs in a Vite bundle. Never accept a service-role key. */
export function publicConfig(url: unknown, key: unknown): PublicConfig {
  if (typeof url !== "string" || typeof key !== "string" || !url || !key) {
    throw new Error("Web signup is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the same project used by the Mac app, then rebuild.");
  }
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { throw new Error("VITE_SUPABASE_URL must be your HTTPS Supabase project URL."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if ((parsed.protocol !== "https:" && !(local && parsed.protocol === "http:"))
    || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("Use the HTTPS Supabase project URL without a path, query or credentials.");
  }
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (!publicKey) {
    try {
      const parts = key.split(".");
      publicKey = parts.length === 3 && JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"))).role === "anon";
    } catch { /* Not a legacy anon JWT. */ }
  }
  if (!publicKey || /\s/.test(key)) {
    throw new Error("Use a Supabase publishable or anon key, never a service-role or secret key.");
  }
  return { url: parsed.origin, publicKey: key };
}

export function webConfig(): PublicConfig {
  return publicConfig(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function safeResourceUrl(target: string): string | null {
  try {
    const url = new URL(target);
    if (!/^https?:\/\//i.test(target) || !["http:", "https:"].includes(url.protocol)
      || !url.hostname || url.username || url.password || /[\u0000-\u0020\u007f]/.test(target)) return null;
    return url.href;
  } catch { return null; }
}
