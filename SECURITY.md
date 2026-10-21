# Secrets and release signing

Commit only `.env.example` templates with placeholders. Keep real server credentials in the backend
host's secret environment settings (Render for the hosted API), or a git-ignored local `backend/.env`
for development. Never copy database passwords, session/admin secrets, OpenRouter keys, Firebase service
accounts, or Solana private keys into `EXPO_PUBLIC_*`, app code, issues, pull requests, or logs.
Public wallet/program addresses, transaction signatures, and the backend URL may stay in source.

## Check before committing

Install [Gitleaks](https://github.com/gitleaks/gitleaks#installing) 8.30.1 or newer (macOS: `brew install gitleaks`).
CI pins 8.30.1 and verifies the downloaded binary's archive against its SHA-256 checksum.

```sh
git config --local core.hooksPath .githooks
pnpm security:test
pnpm security:staged
pnpm security:scan
```

The hook scans staged changes and rejects sensitive filenames, including force-added ignored files.
`security:scan` scans all reachable Git history and exports the complete index to a private temporary
directory for scanning, then removes it. Stage intended changes first: the index is the content that
will be committed, and unstaged/ignored local files are outside this check. It does not contact providers
to validate credentials. Findings are redacted; do not publish unredacted scan output.

The scanner keeps the default Gitleaks rules and adds OpenRouter keys, KEPT credential assignments, and Solana 64-byte
keypair arrays. Only exact, known placeholders and two backend test values have narrow path-specific
exceptions. Example files, tests, and docs are still scanned. Inline `gitleaks:allow` comments are ignored.

GitHub Actions runs the same checks for pushes, pull requests, and manual scans. The release workflow
requires the scan to pass before building. Configure the secret-scanning job as a required check in
GitHub branch protection if merges must be blocked; committing this workflow does not change repository
settings or enable GitHub push protection.

## Android signing

Store `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and
`ANDROID_KEY_PASSWORD` in GitHub Actions Secrets. All four are required. CI decodes the keystore only
on the build runner, writes owner-only signing files, preserves special characters in passwords, and
removes both files after building even on failure. Only the APK and its checksum are published as release
assets. For local signing, follow [the frontend instructions](frontend/README.md#release-signing).

## If a real secret is found

Revoke or rotate it at its provider first. Remove it from the files and update the host's secret settings.
Deleting it in a new commit does not remove it from history. Coordinate any history cleanup with the
repository owner and other contributors; do not silence a real credential with an allowlist or baseline.
For wallet keys, protect funds and coordinate authority changes before replacing any configured signer.
These checks cannot prove the contents of Render or GitHub Secrets and cannot guarantee all leaks are detected.
