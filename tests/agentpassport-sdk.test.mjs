import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("AgentPassport SDK package is registered as a workspace package", async () => {
  const workspace = await readText("pnpm-workspace.yaml");
  const packageJson = JSON.parse(await readText("packages/agentpassport-sdk/package.json"));

  assert.match(workspace, /packages\/agentpassport-sdk/);
  assert.equal(packageJson.name, "@agentpassport/sdk");
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.exports["."], "./src/index.ts");
  assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
  assert.ok(packageJson.dependencies["@agentpassport/config"], "SDK should build on the existing config primitives instead of duplicating them");
});

test("AgentPassport SDK re-exports shared config primitives and adds safety helpers", async () => {
  const sdk = await import("../packages/agentpassport-sdk/src/index.ts");

  assert.equal(typeof sdk.buildTaskIntentTypedData, "function");
  assert.equal(typeof sdk.hashPolicySnapshot, "function");
  assert.equal(typeof sdk.policySnapshotFromTextRecords, "function");
  assert.equal(typeof sdk.assertExactActiveStatus, "function");
  assert.equal(typeof sdk.assertPolicyDigestMatches, "function");

  assert.doesNotThrow(() => sdk.assertExactActiveStatus("active"));
  assert.throws(() => sdk.assertExactActiveStatus("Active"), /exactly active/);
  assert.throws(
    () => sdk.assertPolicyDigestMatches("0x" + "11".repeat(32), "0x" + "22".repeat(32)),
    /does not match live ENS policy digest/
  );
});

test("AgentPassport SDK exposes canonical ENS and owner-index helpers", async () => {
  const { normalizeEnsName, parentEnsName, parseOwnerAgentLabels } = await import("../packages/agentpassport-sdk/src/index.ts");

  assert.equal(normalizeEnsName(" Assistant.Owner.ETH "), "assistant.owner.eth");
  assert.equal(parentEnsName("assistant.owner.eth"), "owner.eth");
  assert.deepEqual(parseOwnerAgentLabels(" assistant, Swapper ,,researcher "), ["assistant", "swapper", "researcher"]);
  assert.throws(() => normalizeEnsName("owner"), /valid ENS name/);
  assert.throws(() => parentEnsName("eth"), /valid agent ENS name/);
});

test("AgentPassport SDK serializes task intents and policy snapshots for JSON transports", async () => {
  const { parseTaskIntent, serializePolicySnapshot, serializeTaskIntent } = await import("../packages/agentpassport-sdk/src/index.ts");

  const intent = {
    agentNode: "0x" + "aa".repeat(32),
    policyDigest: "0x" + "bb".repeat(32),
    target: "0x" + "12".repeat(20),
    callDataHash: "0x" + "cc".repeat(32),
    value: 1n,
    nonce: 2n,
    expiresAt: 3n
  };
  const serialized = serializeTaskIntent(intent);
  assert.deepEqual(serialized, {
    agentNode: intent.agentNode,
    policyDigest: intent.policyDigest,
    target: intent.target,
    callDataHash: intent.callDataHash,
    value: "1",
    nonce: "2",
    expiresAt: "3"
  });
  assert.deepEqual(parseTaskIntent(serialized), intent);

  assert.deepEqual(
    serializePolicySnapshot({
      target: intent.target,
      selector: "0x12345678",
      maxValueWei: 4n,
      maxGasReimbursementWei: 5n,
      expiresAt: 6n,
      enabled: true
    }),
    {
      target: intent.target,
      selector: "0x12345678",
      maxValueWei: "4",
      maxGasReimbursementWei: "5",
      expiresAt: "6",
      enabled: true
    }
  );
});

test("MCP, web, and runner consume SDK primitives instead of owning duplicated core logic", async () => {
  const mcpRuntime = await readText("packages/mcp-server/src/runtime.ts");
  const mcpSafety = await readText("packages/mcp-server/src/safety.ts");
  const webTaskDemo = await readText("apps/web/lib/taskDemo.ts");
  const runnerSigner = await readText("agent-runner/src/signIntent.ts");

  assert.match(mcpRuntime, /from "@agentpassport\/sdk"/);
  assert.match(mcpSafety, /from "@agentpassport\/sdk"/);
  assert.match(webTaskDemo, /from "@agentpassport\/sdk"/);
  assert.match(runnerSigner, /from "@agentpassport\/sdk"/);
  assert.doesNotMatch(runnerSigner, /\.\.\/\.\.\/packages\/config\/src/);
});
