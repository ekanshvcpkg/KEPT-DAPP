# KEPT demo video plan

Plan for the hackathon demo video (the rules say **under 3:00**, or the entry is disqualified; our hard stop is 2:55) and an optional 3-5 minute technical walkthrough. First written 2026-11-26; rebuilt 2026-11-27 for **v1.4.2**, where the live rep counter is the hero.

Sources: [`README.md`](../README.md) (Hosted stack, Program and accounts, Evidence), [`docs/releases/v1.4.2.md`](releases/v1.4.2.md), [`docs/SUBMISSION_EVIDENCE.md`](SUBMISSION_EVIDENCE.md), [`docs/notes/REP_COUNTER_CONTRACT.md`](notes/REP_COUNTER_CONTRACT.md). Screen text below is the app's real copy (`frontend/src/copy/additions.json`, `frontend/src/copy/templates.json`, `design/copy.json`).

## Ground rules for this video

**Film only what is proven.** As of 2026-11-27:

- **On a real phone, release build.** The owner ran v1.4.2 on a Samsung phone against the hosted API and our own program. A front-view set of 10 push-ups was counted 10 of 10 by the phone, recounted by the server, the Freeze photo passed the AI judge, and the day was kept. The Keeper said: "Kept. The photo shows a live scene of a person doing a push-up with one hand raised."
- **By script, through the backend code, on Devnet** (`backend/scripts/e2e_all_habits.ts`: real program and transactions, a stand-in vision judge). Run 2 covered all 9 activities and 2 photo habits: 73 of 73 checks passed, including a cheat set for each activity refused by the server's recount. Run 1 covered the group lifecycle: automatic settlement, and payouts equal to the rules engine to the lamport.
- **In the release** (see the release notes): explain before sign with the Keeper's voice, public receipts and Audit the Keeper, hype lines, Ask the Keeper, the Stop the Keeper button, and Supabase Realtime updates between phones.

So the hero is **10 push-ups, filmed from the front**, the set that has worked on a phone. Film another activity only if it was kept in the rehearsal on the same phone. Rehearse anything else (Ask the Keeper, the group join on v1.4.2, the half-rep clip) before it goes in the cut.

**Release builds hide Demo mode.** The v1.4.2 APK has no Demo, no dev menu and no virtual clock. Everything in this video is Live: the hosted API, a real wallet, the real program.

**Do not show or say:** mainnet or real money; a Solana dApp Store listing (not yet); Rematch or Bounty joining in Live (Demo only); that the phone's count is trusted (the server's recount decides); that counting works from above (a camera looking down weakens it); knee push-ups being refused when filmed from behind and to the side, with the feet hidden (a known limit); "a cheat drops HP on chain" (a failed day is just not marked kept, and HP is computed from the kept-day bits); that the Keeper is never wrong (a real false fail is on chain, see the Explorer list). If any of these change by recording day, update this file first.

**Say these on screen (captions), every time:**
- "Solana Devnet, test SOL. Real transactions, edited for length."
- The first time the Keeper speaks: "The Keeper's voice: ElevenLabs, designed for KEPT."
- On anything from a script run: "From our scripted Devnet run: real program and transactions, stand-in AI judge."
- If a screen shows 2-minute days (a dev build, not v1.4.2): "Dev build: a day is 2 minutes (real Oaths use 24 h)."
- If the A3 "Seeker verified" screen is in the cut: "Seeker check mocked on Devnet (allowlist)." Simpler: leave that screen out.

**Voices, never mixed up.** A team member narrates (laptop mic, quiet room). The Keeper's lines are only the audio the app actually played: bundled clips for counts, "Freeze!" and hype lines, and server-made ElevenLabs lines for verdicts, transaction read-outs and Ask answers. The question in Ask the Keeper is the performer's own voice, recorded live. Do not make extra "Keeper" lines for the video. Subtitle every Keeper line with the exact words it said.

## 1. Beat sheet (target 2:45, hard stop 2:55)

Narration pace is about 2.6 words per second. "VO" is the narrator. "KEEPER" is in-app audio. Screen sources: **PHONE A / PHONE B** (phone screen recordings), **B-CAM** (a second camera filming the person and phone A on the floor), **EXPLORER** (Solana Explorer on Devnet, desktop recording), **CARD** (a static title card made in the editor).

