import { createHash } from "node:crypto";

// Deliberately no origin-wide allowlist: do not permit Storage, arbitrary RPCs,
// other Edge Functions, Realtime or another Supabase tenant.
export const API_PATHS = [
  "/auth/v1/otp", "/auth/v1/verify", "/auth/v1/user", "/auth/v1/token", "/auth/v1/logout",
  "/rest/v1/rpc/planner_call", "/functions/v1/weekly-review",
] as const;

export function integrity(content: string | Uint8Array): string {
  return `sha384-${createHash("sha384").update(content).digest("base64")}`;
}

export function securityHeaders(apiOrigin: string, scriptHashes: string[]): Record<string, string> {
  const url = new URL(apiOrigin);
  if (url.protocol !== "https:" || url.origin !== apiOrigin) {
    throw new Error("Production CSP requires an exact HTTPS Supabase origin.");
  }
  if (!scriptHashes.length || scriptHashes.some((hash) => !/^sha384-[A-Za-z0-9+/]{64}$/.test(hash))) {
    throw new Error("Production CSP requires SHA-384 hashes for the built scripts.");
  }
  const policy = [
    "default-src 'none'",
    // No 'self', host allowlist or strict-dynamic delegation. Only these exact
    // scripts can execute, and external scripts must carry matching SRI.
    `script-src ${[...new Set(scriptHashes)].map((hash) => `'${hash}'`).join(" ")}`,
    "script-src-attr 'none'",
    "style-src 'self'",
    "style-src-attr 'none'",
    `connect-src ${API_PATHS.map((path) => `${apiOrigin}${path}`).join(" ")}`,
    "img-src 'self'",
    "font-src 'none'",
    "manifest-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "child-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
  return {
    "Content-Security-Policy": policy,
    "Strict-Transport-Security": "max-age=31536000",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-DNS-Prefetch-Control": "off",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()",
    "X-Frame-Options": "DENY",
  };
}

/** Harden Vite's final HTML, failing closed if its output shape changes. */
export function hardenHtml(html: string, assets: Map<string, string | Uint8Array>, apiOrigin: string): {
  html: string; headers: Record<string, string>;
} {
  const hashes: string[] = [];
  const assetIntegrity = (tag: string, attribute: "src" | "href"): string => {
    const path = new RegExp(`\\b${attribute}="(/assets/[^"?#]+)"`).exec(tag)?.[1];
    const content = path && assets.get(path.slice(1));
    if (!content || /\bintegrity\s*=/i.test(tag)) throw new Error("Cannot integrity-pin an unexpected HTML asset.");
    return integrity(content);
  };
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, (tag) => {
    if (!/^<script\b[^>]*\btype="module"[^>]*>\s*<\/script>$/i.test(tag)) {
      throw new Error("Production HTML may contain only external module entry scripts.");
    }
    const hash = assetIntegrity(tag, "src");
    hashes.push(hash);
    return tag.replace("<script ", `<script integrity="${hash}" `);
  });
  html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/gi, (tag) =>
    tag.replace("<link ", `<link integrity="${assetIntegrity(tag, "href")}" `));
  if ((html.match(/<script\b/gi) ?? []).length !== hashes.length || /<style\b|\s(?:style|on\w+)\s*=/i.test(html)) {
    throw new Error("Unexpected inline executable content in production HTML.");
  }
  const headers = securityHeaders(apiOrigin, hashes);
  // frame-ancestors is HTTP-only. The upgrade directive stays in HTTPS response
  // headers, not meta, so the same artifact also works on HTTP loopback preview.
  // Other restrictions provide a meta fallback, not a substitute for headers.
  const metaPolicy = headers["Content-Security-Policy"]!
    .replace("; frame-ancestors 'none'", "")
    .replace("; upgrade-insecure-requests", "");
  if (!html.includes("<head>")) throw new Error("Production HTML has no head.");
  html = html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${metaPolicy}" />`);
  return { html, headers };
}
