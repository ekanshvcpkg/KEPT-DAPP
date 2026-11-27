<p align="center">
  <img src="docs/screenshots/banner.png" alt="KEPT: keep your word, stake on it" width="100%">
</p>

<p align="center">
  <a href="https://github.com/ekanshvcpkg/KEPT-DAPP/releases/download/v1.4.2/KEPT.apk"><img src="https://img.shields.io/badge/Download-KEPT%20v1.4.2-C5F25C?style=for-the-badge&logo=android&logoColor=C5F25C&labelColor=1C1C1C&color=C5F25C" alt="Download KEPT v1.4.2"></a>
</p>

<p align="center">
  <a href="https://github.com/ekanshvcpkg/KEPT-DAPP/releases/latest"><img src="https://img.shields.io/github/v/release/ekanshvcpkg/KEPT-DAPP?style=flat-square&label=release&color=C5F25C&labelColor=1C1C1C" alt="Latest release"></a>
  <a href="https://github.com/ekanshvcpkg/KEPT-DAPP/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/ekanshvcpkg/KEPT-DAPP/ci.yml?branch=main&style=flat-square&label=CI&labelColor=1C1C1C" alt="CI"></a>
  <img src="https://img.shields.io/badge/Solana-Devnet-9945FF?style=flat-square&logo=solana&logoColor=white&labelColor=1C1C1C" alt="Solana Devnet">
  <img src="https://img.shields.io/badge/Android-7.0%2B-3DDC84?style=flat-square&logo=android&logoColor=white&labelColor=1C1C1C" alt="Android 7.0+">
  <img src="https://img.shields.io/badge/Expo-SDK%2057-FFFFFF?style=flat-square&logo=expo&logoColor=white&labelColor=1C1C1C" alt="Expo SDK 57">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white&labelColor=1C1C1C" alt="TypeScript strict">
</p>

<p align="center">
  <a href="#-what-is-kept">What is KEPT</a> ·
  <a href="#-download-and-install">Download</a> ·
  <a href="#-what-it-does">What it does</a> ·
  <a href="#-the-keeper-keeps-receipts">Receipts</a> ·
  <a href="#-devnet-addresses-and-evidence">Devnet evidence</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-development">Development</a> ·
  <a href="#-releases">Releases</a>
</p>

---

## 🔥 What is KEPT

**KEPT** is an Android app for Solana. You swear an **Oath** to a daily habit, alone or with up to three friends, and stake SOL in an on-chain escrow. Every day you prove the habit in front of the camera. For a workout, the phone counts your reps live and the server counts them again. For any other habit, you take a live photo of the habit's object while making a hand gesture picked from a Solana blockhash. **The Keeper**, an AI judge with a voice, checks the proof and writes a public receipt. The receipt's hash goes on chain with the day, so anyone can audit the verdict. Keep your word and you get your stake back, plus a share of other people's misses. Miss a day and the members who kept it split your loss. KEPT runs on Solana **Devnet** with test SOL.

> **Habit apps trust your word. Crypto habit apps trust your phone. KEPT trusts neither.**

## 📲 Download and install

