# KEPT: Backend gaps (design vs. current backend)

> **Merge phase, 2026-10-10:** the section right below re-checks every gap against the current backend
> (`backend/src` at `3b5c21d`) and says what the app's **Live** mode does about each. The detailed items
> further down are the original audit; where they disagree with the merge-phase table, the table wins.

**For:** the backend / Solana program developer.
**Source of truth:** `design/rules.md` and `design/screens.md`. Where the backend differs, the backend should change unless we agree otherwise (decisions in `docs/DECISIONS.md`).
**Status:** verified against the code on 2026-10-09 (v3: updated with the product owner's decisions of 2026-10-09 and the Phase 0 move; re-checked at the end of Phase 1; updated at the end of Phase 2 (sign-in), Phase 3 (the core loop on the real program and API: create, join, start, cancel, proof, settle, claim) and Phase 4 (Rematch, group review, Bounties, profiles, inbox, wallet: all on the app's mock, with the shapes below). The short checklist is at the top. Every item below was checked by reading the file and line cited.

**Paths.** Phase 0 moved the code with `git mv` and didn't change it, so line numbers are unchanged:
`backend/src` → `backend/src` · `backend/prisma` → `backend/prisma` · `backend/scripts` → `backend/scripts` · `backend/kept-example/program` → `onchain` · `backend/kept-example/app` → `legacy/harness-app`. Short forms used below: **`v4.ts`** = `backend/src/routes/v4.ts`, **`lib.rs`** / **`state.rs`** = `onchain/programs/kept_test/src/{lib,state}.rs`, **`schema`** = `backend/prisma/schema.prisma`. Other `backend/…` paths below map the same way.

**Status labels:** **CONFIRMED** = the gap is real, nothing done · **PARTLY DONE** = some of it exists · **ALREADY DONE** = matches the design (listed at the end) · **NEW** = not in the first draft.

**Priority:** **P0** blocks the core loop (create → join → start → prove → settle → claim) or is a security/privacy problem in it. **P1** is needed for design parity. **P2** is operations, hardening and cleanup.

> **About the "newer backend" question from the first draft.** I searched all of `backend/`: there is no Gemini or other server-side vision code, no two-photo sessions, no group review, no Bounties and no profile routes. The API is 390 lines (`v4.ts`) plus auth (51) and a 18-line rules file. The program is V4 Oaths only (`lib.rs`, 400 lines). **If a newer backend exists outside this repo, push it in before work starts on these items.**

---

## Merge phase check (2026-10-10): the backend today and what Live does

Live (D-80) uses only `frontend/src/api/http/*`. Where the backend lacks something, Live hides the entry point or shows the design's empty / unavailable state. Shapes the app parses are zod schemas in `packages/shared/src/existing.ts` (current routes) and `proposed.ts` (still wanted).

| Gap | Backend now | Live today | Still needed |
|---|---|---|---|
| P0-1 / P0-2 proof | Two photos with sessions: `POST /api/proof/challenge` → `/proof/verify` (the **phone** submits a model verdict + image hash) → `/api/proof/start` → wait `minMinutes` → `/api/proof`. The server no longer looks at photos. | Fetches the real challenge (`ProofChallengeResponse`); the photo then ends on **F2b** "Check unavailable": the app has no on-device model and won't send a made-up verdict. | **Decision** (LIVE_DEMO_PLAN Q1): ship the on-device check in the app (MediaPipe + 2.6 GB Gemma, no design screens), or a server-side check. Also: the design has no screen for the `minMinutes` wait. |
| P0-3 gestures | `Thumb_Up` / `Victory` / `Open_Palm`, never the same twice in a row | Mapped 1:1 to the design's three | — (done) |
| P0-4, P0-5, P0-6 days, HP, settlement | Program: 24 h windows from Start; **rules v1** (all-or-nothing, 10 % of missed stakes) on Devnet. **Rules v2** is coded (fee on top of the stake, one 50 % slash, a buyable freeze, settle a day late) but not switched on (Config is 139 bytes). Neither has HP or 1.5^k costs. `GET /api/oaths/:oath/details` now returns `economics` (estimated payouts, missed days, on-track). | Engine numbers labelled as estimates, the chain's payout once settled (D-14). | **Decision** (Q2): which numbers Live shows. If v2 is switched on, C6 / E2 must show and check stake + fee. |
| P0-7 solo stake | Still `InvalidStake` for a solo stake > 0 | Live solo Oaths are on chain with no stake (D-30) | As before |
| P0-8 Genesis gate | `requireGenesis` covers **all of `/api`**, incl. `/api/inbox`, `/api/price` and invite previews | A non-Seeker's inbox is empty (403 mapped); price shows no ≈ $ | Move inbox, price and invite preview outside the gate (P1-13, P1-15) |
| P0-10 my Oaths | No index route | RPC member index (4 × `getProgramAccounts`) | `GET /api/me/oaths` |
| P1-1 group review | `GET /api/oaths/:oath/reviews`, `POST /api/reviews/:id`; a review starts from `POST /api/proof {review:true, photo}` after 3 failed verifies | No reviews open (they need failed on-device checks, Q1) | After Q1: votes per wallet (the route gives counts + `myVote`; G3 shows who voted) |
| P1-2 Rematch | None | Hidden (D3, L3, L4·b, N1 open the broken Oath instead) | As before |
| P1-8 / P1-16 kept rate, streak | `GET /reputation/:wallet`: `keptRate.percentage` (plain kept / total, one decimal), `streak`, `oathsKept/Broken`, `bounties` | Stats, kept rates and B2 chips from it (`ReputationResponse`) | The design's rate is recency-weighted with "New" under 10 days (Q4) |
| P1-9 profiles | `GET /identity/:wallet` only (no name, avatar, bio, socials) | My avatar from A4 on the device; others a stable avatar from the wallet and the short address; I5 activity empty | Profile routes as `Profile` in `proposed.ts` |
| P1-10 Bounties | One admin-made Bounty at a time (`/bounty/current`, join, its own proof, payouts by the job); no list, creators, categories, user funding | Q3 (owner: yes): H1 lists the current one (`api/http/bounties.ts`), shown as KEPT's own, verified, category from its object, no entry rules; join is real; my entry is a stake-0 solo Oath in the Oath list; proof ends on F2b until Q1. Create (K) and creator pages (I3) hidden | Brand, category, cover message and rules fields on the Bounty; a list route with the `Bounty` shape in `proposed.ts` |
| P1-11 inbox | `GET /api/inbox`, `PUT /api/inbox/:id`; **nothing writes inbox rows**; `type` is free text | Parsed with `InboxLiveResponse`; unknown types dropped; N1 empty state | Write rows for invites, reviews, nudges, results; constrain `type` to `InboxItem.type` |
| P1-12 swap | None (D-21) | W3 hidden in Live | As before |
| P1-14 error codes | Still `{error}` text only | Mapped by status + message | As before |

## Short version: what to add, remove and fix

The checklist for the backend developer. Each line points to the full item below (file and line, the exact request/response shape the app is coded against, and why). Ordered by what unblocks the app most. The app already runs all of this on its mock, so each item can land on its own.

