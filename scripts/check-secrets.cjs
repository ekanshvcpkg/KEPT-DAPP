#!/usr/bin/env node
// Scan the Git index, so staged secrets are caught even if the working copy differs.
const { execFileSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, sep } = require("node:path");

function sensitivePath(path) {
  const name = path.split("/").pop();
  return (name === ".env" || (name.startsWith(".env.") && name !== ".env.example"))
    || /(?:keypair\.json|^id\.json$|^\.aura-minter\.json$|service[-_]account.*\.json|firebase-adminsdk.*\.json)$/i.test(name)
    || /\.(?:pem|key|p8|p12|pfx|jks|keystore)$/i.test(name)
    || name === "keystore.properties"
    || /\.(?:db|sqlite3?)(?:-(?:journal|wal|shm))?$/i.test(name);
}

function run(staged) {
  const git = (args) => execFileSync("git", args, { encoding: "utf8" });
  process.chdir(git(["rev-parse", "--show-toplevel"]).trim());
  try {
    execFileSync("gitleaks", ["version"], { stdio: "pipe" });
  } catch {
    throw new Error("Install Gitleaks 8.30.1 or newer before scanning (see SECURITY.md).");
  }

  const paths = git(["ls-files", "--cached", "-z"]).split("\0");
  if (!staged) {
    paths.push(...git(["log", "--all", "--full-history", "--format=", "--name-only", "-z"]).split(/[\0\n]/));
  }
  const blocked = [...new Set(paths.filter(Boolean).filter(sensitivePath))];
  if (blocked.length) {
    throw new Error(`Sensitive filenames in the ${staged ? "index" : "index or history"}:\n${blocked.join("\n")}`);
  }

  const flags = ["--config", ".gitleaks.toml", "--redact", "--verbose", "--no-banner", "--no-color", "--ignore-gitleaks-allow"];
  const scan = (args) => execFileSync("gitleaks", [...args, ...flags], { stdio: "inherit" });
  if (staged) {
    scan(["git", "--pre-commit", "--staged", "."]);
  } else {
    scan(["git", "--log-opts=--all --full-history -m", "."]);
    const snapshot = mkdtempSync(join(tmpdir(), "kept-secret-scan-"));
    try {
      git(["checkout-index", "--all", `--prefix=${snapshot}${sep}`]);
      scan(["dir", snapshot]);
    } finally {
      rmSync(snapshot, { recursive: true, force: true });
    }
  }
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== "--staged")) {
      throw new Error("Usage: node scripts/check-secrets.cjs [--staged]");
    }
    run(args[0] === "--staged");
  } catch (error) {
    // Gitleaks has already printed a redacted finding; don't print subprocess error objects.
    console.error(error.status ? "Secret scan failed; review the redacted findings above." : error.message);
    process.exitCode = 1;
  }
}

module.exports = { sensitivePath };
