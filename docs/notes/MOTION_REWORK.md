# Motion rework (branch `motion-rework`)

Frontend only. Nothing here is on `main`; merge when you're happy (bottom of this page).

## What changed, in plain language

- **The Keeper is drawn with Skia.** Same shapes, colours, moods, props, hand poses and timings, from the
  same rig (`rig.ts › keeperFrame`), but drawn on one Skia canvas on the UI thread. Before, every frame
  pushed new props into ~40 react-native-svg nodes. Now the still parts (body, head, each mood's face,
  props, each hand pose) are recorded once as pictures, and a frame only moves about 30 nodes. The 30 fps
  cap from D-84 is gone: he animates at the display's rate.
- **The old SVG Keeper is gone.** It stayed behind a flag until the Skia one was approved (2026-10-11),
  then it, the flag and the side-by-side dev screen were removed (see "Cleanup" below).
- **The splash Check-K** draws in with Skia (a trimmed stroke) instead of animating SVG dash offsets.
- **No animation moves layout or colours any more**, except the tab bar (see "Skipped"): the settings
  toggle's knob and the camera's scan line now slide with transforms; the flow step bar cross-fades
  stacked colour layers instead of animating its background colour.
- **Long lists are virtualised.** The inbox (N1), your activity (I5), Oath history (D5) and Browse
  Bounties (H7) mount only the rows near the screen (FlatList). The blocks above stay a header, spacing
  and the screen's entrance are the same; rows that scroll in later just appear.
- **Two pressables now react at touch-down:** the camera's flip button and the Keeper note's action
  (before, nothing moved until the camera turned or the next screen opened).
- **Perf tooling:** `perf.mts` has new phases (splash, A1 and Today while their loops play and at rest,
  embers on D3), records the device and refresh rate, never taps outside KEPT (a run found the app gone,
  and fixed coordinates had been tapping the launcher), finds top-anchored controls by label, and saves a
  screenshot when it stops.

## Numbers

