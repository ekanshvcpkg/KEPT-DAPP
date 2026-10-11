# KEPT backend API

Routes are mounted by `backend/src/app.ts`; `backend/src/index.ts` starts that application and the scheduler. Paths below are relative to `backend`. The examples use these shell variables:

```bash
API=http://localhost:3000   # the backend URL
TOKEN=<session token>       # from POST /api/auth/verify
ADMIN_SECRET=<admin secret> # the ADMIN_SECRET env var
```

## Conventions

**Access levels**

| Level | What it needs |
|---|---|
| Public | Nothing |
| Signed in | `authorization: Bearer $TOKEN`. Without it, or with a bad or expired token: `401 {"error":"Sign-in required"}` |
| Genesis | Signed in, and the wallet holds a Seeker Genesis Token. With `SGT_MOCK=true`, being on `SGT_MOCK_ALLOWLIST` counts instead, except when the RPC URL is mainnet. Without it: `403 {"error":"A Seeker Genesis Token is required"}`. If the token is already bound to another wallet: `409` |
| Admin | `x-admin-secret: $ADMIN_SECRET`. Missing or wrong: `401 {"error":"Invalid admin secret"}`. `ADMIN_SECRET` unset: `503` |

- Every `/api/*` route needs at least Signed in. All of them except `/api/auth/*` and `/api/me` also need
  Genesis.
- Errors are JSON, `{"error":"…"}`, sometimes with extra fields. Uncaught server errors return Express's
  default `500` page.
- Request bodies are JSON (`content-type: application/json`) up to 12 MB.
- Token amounts are mint base units as strings, unless the field name ends in `Skr`.
- Times ending in `Ts` are unix seconds. Other times are ISO 8601.

## Endpoint index

| Method and path | Access |
|---|---|
| `GET /health` | Public |
| `GET /.well-known/assetlinks.json` | Public |
| `POST /api/auth/nonce`, `POST /api/auth/verify` | Public |
| `GET /api/me` | Signed in |
| `POST /api/oaths/watch` | Genesis |
| `POST /api/faucet` | Genesis |
| `POST /api/invites`, `GET /api/invites/:code` | Genesis |
| `GET /api/oaths/:oath/invite` | Genesis |
| `POST /api/oaths/details`, `GET /api/oaths/:oath/details` | Genesis |
| `GET /api/economics` | Genesis |
| `POST /proof/verify` | Genesis |
| `POST /api/proof/challenge`, `POST /api/proof/start`, `POST /api/proof` | Genesis |
| `GET /api/oaths/:oath/reviews`, `POST /api/reviews/:id` | Genesis |
| `POST /api/push-token`, `POST /api/nudges` | Genesis |
| `GET /api/price` | Genesis |
| `GET /identity/:wallet`, `GET /reputation/:wallet` | Signed in |
| `GET /bounty/current`, `GET /bounty/:id/recently-out` | Signed in |
| `POST /bounty/:id/join`, `POST /bounty/:id/challenge`, `POST /bounty/:id/start`, `POST /bounty/:id/proof` | Genesis |
| `POST /admin/run-jobs`, `POST /admin/bounty` | Admin |

## Service

### GET /health

Public. Liveness check.

```bash
curl -s $API/health
# → {"ok":true,"service":"kept-v4","apiVersion":4,"build":{"commit":"…","sourceSha256":"…","builtAt":"…"}}
```

### GET /.well-known/assetlinks.json

Public. Android asset links for `com.kept.backendtest`, so wallets can verify the app's identity.

```bash
curl -s $API/.well-known/assetlinks.json
# → [{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"com.kept.backendtest","sha256_cert_fingerprints":["FA:C6:…"]}}]
```

## Sign-in

### POST /api/auth/nonce

Public. Returns a one-time message for the wallet to sign. It expires after 5 minutes.

```bash
curl -s -X POST $API/api/auth/nonce -H 'content-type: application/json' -d '{"wallet":"<WALLET>"}'
# → {"message":"KEPT V4 sign-in\nWallet: <WALLET>\nNonce: …\nThis signature only signs in and cannot move funds."}
```

Errors: `400` invalid wallet address.

### POST /api/auth/verify

Public. Send the ed25519 signature of that exact message, base64-encoded. The response contains a
7-day session token. Each nonce can be used once.

The signature is the **bare 64 bytes**. A wallet's MWA `signMessages` answers with the *signed payload*
(the message followed by the 64-byte signature), so the app cuts the last 64 bytes before sending
(`frontend/src/chain/signature.ts`). Anything longer gets `401`, same as a wrong signature.

