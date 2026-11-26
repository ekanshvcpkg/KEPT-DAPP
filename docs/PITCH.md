# KEPT pitch

**KEPT: Oaths you can't fake.** Friends stake SOL on a daily habit, share one HP bar, and prove each day with a live photo. An AI judge called the Keeper checks every photo and leaves a receipt on Solana that anyone can re-check. Native Android, Solana Devnet.

> Habit apps trust your word. Crypto habit apps trust your phone. KEPT trusts neither.

This document is for judges. Each `## Slide` section is one slide of an 8-slide deck: the bullets go on the slide, and the speaker notes are what we say over it. Status as of 2026-11-26, the first day of the hackathon. If something is not proven, this document says so.

---

## Slide 1: The problem

- **Habit apps trust your word.** A streak is a checkbox. Tapping "done" costs nothing, so the streak means nothing.
- **Crypto habit apps trust your phone.** Steps come from a fitness app on the device, or the app decides pass or fail itself. A modified client or a borrowed phone wins.
- **Group stake apps make your friends profit from your failure.** Losers' stakes go to winners. That is a bet against your friends, not support for them.
- Money at stake works (stickK, Beeminder and Forfeit have shown it for years), but only if the proof is honest and the group is on the same side.

**Speaker notes.** Everyone in this room has broken a resolution. Putting money on it helps: commitment contracts are a proven idea, and stickK has run them since 2008. The problem is the judge. Either you grade yourself, a friend grades you and usually takes your word, or the app trusts whatever the phone reports. When the money is real and the judge is weak, faking a day is the rational move. In a group, faking a day takes money from friends who were honest. And in most group stake apps, your friends win money when you fail, so nobody has a reason to help you show up.

---

## Slide 2: The solution

- **One HP bar for the whole group.** Up to 4 friends, one Oath, one health bar. A miss costs −20 HP (−35 solo), every day heals +10, and at 0 HP the Oath breaks for everyone. A small share of a miss goes to the friends who kept the day, but every miss also drains the bar that guards everyone's whole stake. You want your friends to show up.
- **A judge you can check.** The Keeper is a vision model on the server (`google/gemma-3-27b-it`). It ignores any verdict the app sends. Each verdict becomes a public receipt; a pass puts the receipt hash on chain, a fail is published in an SPL Memo. "Audit the Keeper" re-hashes the receipts on your phone and compares them with the chain.
- **Explain before sign.** Before the wallet opens, the signing screen decodes the transaction with the program IDL, simulates it, and shows exactly how much SOL leaves your wallet. The wallet opens only when you tap "Open wallet to sign".
- **A Keeper with a voice.** The Keeper says its verdict and reads each transaction aloud (ElevenLabs text-to-speech).

**Speaker notes.** Three ideas. First, cooperation: the shared HP bar turns a group of rivals into a team, because one person's missed days can break everyone's Oath. Second, a verifiable AI judge: the Keeper is an agent with its own Solana key, and that key is the only one our program accepts for check-ins. It does not decide in secret; every verdict leaves a receipt, and you can audit it from the app. Third, trust at the moment of signing. Real lines from today's phone run: after a photo, "Kept. The photo shows a real scene with a water bottle and a clear thumbs up gesture." Before signing, "Stake 0.0703 SOL in a new Oath (solo). Your wallet: -0.0731 SOL. Sign only if that is what you meant." Today the voice is an ElevenLabs premade voice (George). A custom-designed Keeper voice is waiting on a paid ElevenLabs plan.

---

## Slide 3: How it works, and why Solana

