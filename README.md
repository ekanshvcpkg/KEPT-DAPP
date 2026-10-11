# KEPT

Android app for the Solana Seeker: swear daily Oaths, stake SKR, prove each day with two photos.

| Path | Layer | What |
|---|---|---|
| `frontend/` | UI | the Expo app (Android, Solana Seeker) |
| `backend/` | Node backend | Express + Prisma backend (V4 Devnet prototype) |
| `onchain/` | On-chain (Rust) | Anchor program `kept_test` (`6iXXBqsdiCnUTSVf8CW3Uuw8c7iYvZSj5haz64QMuMUh`) |
| `packages/*` | shared TS | config, engine, schemas, chain client |
| `infra/` | infra | `docker-compose.yml` (local Postgres) |
| `design/` | design | the design handoff (read-only source of truth) |
| `docs/` | docs | architecture, backend gaps, decisions, build plan, API; `docs/notes/` for session reports |
| `legacy/` | reference | V3 Aura backend code, program tests and docs (not built) |
| `patches/` | tooling | pnpm dependency patches |

Each top-level folder has a `README.md` describing its contents.

## For judges

**Install.** Copy the APK to an Android phone (or the Solana Seeker) and open it; allow "Install unknown
apps" for your file manager when Android asks. From a computer with the Android SDK:
`adb install kept-release.apk`. On first launch tap **Get started**, then pick a mode.

**Try the demo** (recommended): a sample account on a simulated backend, wallet and program. It needs no
wallet, no SKR and no network (it works in airplane mode); nothing is sent anywhere, and signing screens
say "Demo: the approval is simulated." `docs/DEMO_SCRIPT.md` is a two-minute walkthrough of the core loop,
including **Skip to tomorrow** (Profile › Settings), which settles a day so you can see misses cost HP and
stake. Restart demo / Exit demo are in the same place.

**Use my wallet** (Live) is the real app on Solana **Devnet**, with any Mobile Wallet Adapter wallet
(Seeker Wallet, Phantom, Solflare). What is real:

