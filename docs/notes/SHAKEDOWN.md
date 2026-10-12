# Phase 4.5: device shakedown (2026-10-09)

Emulator: Pixel 8 AVD, API 34, arm64, 1080×2400 (already installed; nothing over 5 GB downloaded, Gradle fetched NDK 27 and platform 36, about 1.5 GB). Local Postgres (docker-compose) and `backend` with `SGT_MOCK=true`. Dev build via `npx expo run:android`.

## How to repeat it
```
pnpm --filter @kept/mobile shoot            # 116 app screens → artifacts/screens (+ report.json with logcat errors)
pnpm --filter @kept/mobile shoot:reference  # 116 prototype screens → artifacts/reference (Chrome via playwright-core)
pnpm --filter @kept/mobile compare          # artifacts/compare/index.html, side by side
node frontend/scripts/drive.mts          # flows.md happy paths with adb taps (set animator/transition scales to 0 first)
```
`kept://dev/open/<screen>?scenario=&demo=1&hold=1&quiet=1&still=1` (development builds only) resets the mock to a scenario and opens any design id. `hold` keeps signing/checking screens pending, `quiet` hides LogBox toasts, `still` stops per-second countdowns so uiautomator can read the screen.

## Result
- **116 / 116 screens** render with **no logcat errors, no red boxes, no crashes** (`artifacts/screens/report.json`).
- **14 / 14 happy paths** from flows.md pass with adb taps: first launch, create group, create solo, join by code, bad code, daily proof (both photos), photo 1 → photo 2, review someone, Oath ends → claim, Oath breaks → Rematch, Bounty join, create a Bounty, money in (swap, receive), tabs and global chrome (+, bell, balance chip, settings).
- Camera: the emulator's virtual scene works for capture on F1/F4, and F1·perm shows when permission is revoked.

## Found and fixed, by severity
### Crashes and broken screens
1. **Every money amount crashed on device.** Hermes' `Intl.NumberFormat` throws on BigInt; Jest (Node) didn't. Digits are grouped by hand now, with a test that simulates Hermes.
2. **App went black after the first screen** ("Should not already be working"): React 19.2's dev-only performance tracks `JSON.stringify` bigint props. Dev-only, caller-scoped fallback in `polyfills.ts`.
3. **Dev menu render loop** (`useSyncExternalStore` snapshot changed every call).
4. **Option tiles collapsed** (C2, C4, C5, K-steps): `PressScale` put `flex: 1` on an inner view. Style moved to the pressable.
5. **Bounty hero cards blank** (H1 "Closing soon", "Biggest pools"): `Surface`'s clip wrapper collapsed `flex: 1` children.
6. **Camera opened straight into "challenge expired" (F2c)** when the stored challenge from earlier in the day had expired. Now a fresh challenge is fetched. Regression test added.
7. **Keyboard hid the pinned buttons** (E1 "Find Oath", create steps). Pinned actions ride above the keyboard; code fields have no autocorrect.
8. **Solo Oath stopped at D1 "Start"**; flows.md goes C7·ok → D2. Solo now starts on create (D-66, BACKEND_GAPS P1-18).
9. **Content showed between pinned buttons** when scrolled. The scroll column ends above them, like the prototype.

### Wrong numbers or copy
10. R4 / R4·lost showed the **design's sample numbers** (no templates); now real values, colours and banners.
11. Double signs: R1 "−−1,433", L6 "++716".
12. Rematch window: R1 counted from the wrong day (8 days), R3 had its own clock. One window, shown as "6d 23h".
13. H3 for a Bounty that opens in days said "Starts tonight at midnight" (D-67).
14. G1 "41h 0m left" → "41h left"; H3 "recently out" as "2h ago" / "yesterday" in red; H6 bars D1–D7; L5 / F5 day labels.

### Visual fidelity (design vs app)
15. **Atmosphere was missing everywhere**: tone washes, drifting orbs, beam, decor icons (DESIGN.md §2.8–2.9). Generated per screen from screens.md + the prototype; also fixed react-native-svg dropping rgba alpha in gradients (Keeper glow, coins).
16. Hero offsets on the 36 status / signing screens, centred titles, title sizes (17 screens), Keeper size/side/pose per screen.
17. Pinned buttons: secondary actions are text buttons, correct kinds and icons (40 buttons, checked against the prototype).
18. Chips: icon / tone / tilt per the prototype (40 chips); card tags (B1, B4, H3).
19. Rows: D0 finished icons, D5 history icons, C6 rules, I3 links and cover, I4 notification icons, K4 icons, + sheet tiles, L3 avatars, my avatar on my seats.
20. H5 survivors (no blank tiles), lime totals (J1, K5, I3, C6 stake), C3 / C4 banners.

## Remaining differences (not fixed, lower severity)
- ~~**Keeper:** PNG fallback (D-33)…~~ Done in the fidelity pass: the parametric Keeper and the per-screen KeeperMark / KeeperNote (docs/notes/FIDELITY_AUDIT.md).
- **Sample data differs from the design** where the engine is the source of truth: claim amounts (1,054 vs 1,186), Rematch recovery (716 vs 500), W1 "Locked in Oaths", solo examples (D-65). Status-bar clock and real Android status bar vs the mock "9:41".
- N1 leading tiles are icons, the design uses avatars / Keeper faces; I5 activity icons; I7 row icons; W1 claim card and recent-row icons.
- C8 / D1 show `kept://join/…` instead of `kept.app/o/…` (D-68).
- Social icon: MaterialCommunityIcons has the old Twitter bird, the design shows an "X" glyph.
- K5 cover colour for a new Bounty (the design's sample is violet).

## Not done on the emulator (needs your phone or credentials)
- **Back button, `kept://join/<code>`, offline → M2, toasts:** covered by unit tests and partly by the flows, but not checked one by one on the emulator in this pass.
- **Real wallet (MWA fakewallet), real sign-in and the hybrid chain flow:** not run. That needs the Seeker wallet on a phone, or building Solana Mobile's fakewallet, plus the configured verifier/faucet key for the local API (BACKEND_GAPS › Local setup note).
- **Avatar colours into theme tokens** (step 6 cleanup): not done.

## Fidelity pass re-check (2026-10-10, session 2)
- `pnpm --filter @kept/mobile shoot`: **116 / 116** screens, no logcat errors; `compare` regenerated (app · prototype · Design.pdf).
- Found on the emulator during the perf run and fixed: the FX layer was global and never cleared, so a moment's falling coins (C7·ok, F5, J1·ok, …) kept looping on every later screen. FX now clear when the screen that played them stops being current (test in navigation.test).
- Found by the new KeeperNote test and fixed: after the enter choreography landed, note-only Keepers weren't mounted, so marks had no dot and notes no line.
- Release perf (mock APK, Pixel 8 AVD): see FIDELITY_AUDIT.md §7.

## Fidelity pass, session 3 (2026-10-10)
- `pnpm --filter @kept/mobile shoot`: **116 / 116** screens, 0 with logcat errors or crashes; `compare` regenerated.
- Release perf (emulator): the Reanimated failure flood behind the ANR is gone (56k lines per run → 0 in 7 runs), no ANR (FIDELITY_AUDIT.md §7, P-6).
- Found and fixed: N1 item ages all read "1m"; B2 listed a free Bounty's "+ 0"; main twice failed typecheck after backend commits to `chain/mwa.ts`.
