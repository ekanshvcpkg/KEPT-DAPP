# Android emulator QA — 2026-10-11

## Device and build

- Device: `emulator-5554`, generic Android 15 arm64 emulator (not a Seeker or physical phone).
- App mode: Live, connected wallet session present (wallet address omitted from this report).
- API: `https://kepttestapp.onrender.com`; `GET /health` returned HTTP 200, API v4 (`kept-v4`).
- Rebuilt and reinstalled the current Android debug app with `pnpm --filter @kept/mobile android -- --variant debug`; Gradle `assembleDebug` succeeded and the app installed at 12:05 IST.

## Fixed during QA

- The red startup screen was `TurboModuleRegistry.getEnforcing(...): 'RNSkiaModule' could not be found`. The installed APK was older than the JS bundle and did not contain the native Skia module. Rebuilding/reinstalling the app from the current workspace fixed the mismatch. The app then launched into Today, and the fresh log showed `Running "main"` with no further React Native JS crash.

## Verified in the emulator

- Live Today and Oaths screens loaded. The current wallet showed its Oaths, including an open group Oath.
- The group Oath detail displayed 1 of 4 joined, its invite-link action, and the QR screen.
- Opening that invite URL through Android deep linking entered the app and resolved to the same Oath. Because the test wallet was already a member, the app correctly showed “You're already in.”
- The Live proof challenge request succeeded and showed a fresh `Book + open palm` challenge with an expiry countdown.
- Tapping the emulator camera shutter reached the model-unavailable/retry screen without a JS crash. No `/proof/verify` request was made because this emulator cannot run the on-device checker.
- Oath creation wizard advanced through goal, object, duration, and group/stake selection. No wallet transaction was signed or submitted.

## Needs Claude / owner follow-up

1. **Stake amount decision (money-related; blocking before creation test):** Create offers 500, 1,000, and 2,500 SKR per member; 1,000 is selected by default. It offers no 100 SKR option, although the recent money-model example used 100 SKR per member. Confirm whether 100 is the intended selectable stake before changing the client or testing a real create transaction. I stopped before signing to avoid staking a different amount.
2. **Model and real camera verification:** This generic emulator reports unsupported for Live proof. It cannot establish that model download, hash-marker validation, resume, MediaPipe/Gemma inference, or the full two-photo flow works. Run these checks on a supported physical arm64 Android phone. The emulator camera also logged `Camera3-OutputStream ... No such device (-19)` after capture; capture reached the app's unavailable screen, but real camera behavior remains unverified.
3. **Separate invitee join:** QR rendering and deep-link resolution work for the creator's already-member wallet. A second wallet has not resolved the invite, met Genesis eligibility, signed the join transaction, or appeared as a new member. Test with a separate eligible Devnet wallet to verify the full join.
4. **Unauthenticated invite preview:** A direct unauthenticated request to `GET /api/invites/:code` returned HTTP 401 `Sign-in required`; the authenticated in-app path resolved successfully. Confirm whether invite previews are intended to be available only after wallet sign-in. If they should be public, adjust the backend/auth contract and app handling.

## Not observed

- After reinstall, no further `RNSkiaModule` error or red React Native crash screen appeared in the inspected fresh logs.
- No on-chain create or join transaction was submitted during this QA session.
