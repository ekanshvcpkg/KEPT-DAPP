# Submitting KEPT to the Solana dApp Store

Written 2026-11-26, the day the hackathon started. Every rule below comes from the Solana Mobile docs fetched today
(sources at the bottom). Nothing here has been submitted yet. When the portal shows something different from this
file, trust the portal and fix this file.

Companion files:

- [`LISTING.md`](LISTING.md): every text field to paste into the portal, plus the notes for the reviewer.
- [`ASSETS.md`](ASSETS.md): every image, with its size and the app screen to capture.
- [`assets/`](assets/): `icon-512.png` (512×512, opaque) and `banner-1200x600.png`, both ready to upload.
- [`../../site/`](../../site/): the website, privacy policy and terms pages the listing must link to.

## What changed since older guides

Older guides (and older hackathon advice) describe a `config.yaml` and CLI commands that mint a Publisher NFT, an App
NFT and a Release NFT on your own RPC. **That method is gone.** The `dapp-store` CLI README says: "The legacy
config-driven `init`, `create`, `validate`, and direct `publish submit|update|remove|support` flows are no longer part
of the active CLI surface." The current CLI is `@solana-mobile/dapp-store-cli` 1.0.1 (published 2026-09-14). It only
uploads a new version of an app that **already exists in the portal and already has its App NFT**.

So: **the first submission is done by hand in the Publisher Portal (publish.solanamobile.com).** There is no
`config.yaml` to fill in, so this folder doesn't have one. The CLI is useful only for later updates (see "After the
first release" below).

Today, minting goes like this. Saving the dApp details mints the **App NFT** from your publisher wallet. Submitting a
version mints a **Release NFT**. The portal sends these transactions and your wallet approves each one. The docs don't
mention a separate publisher NFT step any more.

## The rules that matter for KEPT

| Rule (from the docs) | What it means for us |
|---|---|
| Release APK signed with a release key; **debug builds are rejected**; must support `arm64-v8a`; at most 2 GB | The debug build we tested today can't be submitted. We need a release build signed with a new key. `app.json` already builds `arm64-v8a` only. |
| Every app needs its own signing key, and **all future updates must use the same key**. A key used on Google Play can't be reused for the dApp Store | Make a new keystore that is only for the dApp Store, and back it up offline. Losing it means we can never update the app. |
| **Package name** must match the APK's application ID exactly. It is case-sensitive, can't be used by another app, and **can't be changed later** | Ours is `app.kept.mobile` (`frontend/app.json`). If the original author already registered it in the portal, only their publisher wallet can publish under it. We'd have to ask them or pick a new id. |
| KYC (individual) or KYB (company) must be **approved before you can add a dApp** | The docs give no time limit. Start today. |
| **Publisher wallet**: a browser-extension wallet holding a small amount of SOL, used only for this app. It is **required for every future submission** of the app | Make a new wallet and fund it with a little **mainnet** SOL. Losing it means we can't submit updates. |
| Listing: icon 512×512 with a background (no transparency); banner 1200×600; **4 to 8** screenshots or videos; app name ≤ 25 characters; short description ≤ 50 characters | See `ASSETS.md` and `LISTING.md`. The icon in the repo had transparent corners, so `assets/icon-512.png` is a flattened copy. |
| A public website about the app or developer, plus terms of service and privacy policy, **each on its own public HTTPS page**. The portal checks every link | `site/` holds these pages. Broken or unreachable links are one of the two "common rejection reasons" the docs list. |
| Publisher Policy (dated Jul 21 2026): a privacy policy that discloses data use, **a way for users to delete their account and its data**, and no data collection from minors without a parent's consent | Our privacy page covers disclosure and deletion **by email request**. The app has no in-app delete button yet (gap below). |
| Checklist: "If your app content is gated … prepare a test account with full access for App Review" | Live mode is gated by the Devnet allowlist (see below). Reviewers either use Demo mode or a wallet we add to the allowlist. |
| Review: results come by email from `publishersupport@dappstore.solanamobile.com`, typically in **3-4 business days** for a new app (1-2 for an update), in order of submission. After 5 business days with no reply, open an "App Review Inquiry" in `#dev-answers` on Discord | 2026-11-26 is US Thanksgiving. Submitting on 28 Nov means the earliest likely result is about 2-3 Dec. "In Review" is the best status we can show during the hackathon. |
| No mainnet-only rule | The docs and Publisher Policy say nothing about Devnet apps, for or against. Our listing says plainly that the app runs on Devnet with test tokens. That is our choice, so a reviewer can't call the app misleading. It is not a documented rule. |

## Blockers found while writing this (fix before submitting)

