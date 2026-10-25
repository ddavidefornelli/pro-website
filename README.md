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

- Today and Tomorrow: up to three equal tasks per day with editable titles and estimates; start any task in any order. No main-task designation, crowns, or completion animation. Tomorrow is available immediately. Desktop resource metadata is preserved, but the current web UI does not display or edit resources.
- Focus: one active task, timestamp-based timer, pause/resume, written stop reasons, completion, and an in-memory-only notes scratchpad. Pause before switching views, just like the Mac app.
- Overview: completion calendar, automatic scheduled weekly AI reviews, saved report history, and current-week previews. Previews are session-only and retain the server's cooldowns/quotas.
- Profile: all-time/recent stats, streaks, AI preferences, sign-out and confirmed account deletion (soft-delete flag, followed by manual removal after 30 days).
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

Apply `supabase/migrations/20261025000100_equal_tasks.sql` after the previous shared and website migrations before deploying this client. It removes the server's most-important-task-first restriction while preserving ownership, today's-task validation, the single-active-task rule, and queue safeguards. This affects all clients on the shared backend. Legacy priority fields/actions remain compatible with existing Mac clients and saved outbox commands; the web UI no longer uses them.

Do **not** reset the Mac app's database or create a parallel account store. Point both clients at the same project. The web transport calls the existing endpoints:

```text
/auth/v1/otp, /verify, /user, /token, /logout
/rest/v1/rpc/planner_call
/functions/v1/weekly-review
```

Backend source, RLS, transactional planner rules, idempotent receipts, AI quotas and migrations remain in `../pro/supabase`. Apply any outstanding migrations there, including the local-queue protocol and `20261019000100_tomorrow_available.sql`. This website does not apply migrations or make administrative changes automatically. Provider secrets remain in the Edge Function, never in this repo's frontend configuration.

### Account deletion

Apply `supabase/migrations/20261024000200_soft_delete_accounts.sql` after the shared backend migrations and this repo's automatic-weekly-reviews migration **before deploying this client**. It adds `planner_accounts."isDeleted"` (default `false`) and `deleted_at`. Deletion is authenticated, immediate, idempotent and never queued offline. It disables weekly AI and blocks planner RPCs/direct planner-data reads across web and Mac clients. Auth identity and cloud data remain until manual removal; signing in again does not reactivate the account. Other devices may retain offline caches.

After at least 30 days, list accounts ready for manual removal in the Supabase SQL editor:

```sql
select user_id, deleted_at
from public.planner_accounts
where "isDeleted" and deleted_at <= now() - interval '30 days'
order by deleted_at;
```

Review this list and permanently delete the corresponding **Auth users** via Supabase's administrative tools; deleting only `planner_accounts` does not remove all user data and may allow reprovisioning. No purge scheduler or automatic hard deletion is installed. Keep this migration in the shared backend's deployment history too so subsequent Mac/backend deployments preserve the guard.

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

### Publish and verify the security fix on Vercel

**Local changes do not fix the live domain until they are deployed.** A website check that still detects Google Ads/GoatCounter and missing HTTP headers is seeing the old marketing deployment, not this hardened app. Do not weaken CSP to accommodate that old page or unreviewed host-injected scripts.

`npm run build:vercel` now removes stale `.vercel/output/` **before** compiling, packages the exact HTML/assets/HTTP policy, and runs the website security assertions against the generated routes and final JavaScript **and CSS** bytes. It also scans copied public text assets for known tracker integrations. Compilation, integrity, policy or verification failure removes the deployable output, so a later `--prebuilt` command cannot accidentally publish an older artifact. CI runs this with fixture-only public configuration; **never deploy CI's fixture build or `.playwright-dist/`**.

To inspect an existing local package without deploying:

```sh
npm run build:vercel
npm run check:deployment
```

The artifact check supports only the route vocabulary generated by our packager and rejects unknown routing. It is **not** a Vercel/CDN emulator or a live HTTP test. Dashboard overrides, host injection, domain aliases and TLS must still be verified after deployment.

