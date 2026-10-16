# Changes Made from the Old Version

This report describes the Oath payment and friend-invite updates made in commit `a2a5626`.

## Old behavior and updates

| Area | Old behavior | Updated behavior |
|---|---|---|
| Oath stake | New Oaths used SKR token accounts, and a user could be blocked for not having enough SKR. Solo Oaths also could not stake through the old Live transaction path. | New Oaths use native SOL. The app quotes SOL for the existing approximate $5, $10, and $25 stake choices. |
| Oath transactions | Create, join, settlement, and claim used SPL/SKR instructions. | Dedicated native-SOL instructions escrow and return SOL. The Oath account's rent reserve is preserved. The existing miss and payout rules continue to apply. |
| Price quote | The price route returned a placeholder SKR rate and was behind the Genesis requirement. | Signed-in users can fetch a cached SOL/USD quote without a Genesis token, allowing solo Oath creation to load its stake amount. |
| App balances and amounts | Oath screens and wallet summaries primarily displayed SKR. | New Oath stakes, miss costs, balances, and payouts display SOL. Existing SPL Oaths and Bounties continue to use SKR. |
| Friend invites | If invite lookup or creation failed after an Oath was created, the user could be left without a usable invite link. | The app restores a saved invite when available, creates one if needed, and offers a retry on the invite screen. Retrying invite setup does not repeat the stake transaction. |

## Invite recovery details

The Live API adapter now checks for a saved invite after Oath creation and remembers its code on the device. The backend exposes the member-only invite lookup for an Oath. If lookup fails or no invite exists, the app can create a new invite. The invite screen also gives the user a retry action and supports copying or sharing the generated link.

## Verification

- Connected Samsung S22: created a group Oath in Demo with a `0.05 SOL` stake, generated invite code `IRON-RT`, and copied the invite link.
- Mobile tests: 468 passed across 32 suites.
- Backend tests: 86 passed.
- Chain tests: 7 passed.
- Program tests: TypeScript suite passed; 31 Rust tests passed.
- Workspace typecheck, lint, backend build, and `git diff --check` passed.

## Deployment status

The source changes were pushed to `kept-dapp/main`. The S22 flow used Demo mode and did not sign a real wallet transaction. The matching on-chain program revision has not been deployed, so Live SOL create, join, settlement, and claim still require deployment and verification. Existing SPL Oaths and SKR Bounties remain supported.