| # | Time | Screen | Voiceover and Keeper lines | Captions |
|---|---|---|---|---|
| 1 Hook | 0:00-0:07 | CARD: black, then "KEPT" fades in. Cut to PHONE A: the intro screen. | **VO:** "Habit apps trust your word. Crypto habit apps trust your phone. KEPT trusts neither." (14 words, about 5.5 s) | "KEPT · Android · Solana Devnet" |
| 2 The Oath | 0:07-0:20 | PHONE A: a group Oath's detail screen with the HP bar and the day grid. Slow scroll. | **VO:** "Swear an Oath with up to three friends. Stake SOL in an on-chain escrow and share one HP bar. Miss a day, and part of your stake goes to the friends who kept." (33 words, about 12.5 s) | "One Oath. One HP bar. Solo, or 2 to 4 people." |
| 3 Swear | 0:20-0:44 | PHONE A: **Start an Oath**, group, the habit **push-ups** (10), stake, terms, **Sign & stake**. The signing screen "The Keeper read this transaction" shows the decoded instruction and the "Your wallet" change. The Keeper speaks. Tap **Open wallet to sign**, approve in Phantom. Jump cut to PHONE B: join with the invite, sign. Back to PHONE A: start, sign. | **VO:** "Before any wallet opens, KEPT decodes and simulates the transaction, and the Keeper says what it does." (17 words, about 6.5 s)<br>**KEEPER:** "Stake about 0.07 SOL in a new Oath (with friends). Your wallet: down about 0.07 SOL. Sign only if that is what you meant." (about 8 s; the amounts are whatever the take shows)<br>**VO:** "Only then does the wallet open. My friend joins with the invite, and we start." (15 words, about 6 s) | "Solana Devnet, test SOL. Real transactions, edited for length." · "The Keeper's voice: ElevenLabs, designed for KEPT." |
| 4a Hero: set up | 0:44-0:52 | PHONE A: today's push-ups habit, the **Set up** steps ("Phone on its side (landscape) on the floor, level and propped up a little, about 2 m away"), tap **Start: 10 push-ups**. B-CAM: the phone goes down on the floor, the performer gets into position. | **VO:** "Ten push-ups, one of nine live activities. A pose model on the phone counts them, from the front or the side." (21 words, about 8 s) | "On-device pose model (MediaPipe)" |
| 4b Hero: counting | 0:52-1:05 | Split screen: PHONE A (camera view and counter) beside B-CAM. "Go!" appears. | **KEEPER:** the set's opener (for example "Odds are against you. Prove me wrong."), then "One." "Two." "Three." with a hype line between counts (for example "That's one. The house is watching."). No VO: let the Keeper carry it. | "Counted on the phone. The server recounts the whole pose trace before anything goes on chain." |
| 4c Hero: Freeze | 1:05-1:11 | Same split. The screen says "Freeze! Raise one hand". The performer holds still, one hand up; the photo is taken. Counting resumes. | **KEEPER:** "Freeze! One hand up. Hold it."<br>**KEEPER:** a resume line (for example "Lovely photo. Now back to work.") | "The Freeze rep is picked by the server from a Solana blockhash." |
| 4d Hero: finish | 1:11-1:21 | Same split, to rep 10. | **KEEPER:** counts to "Ten.", then a done line (for example "Set done. I trained you well, obviously." or "Done. Now I judge your set."). No VO. | |
| 4e Hero: verdict | 1:21-1:35 | PHONE A: "Checking…" (keep about 9 s for the VO, cut the rest of the wait), then the result. | **VO:** "The server recounts the trace with the same engine, and an AI judge checks the Freeze photo: a real person, mid-set, one hand up." (24 words, about 9 s)<br>**KEEPER:** `Kept. <reason>` (the owner's test said "Kept. The photo shows a live scene of a person doing a push-up with one hand raised."; the reason is the model's own words and changes per photo) | "AI judge: " plus the model name on the Audit row |
| 4f Hero: receipt | 1:35-1:50 | PHONE A: "Day 1 kept." with the HP chip. Tap **Audit the Keeper**, "Checking the receipts…", then "Verified on Solana · 1 receipt(s) hash to the proof recorded on chain". Tap **View the check-in on Explorer**. Cut to EXPLORER: the `record_checkin` transaction, signer `6tcC…` (the verifier), program `7VpB…`. Optional 2 s cutaway: PHONE B shows `<name> just proved today` (Supabase Realtime). | **VO:** "Every verdict is a public receipt. Its hash goes on chain with the check-in, signed by the Keeper's own key. Audit the Keeper re-hashes it on the phone against Solana." (30 words, about 11.5 s) | "Receipt: trace hash, server count, Freeze photo hash, model, verdict" · "Signer: the Keeper's key 6tcC…" |
| 5 Cheat refused | 1:50-2:03 | Split: PHONE A + B-CAM. The performer does half push-ups. The counter does not move; the hint reads "Not deep enough: that one didn't count". Then **Stop the set**. | **KEEPER:** whatever half-rep line plays (for example "That's a curtsy, not a rep." or "That wasn't a rep. Go lower.")<br>**VO:** "Half reps don't count. The server also refuses knee push-ups, frozen poses and replayed sets." (15 words, about 6 s) | "In our scripted Devnet run, the server's recount refused a cheat set for each of the 9 activities." |
| 6 Ask the Keeper | 2:03-2:18 | PHONE A, Today tab: hold **Hold to ask the Keeper** ("Listening… let go to ask"), let go, "The Keeper is thinking…" (jump cut), the spoken answer and the note "You: … The Keeper: …". Then a second question; tap **Stop the Keeper** mid-answer. | **VO:** "Ask the Keeper about your Oaths. It looks up your progress, your friends and your receipts, and answers in a sentence or two." (23 words, about 9 s)<br>**KEEPER:** the real answer (about 4 s)<br>**VO (over the Stop tap):** "One tap stops it." (4 words, about 1.5 s) | "Ask the Keeper: ElevenLabs speech-to-text, a chat model with read-only tools, the Keeper's voice" |
| 7 Settlement | 2:18-2:28 | EXPLORER: the group Oath `AdZwZ2fN…` from script run 1. Then a CARD with its payouts (below). | **VO:** "After the last day, the server settles on chain. In our three-friend test run, payouts matched the rules engine to the lamport." (22 words, about 8.5 s) | "From our scripted Devnet run: real program and transactions, stand-in AI judge, 2-minute days." |
| 8 Under the hood | 2:28-2:39 | CARD (one slide, text below). | **VO:** "Under the hood: our own Anchor program on Devnet, a hosted API, and the Keeper, an agent whose key is the only one that can record a check-in." (28 words, about 11 s) | the card itself |
| 9 Close | 2:39-2:45 | CARD: "KEPT", the v1.4.2 download link, the program id. | **VO:** "KEPT. Swear it, do the reps, and audit the Keeper." (10 words, about 4 s) | `github.com/ekanshvcpkg/KEPT-DAPP/releases/tag/v1.4.2` · `7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj` |