| Real on Devnet | How |
|---|---|
| Sign-in | Sign-In With Solana message signed in your wallet, checked by the backend; Seeker Genesis Token check |
| Create, join, start, cancel, settle, claim an Oath | Transactions to the Anchor program `kept_test` (`6iXXBqsdiCnUTSVf8CW3Uuw8c7iYvZSj5haz64QMuMUh`); stakes are escrowed on chain |
| Balances, test SKR | Read from RPC; the faucet sends test SKR once per wallet |
| Invites, nudges, inbox, kept rate | The backend (kept rate is the backend's plain kept / (kept + missed), "New" under 10 days) |
| Bounties | The backend's one current Bounty: list, detail and join |

Not real yet in Live (shown as unavailable or hidden, never faked): the photo check (needs a
backend decision, so proofs end on "Check unavailable"); Rematch, creating a Bounty, swap and creator
pages (no backend yet). HP and cost-per-miss on Oath screens are the design's numbers computed in the app;
what the program pays follows its own rules today (see `docs/BACKEND_GAPS.md`). A Live build needs
`EXPO_PUBLIC_API_URL` set to the backend; without it only Demo starts.

## Setup
Requires Node ≥ 20, pnpm, Docker (local Postgres). For the program: Rust, Solana CLI (Agave), Anchor 1.2.0.

```bash
pnpm install
pnpm db:up                       # Postgres 16 on localhost:5432 (user/pass/db: kept)
cp backend/.env.example backend/.env   # then fill it in (see backend/.env.example)
pnpm --filter kept-backend exec prisma migrate deploy
pnpm api:dev                     # http://localhost:3000
```

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm program:build`, `pnpm program:test` (build the program before testing it; its tests load `target/idl`).

## Run the app on an Android phone
The app is a **development build** (Expo Go can't run the wallet adapter or the camera). One-time setup: Android Studio (SDK + platform tools, `ANDROID_HOME` set), JDK 17, and on the phone **Developer options → USB debugging** on.

```bash
pnpm install
adb devices                      # the phone must be listed as "device"
pnpm mobile:android              # prebuilds android/, builds and installs app.kept.mobile, starts Metro on 8082
```
After the first install you only need Metro: `pnpm mobile:start`, then open **KEPT** on the phone (same Wi-Fi, or `adb reverse tcp:8082 tcp:8082` over USB). Shake the phone (or `adb shell input keyevent 82`) for the dev menu.

### Demo and Live
On first launch, **Get started** asks how to start (D-80):
- **Try the demo:** a sample account on the built-in mock. No wallet, no network, works in airplane mode. A violet **DEMO** badge sits next to DEVNET, and signing screens say the approval is simulated. Profile → Settings → **Restart demo** puts the account back the way it began; **Exit demo** wipes it and goes back to the start.
- **Use my wallet:** Live. Real wallet (MWA), real backend, real program. No mock data. Features the backend doesn't have yet (Rematch, creating Bounties, swap, creator pages) are hidden; see `docs/BACKEND_GAPS.md`. Signing out returns to the start, where the mode can be picked again.

"I have an invite" and `kept://join/<code>` links always use Live.

### A release APK
```bash
cd frontend/android && ./gradlew assembleRelease     # → app/build/outputs/apk/release/app-release.apk
```
- **Demo** works in any release APK.
- **Live** uses the hosted Devnet API at `https://kepttestapp.onrender.com` by default. Set `EXPO_PUBLIC_API_URL` (and `EXPO_PUBLIC_STAKE_MINT`) in `frontend/.env` before building only when overriding that API. A release build still pointing at `localhost` refuses Live with a message.

### Live against your local API (development build)
1. Start the backend (Setup above). In `backend/.env` put your phone wallet's address in `SGT_MOCK_ALLOWLIST` to get **A3 Seeker verified**; leave it out to see **A3·no**.
2. `cp frontend/.env.example frontend/.env` and set `EXPO_PUBLIC_STAKE_MINT` (the `STAKE_MINT` printed by the API's `v4-setup` script) so the balance chip shows SKR. The example points to Render; to use the local API, set `EXPO_PUBLIC_API_URL=http://localhost:3000`.
3. Use `adb reverse tcp:8082 tcp:8082` for Metro. If using the local API, also run `adb reverse tcp:3000 tcp:3000`.
4. Open KEPT → **Get started** → **Use my wallet** → pick a wallet row → approve the connect, then the sign-in message in your wallet.

Proof photos in Live end on "Check unavailable" until the app has the on-device checker the backend now expects (`docs/notes/LIVE_DEMO_PLAN.md` Q1).

**Dev menu (development builds only):** long-press the orange **DEVNET** badge. Override any slice to `http` or `mock`, pick a mock scenario (`judges`, `notEligible`, `walletRejected`, `offline`, `noSkr`, …), use the mock wallet in Live, move the virtual clock, jump to any of the 116 screens, open the component **Gallery**, or sign out.

Deep link test: `adb shell am start -a android.intent.action.VIEW -d "kept://join/IRON-7K2Q"`.

### Testing the core loop
- **In Demo (fastest):** Today has Iron Week with photo 2 due, Hydra 14 to claim, and a joined Bounty; Oaths → Guitar Days is broken with a Rematch offer. In a development build, Dev menu → **End day** / **To deadline** moves time: other members prove on their own and Oaths settle after their last day.
- **On Devnet (Live, two phones or two wallets):** both wallets need devnet SOL and SKR (`POST /api/faucet` gives 5,000 SKR once). Phone 1: + → Start an Oath → Group → Sign & stake → Invite (QR). Phone 2: + → Join with code → scan → Join & stake. Phone 1: Start. On chain a solo Oath has no stake (D-30).

### Testing Rematch, review, Bounties, profiles, inbox and wallet
In Demo (or a development build with the mock scenario of your choice):
- **Rematch:** Oaths → Guitar Days → **Rematch · win back 500** (R1) → Join → R3 lobby. Scenario `rematchActive` shows R·act; **End day** through its last day for R4 / L6.
- **Group review:** bell → **Review photo** (G1) → Approve or Reject. To ask for one: an "AI + group review" Oath → photo 2 → scenario `proofFail` three times → **Ask your group to review** (G2).
- **Bounties:** Bounties tab → any Bounty → **Join free** → H3; `bountyOut` → H4, `bountyJoined` → H5. **Created** → **Create a Bounty** (K1–K5).
- **Profiles, inbox, wallet:** Profile tab (I1, I4, I5, I7, I8, I9), the bell (N1), the balance chip (W1 → W2 → W3 swap / faucet, W4 receive).

See `docs/ARCHITECTURE.md` and `docs/BUILD_PLAN.md`.
