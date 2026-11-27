# KEPT demo script (live, about 2:40)

For judges and live demos. It follows the beats of [`DEMO_VIDEO.md`](DEMO_VIDEO.md) in a shorter order: the live rep set with the Freeze, then the receipt and **Audit the Keeper**, then **Ask the Keeper**, then the group Oath and how it pays out.

Everything here is **Live**: the v1.4.2 release APK, the hosted API (`https://kept-api-vxk8.onrender.com`), a real wallet and our own program (`7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj`) on Solana Devnet. Release builds have no Demo mode.

Lines to say are in quotes. Stage directions are in [brackets]. **Bold** words are the app's own labels.

## Who does what

- **Speaker:** says the lines and drives the laptop (Solana Explorer).
- **Performer:** does the push-ups in front of phone A on the floor.
- One person can do both. Then say the set lines before you tap Start and after the verdict, not during the reps.

## Rules for what you say

- Say "Solana Devnet, test SOL" once, early.
- Say "our scripted Devnet run" whenever you show the group payout. It used the real program and transactions, but a stand-in AI judge and 2-minute days.
- Don't say: mainnet or real money; that KEPT is in the Solana dApp Store (not yet); that the phone's count decides (the server's recount does); that counting works from above; that the Keeper is never wrong (a real false fail is on chain, see "Honest answers" below).

## Before you start

The full checklist is in [`DEMO_VIDEO.md`](DEMO_VIDEO.md) §2. The minimum for a live demo:

- [ ] Phone A runs v1.4.2 from the [release page](https://github.com/ekanshvcpkg/KEPT-DAPP/releases/tag/v1.4.2). `sha256sum KEPT.apk` prints `7c30ee6c72f0b9d17b971fa9d65d705d6b43937bafbd75a8b7966e0623b55e71`. Uninstall v1.3.0 or v1.1.1 first: they were signed with another key.
- [ ] Phantom is on Devnet, with Devnet SOL ([faucet.solana.com](https://faucet.solana.com)). In KEPT, Settings › **Wallet identity: KEPT's own site** is on, so Phantom doesn't show "identity could not be verified".
- [ ] An Oath whose only habit is 10 push-ups is already created and started, and today is not proven yet. Make it before the demo. With more habits, the set doesn't keep the day, so there is no **Day 1 kept.** screen and no Audit row. Once a day is kept, that Oath has nothing to prove until tomorrow, so a rehearsal on demo day needs a second Oath.
- [x] Phone A's wallet passes the server's Seeker check: on Devnet it is mocked by an allowlist, and the hosted API's lets any wallet in (checked 2026-11-27). See [`DEMO_VIDEO.md`](DEMO_VIDEO.md) §2.
- [ ] Each wallet gets 20 checks from the server per UTC day. Every set that reaches the AI judge uses one. Rehearse the day before, or with another wallet.
- [ ] Settings: **The Keeper's voice and sounds** on; **The Keeper, no filter** off (it swears). Media volume up, Do Not Disturb on.
- [ ] Wake the API: `curl -s https://kept-api-vxk8.onrender.com/health` answers with the build commit.
- [ ] Phone A placed for the set: on its side (landscape), on the floor, level, propped up a little, about 2 m away, facing the performer. Whole body in frame, head to feet. Film from the front: that is the set proven on a real phone (10 of 10 counted, recounted and kept).
- [ ] Laptop: these Explorer tabs open (all Devnet):
  - the verifier, the Keeper's key (right after your set, its newest transaction should be your check-in): https://explorer.solana.com/address/6tcCGfLheQD5Fq9c7W4jtStwA7WbpszNsvwTL9zJ3xcZ?cluster=devnet
  - the group Oath from our scripted run 1: https://explorer.solana.com/address/AdZwZ2fNF16GXaiY7ck4rzQogKMyM5KfvYPuKjih74H6?cluster=devnet
- [ ] Rehearsed once: the full set, the verdict, Audit, and what the Keeper answers to "What do I still have to do today?".

## The script

| Time | Do | Say |
|---|---|---|
| 0:00 | [Phone A on **Today**, the Oath card showing. Hold it up.] | "Habit apps trust your word. Crypto habit apps trust your phone. KEPT trusts neither." "You stake SOL on a daily habit, alone or with friends. This is Solana Devnet, test SOL." |
| 0:12 | [Open today's push-ups habit. Show the **Set up** steps. Put phone A on its side on the floor, where it was placed, then tap **Start: 10 push-ups**. Don't turn the phone after Start: that restarts the set. The performer gets into the top position, arms straight, and holds still until **Go!**] | "Today's habit is ten push-ups. A pose model on the phone counts them live. It's one of nine activities, from squats to a timed plank." |
| 0:22 | [The performer does the reps. The Keeper counts aloud, "One." "Two."…, with hype lines in between. The lines vary, for example "That's one. The house is watching."] | [Say nothing. Let the Keeper count.] |
| ~0:30 | [After one of reps 3 to 7 (the server picks which), the Keeper says "Freeze! One hand up. Hold it." The screen says **Freeze! Raise one hand**. The performer holds still, one hand up, until the photo is taken. Then back in position, hold still, and carry on.] | [Over the next reps, quietly:] "The server picked that rep from a Solana blockhash. So an old recording can't be replayed." |
| ~0:45 | [Rep 10. The Keeper says a done line. The screen shows **Checking…**] | "The phone's count is only a display. The server recounts the whole pose trace with the same engine. Then an AI judge checks the Freeze photo: a real person, mid-set, one hand up." [If the wait runs on:] "Half reps don't count. Knee push-ups, frozen poses and replayed sets are refused too." |
| ~1:05 | [The verdict. The Keeper says "Kept." and the judge's reason in its own words. The owner's test got: "Kept. The photo shows a live scene of a person doing a push-up with one hand raised." The screen shows **Day 1 kept.** (or the day you are on).] | [Let the Keeper finish.] "That's the Keeper. Its voice is made with ElevenLabs." |
| 1:15 | [Tap **Audit the Keeper**. **Checking the receipts…**, then **Verified on Solana** · "1 receipt(s) hash to the proof recorded on chain".] | "Every verdict is a public receipt. Its hash goes on chain with the day's check-in. Audit the Keeper re-hashes the receipt on this phone and checks it against Solana." |
| 1:30 | [Tap **View the check-in on Explorer**, or switch to the laptop's verifier tab and open the newest transaction. Point at the signer `6tcC…` and the program `7VpB…`.] | "Here's the check-in. It's signed by the Keeper's key, the only key our program accepts for check-ins. A failed set goes on chain too, as a memo." |
| 1:42 | [Back to **Today**. Press and hold **Hold to ask the Keeper** (**Listening… let go to ask**). Ask the question, let go. **The Keeper is thinking…**, then it answers aloud.] | "You can also just ask the Keeper." [Hold and ask:] "What do I still have to do today?" [Let it answer.] "It looks up your Oaths, your friends' progress and your receipts. It answers in a sentence or two, and never reads out addresses." |
| 2:02 | [Phone A: open a group Oath (a solo one if you have no group): the HP bar and the day grid.] | "An Oath is solo, or you and up to three friends. Everyone stakes SOL in an on-chain escrow and shares one HP bar. Miss a day, and part of your stake goes to the friends who kept." |
| 2:14 | [Laptop: the group Oath `AdZwZ2fN…` on Explorer.] | "After the last day, the server settles on chain by itself. In our scripted three-friend run, each staked 0.005 SOL. One missed a day and lost a tenth of it, split between the two who kept and the treasury. The payouts matched our rules engine to the lamport. All three claimed." |
| 2:34 | [Phone A or the laptop: the v1.4.2 release page.] | "KEPT 1.4.2 is on GitHub with a signed APK. Swear it, do the reps, and audit the Keeper." |

The run 1 numbers, if someone asks: each member staked 5,000,000 lamports. Member C missed day 2. A and B were paid 5,166,666 lamports each, C 4,500,000, and the treasury got the remaining 166,668 (15,000,000 in total). The server settled on its own 45 s after the end. A miss costs 10 % of the stake, split equally between that day's keepers and the treasury (`replay_v3` in `onchain/programs/kept_test/src/economics.rs`).

## Optional extras

Add these only if you have time or someone asks.

- **Stop the Keeper (+10 s).** Ask a second question, "How are my friends doing?", and tap **Stop the Keeper** while it answers. Say: "One tap stops it." The button shows while the Keeper speaks a line: an answer, a verdict or a transaction read out.
- **A half-rep cheat (+15 s), before the real set.** Tap **Start: 10 push-ups**, wait for **Go!**, and do two half push-ups. The counter doesn't move and the hint reads "Not deep enough: that one didn't count". The Keeper may add a line such as "That's a curtsy, not a rep." Tap **Stop the set**: the set screen closes and nothing is sent to the server. Open the habit again for the real set.
- **Explain before sign (+30 s).** **Start an Oath**, fill it in, tap **Sign & stake**. On the signing screen, the **The Keeper read this transaction** list shows what the transaction does and the "Your wallet" change, and the Keeper reads it out ("Stake about 0.07 SOL in a new Oath…": the amount depends on the stake you pick). Say: "Before any wallet opens, KEPT decodes and simulates the transaction, and the Keeper says what it does." The wallet opens only on **Open wallet to sign**.
- **A friend's phone (+5 s).** If phone B is in the same group Oath, it shows "**&lt;name&gt; just proved today**" when phone A's set is kept (Supabase Realtime). Phone B's wallet must pass the server's Seeker check too, which is mocked by an allowlist on Devnet: see [`DEMO_VIDEO.md`](DEMO_VIDEO.md) §2. A moment later it may also show "**&lt;name&gt;'s day is on Solana**", when the check-in lands.

## If something goes wrong

| Problem | What to do |
|---|---|
| "Set the phone straight: level with the floor" | Level phone A. Turning it mid-set restarts the set. |
| Reps are missed, or "The Keeper can't see you: get back in frame" | Phone lower and level, whole body in frame, front view, more light. |
| "The camera lost the set", "That set took too long", "Keep the phone still during the set" or "The Freeze photo didn't take" | Start the set again. Nothing was sent. |
| The server refuses an honest set (the screen says which part: the raised hand, the pose or the recount, and the Keeper's reason) | Say so: "The Keeper refused that one. Let's go again, hand clearly up." Retry with the hand held up after "Hold it." A retry that reaches the AI judge uses one of the day's 20 checks. After 3 failed AI checks of the habit in one day, the app shows **Today's proof didn't pass.** and says the day counts as missed. Don't risk a third failed check on stage: use the next row's fallback instead. |
| "We can't check sets right now." | The AI judge can't answer, or this wallet has used its 20 checks today. Skip to the Explorer part and show a check-in from our scripted run 2 instead, and say it is scripted: https://explorer.solana.com/tx/3pZBWaMsfSRWKXVrTxsVWYdfuUN4LsKmfXm8pNg1ayKSqXknGk8oN1zNcsd3a7huAXi9hxfwnictJouKmD7fxuqS?cluster=devnet |
| Audit shows **Not on chain yet** | The check-in is still landing. Wait 10-20 s and tap again. |
| "The Keeper didn't catch that." or "The Keeper can't answer right now." | Hold the button for the whole question and try once more. Then move on. |
| Phantom doesn't open | Unlock Phantom first and tap again. Still stuck: switch **Wallet identity: KEPT's own site** off. |
| No network at all | The release APK has no offline mode. TODO (owner): add the link to the recorded demo video here, to play instead. |

## Honest answers to likely questions

- **Real money?** No. Solana Devnet and test SOL only. KEPT is not in the Solana dApp Store yet.
- **Does the phone decide?** No. The server recounts the whole pose trace with the same deterministic engine (`packages/engine/src/reps.ts`, copied byte for byte to `backend/src/shared/reps.ts`) and ignores any verdict from the app.
- **Can the AI judge be wrong?** Yes. It once failed an honest squat set (since fixed). Because every verdict is public, that fail is on chain too: [fail memo](https://explorer.solana.com/tx/REnzza4qF9tX3aAoYjNUjUinPmmZ2sCASCaTXqimwN7bLvUnL9DRQw2EUZakFq4VFxQn6dhVUDVoQD8hY8ts8JL?cluster=devnet), receipt `05de54fe64e27cdc7a5ad58d5722dab53cc05459391f5ad1035445145fc7e46c`.
- **Any angle?** Any horizontal angle: front, side or in between. Keep the phone level and low; a camera looking down from above weakens counting. Filmed from behind and to the side, with the feet hidden, knee push-ups and planks can't be told apart from full ones. High knees filmed exactly side-on can miss lifts.
- **Is it tested?** At the release: engine 111 tests, backend 141, app 552, all passing. Our scripted Devnet run 2 passed 73 of 73 checks across all 9 activities and 2 photo habits, including a cheat set for each activity that the server's recount refused.
- **Seeker?** The Seeker Genesis check is mocked by an allowlist on Devnet.

TODO (owner): after a live demo on Devnet, write down the check-in signature. No transaction made through the Android app with a real wallet is listed as evidence yet; add it to the README's Evidence section and `docs/SUBMISSION_EVIDENCE.md`.

## Backup: Demo mode (development builds only)

The v1.4.2 release APK has no Demo. A development build still has it: **Get started** › **Try the demo** › **Looks like me**. It runs a sample account on a mock backend, wallet and program, with no network (airplane mode works). Signing screens say "Demo: the approval is simulated." Amounts are in SKR, and proof checks are simulated. If you use it, say so out loud: Demo shows the screens and the rules, and it is **not** evidence of wallet, escrow, settlement or claim behaviour.

What is in it: Today has Iron Week with a habit still to prove and Hydra 14 to claim. Oaths › Guitar Days is broken, with a Rematch offer. The Bounties tab lists free challenges. Profile › Settings has **Skip to tomorrow** (opens the day's recap), **Restart demo** (back to the starting state) and **Exit demo**. **Start an Oath** opens pre-filled as "Morning Run" (`frontend/src/features/oaths/showcase.ts`; turn it off with `demoPrefill` in the settings store).