```bash
curl -s -X POST $API/api/auth/verify -H 'content-type: application/json' \
  -d '{"wallet":"<WALLET>","message":"<MESSAGE>","signature":"<BASE64_SIGNATURE>"}'
# → {"token":"…","wallet":"<WALLET>"}
```

Errors: `401` invalid or expired signature.

### GET /api/me

Signed in (no Genesis check). Reports the caller's Genesis eligibility, and binds the Genesis Token to
this wallet (one token per wallet).

```bash
curl -s $API/api/me -H "authorization: Bearer $TOKEN"
# → {"wallet":"<WALLET>","genesis":true,"mocked":false,"genesisMint":"<MINT>"}
```

Errors: `409` the token is already bound to another wallet (the body also contains the fields above).

## Oaths

The Oath account lives on-chain. These routes read it through `DEVNET_RPC_URL`.

### POST /api/oaths/watch

Genesis, and the caller must be an Oath member. Adds the Oath to the background job (reminders, missed
days, settlement, photo cleanup).

```bash
curl -s -X POST $API/api/oaths/watch -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"oath":"<OATH>"}'
# → 204 No Content
```

Errors: `403` not a member or Oath not found.

### POST /api/faucet

Genesis. Sends 5,000 test SKR, once per wallet. Devnet only.

```bash
curl -s -X POST $API/api/faucet -H "authorization: Bearer $TOKEN"
# → {"signature":"…","amount":"5000","mint":"<MINT>"}
```

Errors: `403` the RPC is mainnet; `429` this wallet has already used the faucet; `502` the transfer
failed (the claim is released); `503` `STAKE_MINT` or `FAUCET_SECRET_KEY` is not set.

### POST /api/invites

Genesis, and the caller must be an Oath member while the Oath is Open.

```bash
curl -s -X POST $API/api/invites -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"oath":"<OATH>"}'
# → {"code":"Ab3dE9x","deepLink":"kept://join/Ab3dE9x","oath":{…}}
```

Errors: `403` not a member, or the Oath is not Open.

### GET /api/invites/:code

Genesis. Resolves an invite code. Any eligible wallet can call it; it doesn't need to be a member.

```bash
curl -s $API/api/invites/Ab3dE9x -H "authorization: Bearer $TOKEN"
# → {"oath":{…},"goalText":"Run every morning","habits":["Run every morning"],"alreadyStarted":false}
```

Errors: `404` invite not found, or Oath not found.

### GET /api/oaths/:oath/invite

Genesis, and the caller must be a member. Returns the latest invite created by this wallet for the
Oath, plus its saved goal text. The mobile app uses this to restore invite links in the creator's
Oath list after a reload. If this wallet has not created an invite, `invite` is `null`.

```json
{ "goalText": "Run every morning", "habits": ["Run every morning"], "invite": { "code": "Ab3dE9x", "deepLink": "kept://join/Ab3dE9x" } }
```

Errors: `404` Oath not found or the caller is not a member.

### POST /api/oaths/details

Genesis. Only the creator can call it, and only while the Oath is Open. Saves 1–8 habits (each 1–60
characters) plus their canonical joined `goalText`, which must hash (SHA-256) to the on-chain goal hash.
It can also set `habitObjects`: one plain short text per habit (letters, digits, spaces and `, . ' ( ) -`, at most 80; stored trimmed and
lower case), what that habit's photo is checked for ("dumbbell", "kettlebell", "sheet music"). It is not limited to the program's eight
objects. Without it every habit uses the Oath's own object (`object_id`). `minMinutes` (1–720) is the wait of the legacy two-photo flow.
Older requests that omit `habits` are read as one habit. `GET /api/oaths/:oath/details`, `GET /api/oaths/:oath/invite` and
`GET /api/invites/:code` return `habitObjects` too (empty for Oaths made before this).

```bash
curl -s -X POST $API/api/oaths/details -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"oath":"<OATH>","goalText":"Run every morning · Read 10 pages","habits":["Run every morning","Read 10 pages"],"habitObjects":["running shoes","book"]}'
# → {"oath":"<OATH>","goalText":"Run every morning · Read 10 pages","habits":["Run every morning","Read 10 pages"],"habitObjects":["running shoes","book"],"minMinutes":30}
```

Errors:
- `400`: habits are not 1–8 trimmed strings of at most 60 characters, `goalText` is not their ` · `-joined value, `habitObjects` is not one plain short text per habit, or `minMinutes` is invalid.
- `403`: the caller is not the creator, or the Oath is not Open.
- `404`: Oath not found.
- `422`: the text doesn't match the on-chain hash.

### GET /api/oaths/:oath/details

