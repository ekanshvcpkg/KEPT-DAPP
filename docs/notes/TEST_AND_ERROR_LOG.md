# KEPT Test Execution & Error Log (2026-10-10)

Comprehensive test execution report across the monorepo packages, backend, on-chain suite, and Android emulator runtime (`app.kept.mobile`).

---

## 1. Executive Summary

| Target | Test Type | Result | Notes |
|---|---|---|---|
| `@kept/mobile` (Frontend) | Jest (250 tests across 13 suites) | **PASS** | Foundation, Oath loop, Live sign-in, Mode, API, Routes, Navigation, Components. |
| `@kept/mobile` (TypeScript) | `tsc --noEmit` | **PASS** | 0 type errors. |
| `@kept/mobile` (ESLint) | `eslint .` | **PASS** | 0 lint errors. |
| `@kept/engine` | Node Test Runner (`tsx --test`) | **PASS** | 15/15 tests passing (HP, miss cost, payout distribution, odds). |
| `@kept/chain` | Node Test Runner (`tsx --test`) | **PASS** | 4/4 tests passing (IDL decode, discriminators, error classification). |
| `@kept/shared` | Node Test Runner (`tsx --test`) | **PASS** | 3/3 tests passing (Zod schema validation). |
| `kept-backend` | Node Test Runner (`tsx --test`) | **PASS** | 71/71 tests passing (Bounty, settlement, proofs, auth nonces). |
| `@kept/program` (On-Chain) | Mocha / LiteSVM (`ts-mocha`) | **FAIL** | `SyntaxError: The requested module '@solana/kit' does not provide an export named 'Address'`. |
| Android Emulator (`app.kept.mobile`) | Runtime E2E Manual & UI Walkthrough | **PASS** | Onboarding (A0, A1, A1·m, A4), Tabs (B1, D0, H1, I1), Sheets (`+`), zero JS crashes. |

---

## 2. Identified Errors & Incidents

### Incident 1: `@solana/kit` Import Mismatch in On-Chain Mocha Test Suite
* **Component:** `onchain/tests/economics.test.ts` (`@kept/program`)
* **Severity:** Medium (Blocks `pnpm test` at workspace root)
* **Error Message:**
  ```text
  Exception during run: file:///Users/voidmain/Documents/KEPT - DAPP/Kept-main/onchain/tests/economics.test.ts:9
  import { AccountRole, Address, KeyPairSigner, address, appendTransactionMessageInstruction, createTransactionMessage, generateKeyPairSigner, lamports, pipe, setTransactionMessageFeePayerSigner, signTransactionMessageWithSigners } from "@solana/kit";
                        ^^^^^^^
  SyntaxError: The requested module '@solana/kit' does not provide an export named 'Address'
  ```
* **Root Cause:**
  `@solana/kit` (v2 web3.js umbrella package) exports `address` (as a helper) and address types differently across versions, but `Address` was imported as a value/type incompatible with the installed `@solana/kit` package.
* **Scope Notice:**
  As defined in `AGENTS.md`, `onchain` belongs to the Anchor/backend developer and is strictly read-only for frontend agents.
* **Recommended Backend Fix:**
  In `onchain/tests/economics.test.ts`, import `type { Address }` or import from `@solana/addresses`.

---

### Incident 2: Stale Metro Bundler on Default Port 8081
* **Component:** Local dev environment / Metro Bundler
* **Severity:** High (Prevented development build from loading the correct workspace bundle)
* **Symptom:**
  `adb reverse tcp:8081 tcp:8081` routed Metro requests to PID `83588` (`/Users/voidmain/mainweb3/kept_backend/mainbackend/kept-example/app`), serving an incompatible legacy bundle to `app.kept.mobile`.
* **Resolution Applied:**
  1. Routed ADB traffic to dedicated port 8082: `adb reverse tcp:8082 tcp:8082`.
  2. Started Metro with clear cache on port 8082:
     `pnpm --filter @kept/mobile start -- --clear --port 8082`
  3. Launched development build on Android emulator via:
     `adb shell am start -a android.intent.action.VIEW -d "exp+kept://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082"`
  4. Bundler successfully served 2,333 modules to `app.kept.mobile`.
  5. The `@kept/mobile` `start` and `android` scripts now default to 8082, preventing the standard launch commands from selecting the mainbackend legacy renderer on 8081.

---

### Incident 3: Minor Native JNI Warning in Logcat
* **Component:** Android Runtime / React Native JNI
* **Severity:** Low (Non-fatal, no UI or app disruption)
* **Log Entry:**
  ```text
  10-10 15:03:26.091 4834 4928 E ReactNativeJNI: react_native_expect failure: value.hasType<std::vector<RawValue>>()
  ```
* **Context:**
  Occurred once during initial cold boot while mounting the vector SVG rig / linear gradients. Did not trigger an ANR or uncaught exception; layout and SVG rendering completed normally.

---

## 3. Verified Android Emulator Workflows

The following screens and interactive flows were triggered and visually validated via ADB screencaps on Android emulator (`emulator-5554`):

1. **A0 Splash & A1 Welcome:**
   * Mascot rig (The Keeper) rendered with waving gesture, speech bubble, and floating chips.
   * DEVNET environment badge active.
2. **A1·m Mode Selection Sheet:**
   * Tapped "Get started", successfully opening the mode picker bottom sheet.
   * "Try the demo" and "Use my wallet" options present.
3. **A4 Profile Creation / Avatar Picker:**
   * Selected "Try the demo".
   * Algorithmic AvatarBuilder initialized with accessory layers (crown, bandage, suit).
   * Confirmed avatar via "Looks like me".
4. **B1 Today Tab:**
   * Loaded active oaths ("Iron Week", "Hydrate Week", "Read 20 pages").
   * Countdown timers, HP bar segmenting (90/100 and 100/100), and payout claims verified.
5. **D0 Oaths Tab:**
   * Filtered list of Active, Waiting to Start, and Recently Finished oaths rendered cleanly.
6. **H1 Bounties Tab:**
   * Segmented tabs (Discover / Joined / Created) and categorized public challenge cards displayed.
7. **I1 Profile Tab:**
   * Profile card (`sam.skr`), 91% Kept Rate Ring, streak count (12 days), and stats displayed.
8. **Plus Action Sheet (`+`):**
   * Floating action button opened bottom sheet for "Start an Oath", "Join with code", and "Create a Bounty".
