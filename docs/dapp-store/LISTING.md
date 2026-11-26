# KEPT: dApp Store listing text

Paste these into the Publisher Portal (see [`SUBMISSION.md`](SUBMISSION.md), step 14). Character limits come from the
[Listing Page Guidelines](https://docs.solanamobile.com/dapp-store/listing-page-guidelines). Counts were checked with a
script.

## Wording rules for everything in this file

The Keeper is drawn as a half-warden, half-bookie, but **the listing and reviewer notes describe KEPT as a commitment
app with an escrow, not a game of chance.** That is accurate: nobody can stake on someone else's result, and the
money moves according to verified habits, not luck.

- Don't use: bet, betting, wager, gamble, bookie, odds, fade, jackpot, casino, house, pot, "win money".
- Use instead: stake, pledge, escrow, keep your word, the members who kept, payout, claim.
- Say Devnet and test tokens every time money comes up.
- Don't claim anything that wasn't proven on a phone (see "Proven" in the reviewer notes).

## App name (max 25)

```
KEPT
```

4 characters.

## Short description (max 50)

```
Stake SOL on daily habits. Prove it with a photo.
```

49 characters. Other options: `Keep your word. Stake on habits with friends.` (45) and
`Habit pledges with friends, checked by an AI judge` (50).

## Long description

```
KEPT turns a daily habit into a promise with something on the line.

Swear an Oath: pick a habit, alone or with up to three friends, choose 3, 7 or 14 days, and lock a stake in an escrow run by a Solana program. Every day, prove the habit with one live photo of its object (a water bottle, a book, a dumbbell) while making the hand gesture KEPT asks for. Camera only, no gallery. The gesture is drawn from a recent Solana blockhash, so an old photo can't answer it.

THE KEEPER CHECKS EVERY PHOTO
The Keeper is an AI judge that runs on the KEPT server. It looks for the object and the gesture, and rejects photos of screens or printouts. Each verdict becomes a receipt. When a day is kept, the receipt's hash is recorded on Solana with the check-in. A failed check's hash is published in an on-chain memo. Tap "Audit the Keeper" to re-hash the receipts on your phone and compare them with the chain.

ONE HP BAR FOR THE WHOLE GROUP
Every Oath shares one health bar. A missed day costs HP and 10% of that member's stake, which goes to the members who kept that day, minus a small KEPT fee. Kept days heal the bar. When the Oath ends, claim your stake and your share from the chain.

EXPLAIN BEFORE YOU SIGN
Before your wallet opens, KEPT decodes the transaction, simulates it and shows exactly how much SOL leaves your wallet. The Keeper reads it out loud. Your wallet opens only when you tap "Open wallet to sign".

THE KEEPER SPEAKS
Verdicts and transaction summaries are spoken in the Keeper's voice, generated with ElevenLabs. You can turn the voice off in Settings.

TRY IT WITHOUT A WALLET
Demo mode runs the whole app on a sample account. It needs no wallet and no network.

PLEASE NOTE
- This version runs on Solana Devnet. Stakes use Devnet test SOL, which has no monetary value. Nothing here is financial advice.
- Live mode on Devnet is a closed test: your wallet must be on our tester list. Demo mode is open to everyone.
- The AI judge can be wrong. A wrongly rejected photo can cost a day, and Live has no appeal yet.
- Proof photos are sent to our server and to a vision model provider for the check. Only hashes go on chain. See the privacy policy.
- Built for the Solana Seeker. Works on Android 7.0+ phones with an arm64 processor and a Mobile Wallet Adapter wallet (tested with Phantom).
```

## Category

The [submission guide](https://docs.solanamobile.com/dapp-store/submit-new-app) says an approved app "will go live
… under an appropriate category", so Solana Mobile appears to choose it. If the form asks, pick a health and fitness or
lifestyle category, **not** games or finance.

## Keywords / tags

The docs don't mention a keywords field. If the form has one, use:

```
habits, habit tracker, accountability, commitment, friends, streak, fitness, AI, Solana, Seeker, Devnet
```

## Links and contacts (fill in after `site/` is deployed)

| Field | Value |
|---|---|
| App website | `https://<deployed site>/` |
| Terms of use | `https://<deployed site>/terms.html` |
| Privacy policy | `https://<deployed site>/privacy.html` |
| Support email | `<team email>` (the same address as the site's contact placeholder) |
| Contact email | `<team email>` |
| Package name | `app.kept.mobile` (permanent, see SUBMISSION.md step 1) |

## What's New (first store release, v1.3.0)

```
First dApp Store release, on Solana Devnet with test tokens.
- The Keeper: an AI judge checks every proof photo on the server and writes a receipt; kept days record the receipt hash on chain, failed checks are published in a memo.
- Audit the Keeper: re-hash receipts on your phone and compare them with the chain.
- Explain before sign: see what a transaction does and how much SOL leaves your wallet before the wallet opens.
- The Keeper speaks its verdicts and transaction summaries (ElevenLabs).
- Native SOL stakes, solo and group Oaths, settle and claim, invite codes.
```

Edit this list to match what is actually in the APK you upload. For example, remove "native SOL" if blocker 1 in
SUBMISSION.md isn't fixed.

## Notes for the reviewer

Paste these into a reviewer-notes field if the portal has one. If not, send them in a `#dev-answers` ticket right after
submitting (SUBMISSION.md, step 16). Fill in the `<...>` parts first.

```
Thank you for reviewing KEPT.

WHAT KEPT IS
A habit commitment app. Users lock a stake in a Solana program escrow and prove a daily habit with a live photo. An AI on our server checks each photo. Missed days move part of the missing member's stake to the members who kept. It is not a game of chance: users can only stake on their own habit, and payouts follow verified check-ins.

THIS BUILD RUNS ON SOLANA DEVNET
All stakes are Devnet test SOL with no monetary value. Program: 7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj (Devnet).
Days in this build last 2 minutes instead of 24 hours, so a full 3-day Oath takes about 6 minutes plus settling. The Devnet program is built with a debug option that allows this; production will use 24-hour days.

FASTEST PATH: DEMO MODE (no wallet, no network)
Open KEPT > Get started > Try the demo. Everything runs on a sample account and signing is simulated (the screen says "Demo: the approval is simulated"). Profile > Settings > Skip to tomorrow closes a day so you can see a miss cost HP and stake. Profile > Settings > Exit demo returns to the start.

LIVE MODE (real Devnet transactions)
Live is a closed test: the wallet must be on our tester list, or the backend answers "A Seeker Genesis Token is required" after sign-in (on Devnet, the Seeker Genesis Token check is replaced by this list).
1. Install Phantom, then turn on Settings > Developer Settings > Testnet Mode and choose Solana Devnet.
2. Get Devnet SOL from https://faucet.solana.com (0.2 SOL is plenty).
3. Send your Devnet wallet address to <team email> or in this ticket. We add it within <N> hours (time zone <TZ>). <Optional, only if the team decides to: "Or use this Devnet-only tester wallet: <how it is shared privately>.">
4. Open KEPT > Get started > Use my wallet > Phantom. Unlock Phantom first: a locked Phantom can drop the first connect request.
5. Create an Oath (solo is quickest), pick an object you have nearby (a water bottle works well), and Sign & stake. The signing screen shows the decoded transaction and the exact SOL change. The wallet opens only after "Open wallet to sign".
6. Each 2-minute day: tap Prove, take a live photo of the object while making the hand gesture shown on screen (thumbs up, V sign or open palm). The Keeper replies and speaks its verdict. On the "day kept" screen, "Audit the Keeper" compares the receipt with the chain.
7. When the Oath ends: Settle, then Claim.

PROVEN ON A REAL PHONE (Samsung + Phantom, 2026-11-26)
Sign-in with Mobile Wallet Adapter; create and stake; photo verdicts (rejections published in an SPL Memo, passes recorded on chain with the receipt hash); Audit the Keeper; settle and claim with exact payouts (solo and group); joining by invite code from a second wallet; explain before sign; the Keeper's voice.

KNOWN LIMITS
The AI judge can be wrong and Live has no appeal yet. Rematch, creating Bounties and group photo review work in Demo mode only. Proof photos are processed by our server and a vision model provider, and only hashes go on chain (privacy policy: <privacy URL>).

CONTACT
<team email> · Discord: <handle>
```

## Before you paste

- [ ] Every `<...>` placeholder is filled in, and the same email is used on the site, in the listing and in the notes.
- [ ] Every link opens over HTTPS without signing in.
- [ ] The reviewer wallet (or the process for adding one) works against the **hosted** backend, not a laptop.
- [ ] What's New matches the uploaded APK.
- [ ] No banned words (search this file and the screenshots for "bet", "odds", "bookie").