Genesis, and the caller must be an Oath member. Returns:
- the goal text and the photo wait;
- today's `dayIndex` (-1 when the Oath is not active);
- for each member: whether the caller can nudge them, plus their identity and reputation.

```bash
curl -s $API/api/oaths/<OATH>/details -H "authorization: Bearer $TOKEN"
```

```json
{
  "goalText": "Run every morning · Read 10 pages", "habits": ["Run every morning", "Read 10 pages"], "minMinutes": 30, "dayIndex": 1,
  "members": [
    { "wallet": "<B>", "canNudge": true, "reason": null,
      "identity": { "genesis": true, "genesisMint": "<MINT>", "source": "genesis_token", "seatGenesisMint": "<MINT>", "verifiedSeeker": true, "method": "genesis_token" },
      "reputation": { "kept": 12, "missed": 2, "oathsKept": 3, "oathsBroken": 1, "keptRate": { "percentage": 85.7, "keptDays": 12, "missedDays": 2, "sampleSize": 14 }, "days": { "kept": 12, "missed": 2 }, "oaths": { "kept": 3, "missed": 1 }, "streak": { "current": 7, "best": 14 }, "keeper": "v4", "bounties": { "joined": 1, "completed": 1, "out": 0 } } }
  ]
}
```

`reason` is one of `not_active`, `outside_day`, `self`, `already_checked_in`, `already_nudged`, or null.
`identity` and `reputation` are the bodies of `GET /identity/:wallet` and `GET /reputation/:wallet`,
without `wallet`.

`economics` is read from the Oath account, so it shows the terms that Oath was created under:

```json
"economics": {
  "rulesVersion": 2, "stakeAmount": "1000000000", "feeBps": 1500, "feeAmount": "150000000", "totalDue": "1150000000",
  "freezePrice": "50000000", "feesCollected": "300000000", "freezeProceeds": "0", "settleAt": 1791900000, "settlement": null,
  "members": [{ "wallet": "<A>", "freezeBought": false, "freezeUsed": false, "frozenDays": [], "missedDays": [1],
    "freezeEligibleDays": [1], "canUseFreeze": false, "onTrack": false, "fullyKept": false, "estimatedPayout": "500000000" }],
  "viewer": { …the caller's entry from members… }
}
```

- `rulesVersion` 1 is a legacy Oath. It has no fee or freezes and settles under the old rules.
- `missedDays` lists closed days with no proof and no freeze.
- `freezeEligibleDays` lists the days the member's one freeze could cover, once bought.
- Before settlement, `estimatedPayout` assumes members with no uncovered miss keep every remaining day.
  After settlement it is the on-chain payout.
- `settlement` holds `treasuryPaid`, `carryover`, `carryoverSwept` and `dust` once a rules v2 Oath has settled.

Errors: `403` not a member, or Oath not found.

### GET /api/economics

Genesis. Returns the terms a new Oath would get if created now. Rules v2 apply only once the admin has run
`configure_economics`, and existing Oaths keep their own terms.

```json
{ "rulesVersion": 2, "feeBps": 1500, "freezePrice": "50000000", "slashBps": 5000, "freezesPerMember": 1,
  "carryoverReserve": { "address": "<PDA>", "total": "0" } }
```

Before activation: `{"rulesVersion":1,"feeBps":0,"freezePrice":null,"slashBps":null,"carryoverReserve":null,"legacyMissFeeBps":1000}`.

### Oath economics (rules v2, on chain)

- **Fee:** create and join transfer `stake + floor(stake × feeBps / 10000)` into the Oath vault. The fee rate,
  per-member fee and freeze price are fixed in the Oath account when it is created.
  - If the creator cancels while the Oath is Open, each member's claim returns stake plus fee.
  - Otherwise fees go to the treasury at settlement.
- **Freeze:** each member may buy one credit with `buy_freeze`, while the Oath is Active, at the fixed price.
  `use_freeze(day)` covers one closed day that has no proof. It cannot cover a future day, the current day,
  or a kept day, and works once. A covered day counts as kept for success and payouts.
  Freeze payments go to the treasury at settlement.
- **Settlement:** `settle_oath` is accepted one Oath day after the last day ends, which leaves time to
  freeze the last day.
  - Members who kept or froze every day get their stake plus an equal share of the slashed amount.
  - Any other member gets `stake − floor(stake / 2)` back, however many days they missed.
  - The integer remainder of the shares is dust and goes to the treasury.
  - If nobody succeeds, the slashed amount is carryover. `sweep_carryover` (run by the job) moves it to the
    program-owned carryover reserve, which has no withdrawal instruction yet.
