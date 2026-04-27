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

    if (entry.name === "out" || entry.name === "cache" || entry.name === "broadcast") {
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

test("AgentPolicyExecutor keeps ENS as the live signer source instead of storing agent addresses", async () => {
  const source = await readText("contracts/src/AgentPolicyExecutor.sol");
  const policyStruct = source.match(/struct Policy \{[\s\S]*?\n    \}/)?.[0] ?? "";

  assert.match(source, /interface IENSRegistry/);
  assert.match(source, /interface IAddrResolver/);
  assert.match(source, /interface INameWrapper/);
  assert.match(source, /mapping\(bytes32 => Policy\) public policies/);
  assert.doesNotMatch(policyStruct, /agentAddress|agentSigner|signer/);
  assert.match(source, /ens\.resolver\(agentNode\)/);
  assert.match(source, /IAddrResolver\(resolver\)\.addr\(agentNode\)/);
  assert.match(source, /if \(recovered != resolvedAgent\) revert BadSignature\(\)/);
});

test("AgentPolicyExecutor enforces nonce, expiry, target, selector, calldata hash, and value checks", async () => {
  const source = await readText("contracts/src/AgentPolicyExecutor.sol");

  assert.match(source, /error PolicyDisabled\(\)/);
  assert.match(source, /error PolicyExpired\(\)/);
  assert.match(source, /error IntentExpired\(\)/);
  assert.match(source, /error BadNonce\(\)/);
  assert.match(source, /error TargetNotAllowed\(\)/);
  assert.match(source, /error SelectorNotAllowed\(\)/);
  assert.match(source, /error BadCalldataHash\(\)/);
  assert.match(source, /error ValueTooHigh\(\)/);
  assert.match(source, /intent\.nonce != nextNonce\[intent\.agentNode\]/);
  assert.match(source, /intent\.target != policy\.target/);
  assert.match(source, /keccak256\(callData\) != intent\.callDataHash/);
  assert.match(source, /selector != policy\.selector/);
  assert.match(source, /intent\.value > policy\.maxValueWei/);
});

test("AgentPolicyExecutor implements EIP-712 signing, target execution, and capped reimbursement", async () => {
  const source = await readText("contracts/src/AgentPolicyExecutor.sol");

  assert.match(source, /TASK_INTENT_TYPEHASH/);
  assert.match(source, /DOMAIN_TYPEHASH/);
  assert.match(source, /function _hashIntent/);
  assert.match(source, /ecrecover/);
  assert.match(source, /nextNonce\[intent\.agentNode\] = intent\.nonce \+ 1/);
  assert.match(source, /intent\.target\.call\{ value: intent\.value \}\(callData\)/);
  assert.match(source, /maxGasReimbursementWei/);
  assert.match(source, /if \(reimbursement > cap\)/);
  assert.match(source, /gasBudgetWei\[intent\.agentNode\] -= reimbursement/);
});

test("contract behavior tests and ENS mocks are present for Foundry", async () => {
  for (const file of [
    "contracts/test/TaskLog.t.sol",
    "contracts/test/AgentPolicyExecutor.t.sol",
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
  const executor = await readText("contracts/src/AgentPolicyExecutor.sol");

  assertLineOrder("contracts/src/TaskLog.sol", taskLog, [
    { label: "errors", pattern: /^\s*error\s/m },
    { label: "events", pattern: /^\s*event\s/m },
    { label: "structs", pattern: /^\s*struct\s/m },
    { label: "variables", pattern: /^\s*address public immutable executor/m },
    { label: "constructor", pattern: /^\s*constructor\b/m },
    { label: "write functions", pattern: /^\s*function recordTask\b/m },
    { label: "read functions", pattern: /^\s*function taskCount\b/m },
  ]);

  assertLineOrder("contracts/src/AgentPolicyExecutor.sol", executor, [
    { label: "errors", pattern: /^\s*error\s/m },
    { label: "events", pattern: /^\s*event\s/m },
    { label: "structs", pattern: /^\s*struct\s/m },
    { label: "variables", pattern: /^\s*uint256 private constant NOT_ENTERED/m },
    { label: "constructor", pattern: /^\s*constructor\b/m },
    { label: "write functions", pattern: /^\s*function setPolicy\b/m },
    { label: "read functions", pattern: /^\s*function _effectiveManager\b/m },
  ]);
});
