import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";

test("production application mounts every V4 route and enforces auth before dependencies", async () => {
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const old = config.adminSecret;
  try {
    config.adminSecret = "route-test-secret";
    for (const [method, path] of [
      ["POST", "/admin/run-jobs"], ["POST", "/admin/bounty"],
      ["POST", "/proof/verify"], ["GET", "/bounty/current"],
      ["GET", "/bounty/1/recently-out"], ["POST", "/bounty/1/join"],
      ["POST", "/bounty/1/challenge"], ["POST", "/bounty/1/start"], ["POST", "/bounty/1/proof"],
      ["GET", "/identity/11111111111111111111111111111111"],
      ["GET", "/reputation/11111111111111111111111111111111"],
      ["POST", "/api/proof"], ["POST", "/api/proof/start"], ["POST", "/api/proof/challenge"], ["POST", "/api/proof/habit"],
      ["POST", "/api/nudges"], ["POST", "/api/reviews/1"],
      ["GET", "/api/oaths/11111111111111111111111111111111/reviews"],
    ]) {
      const r = await fetch(base + path, { method, headers: { "x-admin-secret": "invalid" } });
      assert.equal(r.status, 401, path);
      assert.deepEqual(await r.json(), { error: path.startsWith("/admin") ? "Invalid admin secret" : "Sign-in required" });
    }
    config.adminSecret = "";
    assert.equal((await fetch(base + "/admin/run-jobs", { method: "POST" })).status, 503);
    const health = await (await fetch(base + "/health")).json();
    assert.equal(health.service, "kept-v4"); assert.equal(health.apiVersion, 4);
  } finally { config.adminSecret = old; server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); }
});