- **Conservation:** payouts + treasury (fees + freezes + dust) + carryover = stakes + fees + freezes.
- **Legacy:** Oath accounts without terms (316 bytes), and Oaths created before activation, keep rules v1.
- **Settlement job:** `POST /admin/run-jobs` reports `carryoverSwept`. The job copies each settled rules v2
  Oath's accounting into `OathSettlement`, and keeps watching an Oath until its carryover is swept.

## Proof

**One photo proves one habit (D-98).** Each habit of an Oath is proven every day with a single photo of that habit's own object
and a gesture the server picks; every photo is checked by `POST /proof/verify`. The day is kept (recorded on chain) once every
habit has its photo, in any order, any time before the day ends. Use `POST /api/proof/challenge` with a `habit`, then
`POST /api/proof/habit` (below).

The two-photo flow below (`start`, wait, `end`) is **legacy**: it is still served for Bounties and for clients that don't send a
`habit`, and the app no longer uses it for Oaths.

Legacy: each day needs **two photos**.

1. **Start photo**: pass the start challenge, then call `POST /api/proof/start`.
2. **Wait** `minMinutes`, measured on the server clock. The wait is capped at half the day length.
3. **End photo**: a fresh challenge is issued only after the wait, always with a different gesture. Pass
   it, then call `POST /api/proof`.

The day counts only when both photos pass. The proof hash recorded on-chain is
`sha256(startHash ‖ endHash)`. Bounties work the same way under `/bounty/:id/*`.

### POST /proof/verify

Genesis. Android runs the stock MediaPipe Gesture Recognizer task and Gemma 4 E2B locally through LiteRT-LM. On first use, the app asks before downloading the ~5 MB gesture task and ~2.59 GB Gemma model. The photo is not uploaded for AI analysis. This endpoint registers the local verdict and image SHA-256 hash, then returns a one-use `verificationId` for the existing proof routes.

**Trust note:** the backend validates and records the submitted verdict, but cannot prove that an unmodified app or the bundled models produced it. This is less tamper-resistant than the former server-side model check.

| Field | Notes |
|---|---|
| `proofHash` | SHA-256 hex digest of the locally analyzed image |
| `expectedObject` | Plain text up to 80 characters; check-ins accept the backend's `OBJECT_TEXT` strings |
| `expectedGesture` | Plain text up to 80 characters; check-ins accept the three `GESTURE_TEXT` values |
| `objectPresent`, `objectConfidence` | Local Gemma result; boolean and number from 0 to 1 |
| `gestureSeen`, `gestureMatches` | Local MediaPipe result and match to the current challenge |
| `looksLikeScreenOrPrintout`, `reason` | Local Gemma result |
| `oath`, `dayIndex` | Optional and sent together for Oath photos, so failed checks can count toward group review |

A submitted verdict passes when `objectPresent && objectConfidence >= 0.6 && gestureMatches && !looksLikeScreenOrPrintout`. A passing ID is limited to one use, 10 minutes, and the submitted object/gesture text.

Limits: 20 registered checks per wallet per UTC day. The server counts failed end-photo verdicts toward group review. If the user chooses group review, the app separately submits that failed photo through the existing review-photo flow.

Example request (fields abbreviated):

```json
{
  "proofHash": "<64 lowercase hex characters>", "expectedObject": "running shoes", "expectedGesture": "thumbs up",
  "objectPresent": true, "objectConfidence": 0.88, "gestureSeen": "Thumb_Up", "gestureMatches": true,
  "looksLikeScreenOrPrintout": false, "reason": "The requested object and gesture are visible.",
  "model": "Gemma 4 E2B + MediaPipe Gesture Recognizer", "ms": 2410
}
```

The success response includes `pass`, `verificationId`, `proofHash`, the verdict, `checksLeft`, and (for Oath photos) `failedChecks`.

Errors:
- `400`: required fields missing or verdict/hash invalid; or only one of `oath`/`dayIndex` supplied.
- `429`: `{"error":"daily_limit"}`.

### POST /api/proof/habit

