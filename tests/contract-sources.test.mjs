import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function readText(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch {
    assert.fail(`Expected ${relativePath} to exist`);
  }
}

async function assertFile(relativePath) {
  try {
    const entry = await stat(path.join(root, relativePath));
    assert.equal(entry.isFile(), true, `${relativePath} should be a file`);
  } catch {
    assert.fail(`Expected ${relativePath} to exist`);
  }
}

async function solidityFiles(directory = "contracts") {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(directory, entry.name);

    if (entry.name === "out" || entry.name === "cache" || entry.name === "broadcast" || entry.name === "legacy") {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await solidityFiles(relativePath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".sol")) {
      files.push(relativePath);
    }
  }

  return files;
}

function declarationsMissingNatspec(source, relativePath) {
  const missing = [];
  const lines = source.split("\n");
  const declarationPattern = /^\s*(constructor|receive|modifier|function)\b/;

  for (const [index, line] of lines.entries()) {
    if (!declarationPattern.test(line)) {
      continue;
    }

    let previous = index - 1;
    while (previous >= 0 && lines[previous].trim() === "") {
      previous -= 1;
    }

    if (!lines[previous]?.trimStart().startsWith("///")) {
      missing.push(`${relativePath}:${index + 1}`);
    }
  }

  return missing;
}

function firstLineMatching(source, pattern, relativePath) {
  const lines = source.split("\n");
  const index = lines.findIndex((line) => pattern.test(line));

  if (index === -1) {
    assert.fail(`Expected ${relativePath} to contain ${pattern}`);
  }

  return index + 1;
}

function assertLineOrder(relativePath, source, orderedPatterns) {
  const positions = orderedPatterns.map(({ label, pattern }) => ({
    label,
    line: firstLineMatching(source, pattern, relativePath),
  }));

  for (let index = 1; index < positions.length; index += 1) {
    const previous = positions[index - 1];
    const current = positions[index];
    assert.ok(
      previous.line < current.line,
      `${relativePath}: expected ${previous.label} before ${current.label}`,
    );
  }
}

test("TaskLog records executor-only task proofs with the required event surface", async () => {
  const source = await readText("contracts/src/TaskLog.sol");

  assert.match(source, /address public immutable executor/);
  assert.match(source, /struct TaskRecord/);
  assert.match(source, /bytes32 agentNode/);
  assert.match(source, /bytes32 ownerNode/);
  assert.match(source, /bytes32 taskHash/);
  assert.match(source, /string metadataURI/);
  assert.match(source, /event TaskRecorded/);
  assert.match(source, /if \(msg.sender != executor\) revert NotExecutor\(\)/);
  assert.match(source, /tasks\.push/);
});

test("AgentEnsExecutor keeps V1 policy source of truth in ENS instead of executor storage", async () => {
  const source = await readText("contracts/src/AgentEnsExecutor.sol");

  assert.match(source, /struct PolicySnapshot/);
  assert.match(source, /bytes32 policyDigest/);
  assert.match(source, /_readEnsPolicyDigest\(resolver, intent\.agentNode\)/);
  assert.match(source, /ITextResolverV1\(resolver\)\.text\(agentNode, "agent_policy_digest"\)/);
  assert.match(source, /ITextResolverV1\(resolver\)\.text\(intent\.agentNode, "agent_status"\)/);
  assert.match(source, /function hashPolicySnapshot/);
  assert.match(source, /mapping\(bytes32 => uint256\) public gasBudgetWei/);
  assert.match(source, /mapping\(bytes32 => uint256\) public nextNonce/);
  assert.doesNotMatch(source, /mapping\(bytes32 => Policy\) public policies/);
  assert.doesNotMatch(source, /function setPolicy\b/);
  assert.doesNotMatch(source, /function revokePolicy\b/);
});

test("Foundry deployment script reads environment addresses and emits deployed contract addresses", async () => {
  await assertFile("contracts/script/Deploy.s.sol");
  const source = await readText("contracts/script/Deploy.s.sol");

  assert.match(source, /interface Vm/);
  assert.match(source, /FOUNDRY_VM\.envAddress\("ENS_REGISTRY"\)/);
  assert.match(source, /FOUNDRY_VM\.envAddress\("NAME_WRAPPER"\)/);
  assert.match(source, /FOUNDRY_VM\.startBroadcast\(\)/);
  assert.match(source, /import \{ AgentEnsExecutor \}/);
  assert.match(source, /new AgentEnsExecutor\(ensRegistry, nameWrapper\)/);
  assert.doesNotMatch(source, /new AgentPolicyExecutor\(ensRegistry, nameWrapper\)/);
  assert.match(source, /new TaskLog\(address\(executor\)\)/);
  assert.match(source, /event DeploymentAddresses/);
  assert.match(source, /emit DeploymentAddresses\(address\(executor\), address\(taskLog\)\)/);
  assert.match(source, /FOUNDRY_VM\.stopBroadcast\(\)/);
});

test("contract behavior tests and ENS mocks are present for Foundry", async () => {
  for (const file of [
    "contracts/test/TaskLog.t.sol",
    "contracts/test/AgentEnsExecutor.t.sol",
    "contracts/test/mocks/MockENSRegistry.sol",
    "contracts/test/mocks/MockResolver.sol",
    "contracts/test/mocks/MockNameWrapper.sol",
  ]) {
    await assertFile(file);
  }
});

test("Solidity functions are documented with NatSpec comments", async () => {
  const missing = [];

  for (const file of await solidityFiles()) {
    missing.push(...declarationsMissingNatspec(await readText(file), file));
  }

  assert.deepEqual(missing, []);
});

test("production Solidity declarations follow the project ordering convention", async () => {
  const taskLog = await readText("contracts/src/TaskLog.sol");
  const executor = await readText("contracts/src/AgentEnsExecutor.sol");

  assertLineOrder("contracts/src/TaskLog.sol", taskLog, [
    { label: "errors", pattern: /^\s*error\s/m },
    { label: "events", pattern: /^\s*event\s/m },
    { label: "structs", pattern: /^\s*struct\s/m },
    { label: "variables", pattern: /^\s*address public immutable executor/m },
    { label: "constructor", pattern: /^\s*constructor\b/m },
    { label: "write functions", pattern: /^\s*function recordTask\b/m },
    { label: "read functions", pattern: /^\s*function taskCount\b/m },
  ]);

  assertLineOrder("contracts/src/AgentEnsExecutor.sol", executor, [
    { label: "errors", pattern: /^\s*error\s/m },
    { label: "events", pattern: /^\s*event\s/m },
    { label: "structs", pattern: /^\s*struct\s/m },
    { label: "variables", pattern: /^\s*uint256 private constant NOT_ENTERED/m },
    { label: "constructor", pattern: /^\s*constructor\b/m },
    { label: "budget functions", pattern: /^\s*function depositGasBudget\b/m },
    { label: "execute function", pattern: /^\s*function execute\b/m },
    { label: "internal reads", pattern: /^\s*function _resolverFor\b/m },
  ]);
});
