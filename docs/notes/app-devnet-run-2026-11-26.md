# App-driven Live run on Devnet (2026-11-26, Samsung SM-A528B + Phantom)

The KEPT app (debug build, Live mode, local backend on HEAD of branch `hackathon`, real OpenRouter vision model
`google/gemma-3-27b-it`) against program `7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj`. Solo Oath, 3 days of 120 s
(debug build), stake $5 = 0.070288887 SOL. Wallet `EnD2dXFruNSTBTrZsmVT2wtDuewATAvo2hfoNqwun6hg`.

| Time (UTC) | What | Evidence |
|---|---|---|
| 04:23:14 | Sign & stake (create_oath_sol, solo starts at once) | [tx](https://explorer.solana.com/tx/3KVr6xkP7Ax4qJLS3fLmSfCXiioLiHpjqzTuK5zsZSzXNHx8aFW3b67swExGc5q59qWBQuJ9edm4LEgi1oSA1qet?cluster=devnet) |
| day 1 | no photo in time: missed | |
| 04:25:43 | day 2, photo 1: the Keeper rejects it ("The required gesture is not visible"); fail receipt `f62846755a…` published in an SPL Memo | memo `3KrgEtdH…` |
| 04:26:16 | day 2, photo 2: pass (object 0.95, gesture matched); receipt `0a46955856…` | |
| 04:26:42 | record_checkin day 2, proof_hash = sha256(receipt hash), signed by verifier 6tcC… | [tx](https://explorer.solana.com/tx/56FCHqE8Pgu52QVFsikdPrYKGxmbKuyHDSsTDgaXKpvJorG5EMdQAEpPv1qpMDKfPXpPGerGufXEbxS73G4LedQe?cluster=devnet) |
| 04:28:58 | record_checkin day 3 | [tx](https://explorer.solana.com/tx/5Hqv8Pf8FNAADa53RA88MNRXr5CwmreQkMPtVPL3JTyXwa7sd4Q9zyYdhyv5cpqHEXpkJALbqPtTxGYwzAQiqprc?cluster=devnet) |
| 04:31:45 | Settle now (settle_oath_sol) | [tx](https://explorer.solana.com/tx/32fta5f583QKW6LZEPueMcQbuMkARui82qRy79EcXmi9JVTi3rWphzBGwxTZ7CnRi6BWcct5pau1DN1Emr1GWthN?cluster=devnet) |
| 04:32:11 | Claim (claim_sol) | [tx](https://explorer.solana.com/tx/4qbaLisirNMvTjhMEJm9nKmdNuKDwgDH8TzRC1UkvEbSMjzyfsRv7RCbzszKGj38quU9xejJe5RCkQKLscxntu8v?cluster=devnet) |

Checked from chain: status settled, days kept = days 2 and 3, payout 0.063259999 SOL = replayV3 (stake − one 10 % miss),
0.007028888 SOL to the treasury, claimed. The day-2 audit (receipt re-hash → combined hash → CheckinRecorded proof_hash) matches.

Found during the run: Phantom declines `reauthorize` for KEPT because keptdapp.vercel.app's assetlinks.json lacks the
`delegate_permission/common.get_login_creds` relation (Google DAL API: handle_all_urls linked, get_login_creds not). The app
now skips silent re-authorization unless `EXPO_PUBLIC_APP_IDENTITY_VERIFIED=1`; a locked Phantom can also drop the first
connect request (unlock Phantom first).

2026-11-27: why Phantom shows keptdapp.vercel.app, not the Vercel project: the wallet shows the MWA identity URI the build
was given (`EXPO_PUBLIC_APP_IDENTITY_URI` in frontend/.env, a friend's site), not anything from the Vercel dashboard. KEPT's own
site, https://kept-keeper.vercel.app (repo `site/`), serves assetlinks.json with `get_login_creds` for the debug and release
keys. Profile › Settings › "Wallet identity: KEPT's own site" (Live only, off by default; `useSettings().verifiedIdentity`)
makes chain/mwa.ts ask the wallet as `{ name: "KEPT", uri: "https://kept-keeper.vercel.app" }` and re-authorize silently; off
is the build's identity exactly as before. The saved auth token records the identity it was issued for and is dropped when
the identity changes (switching the row also forgets it), so the next wallet step authorizes afresh. If the wallet won't
connect with it on (Phantom refused it once on the debug build, possibly a cached verdict), turn it off. Tests:
frontend/src/__tests__/walletIdentity.test.tsx.
