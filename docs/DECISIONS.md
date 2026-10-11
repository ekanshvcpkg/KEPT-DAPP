# KEPT: Decisions and assumptions

Every open decision from `design/rules.md`, plus everything else I found ambiguous, with the assumption I'll build with.
**Status:** `DECIDED` = answered by the product owner (2026-10-09) · `ACCEPTED` = my assumption, accepted by the product owner on 2026-10-09 · `ASSUMED` = made during a build phase, not yet reviewed · `ASK` = still open. Where the build differs from the design, it's also in `BACKEND_GAPS.md`.

All six questions were answered on 2026-10-09 (D-6, D-9, D-10, D-14, D-16, D-24), and every other assumption was accepted. Phase 2 added D-35 to D-42 (section E), Phase 3 added D-43 to D-52 (section F) Phase 4 added D-53 to D-63 (section G) and Phase 4.5 added D-64 to D-69 (section H) for review. D-52 and D-60 (new copy) and D-55 (the design's broken example) need your OK.

## Rules amendments (owner-approved, 2026-10-09)
`design/` is read-only in this repo (CLAUDE.md), so these amendments to `design/rules.md` live here. They override rules.md where they conflict, and `packages/engine` implements them.
1. **Day boundary (rules.md §1 "Day", open decision 6):** days run midnight to midnight in the **creator's time zone, fixed at creation**. Starting an Oath doesn't start day 1 straight away: **day 1 begins at the first midnight after Start.** Between Start and that midnight the Oath is started but waiting, and no proof is accepted.
2. **Breaking day (rules.md §2–3):** on the day HP reaches 0 there's **no heal, no keeper payout and no fee**. The whole remaining pot (every balance, including that day's miss costs) splits in two: **50 % is held for the Rematch**, and **50 % goes to the KEPT treasury**. Held money that isn't recovered is also released to the treasury. Copy can still say the pot is "lost" or "burned".
3. **Rematch recovery (rules.md §4):** each member who keeps every day of a Rematch that doesn't break gets back **50 % of their own balance at the moment of the break** (exactly the amount held for them).
4. **Claim and results numbers:** J1, L1–L6 and D4 show **what the chain will actually pay**. Engine numbers appear only on the live Oath views (B1, D2, B5), labelled as estimates.
5. **Oath names:** generated from object + length (e.g. "Iron Week"). The creator can **rename** while the Oath is Open.

## Copy additions (owner-approved)
These strings aren't in `design/copy.json`. They go in `frontend/src/copy/additions.json`, which `t()` reads alongside copy.json. Each one is listed here and nowhere else:
- `"Starts tonight at midnight"`: D1 / D2 / B1 state between Start and day 1 (amendment 1).
- `"Win back half of what you had left."`: R1 Rematch offer (amendment 3).
- `additions.core.*`: Phase 3 strings for cases the design only shows one sample of (D-52). **Please review.**
- `additions.placeholder.*`: dev-only note on screens not built yet (D-36). Every screen is built now, so only unknown ids would show it.
- `additions.bounty.*`, `additions.wallet.*`, `additions.profile.privateOaths`: Phase 4 strings (D-60). **Please review.**
- `additions.deck.*`: Today's card stack pager and hint (D-85): "Swipe for your next one", "2 / 5", Next / Previous card. **Please review.**
- Rename: creator action on D1 (sheet title, field label, save button), plus the generated-name word table (D-16). Exact wording to be proposed in Phase 3 for your review.

---

## A. Open decisions listed in rules.md

| # | Question | Build with | Status |
|---|---|---|---|
| D-1 | Solo miss damage, and where a solo member's lost SKR goes (there are no keepers) | **−35 HP per solo miss.** Lost SKR goes to the **KEPT treasury** (D-2), with no separate fee (there's no distribution). The engine reports it per day as `toTreasury`. | ACCEPTED |
| D-2 | Broken-pot destination | **Decided via D-10:** 50 % of the remaining pot is held for the Rematch, 50 % goes to the **KEPT treasury**, and unrecovered held money is also released to the treasury. The copy keeps saying "lost" / "burned". | DECIDED |
| D-3 | A miss that costs more than the remaining balance | **Capped at the remaining balance.** The member's balance floors at 0, and they can keep proving. | ACCEPTED |
| D-4 | Rounding | Integer math in base units (SKR = **6 decimals**, `scripts/v4-setup.ts:31`), `bigint` everywhere. Miss cost `floor(stake·3^k / (days·2^k))`. Fee `floor(lost·10%)`. Each keeper's share `floor(pool·w_i/Σw)`. **All dust goes to the fee.** Checked by hand on the worked example: A 1,468,750,000 · B 779,166,667 · C 1,468,750,000 · D 166,666,667 · fee 116,666,666 → sum exactly 4,000,000,000; displayed at 2 dp it matches rules.md. | ACCEPTED |
| D-5 | Heal on a day someone missed | **+10 every day after damage**, capped at 100 (but see D-10: no heal if the damage reached 0). | ACCEPTED |
| D-6 | **Day boundary.** rules.md says local midnight; the program uses 24 h windows from the moment of Start (`lib.rs:137-140`) and ignores the stored time zone. | **Decided:** midnight to midnight in the creator's time zone (fixed at creation); **day 1 starts at the first midnight after Start** (new copy "Starts tonight at midnight"). The app shows `dayEndsAt` / `secondsToReset` from the API and never computes days on the device. The program change is BACKEND_GAPS P0-4. | DECIDED |
| D-7 | Deadline reminder threshold | **2 hours** (B4, push). Already what the backend does (`v4.ts:286`). | ACCEPTED |
| D-8 | Daily recap | Shown **once after the day ends**, the first time the app opens that day (stored per device). | ACCEPTED |