```mermaid
sequenceDiagram
    autonumber
    participant A as KEPT app (Android)
    participant W as Wallet (MWA)
    participant K as Keeper server
    participant S as Solana Devnet
    Note over A,S: Swear (once)
    A->>A: Explain before sign: decode with IDL, simulate, show SOL change
    K-->>A: Keeper voice reads it aloud
    A->>W: "Open wallet to sign"
    W->>S: create_oath_sol / join_oath_sol (stake held in escrow)
    Note over A,S: Prove (every day, every habit)
    A->>K: Ask for a challenge
    K->>S: Read the latest blockhash
    K-->>A: Hand gesture from sha256(blockhash), expires in 2 min
    A->>K: Live photo (camera only)
    K->>K: Vision model judges; app's verdict ignored; receipt + SHA-256
    alt pass
        K->>S: record_checkin(proof_hash), signed by the verifier key
    else fail
        K->>S: SPL Memo "kept:fail:<receipt hash>"
    end
    K-->>A: Verdict, spoken by the Keeper
    A->>K: Audit the Keeper: fetch receipts
    A->>S: Re-hash and compare with CheckinRecorded.proof_hash
    Note over A,S: Settle and claim
    A->>S: settle_oath_sol (anyone can call it)
    A->>W: claim_sol: stake kept plus share of others' misses
```

**Why Solana**

- **A check-in every day per person is cheap.** A 4-person, 14-day Oath has 56 check-ins. At the base fee of 5,000 lamports per signature that is about 0.00028 SOL in fees for the whole Oath (before any priority fee).
- **Fast enough for a daily ritual.** The verdict, the on-chain check-in and the voice line fit inside a 2-minute demo day.
- **Mobile Wallet Adapter.** A native Android app signs with Phantom, Solflare or the Seeker wallet. No browser wallet, no PWA wrapper.
- **Seeker.** Built for the Solana Seeker (camera-first, MWA). The Seeker Genesis Token check is mocked with an allowlist on Devnet, because Genesis Tokens live on mainnet.

**Speaker notes.** Walk the diagram top to bottom. The money sits in an Anchor program we deployed on Devnet. The challenge comes from a recent blockhash, so the server cannot pick the gesture ahead of time and an old photo will not match. The Keeper's key can only record check-ins; it cannot upgrade the program or move stakes. Payouts are computed on chain by the same rules the app shows, tested against the same vectors. On a normal chain, a check-in per person per day would cost more than the stake. On Solana, a whole Oath's check-ins cost a fraction of a cent.

---

## Slide 4: What is real today

