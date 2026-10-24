# prune — web app

A mobile-first daily planner and focus timer, with email-code sign-in at `/` and an **Install for Mac** button in the top-right corner. `/download` still starts the Mac download.

**Launch status:** see [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) for the security review, test results and remaining hosted launch gates. Passing local tests is not production approval.

The planner UI, timing/statistics helpers and durable local outbox were ported from the sibling Mac application in `../pro`. This is a working browser client for the **same Supabase backend**, not a local demo or a new database. Solid mounts the shell; the ported TypeScript planner owns its own DOM subtree. No Tauri runtime or sibling checkout is required to build this website.

## Configure and run

Requires Node.js 22.12+.

```sh
npm ci
cp .env.example .env.local
# Fill in the two public values from the SAME Supabase project used by the Mac app.
npm run dev
```

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_LEGACY_ANON_KEY
```

These are public browser settings, embedded **at build time**. A modern `sb_publishable_…` key or legacy anon key is accepted. Never use a service-role key, `sb_secret_…` key, OpenAI key or other privileged credential. Partial/unsafe configuration fails Vite startup/build; production builds also fail when configuration is entirely missing. An unconfigured development checkout displays a setup error and cannot falsely report successful signup. Do not put real keys into tests.

After acknowledging the notice, enter your email, then enter the one-time code sent to your inbox. No password is needed. New accounts are created through Supabase email authentication. A returning session is restored only after this browser has acknowledged the current privacy notice.

## Features

- Today and Tomorrow: up to three tasks per day; titles, estimates, and most-important-task selection. Tomorrow is available immediately. Desktop resource metadata is preserved, but the current web UI does not display or edit resources.
- Focus: one active task, timestamp-based timer, pause/resume, written stop reasons, completion, and an in-memory-only notes scratchpad. Pause before switching views, just like the Mac app.
- Overview: completion calendar, optional scheduled weekly AI reviews, saved report history, and current-week previews. Previews are session-only and retain the server's cooldowns/quotas.
- Profile: all-time/recent stats, streaks, AI preferences and sign-out.
- Durable local snapshot/outbox: optimistic local saves, ordered automatic retries, idempotent requests, cross-device conflict handling and multi-tab coordination with Web Locks. A failed local save is not reported as success. Only definitively rejected changes can be discarded.
- Phone-first layouts: touch-sized controls, 16px form inputs, stacked focus screen, bounded dialogs, safe-area padding, and natural vertical scrolling when the viewport or software keyboard is short.

### Browser differences and limitations

- **Resources remain Mac-only in the current UI.** The desktop syncs labels, URLs and absolute paths, not file contents. Existing resource metadata is still in task API responses and the browser cache, but the website does not render resource controls or open arbitrary Mac paths. This implementation does not introduce uploads.
- **Browser sessions are not Keychain sessions.** The Supabase browser client persists access/refresh tokens in a separate localStorage entry, handles token refresh, and coordinates auth across tabs. Tokens never enter the planner snapshot/outbox. This is JavaScript-accessible storage, not HttpOnly cookies; use a trusted device/browser profile. A server-mediated cookie session would be a separate architecture change.
- Sign-out is local to this browser session, not global across the Mac app. It clears browser credentials, signs out other web tabs, and retains that account's pending planner changes. Remote token revocation is best-effort when offline; already-issued access tokens can remain valid until expiry.
- Sign-in/session verification requires internet on startup, as in the Mac app. After loading the account, cached planner actions work through connection losses. The cache is not a full account-history archive. Clearing site data can permanently lose unsynced work.
- The timer uses timestamps, not interval counts, so background throttling/reload does not reset elapsed focus time. Review scheduling catches up on focus/visibility/next launch; no browser task runs after all tabs are closed.
- HTTPS and a current browser with Web Locks support are required (localhost is allowed for development). Unencrypted site storage is shared by tabs on this origin but isolated by Supabase project and immutable user ID.

## Connect the existing backend

Do **not** reset the Mac app's database or create a parallel account store. Point both clients at the same project. The web transport calls the existing endpoints:

```text
/auth/v1/otp, /verify, /user, /token, /logout
/rest/v1/rpc/planner_call
/functions/v1/weekly-review
```

Backend source, RLS, transactional planner rules, idempotent receipts, AI quotas and migrations remain in `../pro/supabase`. Apply any outstanding migrations there, including the local-queue protocol and `20261019000100_tomorrow_available.sql`. This website does not apply migrations or make administrative changes automatically. Provider secrets remain in the Edge Function, never in this repo's frontend configuration.

### Email-code authentication

Enable Supabase email Auth and configure SMTP for production delivery. Email templates (including Magic Link and Confirm Signup) must display `{{ .Token }}` so users can enter the code on the website, rather than follow a magic link. Keep this aligned with the Mac app’s existing email-code configuration. Auth rate limits, code expiry and email delivery still need hosted smoke tests; do not enable a mandatory CAPTCHA until a matching client flow is added.

### Weekly AI CORS

The existing Edge Function's `ALLOWED_ORIGINS` must include the exact website origin. The currently reviewed backend source and hosted preflight allow `https://www.prune.win`; do not assume a custom domain or preview origin is also allowed. Setting this secret **replaces** the defaults, so retain the Mac and required development origins:

