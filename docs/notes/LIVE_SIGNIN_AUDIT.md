# Live wallet sign-in: audit and fixes (2026-10-10)

Scope: frontend only. Nothing in `backend/` or `onchain/` changed; no chain transaction was signed.

## Flow, as implemented and now verified

Live → A2 → `transact` (MWA `authorize`) → `POST /api/auth/nonce` → second `transact` (re-`authorize`, then
`signMessages`) → `POST /api/auth/verify` → token stored in `kept.live.session` → `GET /api/me`
(`genesis=false` is still a sign-in: A3·no). Files: `screens/onboarding/Onboarding.tsx`, `features/auth.ts`,
`chain/mwa.ts`, `chain/signature.ts` (new), `api/http/slices.ts`, backend `routes/v4.ts` + `auth.ts`.

## Root causes found

1. **Wrong signature sent to `/api/auth/verify`** (`chain/mwa.ts`). MWA `signMessages` returns the *signed
   payload* (message + 64-byte signature); the protocol library itself splits it that way
   (`mobile-wallet-adapter-protocol/lib/esm/index.native.js:256-258`). The app base64-encoded the whole thing, so
   the backend answered `401 Invalid or expired sign-in signature`. Reproduced against Render with a throwaway
   key: message‖signature → 401, bare 64 bytes → 200. Fix: `signatureFromSigned()` returns the 64 bytes (and
   refuses odd shapes with a clear error). Regression test fails with exactly that 401 if the fix is removed.
2. **Live could run on the mock in a development build** (`state/dev.ts`). `flags()` applied persisted Dev
   overrides in every mode, and `mockWalletOn()` allowed the mock wallet in Live. `kept.dev` is stored outside
   the mode scopes, and the dev deep link (`kept://dev/open/…`) wrote all-mock overrides + `mockWallet: true`
   into it, so any QA/screenshot run left every later Live sign-in on the mock. Fix: a chosen mode decides alone
   (Demo: mock for every slice; Live: http + MWA for every slice, no override can change that); overrides and the
   mock wallet apply only while no mode is chosen (tests and dev tooling) and are no longer persisted (only the
   mock scenario is; older saves are ignored on load). The Dev menu says so in Live.
3. **Stale Metro bundle** (environment, not source). The Metro already running on 8081 (started 13:25, before
   `env.ts` changed at 13:54) served a bundle with `EXPO_PUBLIC_API_URL ?? "http://localhost:3000"`: on the
   emulator that is the emulator itself, so Live sign-in failed as OFFLINE (M2). A restarted Metro serves the
   Render default and the fixes. **No native rebuild is needed** for a development build: `EXPO_PUBLIC_*` is
   inlined by Metro. A release APK embeds it and would need a rebuild.
4. **Two Metro servers on port 8081**: this workspace's (`*:8081`) and the `kept-example` app's (`[::1]:8081`).
   `adb reverse tcp:8081` reached the legacy app's renderer. The mobile `start` and `android` scripts now reserve
   port 8082 and the README / screenshot runner use it too.
5. Smaller: `env.ts` used `??`, so an empty `EXPO_PUBLIC_API_URL=` line left Live with no server (now `||`);
   `.env.example` still had a dead `EXPO_PUBLIC_API_MODE=hybrid` (removed).

Checked and fine: MWA 3.0.0 is the installed dependency; the merged manifest has the `solana-wallet` `<queries>`
entry and the `kept` / `exp+kept` intent filters (the wallet is launched with `startActivityForResult`, so the
result comes back to the same activity, `singleTask` is fine); `app.json` package `app.kept.mobile` matches the
Gradle `applicationId`; the identity URI `https://keptdapp.vercel.app` serves `assetlinks.json` with
`app.kept.mobile` and the debug-keystore fingerprint, which equals the installed APK's signing certificate (not
switched to the Render domain); request/response shapes match the shared zod schemas; the nonce message is
signed byte for byte; session restore, scoping (`kept.live.*` vs `kept.demo.*`, `kept.mwa` shared) and the
401 / offline branches of `restoreSession` behave as intended.

