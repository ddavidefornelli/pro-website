# prune — web app

A mobile-first daily planner and focus timer, with email-and-password sign-in at `/` and an **Install for Mac** button in the top-right corner. `/download` still starts the Mac download.

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

These are public browser settings, embedded **at build time**. A modern `sb_publishable_…` key or legacy anon key is accepted. Never use a service-role key, `sb_secret_…` key, OpenAI key or other privileged credential. Partial/unsafe configuration fails Vite startup/build; a completely unconfigured checkout displays a setup error and cannot falsely report successful signup. Do not put real keys into tests.

Sign in with an existing account’s email and password after acknowledging the notice. The website does not send sign-in emails, request codes, or automatically create accounts. A returning session is restored only after this browser has acknowledged the current privacy notice. Existing email-code-only users need a password configured before using this flow.

## Features

- Today and Tomorrow: up to three tasks per day; titles, estimates, most-important-task selection, and web resources. Tomorrow is available immediately.
- Focus: one active task, timestamp-based timer, pause/resume, written stop reasons, completion, and an in-memory-only notes scratchpad. Pause before switching views, just like the Mac app.
- Overview: completion calendar, optional scheduled weekly AI reviews, saved report history, and current-week previews. Previews are session-only and retain the server's cooldowns/quotas.
- Profile: all-time/recent stats, streaks, AI preferences and sign-out.
- Durable local snapshot/outbox: optimistic local saves, ordered automatic retries, idempotent requests, cross-device conflict handling and multi-tab coordination with Web Locks. A failed local save is not reported as success. Only definitively rejected changes can be discarded.
- Phone-first layouts: touch-sized controls, 16px form inputs, stacked focus screen, bounded dialogs, safe-area padding, and natural vertical scrolling when the viewport or software keyboard is short.

### Browser differences and limitations

- **Local files remain Mac-only.** The desktop syncs labels/absolute paths, not file contents. The website displays these attachments as “Open in the Mac app”; it cannot attach or open arbitrary Mac paths. Web links open in a separate tab with `noopener noreferrer`. This implementation does not introduce uploads.
- **Browser sessions are not Keychain sessions.** The Supabase browser client persists access/refresh tokens in a separate localStorage entry, handles token refresh, and coordinates auth across tabs. Tokens never enter the planner snapshot/outbox. This is JavaScript-accessible storage, not HttpOnly cookies; use a trusted device/browser profile. A server-mediated cookie session would be a separate architecture change.
- Sign-out is local to this browser session, not global across the Mac app. It clears browser credentials, signs out other web tabs, and retains that account's pending planner changes. Remote token revocation is best-effort when offline; already-issued access tokens can remain valid until expiry.
- Sign-in/session verification requires internet on startup, as in the Mac app. After loading the account, cached planner actions work through connection losses. The cache is not a full account-history archive. Clearing site data can permanently lose unsynced work.
- The timer uses timestamps, not interval counts, so background throttling/reload does not reset elapsed focus time. Review scheduling catches up on focus/visibility/next launch; no browser task runs after all tabs are closed.
- HTTPS and a current browser with Web Locks support are required (localhost is allowed for development). Unencrypted site storage is shared by tabs on this origin but isolated by Supabase project and immutable user ID.

## Connect the existing backend

Do **not** reset the Mac app's database or create a parallel account store. Point both clients at the same project. The web transport calls the existing endpoints:

```text
/auth/v1/token?grant_type=password, /user, /token, /logout
/rest/v1/rpc/planner_call
/functions/v1/weekly-review
```

Backend source, RLS, transactional planner rules, idempotent receipts, AI quotas and migrations remain in `../pro/supabase`. Apply any outstanding migrations there, including the local-queue protocol and `20261019000100_tomorrow_available.sql`. This website does not apply migrations or make administrative changes automatically. Provider secrets remain in the Edge Function, never in this repo's frontend configuration.

### Password authentication

