import assert from "node:assert/strict";
import test from "node:test";

const AGENT_NODE = `0x${"11".repeat(32)}`;
const OWNER_NODE = `0x${"22".repeat(32)}`;
const TARGET_ADDRESS = "0x3AB718580b476D64fdD3CE6a9Ab63491B15767d9";

test("policy proof hash is derived from the live executor policy tuple", async () => {
  const { hashPolicyContractResult } = await import("../apps/web/lib/policyProof.ts");
  const { buildPolicyMetadata, hashPolicyMetadata, taskLogRecordTaskSelector } = await import("../packages/config/src/index.ts");
  const policy = [
    OWNER_NODE,
    "0x1111111111111111111111111111111111111111",
    TARGET_ADDRESS,
    taskLogRecordTaskSelector(),
    0n,
    1_000_000_000_000_000n,
    1_790_000_000n,
    true
  ];

  const expectedHash = hashPolicyMetadata(
    buildPolicyMetadata({
      agentNode: AGENT_NODE,
      expiresAt: 1_790_000_000n,
      maxGasReimbursementWei: 1_000_000_000_000_000n,
      maxValueWei: 0n,
      ownerNode: OWNER_NODE,
      selector: taskLogRecordTaskSelector(),
      target: TARGET_ADDRESS
    })
  );

  assert.equal(hashPolicyContractResult({ agentNode: AGENT_NODE, policy }), expectedHash);
});

test("policy proof hash is unknown when the executor has no stored policy", async () => {
  const { hashPolicyContractResult } = await import("../apps/web/lib/policyProof.ts");
  const { taskLogRecordTaskSelector } = await import("../packages/config/src/index.ts");
  const emptyPolicy = [
    `0x${"00".repeat(32)}`,
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
    taskLogRecordTaskSelector(),
    0n,
    0n,
    0n,
    false
  ];

  assert.equal(hashPolicyContractResult({ agentNode: AGENT_NODE, policy: null }), null);
  assert.equal(hashPolicyContractResult({ agentNode: AGENT_NODE, policy: emptyPolicy }), null);
});