For the actual production release, first set the two production public Supabase variables in Vercel, clear stale Build Command/Output Directory overrides, enable Web Analytics in the Vercel project (leave Speed Insights disabled), and confirm the project/domain belong to this app. Deploy the current changes through the configured production Git branch, or use an authenticated Vercel CLI session:

```sh
# Select the existing project, not a new/empty one. Requires operator access.
# Use PRODUCTION variables, not fixture values; stop at any failed step.
npx vercel link &&
  npx vercel pull --yes --environment=production &&
  npx vercel build --prod &&
  npm run check:deployment &&
  npx vercel deploy --prebuilt --prod &&
  npm run check:production -- --url https://www.prune.win --website-only
```

Confirm the domain points at this new deployment. The last command must pass on `/`, `/download`, `/download/` and `/index.html`. Do not publish `dist/` alone or manually copy a CSP hash from a different build. Then run the full release checks (including `--require-invite-only` for the closed beta) and complete the manual backend/privacy gates in [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

### Content Security Policy (CSP)

CSP is a browser-enforced allowlist, delivered in the `Content-Security-Policy` response header. If an injection bug inserts an unauthorized script, event handler, resource or connection, the browser blocks it. This matters particularly here because browser session tokens are accessible to JavaScript. CSP is defense in depth—not a replacement for safe text rendering, dependency hygiene, authentication or server-side authorization.

Our production policy is **hash-locked and generated from the final build**:

- Denies resources by default (`default-src 'none'`). Application JavaScript is authorized by SHA-384 hashes of the emitted bytes, with matching Subresource Integrity (`integrity`) on every entry script. The only managed-script exception is `/_vercel/insights/script.js` on `https://www.prune.win` and `https://prune.win`; this script is trusted without SRI and can change independently of the build. There is no broad `'self'` fallback or `strict-dynamic` delegation. A newly injected same-origin script is blocked too. Modified script bytes fail integrity verification.
- Adds stylesheet integrity checks. Stylesheets and images stay same-origin; inline styles/style attributes, data images, fonts, manifests, media, plugins, frames and workers are denied. Existing property-level CSSOM updates for the calendar, progress bars and animations still work.
- Blocks inline scripts, event handlers, `eval()`/string compilation, base-URL overrides and embedding this website in another site's frame. **All native form submissions are denied**, including same-origin ones: app forms use prevented submit events and the authenticated API transport.
- Allows connections only to the exact configured backend's five used Auth endpoints, `planner_call` RPC and `weekly-review` Edge Function. Also allows Vercel Web Analytics connections under `/_vercel/insights/` on the two production origins. No broad same-origin fetch allowance, Supabase wildcard, Storage, arbitrary RPCs/Functions or Realtime. CSP path restrictions are not an authorization boundary (redirects can relax CSP path matching); the API transport also rejects redirects, and backend Auth/RLS remain mandatory.
- Upgrades insecure requests in deployed HTTPS responses. Adjacent headers enforce MIME checks, referrer suppression, framing denial, opener/resource isolation and disabled DNS prefetch. HTML is served `no-store` to avoid stale document/hash-policy combinations.

The Vite plugin in `scripts/csp-plugin.ts` hashes the finished bundle, adds integrity attributes and a restrictive meta fallback, and emits `security-headers.json`. `scripts/build-vercel.ts` revalidates the complete HTML and script/stylesheet bytes before packaging those exact headers with the static files, so the real HTTP policy—not just a meta tag—pins scripts and API endpoints. Meta cannot enforce `frame-ancestors`; do not omit the HTTP headers. Builds fail on inline executable content, ambiguous asset attributes, missing assets, known marketing integrations or module/code-splitting dependencies rather than silently weakening the allowlist. The source, build and hosted scans share `scripts/tracking-policy.ts`; this recognized-tracker denylist is not an exhaustive network audit. Introducing dynamic imports requires a deliberate integrity/CSP design review.

`npm run preview` reads the **built artifact's headers**, not newly changed environment values. On HTTP loopback only, it omits `upgrade-insecure-requests` so WebKit does not upgrade local assets to a nonexistent TLS listener; deployed HTTPS headers retain it. `npm run dev` deliberately does not enforce CSP because Vite HMR requires injected styles and a WebSocket. Browser DevTools shows CSP violations; adding an integration requires policy review, not adding `*`, `unsafe-inline` or `unsafe-eval`.

After deployment, run `npm run check:production` with the matching public configuration. It verifies the generated hosted policy semantically (directive/source ordering and whitespace do not matter), meta/header agreement and actual deployed JavaScript/CSS integrity on `/`, `/download`, `/download/` and `/index.html`. No reporting collector is configured, so CSP violation data is not sent to a third party.

**Limits:** hash-approved JavaScript (including dependencies) can still read browser tokens and use permitted API endpoints. A compromised build/hosting account can replace both code and its policy; CSP is not protection against that. Trusted Types enforcement is not enabled: Solid's template runtime uses HTML sinks and needs a separately reviewed compatible integration, not a permissive default policy. HSTS subdomain/preload opt-in is also deliberately not assumed without auditing all subdomains. This is a hardened static-client policy, not a claim that the whole service is invulnerable.

### Privacy before public release

`PRIVACY.md` combines plain-language terms for the free service with the privacy notice, browser storage details and automatic weekly AI disclosures. One unchecked sign-in checkbox records terms acceptance and privacy acknowledgement (`privacy-web-v5`) on this browser profile; the same version is not requested again unless site storage is cleared or another browser is used. This is not an account-wide legal acceptance register. **It remains Draft and requires operator/legal review before public release**, including the legitimate-interest assessment for default-on AI, hosting/log retention and processor arrangements. Notice acknowledgement is not AI consent.

Apply `supabase/migrations/20261024000100_automatic_weekly_reviews.sql` after the shared backend migrations before deploying this client. It enables reviews for newly provisioned planner accounts and preserves all existing account preferences (including disabled reviews). It affects all clients using this shared backend. Legacy backend `consent_*` fields remain protocol compatibility gates, not evidence of affirmative consent. Do not automatically enable existing disabled accounts from the browser. Users can turn reviews off or back on in Profile.

Vercel Web Analytics is enabled for production builds on `www.prune.win` and `prune.win` using `@vercel/analytics`; enable Web Analytics in the Vercel project and redeploy. Local development, preview deployments on other hosts and local tests do not send analytics. Page-view URLs have query strings and fragments stripped (including authentication parameters); no custom planner/task events are sent. Google Ads, GoatCounter and Speed Insights remain disabled. CSP preserves application integrity pinning with the narrow managed analytics exception described above. Account export remains a manual support request. Profile → Delete account marks the shared account as deleted and disables planner access and weekly AI; permanent removal is an operator task after 30 days, not an automatic job.

## Tests

```sh
npx playwright install chromium webkit
npm test
# Or:
npm run test:unit
npm run test:e2e
```

Unit tests cover the durable queue, retry identities, ambiguous failures, storage failures, account isolation, timer projection, public-key validation, safe resource URLs, privacy records and HTTP error classification. Playwright runs Chromium and WebKit, including real touch/mobile contexts, email-code sign-in/invalid codes, refresh/restoration, task/focus workflows, previews, conflicts, multi-tab sign-out and phone/landscape layouts.

Browser tests build production output into ignored `.playwright-dist/` (never overwriting production `dist/`) and exercise the real Supabase SDK, browser storage/Web Locks and HTTP transport against **intercepted Auth/RPC/AI fixtures**. They include stored-HTML injection, tampered/rejected session identities, browser-back after sign-out and scratchpad/token separation. Security regressions cover GET/HEAD headers on document aliases and query strings, actual same-origin frame rejection and modified stylesheet SRI, plus unit tests of the packaged deployment's headers/routes, public-file tracker scan and stale-output cleanup. Vite preview installs the production security headers, and explicit CSP/SRI probes verify blocked inline code/styles, same-origin/third-party script injection, modified bundles, frames, workers, native form submissions, base overrides and connections outside the exact API endpoint allowlist. The safe-rendering tests also assert that no injected HTML nodes exist, so CSP cannot conceal an unsafe-rendering regression. They do not send real email, connect to a hosted database, call paid AI, or prove concurrent hosted database behavior. Test-only public configuration is set by `playwright.config.ts`, never production code. Mobile screenshots are written to the ignored `test-results/` directory. Before release, verify real email delivery and code verification, Mac↔web sync, timer conflicts, real review generation and sign-out against the actual hosted project.

### Hosted release checks (non-destructive)

```sh
# Uses .env/.env.local public Supabase configuration. No admin credentials.
npm run check:production
# Explicit target (PRUNE_SITE_URL still works); safe HTTPS redirects are followed:
npm run check:production -- --url https://www.prune.win
# Enforce the closed-beta signup policy:
npm run check:production -- --require-invite-only
# Inspect just the website, or explicitly exclude optional AI checks:
npm run check:production -- --website-only
npm run check:production -- --skip-ai
# JSON without npm's banner, useful for saving a machine-readable report:
npm run --silent check:production -- --json > production-report.json
npm run check:production -- --help
# Repeat browser stability checks with ten parallel local browser workers:
npm run test:e2e -- --repeat-each=3 --workers=10
```

`check:production` checks the **live deployment**, not your local source: editing/building the app does not change its result until that build is deployed. It checks headers using the actual HTML GET response (not potentially different HEAD responses), known tracker integrations in HTML and fetched assets, actual script/stylesheet integrity, anonymous SQL denial, Auth public settings, and AI authentication/CORS. It creates no accounts, sends no email, requests zero table rows and makes no paid AI calls. Public signup is a **WARN** by default because it is a product/abuse-control decision; use **`--require-invite-only` for the 5–10-person closed-beta release gate**.

Results distinguish **PASS**, **WARN** (review required), **FAIL** (confirmed mismatch), **ERROR** (unverified due to configuration/network/response problems), and **SKIP** (dependent or explicitly excluded checks). Exit **0** means no failures/errors in the selected scope, **1** means confirmed failures, and **2** means the run is incomplete. Warnings/skips never mean full production approval. Missing CSP produces one CSP failure per page rather than cascading meta-comparison failures. Request deadlines include streamed bodies; script assets are size-bounded and downloaded once, and API credentials are never forwarded to website redirects/assets. Fix suggestions are grouped at the end. `--timeout-ms 30000` adjusts per-request deadlines. Run `node --experimental-strip-types --test tests/production-check.test.mjs` for the checker's credential-free regression tests.

The checker does not prove authenticated account isolation or backend deployment parity, and recognized-tracker scans are not exhaustive browser-network audits. Use the read-only `supabase/security-audit.sql` in the hosted SQL Editor and complete the manual gates in `PRODUCTION_READINESS.md`. Do not reset or seed the shared production database.

## Source map and parity maintenance

```text
src/App.tsx                  Solid shell, persistent Mac download, planner mount
src/planner/auth.ts           Browser signup/sign-in and notice acknowledgement
src/planner/browser.ts        Supabase browser auth + bounded authenticated HTTP
src/planner/api.ts            Typed planner API and persistent queue integration
src/planner/main.ts           Ported planner/focus UI; desktop resource data preserved
src/planner/local-queue.ts    Ported durable outbox + browser-tab refresh handling
src/planner/weekly-review.ts  Saved weekly reports and review preferences
src/planner/styles.css       Original Mac UI styling
src/styles.css               Mobile-first web layout and shell overrides
src/shared/task-timing.ts    Shared timing comparison logic copied from the Mac app
```

The ported source is vendored here so deployment is independent of `../pro`. When the desktop changes, review/merge its UI, timing, queue and RPC contract changes deliberately; preserve browser auth, file restrictions, mobile overrides and multi-tab handling. There is no automatic cross-repository source sync.