## B. Money and rules, not covered by rules.md

| # | Question | Build with | Status |
|---|---|---|---|
| D-9 | **Rematch recovery formula.** "50 % of what they lost in the original" vs. funding "half of each member's lost money is held". When an Oath breaks, everyone's final balance is 0, so "what they lost" is ambiguous, and the literal reading (50 % of the stake) can need more than was held. | **Decided:** recovery_i = held_i = 50 % of member i's balance at the moment of the break. Solvent by construction. R1 copy: "Win back half of what you had left." | DECIDED |
| D-10 | **The breaking day.** If damage takes HP to 0, is there a heal, a distribution or a fee that day? | **Decided.** Order per day: misses → miss costs → damage → **if HP ≤ 0: break**: no heal, no keeper payout, no fee. The remaining pot (every balance, including that day's miss costs) splits 50 % held for the Rematch (per member, D-9) and 50 % to the KEPT treasury. Otherwise: fee → distribution → heal. | DECIDED |
| D-11 | Max members | **4**, matching the program (`state.rs:3`) and D1's four seats. | ACCEPTED |
| D-12 | Kept rate formula (rules.md §7 gives only the properties) | Over every day outcome (Oaths + Bounties) with weight `0.97^ageInDays`; each clean finish adds 2 kept pseudo-days; prior of 5 pseudo-days at 80 %. `rate = (Σw·kept + 4) / (Σw + 5)`. Shows **"New"** under 10 real days, else `"92% · 64 days"` (64 = real days counted). Display only. | ACCEPTED |
| D-13 | Odds (display only, §8) | `p = keptRate`, +0.10 if photo 1 is in today, −0.15 if < 2 h left and nothing is in, clamped to [0.05, 0.95]. Hidden for members who have kept today. `p ≥ .5` → `"<Name> 1-to-<round(p/(1−p))>"` (tone `g`); `p < .5` → `"<Name> <round((1−p)/p)>-to-1 to miss"` (tone `ora`); in review → `"<Name> in review"` (tone `vio`). | ACCEPTED |
| D-14 | **Which numbers J1/L1/L2/D4 show while the program still settles all-or-nothing** (BACKEND_GAPS P0-6) | Live balances on D2/B1 are **engine estimates** (the design already labels them "live balance"). For settled real Oaths, J1 and the results screens show **what the chain will actually pay** (`member.payout`), with the breakdown derived from it, never an engine number that won't be paid. Mock mode uses the engine everywhere, but still labels live numbers as estimates. | DECIDED |
| D-15 | A day where **nobody** keeps (all members miss) | The day's lost money goes to the KEPT treasury (no keepers to pay); no separate fee. | ACCEPTED |
| D-19 | Bounty pool split | Survivors split equally (`floor`, dust to the fee). No survivors: the pool returns to the creator, fee not refunded. Mock only (no program support). | ACCEPTED |

## C. Product and UI ambiguities

| # | Question | Build with | Status |
|---|---|---|---|
| D-16 | **Oath names.** Every screen shows a name ("Iron Week", "Hydra 14", "Hydrate Week"), but C1–C6 never ask for one. | Generate `<object word> <length>`, where object word = dumbbell **Iron**, book **Page**, water bottle **Hydrate**, guitar **Riff**, running shoe **Stride**, plant **Green**, skipping rope **Skip**, yoga mat **Flow**, and length 7 → **Week**, 3 / 14 → the number (e.g. "Iron Week", "Page 14"). The words go in `copy/templates.json` (D-17), not in code. **Decided:** generated names, plus a **Rename** action for the creator while the Oath is Open. Stored in `OathDetails` once the backend has a field (BACKEND_GAPS P1-7); kept on the device until then. | DECIDED |
| D-17 | copy.json contains sample values ("9h 18m left"), not placeholders | `frontend/src/copy/templates.json` maps the data-bearing keys to templates. A test renders every template with the sample data and must reproduce copy.json **exactly**, so templates can't drift. `t()` reads copy.json for everything else. | ACCEPTED |
| D-18 | Non-Seekers (A3·no "Solo Oaths only") | They get the full app. Group create (C4 "Group" option), Join (E1) and Bounty join show the designed not-eligible states (disabled option, E3·elig, H2·no). | ACCEPTED |
| D-25 | A2 lists Seeker Wallet / Phantom / Solflare | MWA lets Android choose the wallet. Every row opens the same MWA authorize; the rows describe options, they aren't separate integrations. | ACCEPTED |
| D-26 | Notifications screen M1 (lock-screen mock) | Not a real screen. It's our push content and channel spec; the Gallery shows it for review. | ACCEPTED |
| D-27 | Bounty requirement "token held" | Mock only: any SPL mint address plus a minimum amount, checked against the user's token accounts client-side. **Phase 4:** K4's switch is shown but there's no mint picker yet, so new Bounties go out with no token requirement. | ACCEPTED |
| D-28 | HoldToConfirm | **Not built** (components.md marks it optional; stakes confirm with the wallet signature). | ACCEPTED |
| D-29 | "Results shown once" (L screens) | Per device, keyed `oathId:outcome` in AsyncStorage; D3/D4 always show the outcome after that. | ACCEPTED |

## D. Engineering

| # | Question | Build with | Status |
|---|---|---|---|
| D-20 | Group-only Genesis gating isn't enforced on chain | Accept on Devnet. The app and the backend gate it; recorded in BACKEND_GAPS P0-8. | ACCEPTED |
| D-21 | Devnet "Add SKR" and swap | W2 "Add SKR" = the backend faucet (single-use today; the button hides after use). W3 swap = **mock** on Devnet. | ACCEPTED |
| D-22 | Android package and scheme | Package **`app.kept.mobile`** (already listed in `backend/assetlinks.json`, so it looks like the intended ID), scheme `kept`. The harness (`com.kept.backendtest`) can stay installed side by side. | ACCEPTED |
| D-23 | Real proof before the backend checks photos | Dev builds in `http` proof mode send photo 2 with the target as the "detection" (the same thing the harness does). Photo 1 is mocked (the backend has no step 1). Release builds keep proof on the mock. Clearly marked in the Dev menu. | ACCEPTED |
| D-24 | **Rust / Solana / Anchor aren't installed on this machine** | Phase 0 moves the program, but its build and its LiteSVM + Rust tests can't run here. **Decided: install.** Installed 2026-10-09: Rust stable (rustup, minimal profile), Solana CLI (Agave stable, from release.anza.xyz) + Homebrew `libusb`, and `anchor-cli` 1.2.0 built from the official repo tag (`cargo install --git https://github.com/solana-foundation/anchor --tag v1.2.0`). Not `avm`: the crate named `avm` on crates.io is an unrelated project. | DECIDED |
| D-30 | Solo Oaths on the real program (stake must be 0 today) | Live creates solo Oaths on chain with stake 0 (BACKEND_GAPS P0-7); Demo keeps the designed flow with a stake on the mock. (The old `hybrid` rule, solo on the mock, went with the build-time API mode, D-80.) | ACCEPTED |
| D-31 | Cancelled Oaths need a per-member claim (BACKEND_GAPS P1-4) | After a cancel, members see a claim row for the refund in J1; the creator's D1·xs → D0 also triggers their own claim. | ACCEPTED |
| D-32 | Reanimated version | v4 (what SDK 57 ships). motion.md's APIs are unchanged. | ACCEPTED |
| D-33 | The Keeper character | Phases 1–4 use the supplied PNG busts and poses (`assets/keeper/png`). Phase 5 ports the parametric rig from `reference/Keeper.dc.html` to `react-native-svg`. **Updated 2026-10-10:** no screen ever used the PNG fallback, so it was removed (it shipped 4.8 MB of images in the APK); Reduce Motion holds the rig's still pose. The PNGs stay in `design/assets/keeper/png`. | ACCEPTED |
| D-34 | MWA 3.0 vs 2.3 | Start on 3.0 (latest, peer `@solana/web3.js ^1.99`); fall back to 2.3 if the Seeker wallet misbehaves. | ACCEPTED |

## E. Phase 2 (navigation shell, mock API, sign-in)
New assumptions made while building Phase 2. None touches money logic; all are easy to change.

| # | Question | Build with | Status |
|---|---|---|---|
| D-35 | Where the DEVNET badge sits on a real phone (components.md: "keep the badge as an overlay row under" the real status bar) | A 24 dp row under the system status bar on every screen, badge on the left. Long-press opens the Dev menu in development builds. | ASSUMED |
| D-36 | Unbuilt screens | Every one of the 116 ids is registered. Unbuilt ones show their id, name and a row per screen they lead to (from flows.md), so the full map can be walked on a phone. Copy for that note is in `additions.placeholder` (dev-only). | ASSUMED |
| D-37 | A `kept://join/<code>` link while signed in | Opens E1 with the code directly on top of the current stack. While signed out the code is kept and the `cont:` rule opens E1 after A4 (flows.md). | ASSUMED |
| D-38 | Sign-in round trips | Two wallet hand-offs like the harness: connect (to learn the address the nonce is for), then sign. Silent re-authorization makes the second one a single approval. Folding both into one session would need the nonce fetched while the wallet is in front, which the harness found unreliable on Android. | ASSUMED |
| D-39 | Errors on A2·s other than a declined signature or no network | Back to A2 with a toast carrying the backend's message (there's no designed screen for e.g. a 500 during sign-in). | ASSUMED |
| D-40 | The avatar picked on A4 | Saved on the device (session store) and in the mock profile until profiles exist (BACKEND_GAPS P1-9). | ASSUMED |
| D-41 | Mock wallet | The Dev menu can swap MWA for a mock wallet (for emulators with no wallet app). It only pairs with mock auth: the real backend rejects its signature. | ASSUMED |
| D-42 | ESLint version | ESLint 9 in `frontend`: `eslint-config-expo` 57 crashes on ESLint 10. | ASSUMED |

