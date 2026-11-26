# KEPT: dApp Store assets

The requirements come from the [Listing Page Guidelines](https://docs.solanamobile.com/dapp-store/listing-page-guidelines)
and [Submit a New App](https://docs.solanamobile.com/dapp-store/submit-new-app), fetched 2026-11-26. Screen IDs
(B1, C7, F5 …) are the ones in `design/screens.md`.

## Summary

| Asset | Required size and format | Status |
|---|---|---|
| App icon | **512×512 px**, must have a background colour (**no transparency**) | Ready: [`assets/icon-512.png`](assets/icon-512.png) |
| Banner | **1200×600 px** | Ready: [`assets/banner-1200x600.png`](assets/banner-1200x600.png) |
| Screenshots and/or videos | **4 to 8** in total. Images: JPG, PNG, GIF or WebP, **≤ 3 MB each**. The first preview sets the orientation, portrait **9:16** or landscape **16:9**, and **every other preview must have the same dimensions**. At least 1080 px wide and tall is recommended | To capture (plan below) |
| Video (optional) | `.mp4`, **≤ 30 MB**, 1920×1080 strongly recommended | Optional. It counts toward the 4-8 previews and must match the first preview's dimensions (see below) |
| Feature graphic / promo image | Not mentioned in the current docs | Not needed |

## Icon

`assets/icon-512.png` is `frontend/assets/brand/kept-app-icon.png` (the icon the APK uses) with its transparent rounded
corners filled with the app background `#131313`. It was checked as opaque with ImageMagick. Command used:

```bash
magick frontend/assets/brand/kept-app-icon.png -background '#131313' -alpha remove -alpha off docs/dapp-store/assets/icon-512.png
```

If the store adds its own rounded mask and the dark corners look odd, export a full-bleed square version (lime
gradient to the edges) from `design/assets/` instead.

## Banner

`assets/banner-1200x600.png` is `docs/screenshots/banner.png` (2560×1280, the same 2:1 ratio) scaled down. It reads
"Keep your word. Stake on it." and shows Demo-mode screens, with no gambling words. One thing to be aware of: its
subtitle says "stake SKR", while Live on Devnet stakes SOL. That's acceptable, because Demo uses SKR. Edit the source
art if the team wants it to say SOL.

```bash
magick docs/screenshots/banner.png -resize '1200x600!' docs/dapp-store/assets/banner-1200x600.png
```

## Screenshots: what to capture

**Use portrait 1080×1920 (9:16) for every preview.** The phone (Samsung SM-A528B) captures 1080×2400 (20:9), which
isn't 9:16, so each capture gets placed on a 1080×1920 canvas (command below). The 540×1212 images in
`docs/screenshots/` are too small and also not 9:16. Recapture instead of upscaling them.

Capture **from the Live build on Devnet** wherever it can be done. These are the features that were proven today, and
they're what makes KEPT different. Use Demo mode only for screens Live can't show yet. Use the release APK (or the debug
build if it looks the same) with the Devnet badge visible.

| # | Screen to capture | ID | Mode | Caption (optional, ≤ 6 words) | Why |
|---|---|---|---|---|---|
| 1 | Today with an active Oath, HP bar and "Prove" button | B1 | Live | Keep your word, every day | The core loop at a glance |
| 2 | Signing screen: IDL-decoded transaction and simulated SOL change (e.g. "Stake 0.0703 SOL … Your wallet: -0.0731 SOL"), **before** tapping "Open wallet to sign" | C7 | Live | See exactly what you sign | Explain before sign |
| 3 | Proof camera with the object and the gesture prompt on screen | F1 | Live | One live photo, one gesture | Camera-only proof |
| 4 | Verdict "Kept" with the Keeper's reason (e.g. "The photo shows a real scene with a water bottle and a clear thumbs up gesture.") | F5 | Live | The Keeper checks every photo | The AI judge |
| 5 | Audit the Keeper: receipt hashes re-computed, matching the chain | F5 (Audit sheet) | Live | Audit the Keeper | Checkable AI |
| 6 | Group Oath detail: shared HP bar and day grid | D2 | Live (group) or Demo | One HP bar for everyone | Group stakes |
| 7 | Claim with the exact payout | J1 / J1·ok | Live | Claim what you kept | Settle and claim on chain |
| 8 | Invite by code or QR | C8 | Live | Bring your friends | Social |

Six screenshots (1-5 and 7) are enough. Add 6 and 8 to reach eight, or swap one for a video.

**Don't capture these** (gambling wording or not real in Live):

- A1 Welcome: its title is "Bet your friends you'll do it."
- Any screen where the Keeper says "Every Oath here is a bet on someone." (the idle line on the Oaths list; check D0 before capturing it)
- The odds chips on group Oath cards (D0, D2). If they show up, crop them out or pick a moment where they don't appear
- Rematch, Bounty creation and group photo review: Demo only, and the listing must not suggest they work in Live
- Any personal photo, real face, or notification from another app

### How to capture and frame

```bash
# On the phone (USB debugging on), one screen at a time:
adb exec-out screencap -p > raw/01-today.png

# Frame each capture to 1080x1920 on the app background (no upscaling, kept centred):
mkdir -p docs/dapp-store/screenshots
for f in raw/*.png; do
  magick "$f" -resize 1080x1920 -background '#131313' -gravity center -extent 1080x1920 \
    "docs/dapp-store/screenshots/$(basename "${f%.png}").png"
done

# Check: all 1080x1920 and under 3 MB
identify docs/dapp-store/screenshots/*.png
du -h docs/dapp-store/screenshots/*.png
```

A 1080×2400 capture fits as an 864×1920 strip with dark side bars. To use the bars, add a short caption above each
strip (the "Caption" column) in Geist on `#131313` with the lime accent. This is optional.

Before capturing: put the phone in Do Not Disturb, charge it above 50 %, turn the Keeper voice on if a screen shows a
voice indicator, and remember that wallet addresses are public on Devnet (they're fine to show).

## Video (optional)

If you add a video to the store previews, it must have the **same dimensions as the first preview**. With portrait
screenshots, export it at 1080×1920, not 1920×1080. Otherwise make the video the first preview and use landscape
1920×1080 screenshots. It must be `.mp4` and at most 30 MB. The hackathon demo video (under 3:00, usually landscape) is
a separate file and can't be uploaded here as-is.

## Final check before upload

- [ ] `icon-512.png`: 512×512, opaque
- [ ] `banner-1200x600.png`: 1200×600
- [ ] 4-8 previews, all exactly 1080×1920, each ≤ 3 MB (videos ≤ 30 MB, .mp4)
- [ ] No "bet", "odds" or "bookie" visible anywhere in the images
- [ ] Every Live screenshot shows something proven on the phone, nothing mocked up
