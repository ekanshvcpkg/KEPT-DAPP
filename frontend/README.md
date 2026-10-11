# frontend/

**UI**: the KEPT Android app for the Solana Seeker (Expo, React Native, TypeScript strict). Package `@kept/mobile`.

- `src/`: app code (components, features, screens, api and chain layers, state, theme, copy)
- `scripts/`: theme, layout, route and asset generators, plus screenshot and perf tooling
- `assets/`: raster assets synced from `design/assets`

Run it with `pnpm mobile:android` (first install) or `pnpm mobile:start`. See the root README.

## Live vs Demo, and the Dev menu

- **Demo** is the mock backend, wallet and chain, offline. **Live** is the real backend (`EXPO_PUBLIC_API_URL`, default the hosted Devnet one) and the wallet app through MWA, for every slice. A chosen mode decides alone, in development builds too: the Dev menu's slice overrides and mock wallet only apply while no mode is chosen and are never saved (only the mock scenario is).
- To try Live on an emulator you need a wallet app that speaks MWA (Phantom, or the MWA `fakewallet`); to use no wallet, use Demo.
- `EXPO_PUBLIC_*` values are inlined when Metro bundles the JS. A development build needs **no native rebuild** after changing one: restart Metro with `--clear` (`pnpm mobile:start -- --clear`). A release APK embeds them, so it must be rebuilt.
- This app reserves Metro port 8082 because the legacy harness may use 8081. `pnpm mobile:start` and `pnpm mobile:android` use 8082 by default; over USB, run `adb reverse tcp:8082 tcp:8082`. The dev client URL is `exp+kept://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082`.

## Release signing

Release builds are signed with your own upload key when `frontend/keystore.properties` exists, and with
the debug key otherwise (`plugins/withReleaseSigning.js` writes this into the generated `android/` on every
prebuild). The key and the properties file are git-ignored; never commit either.

One-time setup (JDK 17's `keytool`; keep the passwords in a password manager):

```bash
keytool -genkeypair -v -keystore ~/keys/kept-release.keystore -alias kept -keyalg RSA -keysize 2048 -validity 10000
```

Then create `frontend/keystore.properties`:

```properties
storeFile=/Users/<you>/keys/kept-release.keystore
storePassword=<store password>
keyAlias=kept
keyPassword=<key password>
```

Build and check the signer:

```bash
npx expo prebuild -p android && cd android && ./gradlew assembleRelease
```

```bash
$ANDROID_HOME/build-tools/<version>/apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
```

Back up the keystore: an app signed with a lost key can't be updated on phones that have it. A phone with
a debug-signed build must uninstall it before installing one signed with your key.

**A Live release** also needs the server: `EXPO_PUBLIC_API_URL=https://<your backend>` (plus
`EXPO_PUBLIC_STAKE_MINT`) in `frontend/.env` before building. Without it, Live shows "This build has no
server address" and only Demo works.