Genesis, and the caller must be an Oath member. Records one habit's photo after it passed `POST /proof/verify` (send `habit` there
too, so failed tries are counted per habit). Body: `{"oath","dayIndex","habit","verificationId"}`. The check must have been made for the habit's
own object (`habitObjects[habit]`, or the Oath's `object_id` text when none is stored) and the gesture issued for that habit.

- `201 {"habit":0,"done":[0],"dayKept":false}`: this habit is in, others are still to do.
- `201 {"habit":1,"done":[0,1],"dayKept":true,"signature":"…","proofHash":"…"}`: the last habit. The program gets `record_checkin` with
  `sha256(hash₀ ‖ hash₁ ‖ …)` in habit order; the photos themselves never reach the server.
- `409` the habit is already proven today, the challenge expired (`challengeExpired`), or no proof is possible now.
- `422` the check was for another object, gesture, Oath, day or habit, was used, or did not pass.
- `502 {"retryable":true}` the on-chain record failed: the last habit is not counted and the same check can be retried.

Group review of a habit's photo is **not** available in this flow (BACKEND_GAPS P1-27).

### POST /api/proof/challenge

Genesis, and the caller must be an Oath member. Returns today's step. Each challenge lasts 2 minutes.

```bash
curl -s -X POST $API/api/proof/challenge -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"oath":"<OATH>","dayIndex":0}'
```

- With `"habit": 0` in the body (one photo per habit): `{"phase":"habit","habit":0,"object":"dumbbell","gesture":"Victory","issuedAt":"…","expiresAt":"…","done":[1],"habits":2}`.
  `object` is what the phone's model is asked for; `done` the habits already proven today; `400` for a habit the Oath doesn't have, `409` (with `done`) for one already proven.
- Start (legacy): `{"phase":"start","photo":1,"gesture":"Victory","issuedAt":"…","expiresAt":"…"}`
- Waiting: `{"phase":"wait","photo":2,"startedAt":"…","endAllowedAt":"…","startGesture":"Victory","waitSeconds":1312}`
- End: `{"phase":"end","photo":2,"gesture":"Thumb_Up","issuedAt":"…","expiresAt":"…","startedAt":"…","endAllowedAt":"…","startGesture":"Victory"}`

Errors:
- `400`: `oath` or `dayIndex` missing.
- `403`: not a member.
- `404`: Oath not found.
- `409`: no proof is possible now (not active, outside the day window, or already kept).

### POST /api/proof/start

Genesis. Photo 1 of 2. The `verificationId` must come from a passing check for the Oath's object and
the current start challenge.

```bash
curl -s -X POST $API/api/proof/start -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"oath":"<OATH>","dayIndex":0,"verificationId":"<VERIFICATION_ID>"}'
# → 201 {"phase":"wait","photo":2,"startedAt":"…","endAllowedAt":"…","startGesture":"Victory","waitSeconds":1800}
```

Errors:
- `400`: fields missing.
- `403`: not a member.
- `404`: Oath not found.
- `409`: start photo already done, challenge expired (`challengeExpired: true`), or no proof possible now.
- `422`: the check is missing, failed, already used, expired, or for a different target. The body includes `expected`.

### POST /api/proof

Genesis. Photo 2 of 2. Records today's Oath check-in on-chain (`record_checkin`, signed by the verifier
key).

**Normal request (needs a `verificationId`)** from a passing check for the Oath's object and the end
challenge:

```bash
curl -s -X POST $API/api/proof -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"oath":"<OATH>","dayIndex":0,"verificationId":"<VERIFICATION_ID>"}'
# → 201 {"signature":"…","proofHash":"…","startHash":"…","endHash":"…","target":{"object":"running_shoe","gesture":"Thumb_Up"}}
```

**Exception: group review (no `verificationId`).** After 3 failed end-photo checks in a *group* Oath,
the app can send one of the failed photos for the other members to judge. The request sets
`review: true` and includes the photo exactly as it was sent to `POST /proof/verify`:

```bash
curl -s -X POST $API/api/proof -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"oath":"<OATH>","dayIndex":0,"review":true,"photo":"<BASE64_JPEG>"}'
# → 202 {"status":"PENDING_REVIEW","proofId":42,"proofHash":"…","target":{…}}
```

How group review works:
- **Gates it shares with the normal path:** membership, an active Oath, today's day window, a passed
  start photo with the wait over, and a fresh end challenge.
- **The server counts the failures.** It counts `FAIL` results from `POST /proof/verify` for the
  signed-in wallet, this Oath, this day, and today's photo-2 session (checked after the end photo
  opened). The checks must also be for today's object and the current challenge gesture. Checks sent
  without `oath`/`dayIndex`, or for another wallet, Oath, day, object, gesture or session, don't count.
  A new challenge with a different gesture starts a new count. Any `failedAttempts` or `detection` in
  the body is ignored.
- **Its own rules:** the Oath must be a group Oath (solo returns `409`); there must be at least 3 counted
  failures (`409`, with `failedChecks`); the photo must be 100 B – 8 MB (`413`); it must be the photo
  from one of the counted failed checks, matched by hash (`422`); and only one review photo is allowed
  per day (`409`). The stored detection labels come from that failed check.
- **What happens next:** nothing goes on-chain until a majority of the other members approve via
  `POST /api/reviews/:id`.
- **Storage:** this is the only case where a photo is stored. It's deleted when the group decides, or
  48 h after upload if they never do. Members see it only through `GET /api/oaths/:oath/reviews`.