Device: **Android emulator** `Medium_Phone_API_37.0` (sdk_gphone64_arm64, 1080 × 2400, 420 dpi, **60 Hz**),
host GPU (Apple M5). **No phone was connected.** Release builds, Demo, `node scripts/perf.mts`.
"Before" is `main` at the branch point (73e3e44); "after" is this branch. Three runs each, alternated
(before, after, before, …); medians, with each run's janky % in brackets. The emulator's speed drifts a
lot over hours (the same APK's A1 ranged from 12 to 51 fps across this session), so read the before/after
pair, not the absolute values.

| Phase | Before: janky % | Before: p50 / p90 ms | Before: fps | After: janky % | After: p50 / p90 ms | After: fps |
|---|---|---|---|---|---|---|
| Splash (A0, 1.6 s) | 60 (86, 60, 43) | 61 / 125 | – | 49 (49, 47, 68) | 65 / 150 | – |
| A1 while its loops play | 100 (100, 100, 100) | 200 / 250 | 11.6 | **63** (51, 66, 62) | **77 / 97** | **32** |
| A1 at rest (the Keeper alone) | 98 (100, 98, 98) | 150 / 150 | 16.3 | **73** (67, 73, 77) | **61 / 109** | **20.5** |
| Today while its loops play | 10.6 (10, 11, 11) | 22 / 57 | 54.6 | 11.6 (10, 12, 12) | 25 / 61 | 53.4 |
| Today at rest | (6 frames in 6 s) | – | 1 | (6 frames in 6 s) | – | 1 |
| Tab switches ×8 | 2.7 (3, 3, 2) | 17 / 23 | – | 2.7 (3, 3, 2) | 17 / 23 | – |
| Bounties scroll | 24.4 (24, 25, 23) | 34 / 73 | – | 30.9 (28, 32, 31) | 36 / 73 | – |
| Push / back ×4 (Inbox) | 3.6 (4, 4, 5) | 17 / 28 | – | 2.8 (3, 3, 3) | 21 / 27 | – |
| Embers (D3, 5 s) | 4.7 (4, 5, 6) | 17 / 22 | 59 | 4.0 (4, 4, 4) | 22 / 28 | 59.4 |

- **Failure lines and ANRs:** 0 sync-props failures, 0 ANRs in every run.
- **All 117 screens shoot** (`node scripts/shoot.mts`, development build): 117 screens, 0 with errors (no
  JS errors, red boxes or crashes). The development build is slow, so several shots caught a screen
  still on its skeleton; the inbox, A1, Today and the Keeper comparison pages were also checked on the release build.
- **Cold start** (median of 3 per run): before 2049 / 3138 / 2124 ms, after 2004 / 2411 / 2255 ms: no change
  beyond noise.
- **APK size:** 22,689,555 → 27,841,607 bytes (**+5.15 MB**, Skia's native library, arm64 only).
- **Earlier, quieter runs** of the Keeper alone on A1 at rest (same emulator, an hour before, alternating):
  SVG 15.7 / 19.8 fps, 98 / 96 % janky, p50 150 / 117 ms; Skia 41.7 / 36.7 fps, 21 / 24 % janky, p50 16 / 25 ms.
- **The display rate:** the emulator is 60 Hz. With Skia the Keeper's frames are requested at 60 Hz;
  on A1 the emulator keeps up 32–42 fps of it in these runs. Whether a Seeker holds 60 (or 120) needs the phone.
- **Bounties scroll got a little worse** (24 → 31 %). This branch also carries `main`'s latest Screen
  change (one ScrollView, merged in during the work), which the "before" build doesn't have, and the
  scroll phase was the noisiest in the session (0.6–28 % on the same APK). I can't attribute it from the
  emulator; check it on the phone.

### Effect by effect (step 3)

| Effect | Measured | Decision |
|---|---|---|
| Keeper | A1 at rest above | Skia |
| Splash Check-K | splash above (no real difference; it animated SVG props, which the rule forbids) | Skia |
| Embers (22 particles with glow) | Skia canvas 3.1 / 4.4 % janky, 59 fps vs views 3.4 / 4.8 %, 59.6 / 58.8 fps (alternating) | **Left as views**: no gain |
| Ambient orbs and beam | A1 with its loops vs at rest, same build: no extra jank from the loops | **Left**: already transform / opacity, cheap |
| Rings | none animate their stroke (the sign pulse is opacity + scale) | Nothing to move |

### Loop budget (step 5)

Today with its loops playing (orbs, the + glow, card breath) runs ~10–12 % janky frames at ~54 fps and
keeps the whole window redrawing; at rest it draws nothing. Running them all the time would bring that
back forever, so **the ~10 s budget stays for every effect** (no commit). On A1 the loops cost nothing on
top of the Keeper, but A1 is a one-time screen, so there was nothing worth changing.

## Choices I made where I would have asked you

| Choice | Why | How to undo |
|---|---|---|
| Skia **2.6.2**, the version `npx expo install` picks for SDK 57 (released April 2026). Its docs at that tag require RN ≥ 0.79 and React ≥ 19, and take Reanimated (≥ 3.19) shared values as props; the New Architecture build and run were proved on the emulator. | Your instruction | — |
| pnpm is allowed to run Skia's postinstall (`allowBuilds` in `pnpm-workspace.yaml`) | It copies the prebuilt binaries; without it the build has no Skia | Remove the line (and Skia) |
| The SVG Keeper behind a switch (Dev menu, `EXPO_PUBLIC_KEEPER`) and a side-by-side dev screen, while you compared | "behind a dev flag" | Removed after approval; revert commit b1f4c3a to bring both back |
| Still parts drawn live for the first few ms until their picture is recorded | So nothing pops in on first use | — |
| The tab bar's widening tab still animates `flex` | Doing it with transforms needs the pill drawn in pieces; it changes how it's built and risks how it looks | — (listed under Skipped) |
| Embers, orbs and beam left as views | No measurable gain from Skia | — |
| Lists: rows after the first 12 appear without the entrance animation | Before, the whole list was one block that entered at once; rows mounted by scrolling would otherwise animate in, which they never did | Wrap every row in `Enter` in `Screen.tsx` |
| Perf push/back phase opens Inbox from the bell instead of tapping Today's card | A missed card tap followed by Back closed the app | — |

## Skipped, and why

- **Tab bar width (animates `flex`, layout).** Would need the active pill rebuilt from transformed parts;
  listed rather than risk the look. It runs only for 250 ms on a tab change (tab switches measure 2.7 % janky).
- **Count-ups (`CountText`)** re-render text from JS each frame for ~0.9 s. Not a transform/opacity
  animation, but moving numbers to the UI thread would mean an animated text input, which changes how the
  text is laid out. Left; worth a look if the money moments feel heavy on the phone.
- **Oaths tab and Bounties › Joined lists** live in tab screens (`TabScreen`), not `Screen`; they weren't
  converted. Live users rarely have many running Oaths; history (D5) is virtualised.
- **Touch response was checked in code, not timed on a device.** Every `PressScale` starts its press scale
  (90 ms) at touch-down, before its press handler runs navigation or network work; the two raw pressables
  without feedback were fixed. Toggles, sheet scrims and the Keeper (which changes its line) respond with
  their own state change. A frame-by-frame timing needs the phone and a high-speed recording.

## Skia's per-frame log line (D-90)

A transparent Skia canvas on Android renders through a TextureView, and Skia 2.6.2 (still in 2.15.1) calls
`SurfaceTexture.updateTexImage()` before every frame. The texture belongs to the TextureView, so the call
always fails: Java throws `IllegalStateException` on the UI thread, Android logs "updateTexImage:
LegacySurfaceTexture is not attached!", and Skia catches it and logs "updateAndRelease() failed. The
exception above can safely be ignored".

Measured on the release build, A1 with the Keeper at rest, 8 s windows, three alternating rounds:

| Build | Log lines from the app | Exceptions | Frames (8 s) | Janky | p50 / p90 ms |
|---|---|---|---|---|---|
| As shipped | 607 / 570 / 542 (two per Skia frame, 35–75 / s) | one per Skia frame (303 / 285 / 271) | 202 / 166 / 166 | 70 / 76 / 75 % | 61–81 / 109–150 |
| Patched | 4 / 0 / 0 | 0 | 193 / 169 / 366 | 71 / 76 / 7 % | 57–69 / 113–117 (round 3: 16 / 17) |
| Keeper frozen | 0 | 0 | 114 / 130 / 60 | 56 / 61 / 0 % | 57–61 / 105–109 |

Every call failed (exceptions = Skia frames), and the line was essentially the app's entire log output.
The frame-time difference is inside the emulator's noise (round 3 drifted for every build). Full
perf.mts runs agree: A1 at rest 21.5 fps / 67 % janky as shipped, 17.5 fps / 77 % patched; Today, tabs,
push/back and embers within a point. So the cost per frame isn't measurable here, but the log flood is
real, so the call and its log are removed by a pnpm patch at that one site
(`patches/@shopify__react-native-skia@2.6.2.patch`, D-90). Drawing is unchanged. `perf.mts` now counts
the line and fails above `--max-skia-lines` (0): 1,537 lines on the shipped build, 0 patched.

## Comparisons recorded for you (`artifacts/motion/`, local, not in git)

Made with the side-by-side dev screen, since removed:

- `compare-moods|props|hands|busts-svg-vs-skia.png`: every mood, prop and hand pose, SVG left, Skia right.
- `keeper-<anim>-svg-vs-skia.mp4` for idle, peek, popin, flip, wave, point, tap, thumbs, jump, shrug.
- `compare-a1-first-skia-build-hands-bug.png`: the one difference found (all hand poses drawn at once, a
  picture ignoring a group's opacity), fixed before the videos.
- `baseline.apk` (before), `after.apk` (this branch), `baseline-still.apk` (Keeper frozen, for measuring).

## Install and test this branch on your phone

```bash
git fetch && git checkout motion-rework && pnpm install
```

```bash
cd frontend/android && ./gradlew assembleRelease
```

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

(If the phone has a build signed with another key, uninstall KEPT first.) Then run the same measurement
on the phone (it names the device in its output):

```bash
cd frontend && node scripts/perf.mts android/app/build/outputs/apk/release/app-release.apk --out ../artifacts/perf/phone-after.json
```

**Measuring with the Keeper frozen:** `EXPO_PUBLIC_KEEPER_STILL=1` when building (with
`./gradlew assembleRelease --rerun-tasks`, so the JS bundle is rebuilt) holds every Keeper still.

## What to look at first

1. A1 (the welcome screen) and any result screen with the big Keeper: is he smooth, and does he look
   exactly as before?
2. The splash on a cold start (the Check-K drawing in).
3. Scroll the inbox, your activity and Oath history.
4. Bounties scroll, the one number that moved the wrong way on the emulator.

## Cleanup after approval (2026-10-11)

One commit per group, each revertable:

| Commit | Removed |
|---|---|
| b1f4c3a | `KeeperSvg.tsx` (343 lines), `dev/KeeperCompare.tsx` and its route and `kept://dev/keeper/…` link, the Dev menu row, `EXPO_PUBLIC_KEEPER` and the saved renderer setting; the icon font drops "matrix", which the icon scanner had picked up from KeeperSvg |
| 7f58f90 | `export` from 6 values and 47 types (two were re-exports) nothing outside their file imports (knip) |
| 9a76869 | `additions.placeholder` copy (the Phase 2 placeholder screen is long gone) and two test checks for it |
| 7b911c9 | three comments describing code that no longer exists |
| a8ececa | six theme metrics nothing reads |

`frontend` + `packages` (ts/tsx/js/json source, generated files excluded): 228 → 226 files, 24,748 → 24,329
lines. Release APK 27,846,171 → 27,824,523 bytes; JS bundle 6,081,860 → 6,060,316 bytes (both builds include
the Skia patch and main's latest commits). After: typecheck, lint (0 warnings), 317 Jest tests and package
tests pass, the release build runs, and all 117 screens shoot with 0 errors.

## Merge when you're happy

```bash
git checkout main && git pull && git merge --no-ff motion-rework && git -c http.postBuffer=157286400 push
```
