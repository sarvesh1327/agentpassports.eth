import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("wagmi transport treats blank public RPC URLs as unset", async () => {
  const [{ normalizePublicRpcUrl }, source] = await Promise.all([
    import("../apps/web/lib/rpcUrl.ts"),
    readFile(path.join(process.cwd(), "apps/web/lib/wagmiConfig.ts"), "utf8"),
  ]);

  assert.equal(normalizePublicRpcUrl(undefined), undefined);
  assert.equal(normalizePublicRpcUrl(""), undefined);
  assert.equal(normalizePublicRpcUrl("   "), undefined);
  assert.equal(normalizePublicRpcUrl(" https://example-rpc.test "), "https://example-rpc.test");
  assert.match(source, /http\(normalizePublicRpcUrl\(webEnv\.publicRpcUrl\)\)/);
});