Errors for both requests:
- `400`: the wrong request shape. Without `review: true` a `verificationId` is required; with it,
  `photo` is required.
- `403`: not a member.
- `404`: Oath not found.
- `409`: no start photo (`phase: "start"`); end photo not open yet (`phase: "wait"`, `endAllowedAt`);
  challenge expired; already recorded; or a pending check-in with a different photo.
- `422`: unusable check; for review, a photo that isn't one of the counted failed checks.
- `502`: the on-chain call failed (`retryable: true`; the check is released so it can be retried).
- `503`: verifier key not set.

### GET /api/oaths/:oath/reviews

Genesis, and the caller must be an Oath member. Lists today's photos waiting for group review, including
the image as a data URI and the votes so far.

```bash
curl -s $API/api/oaths/<OATH>/reviews -H "authorization: Bearer $TOKEN"
# → {"reviews":[{"id":42,"wallet":"<A>","dayIndex":1,"proofHash":"…","object":"running_shoe","gesture":"Thumb_Up","detected":{…},"approvals":0,"rejections":0,"reviewers":2,"myVote":null,"canReview":true,"image":"data:image/jpeg;base64,…"}]}
```

Errors: `403` not a member, or Oath not found.

### POST /api/reviews/:id

Genesis. Any Oath member other than the photo's owner can vote once, during the same Oath day.
- **Majority to approve:** more than half of the other members must approve. A tie rejects.
- **On approval:** the backend records the check-in with `sha256(startHash ‖ review photo hash)`.
- **Photo cleanup:** after either decision, the photo is deleted.

```bash
curl -s -X POST $API/api/reviews/42 -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"approve":true}'
# → 201 {"status":"RECORDED","signature":"…"}
```

`status` is one of `PENDING_REVIEW` (needs more votes), `REJECTED`, `PENDING` (another vote is
recording it) or `RECORDED`.

Errors:
- `400`: bad id or missing `approve`.
- `403`: not another member.
- `404`: no photo is waiting.
- `409`: already voted, or the day has ended.
- `502`: recording failed (retryable; your vote is undone).

### Photo history (removed)

`GET /api/photos/:oath/:day` and `GET /api/photos/file/:id` were removed. Passed photos are never
stored (only their hash), so the first always returned an empty list, and the second was shadowed by
the first. Both paths now get Express's default `404` (after the usual `/api` sign-in `401` and
Genesis `403` checks). A photo waiting for group review is the
only stored photo; members see it through `GET /api/oaths/:oath/reviews` until it is decided or expires.

### POST /api/push-token

Genesis. Registers an FCM device token for this wallet.

```bash
curl -s -X POST $API/api/push-token -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"token":"<FCM_TOKEN>"}'
# → 204 No Content
```

Errors: `400` invalid token (missing, or over 4096 characters).

### POST /api/nudges

Genesis. Sends a push to another member who hasn't checked in today. Each member can be nudged once
per day by each sender.

```bash
curl -s -X POST $API/api/nudges -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"oath":"<OATH>","recipient":"<WALLET>","dayIndex":1}'
# → 201 {"ok":true}
```

Errors:
- `400`: not today's day.
- `403`: Oath not active, or invalid member.
- `409`: already checked in.
- `429`: already nudged today.

### GET /api/price

Genesis. A placeholder SKR price for Devnet.

```bash
curl -s $API/api/price -H "authorization: Bearer $TOKEN"
# → {"usdPerSkr":0.01,"skrForUsd10":1000,"devnet":true,"label":"placeholder rate"}
```

## Profile

### GET /identity/:wallet

Signed in. Works for any wallet; no Genesis check. Says whether `:wallet` is eligible. Results are
cached for 60 seconds.

```bash
curl -s $API/identity/<WALLET> -H "authorization: Bearer $TOKEN"
# → {"wallet":"<WALLET>","genesis":true,"genesisMint":"<MINT>","source":"genesis_token","seatGenesisMint":"<MINT>","verifiedSeeker":true,"method":"genesis_token"}
```

- `source` is `genesis_token`, `devnet_allowlist` or null.
- `method` is the same value, but `"none"` instead of null.
- `verifiedSeeker` equals `genesis`.

Errors: `400` invalid wallet.

### GET /reputation/:wallet

Signed in. Works for any wallet. The counts come from three places:
- **Day counts:** check-ins recorded through the backend, and closed days the job marked missed. Only
  watched Oaths are covered.
- **Oath counts and streaks:** the on-chain Keeper account.
- **Bounty results:** the backend's bounty entries.