Proven on 2026-11-26 on a real phone (Samsung, Phantom) against our program [`7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj`](https://explorer.solana.com/address/7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj?cluster=devnet) on Devnet:

| What | Evidence |
|---|---|
| Sign-in with Mobile Wallet Adapter (Phantom) | [App run notes](notes/app-devnet-run-2026-11-26.md) |
| Create and stake from the app (solo, 0.0703 SOL) | [create_oath_sol](https://explorer.solana.com/tx/3KVr6xkP7Ax4qJLS3fLmSfCXiioLiHpjqzTuK5zsZSzXNHx8aFW3b67swExGc5q59qWBQuJ9edm4LEgi1oSA1qet?cluster=devnet) |
| The Keeper rejects a photo ("The required gesture is not visible"); fail receipt published in an SPL Memo | [App run notes](notes/app-devnet-run-2026-11-26.md); an earlier pipeline run's [Memo](https://explorer.solana.com/tx/22kQ2Eq7Gp7MYN3kCSGXvewJZrNo3e16ZCVPJfcfkzE6RkSGS9x3yRMWMnrGK7K2xLaa8yvmjDZkGmyDYNvvpSuv?cluster=devnet) (photo of a screen, rejected) |
| The Keeper passes a photo; `record_checkin` writes the receipt hash | [day 2](https://explorer.solana.com/tx/56FCHqE8Pgu52QVFsikdPrYKGxmbKuyHDSsTDgaXKpvJorG5EMdQAEpPv1qpMDKfPXpPGerGufXEbxS73G4LedQe?cluster=devnet), [day 3](https://explorer.solana.com/tx/5Hqv8Pf8FNAADa53RA88MNRXr5CwmreQkMPtVPL3JTyXwa7sd4Q9zyYdhyv5cpqHEXpkJALbqPtTxGYwzAQiqprc?cluster=devnet) |
| Audit the Keeper: receipt re-hash matches the on-chain `proof_hash` | [App run notes](notes/app-devnet-run-2026-11-26.md), [`audit.ts`](../frontend/src/features/keeper/audit.ts) |
| Settle and claim, solo, exact payout (stake minus one 10% miss: 0.063259999 SOL) | [settle](https://explorer.solana.com/tx/32fta5f583QKW6LZEPueMcQbuMkARui82qRy79EcXmi9JVTi3rWphzBGwxTZ7CnRi6BWcct5pau1DN1Emr1GWthN?cluster=devnet), [claim](https://explorer.solana.com/tx/4qbaLisirNMvTjhMEJm9nKmdNuKDwgDH8TzRC1UkvEbSMjzyfsRv7RCbzszKGj38quU9xejJe5RCkQKLscxntu8v?cluster=devnet) |
| Settle and claim, group of 3 with one miss; every payout matches the rules replay and the totals add up to the 0.03 SOL staked | [Escrow run log](notes/e2e-devnet-sol-2026-11-26.log): [settle](https://explorer.solana.com/tx/2usvhEzdt8ewESzQHYAQHsFiYBww5SCGKSmSsaSdsAaSRxV7b1LWb4D9JnfTvrJv1kUd111YNgSzkK1wUR5k8QmE?cluster=devnet), [claim](https://explorer.solana.com/tx/2n6SvetZxqwhudxgrAK9Sx2mGXgdTBpaNS3TNXBP6raGpPfBXXg3M4rys7AKtKMs1AUg2TxEJhG7fcEnaBwdUonh?cluster=devnet) |
| Invite code joined by a second wallet | Done on the phone today; signatures still to be added to the evidence file |
| Explain before sign (IDL-decoded transaction, simulated SOL change, wallet opens only on tap) | [`explain.ts`](../packages/chain/src/explain.ts) |
| The Keeper speaks verdicts and transactions (ElevenLabs TTS, premade voice George) | [`voice.ts`](../backend/src/v4/voice.ts) |

**Not done yet:** a hosted backend (today's runs used a local backend), the Solana dApp Store submission, a release APK with these changes, and the demo video. Demo days are 2 minutes (debug build); production days are 24 hours. The custom Keeper voice needs a paid ElevenLabs plan.

**Speaker notes.** Everything on this slide has a link. Click any check-in transaction and you will see the `proof_hash` from the receipt. The solo payout is the stake minus exactly one 10% miss, because we missed day 1 on purpose. The group run had three members, one missed a day, and every lamport is accounted for. Be clear about what was inherited: the app, its screens and the Anchor program source existed before the hackathon. In that version, Live proofs trusted the phone's verdict. Our team built the Keeper, receipts, the audit, explain-before-sign, the voice and our own program deployment during the hackathon (README, "Hackathon: before/during").

---

## Slide 5: Business model

- **Protocol fee on misses.** A miss forfeits 10% of that member's stake. It is split into equal shares: one for each friend who kept the day, one for KEPT. In a solo Oath, or a day where everyone missed, the miss goes to KEPT. If everyone keeps every day, nobody pays anything.
- **Sponsor Bounties: pay only for verified outcomes.** A brand or gym funds a pool and sets daily tasks; joining is free; survivors who prove every task split the pool. If nobody survives, the pool goes back to the sponsor. KEPT takes 10% when the pool is funded. *Built in Demo mode; not on chain yet.*
- **Roadmap: HP-priced pledges ("back, don't bet").** Family, an employer or a coach pledges toward someone's Oath. The payout is `pledge × final HP / 100`, with a full refund at 0 HP. Backers pay only for what was verified and can never profit from a failure.
- **Low running cost per user:** one vision call per photo, one check-in transaction per day, cached voice lines.

**Speaker notes.** We earn when people break their word, but much less than a solo-penalty app does: in a group, most of a miss goes to the friends who showed up. A broken Oath (0 HP) is the expensive case: half of what is left goes to KEPT and half is held for a Rematch. Rematch recovery is not on chain yet, so today that held half also ends with KEPT after 7 days; we say so in the README. Bounties turn KEPT into an ad product that only pays out for verified behavior: a sponsor pays for people who actually went to the gym 14 days in a row, checked by the Keeper. Pledges are the long-term idea: money that rewards progress, priced by the HP bar.

---

## Slide 6: Competition, and why we're different

| | Stake | Proof | Who judges | Can you check the verdict? | Where a miss goes |
|---|---|---|---|---|---|
| **KEPT** | SOL, solo or up to 4 friends | Live photo + gesture from a recent blockhash | Server AI; app's verdict ignored | Yes: public receipt, hash on chain (pass) or in a Memo (fail), audit in the app | Shared among that day's keepers + one share to KEPT; shared HP can break the Oath for everyone |
| **Lock-In** [1] | SKR, individual goals | Steps from Health Connect on the phone; a device key signs a daily yes/no | The phone | Only the yes/no is on chain | Forfeited after the goal closes |
| **Moonwalk** [2][3] | SOL, USDC or BONK, group step games | Steps from Apple Health, Fitbit, Google Fit | Fitness app data, anti-cheat algorithm, staff checks | No public method we found | To the players who hit the goal (zero-sum) |
| **Stakehold** [4] | SOL, solo or group (Devnet, hackathon project) | Photo + pose derived from SlotHashes; GPS, Duolingo, honor modes | AI checks, code computes the verdict | Proof hash on chain for every verdict | Eliminated players' stakes to survivors |
| **Forfeit** [5][6] | Card, solo | Photo or timelapse | Human reviewers (some listings say AI) | No | Taken by Forfeit (some listings say charity) |
| **stickK** [7][8] | Card, solo | Up to your referee | A friend, who may take your word | No | Charity, anti-charity or a friend |
| **Beeminder** [9][10] | Card, solo | Data or self-report | The data and you | No | Charged by Beeminder; pledge grows $5, $10, $30, $90… |

**What is different about KEPT.**
1. **Cooperative, not zero-sum.** One shared HP bar: a miss hurts the whole group, so friends push each other to show up. Every other group product above pays winners from losers.
2. **A judge you can audit from your phone.** Not just a hash: a public receipt (photo hash, challenge, model, verdict) that the app re-hashes and compares with the chain.
3. **Explain before sign.** No product above shows a decoded, simulated transaction before the wallet opens.
4. **A Keeper with a voice and a character.** The judge is a character people remember, not a status label.

**Speaker notes.** Be fair here. Stakehold, built at another Solana hackathon this month, also derives a pose from slot hashes and puts proof hashes on chain, so "AI judge plus on-chain hash" alone is not new, and we don't claim it is. Our edge is the combination: cooperative shared HP instead of elimination, receipts anyone can re-hash from the app, explain-before-sign, and a Keeper that talks. Moonwalk is the funded incumbent ($3.4M seed led by Hack VC, featured in a Solana Mobile Seeker campaign) and proves people will stake on habits; its model is still winners take losers' money, judged by fitness-app data. Forfeit, stickK and Beeminder prove money at stake works, but you trust a person or yourself.

---

## Slide 7: Roadmap

| Next | What |
|---|---|
| Now (this hackathon) | Hosted backend; release APK; Solana dApp Store submission (publish.solanamobile.com); demo video |
| Mainnet | Move the program to mainnet with 24-hour days; move the upgrade authority to a **Squads** multisig |
| Seeker | Real **Seeker Genesis Token** badge on mainnet (on Devnet it is mocked with an allowlist) |
| Harder to cheat | **High-entropy challenges** (a short code from the blockhash written next to the object) and **perceptual-hash dedupe**, so a stored or re-encoded photo can't pass |
| Fairer judge | Group review and appeals in Live, for model false negatives |
| Voice | Custom-designed Keeper voice; **"Ask the Keeper"**: an ElevenLabs voice agent that answers questions about your Oath, HP and verdicts |
| Money | Sponsor Bounties on chain; HP-priced pledges |

**Speaker notes.** Today's anti-cheat has a known limit, and we write it in the README: with only three gestures, a determined cheater with a stored photo for each gesture and a modified client could re-encode it and pass. An identical photo can only pass once. The fix is a high-entropy code from the blockhash plus perceptual hashing. Governance matters before mainnet: today one team key can upgrade the program, so it moves to a Squads multisig. "Ask the Keeper" uses ElevenLabs' agent platform. The agent can explain and look things up, but it never decides a verdict; verdicts stay in server code.

---

## Slide 8: Team and the ask

**Team** *(placeholder: names, roles and links to be filled in)*

| Name | Role | Link |
|---|---|---|
| _TBD_ | On-chain and backend | _TBD_ |
| _TBD_ | App (Android) | _TBD_ |
| _TBD_ | Product, design, video | _TBD_ |

**The ask**

- **Judges:** try it. Open any check-in on Explorer and compare its `proof_hash` with the receipt, or tap "Audit the Keeper" in the app.
- **Solana Mobile:** help getting through dApp Store review, and Seeker devices to test the Genesis badge on mainnet.
- **ElevenLabs:** a plan that unlocks the custom Keeper voice and the "Ask the Keeper" agent.
- **Everyone:** swear an Oath with three friends for 7 days and tell us where the Keeper got it wrong.

**Speaker notes.** Close on the line: habit apps trust your word, crypto habit apps trust your phone, KEPT trusts neither. Then the Keeper's own line: "Swear something. I'll be watching." Point to the README for addresses, transactions and setup, and to the evidence notes for every signature.

---

## Sources

Competitor facts come from a quick web search on 2026-11-26. They are what each source says, not something we tested.

1. Lock-In README (SKR, Health Connect steps, device-signed yes/no, says it is live in the Solana dApp Store): https://github.com/serhiomaserati/lock-in
2. Fortune, "Fitness app Moonwalk that pays crypto for step tracking raises $3.4 million from Hack VC" (2024-10-24): https://fortune.com/crypto/2024/10/24/fitness-app-moonwalk-that-pays-crypto-for-step-tracking-raises-3-4-million-from-hack-vc
3. Solana Compass, Moonwalk project page (step providers, anti-cheat, missed-day money to consistent players): https://solanacompass.com/projects/moonwalk ; Seeker Summer Round 2 with Moonwalk: https://cryptobriefing.com/solana-mobile-seeker-summer-moonwalk-fitness/
4. Stakehold README (MLH Solana hackathon, Nov 2026, Devnet; SlotHashes pose, AI checks, CheckIn PDA with proof hash; survivors split the pot): https://github.com/samuelIkoli/stakehold
5. Forfeit on Launch YC ("we then manually verify on our end"): https://www.ycombinator.com/launches/IAg-forfeit-app-complete-your-habits-or-we-take-your-money
6. Forfeit on the App Store: https://apps.apple.com/us/app/id1633125787
7. stickK, Terms and Conditions of Commitment Contract (referee, recipients): https://stickk.zendesk.com/hc/en-us/articles/206119378
8. stickK on Wikipedia: https://en.wikipedia.org/wiki/StickK
9. Beeminder, "How much does Beeminder cost?": https://help.beeminder.com/article/19-how-much-does-beeminder-cost
10. Beeminder, "How much do I pledge on my goals?": https://help.beeminder.com/article/20-how-much-do-i-pledge-on-my-goals

KEPT sources in this repo: [README](../README.md) (sections "Hackathon: before/during", "Tracks", "The Keeper keeps receipts", "Devnet addresses and evidence"), [app run notes](notes/app-devnet-run-2026-11-26.md), [escrow run log](notes/e2e-devnet-sol-2026-11-26.log), [Keeper pipeline log](notes/keeper-e2e-devnet-2026-11-26.log), [money rules](DECISIONS.md) (Rules amendment 6), [hackathon plan](notes/HACKATHON_PLAN.md).
