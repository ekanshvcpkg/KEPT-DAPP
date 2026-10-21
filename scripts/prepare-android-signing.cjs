#!/usr/bin/env node
const { writeFileSync, rmSync } = require("node:fs");
const { resolve } = require("node:path");

// java.util.Properties reads ISO-8859-1 and interprets escapes. Preserve passwords exactly.
function property(value) {
  return value.replace(/[\\\s:=#!\u007f-\uffff]/g, (char) =>
    `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function prepare(directory, env) {
  const required = ["KEYSTORE_BASE64", "KEYSTORE_PASSWORD", "KEY_ALIAS", "KEY_PASSWORD"];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing release signing credentials: ${missing.join(", ")}`);

  const encoded = env.KEYSTORE_BASE64.replace(/\s/g, "");
  const key = Buffer.from(encoded, "base64");
  if (!key.length || key.toString("base64") !== encoded) {
    throw new Error("KEYSTORE_BASE64 must contain a valid base64-encoded keystore.");
  }

  const files = [];
  try {
    for (const [name, content] of [
      ["kept-release.keystore", key],
      ["keystore.properties", [
        "storeFile=kept-release.keystore",
        `storePassword=${property(env.KEYSTORE_PASSWORD)}`,
        `keyAlias=${property(env.KEY_ALIAS)}`,
        `keyPassword=${property(env.KEY_PASSWORD)}`,
        "",
      ].join("\n")],
    ]) {
      const path = resolve(directory, name);
      writeFileSync(path, content, { mode: 0o600, flag: "wx" });
      files.push(path);
    }
  } catch (error) {
    for (const path of files) rmSync(path, { force: true });
    throw error;
  }
}

if (require.main === module) {
  try {
    prepare(resolve(__dirname, "../frontend"), process.env);
  } catch (error) {
    console.error(error.code ? `Could not create signing files (${error.code}).` : error.message);
    process.exitCode = 1;
  }
}

module.exports = { prepare };