Total: 165 s, of which the hero (4a-4f) is 66 s. The server picks the Freeze rep: for a 10-rep set it comes after rep 3 to 7. Move the 4b/4d boundary to match the take; the total stays the same. The 10 s of slack is for waits that can't be cut. If the export runs past 2:55, cut in this order: all of beat 7, the Realtime cutaway in 4f, the second question and Stop tap in beat 6 (drop "One tap stops it." with it), the last sentence of beat 2.

**Under-the-hood card text (beat 8):**

```
UNDER THE HOOD
- Our own Anchor program kept_test on Solana Devnet (7VpBDwXi…):
  native SOL escrow, payouts replayed on chain by the rules
- Live rep counter: MediaPipe pose on the phone. The server recounts
  the whole pose trace with the same deterministic engine (reps.ts)
- Freeze rep picked from a Solana blockhash; an AI judge checks the photo
- The Keeper: an AI agent with a wallet. Its key (6tcC…) is the only one
  the program accepts for check-ins; the program gives it no other power.
  Pass: record_checkin with the hash of the day's receipts. Fail: SPL Memo.
  Receipts are public; Audit the Keeper re-hashes them on the phone.
- Explain before sign: IDL-decoded, simulated, read aloud before the wallet opens
- Hosted API (Render), Supabase Postgres, Storage and Realtime
- Mobile Wallet Adapter (Phantom), ElevenLabs voice and speech-to-text
Devnet · test SOL · tests: engine 111, backend 141, app 552
```

