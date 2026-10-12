<!-- Release notes template, filled in by .github/workflows/release.yml (envsubst: TAG, REPO, SHOTS, APK_SIZE, APK_SHA256). -->
<p align="center">
  <img src="${SHOTS}/banner.png" alt="KEPT: keep your word, stake on it" width="100%">
</p>

## 📲 Download

**[⬇️ KEPT.apk](https://github.com/${REPO}/releases/download/${TAG}/KEPT.apk)** · Android 7.0+ · arm64 (Solana Seeker and any modern Android phone) · ${APK_SIZE} MB

1. Open the link above on your phone (or copy `KEPT.apk` over USB).
2. Tap the file and allow **Install unknown apps** when Android asks.
3. Open **KEPT** → **Get started** → **Try the demo**.

> **Try the demo** needs no wallet, no SKR and no internet: a sample account on a simulated backend, wallet and program.
> **Use my wallet** runs the real app on Solana **Devnet** with any Mobile Wallet Adapter wallet (Seeker Wallet, Phantom, Solflare).

## 📸 Screenshots

<p align="center">
  <img src="${SHOTS}/today.webp" width="200" alt="Today">&nbsp;
  <img src="${SHOTS}/oath.webp" width="200" alt="Oath HP and grid">&nbsp;
  <img src="${SHOTS}/create-terms.webp" width="200" alt="Read it like a contract">&nbsp;
  <img src="${SHOTS}/sworn.webp" width="200" alt="Sworn">
</p>
<p align="center">
  <img src="${SHOTS}/rematch.webp" width="200" alt="Rematch">&nbsp;
  <img src="${SHOTS}/wallet.webp" width="200" alt="Wallet">&nbsp;
  <img src="${SHOTS}/bounties.webp" width="200" alt="Bounties">&nbsp;
  <img src="${SHOTS}/profile.webp" width="200" alt="Profile and kept rate">
</p>

## 🔐 Verify

```
SHA-256  ${APK_SHA256}  KEPT.apk
```

<details>
<summary>Install from a computer</summary>

```bash
adb install -r KEPT.apk
```
</details>
