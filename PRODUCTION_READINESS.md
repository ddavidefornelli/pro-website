# Production / small-beta readiness review

Reviewed: **24 October 2026**. Scope: this web checkout, the shared backend source/tests in `../pro/supabase`, and non-destructive public checks of the configured Supabase project and `https://www.prune.win`.

## Decision

**Not approved for the current live launch yet.** After the hosted gates below are completed, a controlled **5–10-person, invite-only beta with non-sensitive data** is a reasonable next step. No code review, dependency scan or test suite can guarantee that information cannot be stolen. This is not an independent penetration test, compliance certification or hosted load test.

No deployment, remote SQL changes, real email delivery, account creation/deletion, production planner mutations or paid AI requests were performed during this review. Existing work-in-progress UI changes were preserved.

## Results actually observed

| Check | Result | What it establishes / limits |
| --- | --- | --- |
| `npm run build` | PASS | TypeScript and production bundling succeed with local public configuration. |
| `npm run test:unit` | **45 passed** | Outbox durability/account isolation, error classification, public-only build configuration, privacy version, security-header configuration. |
| `npm run test:e2e` | **56 passed** across Chromium/WebKit | Production-compiled frontend with intercepted Auth/RPC/AI fixtures; includes phone/touch layouts, OTP flow, refresh, focus/pause/complete, offline recovery, conflicts, multi-tab sign-out, stored HTML injection and rejected/tampered local identities. |
| `npm run test:e2e -- --repeat-each=3 --workers=10` | **168 passed** | Repeated frontend stability with ten local browser workers. This does **not** measure ten real hosted accounts, SMTP throughput, Postgres concurrency or provider capacity. |
| `npm --prefix ../pro run test:backend` | **334 passed** | Actual migrations applied to local PGlite, SQL RLS/privileges/cross-account denial, queue receipts/revisions, AI authentication/consent/leases/quotas/provider fixtures. PGlite does not prove hosted migration parity or real multi-connection behavior. |
| `npm audit --json` | **0 known vulnerabilities** | Installed npm dependency advisories at review time, not proof of vulnerability absence. |
| Tracked-file credential-pattern scan | No matches | No recognized privileged-key/private-key/service-role-JWT patterns in currently tracked file contents. Not a complete secret-history/binary audit. |
| Hosted anonymous database probes | PASS | All ten planner/private-AI tables reject anonymous SELECT with SQL permission error `42501`; probes requested zero rows. Anonymous planner RPC denied. This alone does **not** prove authenticated RLS isolation. |
| Hosted AI authentication / CORS | PASS for canonical origin | Missing user token rejected with 401; `https://www.prune.win` preflight allowed; unapproved origin denied. Bare `https://prune.win` is not allowed and redirects to `www` on the website. |
| Hosted Auth public settings | Mixed | Email enabled, anonymous accounts disabled, email confirmation enabled; **public signup remains open**. OTP expiry/rate limits/SMTP not observable through this public check. |
| Hosted website | **FAIL launch gate** | Still serves older marketing HTML with Google Ads and GoatCounter. CSP, X-Frame-Options, nosniff, referrer and opener-isolation headers were absent on `/` and `/download`. HSTS was present. This does not establish that a breach has occurred. |

The first browser run had 16 failures: stale expectations for removed headings/resources and the new mobile estimate dialog, plus genuine small-screen header overflow. Tests now follow the current design, including resource preservation without displaying desktop paths; the overflow is fixed rather than hidden with global clipping.

## CSP hardening follow-up (local only)

The table above records the original review. After the CSP follow-up, **51 unit tests and 66 Chromium/WebKit browser tests pass**, `npm run build:vercel` succeeds, and `npm audit --audit-level=low` reports **0 known advisories**. The original repeated/backend/hosted observations were not rerun as part of this follow-up.