## F. Phase 3 (core loop)
| # | Question | Build with | Status |
|---|---|---|---|
| D-43 | Day boundary on **real** Oaths before the program change (P0-4) | Real Oaths follow the program as it is: day 1 at Start, 24 h windows from `start_ts` (otherwise the proof route rejects check-ins). D1·go says "Day 1 begins now." for real Oaths and "Starts tonight at midnight." for mock ones. | ASSUMED |
| D-44 | Which Oath screen a card opens | Cards and rows open the screen for the Oath's state: D1 / D1·m while Open, D2 while running (including waiting for day 1 and "settling"), D3 broken, D4 ended or cancelled. | ASSUMED |
| D-45 | Today with several Oaths | B4 wins when any unproved Oath is under the deadline; B2 when every Oath today is kept and nothing is claimable; B3 with no Oaths and nothing to claim; otherwise B1. The main card is the most urgent group Oath; the rest are rows. | ASSUMED |
| D-46 | "Kept {time}" (B1 float, B2 rows) | No proof times exist yet (P0-2), so the float reads "Riya kept" and rows say "kept". | ASSUMED |
| D-47 | Nudges | Only members with nothing in today; someone in group review isn't nudged. Real Oaths call `POST /api/nudges`; mock Oaths only show the toast. | ASSUMED |
| D-48 | Streak chips (B2, F5, L4) | Left out until the backend has streaks (P1-16). Kept rate shows "New" for members without data. | ASSUMED |
| D-49 | Keeper lines | Static lines from `copy.keeper.byScreen`, even where they name prototype people ("Arjun"). Data-aware lines come with the Keeper work in Phase 5. | ASSUMED |
| D-50 | Results "shown once" | Results open automatically from Today or Oaths the first time a settled or broken Oath is seen (per device, D-29). Closing goes to D3/D4. | ASSUMED |
| D-51 | The settle fallback | When a real Oath's last day is over and it isn't settled, D2 shows "The last day is over" with a **Settle now** button (permissionless `settle_oath`). | ASSUMED |
| D-52 | New copy for cases the design shows only one sample of | `additions.core.*`: neutral D4 sub ("{names} missed some days. Their lost SKR went to everyone who kept."), "Everyone kept every day.", cancel when alone, "SKR · down {n}", settling title/sub, "Settle now", "Day 1 starts in {time}", lower-case names of the two backend-only gestures, list words. | CONFIRMED (owner, 2026-10-10) |