Enable Supabase email/password Auth. Users must already have an account with a password; this client provides sign-in only, not signup or password reset. No SMTP configuration or email templates are needed for this sign-in flow. Existing accounts that only used email codes need a password configured through a trusted account-management process. Auth rate limits and abuse controls still need hosted smoke tests; do not enable a mandatory CAPTCHA until a matching client flow is added.

### Weekly AI CORS

The existing Edge Function's `ALLOWED_ORIGINS` must include the exact website origin. Its default allowlist covers desktop/dev origins, not a deployed website. Setting this secret **replaces** the defaults, so retain the Mac origins:

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

Deploy `dist/` to a static host. On Vercel, add the two `VITE_SUPABASE_*` variables to the relevant deployment environments, build with `npm run build`, and output `dist`. Rebuild/redeploy after changing them. `vercel.json` preserves direct `/download` navigation and adds CSP, frame protection, MIME and referrer protections. If using a custom/self-hosted Supabase domain rather than `*.supabase.co`, update the CSP's `connect-src` accordingly. Other static hosts must configure equivalent headers and the download-route fallback.

The Mac installer remains `public/prune.dmg`; replace it when shipping a newer installer. The header downloads it directly so installing does not navigate away from an active planner.

### Privacy before public release

`PRIVACY.md` is the Mac notice adapted for browser storage and web hosting, with a distinct `privacy-web-v1` acknowledgement. **Its web adaptation is marked Draft and needs operator/legal review before public release**, including actual hosting/log retention and processor arrangements. Notice acknowledgement is not AI consent. AI remains a separate account-level opt-in, off for new accounts.

Google Ads, GoatCounter and Vercel analytics from the old marketing page are not loaded in this private signup/planner interface. Production CSP permits only same-origin scripts. Account export/deletion remain manual support requests, as in the Mac app; no new automated deletion/export feature is claimed.

## Tests

```sh
npx playwright install chromium webkit
npm test
# Or:
npm run test:unit
npm run test:e2e
```

Unit tests cover the durable queue, retry identities, ambiguous failures, storage failures, account isolation, timer projection, public-key validation, safe resource URLs, privacy records and HTTP error classification. Playwright runs Chromium and WebKit, including real touch/mobile contexts, password sign-in/invalid credentials, refresh/restoration, task/focus workflows, previews, conflicts, multi-tab sign-out and phone/landscape layouts.

Browser tests exercise the real Supabase SDK, browser storage/Web Locks and HTTP transport against **intercepted Auth/RPC/AI fixtures**. They do not send real email, connect to a hosted database, call paid AI, or prove concurrent hosted database behavior. Test-only public configuration is set by `playwright.config.ts`, never production code. Mobile screenshots are written to the ignored `test-results/` directory. Before release, verify existing-account password sign-in, Mac↔web sync, timer conflicts, real review generation and sign-out against the actual hosted project.

## Source map and parity maintenance

```text
src/App.tsx                  Solid shell, persistent Mac download, planner mount
src/planner/auth.ts           Browser signup/sign-in and notice acknowledgement
src/planner/browser.ts        Supabase browser auth + bounded authenticated HTTP
src/planner/api.ts            Typed planner API and persistent queue integration
src/planner/main.ts           Ported planner/focus UI with web resource handling
src/planner/local-queue.ts    Ported durable outbox + browser-tab refresh handling
src/planner/weekly-review.ts  Saved weekly reports, consent and current-week preview
src/planner/styles.css       Original Mac UI styling
src/styles.css               Mobile-first web layout and shell overrides
src/shared/task-timing.ts    Shared timing comparison logic copied from the Mac app
```

The ported source is vendored here so deployment is independent of `../pro`. When the desktop changes, review/merge its UI, timing, queue and RPC contract changes deliberately; preserve browser auth, file restrictions, mobile overrides and multi-tab handling. There is no automatic cross-repository source sync.