`keptRate` weights daily Oath tasks rather than whole Oaths: `keptDays / (keptDays + missedDays) * 100`.
It includes only recorded check-ins and closed days the job marked missed (watched Oaths); open days are
not failures. `percentage` is null when there is no history. Always show `keptDays`, `missedDays`, and
`sampleSize` next to the percentage so a small history is not mistaken for a reliable record. Bounties are
not included in this rate.

The app shows it as `86% · 12 kept / 14 tracked days` (percentage rounded to a whole number), or
`No kept-rate history yet · 0 tracked days` when `percentage` is null. It appears for your own wallet and,
from `GET /api/oaths/:oath/details`, for each Oath member. It is never shown as a trust label.

```bash
curl -s $API/reputation/<WALLET> -H "authorization: Bearer $TOKEN"
# → {"wallet":"<WALLET>","kept":12,"missed":2,"oathsKept":3,"oathsBroken":1,"keptRate":{"percentage":85.7,"keptDays":12,"missedDays":2,"sampleSize":14},"days":{"kept":12,"missed":2},"oaths":{"kept":3,"missed":1},"streak":{"current":7,"best":14},"keeper":"v4","bounties":{"joined":1,"completed":1,"out":0}}
```

`keeper` is `v4`, `needs_migration` or `none`. Errors: `400` invalid wallet.

## Bounty

Bounties are off-chain:
- **Joining:** free.
- **Each day:** two photos, same rules as Oaths. Miss a day and you're out.
- **Payout:** once the last day closes, the pool is split evenly among those still in. It's paid by SPL
  transfer from `BOUNTY_PAYER` (`faucet` by default, or `verifier`). Any remainder from the split stays
  with the payer.
- **One at a time:** only one bounty runs at once.

For every `:id` route, an unknown or malformed id (not a positive 32-bit integer) returns
`404 {"error":"Bounty not found"}`.

### GET /bounty/current

Signed in. Returns the open bounty (upcoming, active or paying out), or the most recently paid one if
none is open. `me` is the caller's entry, or null.

```bash
curl -s $API/bounty/current -H "authorization: Bearer $TOKEN"
# → {"bounty":{"id":1,"title":"Running shoes week","objectId":4,"object":"running_shoe","numDays":7,"daySeconds":86400,"minMinutes":30,"startTs":1791460800,"endTs":1792065600,"joinClosesAt":1791547200,"joinOpen":true,"currentDay":0,"status":"ACTIVE","mint":"<MINT>","payer":"<PAYER>","poolAmount":"1000000000","entrants":12,"stillIn":12,"estimatedShare":"83333333","paidAt":null},"me":null}
```

`status` is `UPCOMING`, `ACTIVE`, `PAYING` or `PAID`. When no bounty exists, the response is
`{"bounty":null,"me":null}`.

### GET /bounty/:id/recently-out

Signed in (no Genesis check, like `/bounty/current`). Lists entries that were knocked out for missing a
day, **newest first**:
- **Order:** `outAt` descending. Entries knocked out before `outAt` was recorded (`outAt: null`) come
  after all timed ones. Ties are broken by `outDay` descending, then `wallet` ascending.
- **`limit`:** 1–100, default 20. It trims `entries`; `total` counts every knocked-out entry.

```bash
curl -s "$API/bounty/1/recently-out?limit=5" -H "authorization: Bearer $TOKEN"
# → {"bountyId":1,"total":3,"entries":[{"wallet":"<A>","outDay":2,"outAt":"2026-10-12T00:00:41.000Z"},{"wallet":"<B>","outDay":1,"outAt":"2026-10-11T00:00:39.000Z"},{"wallet":"<C>","outDay":0,"outAt":null}]}
```

Errors:
- `400`: `limit` is not a whole number from 1 to 100.
- `401`: not signed in.
- `404`: bounty not found.

### POST /bounty/:id/join

Genesis. Free to join. Open until day 1 ends.

```bash
curl -s -X POST $API/bounty/1/join -H "authorization: Bearer $TOKEN"
# → 201 (same body as GET /bounty/current, with "me")
```

Errors: `404` bounty not found; `409` already joined, or joining has closed.

### POST /bounty/:id/challenge

Genesis, and the caller must have joined and still be in. Today's step, the same as
`POST /api/proof/challenge` plus `dayIndex`.

```bash
curl -s -X POST $API/bounty/1/challenge -H "authorization: Bearer $TOKEN"
# → {"dayIndex":0,"phase":"start","photo":1,"gesture":"Victory","issuedAt":"…","expiresAt":"…"}
```

Errors: `403` not joined; `404` bounty not found; `409` out of the bounty, bounty not running, or today
already kept.

### POST /bounty/:id/start