```sh
# Run from the linked backend project in ../pro, replacing YOUR_DOMAIN.
npx supabase secrets set ALLOWED_ORIGINS='tauri://localhost,http://tauri.localhost,https://tauri.localhost,http://localhost:1420,http://127.0.0.1:1420,http://127.0.0.1:5173,https://YOUR_DOMAIN'
```

Use explicit production/preview origins rather than `*`. CORS is not an authentication or abuse defense; existing Auth, consent, RLS and server quotas still apply. AI failure does not block planner/timer operations.

## Build and deploy

```sh
npm run build
npm run preview
```

On Vercel, add the two `VITE_SUPABASE_*` variables to the relevant deployment environments. `vercel.json` selects the **Other** framework and `npm run build:vercel`, which builds `dist/` and packages the exact files and generated HTTP headers into `.vercel/output/` using the [Build Output API](https://vercel.com/docs/build-output-api). Clear any old dashboard Build Command/Output Directory overrides; do **not** publish only `dist/` on Vercel and discard the generated routing/header configuration. `/download` and `/download/` are explicitly preserved. Rebuild/redeploy after changing backend configuration; custom HTTPS Supabase domains work without a wildcard or a manual CSP edit.

On another static host, publish `dist/`, install the headers from `dist/security-headers.json` as real HTTP response headers, disable HTML caching (`Cache-Control: no-store`), and configure the download-route fallback. The JSON file is deployment metadata, not something the browser applies automatically. Deploy HTML, assets and headers atomically; never let a CDN rewrite JavaScript/CSS after integrity hashes are generated. Built artifacts require an HTTPS backend (use `npm run dev` for an HTTP local Supabase instance).

The Mac installer remains `public/prune.dmg`; replace it when shipping a newer installer. The header downloads it directly so installing does not navigate away from an active planner.

### Content Security Policy (CSP)

CSP is a browser-enforced allowlist, delivered in the `Content-Security-Policy` response header. If an injection bug inserts an unauthorized script, event handler, resource or connection, the browser blocks it. This matters particularly here because browser session tokens are accessible to JavaScript. CSP is defense in depth—not a replacement for safe text rendering, dependency hygiene, authentication or server-side authorization.

Our production policy is **hash-locked and generated from the final build**:

- Denies resources by default (`default-src 'none'`). JavaScript is authorized only by SHA-384 hashes of the emitted bytes, with matching Subresource Integrity (`integrity`) on every entry script. There is **no `'self'` or host fallback for scripts** and no `strict-dynamic` delegation to script loaders. A newly injected same-origin script is blocked too. Modified script bytes fail integrity verification.
- Adds stylesheet integrity checks. Stylesheets and images stay same-origin; inline styles/style attributes, data images, fonts, manifests, media, plugins, frames and workers are denied. Existing property-level CSSOM updates for the calendar, progress bars and animations still work.
- Blocks inline scripts, event handlers, `eval()`/string compilation, base-URL overrides and embedding this website in another site's frame. **All native form submissions are denied**, including same-origin ones: app forms use prevented submit events and the authenticated API transport.
- Allows connections only to the exact configured backend's five used Auth endpoints, `planner_call` RPC and `weekly-review` Edge Function. No same-origin fetch allowance, Supabase wildcard, Storage, arbitrary RPCs/Functions or Realtime. CSP path restrictions are not an authorization boundary (redirects can relax CSP path matching); the API transport also rejects redirects, and backend Auth/RLS remain mandatory.
- Upgrades insecure requests in deployed HTTPS responses. Adjacent headers enforce MIME checks, referrer suppression, framing denial, opener/resource isolation and disabled DNS prefetch. HTML is served `no-store` to avoid stale document/hash-policy combinations.

The Vite plugin in `scripts/csp-plugin.ts` hashes the finished bundle, adds integrity attributes and a restrictive meta fallback, and emits `security-headers.json`. `scripts/build-vercel.ts` packages those exact headers with the static files, so the real HTTP policy—not just a meta tag—pins scripts and API endpoints. Meta cannot enforce `frame-ancestors`; do not omit the HTTP headers. Builds fail on inline executable content, missing assets or module/code-splitting dependencies rather than silently weakening the allowlist. Introducing dynamic imports requires a deliberate integrity/CSP design review.

`npm run preview` reads the **built artifact's headers**, not newly changed environment values. On HTTP loopback only, it omits `upgrade-insecure-requests` so WebKit does not upgrade local assets to a nonexistent TLS listener; deployed HTTPS headers retain it. `npm run dev` deliberately does not enforce CSP because Vite HMR requires injected styles and a WebSocket. Browser DevTools shows CSP violations; adding an integration requires policy review, not adding `*`, `unsafe-inline` or `unsafe-eval`.

After deployment, run `npm run check:production` with the matching public configuration. It verifies the exact hosted policy, meta/header agreement and actual deployed JavaScript integrity on `/` and `/download`. No reporting collector is configured, so CSP violation data is not sent to a third party.

**Limits:** hash-approved JavaScript (including dependencies) can still read browser tokens and use permitted API endpoints. A compromised build/hosting account can replace both code and its policy; CSP is not protection against that. Trusted Types enforcement is not enabled: Solid's template runtime uses HTML sinks and needs a separately reviewed compatible integration, not a permissive default policy. HSTS subdomain/preload opt-in is also deliberately not assumed without auditing all subdomains. This is a hardened static-client policy, not a claim that the whole service is invulnerable.

### Privacy before public release

`PRIVACY.md` is the Mac notice adapted for browser storage and web hosting, with a distinct `privacy-web-v2` acknowledgement. **Its web adaptation is marked Draft and needs operator/legal review before public release**, including actual hosting/log retention and processor arrangements. Notice acknowledgement is not AI consent. AI remains a separate account-level opt-in, off for new accounts.

Google Ads, GoatCounter and Vercel analytics from the old marketing page are not loaded in this private signup/planner interface. Production CSP permits only integrity-pinned, build-hashed scripts. Account export/deletion remain manual support requests, as in the Mac app; no new automated deletion/export feature is claimed.

## Tests

```sh
npx playwright install chromium webkit
npm test
# Or:
npm run test:unit
npm run test:e2e
```

Unit tests cover the durable queue, retry identities, ambiguous failures, storage failures, account isolation, timer projection, public-key validation, safe resource URLs, privacy records and HTTP error classification. Playwright runs Chromium and WebKit, including real touch/mobile contexts, email-code sign-in/invalid codes, refresh/restoration, task/focus workflows, previews, conflicts, multi-tab sign-out and phone/landscape layouts.

Browser tests build production output into ignored `.playwright-dist/` (never overwriting production `dist/`) and exercise the real Supabase SDK, browser storage/Web Locks and HTTP transport against **intercepted Auth/RPC/AI fixtures**. They include stored-HTML injection, tampered/rejected session identities, browser-back after sign-out and scratchpad/token separation. Vite preview installs the production security headers, and explicit CSP/SRI probes verify blocked inline code/styles, same-origin/third-party script injection, modified bundles, frames, workers, native form submissions, base overrides and connections outside the exact API endpoint allowlist. The safe-rendering tests also assert that no injected HTML nodes exist, so CSP cannot conceal an unsafe-rendering regression. They do not send real email, connect to a hosted database, call paid AI, or prove concurrent hosted database behavior. Test-only public configuration is set by `playwright.config.ts`, never production code. Mobile screenshots are written to the ignored `test-results/` directory. Before release, verify real email delivery and code verification, Mac↔web sync, timer conflicts, real review generation and sign-out against the actual hosted project.

### Hosted release checks (non-destructive)

```sh
# Uses .env/.env.local public Supabase configuration. No admin credentials.
PRUNE_SITE_URL=https://www.prune.win npm run check:production
# Repeat browser stability checks with ten parallel local browser workers:
npm run test:e2e -- --repeat-each=3 --workers=10
```

`check:production` checks deployed headers, old tracker removal, anonymous SQL denial, Auth public settings, and AI authentication/CORS. It creates no accounts, sends no email, requests zero table rows and makes no paid AI calls. It intentionally fails if public signup is open: this release gate targets an **invite-only 5–10-person beta**, not a public launch. It does not prove authenticated account isolation or backend deployment parity. Use the read-only `supabase/security-audit.sql` in the hosted SQL Editor and complete the manual gates in `PRODUCTION_READINESS.md`. Do not reset or seed the shared production database.

## Source map and parity maintenance

```text
src/App.tsx                  Solid shell, persistent Mac download, planner mount
src/planner/auth.ts           Browser signup/sign-in and notice acknowledgement
src/planner/browser.ts        Supabase browser auth + bounded authenticated HTTP
src/planner/api.ts            Typed planner API and persistent queue integration
src/planner/main.ts           Ported planner/focus UI; desktop resource data preserved
src/planner/local-queue.ts    Ported durable outbox + browser-tab refresh handling
src/planner/weekly-review.ts  Saved weekly reports, consent and current-week preview
src/planner/styles.css       Original Mac UI styling
src/styles.css               Mobile-first web layout and shell overrides
src/shared/task-timing.ts    Shared timing comparison logic copied from the Mac app
```

The ported source is vendored here so deployment is independent of `../pro`. When the desktop changes, review/merge its UI, timing, queue and RPC contract changes deliberately; preserve browser auth, file restrictions, mobile overrides and multi-tab handling. There is no automatic cross-repository source sync.
