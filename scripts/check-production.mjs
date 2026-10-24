// Opt-in, non-destructive hosted checks. No admin keys, email, user accounts,
// planner mutations, row downloads or paid AI requests. Bodies/keys are not logged.
import { loadEnv } from "vite";
import { publicConfig } from "../src/planner/config.ts";
import { API_PATHS, integrity, securityHeaders } from "./security-policy.ts";

const env = loadEnv("production", process.cwd(), "VITE_SUPABASE_");
const config = publicConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const site = new URL(process.env.PRUNE_SITE_URL || "https://www.prune.win");
if (site.protocol !== "https:" || site.username || site.password || site.pathname !== "/" || site.search || site.hash) {
  throw new Error("PRUNE_SITE_URL must be the exact canonical HTTPS website origin, without a path or credentials.");
}
const apiHeaders = { apikey: config.publicKey, "Content-Type": "application/json" };
let failures = 0;
const report = (ok, label) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
};
async function probe(label, url, init, inspect) {
  try {
    const response = await fetch(url, { ...init, redirect: "manual", credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(15_000) });
    try { await inspect(response); }
    finally { if (!response.bodyUsed) await response.body?.cancel(); }
  } catch {
    report(false, `${label}: could not verify (network, timeout or unexpected response)`);
  }
}

await probe("Auth settings", `${config.url}/auth/v1/settings`, { headers: apiHeaders }, async (response) => {
  if (!response.ok) { report(false, "Auth settings available with the public key"); return; }
  const data = await response.json();
  report(data.external?.email === true, "Email authentication enabled");
  report(data.external?.anonymous_users === false, "Anonymous sign-in disabled");
  report(data.mailer_autoconfirm === false, "Email confirmation enabled");
  report(data.disable_signup === true, "Invite-only beta: new public signups disabled (pre-create the 5–10 test accounts in Supabase)");
});

for (const table of ["planner_accounts", "planner_tasks", "planner_resources", "planner_stops", "planner_reviews", "planner_receipts", "ai_controls", "ai_usage", "ai_review_requests", "ai_review_previews"]) {
  await probe(table, `${config.url}/rest/v1/${table}?select=*&limit=0`, { headers: apiHeaders }, async (response) => {
    const data = await response.json();
    // A generic 401 or missing table is not evidence of working SQL privileges.
    report([401, 403].includes(response.status) && data?.code === "42501", `Anonymous SELECT denied by SQL permissions: ${table} (zero rows requested)`);
  });
}
await probe("Planner anonymous denial", `${config.url}/rest/v1/rpc/planner_call`, {
  headers: apiHeaders, method: "POST", body: JSON.stringify({ p_action: "dashboard", p_args: {}, p_timezone: "UTC" }),
}, async (response) => {
  const data = await response.json();
  report([401, 403].includes(response.status) && ["42501", "PT401"].includes(data?.code), "Planner dashboard rejects anonymous access");
});
await probe("AI anonymous denial", `${config.url}/functions/v1/weekly-review`, {
  headers: apiHeaders, method: "POST", body: JSON.stringify({ timezone: "UTC" }),
}, async (response) => {
  report(response.status === 401, "AI endpoint rejects requests without a user bearer token");
});
for (const origin of [site.origin, "https://security-fixture.invalid"]) {
  await probe("AI CORS", `${config.url}/functions/v1/weekly-review`, {
    method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,apikey,content-type" },
  }, async (response) => {
    const allowed = response.headers.get("access-control-allow-origin");
    report(origin === site.origin ? response.status === 204 && allowed === origin : response.status === 403 && allowed === null,
      origin === site.origin ? "AI CORS allows the exact canonical website origin" : "AI CORS rejects an unapproved browser origin");
  });
}

for (const path of ["/", "/download"]) {
  await probe("Website headers", `${site.origin}${path}`, { method: "HEAD" }, async (response) => {
    report(response.status === 200, `${path}: serves the deployment directly (use the canonical origin, not a redirect)`);
    const csp = response.headers.get("content-security-policy") || "";
    const directive = (name) => csp.split(";").map((part) => part.trim().split(/\s+/)).find(([key]) => key === name)?.slice(1).join(" ");
    const scriptPolicy = directive("script-src") || "";
    report(/^(?:'sha384-[A-Za-z0-9+/]{64}'\s*)+$/.test(scriptPolicy)
      && csp === securityHeaders(config.url, scriptPolicy.split(/\s+/).map((hash) => hash.slice(1, -1)))["Content-Security-Policy"],
    `${path}: exact hash-locked enforced CSP (no script host fallback, forms, frames or workers)`);
    report(directive("connect-src") === API_PATHS.map((endpoint) => `${config.url}${endpoint}`).join(" "),
      `${path}: connections restricted to the configured API endpoints`);
    report(response.headers.get("cross-origin-resource-policy") === "same-origin", `${path}: cross-origin resource reuse denied`);
    report(response.headers.get("cache-control")?.includes("no-store") === true, `${path}: HTML is not cached separately from its CSP`);
    report(response.headers.get("x-content-type-options") === "nosniff", `${path}: MIME sniffing disabled`);
    report(response.headers.get("x-frame-options") === "DENY", `${path}: framing denied`);
    report(response.headers.get("referrer-policy") === "no-referrer", `${path}: referrers disabled`);
    report(response.headers.get("cross-origin-opener-policy") === "same-origin", `${path}: cross-origin opener isolation enabled`);
    const hsts = response.headers.get("strict-transport-security") || "";
    report(Number(/max-age=(\d+)/i.exec(hsts)?.[1]) >= 31536000, `${path}: HSTS enabled for at least one year`);
  });
}
for (const path of ["/", "/download"]) {
  await probe("Website content", `${site.origin}${path}`, {}, async (response) => {
    if (!response.ok) { report(false, `${path}: website content available`); return; }
    const html = await response.text();
    report(!/googletagmanager|google-analytics|gc\.zgo\.at|goatcounter|vercel-scripts/i.test(html), `${path}: no old marketing trackers in the hosted HTML`);
    const metaPolicy = (response.headers.get("content-security-policy") || "")
      .replace("; frame-ancestors 'none'", "").replace("; upgrade-insecure-requests", "");
    const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
    report(metaPolicy.length > 0 && metaTags.some((tag) => /http-equiv="Content-Security-Policy"/i.test(tag)
      && tag.includes(`content="${metaPolicy}"`)), `${path}: build meta CSP matches its HTTP policy`);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    let pinned = scripts.length > 0;
    for (const [, attributes, inline] of scripts) {
      const source = /\bsrc="([^"]+)"/.exec(attributes)?.[1];
      const hash = /\bintegrity="(sha384-[A-Za-z0-9+/]{64})"/.exec(attributes)?.[1];
      const url = source && new URL(source, site.origin);
      if (!url || url.origin !== site.origin || !url.pathname.startsWith("/assets/") || !hash || inline.trim()) {
        pinned = false;
        continue;
      }
      await probe("Script integrity", url, {}, async (asset) => {
        report(asset.ok && integrity(new Uint8Array(await asset.arrayBuffer())) === hash, `${path}: deployed JavaScript matches its integrity hash`);
      });
    }
    report(pinned, `${path}: every script is external, same-origin and integrity-pinned`);
  });
}
console.log("\nThese checks do NOT prove authenticated cross-account RLS, migration parity, SMTP, OTP expiry/rate limits, backups, retention, admin security or absence of vulnerabilities. Complete PRODUCTION_READINESS.md too.");
process.exitCode = failures ? 1 : 0;