**[⬇️ Download KEPT v1.4.2 (`KEPT.apk`, 50 MB)](https://github.com/ekanshvcpkg/KEPT-DAPP/releases/download/v1.4.2/KEPT.apk)** · [Release page](https://github.com/ekanshvcpkg/KEPT-DAPP/releases/tag/v1.4.2) · [Release notes](docs/releases/v1.4.2.md)

| | |
|---|---|
| **Phone** | Android 7.0+ on arm64 (the Solana Seeker and any modern Android phone) |
| **Network** | Solana **Devnet**. Test SOL only, no real money |
| **Wallet** | Phantom (or another Mobile Wallet Adapter wallet) **set to Devnet**, with a little Devnet SOL from [faucet.solana.com](https://faucet.solana.com) |
| **APK SHA-256** | `7c30ee6c72f0b9d17b971fa9d65d705d6b43937bafbd75a8b7966e0623b55e71` (also in the release asset `KEPT.apk.sha256`) |
| **Signing certificate SHA-256** | `6D:E7:39:06:51:D5:33:78:44:9D:4A:C1:41:4A:83:2B:26:17:A0:BB:50:48:C3:F0:92:13:1A:97:46:C4:66:C8` |
| **Build** | Package `app.kept.mobile`, versionCode 10402, branch `hackathon` at commit `28116a7` |

> **Installed v1.3.0 or v1.1.1 from this repo? Uninstall it first.** Those builds were signed with a different key, so Android won't install v1.4.2 over them.

1. Download `KEPT.apk` on the phone, or copy it over USB with `adb install -r KEPT.apk`.
2. Optional: run `sha256sum KEPT.apk` and check that it prints the SHA-256 above.
3. Open the file and allow **Install unknown apps** if Android asks.
4. Open **KEPT** → **Get started** → **Use my wallet** → pick your wallet → approve the connection, then sign the sign-in message.
5. If Phantom says the app's identity "could not be verified", turn on Profile › Settings › **Wallet identity: KEPT's own site**. Turn it off again if your wallet won't connect.

The release APK runs Live only. Demo mode (a sample account with no wallet) exists only in development builds.

Demo video: TODO (owner): add the link once it is uploaded. The plan is in [`docs/DEMO_VIDEO.md`](docs/DEMO_VIDEO.md).

## 💪 What it does

**A live rep counter for nine activities.** The activities are push-ups, squats, jumping jacks, lunges, sit-ups, high knees, burpees and overhead presses, counted in reps, plus a timed plank, counted in seconds. Set the phone level and low. An on-device pose model (MediaPipe) counts each rep from any horizontal angle (front, side, diagonal, or turning mid-set) while the Keeper counts aloud. At a rep the server picks from the Solana blockhash, the Keeper says **"Freeze! One hand up. Hold it."** and the phone takes a live photo. The server then counts the whole pose trace again with the same deterministic engine the phone used ([`packages/engine/src/reps.ts`](packages/engine/src/reps.ts)). The AI judge checks the freeze photo for a real person in the middle of the activity with one hand raised. The server refuses half reps, knee push-ups, piked hips, waist-bend squats, one-arm jumping jacks, frozen poses and replayed sets. When a set fails, the app says which part failed (the raised hand, the pose or the recount) and gives the Keeper's reason.

**The Keeper.** KEPT's mascot and judge speaks in its own ElevenLabs voice. It:
- counts your reps aloud and adds hype lines between them (Profile › Settings › **The Keeper, no filter** switches to the swearing version);
- speaks its verdict on every proof;
- before your wallet opens, reads out what the transaction does and roughly how much SOL it moves ("about 0.07 SOL");
- goes quiet when you tap **Stop the Keeper**, a button that shows whenever it is talking.

**Ask the Keeper.** Hold the button and ask about your Oaths, for example "what do I still have to do today?" or "how are my friends doing?". The Keeper is an agent with read-only tools: Oath details, today's progress for every member, receipts, wallet balance and the rules. It answers out loud in one or two short sentences. It never reads out addresses, hashes or codes; it calls friends "friend 1" and "friend 2". It can't sign or move anything.

**Photo habits.** For any other habit, such as reading a book or drinking water, you take one live photo of the habit's object while making the hand gesture the server picks from the blockhash: a thumbs up, a victory sign or an open palm. The app uses the camera only, with no gallery. A vision model on the server judges the photo.

**Oaths and money.** An Oath has 1 to 8 habits and lasts 3, 7 or 14 days. It is solo, or a group that starts with 2, 3 or 4 members; nobody can join after the start. Each member stakes SOL, which KEPT's Anchor program holds in escrow on Devnet. The Oath has one shared HP bar. A missed day costs stake, which is split between that day's keepers and KEPT's fee. When the Oath ends, the server settles it automatically and you claim your payout.

**Receipts anyone can check.** Every verdict is a receipt. The receipt's SHA-256 goes on chain with the day's check-in, and a failed verdict is published in an SPL Memo. Receipts are public files on Supabase Storage. **Audit the Keeper** downloads them, hashes them again on the phone and compares the result with Solana. Supabase Realtime pushes a friend's proof to everyone in the Oath.

<details>
<summary><b>What is real in Live (Devnet), and what isn't yet</b></summary>

<br>

| Real on Devnet | How |
|---|---|
| Sign-in | A sign-in message with a one-time nonce, signed in your wallet and checked by the backend, plus a Seeker Genesis Token check (mocked on Devnet with an allowlist) |
| Create, join, start, settle and claim an Oath | Transactions to the Anchor program `kept_test` ([`7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj`](https://explorer.solana.com/address/7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj?cluster=devnet)). Native SOL stakes are held in escrow in the Oath account. Anyone can settle: the backend's scheduler settles each Oath after its last day, and the app has a **Settle now** button |
| Daily proof | The server judges every proof and ignores any verdict the app sends. For a rep set, it counts the pose trace again and the vision model checks the freeze photo. For a photo habit, the vision model checks the object and the gesture. The verifier key records the day's receipt hashes with `record_checkin`; that key cannot upgrade the program. Failed verdicts go into an SPL Memo |
| Voice and Ask the Keeper | ElevenLabs text-to-speech and speech-to-text, called by the backend; the API key never reaches the app |
| Live updates | Supabase Realtime Broadcast on channel `oath:<address>`; each phone then fetches the Oath again |
| Balances | Read from RPC |
| Invites, nudges, inbox, kept rate | The backend. Kept rate is kept / (kept + missed), shown as "New" under 10 days |
| Bounties | The backend's current Bounty: list and detail. Joining is hidden in Live |

**Not in Live yet** (hidden or shown as unavailable, never faked): Rematch, creating a Bounty, Bounties with several tasks, swap, creator pages, group review of habit photos, and proving a Bounty day. The app computes HP and cost per miss with [`packages/engine`](packages/engine). The program settles by the same rules, tested against the same vectors ([`packages/engine/test-vectors/oath-vectors.json`](packages/engine/test-vectors/oath-vectors.json)). Gaps: [`docs/BACKEND_GAPS.md`](docs/BACKEND_GAPS.md).

</details>

**Known limits.**
- Devnet only, test SOL.
- Keep the phone level and low: on the floor for push-ups, plank and sit-ups; upright on a chair for standing moves. A camera looking down from above weakens counting.
- Filmed from behind and to the side, with the feet hidden behind the body, the counter can't tell knees-down push-ups and planks from full ones. From the front and the sides it refuses them.
- High knees filmed exactly side-on can miss some lifts. Front and back views count fully.
- Phantom warns about the default app identity (see step 5 above).
- Not yet listed on the Solana dApp Store.

## 📸 Screenshots

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/intro.webp" width="200" alt="Intro"><br><sub><b>Bet your friends</b></sub></td>
    <td align="center"><img src="docs/screenshots/today.webp" width="200" alt="Today"><br><sub><b>Today</b>: what's due, what's won</sub></td>
    <td align="center"><img src="docs/screenshots/oath.webp" width="200" alt="Oath detail"><br><sub><b>Oath HP</b> and the day grid</sub></td>
    <td align="center"><img src="docs/screenshots/oaths.webp" width="200" alt="Oaths"><br><sub><b>Oaths</b>: active, waiting, finished</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/create-stake.webp" width="200" alt="Stake"><br><sub><b>Who's in</b> and what's on it</sub></td>
    <td align="center"><img src="docs/screenshots/create-terms.webp" width="200" alt="Terms"><br><sub><b>Read it like a contract</b></sub></td>
    <td align="center"><img src="docs/screenshots/sworn.webp" width="200" alt="Sworn"><br><sub><b>Sworn</b>: stake signed on chain</sub></td>
    <td align="center"><img src="docs/screenshots/invite.webp" width="200" alt="Invite"><br><sub><b>Invite</b> by QR or link</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/broken.webp" width="200" alt="Broken"><br><sub><b>Broken</b> at 0 HP</sub></td>
    <td align="center"><img src="docs/screenshots/rematch.webp" width="200" alt="Rematch"><br><sub><b>Rematch</b>: win back half</sub></td>
    <td align="center"><img src="docs/screenshots/claim.webp" width="200" alt="Claim"><br><sub><b>Claim</b> your payout</sub></td>
    <td align="center"><img src="docs/screenshots/wallet.webp" width="200" alt="Wallet"><br><sub><b>Wallet</b>: SKR, SOL, claims</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/bounties.webp" width="200" alt="Bounties"><br><sub><b>Bounties</b>: free public challenges</sub></td>
    <td align="center"><img src="docs/screenshots/bounty.webp" width="200" alt="Bounty tasks"><br><sub><b>Bounty</b>: a sponsor's daily tasks</sub></td>
    <td align="center"><img src="docs/screenshots/bounty-progress.webp" width="200" alt="Bounty progress"><br><sub><b>Prove every task</b>, one photo each</sub></td>
    <td align="center"><img src="docs/screenshots/profile.webp" width="200" alt="Profile"><br><sub><b>Profile</b> and kept rate</sub></td>
  </tr>
</table>

<sub>Captured in Demo mode from an earlier build, before the hackathon. They show the Oath screens, not the rep counter. Rematch and Bounty joining are Demo-only.</sub>

TODO (owner): add screenshots from v1.4.2 of the rep counter, the "Freeze!" moment, a verdict, and Ask the Keeper.

## 🎯 How it works

| | Rule |
|---|---|
| **Swear** | Name the Oath and add 1 to 8 habits. A habit is either a live activity with a target ("20 push-ups", "60-second plank") or a photo habit with its own object. Pick 3, 7 or 14 days, solo or a group of 2 to 4, and a stake per person. Sign once and the stake goes into escrow. |
| **Prove** | Each habit, each day, in front of the camera. A live activity is a rep set: the phone counts it, the server counts it again, and the AI checks the "Freeze!" photo. A photo habit is one live photo of the object with the hand gesture KEPT asks for, drawn from a recent Solana blockhash. There is no gallery. The Keeper judges the proof on the server and writes a public receipt. |
| **HP** | Every Oath starts at 100 HP. At the end of each day: −20 per member who missed (−35 solo), then +10 heal, capped at 100. At 0 the Oath breaks. |
| **Miss** | A miss costs 10% of your stake, shared between that day's keepers and KEPT. |
| **Review** | Choose *AI only* or *AI + group review*: after 3 failed checks of a photo, the group votes. Group review runs only in Demo for now; in Live, 3 failed checks end the day as missed. |
| **Get paid** | When the Oath ends, the server settles it automatically. Claim what you kept plus what you won from others' misses. |
| **Rematch** | You can run a broken Oath back: keep every day of the Rematch and win back half of what you lost. Demo only for now. On chain, the held half goes to KEPT's treasury after 7 days until Rematch recovery is built. |
| **Bounties** | A sponsor funds the pool and sets the daily tasks, each with its own proof object. Joining is free; prove every task every day to stay in, and the survivors split the pool. Joining is hidden in Live. |

The full product rules are in [`design/rules.md`](design/rules.md), with amendments in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## 🔍 The Keeper keeps receipts

Up to four friends share one HP bar, so a faked day takes money from the friends who were honest. KEPT's answer is a judge whose verdicts anyone can check:

1. **Challenge.** `POST /api/proof/challenge` derives the hand gesture from the latest Solana blockhash (`sha256(blockhash)[0]` modulo the gestures left after the previous one is excluded) and records the slot, so the server can't choose the gesture. If the RPC can't be reached, the server picks at random and the receipt's slot is empty. For a rep set, the challenge also carries `freezeAfter`, the rep after which the Keeper calls "Freeze!". The server picks it from the blockhash and time, between 30% and 70% of the set. A challenge expires after two minutes (a rep set gets up to four more minutes for the set), and the proof must answer that exact challenge.
2. **Judge.** The app uploads the proof to `POST /proof/verify`. The server hashes the photo and **ignores any verdict the app sends**. It asks the vision model whether the object and the gesture (or, for a rep set, a person mid-activity with one hand raised) are in the photo, and whether the photo shows a screen or a printout. A photo that already passed can't be reused.
3. **Receipt.** The verdict becomes a receipt (`v`, `kind`, `wallet`, `target` (the Oath), `dayIndex`, `habit`, `photoSha256`, `expected`, `challenge {gesture, slot, blockhash, issuedAt}`, `model`, `verdict`, `pass`, `checkedAt`, plus `reps` for a rep set). Its SHA-256 over canonical JSON is public at `GET /keeper/receipts/:hash`. The canonical bytes are also published to Supabase Storage at `https://bfcmapfznufzfbiyvcmx.supabase.co/storage/v1/object/public/keeper-receipts/receipts/<hash>.json`, so `curl <url> | sha256sum` prints the hash itself.
4. **On chain.** When every habit of the day has a passing receipt, the verifier key signs `record_checkin` with `proof_hash = sha256(receipt hashes in habit order)`. The same key publishes a failed check's receipt hash in an SPL Memo (`kept:fail:<hash>`).
5. **Audit.** In the app, **Audit the Keeper** (on the "day kept" screen) fetches the receipts, from Supabase Storage first and KEPT's backend as a fallback. It hashes them again on the phone and compares the result with the `CheckinRecorded` event in the check-in transaction.

**Check one yourself:** `GET https://kept-api-vxk8.onrender.com/keeper/oaths/<oath>/days/<day>?wallet=<wallet>` returns the receipt hashes, their combined hash and the transaction signature. Hash the `receipt` object from each `/keeper/receipts/<hash>` as canonical JSON (keys sorted at every level, no whitespace). Then concatenate the 32-byte hashes (decoded from hex, in habit order), hash that with SHA-256, and compare it with `proof_hash` in the transaction's `CheckinRecorded` event.

**Live rep sets in detail.** The phone counts live with the on-device pose model from any horizontal angle, with the phone level. Up to 20° of leftover tilt is corrected before counting. The whole pose trace is uploaded. A plank counts one second per full second held in a valid plank, and the clock stops when the posture breaks. The server counts the trace again with the same deterministic engine (`packages/engine/src/reps.ts`, byte-identical to `backend/src/shared/reps.ts`, pinned by golden vectors in `packages/engine/test-vectors/reps-vectors.json`). It also checks the timing, the sample rate, the frame shape against the photo, and the "Freeze!" moment: the freeze must come at the server's rep, and the vision model must see a raised hand in an exercise pose in that frame. (A finger sign can't be read in a 640×480 frame from 2 m away.) A trace can pass only once, and the server refuses a trace that doesn't move (a frozen pose repeated). The receipt carries the recount (`reps`: count, duration, trace hash, freeze). Limit: the pose trace comes from the phone, so a modified app could synthesize a moving trace for each challenge. The freeze photo is what ties the set to a real person: it must be live, show a raised hand in an exercise pose, and be taken at the server's rep. Freeze photos are deduplicated by exact bytes only.

**What this does and does not prove.** It proves which photo (by hash) was judged, against which challenge, by which model, with which verdict, and that the chain acted on that verdict. It does not make the model infallible: a false negative still costs a day (Live has no appeal yet), and the photo itself is not public. With only three gestures, a photo habit's challenge does not prove freshness on its own. An identical photo can pass only once (from any wallet), but a determined cheater with a modified client and a stored photo for each gesture could re-encode one. The next step is a high-entropy challenge (a short code from the blockhash written next to the object) plus perceptual-hash deduplication.

## ⛓ Devnet addresses and evidence

### Hosted stack (Devnet)

| What | Where |
|---|---|
| API | [`https://kept-api-vxk8.onrender.com`](https://kept-api-vxk8.onrender.com/health) (Render; Node, Express and Prisma on Supabase Postgres). `/health` reports the build commit. On 2026-11-27 it ran commit `a584ee6`, the same server code as v1.4.2 |
| Website, privacy policy, terms, invite links | [kept-keeper.vercel.app](https://kept-keeper.vercel.app) |
| Receipts | Supabase Storage, bucket `keeper-receipts` (public read). `GET https://kept-api-vxk8.onrender.com/keeper/receipts/<sha256>` returns one too |
| Live updates | Supabase Realtime Broadcast |

The old hosted backend (`kepttestapp.onrender.com`) and the earlier program instances are not used any more.

### Program and accounts

| What | Address |
|---|---|
| Program `kept_test` (our own deployment) | [`7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj`](https://explorer.solana.com/address/7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj?cluster=devnet) (upgrade authority `A7eD3kFxPTMa4SELVbYneJ7yTYPVhmH66Lb3i84wrcmA`) |
| Config PDA | [`BY6a5bNCuaVeSXD67GSVkjAwDKed1cthPTc2vZCtBpr6`](https://explorer.solana.com/address/BY6a5bNCuaVeSXD67GSVkjAwDKed1cthPTc2vZCtBpr6?cluster=devnet) |
| Verifier (the Keeper's key: it pays for `record_checkin` and fail memos, and can do nothing else) | [`6tcCGfLheQD5Fq9c7W4jtStwA7WbpszNsvwTL9zJ3xcZ`](https://explorer.solana.com/address/6tcCGfLheQD5Fq9c7W4jtStwA7WbpszNsvwTL9zJ3xcZ?cluster=devnet) |
| Treasury wallet (native SOL fees) | [`BWsQ8zyb2RY1o1GJdGLo67EzpRYq5vUU8DiErXXJEJwP`](https://explorer.solana.com/address/BWsQ8zyb2RY1o1GJdGLo67EzpRYq5vUU8DiErXXJEJwP?cluster=devnet) |
| Treasury token account / SPL stake mint (test token, Token-2022) | [`HSLLjdHi1oPpZKv99jigvSU4n7p1Jq1WJhVeoirAf6JM`](https://explorer.solana.com/address/HSLLjdHi1oPpZKv99jigvSU4n7p1Jq1WJhVeoirAf6JM?cluster=devnet) / [`CDGRQc6aj7r6Kk41gvzeH2ta7vzL5rAXeogLJm7nkSqu`](https://explorer.solana.com/address/CDGRQc6aj7r6Kk41gvzeH2ta7vzL5rAXeogLJm7nkSqu?cluster=devnet). Live Oaths in the app stake native SOL |
| Legacy program (inherited codebase, not used) | `6iXXBqsdiCnUTSVf8CW3Uuw8c7iYvZSj5haz64QMuMUh` |

### Evidence

**On a real phone (release build).** The owner tested v1.4.2 on a Samsung phone. A front-view set of push-ups was counted 10 of 10 by the phone and again by the server, the freeze photo passed the AI judge, and the day was kept. The Keeper's verdict: *"Kept. The photo shows a live scene of a person doing a push-up with one hand raised."*

TODO (owner): add the check-in transaction signatures from this run or from the demo recording. No transaction made through the Android app with a real wallet is listed as evidence yet.

**Whole workflow, every habit type** ([`backend/scripts/e2e_all_habits.ts`](backend/scripts/e2e_all_habits.ts)). This script runs the local backend with a stand-in vision judge against the **real** Devnet program, with real transactions.
- **Run 2 (2026-11-27, 04:47 UTC): 73 of 73 checks passed.** It used 2 solo Oaths, all 9 activities and 2 photo habits. For each activity, the server's recount refused the cheat set; the honest set was recounted and judged, and the habit was claimed. The day was recorded on chain, every public receipt hashed to its published hash, and the on-chain `proof_hash` equaled the combined receipt hashes. Solo Oaths: [`CvqjVtHy…`](https://explorer.solana.com/address/CvqjVtHyWKsMmPGEKzNMEZWaCe2qcUxM5qyEsaeFkG4p?cluster=devnet) and [`qcG5zEgh…`](https://explorer.solana.com/address/qcG5zEghFLRPt5hcm2mTXrsXA55XsSjxyJZPLSqvKEF?cluster=devnet). Check-ins: [tx 1](https://explorer.solana.com/tx/3pZBWaMsfSRWKXVrTxsVWYdfuUN4LsKmfXm8pNg1ayKSqXknGk8oN1zNcsd3a7huAXi9hxfwnictJouKmD7fxuqS?cluster=devnet) · [tx 2](https://explorer.solana.com/tx/RbsHUdPWyFipKjE9nPm9ViM4LLxZ8FfZJTTB4yyCj72hJL6EYQnzKd52hGvtTxKnNQjEcU4CHFAb3o1Dxu9VF9b?cluster=devnet). (Its group part stopped on a public-RPC fetch error while waiting for settlement. The script now retries.)
- **Run 1 (04:36 UTC): the full group lifecycle passed.** It filled 3 of 4 seats and started with 3; a 4th wallet was refused after the start. It ran 3 days of 2 minutes each, and member C missed day 2. The server settled the Oath on its own 45 s after the end. The payouts equaled the rules engine to the lamport: A 5,166,666, B 5,166,666 and C 4,500,000 lamports. Payouts, treasury and held funds added up to all the stakes, and all 3 members claimed. Group Oath: [`AdZwZ2fN…`](https://explorer.solana.com/address/AdZwZ2fNF16GXaiY7ck4rzQogKMyM5KfvYPuKjih74H6?cluster=devnet). (Its 5 solo failures came from the harness reusing identical synthetic traces, which the server's replay protection correctly refused. A per-run noise seed fixed that before run 2.)

**A real failed verdict on chain.** On a squat set, the AI said the person was standing; this has since been fixed. Receipt `05de54fe64e27cdc7a5ad58d5722dab53cc05459391f5ad1035445145fc7e46c`, published in a [fail memo](https://explorer.solana.com/tx/REnzza4qF9tX3aAoYjNUjUinPmmZ2sCASCaTXqimwN7bLvUnL9DRQw2EUZakFq4VFxQn6dhVUDVoQD8hY8ts8JL?cluster=devnet).

**Earlier runs (2026-11-26).**
- *Native SOL escrow, end to end* ([`onchain/scripts/e2e_devnet_sol.ts`](onchain/scripts/e2e_devnet_sol.ts), [log](docs/notes/e2e-devnet-sol-2026-11-26.log)): 3 members × 0.01 SOL over 3 two-minute days, and member C misses day 2. Every payout matches the rules replay: A and B get 0.010333333 SOL, C gets 0.009 SOL and the treasury 0.000333334 SOL, which adds up to the 0.03 SOL staked.
  [create](https://explorer.solana.com/tx/AqrCADh6mxktq9jzcHEYKNEyego7XYUeB2VawEMe9hJjQBYP6Gep7n8pL9vV5zJygPakuy1V36c2XuxunXCpqYt?cluster=devnet) ·
  [join](https://explorer.solana.com/tx/YH9XDLNWex2KrCt6Q9w99yXm65nmGvf3nD9d11dkWBbciLaer9FKbZYwV4T8qrA8AyV9pwHb4v6AWDjzYKq4Sek?cluster=devnet) ·
  [start](https://explorer.solana.com/tx/2sYisNM4ob2NSkHGSPaU4gopTb2863kuowWBsRKfPEidGgDGy9xBZMnUAEMwTQ3TfXv6kPTpnB8W36esrunEaPFr?cluster=devnet) ·
  [check-ins day 2](https://explorer.solana.com/tx/37ePFceUDK1VutQCWWz8Ca9S56PyACLgPVRGk3XW2zZLWescU2zkB83aoxCUbwrhpb3SurHctScYhcZT4TSc1Xgn?cluster=devnet) ·
  [settle](https://explorer.solana.com/tx/2usvhEzdt8ewESzQHYAQHsFiYBww5SCGKSmSsaSdsAaSRxV7b1LWb4D9JnfTvrJv1kUd111YNgSzkK1wUR5k8QmE?cluster=devnet) ·
  [claim](https://explorer.solana.com/tx/2n6SvetZxqwhudxgrAK9Sx2mGXgdTBpaNS3TNXBP6raGpPfBXXg3M4rys7AKtKMs1AUg2TxEJhG7fcEnaBwdUonh?cluster=devnet)
- *The Keeper pipeline* ([`backend/scripts/keeper_e2e_devnet.ts`](backend/scripts/keeper_e2e_devnet.ts), [log](docs/notes/keeper-e2e-devnet-2026-11-26.log), with a stand-in vision model): the server refuses the audit's 3-call forgery. A passing photo's receipt hash is what [`record_checkin`](https://explorer.solana.com/tx/5U1f84eZrkZBwEzKbcXaY9g9GiSdsrAd8DPZY1E6HaXsqMri3cMrPx9ZvCjmmbKpHJADuyhMxtGmuN2ncNq2nKjh?cluster=devnet) puts on chain. A photo of a screen is rejected, and its receipt hash is published in an [SPL Memo](https://explorer.solana.com/tx/22kQ2Eq7Gp7MYN3kCSGXvewJZrNo3e16ZCVPJfcfkzE6RkSGS9x3yRMWMnrGK7K2xLaa8yvmjDZkGmyDYNvvpSuv?cluster=devnet).

**Tests at the release:** engine 111, backend 141, app 552 (Jest). All pass.

**Known limits (Devnet build).** The program is built with `debug-tools`, which allows 2-minute days for tests; the app creates 86,400 s days by default. Seeker Genesis verification is mocked on Devnet with an allowlist (Genesis Tokens live on mainnet); the hosted API's allowlist lets any wallet in, so a judge can use any Devnet wallet (checked 2026-11-27 with a freshly generated wallet). Rematch recovery and on-chain Bounties are Demo-only. There is no `set_verifier` instruction yet. The full audit that led to these fixes is in [`docs/notes/AUDIT_2026-11-26.md`](docs/notes/AUDIT_2026-11-26.md). Every address, transaction and verification status: [`docs/SUBMISSION_EVIDENCE.md`](docs/SUBMISSION_EVIDENCE.md).

## 🏁 Hackathon: what existed before, what we built during

**Before the hackathon (inherited from the original author, 2026-10-09 → 2026-11-16, up to commit `afb1f0c` "Release v1.2.0"):** the Expo app and its 116 designed screens, Demo mode, the Oath/HP/escrow rules engine, the Anchor program source, the Express backend, and Mobile Wallet Adapter sign-in. Its Live mode could not create an Oath on the deployed program, and Live proofs trusted the phone's own verdict (see [`docs/notes/AUDIT_2026-11-26.md`](docs/notes/AUDIT_2026-11-26.md)).

**During the hackathon (our team, from 2026-11-26, commit `31649d4` onward, branch `hackathon`):**

| What | Where |
|---|---|
| Our own program instance on Devnet (new program id, a separate verifier key that cannot upgrade, our own mint and treasury) and an end-to-end escrow proof | `31649d4`, `4359a65`, [`onchain/scripts/e2e_devnet_sol.ts`](onchain/scripts/e2e_devnet_sol.ts) |
| **The Keeper**: the server-side AI judge of proofs, public receipts, receipt hashes recorded on chain, failed verdicts in an SPL Memo, challenges derived from the blockhash | `8e192fe`, `d7eb915`, `68eb39d`, [`backend/src/v4/keeper.ts`](backend/src/v4/keeper.ts) |
| **Audit the Keeper** in the app: hash the receipts again on the phone and compare them with the chain | `c966cf2`, [`frontend/src/features/keeper/audit.ts`](frontend/src/features/keeper/audit.ts) |
| Live without the 2.6 GB on-device model download; honest Live (Bounty join hidden until its proof works) | `c966cf2`, `e4698bf` |
| Phantom fix (no silent re-authorization for an unverified identity) and the first full Live run on a phone | `995f76b`, [`docs/notes/app-devnet-run-2026-11-26.md`](docs/notes/app-devnet-run-2026-11-26.md) |
| **Explain before sign**: the signing screen decodes the transaction with the program IDL and simulates it. It shows what the transaction does and exactly how much SOL leaves the wallet, and flags foreign instructions. The wallet opens only on "Open wallet to sign" | `8aa94bb`, [`packages/chain/src/explain.ts`](packages/chain/src/explain.ts) |
| **The Keeper's voice** (ElevenLabs Voice Design and text-to-speech): it speaks verdicts and reads transactions aloud before you sign. A settings switch turns it off | `6c9cc5b`, [`backend/src/v4/voice.ts`](backend/src/v4/voice.ts), [`frontend/src/features/keeper/voice.ts`](frontend/src/features/keeper/voice.ts) |
| **Public receipts on Supabase**: every receipt is published to Supabase Storage as its canonical bytes, and the app's audit reads it from there. The backend database moved to Supabase Postgres | [`backend/src/v4/receiptStore.ts`](backend/src/v4/receiptStore.ts), [`backend/scripts/publish_receipts.ts`](backend/scripts/publish_receipts.ts) |
| **Live rep counter, nine activities**: the on-device pose model counts while the Keeper counts aloud. "Freeze! One hand up. Hold it." comes at a rep the server picks, and the AI judges the freeze photo. The server recounts the pose trace with the same engine before anything goes on chain, and refuses cheats | [`packages/engine/src/reps.ts`](packages/engine/src/reps.ts), [`backend/src/v4/repProof.ts`](backend/src/v4/repProof.ts), [`frontend/src/screens/proof/RepSet.tsx`](frontend/src/screens/proof/RepSet.tsx), [`frontend/modules/kept-gesture`](frontend/modules/kept-gesture) |
| **Hype lines and Stop the Keeper**: counting aloud, lines between reps (with a no-filter switch), and a button that silences the Keeper at any time | [`frontend/src/features/keeper/hypeLines.ts`](frontend/src/features/keeper/hypeLines.ts), [`frontend/src/features/keeper/countVoice.ts`](frontend/src/features/keeper/countVoice.ts), [`frontend/src/components/keeper/KeeperStop.tsx`](frontend/src/components/keeper/KeeperStop.tsx) |
| **Ask the Keeper**: a hold-to-talk agent with read-only tools over your own Oaths (ElevenLabs speech-to-text, a chat model, and the Keeper's voice) | [`backend/src/v4/ask.ts`](backend/src/v4/ask.ts), [`backend/src/v4/keeperAgent.ts`](backend/src/v4/keeperAgent.ts), [`frontend/src/features/keeper/ask.ts`](frontend/src/features/keeper/ask.ts) |
| **Hosted stack and live updates**: the API on Render, Supabase Postgres, and Supabase Realtime pushing a friend's proof to every phone in the Oath | [`backend/src/v4/realtime.ts`](backend/src/v4/realtime.ts), [`frontend/src/features/oaths/realtime.ts`](frontend/src/features/oaths/realtime.ts) |
| **Whole-workflow Devnet test** of every habit type and the group lifecycle | [`backend/scripts/e2e_all_habits.ts`](backend/scripts/e2e_all_habits.ts) |
| **v1.4.2 release APK**, signed with KEPT's release key | [`docs/releases/v1.4.2.md`](docs/releases/v1.4.2.md), commit `28116a7` |

`git log afb1f0c..hackathon` lists every change made during the hackathon.

## 🏆 Tracks

| Track | How KEPT qualifies |
|---|---|
| **Solana: Best App Overall** | Our own Rust (Anchor) program `kept_test` on Devnet ([addresses](#-devnet-addresses-and-evidence)): native SOL escrow, a shared HP bar, payouts by rules replayed on chain, and automatic settlement. An Android app with Mobile Wallet Adapter, a signed v1.4.2 APK, a hosted API, a public repo and the setup below. |
| **Solana: Agentic** | The Keeper is an AI agent with a wallet: the only key the program accepts for check-ins is the verifier key the Keeper's server holds. Every verdict is verifiable: a receipt (photo hash, rep recount, challenge, model, verdict) whose hash is on chain, which anyone can check again. Ask the Keeper is a tool-calling agent over your own Oaths that can only read. Before any signature, the Keeper explains the transaction (IDL-decoded, with the simulated balance change) and flags anything that isn't KEPT. |
| **Solana Mobile** | Built for Android from the ground up: an on-device pose model for the rep counter, native camera proof, Mobile Wallet Adapter signing, a Seeker-first design and a signed release APK. Not yet listed on the Solana dApp Store. |
| **Supabase** | The Keeper's receipts are public files in **Supabase Storage** (bucket `keeper-receipts`, public read). Each file is the receipt's canonical JSON, byte for byte, so its SHA-256 *is* the hash on chain. **Audit the Keeper** downloads the receipt files straight from Supabase and checks them against Solana; KEPT's server only supplies the day's list of receipt hashes and the transaction signature, and falls back to its own copy if Supabase can't be reached. The backend database runs on **Supabase Postgres** (Prisma through the Supavisor pooler). **Supabase Realtime** (Broadcast) pushes a friend's proof to everyone in the Oath. [`backend/src/v4/receiptStore.ts`](backend/src/v4/receiptStore.ts), [`frontend/src/features/keeper/audit.ts`](frontend/src/features/keeper/audit.ts), [`backend/src/v4/realtime.ts`](backend/src/v4/realtime.ts) |
| **ElevenLabs** | The Keeper speaks through ElevenLabs text-to-speech (`eleven_flash_v2_5`): rep counts, hype lines, verdicts, and plain-words transaction explanations before signing. Ask the Keeper hears your question through ElevenLabs speech-to-text (`scribe_v3`). Rep counts, the set lines ("Freeze!") and hype lines are clips generated once by backend scripts ([`keeper_count_voice.ts`](backend/scripts/keeper_count_voice.ts), [`keeper_hype_voice.ts`](backend/scripts/keeper_hype_voice.ts)) and bundled in the app, so they play instantly and offline. Everything else goes through the backend, so the key never reaches the app; lines are cached and capped per wallet. The Keeper's voice was designed with ElevenLabs **Voice Design** from KEPT's character brief ("an old reaper who is half prison warden, half bookmaker") by [`backend/scripts/keeper_voice_design.ts`](backend/scripts/keeper_voice_design.ts). |

## 🧱 Architecture

```mermaid
flowchart LR
  subgraph Phone["📱 Android phone"]
    App["KEPT app<br/>Expo · React Native · TS"]
    Pose["Pose model<br/>MediaPipe, on device"]
    Wallet["Wallet<br/>Mobile Wallet Adapter"]
    Pose --> App
    App <--> Wallet
  end
  App -- "photo · pose trace · REST" --> API["Backend on Render<br/>Express · Prisma"]
  API --> DB[("Supabase Postgres")]
  API -- "recount the trace" --> Engine["Rep engine<br/>same code as the phone"]
  API -- "photo" --> Keeper["The Keeper<br/>vision model judge"]
  API -- "lines · questions" --> Eleven["ElevenLabs<br/>TTS · STT"]
  API -- "public receipts" --> Storage[("Supabase Storage")]
  API -- "proof landed" --> RT["Supabase Realtime"]
  RT -. "refetch" .-> App
  Wallet -- "signed transactions" --> Program["Solana Devnet<br/>kept_test program · SPL Memo"]
  API -- "record_checkin(receipt hash) · Memo(fail receipt)" --> Program
  App -. "audit: fetch receipts" .-> Storage
  App -. "RPC reads" .-> Program
```

| Layer | Stack |
|---|---|
| **App** | Expo SDK 57 (development build), React Native 0.86 (New Architecture, Hermes), TypeScript strict, React Navigation, TanStack Query, Zustand, Zod, Reanimated 4, Skia, react-native-svg, expo-camera, expo-audio |
| **Live rep counter (on device)** | A local Expo module ([`frontend/modules/kept-gesture`](frontend/modules/kept-gesture)): CameraX with MediaPipe Pose Landmarker (lite model, bundled). It feeds pose samples to the JS rep engine. The same module also holds MediaPipe gesture recognition and Gemma (LiteRT-LM), which Live proof no longer needs |
| **Rules engine** | Pure TypeScript in [`packages/engine`](packages/engine): HP, cost per miss, daily distribution, Rematch recovery, kept rate and odds, with JSON test vectors shared with the Rust tests. Also the rep counter ([`reps.ts`](packages/engine/src/reps.ts)), copied byte for byte to the backend and pinned by golden vectors |
| **Wallet and chain** | Solana Mobile Wallet Adapter, `@solana/web3.js`, and the Anchor IDL client in [`packages/chain`](packages/chain) (including transaction explanations and receipt checks) |
| **The Keeper** | A server-side judge ([`backend/src/v4/keeper.ts`](backend/src/v4/keeper.ts), [`repProof.ts`](backend/src/v4/repProof.ts)) that works with any OpenAI-compatible vision model (OpenRouter by default). It writes canonical-JSON receipts, an SPL Memo for failures, and blockhash-derived challenges. The app checks receipts against the chain with [`packages/chain/src/keeper.ts`](packages/chain/src/keeper.ts) |
| **Voice and agent** | ElevenLabs text-to-speech and speech-to-text from the backend ([`voice.ts`](backend/src/v4/voice.ts), [`ask.ts`](backend/src/v4/ask.ts), [`keeperAgent.ts`](backend/src/v4/keeperAgent.ts)) |
| **Backend** | Express + Prisma + Postgres ([`backend/`](backend)). Hosted on Render with Supabase Postgres, Storage and Realtime |
| **Program** | Anchor (Rust), [`onchain/programs/kept_test`](onchain) |
| **Design** | 116 screens, tokens, copy and motion from the design handoff in [`design/`](design). The theme and strings are generated from it, never hardcoded |

### Repository layout

| Path | Layer | What |
|---|---|---|
| [`frontend/`](frontend) | UI | The Expo app (`@kept/mobile`, Android) |
| [`backend/`](backend) | Node backend | Express + Prisma backend (`kept-backend`) |
| [`onchain/`](onchain) | On-chain (Rust) | Anchor program `kept_test` (`@kept/program`) |
| [`packages/*`](packages) | Shared TS | `@kept/config`, `@kept/engine`, `@kept/shared` (schemas), `@kept/chain` (program client) |
| [`site/`](site) | Website | Static site: about page, privacy policy, terms, invite page |
| [`infra/`](infra) | Infra | `docker-compose.yml` (local Postgres) |
| [`design/`](design) | Design | The design handoff (read-only source of truth) |
| [`docs/`](docs) | Docs | Architecture, evidence, pitch, demo plan, release notes, API, decisions; `docs/notes/` for session reports |
| [`scripts/`](scripts) | Tooling | Secret scanning (`pnpm security:scan`) and the release workflow's signing helper |
| [`legacy/`](legacy) | Reference | V3 Aura backend code, program tests and docs (not built) |
| [`patches/`](patches) | Tooling | pnpm dependency patches |

Every top-level folder except `scripts/` and `patches/` has a `README.md` describing its contents.

## 🛠 Development

**Requirements:** Node ≥ 20, pnpm and Docker (for local Postgres). For the app: Android Studio (SDK and platform tools, with `ANDROID_HOME` set) and JDK 17. For the program: Rust, the Solana CLI (Agave) and Anchor 1.2.0.

### Backend

```bash
pnpm install
pnpm db:up                             # Postgres 16 on localhost:5432 (user, password and database: kept)
cp backend/.env.example backend/.env   # then fill it in, e.g. DATABASE_URL=postgresql://kept:kept@localhost:5432/kept?schema=public
pnpm --filter kept-backend exec prisma migrate deploy
pnpm api:dev                           # http://localhost:3000
```

What the backend needs in `backend/.env` (each variable is described in [`backend/.env.example`](backend/.env.example)):
- **The Keeper's judge:** `OPEN_API_KEY` (an OpenRouter key by default; `VISION_API_URL` and `VISION_MODEL` point it at any OpenAI-compatible endpoint). Without it, proof checks answer `503 check_unavailable` and the app offers a retry.
- **Voice, spoken verdicts and Ask the Keeper:** `ELEVENLABS_API_KEY` and `KEEPER_VOICE_ID`. `ASK_MODEL` is optional and defaults to `anthropic/claude-haiku-5.5` on the judge's endpoint and key (`backend/src/config.ts`; the `.env.example` comment saying it defaults to `VISION_MODEL` is stale).
- **Public receipts and live updates:** `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `SUPABASE_RECEIPTS_BUCKET`.
- **Chain:** `KEEPER_PROGRAM_ID`, `VERIFIER_SECRET_KEY`, `STAKE_MINT` and `TREASURY_TOKEN_ACCOUNT`. `TREASURY_OWNER` is read only by the setup script (see the next paragraph).

**Your own program instance.** This is how the hosted stack was set up. Put your program id in `declare_id!` ([`onchain/programs/kept_test/src/lib.rs`](onchain/programs/kept_test/src/lib.rs)) and in `onchain/Anchor.toml`, because an Anchor program refuses to run under any other id. Build with `pnpm program:build`, copy the new IDL to the app with `pnpm idl:sync`, and deploy from `onchain/` with `solana program deploy --program-id <program keypair> target/deploy/kept_test.so`. Then initialize it:

```bash
ADMIN_KEYPAIR=<upgrade authority keypair> VERIFIER_PUBKEY=<verifier> TREASURY_OWNER=<treasury wallet> \
KEEPER_PROGRAM_ID=<your program id> pnpm --filter kept-backend v4:setup
```

The setup script creates a test mint, the treasury token account and the Config, and funds the treasury wallet to the rent-exempt minimum. Put the printed values and the verifier key in `backend/.env`. The verifier can't be changed after the Config is created.

**End-to-end checks on Devnet:**
- `cd backend && npx tsx scripts/e2e_all_habits.ts`: every habit type through the real backend code and your program (cheat sets refused, honest sets recounted, days recorded on chain, receipts audited), plus the group lifecycle. It uses a stand-in vision judge and turns Supabase and ElevenLabs off for the run.
- `cd onchain && npx tsx scripts/e2e_devnet_sol.ts`: escrow only (create → join → check-ins → settle → claim, with every payout checked).
- `cd backend && npx tsx scripts/keeper_e2e_devnet.ts`: the Keeper (forgery refused, receipt hash on chain, failed verdict in a Memo).

### App on an Android phone

The app is a **development build**; Expo Go can't run the wallet adapter, the camera or the pose module. On the phone, turn on **Developer options → USB debugging**.

```bash
pnpm install
adb devices                      # the phone must be listed as "device"
pnpm mobile:android              # prebuilds android/, builds and installs app.kept.mobile, starts Metro on 8082
```

After the first install you only need Metro: run `pnpm mobile:start`, then open **KEPT** on the phone (on the same Wi-Fi, or over USB after `adb reverse tcp:8082 tcp:8082`). Shake the phone (or run `adb shell input keyevent 82`) for the dev menu.

Without a `frontend/.env`, the app uses KEPT's hosted Devnet stack (the defaults in [`frontend/src/config/env.ts`](frontend/src/config/env.ts)).
To point the app somewhere else, copy `frontend/.env.example` to `frontend/.env` (it holds the same hosted values) and change what you need; restart Metro with `--clear` afterwards.

**Demo and Live (D-80).** In a development build, **Get started** asks how to start:
- **Try the demo:** a sample account on the built-in mock, with no wallet and no network; it works in airplane mode. Signing screens say the approval is simulated. Profile → Settings → **Restart demo** puts the account back the way it began, and **Exit demo** wipes it and goes back to the start. Release builds hide this option.
- **Use my wallet:** Live, with a real wallet (MWA), the real backend and the real program, and no mock data. Features the backend doesn't have yet are hidden; see [`docs/BACKEND_GAPS.md`](docs/BACKEND_GAPS.md). Signing out returns to the start, where you can pick the mode again.

"I have an invite" and `kept://join/<code>` links always use Live.

### Checks

```bash
pnpm typecheck
pnpm lint
pnpm --filter @kept/engine test           # engine: 111 tests at v1.4.2
pnpm api:test                             # backend: 141
pnpm --filter @kept/mobile test           # app (Jest): 552
pnpm program:build && pnpm program:test   # build the program first; its tests load target/idl
```

`pnpm test` runs every package's tests, including the program's. CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs typecheck and tests for the packages, and typecheck, lint and tests for the app, on every push and pull request. It doesn't check `backend/` or `onchain/`.

<details>
<summary><b>Live against your local API</b></summary>

<br>

1. Start the backend (above). To get **A3 Seeker verified**, put your phone wallet's address in `SGT_MOCK_ALLOWLIST` in `backend/.env`. Leave it out to see **A3·no**.
2. Create `frontend/.env` with `EXPO_PUBLIC_API_URL=http://localhost:3000`. Live reads the stake mint from the program's Config account.
3. Run `adb reverse tcp:8082 tcp:8082` for Metro and `adb reverse tcp:3000 tcp:3000` for the local API.
4. Open KEPT → **Get started** → **Use my wallet** → pick a wallet row → approve the connection, then the sign-in message in your wallet.

For fast tests against a program built with `debug-tools`, set `EXPO_PUBLIC_DAY_SECONDS=120` (2-minute days).

</details>

<details>
<summary><b>Dev menu and deep links</b></summary>

<br>

In development builds, long-press the orange **DEVNET** badge to open the dev menu. From there you can override any slice to `http` or `mock`, pick a mock scenario (`judges`, `notEligible`, `walletRejected`, `offline`, `noSkr`, …), use the mock wallet in Live, move the virtual clock, jump to any of the 116 screens, open the component **Gallery**, or sign out.

To test a deep link, run `adb shell am start -a android.intent.action.VIEW -d "kept://join/IRON-7K2Q"`.

</details>

<details>
<summary><b>Testing the core loop</b></summary>

<br>

- **In Demo (development build, fastest):** Today has Iron Week with a habit still to prove, Hydra 14 to claim, and a joined Bounty. Oaths → Guitar Days is broken, with a Rematch offer. Dev menu → **End day** / **To deadline** moves time: other members prove on their own, and Oaths settle after their last day. [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) walks through it, including **Skip to tomorrow** (Profile › Settings).
- **On Devnet (Live, with two phones or two wallets):** both wallets need Devnet SOL. On phone 1: + → Start an Oath → Group → Sign & stake → Invite (QR). On phone 2: + → Join with code → scan → Join & stake. Then start the Oath on phone 1.

</details>

<details>
<summary><b>Testing Rematch, review, Bounties, profiles, inbox and wallet</b></summary>

<br>

In Demo (or a development build with the mock scenario of your choice):
- **Rematch:** Oaths → Guitar Days → **Rematch · win back …** (R1) → Join → R3 lobby. Scenario `rematchActive` shows R·act; **End day** through its last day for R4 / L6.
- **Group review:** bell → **Review photo** (G1) → Approve or Reject. To ask for one: an "AI + group review" Oath → prove a habit → scenario `proofFail` three times → **Ask your group to review** (G2).
- **Bounties:** Bounties tab → any Bounty → **Join free** → H3; `bountyOut` → H4, `bountyJoined` → H5. **Created** → **Create a Bounty** (K1–K5).
- **Profiles, inbox, wallet:** Profile tab (I1, I4, I5, I7, I8, I9), the bell (N1), the balance chip (W1 → W2 → W3 swap / faucet, W4 receive).

</details>

## 🚀 Releases

v1.4.2 was built on the maintainer's machine from branch `hackathon` (commit `28116a7`) and signed with KEPT's release key. Future updates and the Solana dApp Store build will use the same key. It is published as a [GitHub Release](https://github.com/ekanshvcpkg/KEPT-DAPP/releases/tag/v1.4.2) with `KEPT.apk` and `KEPT.apk.sha256`. The asset is always named `KEPT.apk`, so [`releases/latest/download/KEPT.apk`](https://github.com/ekanshvcpkg/KEPT-DAPP/releases/latest/download/KEPT.apk) serves the newest build. Release notes for each version live in [`docs/releases/`](docs/releases).

The version name and code come from `frontend/app.json` (`1.4.2` → versionCode `10402`), so each release installs over the last one signed with the same key.

<details>
<summary><b>Release signing and build settings</b></summary>

<br>

- **Local release build (how v1.4.2 was made).** Create `frontend/keystore.properties` (git-ignored) with `storeFile`, `storePassword`, `keyAlias` and `keyPassword`; [`frontend/plugins/withReleaseSigning.js`](frontend/plugins/withReleaseSigning.js) reads it. Without that file, debug builds still work but release packaging fails instead of falling back to the debug key.
  ```bash
  cd frontend
  pnpm exec expo prebuild --platform android --no-install   # generates android/
  cd android && ./gradlew assembleRelease                   # → app/build/outputs/apk/release/app-release.apk
  ```
  Expo bakes any `EXPO_PUBLIC_*` values from `frontend/.env` into the APK. Check that file before a release build. Without it, the build uses the hosted stack: the API at `https://kept-api-vxk8.onrender.com`, program `7VpBDwXi…`, Supabase, and live native-SOL Oaths (set `EXPO_PUBLIC_LIVE_NATIVE_SOL_OATHS=0` to turn them off). A release build pointing at `localhost` refuses Live with a message.
- **GitHub Actions.** [`.github/workflows/release.yml`](.github/workflows/release.yml) runs by hand only (**Actions › Release APK › Run workflow**, enter a tag). Pushing a tag no longer starts it, so a CI build signed with another key can't publish over a release. It takes the version from the tag (`v1.2.3` → 10203) and needs all four repository secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. Repository variables `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_STAKE_MINT`, `EXPO_PUBLIC_RPC_URL` and `EXPO_PUBLIC_PROGRAM_ID` override the defaults in [`frontend/src/config/env.ts`](frontend/src/config/env.ts).
- **Keep the same signing key.** Android won't update an app signed with a different key. That is why v1.3.0 and v1.1.1 have to be uninstalled before v1.4.2 can be installed.

</details>

## 📚 Docs

See [SECURITY.md](SECURITY.md) for secret scanning, the local commit hook and credential storage.

| Doc | What |
|---|---|
| [`docs/SUBMISSION_EVIDENCE.md`](docs/SUBMISSION_EVIDENCE.md) | For reviewers: build and test commands, Devnet addresses and transactions, and what is verified |
| [`docs/releases/v1.4.2.md`](docs/releases/v1.4.2.md) | Release notes for v1.4.2: install, what's new, the hosted stack, tests, known limits |
| [`docs/PITCH.md`](docs/PITCH.md) | The 8-slide pitch for judges, with speaker notes |
| [`docs/DEMO_VIDEO.md`](docs/DEMO_VIDEO.md) | The demo video plan: beat sheet, shot list, technical walkthrough |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the app, packages, backend and program fit together |
| [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) | The spoken live-demo script (about 2:40, the v1.4.2 release on Devnet): a live rep set with the Freeze, the receipt and its audit, Ask the Keeper, a group payout. A short Demo-mode backup for development builds |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Product and engineering decisions, rule amendments |
| [`docs/BACKEND_GAPS.md`](docs/BACKEND_GAPS.md) | What the backend and program still need to match the design |
| [`docs/API.md`](docs/API.md) | The backend API as it exists today, plus proposed routes |
| [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) | How the app was built, phase by phase |
| [`site/README.md`](site/README.md) | The static website: what it is and how to deploy it |
| [`design/`](design) | The design handoff: screens, components, tokens, copy, motion, rules |

<p align="center">
  <br>
  <img src="design/assets/brand/kept-app-icon.png" width="56" alt="KEPT"><br>
  <sub><b>KEPT</b> · keep your word · built for the Solana Seeker</sub>
</p>