**Fix (program)**
- [ ] **Day 1 at the first local midnight after Start**, not at Start (P0-4). The app's real Oaths currently follow the program's 24 h windows from Start.
- [ ] **Day-by-day settlement** with 1.5× miss costs, a 10 % fee and weighted keeper shares instead of all-or-nothing (P0-6). Test vectors: `packages/engine/test-vectors/oath-vectors.json`.
- [ ] **HP and a Broken status** with an early settle at 0 HP (P0-5).
- [ ] **Solo Oaths with a stake** (`InvalidStake` today, P0-7).
- [ ] **Cancel and leave refund in the same transaction**, plus a `leave_oath` instruction (P1-3, P1-4).
- [ ] **Claim creates the destination token account if needed** (P1-17).
- [ ] Release builds must not accept `day_seconds = 120` (P2-4).

**Fix (API)**
- [ ] **Check photos on the server** and ignore the client's `detection` (P0-1, security).
- [ ] **Three gestures only** (thumbs up, victory, open palm), different for photo 1 and photo 2 (P0-3). Today `dailyTarget` can ask for `closed_fist` / `pointing_up`, which the app has no artwork for.
- [ ] **Machine-readable error codes** on every error (P1-14). A 409 from `POST /api/proof` means three different things today.
- [ ] **`GET /api/invites/:code` returns the Oath address** (P1-15). The app recomputes it from creator + oath_id.
- [ ] **`/api/oaths/details` also registers the watch, and details / invites / watch are idempotent** (P0-9).
- [ ] **`/api/price` and the invite preview outside the Genesis gate** (P1-13, P1-15).
- [x] The identity host lists `app.kept.mobile` and its debug/release certificates; Android verifies the App Link (P2-7). Phantom still shows an identity warning; see P2-7 below.

**Add (API routes; shapes in `packages/shared/src/proposed.ts`)**
- [ ] `GET /api/me/oaths`: my Oaths index (P0-10). The app scans the program with 4 `getProgramAccounts` calls every 30 s until this exists.
- [ ] `GET /api/oaths/:oath`: facts incl. name, review mode, time zone and today's proof status per member (P0-10).
- [ ] Two-photo proof: `challenge`, `submit`, `status` (P0-2). Photo 1 lives only on the phone today.
- [ ] Group review: request, list, vote (P1-1).
- [ ] Oath name + rename (P1-7); review mode stored with the details (P1-1).
- [ ] Streak and kept rate (P1-16), profiles and activity (P1-8, P1-9).
- [ ] Rematch (P1-2), Bounties (P1-10), inbox (P1-11), balances (P0-10, optional).
- [ ] Swap quote + swap on Devnet, or confirm it stays a mock (P1-12).
- [ ] The review photo for voters (P1-1) and Bounty cover upload (P1-10): both need short-lived storage.

**Phase 4 status in the app:** every screen in groups R, G, H, K, I, N, W and M is built and runs end to end on the mock. Each item below has an "App today (Phase 4)" line with the TypeScript shape the app calls (`frontend/src/api/types.ts`). When a route lands, the app wires that Live slice to http (Live never falls back to the mock, D-80).

**Remove**
- [ ] `GET /api/photos/:oath/:day` and `/api/photos/file/:id`: members must not see each other's photos (P0-11).
- [ ] Legacy V3 surface: `migrate_keeper`, Keeper streak counters, dead V3 Rust files, V3 Prisma models (P2-5).
- [ ] Hand-written Oath decoders in the API; use the IDL coder in `packages/chain` (P2-9).

---

## P0: core loop

### P0-1. Proof is "verified" from what the client says (security) · CONFIRMED
- **Now:** `POST /api/proof` requires a `detection` object from the app (`v4.ts:140-141`) and accepts the day if its labels match today's target with confidence ≥ 0.7 (`v4.ts:154-157`). Nothing looks at the image; it's only hashed (`v4.ts:163`). The harness fabricates the detection with a debug switch (`kept-example/app/src/screens/TestHarness.tsx:68-69`), and the README says no model exists. The client-sent confidences are even stored as if they were measurements (`schema:34-37`).
- **Design:** photos are checked by AI on the server (right object, right gesture, live scene, not a screen or a printout), then discarded (rules.md §5).
- **Change:** do the check server-side and ignore any client detection. Text inside an image must not be able to steer the check (prompt injection). Return `pass | fail(reason) | unavailable(retryAfter)`.
- **App until then:** in dev builds the http proof adapter sends the target as the detection (the same thing the harness does) so check-ins can be tested on Devnet. Release builds keep proof on the mock.

### P0-2. Two-photo proof with challenges · CONFIRMED
- **Now:** one photo per member per day (`@@unique([oath, wallet, dayIndex])`, `schema:39`; `v4.ts:145`). There's no challenge, no expiry, no attempt counter.
- **Design:** photo 1 (object + gesture A) → do the activity → photo 2 (object + a different gesture B), both before the day ends, no forced wait. Challenges expire (F2c), outages show F2b with time left, and photo-2 failures are counted (F4a after 3).
- **Change:**
  - `POST /api/proof/challenge {oath|bounty, step: 1|2}` → `{challengeId, object, gesture, expiresAt}`
  - `POST /api/proof/submit {challengeId, photo}` → `{status: pass|fail|unavailable, reason?, attemptsLeft?}`
  - `GET /api/proof/status?oath=…` → `{step, photo1At?, attemptsUsed, dayEndsAt}` (for F3/B1 "Photo 1 done" and resuming)
  - record the on-chain check-in only after photo 2 passes, with a combined hash of both photos
  - store per-attempt fail counts (needed for P1-1)