**Settlement card (beat 7).** Script run 1 (2026-11-27, 04:36 UTC), group Oath [`AdZwZ2fN…`](https://explorer.solana.com/address/AdZwZ2fNF16GXaiY7ck4rzQogKMyM5KfvYPuKjih74H6?cluster=devnet): 3 members, 0.005 SOL (5,000,000 lamports) each, 3 days of 2 minutes, member C missed day 2. The server settled it on its own 45 s after the end. Rules (`replay_v3` in `onchain/programs/kept_test/src/economics.rs`): a miss costs 10 % of the stake, shared equally between that day's keepers and the treasury.

- A: 5,166,666 lamports
- B: 5,166,666 lamports
- C: 4,500,000 lamports
- treasury: the rest, 166,668 lamports (payouts plus treasury add up to the 15,000,000 staked)

## 2. Shot list and recording checklist

### People and gear

- **Phone A:** Samsung SM-A528B (serial `RZCR905C88K`), v1.4.2 APK, Phantom on Devnet. The hero phone: it goes on the floor for the set.
- **Phone B:** a second Android phone with the v1.4.2 APK and its own Phantom wallet, for the group join. A second Phantom account on phone A is slower and harder to follow on camera.
- **B-CAM:** a third phone or a camera on a tripod, 1080p, filming the performer and phone A side-on, from outside phone A's view. Its audio also picks up the Keeper and the Ask question: a backup track.
- **Laptop:** a browser for Explorer and `/health`, OBS (installed) for the desktop shots. No local backend, Postgres or Metro: the APK talks to the hosted API.
- **Room:** a clear floor (phone A about 2 m from the performer), a mat, even light, a plain background.
- **Three people is ideal:** the performer (phone A), one on B-CAM and phone B, one on the laptop (Explorer, timing log).

### The day before

- [ ] Install the v1.4.2 APK on both phones from the [release page](https://github.com/ekanshvcpkg/KEPT-DAPP/releases/tag/v1.4.2). `sha256sum KEPT.apk` must print `7c30ee6c72f0b9d17b971fa9d65d705d6b43937bafbd75a8b7966e0623b55e71`. Uninstall v1.3.0 or v1.1.1 first if present (they were signed with another key). Then `adb install -r KEPT.apk`.
- [ ] Phantom on both phones is set to Solana Devnet.
- [ ] Each phone wallet holds at least 0.5 devnet SOL. Each take uses a new Oath, and three takes are planned. The stake is a $5, $10 or $25 tier, quoted in SOL at that day's price ($5 was 0.070288887 SOL on 2026-11-26), plus rent and fees: use the $5 tier. Faucet: [faucet.solana.com](https://faucet.solana.com).
- [ ] In KEPT, Settings › **Wallet identity: KEPT's own site** is on, so Phantom doesn't show "identity could not be verified" on camera. Switch it off if the wallet won't connect.
- [ ] The hosted API answers: `curl -s https://kept-api-vxk8.onrender.com/health` reports the build commit (`a584ee6`, the same server code as v1.4.2, on 2026-11-27).
- [ ] The verifier `6tcCGfLheQD5Fq9c7W4jtStwA7WbpszNsvwTL9zJ3xcZ` holds at least 0.1 SOL. It pays the fee for every `record_checkin`, every fail Memo and the automatic settle.
- [ ] The treasury wallet `BWsQ8zyb2RY1o1GJdGLo67EzpRYq5vUU8DiErXXJEJwP` is above the rent-exempt minimum. A settle failed once on Devnet with "insufficient funds for rent" when it was not.
- [ ] OpenRouter has credit (`OPEN_API_KEY` on Render). The AI judge and Ask the Keeper both use it.
- [ ] ElevenLabs has credit (`ELEVENLABS_API_KEY`, `KEEPER_VOICE_ID` on Render). The server makes the verdicts, transaction read-outs and Ask answers, and Ask also uses speech-to-text. Counts, "Freeze!" and hype lines are clips inside the APK and cost nothing. Server caps, counted per UTC day: 6,000 characters of new (uncached) speech across the whole server (unless `VOICE_DAILY_CHAR_CAP` is set on Render; it is kept in memory, so a restart resets it), 120 new transaction read-outs per wallet, 40 Ask questions per wallet. A line said before comes from the cache for free. Rehearsals use the same budget.
- [ ] Each wallet gets 20 checks per UTC day from the server: every photo or set that reaches the AI judge counts (a set the recount refuses does not). When they are used up, the app shows "We can't check sets right now." and does not say why. A rehearsal on the shoot day eats into phone A's; rehearse the day before, or with another wallet.
- [ ] Both phone wallets pass the server's Seeker Genesis check. On Devnet it is mocked: `SGT_MOCK=true` and the wallet in `SGT_MOCK_ALLOWLIST` on Render (or the list is `*`). Every `/api` route checks it, so a wallet that fails can still sign and stake, but all its proofs are refused. A sign-in that lands on A3 "Seeker verified." passes; "Solo Oaths only." (A3·no) fails. Checked 2026-11-27: a freshly generated wallet signed in to the hosted API and `/api/me` returned `genesis: true, mocked: true`, so the hosted Devnet allowlist lets any wallet in. If A3 is in the cut, add the Seeker caption above. Simpler: sign in off camera and leave A3 out.
- [ ] One full rehearsal: create, join, start, the 10-push-up set kept, Audit the Keeper, two Ask questions, and the half-rep clip. Confirm:
  - the set is kept with phone A on the floor, front view. Keep the phone level and low: a camera looking down weakens counting;
  - the signing screen's terms read "· 24 h each" (the v1.4.2 default). "2 min each" means a dev build: add the 2-minute caption;
  - what the Keeper answers to "What do I still have to do today?" and "How are my friends doing?" (the release notes' examples), and that the answer is short enough for beat 6;
  - Samsung's screen recorder captures the camera view and the Keeper's audio during a set;
  - Phantom's approval screen shows in a screen recording (some wallet screens record black; if so, cut to B-CAM).
- [ ] Settings on both phones: **The Keeper's voice and sounds** on; **The Keeper, no filter** off (it swears; keep the public video clean).
- [ ] The narration is recorded and timed against the beat sheet before the edit.

### Warm-up (T-20 min)

1. `curl -s https://kept-api-vxk8.onrender.com/health` and wait until it answers.
2. On both phones: unlock Phantom **before** tapping connect (a locked Phantom can drop the first connect request), then sign in. Media volume up, Do Not Disturb on, screen timeout 10 min, battery above 60 %.
3. Place phone A for the set: on its side (landscape), on the floor, level, propped up a little, about 2 m away, facing the performer. Check the whole body fits, head to feet. If the app says "Set the phone straight: level with the floor", fix the tilt.
4. Frame B-CAM: side-on, wide enough for the performer and phone A on the floor.
5. Close spare apps and browser tabs on the laptop (11 GB of RAM).
6. Open the Explorer tabs listed below.

### Screen recording

**Phone A, the whole take:** Samsung's built-in Screen recorder (Quick panel › Screen recorder › Sound: **Media sounds**). It records the picture and the Keeper's audio, and it needs no cable while the phone is on the floor. Hide its floating controls before the set.

**Phone B, and phone A away from the floor:** `adb shell screenrecord` works on the release build with USB debugging on. It records **no audio** and stops after 180 s per file, so chain segments:

```bash
S=RZCR905C88K   # phone A; use phone B's serial in a second terminal
i=1; while adb -s $S shell screenrecord --bit-rate 12000000 /sdcard/keptA_$(printf %02d $i).mp4; do i=$((i+1)); done
# Ctrl+C stops it. Then:
adb -s $S shell ls /sdcard/keptA_*.mp4
adb -s $S pull /sdcard/keptA_01.mp4 .   # repeat per file, then delete them from the phone
```

About a second is lost between segments. `scrcpy` 2.x records picture and audio with no 3-minute limit, but it is not installed on this laptop.

**Audio repair:** the counts, "Freeze!" and hype lines the phone plays are the same files as `frontend/assets/voice/` (`count-<n>.mp3`, `freeze.mp3`, `hype/<id>.mp3`). If a clip is clipped in the recording, lay in the same file at the same moment. Never swap in a different line.

**Desktop:** OBS at 1920×1080 for Explorer. Browser zoom 125 %, one tab per shot. Never open `backend/.env`, the Render dashboard's environment page or a keypair file on screen.

**Timing log:** the laptop person writes down the UTC time and the signature of every transaction as it lands. They go into the edit and the evidence notes afterwards.

### Take order (24-hour days)

With 24-hour days nothing waits on the clock: one take is create, join, start, then day 1's set. Once day 1 is kept, that Oath has nothing left to prove until tomorrow, so a re-take of the hero needs a new Oath.

| Step | Phone A | Phone B | Laptop | Beat |
|---|---|---|---|---|
| 1 | **Start an Oath**: group, habit push-ups (10), stake, terms, **Sign & stake**. The Keeper reads it. **Open wallet to sign**, approve. The invite is on screen. | | Open the create tx (phone A wallet's address page, newest) | 3 |
| 2 | | Join with the invite. The Keeper reads the join. Approve. | Open the join tx | 3 |
| 3 | Start, sign. | | Open the start tx | 3 |
| 4 | Half-rep clip: open the push-ups habit, **Start: 10 push-ups**, do 3 or 4 half push-ups, tap **Stop the set**. It sends nothing, so it costs no check. | | | 5 |
| 5 | The hero set: open the habit again, **Start: 10 push-ups**, the full set with the Freeze. Wait for the verdict and "Day 1 kept." | Keep KEPT open on the Oath to catch the `<name> just proved today` toast. | Open the `record_checkin` tx | 4 |
| 6 | **Audit the Keeper**. If it says "Not on chain yet", wait 10-20 s and tap again. Then **View the check-in on Explorer**. | | | 4f |
| 7 | Today tab: Ask the Keeper, question 1 (let it finish), question 2 (tap **Stop the Keeper** mid-answer). | | | 6 |

The half-rep hint and line fire at most once every 8 s, so give the clip about 10 s. One take is about 10 minutes. Plan three takes.

### Explorer tabs to open (all `?cluster=devnet`)

Our deployment (README, "Program and accounts"):
- Program `kept_test`: https://explorer.solana.com/address/7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj?cluster=devnet
- Verifier, the Keeper's key (its transaction list shows every `record_checkin` and fail Memo): https://explorer.solana.com/address/6tcCGfLheQD5Fq9c7W4jtStwA7WbpszNsvwTL9zJ3xcZ?cluster=devnet
- Treasury wallet: https://explorer.solana.com/address/BWsQ8zyb2RY1o1GJdGLo67EzpRYq5vUU8DiErXXJEJwP?cluster=devnet
- Config PDA: https://explorer.solana.com/address/BY6a5bNCuaVeSXD67GSVkjAwDKed1cthPTc2vZCtBpr6?cluster=devnet

Script run 1, group lifecycle (beat 7):
- Group Oath: https://explorer.solana.com/address/AdZwZ2fNF16GXaiY7ck4rzQogKMyM5KfvYPuKjih74H6?cluster=devnet

Script run 2, every activity (fallback for the receipt shot in 4f, captioned as a script run):
- Solo Oaths: https://explorer.solana.com/address/CvqjVtHyWKsMmPGEKzNMEZWaCe2qcUxM5qyEsaeFkG4p?cluster=devnet and https://explorer.solana.com/address/qcG5zEghFLRPt5hcm2mTXrsXA55XsSjxyJZPLSqvKEF?cluster=devnet
- Check-ins: https://explorer.solana.com/tx/3pZBWaMsfSRWKXVrTxsVWYdfuUN4LsKmfXm8pNg1ayKSqXknGk8oN1zNcsd3a7huAXi9hxfwnictJouKmD7fxuqS?cluster=devnet and https://explorer.solana.com/tx/RbsHUdPWyFipKjE9nPm9ViM4LLxZ8FfZJTTB4yyCj72hJL6EYQnzKd52hGvtTxKnNQjEcU4CHFAb3o1Dxu9VF9b?cluster=devnet

A real failed verdict (for the walkthrough's limits, not the cheat beat: it was an honest squat set the AI wrongly failed, since fixed):
- Fail Memo, receipt `05de54fe64e27cdc7a5ad58d5722dab53cc05459391f5ad1035445145fc7e46c`: https://explorer.solana.com/tx/REnzza4qF9tX3aAoYjNUjUinPmmZ2sCASCaTXqimwN7bLvUnL9DRQw2EUZakFq4VFxQn6dhVUDVoQD8hY8ts8JL?cluster=devnet

Older runs (2026-11-26, debug build, local backend, photo proofs): [`docs/notes/app-devnet-run-2026-11-26.md`](notes/app-devnet-run-2026-11-26.md). Not for this cut.

Fill in the take's signatures after recording. No transaction made through the Android app with a real wallet is listed as evidence yet, so these also go into the README and `docs/SUBMISSION_EVIDENCE.md`:

TODO (owner): fill in this table from the timing log of the take you use, then add the signatures to the README's Evidence section and `docs/SUBMISSION_EVIDENCE.md`.

| Tx | Signature |
|---|---|
| create (group) | |
| join | |
| start | |
| `record_checkin` day 1 (A, the hero set) | |

**What Explorer shows well:** the signer and program on `record_checkin`, the Memo text `kept:fail:<hash>` on a fail, and SOL balance changes. **What it does not show well:** the `CheckinRecorded` event's `proof_hash` appears only as a base64 "Program data" log line. Let the app's **Audit the Keeper** screen carry the hash match; don't try to read the hash off Explorer on camera.

### If a step fails live

| Problem | What to do |
|---|---|
| Phantom doesn't open, or the first connect does nothing | Unlock Phantom first, tap again. Still stuck: switch **Wallet identity: KEPT's own site** off, or sign out of KEPT and sign in again. |
| The signing screen says "The transaction failed." (a simulation, RPC or wallet error; Devnet 429s) | Retry once. If it keeps failing, wait a minute. Nothing was staked. |
| The set won't start: "Set the phone straight: level with the floor" | Level phone A. Turning the phone mid-set restarts the set ("Keep the phone still during the set: start again"). |
| Reps are missed, or "The Keeper can't see you: get back in frame" | Phone lower and level, whole body in frame, more light. Film from the front, as in the proven set. |
| "The camera lost the set", "That set took too long" or "The Freeze photo didn't take" (each ends in "start again") | Start the set again. Nothing was sent. |
| "Not enough time left for this set." | The app gives a fresh challenge. Start again. |
| The server refuses an honest set (the screen says which part: the raised hand, the pose or the recount, plus the Keeper's reason) | Reshoot with the hand clearly up and held after "Hold it." Don't hide a real refusal and don't cut around it to fake a pass. |
| "We can't check sets right now." | Either the AI judge can't answer (check `/health` and the OpenRouter credit, then retry in a minute: "Your set is saved."), or this wallet has used its 20 checks for the UTC day. The screen is the same for both. Out of checks: that wallet is done until 00:00 UTC, so film with the other phone's wallet or come back after midnight UTC. |
| The Keeper's voice doesn't play for a verdict or read-out (ElevenLabs credit or the daily budget) | The bundled counts still play. Re-take when the voice works. Don't dub a server line from another take. |
| Ask: "The Keeper didn't catch that." / "The Keeper can't answer right now." | Hold the button for the whole question; retry. Check credit and the 40-a-day cap. |
| Audit shows "Not on chain yet" | The check-in is still landing. Wait 10-20 s and tap again. |
| A recording segment is missing | Use B-CAM or the other phone's angle. |
| Phone B or the group take is impossible today | Film a solo Oath on phone A (a solo miss costs 35 HP and the missed share goes to the treasury). Change beats 2 and 3 to "Swear an Oath, alone or with friends", and skip the join shot. |

### Edit and export

- [ ] 1920×1080 canvas. Hero beats: B-CAM large with phone A's screen beside it (both landscape). Other phone shots: the recording large on the left, captions on the right. Explorer goes full frame on its cuts.
- [ ] Captions burned in. The honesty captions above are not optional. Subtitle every Keeper line word for word.
- [ ] Jump cuts over model waits and wallet loading are fine. Never reorder cause and effect, never show a verdict next to a photo or set it didn't judge, and never splice reps from different takes into one set. If reps must be trimmed, let the counter's jump show.
- [ ] Check the length before uploading: `ffprobe -v error -show_entries format=duration -of csv=p=0 kept_demo.mp4` must print less than 175. Target 165.
- [ ] Watch the final file once for anything secret: `.env` contents, the Render environment page, keypairs, API keys, a seed phrase screen.
- [ ] Upload public or unlisted (YouTube or Loom).

TODO (owner): put the video link in the README and the submission form.

## 3. Optional technical walkthrough (3-5 min)

Screen recording of the code and a terminal, narrated by a team member. No length limit is known for this one, but stay under 5:00.

1. **0:00-0:30 What we inherited and what we built.** The README table: before (the app, 116 screens, Demo mode, rules engine, program source, backend, MWA sign-in, up to `afb1f0c`) and during the hackathon (our own program deployment, the hosted API, the Keeper and its receipts, explain before sign, the Keeper's voice, the live rep counter, Ask the Keeper, the v1.4.2 release). Show `git log afb1f0c..hackathon --oneline`. Say plainly that before the hackathon the Live loop could not create an Oath and Live proofs trusted the phone.
2. **0:30-1:00 The program.** `kept_test` on Devnet. Instructions in the Live flow: `create_oath_sol`, `join_oath_sol`, `start_oath`, `settle_oath_sol` and `claim_sol` from the app, and `record_checkin` (plus the automatic settle) from the server. `record_checkin` requires the signer to equal `config.verifier` and emits `proof_hash` in `CheckinRecorded`. `replay_v3` in `economics.rs`: 10 % of the stake per miss, shared between that day's keepers and the treasury (the `k + 1` split), HP -20 per missed member (group) or -35 (solo), +10 heal, a conservation check. Settle is permissionless, and the server settles on its own after the last day.
3. **1:00-2:00 The live rep counter.** The engine (`packages/engine/src/reps.ts`, copied byte for byte to `backend/src/shared/reps.ts`, pinned by golden vectors) turns pose samples into reps. The phone runs MediaPipe Pose (`frontend/src/screens/proof/RepSet.tsx`); its number is only a display. The server (`backend/src/v4/repProof.ts`) recounts the whole trace and refuses, among other checks: a count under the target ("The Keeper counted 7 of 10"), a sample gap over 2 s, a set longer than its challenge, a frozen pose, a frame shape that doesn't match the photo, a freeze outside 1.5-8 s, a freeze at the wrong rep, and a photo that isn't the freeze frame. A replayed trace (the same trace hash, any wallet) is refused in `backend/src/routes/proofVerify.ts`. `freezeAfterRep` picks the Freeze rep from the challenge's blockhash and time, between 30 % and 70 % of the set. Show `backend/scripts/e2e_all_habits.ts`: per activity, a cheat set (knee push-ups, waist-bend squats, jumping jacks with the arms only to shoulder height, half presses…) that the recount must refuse, and an honest set. Contract: `docs/notes/REP_COUNTER_CONTRACT.md`.
4. **2:00-2:40 The Keeper pipeline and receipts** (`backend/src/v4/keeper.ts`, `backend/src/routes/proofVerify.ts`). The server ignores any verdict from the app. Each verdict is a canonical-JSON receipt with a SHA-256. The day's `proof_hash` combines the receipt hashes. Fails go out as an SPL Memo `kept:fail:<hash>` from the verifier. Receipts are public files on Supabase Storage. Verify one yourself: `GET https://kept-api-vxk8.onrender.com/keeper/oaths/<oath>/days/<dayIndex>?wallet=<wallet>` (day 1 is index 0) lists the day's receipt hashes; `GET https://kept-api-vxk8.onrender.com/keeper/receipts/<sha256>` returns each receipt. Re-hash each one, combine them (`combinedHabitsHash` in `backend/src/v4/habits.ts`), and compare with `proof_hash` in the transaction. The same check in the app: `frontend/src/features/keeper/audit.ts`.
5. **2:40-3:15 Explain before sign** (`packages/chain/src/explain.ts`, `frontend/src/screens/shared/Signing.tsx`). The transaction is decoded with the program IDL; compute-budget instructions are skipped; anything not from our program shows as "Not a KEPT instruction". It is simulated for the wallet's SOL change. The Keeper reads it with amounts rounded for speech ("about 0.07 SOL") and never reads out addresses. The wallet opens only on **Open wallet to sign**.
6. **3:15-3:50 The voice and Ask the Keeper** (`backend/src/v4/voice.ts`, `backend/src/v4/ask.ts`, `backend/src/v4/keeperAgent.ts`, `frontend/src/features/keeper/`). ElevenLabs text-to-speech (`eleven_flash_v2_5` by default) in a voice designed for KEPT (`backend/scripts/keeper_voice_design.ts`); the key stays on the server. Counts, "Freeze!" and hype lines are bundled clips (made by `backend/scripts/keeper_count_voice.ts` and `backend/scripts/keeper_hype_voice.ts`), clean by default with a no-filter switch. Ask the Keeper: ElevenLabs speech-to-text (`scribe_v3` by default), a chat model with read-only tools over your own Oaths (details, every member's progress today, receipts, wallet balance, rules), one or two short sentences back. A "Stop the Keeper" button shows whenever it talks.
7. **3:50-4:30 Limits, said out loud.** Devnet only, test SOL. Keep the phone level and low; a camera looking down weakens counting. Filmed from behind and to the side, with the feet hidden, knees-down push-ups and planks can't be told apart from full ones. High knees filmed exactly side-on can miss lifts. The AI judge can be wrong: show the real fail Memo on an honest squat set (since fixed). Seeker Genesis is mocked by an allowlist on Devnet. No `set_verifier` instruction yet. Not yet in the Solana dApp Store.
8. **4:30-5:00 Evidence.** The README's Evidence section, `docs/SUBMISSION_EVIDENCE.md`, and the v1.4.2 release with its signed APK and SHA-256.
