// Release signing without committing a key. `android/` is generated (prebuild), so this plugin writes the
// signing config into app/build.gradle each time. It reads frontend/keystore.properties (git-ignored):
//   storeFile=/absolute/or/relative/to/frontend/kept-release.keystore
//   storePassword=…  keyAlias=…  keyPassword=…
// Without that file, debug builds still work, but release packaging fails instead of using the debug key.
// See README › Release signing.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARK = "// kept: release signing (plugins/withReleaseSigning.js)";

const LOADER = `${MARK}
def keptSigning = null
def keptSigningFile = new File(rootDir, "../keystore.properties")
if (keptSigningFile.exists()) {
    keptSigning = new Properties()
    keptSigningFile.withInputStream { keptSigning.load(it) }
    ["storeFile", "storePassword", "keyAlias", "keyPassword"].each { k ->
        if (!keptSigning[k]) throw new GradleException("keystore.properties is missing " + k)
    }
    def store = new File(keptSigning["storeFile"])
    keptSigning["storeFile"] = (store.isAbsolute() ? store : new File(keptSigningFile.parentFile, keptSigning["storeFile"])).absolutePath
} else {
    logger.warn("keystore.properties not found: release packaging will fail; debug builds remain available")
}
`;

const GUARD_MARK = "// kept: refuse unsigned or debug-signed release packaging";
const RELEASE_GUARD = `${GUARD_MARK}
gradle.taskGraph.whenReady { graph ->
    def packagesRelease = graph.allTasks.any { task ->
        def name = task.name.toLowerCase()
        name.contains("release") && (name.startsWith("assemble") || name.startsWith("bundle") || name.startsWith("package") || name.startsWith("install"))
    }
    if (keptSigning == null && packagesRelease) {
        throw new GradleException("Refusing to package a release without frontend/keystore.properties and a private upload key.")
    }
}
`;

const RELEASE_CONFIG = `
        if (keptSigning != null) {
            release {
                storeFile file(keptSigning["storeFile"])
                storePassword keptSigning["storePassword"]
                keyAlias keptSigning["keyAlias"]
                keyPassword keptSigning["keyPassword"]
            }
        }`;

function apply(src) {
  let out = src;
  if (!out.includes(MARK)) {
    out = out.replace(/\nandroid \{/, `\n${LOADER}\nandroid {`);
    out = out.replace(/signingConfigs \{/, `signingConfigs {${RELEASE_CONFIG}`);
    // The release build type uses only the private upload key; no debug-key fallback.
    out = out.replace(/(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig keptSigning != null ? signingConfigs.release : null");
  } else {
    // Migrate generated Gradle files from earlier plugin versions too.
    out = out.replace("signingConfig keptSigning != null ? signingConfigs.release : signingConfigs.debug",
      "signingConfig keptSigning != null ? signingConfigs.release : null");
    out = out.replace("keystore.properties not found: release builds are signed with the debug key",
      "keystore.properties not found: release packaging will fail; debug builds remain available");
  }
  if (!out.includes(GUARD_MARK)) out = `${out.trimEnd()}\n\n${RELEASE_GUARD}`;
  if (!out.includes(MARK) || !out.includes("signingConfig keptSigning != null ? signingConfigs.release : null") || !out.includes(GUARD_MARK)) {
    throw new Error("withReleaseSigning: app/build.gradle didn't have the expected shape");
  }
  return out;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    c.modResults.contents = apply(c.modResults.contents);
    return c;
  });
};
module.exports.apply = apply;