## G. Phase 4 (Rematch, group review, Bounties, profiles, inbox, wallet)
Everything here runs on the mock until the backend lands the matching BACKEND_GAPS item.

| # | Question | Build with | Status |
|---|---|---|---|
| D-53 | How the app models a Rematch and a Bounty entry | Both are ordinary Oaths in the app. A Rematch has `rematchOf` (the broken Oath) and `recovery` (wallet → held amount). A Bounty entry is a stake-0 solo Oath with `bountyId`. Proof, the grid, D2 and claims are the same screens, and the engine computes the numbers. | ASSUMED |
| D-54 | Group review rules | Voters are the other members. A majority of them approves; it's rejected once a majority rejects or everyone has voted without a majority, so a tie rejects. After 48 h with no decision it expires and counts as a miss. On the mock, simulated members vote about 20 s after the request, so G2 → G3 can be seen. | ASSUMED |
| D-55 | **The design's broken example can't reach 0 HP.** "Dev missed day 5, Arjun day 6" with four members never empties the bar, because each day heals +10 after −20 per miss. | The `broken` scenario uses Arjun missing days 2, 4, 6 and Dev days 2, 4, 5, 6, so Guitar Days breaks on day 6 as the design says. This is fixture data only; the rules are unchanged. **Please confirm** the design example just needs different numbers. | ASSUMED |
| D-56 | Where inbox items lead | invite → E2 (Accept marks it done; Decline marks it done and shows "Invite declined") · review → G1 · claim → J1 · rematch / broken → R1 · nudge / deadline → D2 · recap → B5 · started → H3 · new Bounty → H2. The bell count is items that need you and aren't done. "Mark all read" marks the NEW section done. | ASSUMED |
| D-57 | Number words in copy ("Seven days kept", "Three misses") | Shown as digits ("7 days kept"). Words would need a number-to-word table for each length. | ASSUMED |
| D-58 | I2·p "Arjun keeps **his** Oaths private" | The app can't know anyone's pronouns, so it says "{name} keeps **their** Oaths private" (`additions.profile.privateOaths`). | ASSUMED |
| D-59 | Swap quote on Devnet (W3) | Mock: 1 SOL ≈ 9,900 SKR, network fee 0.000005 SOL, amounts 0.1 / 0.25 / 0.5 / 1 SOL, starting on 0.5 like the design. Not enough SOL opens M3. | ASSUMED |
| D-60 | Copy for cases the design shows one sample of | `additions.bounty.*` (no Bounties joined, unverified creator, joins closed, no stats yet, cover upload later, no requirements, live until day 1), `additions.wallet.*` (faucet already used, "SKR available" while the price loads, "{amount} SKR · 1 Oath"), `additions.profile.privateOaths` (D-58). | ASSUMED |
| D-61 | Things the backend can't store yet | Settings (I4 notifications, I7 visibility, socials, follows) are kept on the device. The K3 cover upload shows a "coming later" toast and the brand gradient. G1 shows the challenge frame where the photo goes. | ASSUMED |
| D-62 | W1 totals | "Locked in Oaths" is my balance across Open and running Oaths (not Rematches or Bounties); "In a Rematch" is shown only when there is one. Both come from the engine views, not the API. | ASSUMED |
| D-63 | M1 | A static screen with the design's push texts, for checking how pushes read. Real pushes use expo-notifications once the backend sends them (P1-11). | ASSUMED |