## Demo is preserved

Demo is still the mock backend, wallet and chain, offline, in every build: `flags()` and `mockWalletOn()` return
mock for Demo whatever the Dev menu holds, and `demoOffline.test.tsx` and the Demo navigation test pass
unchanged. The import-graph test (no mock code under `api/http`) passes. On the emulator the fresh bundle opened
Demo's Today with the DEMO badge before Live was tested.

## Verification

- `tsc --noEmit` clean, `eslint .` clean, `jest`: **13 suites, 250 tests** (was 234). New: `liveSignIn.test.ts`
  (real MWA wrapper + HTTP client + sign-in against stand-ins for the wallet and the backend's auth routes,
  `src/testing/fakeLive.ts`), mode tests for Live/Demo purity and for Dev settings persistence, and the three
  Live navigation tests rewritten to use those stand-ins instead of Dev-menu mocks.
- **Render** (real login, throwaway key): `/health` 200; `nonce` → exact message; `verify` with the bare
  signature → 200 (so `SESSION_SECRET` is set); `/api/me` → 200 (DB works); message‖signature → 401.
- **Emulator** (Android 15 arm64, `app.kept.mobile` debug build, Phantom in Testnet mode, fresh Metro on 8082,
  bundle checked to contain the Render default and the fix): with the Dev menu deliberately set to *all mock +
  mock wallet* before choosing Live, Live still opened real Phantom (Connect → second Connect → Sign message
  showing the server's `KEPT V4 sign-in` text → Confirm), returned to KEPT, landed on A3, and persisted
  `kept.live.session` with a server-issued token (not `mock.`), the account, `genesis: true`. `kept.dev` kept
  only `{scenario}`. Cold restart skipped login (A4). Closing Phantom's Connect sheet gave A2·e "Signature
  rejected" with the app back in front. Phantom warned "identity could not be verified" and declined the silent
  re-authorize, so Connect appears twice; sign-in works (see BACKEND_GAPS P2-7).
- Not verified here (emulator ≠ Seeker): Seed Vault wallet, a real Genesis Token, release-signed identity check.

## Remaining prerequisites

- Render: single instance (nonces are in memory); a Seeker's wallet on `SGT_MOCK_ALLOWLIST` (or a devnet
  `GENESIS_GROUP`) if it should see A3 rather than A3·no (BACKEND_GAPS P2-12). Nothing for `SESSION_SECRET` or the DB:
  both proven by the login above.
- `pnpm mobile:start` now uses 8082 and the current native manifest declares the HTTPS App Link. Android reports the
  `keptdapp.vercel.app` association verified; Phantom still displays its identity warning and declines silent
  reauthorization, so a fresh authorization is required. A Seeker Seed Vault check remains necessary.

## Manual Seeker check (needs the device)

1. Start Metro: `pnpm --filter @kept/mobile start -- --clear --port 8082`; `adb reverse tcp:8082 tcp:8082`; open the
   dev client at `exp+kept://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082`. Dev menu (long-press
   DEVNET) must read `API https://kepttestapp.onrender.com`.
2. Fresh start → Get started → **Use my wallet** → Seeker Wallet. Expect the Seed Vault prompt for `KEPT` /
   `keptdapp.vercel.app`; note whether it says the identity is verified, and whether Connect appears once or twice.
3. Approve; the sign prompt must show `KEPT V4 sign-in`, `Wallet: <your address>`, a nonce. Confirm.
4. KEPT returns to the front on A3 ("Seeker verified") or A3·no. Note which, and the wallet address in the Dev menu.
5. Force-stop, reopen: no wallet prompt, straight to A4 (or Today if onboarded).
6. Decline once (Close in the prompt): A2·e, app in front. Try again: succeeds.
7. Airplane mode, Get started → wallet: M2 offline, not a hang.