1. **The release workflow drops two settings the Live demo depends on.** `.github/workflows/release.yml` passes
   `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_STAKE_MINT`, `EXPO_PUBLIC_RPC_URL`, `EXPO_PUBLIC_PROGRAM_ID` and
   `EXPO_PUBLIC_CLUSTER` to the build. It does **not** pass `EXPO_PUBLIC_DAY_SECONDS` or
   `EXPO_PUBLIC_LIVE_NATIVE_SOL_OATHS`. A CI release APK would therefore use 86,400-second days (`frontend/src/config/env.ts` defaults to
   86400) and turn native-SOL Oaths off. Setting a repo variable is not enough: the workflow's `env:` block must
   forward them. This is a code change, so it was not made here.
2. **Live is closed to the public.** On Devnet the backend's Genesis check is replaced by `SGT_MOCK_ALLOWLIST`
   (`backend/src/genesis.ts`). Any wallet not on the list gets `403 A Seeker Genesis Token is required` after sign-in.
   A reviewer, or anyone who installs from the store, can use only Demo mode unless we add their wallet. The listing
   says this openly. Before going public, the team should decide whether to open Live on Devnet.
3. **There is no hosted backend yet.** The release APK must point `EXPO_PUBLIC_API_URL` at a public HTTPS backend
   that stays up during review (3-5 business days or more). Today the backend only runs on a laptop.
4. **The new signing key has to be added to `assetlinks.json`.** The app's MWA identity and deep links use
   `keptdapp.vercel.app`, and its `/.well-known/assetlinks.json` lists only the old fingerprints. It also lacks the
   `delegate_permission/common.get_login_creds` relation (see `docs/notes/app-devnet-run-2026-11-26.md`). This isn't a
   store rule, but without it Phantom keeps refusing silent re-authorization. We also don't know yet who controls that
   Vercel project.
5. **There is no in-app account deletion.** The Publisher Policy asks for "a means or method" to delete an account and
   its data. Email requests are offered in `site/privacy.html`. An in-app button, or a backend route that deletes a
   wallet's off-chain rows, would be safer. That is a backend task.
6. **Gambling wording in the app.** The intro screen (A1) says "Bet your friends you'll do it." and one Keeper idle
   line says "Every Oath here is a bet on someone." Don't use these screens in screenshots. Consider rewording them
   in `design/copy.json` before release, because the reviewer will see them.

## Step by step, in order

**Owner** says who has to do the step. **Human** means it needs a person, an identity document, money, a password or a
private key. **Claude** means Claude can do it in a later task that is allowed to touch those files. **Either** means
anyone on the team.