## H. Phase 4.5 (device shakedown)
| # | Question | Build with | Status |
|---|---|---|---|
| D-64 | R4·lost "Fee −14": the fee comes out of the money lost (rules.md §3), so a member isn't charged a fee on top | R4 / R4·lost show Fee 0; the lost amount already includes it. | ASSUMED |
| D-65 | The design's solo examples can't happen: L4·m "HP at the end 65" (14 days of +10 heal end at 100) and L4·b "Three misses at −35" (three can't reach 0, like D-55) | Fixtures use the engine's numbers: HP 100 at the end, four misses for the break; the design just needs different samples. | CONFIRMED (owner, 2026-10-10) |
| D-66 | Solo Oaths and Start | No Start step for solo (flows.md): the app starts it right after create. On chain that's a second approval until BACKEND_GAPS P1-18. | ASSUMED |
| D-67 | "Starts tonight at midnight" on a Bounty that opens for days | "Day 1 starts Saturday" when day 1 isn't the coming midnight (`additions.waiting.startsOn`). | ASSUMED |
| D-68 | Invite link shown on C8 / D1 | `kept://join/<code>` until the web link exists (BACKEND_GAPS P1-19); the design shows `kept.app/o/<code>`. | ASSUMED |
| D-69 | Per-screen atmosphere | Tone wash, ambient orbs, beam and decor icons generated from screens.md and the prototype (`scripts/gen-layout.mjs` → `app/layout.gen.json`), as are hero offsets and Keeper size/side/pose. | ASSUMED |

## I. Fidelity pass (2026-10-09)
Design.pdf is the final visual reference and the prototype the reference for behaviour (notes/FIDELITY_PASS.md). Where they and the written spec disagree, the build follows the PDF and the prototype; each conflict is listed here.

### Keeper placement (owner report 2)
Read from Design.pdf screen by screen and checked against the prototype's rule (`renderVals`: a `kp` block smaller than 120 dp leaves the content and becomes the KeeperNote behind the mark; sheets keep theirs). **Inline** = the character is drawn in the layout; **mark** = KeeperMark + KeeperNote only; **—** = no Keeper line.

| Screen | Keeper | Screen | Keeper | Screen | Keeper |
|---|---|---|---|---|---|
| A0 | — | D1·go | — | H5 | — |
| A1 | inline (196, wave, coin) | D2 | mark (whisper) | H6 | — |
| A2 | — | D2·low | mark (scythe) | H7 | — |
| A2·s | — | D3 | — | I1 | mark (3 lines, ledger) |
| A2·e | inline (130, shrug) | D4 | — | I2, I2·me, I2·p | — |
| A3, A3·no | — | D5 | — | I3, I4, I5, I7, I8 | — |
| A4 | mark (point) | E1, E2, E2·s | — | I9 | mark (point) |
| B1 | mark (3 lines) | E3·code/late/in/elig/skr | inline (130, shrug) | J1, J1·p, J1·f | — |
| B2 | inline (150, thumbs, sack) | R1 | inline (150, flip) | J1·ok | inline (170, jump, sack) |
| B3 | inline (120, cup) | R2, R3 | — | K1–K5·ok | — |
| B4 | mark (tap) | R·act | mark (whisper) | L1 | inline (170, jump, sack) |
| B5 (sheet) | inline (96, ledger) | R4, R4·lost | — | L2 | inline (140, coin) |
| + (sheet) | — | F1·perm, F1 | — | L3 | inline (150, scythe) |
| C1 | mark (3 lines) | F2 | mark (lens) | L4 | inline (140, thumbs, ledger) |
| C2–C7, C7·ok, C7·fail, C8 | — | F2a | mark (shrug) | L4·m | inline (130) |
| C7·no | inline (120, shrug) | F2b | inline (130, cup) | L4·b | inline (130, scythe) |
| D0 | mark (3 lines, whisper) | F2c, F3, F4 | — | L5 | — |
| D1, D1·m | — | F4·chk | mark (lens) | L6 | inline (170, jump, sack) |
| D1·x (sheet) | — | F4a | inline (130) | M1 | — |
| D1·xs | — | F4a·g, F5 | F5: inline (150, thumbs) | M2 | inline (130, cup) |
| G1 | mark (lens) | G2, G3 | — | M3 (sheet) | inline (90) |
| G3·no | inline (120) | H1, H1·j | — | M4 (sheet) | — |
| H1·c | mark (sack) | H2, H2·no | — | N1 | mark (3 lines) |
| H3 | mark (whisper) | H4 | inline (130) | W1 | mark (2 lines, sack) |
| W2 (sheet), W3, W3·s, W3·ok, W4 | — | | | | |

Tab screens with no line of their own (B2, B3, H1, H1·j: none in the header) open the tab's idle line (`copy.keeper.idle.<tab>`) from the mark, with no dot.

### Conflicts between the PDF / prototype and the written spec
| # | Conflict | Build with | Status |
|---|---|---|---|
| D-70 | Design.pdf / prototype draw sheet buttons ~20 dp high (B5, M3, M4, D1·x): the prototype's sheet column squeezes them. components.md › Button: 54 dp. | 54 dp buttons (a rendering artefact, not a design choice), with the icons the PDF shows. | ASSUMED |
| D-71 | The PDF's DEVNET badge sits in the status bar next to the clock; the app keeps the real Android status bar (components.md) with the badge in a 24 dp row under it (D-35). | Unchanged: bars sit 24 dp lower than the PDF on devnet builds; mainnet builds have no row. | ASSUMED |
| D-72 | components.md › KeeperNote says flow screens auto-open the note; on the PDF the flow screens with a mark-only Keeper (C1, D2, F2, …) show the mark and no note (the PDF is a still at rest). | The behaviour from components.md / the prototype: drop on entry, close at 4.8 s, then the mark. | ASSUMED |
| D-73 | The prototype's B1 lists the Bounty entry as a second card (stack + Prove); screens.md lists it as a row. | The PDF: a second card. | ASSUMED |
| D-74 | flows.md: moments have "no back gesture until settled" but doesn't define settled. The first definition (the last value pill has risen, 1.6 s) went with the pills (D-78). | Settled = where the screen's own choreography ends: the last content block and the last pinned action have entered (block i at 40 + 65·i ms, pinned at 200 + 65·i ms, 500 ms each) and the money count-up has landed (900 ms), whichever is last (`components/layout/moment.ts`). Before that hardware back does nothing; after it, back works as on any screen. With Reduce Motion nothing animates, so back works at once. | CONFIRMED (owner, 2026-10-10; redefined after D-78) |
| D-75 | Sheets close with a 300 ms slide (components.md › BottomSheet); the spec doesn't say whether a row that opens a flow (+ → C1, W2 → W3) waits for it. | Back / scrim / swipe / the sheet's own button slide the sheet down first; a row that replaces the sheet with a flow goes at once (the flow slides in over it). | CONFIRMED (owner, 2026-10-10) |
| D-76 | I1's "Make it yours" banner: screens.md doesn't say when it hides; the prototype hides it after it (or Edit) is tapped once (`pt1`). | The prototype: shown until the banner or Edit is opened once (kept on the device). | CONFIRMED (owner, 2026-10-10) |
| D-77 | Design.pdf draws C1 with the input focused (lime ring + caret). Auto-focusing on entry opens the keyboard, which covers the suggestion chips the screen is built around. | Not auto-focused; the ring and caret appear on tap. | CONFIRMED (owner, 2026-10-10) |
| D-78 | motion.md §4/§5/§7 (money, day kept, payout) and components.md › FX layer call for a coin burst, falling coins and floating value pills ("+54 SKR"). | **Owner decision (2026-10-10): coins and value pills removed from the whole app.** Moments keep their haptics and (on broken Oaths) embers; the per-pill haptic went with the pills. The Keeper's coin prop and the floating sack orbs are not part of the splash and stay. | CONFIRMED |
| D-79 | P-6: Reanimated 4.5.1 (Expo SDK 57) on RN ≥ 0.86 applies animated props through `MountingManager.updatePropsSynchronously` by reflection (its TODO(#9681) workaround) and re-sends every pending entry on each event. For a view that no longer exists (or doesn't yet) the call throws, and `synchronouslyUpdateUIProps` logs it with a full stack trace on the UI thread: tens of thousands of lines per perf run and one ANR. Patch releases 4.5.2–4.5.5 don't change this. | **Owner-approved patch (2026-10-10):** `patches/react-native-reanimated@4.5.1.patch`, applied by pnpm's built-in patching (`patchedDependencies` in pnpm-workspace.yaml; no patch-package, no postinstall). It only touches `NativeProxy.kt › synchronouslyUpdateUIProps`: it checks `MountingManager.getViewExists(tag)` (looked up by reflection like `updatePropsSynchronously`) and skips missing views before the call, so no exception is thrown; anything that still throws is logged as one short line per batch without a stack trace. react-native-reanimated stays pinned at exactly 4.5.1 (a version change invalidates the patch). **Remove the patch when Reanimated resolves TODO(#9681)** (RN exposes a non-seeding synchronous update and Reanimated drops the reflective path). | CONFIRMED |
| D-80 | Live and Demo modes (owner, 2026-10-10: one release APK, the user picks at first launch). The design has no mode picker. | A1 "Get started" opens a new sheet route **A1·m** ("How do you want to start?": Try the demo / Use my wallet, one line each; copy in `additions.mode`). Demo: A1 → A1·m → A4 → Tabs, signed in on the sample account with no wallet (A2, A2·s, A3 skipped); a DEMO badge sits next to DEVNET; signing screens say the approval is simulated. Live: A1 → A1·m → A2 → … as before. "I have an invite" and `kept://join` links always go to Live (leaving Demo wipes it). Profile › Settings: Demo has Restart demo / Exit demo (wipe, back to A1); Live's "Switch wallet" signs out and returns to A1, where the mode is picked again. Each mode keeps its own saved data. The route is an amendment to flows.md (`src/app/routes.amend.json`), checked by the routes test. | ASSUMED (please confirm the copy) |
| D-81 | The KeeperNote never opens by itself (owner, 2026-10-10: it covered the screen on entry). Overrides components.md's flow-screen auto-drop: on every screen an unread line shows the mark's lime dot and knock until opened. A tap anywhere outside an open note closes it (a transparent backdrop under the note; the tap only closes). Flow screens still close an opened note after 4.8 s. | ACCEPTED (owner) |
| D-82 | Speech-bubble tail (owner, 2026-10-10: the design was flawed). The bubble's square corner always points at the Keeper: a centred Keeper's bubble sits to his left, so its tail is bottom-right (the design had bottom-left). Left / right placements were already right. | ACCEPTED (owner) |
| D-83 | Screen skeletons (owner, 2026-10-10: pushes lagged and screens flashed black; not in the design). The native stack starts a push's slide only after the new screen's first commit, and building a whole screen first held pushes back 120–380 ms on the emulator (3–4× on a phone). `Screen` now commits the bar, ambient light and a skeleton (title lines + three cards in the app's sizes, `ScreenSkeleton`) at once and mounts the content when the slide ends (`lib/screenReady`; tab screens one frame later; the first screen of a stack at once), then fades the skeleton out over the arriving content. `Skeleton` sweeps a light band left → right on the UI thread (one clock per screen) instead of the design's .5 ↔ 1 pulse. | ACCEPTED (owner) |
| D-84 | Frame cost on Android (owner, 2026-10-10: "make it snappy"). Android redraws the whole window on every frame anything moves. (1) Black blurred drop shadows (`BlurMaskFilter` per frame) are left out (`cheapShadow`): on Today they took frames from 16 to 38 ms and barely show on #131313; insets, solid rings and lime glows stay. The Keeper's floor shadow is a radial gradient instead of a `blur` filter. (2) Ambient loops (breath, float, glow, beat, shine, orbs, beam, embers, the + glow) play for ~10 s (`LOOP_BUDGET_MS`) each time their screen gains focus, then rest; spinners, the signing ping and skeletons run while shown. Before, the + glow alone kept every tab redrawing forever. (3) The Keeper rig advances at 30 fps. Measured on the emulator: Bounties scroll janky frames 8.8 % → 0.2 %, Today at rest 175 frames / 4 s → 4. | ACCEPTED (owner) |
| D-85 | Today's cards as a swipeable stack (owner, 2026-10-10: "with 10 Oaths Today would be cluttered"). Everything still due today (Oaths, then pending Bounties as their small cards; a group Oath first, then by deadline) is one `CardDeck`: drag the top card left or right, past a third of the width or with a flick it flies off and goes to the back while the next grows into its place; otherwise it springs back. The next two cards peek above it (the design's stacked backs, now real cards, dimmed). A pager under it (‹ dots · k / n ›) steps both ways and is how TalkBack moves through it. Until the deck is first moved, the top card nudges sideways once after ~1 s and "Swipe for your next one" shows (`settings.deckHintSeen`). Cards already kept today stay as rows. One card shows alone, with no stack. | ACCEPTED (owner; copy to review) |
| D-86 | What back goes to (owner, 2026-10-10: after creating an Oath, back walked through the whole wizard). flows.md only says signing screens are replaced. The app now rewrites the stack on every forward move (`app/history.ts`): signing, checking, outcome, moment and sheet screens never stay behind the next screen; reaching an outcome drops its flow's steps (create C1–C6, join E1/E2, proof F1/F4, Rematch R1, claim J1, Bounty K1–K5, swap W3, the open-Oath page D1 or the Rematch lobby R3 once started), except outcomes that offer a retry (rejected, failed, invalid code, not enough SOL/SKR), which keep them; creating, joining, a Rematch or a Bounty lands on home rather than the place it started from (a broken Oath, an error, a profile); a screen already in the stack (same id) is gone back to; any tab destination ("Done", "Back to Today") returns to the existing home with nothing above it. Joining a Bounty replaces its detail page. | ACCEPTED (owner) |
| D-87 | Crash safety (owner, 2026-10-10). The design has no crash screen. | A root error boundary (`app/CrashBoundary.tsx`) around the navigator: a render error, or a fatal error from outside render (press handlers, timers; routed from RN's global handler in release by `lib/crash.ts`), shows a recover screen built from existing parts (red ambient, the Keeper shocked, Title, one pinned "Try again"). Try again remounts the app, which starts from home; saved data is untouched. Unhandled promise rejections (dropped silently by Hermes in release) are logged in memory and show one toast, "That didn't work. Try again.", at most every 8 s. Development builds keep the red box. Copy in `additions.recover`. | ASSUMED (copy to review) |
| D-88 | Demo fast-forward (owner, LIVE_DEMO_PLAN Q6). The design has no time controls. | Demo only: Profile › Settings › Account gets "Skip to tomorrow" (above Restart / Exit demo). The virtual clock moves forward 24 h, so every Oath crosses exactly one day boundary (the demo's days end at seeded times, not midnight), the mock settles that day with the engine, every query refetches, the app returns to Today with the toast "It's tomorrow", and Today's B5 recap shows. Copy in `additions.mode.skip*`. | ASSUMED (copy to review) |
| D-89 | Live resilience (owner, 2026-10-10: every Live call must end on a designed state, never an endless spinner). The design has M2 (offline), M3/M4, C7·no/C7·fail and A2·e, nothing for a server error, an expired token or a missing wallet app. | **Timeouts:** API requests give up after 15 s and RPC reads after 20 s, as OFFLINE → M2 (Retry). **Retry:** queries retry twice with backoff (not offline, auth, eligibility or not-found); mutations and signatures never retry by themselves (no double spend). **Rate limits:** web3.js already backs off on a 429; one still failing is RATE_LIMITED, not "offline". **Stuck screens:** when a screen's data fails to load for good for another reason (server error, rate limit, gone), M2 opens with its own title and line ("Couldn't load this." / `additions.loadFailed`, `cause: "load"`), once per screen; its Retry only leaves when nothing is still failing. **Expired token:** a 401 on a call made with the stored token signs out, toasts "Signed out. Connect your wallet to sign in again." and resets to A1 › A2. **No wallet app:** sign-in goes back to A2 with the toast "No wallet app found. Install Phantom or Solflare, or try the demo."; on a later signing screen it is C7·fail. | ASSUMED (copy to review) |
| D-90 | Live proof requires on-device AI (owner, 2026-10-11). | Live asks permission to download the roughly 2.6 GB Gemma model plus the MediaPipe gesture model on first use. Live stays unavailable until both are installed on a supported physical 64-bit Android device. Demo remains usable without the download. The app runs both checks on the phone and sends the verdict and photo hash to the existing backend verification route. | ACCEPTED (owner) |