- **App today (Phase 3):** photo 1 passes on the phone for real Oaths (there's no backend step) and is remembered per day in device storage; photo 2 goes to `POST /api/proof`. The app counts photo-2 failures itself (3 → F4a / F4a·g). Once the routes above exist it switches both photos to them (`frontend/src/api/http/oaths.ts › httpProof`).
### P0-3. Gestures · CONFIRMED
- **Now:** five gestures, `thumbs_up, victory, open_palm, closed_fist, pointing_up` (`v4.ts:21`), one per day picked by hash (`v4.ts:226-229`).
- **Design:** only **thumbs up, victory sign, open palm** (the gesture assets match), and photo 2 uses a different gesture from photo 1.
- **Change:** reduce to three and pick an ordered pair per (member, day). Shared list: `packages/config` `GESTURES`.

- **App today (Phase 3):** the app mirrors `dailyTarget` (`frontend/src/api/proofTarget.ts`, tested against Node's crypto) so the camera shows the right gesture before the photo is sent. For `closed_fist` / `pointing_up` it can only show text, with no gesture badge.
### P0-4. Day boundary: 24 hours from Start vs. local midnight · NEW
- **Now:** a day is `[start_ts + k·day_seconds, start_ts + (k+1)·day_seconds)` (`lib.rs:137-140`), and `start_ts` is the moment the creator presses Start (`lib.rs:116`). `tz_offset_minutes` is validated and stored (`lib.rs:53, 74`) but **never read**. The backend uses the same 24 h windows (`backend/src/v4/rules.ts:7-8`, `v4.ts:281-285`). The `local_day` helper in `day.rs` is dead V3 code. `day_seconds` can also be 120 in the default build (P2-4).
- **Design:** "Day 1 begins when the creator presses Start" (screens D1·m, D1·go), but everything else says **midnight**: "both photos before midnight", "−20 at midnight", "resets in hh:mm:ss", "Broke at midnight after day 6", the 2-hours-before-midnight reminder.
- **Decided (DECISIONS D-6, 2026-10-09):** days run **midnight to midnight in the creator's time zone**, fixed at creation. **Day 1 begins at the first midnight after Start**; between Start and that midnight the Oath is started but waiting ("Starts tonight at midnight").
- **Change (program):** in `start_oath`, set `start_ts` to the next local midnight: `(local_day(now, tz) + 1) · 86_400 − tz_offset_minutes · 60` (the dead `day.rs::local_day` already has the right maths, tested at UTC+5:30). Keep `day_seconds = 86_400`, so `record_checkin`'s window check (`lib.rs:137-140`) and `settle_oath`'s end check (`lib.rs:157-158`) become midnight-aligned without further changes, and `DayNotStarted` covers the waiting period.
- **Waiting period (decided 2026-10-09):** between Start and the first midnight, **the creator can cancel and members can leave, with full refunds**. Program change: `cancel_oath` (`lib.rs:121-130`) must also accept `Active` while `now < start_ts`, and the new `leave_oath` (P1-3) must accept the same window. The app shows a "Starts tonight at midnight" state with Cancel / Leave (mocked until the program supports it). Also stop accepting `day_seconds = 120` outside debug builds (P2-4). **DST:** a fixed offset drifts by an hour across a DST change; acceptable for 3–14 day Oaths on Devnet, revisit for mainnet.
- **Change (backend):** use the same rule in `rules.ts` and the scheduler (they read `startTs`/`daySeconds`, so they follow automatically). Expose `startsAt` (day 1 start), `dayIndex`, `dayEndsAt` and `secondsToReset` from the API so the app never computes days.

- **App today (Phase 3):** mock Oaths follow D-6 (day 1 at the next midnight; D1·go says "Starts tonight at midnight"). Real Oaths follow the program as it is (day 1 at Start, `start_ts + k·day_seconds`; D1·go says "Day 1 begins now."), because the proof route rejects anything else. Switching is one line once the program changes (`toFacts` in `frontend/src/api/http/oaths.ts`).
### P0-5. HP and the "broken" outcome · CONFIRMED
- **Now:** no HP anywhere. `OathStatus` is `Open | Active | Settled | Cancelled` (`state.rs:39`), so there's no way to break mid-Oath. Check-ins keep being accepted for the whole length, and settle only runs after the last day (`lib.rs:157-158`).
- **Design:** HP starts at 100; at the end of each day −20 per missed member (−35 solo), then +10 (max 100); **at 0 HP the Oath breaks**: check-ins stop and everyone loses their remaining balance (rules.md §2).
- **Change:** HP is deterministic from the `days_kept` bitmasks (`state.rs:33`), so it doesn't need storing. But the program needs a **Broken** status and an early settle path that proves HP reached 0 on a past day and settles at that point. The backend's daily job has to detect it, and the API must expose HP, `hpLostToday` and the break day. The engine (`packages/engine`) is the reference implementation.
- **Breaking day (decided, DECISIONS D-10):** on the day HP reaches 0 there's **no heal, no keeper payout and no fee**. The whole remaining pot (every member's balance, including that day's miss costs) splits **50 % held for the Rematch** (per member, P1-2) and **50 % to the KEPT treasury**. Held money that isn't recovered is also released to the treasury.

### P0-6. Settlement math · CONFIRMED
- **Now:** all-or-nothing. A member "succeeded" only if `days_kept == full` (`lib.rs:159-160`). `calculate_payouts` (`lib.rs:227-250`) gives failed members 0, splits their **whole** stakes equally among full keepers after the fee, and if **nobody** kept every day, refunds everyone 90 % (`lib.rs:236-239`). Members who missed one day are treated like members who missed all of them. There's also a dead branch for 16-day Oaths (`lib.rs:159`).
- **Design** (rules.md §3):
  - **Cost of a miss:** `stake / days × 1.5^k` for that member's k-th miss, capped at their remaining balance
  - **Each day:** 10 % fee from that day's lost money; 90 % to **that day's keepers**, weighted by **days kept so far, including that day**
  - balances move day by day; members **claim** at settlement
  - **broken (HP 0):** everyone loses their remaining balance
- **Required test:** 4 × 1,000 SKR, 3 days. Day 1: B and D miss. Day 2: everyone keeps. Day 3: D misses. Day patterns are **A ✓✓✓, B ✗✓✓, C ✓✓✓, D ✗✓✗**, giving A 1,468.75 · B 779.17 · C 1,468.75 · D 166.67 · fee 116.67.
  *(Correction: the first draft of this file gave B and D's patterns as ✓✗✓ / ✓✗✗. That contradicts rules.md's own table, where the day-1 misses are what produce the 333.33 losses and the day-3 weights A3:B2:C3.)*
  Shared vectors: `packages/engine/test-vectors/*.json` (created in Phase 1, in base units with 6 decimals). Please make the Rust tests read the same file.
- **Change:** replace `calculate_payouts` with a day-by-day replay of the `days_kept` bitmasks (deterministic, run once at settle or break). Integer math in base units, round each share down, put the dust into the fee (DECISIONS D-4). Destinations (decided 2026-10-09): a solo member's miss costs and a no-keepers day's losses go to the **KEPT treasury** (D-1, D-15); the breaking day follows P0-5 (D-10).
- **Claims:** the app shows **exactly what the chain pays** on J1, D4 and L1–L6 (D-14). Until this item lands, a settled real Oath will show all-or-nothing numbers there, and only D2/B1/B5 show engine estimates.

- **App today (Phase 3):** live balances on B1/D2 are engine estimates; J1, D4 and L1–L4 show the chain's `member.payout` for settled real Oaths (D-14). With today's program, a member who missed one day sees 0 on J1 even though D2 showed a balance.
### P0-7. Solo Oaths need a stake · CONFIRMED
- **Now:** `require!((!is_solo && stake_amount > 0) || (is_solo && stake_amount == 0))` (`lib.rs:63`), and the zero-stake path skips escrow (`lib.rs:82-84`).
- **Design:** solo Oaths stake 500 / 1,000 / 2,500 SKR and have an HP bar (−35 per miss) (rules.md §1–2, C4).
- **Change:** allow solo stakes. Where a solo member's lost SKR goes is DECISIONS D-1.
- **App until then:** solo create in Live sends `stake=0` and shows a note on C6. In Demo, solo stakes are mocked (D-30).

### P0-8. Genesis gating: too broad off-chain, missing on-chain · CONFIRMED (+ NEW sub-point)
- **Now (too broad):** after `GET /api/me`, a middleware on every `/api/*` route returns 403 without a Genesis Token (`v4.ts:50-62`). That blocks non-Seekers from everything: faucet, price, invite preview, proof, even solo Oaths.
- **Now (missing, NEW):** the program doesn't check Genesis at all (`lib.rs:48-109`), so any wallet can create or join a group Oath directly on chain and skip the backend.
- **Design:** non-Seekers can do **solo Oaths** (A3·no "Solo Oaths only"). Group Oaths (create and join) and joining Bounties need a verified Seeker (E3·elig, H2·no).
- **Change:** gate per route (group create details/invite, invite resolve-for-join, Bounty join), not globally. For on-chain enforcement, have the backend co-sign group joins, or accept it as a known limit on Devnet (DECISIONS D-20).

### P0-9. Settlement only happens if the client registered the Oath · NEW
- **Now:** the scheduler only looks at Oaths in `OathWatch` (`v4.ts:270`), and rows only get there when a member's app calls `POST /api/oaths/watch` (`v4.ts:64-70`). If the app skips that call, crashes or is reinstalled, the Oath never settles, gets no reminders and its photos are never deleted. There's no program-event indexer (the "Helius webhook" comment at `backend/src/index.ts:8` is left over from V3).
- **Design:** settlement, break detection, reminders and results (L1–L4) happen whether or not anyone opens the app.
- **Change:** index Oaths from program events or `getProgramAccounts` (on create), instead of trusting a client call. `settle_oath` is permissionless (no signer in `SettleOath`, `lib.rs:341-348`), so the app can also settle as a fallback; it will do that from D4 if the Oath is past its end and still Active.

- **App today (Phase 3):** after a confirmed create the app calls `POST /api/oaths/details`, then `POST /api/invites` (group), then `POST /api/oaths/watch`; after a join, `POST /api/oaths/watch`. If one of these fails, the Oath exists on chain but may never settle. Please make `details` also register the watch, and make all three idempotent. The app also offers a permissionless **Settle now** button once the last day is over (`settle_oath`).
### P0-10. Data the screens need: an Oath index and balances · CONFIRMED
- **Now:** besides auth and `/api/me`, the only read routes are `GET /api/oaths/:oath/details` (goal text only, `v4.ts:132-137`) and `GET /api/invites/:code` (`v4.ts:109-116`). The harness reads Oath accounts from RPC itself and loads one Oath at a time by address.
- **Design needs:**
  - **An index of my Oaths** for Today (B1–B4) and the Oaths list (D0, D5). There's no per-wallet index.
  - The **raw facts** for each Oath: on-chain state (members, `days_kept`, stake, status) plus off-chain details (goal, name, review mode, time zone, proof status per member and day).
  - **Balances** (SKR, SOL) for the BalanceChip and W1.
- **Who computes what (per CLAUDE.md scope):** HP, the grid, live balances, miss costs, odds, the recap and settlement estimates are **computed in the app** with `packages/engine`. The backend only needs to return facts, not computed views.
- **Proposed routes** (the app's `KeptApi` codes against these shapes; mocked until they exist):
  - `GET /api/me/oaths` → `{ oaths: Array<{ oath: string; role: "creator"|"member"; status: "open"|"waiting"|"active"|"settled"|"cancelled"|"broken"; isSolo: boolean; name: string|null; goalText: string|null; objectId: number; numDays: number; stake: string; startsAt: string|null }> }`. Can be built from program events or `getProgramAccounts` with a memcmp on the four member slots (offset `139 + 44·i`). Until it exists the app reads Oath accounts from RPC itself (as the harness did) for the Oaths it created or joined on this device.
  - `GET /api/oaths/:oath` (members) → `{ oath: OathRead & { tzOffsetMinutes, stake, isSolo }, details: { goalText, name, reviewMode }, today: { dayIndex, dayEndsAt, proof: Record<wallet, "none"|"photo1"|"kept"|"review"> } }`. Extends the existing `GET /api/oaths/:oath/details`.
  - `GET /api/balances` → `{ skr: string; sol: string }` (base units). Optional: the app can read these from RPC directly, and will until this exists.
  - **App today (Phase 2):** the BalanceChip reads SOL and SKR from RPC (`getParsedTokenAccountsByOwner` on the stake mint, so SPL and Token-2022 both work). That needs the mint in the app's env (`EXPO_PUBLIC_STAKE_MINT`); a balances route would remove that coupling.
- Settlement numbers on J1, D4 and L1–L6 come from the on-chain `member.payout` (D-14), so no settlement route is needed.

- **App today (Phase 3):** the Oath list is 4 `getProgramAccounts` calls (memcmp on each member slot, `frontend/src/chain/program.ts › listOathsOf`) every 30 s, plus one `GET /api/oaths/:oath/details` per Oath for the goal. Names, review mode and invite codes for Oaths created on this phone are kept on the phone (`features/oaths/device.ts`), so another phone sees a generated name and "AI only".
### P0-11. Proof photos are stored, and members can view each other's · CONFIRMED (privacy)
- **Now:** every proof photo is written to `PROOF_STORAGE_DIR` (`v4.ts:165-168`; default `/tmp/kept-proofs`, `backend/src/config.ts:13`). Other members can download them (`GET /api/photos/:oath/:day`, `v4.ts:188-193`; `GET /api/photos/file/:id`, `v4.ts:219-224`). They're deleted only at settlement (`v4.ts:274-278, 298-300`).
- **Design:** photos are **not stored**; only a hash is kept. Nobody views proof photos except a group-review photo, which is kept until the decision (48 hours at most) (rules.md §1, §5, §9).
- **Change:** delete each photo right after it's checked, remove both photo routes, and keep storage only for review photos (P1-1), with a 48-hour TTL job.

---

## P1: design parity

### P1-1. Review mode and group review · CONFIRMED
- **Now:** neither exists (no field in `state.rs:43-59` or `schema`, no routes).
- **Design:** the creator picks *AI only* or *AI + group review* at creation (C5); solo is always AI only. After 3 failed photo-2 checks, a group-review Oath lets the user send photo 2 to the group (F4a·g). A **majority of the other members** approves, **a tie rejects**, one vote each, and the photo is deleted after the decision (48 hours max). An approval records the check-in (G1–G3).
- **Change:** `reviewMode` locked at creation (on chain, or in `OathDetails`, written in the same flow as the goal); `POST /api/reviews`, `GET /api/oaths/:oath/reviews`, `POST /api/reviews/:id/vote`; expiry and cleanup jobs; a push "review requested".

- **App today (Phase 3):** C5's choice is stored on the creator's phone only; everyone else sees "AI only". F4a·g → G2 sends the review (Phase 4, below).
- **App today (Phase 4):** G1, G2, G3 and G3·no run on the mock (`ReviewsApi`). The shapes the app is coded against:
  - `POST /api/reviews` `{oath, dayIndex, gesture}` → `Review`
  - `GET /api/reviews/:id` → `Review`
  - `GET /api/oaths/:oath/reviews?open=1` → `Review[]` (reviews waiting for my vote)
  - `POST /api/reviews/:id/vote` `{approve: boolean}` → `204`
  - `Review = {id, oathId, by, dayIndex, objectId, gesture: "thumbs_up"|"victory"|"open_palm", votes: {[wallet]: boolean}, voters: wallet[], createdAt, expiresAt, status: "pending"|"approved"|"rejected"|"expired"}`
  - Rules the mock applies: voters are the other members. A majority of them approves. It's rejected once a majority rejects, or when everyone has voted without a majority (so a tie rejects). With no decision after 48 h it's `expired`, which counts as a miss. An approval must record the check-in on chain (the verifier signs `check_in` for that day).
  - **Also needed:** `GET /api/reviews/:id/photo` for voters only, deleted after the decision. G1 shows the challenge frame where the photo goes until this exists.

### P1-2. Rematch · CONFIRMED
- **Now:** doesn't exist.
- **Design** (rules.md §4):
  - after a break, each member can join **one Rematch** (same goal, object and length, same stake), started within **7 days**
  - group needs ≥ 2; solo gets a solo Rematch
  - a Rematch can't be rematched
  - **recovery:** members who keep every day of a Rematch that doesn't break also get back 50 % of their original loss
  - **funding:** on a break, 50 % of each loss is held for 7 days + the Rematch length, then released to the broken-pot destination
  - start: the original creator, or anyone once 2+ have joined
- **Recovery formula (decided, D-9):** recovery_i = **50 % of member i's balance at the moment of the break**, which is exactly the amount held for them in P0-5. It's solvent by construction. Paid only if member i keeps every day of a Rematch that doesn't break; otherwise their held amount is released to the treasury.
- **Change:** program: an escrow hold on break (per-member held amounts), `create_rematch` linked by `rematch_of`, the recovery payout at Rematch settlement, release to the treasury on expiry or miss. Backend: `GET /api/oaths/:oath/rematch` (offer, countdown, who has joined, my held amount).
- **App today (Phase 4):** R1, R2, R3, R·act, R4, R4·lost and L6 run on the mock (`RematchApi`). A Rematch is shown as an ordinary Oath with `rematchOf` (the broken Oath) and `recovery` (wallet → held amount), so D2, the grid, proof and claim are the same screens. Shapes:
  - `GET /api/oaths/:oath/rematch` → `{rematch: Oath | null, closesAt}` (`closesAt` = break + 7 days)
  - `POST /api/oaths/:oath/rematch/join` → `Oath` (the Rematch; the stake transfer is a program instruction, `joinRematch` in `TxService`)
  - `Oath` needs `rematchOf: Address | null` and, per member, the held amount (D-9).
  - Settlement must pay `recovery` on top of the normal payout to members who kept every day of a Rematch that didn't break.

### P1-3. Leaving before Start · CONFIRMED
- **Now:** only the creator's `cancel_oath` (`lib.rs:121-130`, `CreatorOath` has `has_one=creator`, `lib.rs:338`).
- **Design:** members can **leave before Start** with a refund (D1·m).
- **Change:** a `leave_oath` instruction for Open status that refunds and compacts `members`.

- **App today (Phase 3):** "Leave · get 1,000 SKR back" on D1·m works on mock Oaths only and is hidden on real Oaths.
### P1-4. Cancel and leave refunds need a manual claim from each member · NEW
- **Now:** `cancel_oath` only records `payout = stake` per member (`lib.rs:127`). Each member must then send their own `claim` (`lib.rs:194-214`) to get their SKR back.
- **Design:** "Cancel refunds everyone" (rules.md §1). D1·xs goes straight to D0 with no claim step, and members aren't shown a claim for a cancelled Oath.
- **Change:** refund in the cancel transaction (pass the members' token accounts), or have the backend sweep refunds. Until then, the app shows cancelled Oaths with a claim row in J1 (recorded as a deviation).

- **App today (Phase 3):** D1·xs → D0, then the refund shows as a claim on J1 for every member, as decided (D-31).
### P1-5. Max members · CONFIRMED (decision)
- **Now:** `MAX_MEMBERS = 4` (`state.rs:3`); error text "Oath has four members already" (`lib.rs:381`).
- **Design:** "2+"; D1 shows four seats and the demo uses four members.
- **Decision:** DECISIONS D-11 (assume 4).

### P1-6. Goal length · CONFIRMED
- **Now:** 1–120 characters (`v4.ts:120-121`).
- **Design:** 1–60 (C1 `draft.goal (string ≤ 60)`, README validation).
- **Change:** limit to 60 on both sides (`packages/config` `GOAL_MAX = 60`). The app enforces 60 already.

### P1-7. Oaths have no name · NEW
- **Now:** only `goalText` is stored (`schema:65-71`), and the chain only has its hash.
- **Design:** every Oath has a short name ("Iron Week", "Hydra 14", "Hydrate Week") on cards, nav bars, recaps and results, but C1–C6 never ask for one.
- **Decided (D-16):** names are generated from object + length (e.g. "Iron Week"), and the creator can **rename while the Oath is Open**.
- **Change:** a `name` column in `OathDetails`, set at creation (generated by the app), plus `PATCH /api/oaths/:oath/name` (creator only, Open only, 1–24 chars, suggested limit). Until it exists the app keeps the name on the device, so other members see the generated name.

### P1-8. Kept rate · CONFIRMED
- **Now:** not computed. The Keeper account has `current_streak`, `best_streak`, `oaths_kept`, `oaths_missed` (`state.rs:18-27`), updated only at settle (`lib.rs:170-188`) with the old all-or-nothing meaning.
- **Design** (rules.md §7): days kept and missed across Oaths and Bounties, recency-weighted, plus clean finishes; a neutral baseline for new users; "92% · 64 days", or "New" under 10 days; visible on E2, D1, D2, I1/I2, H2.
- **Change:** an indexer or job storing per-day outcomes per wallet, computed with `packages/engine`, and returned from the profile and Oath routes. Formula parameters: DECISIONS D-12.
- **App today (Phase 4):** I1, I2 and H2 show the kept rate from `GET /api/me/stats` and the profile (mock). H2 checks a Bounty's minimum rate on the client; the server must enforce it on join.

### P1-9. Profiles · CONFIRMED
- **Now:** only `GET /api/me` (Genesis status, `v4.ts:40-48`).
- **Design** (I1–I9): my profile and someone else's, a creator profile (bio, links, verified, hosted Bounties, total paid out, follow), activity (I5), visibility (I7), edit (I8), avatar builder (I9, 8-digit avatar config).
- **Change:** a `Profile` table (name, handle, avatar config, banner, bio, socials, visibility) and routes `GET /api/profiles/:wallet`, `PATCH /api/me/profile`, `GET /api/me/activity`, follow/unfollow.
- **App today (Phase 2):** the avatar picked on A4 is kept on the device and in the mock profile (`ProfileApi.save`, coded against the `Profile` schema in `packages/shared/src/proposed.ts`). Once `PATCH /api/me/profile` exists, onboarding saves it there.
- **App today (Phase 4):** I1–I9 run on the mock (`ProfileApi`). Shapes:
  - `GET /api/me/profile` and `GET /api/profiles/:wallet` → `Profile` (`packages/shared/src/proposed.ts`); fields hidden per the owner's visibility.
  - `PATCH /api/me/profile` with any of `name, avatar, banner, bio, socials, visibility` → `Profile`
  - `GET /api/me/activity` → `ActivityItem[]` = `{id, day, title, sub, amount: string | null, kind: "money"|"proof"|"oath", type?: "kept"|"photo"|"payout"|"vote"|"stake"|"join"|"claim"|"broke"}` (`type` picks the row icon on I5; without it the app falls back to `kind`). Plain values are fine; the app can format them if you send `{at, type, oath, amount}` instead. Say which.
  - `GET /api/creators/:handle` → `{name, logo, palette, verified, bio, tagline, hosted, paidOut, followers, links: {title, kind}[]}` (I3)
  - follow: `POST/DELETE /api/me/following/:handle`. The app keeps follows on the device until then.
  - Visibility (I7) has three audiences per area: **Oaths, Bounties, socials** × everyone / Oath partners / only me, plus "find me by name" and "anyone can invite me". The current `Profile.visibility` is a single value, so please store the I7 settings as `{oaths, bounties, socials: 0|1|2, findByName: boolean, anyoneInvite: boolean}`. The app keeps them on the device until then.

### P1-10. Bounties · CONFIRMED
- **Now:** none in this code (program or API).
- **Design** (rules.md §6, H1–H7, K1–K5):
  - anyone creates one and funds the pool; KEPT takes **10 % on funding** (the creator pays pool × 1.10)
  - the creator sets object, length, join deadline, branding (cover, message, one link) and requirements (minimum kept rate, a token held)
  - public feed and search
  - joining is free, needs Genesis, and closes after day 1
  - same two-photo proof; a miss means you're out
  - survivors split the pool equally
  - a recently-out feed, creator stats (H6), an opt-in finisher list
- **Change:** program: Bounty escrow (fund, join, check-in, eliminate, settle, claim). Backend: feed, detail, create, join, proof, recently-out, stats, branding upload/storage, requirement checks. Pool split rounding and what happens with no survivors: DECISIONS D-19.
- **App today (Phase 4):** H1–H7, L5 and K1–K5·ok run on the mock (`BountiesApi`). A joined Bounty is a stake-0 solo Oath with `bountyId`, so proof and the grid are reused; a miss eliminates. Shapes (`BountyFacts` in `frontend/src/features/bounties/mockStore.ts`; this replaces the earlier `Bounty` draft in `proposed.ts`):
  - `GET /api/bounties` → `Bounty[]`; `GET /api/bounties/:id` → `Bounty`
  - `POST /api/bounties/:id/join` → my participation `Oath`; `GET /api/bounties/:id/me` → `Oath | null`
  - `POST /api/bounties` `{name, objectId, numDays, pool, joinWindowHours | null, message, link | null, minKeptRate | null, tokenHeld | null}` → `Bounty`, after the funding transaction (`fundBounty` in `TxService`, pool × 1.10)
  - `Bounty = {id, name, brand {name, verified, logo, palette}, message, detail, link, objectId, numDays, pool (after fee), joinClosesAt, startsAt, entrants, remaining, category, minKeptRate, tokenHeld, createdBy, featured, recentlyOut: {name, day, at}[], stillInByDay: number[], finishersOptIn: string[]}`
  - **Also needed:** cover image upload (K3). The app shows the brand gradient and a "coming later" toast. "Token held" (K4) is collected but not checked yet (D-27).

### P1-11. Inbox and notifications · PARTLY DONE
- **Done:** FCM v1 sending (`v4.ts:231-262`), device token registration (`v4.ts:195-199`), nudge push with one-per-day dedupe (`v4.ts:201-215`, `schema:49-57`), and the 2-hour deadline reminder (`v4.ts:286-294`). This matches the design's 2 h threshold. FCM delivery is still unverified per the README.
- **Missing:** an inbox store with done/undone state (N1), and these pushes: review requested, Oath started, daily recap ready, Oath broken, Rematch available (+ reminder 1 day before the window closes), someone joined your Rematch, ready to claim, Bounty start/end, followed creator posted a Bounty.
- **Change:** a `Notification` table, `GET /api/inbox`, `POST /api/inbox/:id/done`, and the push types above, sent from the same events.
- **App today (Phase 2):** the bell count on every tab header is `unread` from the mock inbox (`InboxResponse` in `packages/shared/src/proposed.ts`: `{items: InboxItem[], unread: number}`, `unread` = items with `needsAction`).
- **App today (Phase 4):** N1 is built. Each item opens its screen from `type` + `ref`, so the server must send a `ref`:
  - invite → E2 (`ref.oath`, `ref.code`) · review → G1 (`ref.oath`, `ref.review`) · claim → J1 · rematch / broken → R1 · nudge / deadline → D2 (`ref.oath`) · recap → B5 · started → H3 (`ref.bounty`) or D2 · bounty → H2 (`ref.bounty`)
  - I changed `ref.oath` in `InboxItem` from an address to any string (a mock Oath id isn't an address) and added `ref.code`. `unread` = items with `needsAction` and not `done`.
  - "Accept" / "Decline" / "Mark all read" call `POST /api/inbox/done` `{ids: string[]}` (one call for many). M1 is the system tray's look; the push texts are in its copy.

### P1-12. Wallet screens (W1–W4) · PARTLY DONE
- **Done:** a 5,000 SKR Devnet faucet (`v4.ts:73-98`).
- **Missing:** it's **once per wallet** (`FaucetClaim.wallet @unique`, `schema:82-86`; 429 at `v4.ts:77`), there's no balances route (P0-10), no swap quote, and W1's history needs the activity route (P1-9).
- **Decision:** DECISIONS D-21 (repeatable faucet as "Add SKR" on Devnet; swap is a mock on Devnet).
- **App today (Phase 4):** W1–W4 are built.
  - Balances are real (RPC) and the faucet is real (`POST /api/faucet`, with "already used" shown from the 429).
  - The swap is a mock at 1 SOL ≈ 9,900 SKR: `WalletApi.quote(lamports)` → `{skr, skrPerSol, feeLamports}`, then `WalletApi.swap(lamports)` → `{skr}`. Not enough SOL comes back as `code: INSUFFICIENT_SOL` and opens M3.
  - W1's "Locked in Oaths" and "In a Rematch" are summed in the app from the Oath views. "Recent" uses `GET /api/me/activity` (P1-9).
  - W4 shows the real address and its QR.

### P1-13. Price · PARTLY DONE
- **Now:** `GET /api/price` → `{usdPerSkr: 0.01, skrForUsd10: 1000, devnet: true, label: "placeholder rate"}` (`v4.ts:217`). It sits behind the auth and Genesis middleware (registered after `v4.ts:37` and `v4.ts:50`), so non-Seekers and signed-out screens (A1 chips) can't read it.
- **Change:** make it public. A placeholder is fine on Devnet (it matches the design's ≈ $10 per 1,000 SKR). Plan a real feed for mainnet.

### P1-14. Machine-readable error codes · NEW
- **Now:** every error is `{error: "<English sentence>"}` with an HTTP status (e.g. `v4.ts:103, 110, 125, 149-153`). The only extras are `retryable` (`v4.ts:184`) and `expected` (`v4.ts:157`).
- **Design:** distinct screens for each failure: E3·code / E3·late / E3·in / E3·elig / E3·skr, F2a / F2b / F2c, M3, M4, A3·no.
- **Change:** add a stable `code` field (e.g. `INVITE_NOT_FOUND`, `OATH_STARTED`, `ALREADY_MEMBER`, `NOT_ELIGIBLE`, `PROOF_FAIL`, `PROOF_UNAVAILABLE`, `CHALLENGE_EXPIRED`). The enum will live in `packages/shared`. Until then the http adapter maps by status code plus route, never by message text.

### P1-15. Invites · PARTLY DONE
- **Done:** create a code while Open (`v4.ts:100-107`), `kept://join/<code>` deep link (`v4.ts:106`), resolve with goal text and `alreadyStarted` (`v4.ts:109-116`).
- **Missing:** no expiry or revocation, no "full" flag (the app can derive it from `members.length`), and resolve is behind the Genesis gate, so a non-Seeker gets a generic 403 instead of a preview followed by E3·elig. The preview has no creator profile, kept rates or stake formatted for E2.
- **Change:** add `full`, `stake`, `creator` profile summary and member kept rates to the resolve response; return `code: NOT_ELIGIBLE` instead of the global 403.

- **App today (Phase 3):** E1 resolves the code with `GET /api/invites/:code`, recomputes the Oath address as the PDA of `creator` + `oathId`, and reads the account over RPC. Please add `oath` (the address) to the response.

### P1-16. Streak and kept rate for the Today and result screens · NEW
- **Now:** nothing (see P1-8, P1-9).
- **Design:** B2 chips "Streak 13" and "Kept rate 91%", F5 "Streak 13", L4 "Streak 14", D2/E2 member rows "91% · 64 days".
- **App today (Phase 3):** streak chips are left out; kept rates show "New" for real members (mock members have the prototype's numbers).
- **Change:** `GET /api/me/stats` → `{ streak: number, keptRate: number | null, rateDays: number }`, and `keptRate` / `rateDays` per member in `GET /api/oaths/:oath`.
- **App today (Phase 4):** the mock `MyStats` the profile uses is `{streak, bestStreak, keptRate, rateDays, oaths: {kept, broken}, bounties: {survived, out}}`. Please return all of it from `GET /api/me/stats`.

### P1-17. Claim needs the member's token account to exist · NEW
- **Now:** `claim` sends to `destination` (`lib.rs:194-214`), which must already be a token account of the stake mint. The app passes the member's associated token account. It exists if they staked from it, but not if they closed it afterwards.
- **Change:** `init_if_needed` on the destination ATA (the crate already enables the `init-if-needed` feature).

### P1-18. Solo Oaths should start on create · NEW (Phase 4.5)
- **Now:** `start_oath` is required for every Oath, solo included (`lib.rs:114` allows a solo start with one member). The design has no Start step for solo: C7 → C7·ok → D2 (flows.md, happy path 3).
- **App until then:** since 2026-10-10 the app sends `create_oath` + `start_oath` as **one transaction** for a solo Oath (`chain/realTx.ts`), so it is one wallet approval. Checked by simulating that transaction on Devnet (no error, ~51k compute units, 545 bytes). No program change is needed for the approval count; starting inside `create_oath` would still save an instruction.
- **Change:** start solo Oaths inside `create_oath` (day 1 at the creator's next midnight, D-6), or accept `start` as part of the same transaction.

### P1-19. A web link for invites · PARTLY DONE (Phase 4.5, checked 2026-10-10)
- **Design:** C8 and D1 show the invite as `kept.app/o/IRON-7K2Q`.
- **Now:** C8 and D1 share `https://keptdapp.vercel.app/o/<code>`. Android App Links route this into the installed app and the device reports the host as verified. The branded `kept.app` domain serves a domain-for-sale page, while the Vercel `/o/<code>` route returns 404 in a browser.
- **Change:** publish an invite landing page with an install/preview fallback on a domain KEPT owns, move the identity URI and `assetlinks.json` there, then update the shared URL and Android App Link host.

### P1-20. Who survived a Bounty · NEW (Phase 4.5)
- **Design:** H5 shows the survivors' avatars with their share.
- **Now:** nothing lists a Bounty's survivors (Bounties are mock-only, P1-10). H5 shows the user and "+N others".
- **Change:** include the first few survivors (name, avatar, share) in the Bounty result.

### P1-21. The gesture challenge lasts 2 minutes; the design says 5 · NEW (2026-10-10, found on the emulator)
- **Now:** `CHALLENGE_TTL_MS = 2 * 60_000` (`backend/src/v4/rules.ts:44`, plus a 60 s upload grace). A fresh challenge shows about 2:00 on F1, and F2c reads from the design's copy.
- **Design:** F2c says "Challenges last 5 minutes, so nobody reuses old photos" (`design/copy.json`, F2c).
- **Change:** set the TTL to 5 minutes, or decide the design copy should say 2 (the app shows whatever `expiresAt` the backend sends, so only the F2c sentence disagrees).

### P1-22. Invite code casing and format mismatch · PARTLY DONE (2026-10-10, found on the emulator)
- **Now:** `POST /api/invites` generates `randomBytes(5).toString("base64url")` (`backend/src/routes/v4.ts:101`), producing mixed-case strings with potential underscores. `GET /api/invites/:code` queries Postgres `prisma.oathInvite.findUnique({ where: { code: req.params.code } })` which is strictly case-sensitive.
- **Design:** the design specifies uppercase codes like `IRON-7K2Q` (`design/copy.json`, "Check for typos. Codes look like IRON-7K2Q"). The app previously uppercased input; it now preserves the backend's issued casing.
- **App workaround:** Live now preserves the exact case from typed text, links, pasted text and QR scans (`frontend/src/screens/join/Join.tsx`), so valid issued codes resolve when shared accurately.
- **Remaining impact:** manually retyping a mixed-case code with the wrong case still fails with 404 `INVITE_NOT_FOUND`; underscores and the generated 7-character format also differ from the designed uppercase word-code.
- **Backend change:** generate uppercase alphanumeric codes matching the design (or word-4alphanumeric like `IRON-7K2Q`), or provide a case-insensitive lookup that does not make distinct codes collide.

### Local setup note (Phase 4.5)
Running `backend` locally needs `VERIFIER_SECRET_KEY` and `FAUCET_SECRET_KEY` for the **configured** Devnet verifier/admin (`FFAZTtBd…`, read from the on-chain Config). Without them sign-in, invites, nudges and price work, but the faucet has no SKR and real photo-2 check-ins are rejected on chain. A throwaway key was used for the shakedown.

---

## P2: operations, hardening, cleanup

1. **Scheduler runs inside the web process** · CONFIRMED. `startV4Scheduler()` uses `setInterval` every 60 s (`v4.ts:264-310`, started at `backend/src/index.ts:14`). On a sleeping or free host (Render free tier is the current deploy), settlements, breaks and reminders are missed. A failed settlement retries every minute forever with only a log line (`v4.ts:302`). Move it to a worker or cron with backoff and alerting.
2. **Sign-in nonces live in memory** · NEW. `pending` is a process-local `Map` (`backend/src/auth.ts:6`), so a restart or a second instance breaks sign-ins in flight. Sessions are 7-day HMAC tokens with no refresh or revocation (`auth.ts:28-33`). Store nonces in Postgres or Redis, and add refresh plus logout revocation.
3. **No rate limiting** · NEW. Not on auth, proof (8 MB uploads, `v4.ts:160`), invites or nudges.
4. **Debug day length is in the default build** · NEW. `default = ["debug-tools", "init-if-needed"]` (`programs/kept_test/Cargo.toml:12`) allows `day_seconds == 120` (`lib.rs:54-55`). Release and Devnet-for-testers builds must use `--no-default-features --features init-if-needed`. Also confirm what's actually deployed (BACKEND_PART_1 §6.12 says deployed ≠ source).
5. **Legacy V3 surface** · CONFIRMED. `migrate_keeper` and the Keeper streak counters (`lib.rs:217-223`, `state.rs:18-27`), dead uncompiled V3 Rust files in `programs/kept_test/src/` (`constants.rs`, `day.rs`, `errors.rs`, `events.rs`, `instructions/`; `lib.rs:4` only declares `mod state`), V3 Prisma migrations for `Payment`, `User`, `AuraMint` that the schema no longer models, and a stale crate description "Keeper XP, streak and Soul" (`Cargo.toml:4`, copied into the IDL metadata). XP, levels, ranks and NFTs aren't in the app (rules.md §9).
6. **Stale code in the harness chain folder** · NEW. `chain/idl.ts` embeds the old V3 IDL (`buy_soul`, `check_in`), `chain/errors.ts` only maps V3 errors, `constants.ts` is V3, and `chain/oaths.ts:4` imports `@noble/hashes` without declaring it. The JSON IDL `chain/idl/kept_test.json` **is** V4. The new `packages/chain` uses only the JSON IDL.
7. **Android app identity drift** · PARTLY DONE. The unrelated backend/harness identity files still use different package names (`assetlinks.ts` serves `com.kept.backendtest`; `backend/assetlinks.json` lists `app.kept.mobile` and `com.kept.testharness`; harness `app.json` uses `com.kept.backendtest`). The mobile app's configured Vercel identity host now lists `app.kept.mobile` plus its debug and release fingerprints.
   **App Link fix:** the Android app declares an auto-verified HTTPS `/o/` intent filter. On the Android 15 emulator, `pm get-app-links app.kept.mobile` reports `keptdapp.vercel.app: verified` with the installed debug certificate (`FA:C6:17:…:3B:9C`).
   **Remaining wallet observation:** Phantom still showed "This app's identity could not be verified" and logged `Declining sol_mwa_reauthorize: dApp identity is not verified`. The earlier emulator audit completed full sign-in after the extra Connect prompt; this warning affects silent re-authorization. Check again with Seed Vault on a Seeker and with a release-signed build. Android's app/domain association is verified, but Phantom's warning remains wallet-specific.
8. **Thin tests** · NEW. `backend/test/v4.test.ts` has 3 tests, all on pure helpers (`auth`, `proofRejection`, `nudgeRejection`). No route, scheduler or decoder tests. The program has LiteSVM tests (`tests/v4.test.ts`, 14 cases) and 6 Rust unit tests for the payout function that will be replaced (`lib.rs:252-261`).
9. **Duplicated hand-written decoders** · NEW. The Oath account layout is decoded by byte offset in the API (`v4.ts:362-376`) and the app (`oaths.ts:20-27`), with hand-hashed discriminators (`v4.ts:326, 379`). Any layout change (P0-5, P1-1, P1-2) breaks both silently. Use the IDL coder (`packages/chain`).
10. **Odds:** display-only, computed in the app from the kept rate (rules.md §8). No backend work.
11. **API docs:** `docs/API.md` (created in Phase 0) must stay in sync. The app validates every response with zod schemas in `packages/shared`.
12. **Sign-in prerequisites on the host (checked against Render, 2026-10-10)** · NEW. Verified by a real login with a throwaway key (no secrets used): `SESSION_SECRET` is set (`issueSession` would throw without it), the database answers (`/api/me` reads `sessionSeat`), and the nonce, verify and `/api/me` routes behave as `docs/API.md` says. `/health` and a bad `verify` don't prove any of this: both pass without `SESSION_SECRET` or a database. What the host must keep true:
    - **One instance.** Nonces are process memory (item 2): a sleep, restart or second instance between `nonce` and `verify` turns a valid sign-in into `401 Invalid or expired sign-in signature`. A free Render instance asleep for the first request answers after a cold start (~30–60 s); the app shows "signing in" until then.
    - **Genesis for a real Seeker.** `GET /api/me` reports `genesis: true` only if `GENESIS_GROUP` matches a Token-2022 group member in the wallet **on the cluster `DEVNET_RPC_URL` points to**, or if `SGT_MOCK=true` and the wallet is in `SGT_MOCK_ALLOWLIST` (never on mainnet RPC). A Seeker's Genesis Token lives on mainnet, so on a Devnet host the Seeker's wallet needs to be on the allowlist (`genesis.ts:34-37`) or it signs in as A3·no (solo only). Checked on the emulator: Phantom's test account came back `genesis: true`.
    - A genesis `409` on `/api/me` ("assigned to a different wallet") is handled by the app: signed in, solo only.

---

## Already done (matches the design)
- Sign-in with a signed wallet message, nonce consumed once (`auth.ts:10-26`, test `test/v4.test.ts:8-13`); bearer session.
- Oath lengths 3 / 7 / 14 (`lib.rs:50`); the 8 objects in the design's order (`v4.ts:22`, `lib.rs:52`).
- Group Oaths: create with stake escrow, join with the same stake, start (creator, ≥ 2 members), cancel before start with refund amounts recorded, claim (`lib.rs:48-130, 194-214`). Joining after start is blocked (`lib.rs:91`).
- Goal text stored off-chain and checked against the on-chain SHA-256 (`v4.ts:118-130`).
- 10 % fee configured at setup (`scripts/v4-setup.ts:53`); rounding dust to the treasury (`lib.rs:164-167`).
- Invite code + `kept://join/<code>` deep link + QR (harness).
- One check-in per member per day, only inside the day window, only by the configured verifier (`lib.rs:132-150`, LiteSVM tests).
- Nudges, one per sender/recipient/day, only for members who haven't checked in (`backend/src/v4/rules.ts:13-18`).
- 2-hour deadline reminder (`v4.ts:286`).
- Devnet faucet (single use, see P1-12) and a placeholder price (P1-13).

## Decisions needed from the product owner
See `docs/DECISIONS.md`. All answered on 2026-10-09; see DECISIONS.md, "Rules amendments". The ones that shape backend work: D-1/D-2/D-15 (losses go to the treasury), D-3 (miss cost capped at the balance), D-6 (creator's midnight; day 1 at the first midnight after Start), D-9 (Rematch recovery), D-10 (the breaking day), D-11 (max 4 members), D-14 (claims show chain payouts), D-16 (generated names + rename), D-21 (faucet, mock swap on Devnet).