Genesis. Photo 1 of 2 for a bounty day.

```bash
curl -s -X POST $API/bounty/1/start -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"dayIndex":0,"verificationId":"<VERIFICATION_ID>"}'
# → 201 {"dayIndex":0,"phase":"wait","photo":2,"startedAt":"…","endAllowedAt":"…","startGesture":"Victory","waitSeconds":1800}
```

Errors:
- `400`: fields missing.
- `403`: not joined.
- `404`: bounty not found.
- `409`: wrong day, start already done, challenge expired, out, or not running.
- `422`: unusable check.

### POST /bounty/:id/proof

Genesis. Photo 2 of 2. Keeps the day. Only hashes are stored (`sha256(startHash ‖ endHash)`).

```bash
curl -s -X POST $API/bounty/1/proof -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"dayIndex":0,"verificationId":"<VERIFICATION_ID>"}'
# → 201 {"dayIndex":0,"proofHash":"…","startHash":"…","endHash":"…","daysKept":1,"target":{"object":"running_shoe","gesture":"Thumb_Up"}}
```

Errors:
- `400`: fields missing.
- `403`: not joined.
- `404`: bounty not found.
- `409`: wrong day, no start photo (`phase: "start"`), not open yet (`phase: "wait"`), challenge
  expired, already kept, out, or not running.
- `422`: unusable check.

## Admin

### POST /admin/run-jobs

Admin. Runs the background job now; it also runs every 60 seconds. If a run is already in progress, the
request waits for it and returns its report.

For each watched Oath, the job:
- records missed days as each day closes;
- sends the 2-hours-left reminder;
- re-reads the Oath on-chain and settles it once it's due and still Active;
- after settlement or cancellation, deletes photos and stops watching it.

Across all data, it also:
- deletes stored proof photos older than 48 h;
- knocks out bounty entrants who missed a day (and records `outAt`);
- pays out finished bounties. Payouts are idempotent per entrant.

```bash
curl -s -X POST $API/admin/run-jobs -H "x-admin-secret: $ADMIN_SECRET"
# → {"startedAt":"…","finishedAt":"…","oaths":3,"missedMarked":2,"settled":[{"oath":"<OATH>","signature":"…"}],"finished":["<OATH>"],"reviewPhotosDeleted":0,"errors":[],"bounties":[{"bounty":1,"knockedOut":1,"paid":[],"pending":[],"done":false}]}
```

Errors: `401` wrong or missing secret; `503` `ADMIN_SECRET` not set. A failure for one Oath goes in
`errors`; a failure for one bounty goes in `bounties[].error`.

### POST /admin/bounty

Admin. Creates the bounty, after checking that the payer's token balance covers the pool.

| Field | Required | Notes |
|---|---|---|
| `title` | yes | 1–80 characters |
| `objectId` | yes | 0–7, the same object ids as Oaths (4 = running_shoe) |
| `numDays` | yes | 3, 7 or 14 |
| `poolSkr` | yes | Whole SKR, e.g. `"1000"` or `"12.5"` |
| `startTs` | no | Unix seconds, not in the past. Default: now |
| `daySeconds` | no | 60–86400. Default 86400 |
| `minMinutes` | no | 1–720. Default 30 |

```bash
curl -s -X POST $API/admin/bounty -H "x-admin-secret: $ADMIN_SECRET" -H 'content-type: application/json' \
  -d '{"title":"Running shoes week","objectId":4,"numDays":7,"poolSkr":"1000"}'
# → 201 (same body as GET /bounty/current, with "me": null)
```

Errors:
- `400`: an invalid field.
- `401`: wrong secret.
- `409`: another bounty is still unpaid, or the payer's balance is too low (`{ payer, balance, pool }`).
- `503`: `STAKE_MINT` or the payer key is not set.

## Deployment identification and devnet funding diagnostics

`GET /health` returns `{ok:true,service:"kept-v4",apiVersion:4,build:{commit,sourceSha256,builtAt}}`.
The build hash covers backend source, Prisma schema/migrations and build inputs. An old response without
these fields cannot identify the current artifact. From the monorepo root, run `pnpm install --frozen-lockfile`
and `pnpm --filter kept-backend build`; start from `backend` with `pnpm start` (which runs
`prisma migrate deploy` before `node dist/index.js`). `dist` is cleaned before every build.

`/api/faucet` sends test SKR only. Devnet SOL must be obtained separately.

Oath settlement distributes the pot into member claimable payouts and treasury fee/dust; members then
claim through the on-chain `claim` instruction. Bounties instead transfer SPL tokens from their configured
payer directly to surviving entrants. Preview arithmetic is shared with the app and does not execute a payout.
