// plugins/withReleaseSigning.js: release packaging requires keystore.properties; debug uses the debug key.
const { apply } = require("../../plugins/withReleaseSigning") as { apply: (s: string) => string };

const GRADLE = `apply plugin: "com.android.application"

android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled true
        }
    }
}
`;

describe("release signing plugin", () => {
  it("adds a release config read from keystore.properties, used only when the file exists", () => {
    const out = apply(GRADLE);
    expect(out).toContain('new File(rootDir, "../keystore.properties")');
    expect(out).toMatch(/signingConfigs \{\s+if \(keptSigning != null\) \{\s+release \{/);
    // Debug stays on the debug key; release never falls back to it.
    expect(out).toMatch(/debug \{\s+signingConfig signingConfigs\.debug/);
    expect(out).toContain("signingConfig keptSigning != null ? signingConfigs.release : null");
    expect(out).toContain("Refusing to package a release without frontend/keystore.properties");
    expect(out).not.toContain("signingConfig keptSigning != null ? signingConfigs.release : signingConfigs.debug");
    expect(out).not.toMatch(/storePassword ['"][^k]/); // no literal secrets
  });
  it("is idempotent, and fails loudly on an unexpected file", () => {
    expect(apply(apply(GRADLE))).toBe(apply(GRADLE));
    expect(() => apply("android {}")).toThrow(/expected shape/);
  });
});
