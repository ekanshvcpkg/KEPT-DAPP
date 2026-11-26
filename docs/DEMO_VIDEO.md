# KEPT demo video plan

Plan for the hackathon demo video (hard limit: **under 3:00**, or the entry is disqualified) and an optional 3-5 minute technical walkthrough. Written 2026-11-26, the first day of the hackathon.

Sources: [`README.md`](../README.md) (Hackathon before/during, Tracks, The Keeper keeps receipts, Devnet addresses and evidence), [`docs/notes/HACKATHON_PLAN.md`](notes/HACKATHON_PLAN.md), [`docs/notes/app-devnet-run-2026-11-26.md`](notes/app-devnet-run-2026-11-26.md).

## Ground rules for this video

**Film only what is proven.** As of 2026-11-26 these have run on a real phone (Samsung SM-A528B, Phantom, Devnet program `7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj`, debug build):

- Sign-in through Mobile Wallet Adapter.
- Create and stake (solo and group), invite code joined by a second wallet, start.
- The Keeper (server-side vision model `google/gemma-3-27b-it`) judges proof photos. A rejected photo's receipt hash goes into an SPL Memo. A pass is recorded by `record_checkin` with the receipt hash.
- "Audit the Keeper" re-hashes the receipts on the phone and compares them with the chain.
- Settle and claim with exact payouts (solo and group).
- Explain before sign: the signing screen shows the IDL-decoded transaction and the simulated SOL change. The wallet opens only on **Open wallet to sign**.
- The Keeper speaks through ElevenLabs text-to-speech. The voice for now is the premade voice "George". A custom designed voice needs a paid plan and is not done.

**Do not show or say:** a hosted backend, a dApp Store listing, a release APK of the hackathon build, Supabase, live two-phone HP sync, mainnet, a custom Keeper voice, Rematch or Bounties in Live, "a cheat drops HP on chain" (a failed day is just not marked kept; HP is computed from the kept-day bits), or that the Keeper is never wrong. If any of these exist by recording day, update this file first.

**Say these on screen (captions), every time:**
- "Solana Devnet. Real transactions, edited for length."
- "Debug build: a day is 2 minutes (real Oaths use 24 h)."
- If a "Seeker verified" screen is in the cut: "Seeker check mocked on Devnet (allowlist)." Simpler: leave that screen out.
- First time the Keeper speaks: "The Keeper's voice: ElevenLabs (premade voice)."

**Two voices, never mixed up.** A team member narrates (recorded on a laptop mic in a quiet room). The Keeper's lines are only the ElevenLabs audio the app actually played. Do not make extra "Keeper" lines for the video.

## 1. Beat sheet (target 2:45, hard stop 2:55)

Narration pace is about 2.6 words per second. "VO" is the narrator. "KEEPER" is in-app ElevenLabs audio. Screen sources: **PHONE** (phone screen recording), **EXPLORER** (Solana Explorer on Devnet, desktop recording), **TERMINAL** (desktop recording), **CARD** (a static title card made in the editor).