The policy now hashes the final JavaScript, requires matching script/stylesheet integrity, denies script host fallbacks and native form submissions, and restricts connections to the exact backend endpoints in use. Vercel Build Output API packaging binds the real HTTP headers to the build and verifies asset hashes and policy agreement before packaging. Tests cover same-origin/third-party script injection, altered bundles, dynamic code compilation, frames/workers/forms/base overrides, endpoint restrictions and normal workflows without CSP violations. See [README.md](README.md#content-security-policy-csp) for deployment details and explicit limitations.

**No hosted deployment or hosted policy verification was performed for this follow-up.** The launch gates below remain required. Do not deploy with the old `dist/`-only Vercel configuration or enable host-injected scripts to work around a CSP error.

## Repository fixes made in this review

- Fixed header shrink behavior so sign-in and planner views fit 280px+ screens while keeping Profile and Install for Mac usable.
- Added an accessible label for the current planner main region without restoring removed visible headings.
- Updated UI tests for the intentional current resource/estimate design; added stored-HTML, session/cache identity, signed-out history and private-scratchpad regression tests.
- Browser tests now run a production build in separate ignored `.playwright-dist/`, not the development server or production `dist/`.
- Production builds fail closed on missing, partial, insecure or privileged Supabase configuration. Added the missing `.env.example`.
- Added HSTS and cross-origin opener isolation to the existing restrictive Vercel headers; regression-tested the configuration.
- Corrected the privacy notice from password login to email codes/transactional email processing, documented the actual resource UI, and bumped acknowledgement to `privacy-web-v2`. It remains **Draft** until operator review; no legal approval is implied.
- Added `npm run check:production`, read-only `supabase/security-audit.sql`, and credential-free GitHub CI checks.

## Required before inviting testers

1. **Deploy this reviewed web application and headers.** Set only `VITE_SUPABASE_URL` and a public publishable/anon key in Vercel; use the checked-in **Other** framework / `npm run build:vercel` configuration and generated `.vercel/output/` Build Output API package. Clear old dashboard output/build overrides: publishing `dist/` alone discards the generated HTTP CSP. Deploy the current working changes, not just the old committed marketing version. Confirm `/` and `/download` no longer load marketing scripts. Disable any host-injected analytics for the private app. Re-run `npm run check:production`; it must pass for the canonical origin. If serving any other origin directly, add that exact origin to AI CORS while preserving desktop origins. Never add `*` as an authentication workaround.
2. **Make the beta invite-only on the server.** Provision the intended accounts through trusted Supabase administration and disable new public signups. Test that existing users can still request email codes and an unknown email cannot register. This setting affects the shared Mac backend too. A hidden URL, UI email allowlist or CORS restriction is not signup protection. Mandatory CAPTCHA is not currently implemented in this client; do not enable a challenge without adding and testing that flow.
3. **Verify the hosted backend, not just local source.** Run `supabase/security-audit.sql` in the linked hosted SQL Editor and review every result. Confirm all nine migrations through `20261019000100_tomorrow_available.sql` are applied, owner-only SELECT policies, no direct client writes, private internal RPCs, and `development_unlimited = false`. Apply only genuinely missing backend migrations from `../pro`; **do not reset or seed the production database**. Backend remains outside this web repo.
4. **Do a real two-account isolation/sync smoke test.** Using two disposable tester-controlled accounts and separate browser profiles, create distinct private task markers. Verify account B sees no A data via its dashboard **or direct REST SELECT**, and cannot rename/start/complete A's known task ID. Verify the reverse too. Confirm unknown/expired bearer tokens are denied. Test Mac↔web synchronization, conflicting same-account edits, network loss/reconnect, refresh and multi-tab sign-out. Record results without recording codes or bearer tokens.
5. **Prove production email delivery and abuse limits.** Test new/provisioned and returning accounts with real controlled inboxes. Confirm both templates include `{{ .Token }}`, codes expire appropriately (e.g. ten minutes), single-use behavior, resend/verification rate limits and trustworthy SMTP delivery. Capacity must allow 5–10 testers: default/restricted Supabase email service can be insufficient. Confirm sender authorization/SPF/DKIM and monitor failures. Email access is account access; there is no additional user MFA flow in this web client.
6. **Finish the privacy and operations work.** Identify the actual SMTP processor, verify hosting/Supabase/OpenAI terms, regions and log/backup retention; review and publish the notice, bump its version again if processing details materially change. Test the manual account export/deletion support procedure. Enable MFA for operator accounts (Supabase, Vercel, GitHub, email/provider dashboards), least-privilege access, secret rotation and a documented incident response/contact path.
7. **Have a recovery plan and control AI.** Verify backups and a restore procedure before users rely on important data; unsynced device changes are not cloud backups. Keep optional hosted AI disabled unless its paid-provider, consent/revocation and quota behavior are smoke-tested. If enabled, verify bounded budgets, billing alerts, `development_unlimited=false`, and one successfully running retention Cron job. Never paste service-role/OpenAI/SMTP secrets into frontend variables, test reports or chat.

## Remaining privacy/security trade-offs

- **Browser credentials are JavaScript-readable localStorage**, not HttpOnly cookies or Keychain. CSP and safe text rendering reduce XSS risk but do not remove it. A browser extension, compromised dependency/origin or device could expose sessions and planner text. Use trusted device profiles, updated browsers and device encryption; do not use this beta for confidential/regulated information. Moving credentials to a server-mediated HttpOnly-cookie design is a separate architecture project and still would not make active XSS harmless.
- **Sign-out is not local-data erasure.** Credentials are removed, other web tabs sign out, and the planner UI is gated, but cached snapshots/outbox remain unencrypted for recovery. Another person with local site-storage access can read that text. Clearing site data erases local copies but can permanently lose unsynced work; confirm synchronization first. Account deletion does not remotely wipe device caches. Already-issued tokens can remain usable until expiry; offline revocation is best-effort.
- **Not end-to-end encrypted.** Supabase and authorized administrators can access cloud planner content. OpenAI receives selected titles/reasons only after separate opt-in; attached contents/resources and the focus scratchpad are not sent to AI by this implementation. Provider processing/retention and backups remain outside the frontend's control.
- Public signup without server restrictions exposes SMTP/AI/infrastructure budgets to outsiders even if only ten people are told the URL. Quotas and CORS are not a complete bot/DoS defense.
- This review did not independently audit the bundled Mac installer, signing/notarization, all deployment/provider settings, a full Git history, or the security of users' inboxes/devices.

## Repeatable commands

```sh
npm ci
npx playwright install chromium webkit
npm audit --audit-level=low
npm test
npm run test:e2e -- --repeat-each=3 --workers=10
npm run build
# Package exact build hashes + HTTP headers for Vercel (no deployment):
npm run build:vercel
# Shared backend, if the sibling checkout is present:
npm --prefix ../pro run test:backend
# Opt-in hosted, non-destructive release gate; no admin credentials:
PRUNE_SITE_URL=https://www.prune.win npm run check:production
```

The hosted check intentionally exits nonzero with the currently observed deployment/settings. Do not weaken that check to obtain a green launch result. Local tests and the script never substitute for the manual authenticated hosted smoke tests above.
