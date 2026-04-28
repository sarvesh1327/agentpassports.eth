import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("wagmi transport treats blank public RPC URLs as unset", async () => {
  const [{ normalizePublicRpcUrl }, configSource] = await Promise.all([
    import("../apps/web/lib/rpcUrl.ts"),
    readFile(path.join(process.cwd(), "apps/web/lib/wagmiConfig.ts"), "utf8"),
  ]);

  assert.equal(normalizePublicRpcUrl(undefined), undefined);
  assert.equal(normalizePublicRpcUrl(""), undefined);
  assert.equal(normalizePublicRpcUrl("   "), undefined);
  assert.equal(normalizePublicRpcUrl(" https://example-rpc.test "), "https://example-rpc.test");
  assert.match(configSource, /http\(normalizePublicRpcUrl\(webEnv\.publicRpcUrl\)\)/);
});

test("public chain config fails loudly instead of silently switching networks", async () => {
  const [{ SEPOLIA_CHAIN_ID }, { readConfiguredChainId }, configSource, profileSource] = await Promise.all([
    import("../packages/config/src/index.ts"),
    import("../apps/web/lib/publicChain.ts"),
    readFile(path.join(process.cwd(), "apps/web/lib/wagmiConfig.ts"), "utf8"),
    readFile(path.join(process.cwd(), "apps/web/lib/demoProfile.ts"), "utf8"),
  ]);

  assert.equal(readConfiguredChainId(undefined), SEPOLIA_CHAIN_ID);
  assert.equal(readConfiguredChainId("11155111"), SEPOLIA_CHAIN_ID);
  assert.throws(() => readConfiguredChainId("1"), /NEXT_PUBLIC_CHAIN_ID must be 11155111/);
  assert.throws(() => readConfiguredChainId("not-a-number"), /positive integer/);
  assert.match(configSource, /readConfiguredChainId/);
  assert.match(profileSource, /readConfiguredChainId/);
});