| # | Time | Screen | Voiceover and Keeper lines | Captions |
|---|---|---|---|---|
| 1 Hook | 0:00-0:09 | CARD: black, then "KEPT" fades in. Cut to PHONE: the intro screen. | **VO:** "Habit apps trust your word. Crypto habit apps trust your phone. KEPT trusts neither." (14 words, about 6 s) | "KEPT · Android · Solana Devnet" |
| 2 Shared HP | 0:09-0:25 | PHONE: a group Oath's detail screen with the HP bar and the day grid. Slow scroll. | **VO:** "Up to four friends stake SOL on a daily habit and share one HP bar. Miss a day, and ten percent of your stake goes to the friends who kept, minus KEPT's cut. One faked day robs the honest friends." (40 words, about 15 s) | "One Oath. One HP bar. Up to 4 friends." |
| 3 Swear | 0:25-0:54 | PHONE A: Start an Oath, Group, 3 days, stake, terms, **Sign & stake**. The signing screen "The Keeper read this transaction" shows the decoded instruction and "Your wallet" change. The Keeper speaks. Tap **Open wallet to sign**, approve in Phantom. Invite code on screen. Jump cut to PHONE B: enter the invite code, join (sign). Back to PHONE A: Start. | **VO:** "Before any wallet opens, KEPT decodes the transaction with our program's IDL, simulates it, and the Keeper reads it out." (20 words, about 8 s)<br>**KEEPER:** "Stake 0.0703 SOL in a new Oath (with friends). Your wallet: -0.0731 SOL. Sign only if that is what you meant." (about 9 s; the amounts are whatever the real take shows)<br>**VO:** "Only then: Open wallet to sign. My friend joins with the invite code, and we start." (16 words, about 6 s) | "Debug build: a day is 2 minutes (real Oaths use 24 h)." · "The Keeper's voice: ElevenLabs (premade voice)." |
| 4 Prove | 0:54-1:18 | PHONE A: the camera with the challenge (object + gesture), shoot, "The Keeper is checking…" (jump cut over the model wait), verdict. The Keeper speaks. Cut to EXPLORER: the `record_checkin` transaction, signer `6tcC…` (the verifier), program `7VpB…`. | **VO:** "Every day, one live photo: the habit's object plus a hand gesture drawn from a recent Solana blockhash. The Keeper, a vision model on our server, judges it. The app's verdict is ignored." (30 words, about 11.5 s)<br>**KEEPER:** "Kept. The photo shows a real scene with a water bottle and a clear thumbs up gesture." (the reason is the model's own words and changes per photo)<br>**VO:** "The pass goes on chain: record_checkin, signed by the Keeper's own key, carrying the receipt hash." (16 words, about 6 s) | "Vision model: google/gemma-3-27b-it" · "Signer: the Keeper's key 6tcC…" |
| 5 Cheat attempt | 1:18-1:40 | PHONE B, day 2: the camera pointed at a photo of the bottle on a laptop screen (or a real bottle with no gesture, see fallback). Verdict: not kept. The Keeper speaks. Cut to EXPLORER: the Memo transaction from `6tcC…` with `kept:fail:<hash>` in the Memo data. 3 s on TERMINAL: the saved log line `PASS forged verdict without a photo is refused HTTP 400`. | **VO:** "Day two. My friend tries a photo of a screen." (10 words, about 4 s)<br>**KEEPER:** "Not kept. <reason>" (for example "Not kept. The required gesture is not visible.", the real reason from the run)<br>**VO:** "Rejections go on chain too: an SPL Memo with the failed receipt's hash, from the same Keeper key." (18 words, about 7 s)<br>**VO (over terminal):** "And a made-up verdict sent without a photo is refused." (10 words, about 4 s) | "Fail receipt hash, published in an SPL Memo" · on terminal: "From our Devnet integration run" |
| 6 Audit the Keeper | 1:40-1:56 | PHONE A: the day-kept screen, tap **Audit the Keeper**, "Checking the receipts…", then "Verified on Solana · 1 receipt(s) hash to the proof recorded on chain". | **VO:** "Don't trust the Keeper either. Audit the Keeper downloads the public receipts, re-hashes them on the phone, and checks them against the hash on chain. It proves what was decided, not that the model is perfect." (36 words, about 14 s) | "Receipt: photo hash, challenge, model, verdict" |
| 7 Settle and claim | 1:56-2:24 | PHONE A: the Oath screen after day 2, HP below 100 and the friend's missed day. Jump to after day 3: "The last day is over." **Settle now**, sign. **Claim**, the signing screen shows the payout, sign. Cut to EXPLORER: the claim transaction's balance changes. Then a CARD with the exact payout numbers. | **VO:** "My friend missed day two. The shared HP took the hit, and so did their stake." (16 words, about 6 s)<br>**VO:** "When the last day ends, anyone can settle. The program replays the rules on chain." (15 words, about 6 s)<br>**KEEPER (optional, only if it reads cleanly):** "Claim your payout from Oath <id>. Your wallet: +<amount> SOL. Sign only if that is what you meant."<br>**VO:** "I get my stake plus half the penalty. My friend loses ten percent. KEPT keeps the rest, to the lamport." (20 words, about 8 s) | Payout card: the real numbers from the take (see "Exact payouts" below) |
| 8 Under the hood | 2:24-2:38 | CARD (one slide, see text below). | **VO:** "Under the hood: our own Anchor program on Devnet. The Keeper is an agent with its own wallet, the only key that can record a check-in. Mobile Wallet Adapter to sign, ElevenLabs to speak." (34 words, about 13 s) | the card itself |
| 9 Close | 2:38-2:45 | CARD: "KEPT", program id, repo URL. | **VO:** "KEPT. Swear something, prove it daily, and audit the Keeper." (10 words, about 4 s) | `7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj` · repo URL |

Total: 165 s. The 10-15 s of slack is for real waits that can't be cut (a verdict landing, a wallet opening). If the export runs past 2:55, cut in this order: the optional claim voice line in beat 7, the terminal shot in beat 5, the last sentence of beat 6.

**Under-the-hood card text (beat 8):**

```
UNDER THE HOOD
- Our own Anchor program kept_test on Solana Devnet: native SOL escrow,
  payouts replayed on chain by the rules            7VpBDwXi…
- The Keeper: an AI agent with a wallet. Its key (6tcC…) is the only one
  the program accepts for check-ins, and it cannot upgrade the program.
  Passes: record_checkin with the receipt hash. Fails: SPL Memo.
- Explain before sign: IDL-decoded, simulated, before the wallet opens
- Mobile Wallet Adapter (Phantom), native camera proof
- ElevenLabs text-to-speech, key on the server (premade voice for now)
Devnet · debug build, 2-minute days · Seeker check mocked by allowlist
```

**Exact payouts (beat 7 card).** Two members, stake `S` each, member B misses day 2, both keep days 1 and 3 (rules v3, `replay_v3` in `onchain/programs/*/src/economics.rs`):

- miss cost `p = floor(S × 10%)` in lamports
- A (kept every day) gets `S + floor(p / 2)`
- B gets `S - p`
- treasury gets `p - floor(p / 2)`
- HP: 100 after day 1, 100 - 20 + 10 = 90 after day 2, 100 after day 3

Example with today's solo stake (S = 0.070288887 SOL): p = 0.007028888, A = 0.073803331 SOL, B = 0.063259999 SOL, treasury = 0.003514444 SOL. Total 0.140577774 = 2 × S. Put the real take's numbers on the card, read from the claim transactions on Explorer, not these.

## 2. Shot list and recording checklist

### People and gear

- **Phone A:** Samsung SM-A528B (serial `RZCR905C88K`), Phantom, debug build. Main phone on camera.
- **Phone B:** a second Android phone with the debug build and its own Phantom wallet. A second Phantom account on phone A does not work for this take: switching accounts and re-signing in KEPT takes longer than a 2-minute day.
- **Laptop:** backend, Postgres, Metro, Solana Explorer, OBS (installed) for Explorer and terminal shots.
- **Props:** a water bottle (it passed on the real run), a laptop or tablet showing a photo of the same bottle for the cheat shot, good light, a plain background.
- **Three people is ideal:** one on each phone, one on the laptop (Explorer, timing log). Two can do it if phone B's person also runs the laptop.

### The day before

- [ ] Phantom on both phones is set to Solana Devnet (Settings, Developer settings, Testnet mode).
- [ ] Each phone wallet holds at least 0.3 devnet SOL (stake about 0.07 + rent + fees, plus re-takes). Faucet: faucet.solana.com.
- [ ] The verifier `6tcCGfLheQD5Fq9c7W4jtStwA7WbpszNsvwTL9zJ3xcZ` holds at least 0.1 SOL. It pays the fees for every `record_checkin` and fail Memo.
- [ ] The treasury wallet `BWsQ8zyb2RY1o1GJdGLo67EzpRYq5vUU8DiErXXJEJwP` is above the rent-exempt minimum. A settle failed once on Devnet with "insufficient funds for rent" when it was not.
- [ ] Both wallets are in `SGT_MOCK_ALLOWLIST` in `backend/.env` (the owner edits it, then restarts the backend).
- [ ] The OpenRouter key (`OPEN_API_KEY`) has credit. `ELEVENLABS_API_KEY` and `KEEPER_VOICE_ID` are set. Check the ElevenLabs character balance: a full take speaks about 10 lines, and new lines are capped at 60 per wallet per day.
- [ ] One full rehearsal of the whole take, start to claim, done that day.
- [ ] In the rehearsal, confirm two things that are not proven yet: (1) does the real model reject a photo of a screen? (2) how does the Keeper read the join, settle and claim lines, which contain a shortened Oath address? Choose the beat 5 and beat 7 lines from what you hear.
- [ ] Phantom's approval screen shows up in a screen recording (some wallet screens are blocked from recording). If it records black, cut away to the phone A face-on shot or skip it.
- [ ] The narration is recorded and timed against the beat sheet before the edit.

### Warm-up (T-20 min)

1. Postgres on 5433 (this machine): `docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml up -d postgres`
2. Backend: `pnpm api:dev`, then `curl -s http://localhost:3000/health`.
3. For each phone: `adb -s <serial> reverse tcp:8082 tcp:8082`, and `adb -s <serial> reverse tcp:3000 tcp:3000` if the app's API URL is `localhost:3000`.
4. Metro in `frontend`: `npx expo start --dev-client --port 8082 < /dev/null`. Never with `CI=1`: the phone silently keeps a stale bundle. Open the app on both phones and wait for the bundle to finish loading.
5. On both phones: unlock Phantom **before** tapping connect (a locked Phantom can drop the first connect request), sign in, Settings: **The Keeper's voice** on, media volume up, Do Not Disturb on, screen timeout 10 min, battery above 60 %.
6. Close Android Studio and spare browser tabs (the laptop has 11 GB of RAM; backend + Metro + Postgres + OBS is already a lot).
7. Open the Explorer tabs listed below.

### Screen recording

**Phone video:** `adb shell screenrecord`. It records **no audio** and stops after 180 s per file, so chain segments, one terminal per phone:

```bash
S=RZCR905C88K   # phone A; use phone B's serial in the second terminal
i=1; while adb -s $S shell screenrecord --bit-rate 12000000 /sdcard/keptA_$(printf %02d $i).mp4; do i=$((i+1)); done
# Ctrl+C stops it. Then:
adb -s $S shell ls /sdcard/keptA_*.mp4
adb -s $S pull /sdcard/keptA_01.mp4 .   # repeat per file, then delete them from the phone
```

About a second is lost between segments. If a cut lands on a key moment, use the audio recording below as the backup picture.

**Phone audio (the Keeper's voice):** pick one and test it in the rehearsal.
- Samsung's built-in Screen recorder (Quick panel, Screen recorder, Sound: Media sounds) on phone A for the whole take. It records the Keeper's audio with the picture and doubles as a backup. Test whether it runs alongside `adb screenrecord`.
- Or lay in the exact MP3 the phone played: the backend caches every line it speaks as an MP3 in the `voice` folder of its proof storage directory (newest files by time). Same bytes, synced in the edit.
- `scrcpy` 2.x records picture and audio with no 3-minute limit, but it is not installed on this laptop.

**Desktop:** OBS at 1920×1080 for Explorer and the terminal. Browser zoom 125 %, one tab per shot. The terminal shows only the saved log file (`docs/notes/keeper-e2e-devnet-2026-11-26.log`). Never open `backend/.env` or a keypair file on screen.

**Timing log:** the laptop person writes down the UTC time and the signature of every transaction as it lands. These go into the edit and into the evidence notes afterwards.

### Timing plan with 2-minute days

T0 is the moment `start_oath` lands (phone A shows the Oath as active, "Day 1 begins now"). Day 1 runs from T0 to T0+2:00, day 2 to T0+4:00, day 3 to T0+6:00. **Photos only in the first 90 s of each day**: the app stops issuing challenges in the last 30 s ("Today closes in under 30 seconds…"). After **3 failed checks a day counts as missed**, so the cheat attempt uses one of phone B's three tries.

| Clock | Phone A | Phone B | Laptop | Beat |
|---|---|---|---|---|
| T-4:00 | Start an Oath: Group, 3 days, stake, **Sign & stake**. The Keeper reads it. **Open wallet to sign**, approve. Invite code on screen. | | Open the create tx | 3 |
| T-2:00 | | Join with the invite code. The Keeper reads the join. Approve. | Open the join tx | 3 |
| T-0:30 | Tap Start, sign. | | Open the start tx | 3 |
| T0 to T0+1:30 (day 1) | Prove: bottle + the gesture asked for. The Keeper says "Kept…". Wait for the check-in to land (about 25 s on the real run), then **Audit the Keeper**. | Prove (off camera is fine). | Open A's `record_checkin` tx | 4, 6 |
| T0+2:00 to T0+3:30 (day 2) | Prove. | Cheat attempt: photo of a screen. The Keeper says "Not kept…". Then stop; no more tries. | Open the fail Memo (verifier address page, newest tx) | 5 |
| T0+4:00 to T0+5:30 (day 3) | Prove. Film the Oath screen with HP at 90 before the photo. | Prove. | | 7 |
| T0+6:00+ | "The last day is over." **Settle now**, sign. Then **Claim**, sign. | **Claim**, sign. | Open settle and both claim txs, film the balance changes | 7 |

One take is about 11 minutes from create to the last claim. Plan three takes. If the backend's own scheduler settles before anyone taps **Settle now**, skip straight to Claim; the settle transaction is still on Explorer, signed by the backend.

### Explorer tabs to open (all `?cluster=devnet`)

Addresses (README, "Devnet addresses and evidence"):
- Program `kept_test`: https://explorer.solana.com/address/7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj?cluster=devnet
- Verifier, the Keeper's key (its transaction list shows every `record_checkin` and fail Memo): https://explorer.solana.com/address/6tcCGfLheQD5Fq9c7W4jtStwA7WbpszNsvwTL9zJ3xcZ?cluster=devnet
- Treasury wallet: https://explorer.solana.com/address/BWsQ8zyb2RY1o1GJdGLo67EzpRYq5vUU8DiErXXJEJwP?cluster=devnet
- Config PDA: https://explorer.solana.com/address/BY6a5bNCuaVeSXD67GSVkjAwDKed1cthPTc2vZCtBpr6?cluster=devnet

Real phone run, solo, 2026-11-26 (`docs/notes/app-devnet-run-2026-11-26.md`, wallet `EnD2dXFruNSTBTrZsmVT2wtDuewATAvo2hfoNqwun6hg`). Fallback footage for beats 3, 4 and 7 if the group take fails:
- Wallet: https://explorer.solana.com/address/EnD2dXFruNSTBTrZsmVT2wtDuewATAvo2hfoNqwun6hg?cluster=devnet
- Sign & stake (`create_oath_sol`): https://explorer.solana.com/tx/3KVr6xkP7Ax4qJLS3fLmSfCXiioLiHpjqzTuK5zsZSzXNHx8aFW3b67swExGc5q59qWBQuJ9edm4LEgi1oSA1qet?cluster=devnet
- `record_checkin` day 2: https://explorer.solana.com/tx/56FCHqE8Pgu52QVFsikdPrYKGxmbKuyHDSsTDgaXKpvJorG5EMdQAEpPv1qpMDKfPXpPGerGufXEbxS73G4LedQe?cluster=devnet
- `record_checkin` day 3: https://explorer.solana.com/tx/5Hqv8Pf8FNAADa53RA88MNRXr5CwmreQkMPtVPL3JTyXwa7sd4Q9zyYdhyv5cpqHEXpkJALbqPtTxGYwzAQiqprc?cluster=devnet
- Settle now (`settle_oath_sol`): https://explorer.solana.com/tx/32fta5f583QKW6LZEPueMcQbuMkARui82qRy79EcXmi9JVTi3rWphzBGwxTZ7CnRi6BWcct5pau1DN1Emr1GWthN?cluster=devnet
- Claim (`claim_sol`), payout 0.063259999 SOL: https://explorer.solana.com/tx/4qbaLisirNMvTjhMEJm9nKmdNuKDwgDH8TzRC1UkvEbSMjzyfsRv7RCbzszKGj38quU9xejJe5RCkQKLscxntu8v?cluster=devnet
- Fail Memo from that run: only the prefix `3KrgEtdH…` is recorded. Find the full signature on the verifier's address page (around 04:25:43 UTC).

The Keeper integration run (`docs/notes/keeper-e2e-devnet-2026-11-26.log`; stand-in vision model, so not the phone run). Fallback for beats 4 and 5:
- `record_checkin` with the receipt hash: https://explorer.solana.com/tx/5U1f84eZrkZBwEzKbcXaY9g9GiSdsrAd8DPZY1E6HaXsqMri3cMrPx9ZvCjmmbKpHJADuyhMxtGmuN2ncNq2nKjh?cluster=devnet
- Fail Memo (photo of a screen rejected): https://explorer.solana.com/tx/22kQ2Eq7Gp7MYN3kCSGXvewJZrNo3e16ZCVPJfcfkzE6RkSGS9x3yRMWMnrGK7K2xLaa8yvmjDZkGmyDYNvvpSuv?cluster=devnet

Group escrow by script (`onchain/scripts/e2e_devnet_sol.ts`; 3 members × 0.01 SOL, C misses day 2; A and B get 0.010333333, C 0.009, treasury 0.000333334). Fallback for beat 7 only, and captioned "from our script run":
- [create](https://explorer.solana.com/tx/AqrCADh6mxktq9jzcHEYKNEyego7XYUeB2VawEMe9hJjQBYP6Gep7n8pL9vV5zJygPakuy1V36c2XuxunXCpqYt?cluster=devnet) · [join](https://explorer.solana.com/tx/YH9XDLNWex2KrCt6Q9w99yXm65nmGvf3nD9d11dkWBbciLaer9FKbZYwV4T8qrA8AyV9pwHb4v6AWDjzYKq4Sek?cluster=devnet) · [start](https://explorer.solana.com/tx/2sYisNM4ob2NSkHGSPaU4gopTb2863kuowWBsRKfPEidGgDGy9xBZMnUAEMwTQ3TfXv6kPTpnB8W36esrunEaPFr?cluster=devnet) · [check-ins day 2](https://explorer.solana.com/tx/37ePFceUDK1VutQCWWz8Ca9S56PyACLgPVRGk3XW2zZLWescU2zkB83aoxCUbwrhpb3SurHctScYhcZT4TSc1Xgn?cluster=devnet) · [settle](https://explorer.solana.com/tx/2usvhEzdt8ewESzQHYAQHsFiYBww5SCGKSmSsaSdsAaSRxV7b1LWb4D9JnfTvrJv1kUd111YNgSzkK1wUR5k8QmE?cluster=devnet) · [claim](https://explorer.solana.com/tx/2n6SvetZxqwhudxgrAK9Sx2mGXgdTBpaNS3TNXBP6raGpPfBXXg3M4rys7AKtKMs1AUg2TxEJhG7fcEnaBwdUonh?cluster=devnet)

The group app run proven today has no signatures in the repo yet. Recover them from both wallets' address pages and add them to the run notes. Fill in the new take's signatures here after recording:

| Tx | Signature |
|---|---|
| create (group) | |
| join | |
| start | |
| `record_checkin` day 1 (A) | |
| fail Memo day 2 (B) | |
| settle | |
| claim A | |
| claim B | |

**What Explorer shows well:** the signer and program on `record_checkin`, the Memo text `kept:fail:<hash>`, and the SOL balance changes on settle and claim. **What it does not show well:** the `CheckinRecorded` event's `proof_hash` appears only as a base64 "Program data" log line. Let the app's **Audit the Keeper** screen carry the hash match; don't try to read the hash off Explorer on camera.

### If a step fails live

| Problem | What to do |
|---|---|
| Phantom doesn't open, or the first connect does nothing | Unlock Phantom first, tap again. Still stuck: sign out of KEPT and sign in again. |
| The signing screen says "failed" (simulation or RPC error, Devnet 429s) | Retry once. If it keeps failing, wait a minute; nothing was signed, nothing is lost. |
| The Keeper is slow (over about 20 s) or says the check is unavailable | Retry from the app. Watch the clock: never start a photo in the last 30 s, and remember 3 failed checks end the day as missed. |
| An honest photo is rejected (model false negative) | Retry with better light and a clearer gesture. If the day is lost, keep going: the payouts will still be exact, just different. Change the beat 7 narration to say what really happened. |
| The real model accepts the photo of a screen | Don't hide it and don't claim screen detection. Re-shoot beat 5 with the proven rejection: a real bottle without the gesture. Narration: "My friend skips the gesture." |
| The Keeper's voice doesn't play (ElevenLabs quota or error) | The screen still shows the line as text. Re-take if possible. If you use the line's audio from the backend cache instead, it must be the same line for that exact screen. |
| Audit shows "Not on chain yet" | The check-in is still landing. Wait 10-20 s and tap again. |
| Settle fails with "insufficient funds for rent" | Top up the treasury wallet `BWsQ8zyb…`, then settle again. Settle is permissionless and has no deadline. |
| Backend or Metro dies (low RAM) | Restart it. State is in Postgres and on chain; the Oath carries on. |
| A recording segment is missing | Use the Samsung recorder backup or the other phone's angle. |
| Phone B or the group take is impossible today | Film the proven solo loop on phone A (solo miss: -35 HP, the missed 10 % goes to the treasury) and show the group join as a separate clip. Change the beat 2 and 7 narration to match. The solo Explorer links above are the fallback. |

### Edit and export

- [ ] 1920×1080 canvas. The phone recording sits large on the left, captions on the right. Explorer and the terminal go full frame on their cuts.
- [ ] Captions burned in (the four honesty captions above are not optional).
- [ ] Jump cuts over model waits and wallet loading are fine. Never reorder cause and effect, and never show a verdict next to a photo it didn't judge.
- [ ] Check the length before uploading: `ffprobe -v error -show_entries format=duration -of csv=p=0 kept_demo.mp4` must print less than 175. Target 165.
- [ ] Watch the final file once for anything secret: `.env` contents, keypairs, API keys, a seed phrase screen.
- [ ] Upload public or unlisted (YouTube or Loom). Put the link in the README and the submission form.

## 3. Optional technical walkthrough (3-5 min)

Screen recording of the code and a terminal, narrated by a team member. No length limit is known for this one, but stay under 5:00.

1. **0:00-0:30 What we inherited and what we built.** The README table: before (app, 116 screens, Demo mode, rules engine, program source, backend, MWA sign-in, up to `afb1f0c`) and during (from `31649d4`: our own program instance, the Keeper, Audit the Keeper, explain before sign, the Keeper's voice). Show `git log afb1f0c..hackathon --oneline`. Say plainly that the Live loop could not create an Oath and that Live proofs trusted the phone before the hackathon.
2. **0:30-1:10 The program.** `kept_test` on Devnet. Instructions used by the app: `create_oath_sol`, `join_oath_sol`, `start_oath`, `record_checkin`, `settle_oath_sol`, `claim_sol`. Show that `record_checkin` requires the signer to equal `config.verifier` and emits `proof_hash` in `CheckinRecorded`. Show `replay_v3` in `economics.rs`: -10 % per miss, the `k + 1` split, HP -20 (group) or -35 (solo), +10 heal, conservation check. Say that settle is permissionless.
3. **1:10-2:10 The Keeper pipeline** (`backend/src/v4/keeper.ts`). Challenge: gesture = `sha256(blockhash)[0] mod 3`, never the previous one, two-minute expiry. Verify: the server hashes the photo, asks the vision model, ignores any client verdict, refuses a reused photo. Receipt fields and canonical-JSON SHA-256. `proof_hash = sha256(receipt hashes in habit order)`. Fail receipts go to an SPL Memo `kept:fail:<hash>`. Run or show `keeper_e2e_devnet.ts` output: the forged verdict refused with HTTP 400.
4. **2:10-2:50 Verify one yourself.** `GET /keeper/oaths/<oath>/days/<day>?wallet=<wallet>`, then `GET /keeper/receipts/<hash>`, hash with sorted keys and no whitespace, concatenate, SHA-256, and compare with `proof_hash` in the transaction. Then the same check in the app (`frontend/src/features/keeper/audit.ts`).
5. **2:50-3:30 Explain before sign** (`packages/chain/src/explain.ts` and `frontend/src/screens/shared/Signing.tsx`). The transaction is decoded with the program IDL; compute-budget instructions are skipped; anything not from our program shows as "Not a KEPT instruction". The transaction is simulated for the wallet's SOL change. The wallet opens only on "Open wallet to sign".
6. **3:30-4:00 The voice** (`backend/src/v4/voice.ts`, `frontend/src/features/keeper/voice.ts`). ElevenLabs text-to-speech (`eleven_flash_v2_5`), key only on the server, each line cached on disk, at most 60 new lines per wallet per day. Live only, can be switched off in Settings, never blocks a screen. `scripts/keeper_voice_design.ts` designs a custom voice on a paid plan; today it is the premade voice.
7. **4:00-4:45 Limits and next steps, said out loud.** Devnet only. Debug build with 2-minute days (production uses 86,400 s). Seeker Genesis check mocked by an allowlist on Devnet. The model can be wrong and Live has no appeal yet. Three gestures are not proof of freshness on their own: next is a high-entropy challenge (a short code from the blockhash written next to the object) plus perceptual-hash deduplication. No `set_verifier` instruction yet. Not done yet: hosted backend, release APK of this build, dApp Store submission.
8. **4:45-5:00 Evidence.** The README's "Devnet addresses and evidence" section and `docs/notes/app-devnet-run-2026-11-26.md`.
