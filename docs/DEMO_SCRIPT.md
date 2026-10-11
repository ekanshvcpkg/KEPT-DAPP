# KEPT demo script (two minutes)

For judges and live demos. Everything below runs in **Demo**: the sample account on a mock backend, wallet
and program, with no network at all (it works in airplane mode). Nothing is sent to a server or the chain;
signing screens say "Demo: the approval is simulated."

**Before you start:** install the APK, open KEPT once, and allow the camera when it asks. If the app was
used before, go to Profile › Settings › **Restart demo** for the starting state.

| Time | Do | Say |
|---|---|---|
| 0:00 | Open KEPT. Tap **Get started** › **Try the demo** › **Looks like me**. | "KEPT is a habit bet with your friends. You swear an Oath, stake SKR, and prove each habit every day with one photo." |
| 0:15 | On **Today**, point at the Iron Week card: Day 3/7, HP 90, "Photo 1 done", the countdown. | "Four friends, 1,000 SKR each. The bar is the Oath's HP: every miss costs it 20, every day heals 10. At zero the Oath breaks and everyone loses." |
| 0:25 | Swipe the card sideways once, then back. | "Everything due today is one stack." |
| 0:30 | Tap **Take photo 2**. Point the camera anywhere; tap the shutter. | "The app asks for an object and a hand sign, so you can't reuse an old photo. The check runs on the server; in Demo it's simulated." |
| 0:40 | **Day 3 kept.** Tap **Nudge** next to Arjun, then **Done**. | "Arjun hasn't proved yet. If he misses, his stake goes to the people who kept." |
| 0:50 | Tap the green **1,054 SKR ready to claim** banner › **Sign & claim** › **Done**. | "Hydra 14 is over. Arjun missed twice, so I won 54 SKR from him." |
| 1:05 | Profile tab › gear icon › scroll to **Skip to tomorrow**. Tap it. | "Let's jump a day. I kept day 3; Arjun didn't, and Dev's photo is still waiting for a group vote." |
| 1:15 | The **recap** sheet opens: who missed, what moved. Tap **Got it**; Iron Week is now on Day 4 with HP 60 (two misses: −40, then +10). | "Misses cost HP and stake. The keepers got paid. That's the whole loop: swear, prove, settle." |
| 1:30 | Oaths tab › **Guitar Days** (broken) › **Rematch · win back 716** › **Join Rematch** › **Start the Rematch**. | "When an Oath breaks, half of what you lost is held. Keep every day of a Rematch and you win it back." |
| 1:45 | Bounties tab: scroll the list. | "Bounties are free public challenges, funded by a brand. Last one standing splits the pool." |
| 1:55 | Profile tab: the **kept rate** ring. | "Your kept rate is your public trust score." |

**If something goes off script:** the system back button never walks into a finished flow; **Restart demo**
puts the sample account back; **Exit demo** returns to the start, where **Use my wallet** begins the real
(Live) app on Devnet.

**Known Demo limits** (mock behaviour, not bugs in the script):
- Accepting Riya's Dawn Run invite works, but in Demo no one ever presses Start, so it stays waiting.
- Cards say "before midnight"; the Demo's days end at fixed seeded times (the countdown is the real one).
- Group reviews are decided by the other (simulated) members only after a moment, while you're looking at
  them. One left undecided when you skip a day counts as a miss.
