import assert from "node:assert/strict";
import test from "node:test";

const EXECUTOR_ADDRESS = "0x3B42d507E1B13eE164cAb0FbA4EA66f8a1B653f1";
const TASK_LOG_ADDRESS = "0x3AB718580b476D64fdD3CE6a9Ab63491B15767d9";

test("register preview derives ENS nodes, policy hash, and text records from form input", async () => {
  const { buildRegisterPreview } = await import("../apps/web/lib/registerAgent.ts");

  const preview = buildRegisterPreview({
    agentAddress: " 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ",
    agentLabel: "Assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "10000000000000000",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "AgentPassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "ipfs://agentpassports-demo-policy",
    taskLogAddress: TASK_LOG_ADDRESS
  });

  assert.equal(preview.agentName, "assistant.agentpassports.eth");
  assert.equal(preview.gasBudgetWei, "10000000000000000");
  assert.equal(preview.policyHash?.length, 66);
  assert.deepEqual(
    preview.textRecords.find((record) => record.key === "agent.status"),
    { key: "agent.status", value: "active" }
  );
  assert.deepEqual(
    preview.textRecords.find((record) => record.key === "agent.executor"),
    { key: "agent.executor", value: EXECUTOR_ADDRESS }
  );
});

test("register preview keeps partially typed form values safe without throwing", async () => {
  const { buildRegisterPreview } = await import("../apps/web/lib/registerAgent.ts");

  const preview = buildRegisterPreview({
    agentAddress: "not an address",
    agentLabel: "",
    executorAddress: null,
    gasBudgetWei: "not numeric yet",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: null
  });

  assert.equal(preview.agentName, ".eth");
  assert.equal(preview.gasBudgetWei, "0");
  assert.equal(preview.policyHash, null);
  assert.deepEqual(
    preview.textRecords.find((record) => record.key === "agent.status"),
    { key: "agent.status", value: "draft" }
  );
});

test("registration validation rejects empty labels and accepts normalized subnames", async () => {
  const { buildRegisterPreview, validateRegistrationInput } = await import("../apps/web/lib/registerAgent.ts");
  const preview = buildRegisterPreview({
    agentAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "10000000000000000",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "agentpassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "ipfs://agentpassports-demo-policy",
    taskLogAddress: TASK_LOG_ADDRESS
  });

  assert.doesNotThrow(() => validateRegistrationInput({ agentLabel: "assistant", ownerNode: preview.ownerNode }));
  assert.throws(
    () => validateRegistrationInput({ agentLabel: "", ownerNode: preview.ownerNode }),
    /Agent label is required/
  );
});
