// Android debug builds (expo-dev-client) draw a floating gear button, the dev client's "Tools button", over the top-right of
// every screen. It sits on the app's own header controls (Today's bell and gear, Profile's gear, step counters). Its default
// is a manifest flag, so this turns it off for new installs; the dev menu (long-press the DEVNET badge, or shake) still has
// everything, and "Show tools button" in the dev client's own menu turns it back on. Release builds don't contain it.
const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

const KEY = "EXDevMenuShowFloatingActionButton";

/** Sets the flag on the manifest's <application>. Exported for the test. */
function setFabDefault(manifest, show = false) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, KEY, String(show));
  return manifest;
}

module.exports = (config) => withAndroidManifest(config, (c) => { setFabDefault(c.modResults); return c; });
module.exports.setFabDefault = setFabDefault;
module.exports.KEY = KEY;