| # | Step | Owner | Notes |
|---|---|---|---|
| 1 | Ask the original author whether `app.kept.mobile` is already registered in the portal | Human | If it is, either use their publisher account or choose a new package id **before** building. The id can't change after the first save. |
| 2 | Sign up at <https://publish.solanamobile.com> with email, name and password, then enter the emailed code | Human | Use an email the team will keep reading. Review results go there. |
| 3 | Create the publisher profile: Individual (or Organization), name, website | Human | The website must be public and about the app or developer. Deploy `site/` first (step 8) or enter it later. |
| 4 | **Start KYC now** (KYB if publishing as a company) | Human | You can't add the dApp until this is approved, and the docs give no time limit. If it gets stuck: Discord → get the Developer role in `#developer` → open a "KYC / KYB Verification Issue" ticket in `#dev-answers`. |
| 5 | Create a **new** publisher wallet in a browser extension (Phantom or Solflare), write down the seed phrase offline, and send it a little **mainnet** SOL | Human | The docs only say "a small amount of SOL". About 0.1 SOL is our own guess at a safe buffer for the App NFT, the Release NFT and storage fees, not a documented number. Use this wallet for nothing else. |
| 6 | Make the dApp-Store-only release keystore | Human (Claude can type the command) | `keytool -genkey -v -keystore kept-dappstore.keystore -alias kept-dappstore -keyalg RSA -keysize 2048 -validity 10000`. Choose the passwords yourself. Keep the file **out of the repo** and back it up in two offline places. Then add the GitHub secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` that `release.yml` reads. |
| 7 | Host the backend from HEAD of `hackathon` on a public HTTPS URL. Add the reviewer wallet(s) to `SGT_MOCK_ALLOWLIST` | Human (accounts, keys); Claude can write the deploy steps | It needs the vision model key, ElevenLabs key and verifier key as host secrets. They never go in the repo or the APK. |
| 8 | Deploy `site/` (see `site/README.md`), replace the contact placeholder, and check that all three URLs return 200 over HTTPS | Human runs `vercel` or turns on Pages; Claude prepared the files | Those URLs go in the profile and listing. |
| 9 | Fix blocker 1 (forward `EXPO_PUBLIC_DAY_SECONDS=120` and `EXPO_PUBLIC_LIVE_NATIVE_SOL_OATHS=1` in `release.yml`), then set repo variables `EXPO_PUBLIC_API_URL` (hosted URL), `EXPO_PUBLIC_DAY_SECONDS=120`, `EXPO_PUBLIC_LIVE_NATIVE_SOL_OATHS=1` | Claude (code change, needs permission); Human sets the variables | 120-second days work only because the Devnet program is built with `debug-tools`. |
| 10 | Tag the release, e.g. `v1.3.0`. CI builds `KEPT.apk` with versionCode 10300 | Human pushes the tag (or runs the workflow by hand) | Each update needs a higher versionCode. The workflow derives it from the tag. |
| 11 | Check the APK: `apksigner verify --print-certs KEPT.apk` (it must show the new key, not the debug key), `aapt dump badging KEPT.apk` (package `app.kept.mobile`, `native-code: 'arm64-v8a'`), then install it on the Samsung and run the Live flow once | Claude can run the checks (they're light); Human tests on the phone | Uninstall older KEPT builds first, because they're signed with a different key. |
| 12 | Capture the screenshots and build the 1080×1920 previews (`ASSETS.md`) | Human captures on the phone; Claude frames them | Icon and banner are already in `assets/`. |
| 13 | Portal → Connect Wallet (the publisher wallet from step 5) | Human | |
| 14 | Portal → add the dApp: paste the fields from `LISTING.md`, upload icon, banner and screenshots, enter the website, support email, contact email, terms URL and privacy URL. Press **Save** and approve the transaction (this mints the App NFT) | Human | "Save and continue later" keeps a draft without minting. Uploads go to Cloudflare R2 by default (Settings → Preferences to change). |
| 15 | Portal → Releases → **New Version** → upload `KEPT.apk` (or give its GitHub release URL), paste What's New from `LISTING.md`, press **Submit**, and approve **every** wallet request | Human | The docs warn that skipping a signing request leaves the submission incomplete. When it's done, the release shows **In Review**. |
| 16 | Send the reviewer notes (`LISTING.md` → "Notes for the reviewer") | Human | The docs don't show a reviewer-notes field. If the form has one, paste them there. If not, open a ticket in `#dev-answers` right after submitting and paste them, including how to reach us for allowlisting. |
| 17 | Take a screenshot of the In Review status for the demo video and README | Either | Don't write "published" anywhere until the approval email arrives. |
| 18 | Wait for the email from `publishersupport@dappstore.solanamobile.com`. If nothing arrives within 5 business days, open an App Review Inquiry in `#dev-answers` | Human | |
| 19 | Ask the hackathon organizers whether "In Review" counts for the Solana Mobile track | Human | This question is in `docs/notes/HACKATHON_PLAN.md`. Ask early. |

## After the first release (updates)

- In the portal: Releases → New Version, upload the new APK, fill in What's New, approve the transactions. Listing-only
  changes also create a new release (same APK) and go through review again.
- The APK must use the **same package name and the same signing key**, with a higher `versionCode` and `versionName`.
- With the CLI, once the App NFT exists:

  ```bash
  npm install -g @solana-mobile/dapp-store-cli
  export DAPP_STORE_API_KEY=<from publish.solanamobile.com/dashboard/settings/api-keys>
  dapp-store --apk-file ./KEPT.apk --keypair <path to a Solana CLI keypair file> --whats-new "<text>"
  ```

  The portal finds the app by the APK's package name. Which wallet the `--keypair` must be isn't documented clearly
  (the publisher wallet, or any signer the portal accepts). Check this with the portal before relying on it. Never
  commit the keypair or the API key.

## Sources (fetched 2026-11-26)

- Submit a New App: <https://docs.solanamobile.com/dapp-store/submit-new-app>
- Publishing Journey Checklist: <https://docs.solanamobile.com/dapp-store/checklist>
- Listing Page Guidelines: <https://docs.solanamobile.com/dapp-store/listing-page-guidelines>
- Build and Sign an APK: <https://docs.solanamobile.com/dapp-store/build-and-sign-an-apk>
- Submit an Update: <https://docs.solanamobile.com/dapp-store/submit-an-update>
- dApp Publishing CLI: <https://docs.solanamobile.com/dapp-store/publishing-cli>
- CLI README (legacy flows removed): <https://github.com/solana-mobile/dapp-publishing>
- CLI versions: <https://registry.npmjs.org/@solana-mobile/dapp-store-cli> (latest 1.0.1, 2026-09-14)
- Get support (review times, KYC tickets): <https://docs.solanamobile.com/dapp-store/support>
- FAQ: <https://docs.solanamobile.com/get-started/faq>
- Publisher Policy (last updated Jul 21 2026): <https://legal.solanamobile.com/publisher-policy-web>
- Developer Agreement: <https://solanamobile.com/developer-agreement-web>
- Example app with listing assets, terms and privacy site: <https://github.com/beeman/pocket-address>
