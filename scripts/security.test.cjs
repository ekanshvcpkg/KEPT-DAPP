const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync, readdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { randomBytes } = require("node:crypto");
const { sensitivePath } = require("./check-secrets.cjs");
const { prepare } = require("./prepare-android-signing.cjs");

const root = resolve(__dirname, "..");
function temporary(t) {
  const dir = mkdtempSync(join(tmpdir(), "kept-security-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function put(dir, file, content) {
  const path = join(dir, file);
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content);
}
function scan(dir) {
  const report = join(temporaryScanReports, `${randomBytes(8).toString("hex")}.json`);
  const result = spawnSync("gitleaks", ["dir", dir, "--config", join(root, ".gitleaks.toml"),
    "--redact", "--no-banner", "--ignore-gitleaks-allow", "--report-format=json", `--report-path=${report}`],
  { encoding: "utf8" });
  assert.ifError(result.error);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  return { status: result.status, findings: JSON.parse(readFileSync(report, "utf8")) };
}
const temporaryScanReports = mkdtempSync(join(tmpdir(), "kept-security-reports-"));
test.after(() => rmSync(temporaryScanReports, { recursive: true, force: true }));

test("credential filenames are both rejected and git-ignored throughout the repo", () => {
  const names = [".env", ".env.production", "wallet-keypair.json", "keypair.json", "id.json",
    ".aura-minter.json", "firebase-service-account.json", "service_account.json", "app-firebase-adminsdk-123.json",
    "private.pem", "private.key", "upload.p8", "upload.p12", "upload.pfx", "upload.jks",
    "upload.keystore", "keystore.properties", "dev.db", "dev.db-wal", "local.sqlite3-shm"];
  const paths = ["", "backend/", "frontend/", "onchain/", "docs/nested/"].flatMap((prefix) => names.map((name) => prefix + name));
  for (const path of paths) assert.equal(sensitivePath(path), true, path);
  const ignored = execFileSync("git", ["check-ignore", "--no-index", "--stdin"],
    { cwd: root, input: paths.join("\n"), encoding: "utf8" }).trim().split("\n");
  assert.deepEqual(ignored, paths);
  for (const path of [".env.example", "backend/.env.example", "frontend/.env.example", "onchain/scripts/test_keys.ts"])
    assert.equal(sensitivePath(path), false, path);
});

test("provider keys, KEPT credentials, and multiline Solana keypairs are detected and redacted", (t) => {
  const dir = temporary(t);
  const credential = randomBytes(32).toString("hex");
  const assignment = `${["ADMIN", "SECRET"].join("_")}=${credential}\n`;
  put(dir, "backend/.env.example", assignment); // Examples cannot hide real values.
  put(dir, "backend/test/photoRoutes.test.ts", `${["SESSION", "SECRET"].join("_")}='${credential}'\n`);
  put(dir, "docs/example.md", `${assignment}// gitleaks:allow\n`);
  put(dir, "wallet.json", JSON.stringify(Array.from(randomBytes(64)), null, 2));
  put(dir, "provider.txt", ["sk", "or", "v1", randomBytes(32).toString("hex")].join("-"));
  const result = scan(dir);
  assert.equal(result.status, 1);
  for (const name of [".env.example", "photoRoutes.test.ts", "example.md", "wallet.json", "provider.txt"])
    assert.ok(result.findings.some((f) => f.File.endsWith(name)), `missed ${name}`);
  assert.ok(result.findings.some((f) => f.RuleID === "solana-keypair-array"));
  assert.ok(result.findings.some((f) => f.RuleID === "openrouter-api-key"));
  assert.ok(!JSON.stringify(result.findings).includes(credential), "report must redact credentials");
});

test("only known fixtures are allowed; public addresses and transaction links stay valid", (t) => {
  const dir = temporary(t);
  for (const file of ["backend/.env.example", "frontend/.env.example", "backend/test/photoRoutes.test.ts", "backend/test/recentlyOut.test.ts", "onchain/scripts/test_keys.ts"])
    put(dir, file, readFileSync(join(root, file)));
  put(dir, "apps/api/test/photoRoutes.test.ts", readFileSync(join(root, "backend/test/photoRoutes.test.ts")));
  put(dir, "docs/transaction.md", `https://explorer.solana.com/tx/${"2aBcD".repeat(17)}?cluster=devnet`);
  assert.equal(scan(dir).status, 0);
});

test("staged scan catches a secret even when the working file is clean", (t) => {
  const dir = temporary(t);
  const git = (args) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git(["init", "-q"]);
  copyFileSync(join(root, ".gitleaks.toml"), join(dir, ".gitleaks.toml"));
  put(dir, "credentials.txt", `${["SESSION", "SECRET"].join("_")}=${randomBytes(32).toString("hex")}\n`);
  git(["add", "."]);
  put(dir, "credentials.txt", "no credentials\n");
  const invoke = () => spawnSync(process.execPath, [join(root, "scripts/check-secrets.cjs"), "--staged"], { cwd: dir, encoding: "utf8" });
  assert.equal(invoke().status, 1);
  git(["add", "credentials.txt"]);
  assert.equal(invoke().status, 0);
  put(dir, "upload.keystore", Buffer.from([0, 1, 2, 3]));
  git(["add", "upload.keystore"]);
  assert.equal(invoke().status, 1, "binary credentials must be rejected by filename");
});

test("full scan still rejects a credential deleted in a later commit", (t) => {
  const dir = temporary(t);
  const git = (args) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git(["init", "-q"]);
  git(["config", "user.name", "Security Test"]);
  git(["config", "user.email", "security-test@example.invalid"]);
  copyFileSync(join(root, ".gitleaks.toml"), join(dir, ".gitleaks.toml"));
  put(dir, "credentials.txt", `${["ADMIN", "SECRET"].join("_")}=${randomBytes(32).toString("hex")}\n`);
  git(["add", "."]);
  git(["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "-qm", "Synthetic fixture"]);
  git(["rm", "credentials.txt"]);
  git(["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "-qm", "Remove fixture"]);
  const result = spawnSync(process.execPath, [join(root, "scripts/check-secrets.cjs")], { cwd: dir, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /kept-secret-assignment/);
});

function signingEnv() {
  return { KEYSTORE_BASE64: Buffer.from("synthetic test keystore").toString("base64"),
    KEYSTORE_PASSWORD: " leading\\slash\nnonascii-\u00e9", KEY_ALIAS: "kept", KEY_PASSWORD: "secret:=#!" };
}

test("missing or malformed signing credentials fail before creating files", (t) => {
  const dir = temporary(t);
  for (const key of Object.keys(signingEnv())) {
    const env = signingEnv();
    env[key] = "";
    assert.throws(() => prepare(dir, env), /Missing release signing credentials/);
    assert.deepEqual(readdirSync(dir), []);
  }
  assert.throws(() => prepare(dir, { ...signingEnv(), KEYSTORE_BASE64: "invalid*" }), /valid base64/);
  assert.deepEqual(readdirSync(dir), []);
});

test("signing files are private, base64 is decoded, and properties preserve special characters", (t) => {
  const dir = temporary(t);
  prepare(dir, signingEnv());
  for (const file of ["kept-release.keystore", "keystore.properties"])
    assert.equal(statSync(join(dir, file)).mode & 0o777, 0o600);
  assert.equal(readFileSync(join(dir, "kept-release.keystore"), "utf8"), "synthetic test keystore");
  const properties = readFileSync(join(dir, "keystore.properties"), "utf8");
  assert.ok(properties.includes("storePassword=\\u0020leading\\u005cslash\\u000anonascii-\\u00e9\n"));
  assert.ok(properties.includes("keyPassword=secret\\u003a\\u003d\\u0023\\u0021\n"));
  assert.equal(properties.split("\n").length, 5, "password newlines must not inject properties");
});

test("signing setup refuses overwrites and cleans up files if the second write fails", (t) => {
  const dir = temporary(t);
  put(dir, "keystore.properties", "existing local config");
  assert.throws(() => prepare(dir, signingEnv()), { code: "EEXIST" });
  assert.deepEqual(readdirSync(dir), ["keystore.properties"]);
  assert.equal(readFileSync(join(dir, "keystore.properties"), "utf8"), "existing local config");
});
