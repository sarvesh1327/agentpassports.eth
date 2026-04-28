import assert from "node:assert/strict";
import test from "node:test";

const EXECUTOR_ADDRESS = "0x3B42d507E1B13eE164cAb0FbA4EA66f8a1B653f1";
const TASK_LOG_ADDRESS = "0x3AB718580b476D64fdD3CE6a9Ab63491B15767d9";
const PUBLIC_RESOLVER_ADDRESS = "0x1111111111111111111111111111111111111111";
const ENS_REGISTRY_ADDRESS = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const OWNER_WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

test("ETH amount helpers keep small nonzero budgets visible", async () => {
  const { formatWeiAsEth } = await import("../apps/web/lib/ethAmount.ts");

  assert.equal(formatWeiAsEth(0n), "0 ETH");
  assert.equal(formatWeiAsEth(100000000000n), "0.0000001 ETH");
  assert.equal(formatWeiAsEth(10000000000000000n), "0.01 ETH");
  assert.equal(formatWeiAsEth(1n), "0.000000000000000001 ETH");
  assert.equal(formatWeiAsEth(10_000000000000000000n), "10 ETH");
  assert.equal(formatWeiAsEth(100_000000000000000000n), "100 ETH");
});

test("ETH amount helpers parse registration ETH inputs into wei", async () => {
  const { formatWeiInputAsEth, parseEthInputToWei, parseEthInputToWeiString } = await import("../apps/web/lib/ethAmount.ts");

  assert.equal(parseEthInputToWei("0.0000001"), 100000000000n);
  assert.equal(parseEthInputToWei("0.01"), 10000000000000000n);
  assert.equal(parseEthInputToWei(".5"), 500000000000000000n);
  assert.equal(parseEthInputToWei("not numeric yet"), 0n);
  assert.equal(parseEthInputToWei("0.0000000000000000001"), 0n);
  assert.equal(parseEthInputToWeiString("0.0000001"), "100000000000");
  assert.equal(formatWeiInputAsEth("100000000000"), "0.0000001");
  assert.equal(formatWeiInputAsEth("10000000000000000000"), "10");
  assert.equal(formatWeiInputAsEth(""), "");
});

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

  assert.equal(preview.agentName, "");
  assert.equal(preview.gasBudgetWei, "0");
  assert.equal(preview.policyHash, null);
  assert.deepEqual(preview.textRecords, []);
});

test("register preview does not show owner ENS as agent ENS before label entry", async () => {
  const { buildRegisterPreview } = await import("../apps/web/lib/registerAgent.ts");

  const preview = buildRegisterPreview({
    agentAddress: "",
    agentLabel: "",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "sarvesh.eth",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: TASK_LOG_ADDRESS
  });

  assert.equal(preview.agentName, "");
  assert.equal(preview.policyHash, null);
  assert.deepEqual(preview.textRecords, []);
});

test("register preview does not expose placeholder ENS text records", async () => {
  const { buildRegisterPreview } = await import("../apps/web/lib/registerAgent.ts");

  const preview = buildRegisterPreview({
    agentAddress: "",
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "agentpassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: TASK_LOG_ADDRESS
  });

  assert.deepEqual(preview.textRecords, []);
});

test("register preview emits only concrete ENS text records for complete input", async () => {
  const { buildRegisterPreview } = await import("../apps/web/lib/registerAgent.ts");

  const preview = buildRegisterPreview({
    agentAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "10000000000000000",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "agentpassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "ipfs://agentpassports-policy",
    taskLogAddress: TASK_LOG_ADDRESS
  });

  assert.equal(preview.textRecords.length > 0, true);
  assert.equal(preview.textRecords.some((record) => record.value.startsWith("Pending")), false);
  assert.deepEqual(
    preview.textRecords.find((record) => record.key === "agent.policy.uri"),
    { key: "agent.policy.uri", value: "ipfs://agentpassports-policy" }
  );
});

test("register draft allows blank metadata URI when every required field is ready", async () => {
  const { buildRegisterPreview, buildRegistrationDraftStatus } = await import("../apps/web/lib/registerAgent.ts");

  const preview = buildRegisterPreview({
    agentAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "10000000000000000",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "agentpassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: TASK_LOG_ADDRESS
  });
  const status = buildRegistrationDraftStatus({
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: preview.gasBudgetWei,
    hasPreparedTextRecords: preview.textRecords.length > 0,
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    normalizedAgentAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    publicResolverAddress: PUBLIC_RESOLVER_ADDRESS,
    resolverAddress: PUBLIC_RESOLVER_ADDRESS,
    resolverLookupSettled: true,
    shouldCreateSubnameRecord: false,
    subnameOwnerLookupSettled: true,
    taskLogAddress: TASK_LOG_ADDRESS
  });

  assert.equal(preview.textRecords.some((record) => record.key === "agent.policy.uri"), false);
  assert.equal(status.canSubmit, true);
  assert.equal(status.blocker, null);
});

test("register draft allows a nonzero budget below the reimbursement cap because the cap is a ceiling", async () => {
  const { buildRegisterPreview, buildRegistrationDraftStatus } = await import("../apps/web/lib/registerAgent.ts");

  const preview = buildRegisterPreview({
    agentAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "110100000000000",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "agentpassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: TASK_LOG_ADDRESS
  });
  const status = buildRegistrationDraftStatus({
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: preview.gasBudgetWei,
    hasPreparedTextRecords: preview.textRecords.length > 0,
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    normalizedAgentAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    publicResolverAddress: PUBLIC_RESOLVER_ADDRESS,
    resolverAddress: PUBLIC_RESOLVER_ADDRESS,
    resolverLookupSettled: true,
    shouldCreateSubnameRecord: false,
    subnameOwnerLookupSettled: true,
    taskLogAddress: TASK_LOG_ADDRESS
  });

  assert.equal(status.canSubmit, true);
  assert.equal(status.blocker, null);
});

test("register draft can create the agent subname when the live resolver is missing", async () => {
  const { buildRegisterPreview, buildRegistrationDraftStatus } = await import("../apps/web/lib/registerAgent.ts");

  const preview = buildRegisterPreview({
    agentAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "10000000000000000",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "agentpassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: TASK_LOG_ADDRESS
  });
  const status = buildRegistrationDraftStatus({
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: preview.gasBudgetWei,
    hasPreparedTextRecords: preview.textRecords.length > 0,
    normalizedAgentAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    publicResolverAddress: PUBLIC_RESOLVER_ADDRESS,
    resolverAddress: null,
    resolverLookupSettled: true,
    shouldCreateSubnameRecord: true,
    subnameOwnerLookupSettled: true,
    taskLogAddress: TASK_LOG_ADDRESS
  });

  assert.equal(status.canSubmit, true);
  assert.equal(status.blocker, null);
});

test("register draft requires a configured public resolver before creating a subname", async () => {
  const { buildRegisterPreview, buildRegistrationDraftStatus } = await import("../apps/web/lib/registerAgent.ts");

  const preview = buildRegisterPreview({
    agentAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "10000000000000000",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "agentpassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: TASK_LOG_ADDRESS
  });
  const status = buildRegistrationDraftStatus({
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: preview.gasBudgetWei,
    hasPreparedTextRecords: preview.textRecords.length > 0,
    normalizedAgentAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    publicResolverAddress: null,
    resolverAddress: null,
    resolverLookupSettled: true,
    shouldCreateSubnameRecord: true,
    subnameOwnerLookupSettled: true,
    taskLogAddress: TASK_LOG_ADDRESS
  });

  assert.equal(status.canSubmit, false);
  assert.equal(status.blocker, "Public resolver address is not configured");
});

test("register draft waits for the agent subname owner lookup before preparing transactions", async () => {
  const { buildRegisterPreview, buildRegistrationDraftStatus } = await import("../apps/web/lib/registerAgent.ts");

  const preview = buildRegisterPreview({
    agentAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "10000000000000000",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "agentpassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: TASK_LOG_ADDRESS
  });
  const status = buildRegistrationDraftStatus({
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: preview.gasBudgetWei,
    hasPreparedTextRecords: preview.textRecords.length > 0,
    normalizedAgentAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    publicResolverAddress: PUBLIC_RESOLVER_ADDRESS,
    resolverAddress: PUBLIC_RESOLVER_ADDRESS,
    resolverLookupSettled: true,
    shouldCreateSubnameRecord: false,
    subnameOwnerLookupSettled: false,
    taskLogAddress: TASK_LOG_ADDRESS
  });

  assert.equal(status.canSubmit, false);
  assert.equal(status.blocker, "Waiting for agent subname owner lookup");
});

test("register draft blocks resolver fallback when an existing subname has no resolver", async () => {
  const { buildRegisterPreview, buildRegistrationDraftStatus } = await import("../apps/web/lib/registerAgent.ts");

  const preview = buildRegisterPreview({
    agentAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "10000000000000000",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "agentpassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: TASK_LOG_ADDRESS
  });
  const status = buildRegistrationDraftStatus({
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: preview.gasBudgetWei,
    hasPreparedTextRecords: preview.textRecords.length > 0,
    normalizedAgentAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    publicResolverAddress: PUBLIC_RESOLVER_ADDRESS,
    resolverAddress: null,
    resolverLookupSettled: true,
    shouldCreateSubnameRecord: false,
    subnameOwnerLookupSettled: true,
    taskLogAddress: TASK_LOG_ADDRESS
  });

  assert.equal(status.canSubmit, false);
  assert.equal(status.blocker, "Agent ENS resolver is not configured for record writes");
});

test("registration batch creates the subname, writes resolver records through resolver multicall, and funds policy", async () => {
  const { buildRegisterPreview } = await import("../apps/web/lib/registerAgent.ts");
  const { buildRegistrationBatch } = await import("../apps/web/lib/registrationBatch.ts");

  const preview = buildRegisterPreview({
    agentAddress: OWNER_WALLET,
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "10000000000000000",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "agentpassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: TASK_LOG_ADDRESS
  });
  const batch = buildRegistrationBatch({
    agentLabel: "assistant",
    agentNode: preview.agentNode,
    connectedWallet: OWNER_WALLET,
    ensRegistryAddress: ENS_REGISTRY_ADDRESS,
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: preview.gasBudgetWei,
    isOwnerWrapped: false,
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    nameWrapperAddress: null,
    normalizedAgentAddress: OWNER_WALLET,
    ownerNode: preview.ownerNode,
    policyExpiresAt: "1790000000",
    publicResolverAddress: PUBLIC_RESOLVER_ADDRESS,
    resolverAddress: PUBLIC_RESOLVER_ADDRESS,
    shouldCreateSubnameRecord: true,
    taskLogAddress: TASK_LOG_ADDRESS,
    textRecords: preview.textRecords
  });

  assert.equal(batch.calls.length, 3);
  assert.equal(batch.calls[0].label, "setSubnodeRecord");
  assert.equal(batch.calls[0].to, ENS_REGISTRY_ADDRESS);
  assert.equal(batch.calls[1].label, "multicall");
  assert.equal(batch.calls[1].to, PUBLIC_RESOLVER_ADDRESS);
  assert.equal(batch.calls[2].label, "setPolicy");
  assert.equal(batch.calls[2].to, EXECUTOR_ADDRESS);
  assert.equal(batch.calls[2].value, 10000000000000000n);
  assert.deepEqual(batch.summary, [
    "setSubnodeRecord(owner ENS, agent label, connected wallet, public resolver)",
    `multicall(setAddr, ${preview.textRecords.length} text records)`,
    "setPolicy(..., with gas budget)"
  ]);
  for (const call of batch.calls) {
    assert.match(call.data, /^0x[0-9a-f]+$/iu);
  }
});

test("registration batch skips subname setup when the live resolver already exists", async () => {
  const { buildRegisterPreview } = await import("../apps/web/lib/registerAgent.ts");
  const { buildRegistrationBatch } = await import("../apps/web/lib/registrationBatch.ts");

  const preview = buildRegisterPreview({
    agentAddress: OWNER_WALLET,
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "10000000000000000",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "agentpassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: TASK_LOG_ADDRESS
  });
  const batch = buildRegistrationBatch({
    agentLabel: "assistant",
    agentNode: preview.agentNode,
    connectedWallet: OWNER_WALLET,
    ensRegistryAddress: ENS_REGISTRY_ADDRESS,
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: preview.gasBudgetWei,
    isOwnerWrapped: false,
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    nameWrapperAddress: null,
    normalizedAgentAddress: OWNER_WALLET,
    ownerNode: preview.ownerNode,
    policyExpiresAt: "1790000000",
    publicResolverAddress: PUBLIC_RESOLVER_ADDRESS,
    resolverAddress: PUBLIC_RESOLVER_ADDRESS,
    shouldCreateSubnameRecord: false,
    taskLogAddress: TASK_LOG_ADDRESS,
    textRecords: preview.textRecords
  });

  assert.deepEqual(
    batch.calls.map((call) => call.label),
    ["multicall", "setPolicy"]
  );
});

test("registration batch skips policy writes when the live enabled policy already matches", async () => {
  const { buildRegisterPreview } = await import("../apps/web/lib/registerAgent.ts");
  const { buildRegistrationBatch } = await import("../apps/web/lib/registrationBatch.ts");

  const preview = buildRegisterPreview({
    agentAddress: OWNER_WALLET,
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "200000000000000",
    maxGasReimbursementWei: "200000000000000",
    maxValueWei: "0",
    ownerName: "agentpassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: TASK_LOG_ADDRESS
  });
  const batch = buildRegistrationBatch({
    agentLabel: "assistant",
    agentNode: preview.agentNode,
    connectedWallet: OWNER_WALLET,
    ensRegistryAddress: ENS_REGISTRY_ADDRESS,
    existingGasBudgetWei: 200000000000000n,
    existingPolicy: [preview.ownerNode, OWNER_WALLET, TASK_LOG_ADDRESS, "0x36736d1e", 0n, 200000000000000n, 1790000000n, true],
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: preview.gasBudgetWei,
    isOwnerWrapped: false,
    maxGasReimbursementWei: "200000000000000",
    maxValueWei: "0",
    nameWrapperAddress: null,
    normalizedAgentAddress: OWNER_WALLET,
    ownerNode: preview.ownerNode,
    policyExpiresAt: "1790000000",
    publicResolverAddress: PUBLIC_RESOLVER_ADDRESS,
    resolverAddress: PUBLIC_RESOLVER_ADDRESS,
    shouldCreateSubnameRecord: false,
    taskLogAddress: TASK_LOG_ADDRESS,
    textRecords: preview.textRecords
  });

  assert.deepEqual(
    batch.calls.map((call) => call.label),
    ["multicall"]
  );
});

test("registration batch tops up budget without resetting a matching enabled policy", async () => {
  const { buildRegisterPreview } = await import("../apps/web/lib/registerAgent.ts");
  const { buildRegistrationBatch } = await import("../apps/web/lib/registrationBatch.ts");

  const preview = buildRegisterPreview({
    agentAddress: OWNER_WALLET,
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "200000000000000",
    maxGasReimbursementWei: "200000000000000",
    maxValueWei: "0",
    ownerName: "agentpassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: TASK_LOG_ADDRESS
  });
  const batch = buildRegistrationBatch({
    agentLabel: "assistant",
    agentNode: preview.agentNode,
    connectedWallet: OWNER_WALLET,
    ensRegistryAddress: ENS_REGISTRY_ADDRESS,
    existingGasBudgetWei: 50000000000000n,
    existingPolicy: [preview.ownerNode, OWNER_WALLET, TASK_LOG_ADDRESS, "0x36736d1e", 0n, 200000000000000n, 1790000000n, true],
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: preview.gasBudgetWei,
    isOwnerWrapped: false,
    maxGasReimbursementWei: "200000000000000",
    maxValueWei: "0",
    nameWrapperAddress: null,
    normalizedAgentAddress: OWNER_WALLET,
    ownerNode: preview.ownerNode,
    policyExpiresAt: "1790000000",
    publicResolverAddress: PUBLIC_RESOLVER_ADDRESS,
    resolverAddress: PUBLIC_RESOLVER_ADDRESS,
    shouldCreateSubnameRecord: false,
    taskLogAddress: TASK_LOG_ADDRESS,
    textRecords: preview.textRecords
  });

  assert.deepEqual(
    batch.calls.map((call) => call.label),
    ["multicall", "depositGasBudget"]
  );
  assert.equal(batch.calls[1].value, 150000000000000n);
});

test("registration batch resets a matching disabled policy so it becomes active again", async () => {
  const { buildRegisterPreview } = await import("../apps/web/lib/registerAgent.ts");
  const { buildRegistrationBatch } = await import("../apps/web/lib/registrationBatch.ts");

  const preview = buildRegisterPreview({
    agentAddress: OWNER_WALLET,
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "200000000000000",
    maxGasReimbursementWei: "200000000000000",
    maxValueWei: "0",
    ownerName: "agentpassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: TASK_LOG_ADDRESS
  });
  const batch = buildRegistrationBatch({
    agentLabel: "assistant",
    agentNode: preview.agentNode,
    connectedWallet: OWNER_WALLET,
    ensRegistryAddress: ENS_REGISTRY_ADDRESS,
    existingGasBudgetWei: 200000000000000n,
    existingPolicy: [preview.ownerNode, OWNER_WALLET, TASK_LOG_ADDRESS, "0x36736d1e", 0n, 200000000000000n, 1790000000n, false],
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: preview.gasBudgetWei,
    isOwnerWrapped: false,
    maxGasReimbursementWei: "200000000000000",
    maxValueWei: "0",
    nameWrapperAddress: null,
    normalizedAgentAddress: OWNER_WALLET,
    ownerNode: preview.ownerNode,
    policyExpiresAt: "1790000000",
    publicResolverAddress: PUBLIC_RESOLVER_ADDRESS,
    resolverAddress: PUBLIC_RESOLVER_ADDRESS,
    shouldCreateSubnameRecord: false,
    taskLogAddress: TASK_LOG_ADDRESS,
    textRecords: preview.textRecords
  });

  assert.deepEqual(
    batch.calls.map((call) => call.label),
    ["multicall", "setPolicy"]
  );
  assert.equal(batch.calls[1].value, 0n);
});

test("registration submission falls back when the wallet does not support sendCalls", async () => {
  const { buildRegisterPreview } = await import("../apps/web/lib/registerAgent.ts");
  const { buildRegistrationBatch } = await import("../apps/web/lib/registrationBatch.ts");
  const { submitRegistrationBatch } = await import("../apps/web/lib/registrationSubmission.ts");

  const preview = buildRegisterPreview({
    agentAddress: OWNER_WALLET,
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "10000000000000000",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "agentpassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: TASK_LOG_ADDRESS
  });
  const batch = buildRegistrationBatch({
    agentLabel: "assistant",
    agentNode: preview.agentNode,
    connectedWallet: OWNER_WALLET,
    ensRegistryAddress: ENS_REGISTRY_ADDRESS,
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: preview.gasBudgetWei,
    isOwnerWrapped: false,
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    nameWrapperAddress: null,
    normalizedAgentAddress: OWNER_WALLET,
    ownerNode: preview.ownerNode,
    policyExpiresAt: "1790000000",
    publicResolverAddress: PUBLIC_RESOLVER_ADDRESS,
    resolverAddress: PUBLIC_RESOLVER_ADDRESS,
    shouldCreateSubnameRecord: true,
    taskLogAddress: TASK_LOG_ADDRESS,
    textRecords: preview.textRecords
  });
  const sentTransactions = [];

  const result = await submitRegistrationBatch({
    account: OWNER_WALLET,
    batch,
    chainId: 11155111,
    sendCalls: async () => {
      throw new Error('The method "wallet_sendCalls" does not exist / is not available.');
    },
    sendTransaction: async (request) => {
      sentTransactions.push(request);
      return `0x${sentTransactions.length.toString(16).padStart(64, "0")}`;
    },
    waitForTransactionReceipt: async () => {
    }
  });

  assert.equal(result.mode, "sequential");
  assert.deepEqual(
    sentTransactions.map((request) => request.to),
    batch.calls.map((call) => call.to)
  );
  assert.deepEqual(
    sentTransactions.map((request) => request.value ?? 0n),
    batch.calls.map((call) => call.value ?? 0n)
  );
  assert.deepEqual(result.transactionIds, [
    "0x0000000000000000000000000000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000000000000000000000000000002",
    "0x0000000000000000000000000000000000000000000000000000000000000003"
  ]);
});

test("registration fallback waits for each transaction before sending the dependent next call", async () => {
  const { buildRegisterPreview } = await import("../apps/web/lib/registerAgent.ts");
  const { buildRegistrationBatch } = await import("../apps/web/lib/registrationBatch.ts");
  const { submitRegistrationBatch } = await import("../apps/web/lib/registrationSubmission.ts");

  const preview = buildRegisterPreview({
    agentAddress: OWNER_WALLET,
    agentLabel: "assistant",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "10000000000000000",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "agentpassports.eth",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: TASK_LOG_ADDRESS
  });
  const batch = buildRegistrationBatch({
    agentLabel: "assistant",
    agentNode: preview.agentNode,
    connectedWallet: OWNER_WALLET,
    ensRegistryAddress: ENS_REGISTRY_ADDRESS,
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: preview.gasBudgetWei,
    isOwnerWrapped: false,
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    nameWrapperAddress: null,
    normalizedAgentAddress: OWNER_WALLET,
    ownerNode: preview.ownerNode,
    policyExpiresAt: "1790000000",
    publicResolverAddress: PUBLIC_RESOLVER_ADDRESS,
    resolverAddress: PUBLIC_RESOLVER_ADDRESS,
    shouldCreateSubnameRecord: true,
    taskLogAddress: TASK_LOG_ADDRESS,
    textRecords: preview.textRecords
  });
  const events = [];

  await submitRegistrationBatch({
    account: OWNER_WALLET,
    batch,
    chainId: 11155111,
    sendCalls: async () => {
      throw new Error('The method "wallet_sendCalls" does not exist / is not available.');
    },
    sendTransaction: async (request) => {
      const hash = `0x${(events.length + 1).toString(16).padStart(64, "0")}`;
      events.push(`send:${request.to}`);
      return hash;
    },
    waitForTransactionReceipt: async ({ hash }) => {
      events.push(`wait:${hash}`);
    }
  });

  assert.deepEqual(events, [
    `send:${batch.calls[0].to}`,
    "wait:0x0000000000000000000000000000000000000000000000000000000000000001",
    `send:${batch.calls[1].to}`,
    "wait:0x0000000000000000000000000000000000000000000000000000000000000003",
    `send:${batch.calls[2].to}`,
    "wait:0x0000000000000000000000000000000000000000000000000000000000000005"
  ]);
});

test("registration fallback preflights each transaction before wallet signing", async () => {
  const { submitRegistrationBatch } = await import("../apps/web/lib/registrationSubmission.ts");
  const batch = {
    calls: [
      { data: "0x1234", label: "multicall", to: PUBLIC_RESOLVER_ADDRESS },
      { data: "0xd879609b", label: "setPolicy", to: EXECUTOR_ADDRESS, value: 1n }
    ],
    summary: []
  };
  const sentTransactions = [];

  await assert.rejects(
    submitRegistrationBatch({
      account: OWNER_WALLET,
      batch,
      call: async (request) => {
        if (request.to === EXECUTOR_ADDRESS) {
          throw new Error("execution reverted: 0x42f058b4");
        }
      },
      chainId: 11155111,
      sendCalls: async () => {
        throw new Error('The method "wallet_sendCalls" does not exist / is not available.');
      },
      sendTransaction: async (request) => {
        sentTransactions.push(request);
        return `0x${sentTransactions.length.toString(16).padStart(64, "0")}`;
      },
      waitForTransactionReceipt: async () => {
      }
    }),
    /Connected wallet cannot set policy for this owner ENS/
  );

  assert.deepEqual(
    sentTransactions.map((request) => request.to),
    [PUBLIC_RESOLVER_ADDRESS]
  );
});

test("register preview keeps policy hash pending until owner and agent label are entered", async () => {
  const { buildRegisterPreview } = await import("../apps/web/lib/registerAgent.ts");

  const preview = buildRegisterPreview({
    agentAddress: "",
    agentLabel: "",
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerName: "",
    policyExpiresAt: "1790000000",
    policyUri: "",
    taskLogAddress: TASK_LOG_ADDRESS
  });

  assert.equal(preview.agentName, "");
  assert.equal(preview.policyHash, null);
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

test("owner ENS status keeps manual entry available when the connected wallet has no reverse ENS", async () => {
  const { buildOwnerEnsStatus } = await import("../apps/web/lib/registerAgent.ts");

  const status = buildOwnerEnsStatus({
    connectedWallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    effectiveOwnerManager: null,
    isOwnerManagerSettled: true,
    isOwnerResolutionSettled: true,
    isReverseEnsSettled: true,
    normalizedOwnerName: "",
    ownerResolvedAddress: null,
    reverseEnsName: null
  });

  assert.equal(status.canSubmit, false);
  assert.equal(status.guidance, "No owner ENS detected for this wallet. Enter an ENS name you control.");
  assert.equal(status.blocker, "Enter an ENS name you control before submitting registration");
});

test("owner ENS autofill uses reverse ENS only for an untouched empty owner field", async () => {
  const { readOwnerEnsAutofill } = await import("../apps/web/lib/registerAgent.ts");

  assert.equal(
    readOwnerEnsAutofill({
      currentOwnerName: "",
      hasUserEditedOwnerName: false,
      reverseEnsName: "Alice.eth"
    }),
    "alice.eth"
  );
  assert.equal(
    readOwnerEnsAutofill({
      currentOwnerName: "   ",
      hasUserEditedOwnerName: false,
      reverseEnsName: "  Alice.eth  "
    }),
    "alice.eth"
  );
  assert.equal(
    readOwnerEnsAutofill({
      currentOwnerName: "",
      hasUserEditedOwnerName: false,
      reverseEnsName: null
    }),
    null
  );
});

test("owner ENS autofill does not overwrite user-entered owner names", async () => {
  const { readOwnerEnsAutofill } = await import("../apps/web/lib/registerAgent.ts");

  assert.equal(
    readOwnerEnsAutofill({
      currentOwnerName: "bob.eth",
      hasUserEditedOwnerName: false,
      reverseEnsName: "alice.eth"
    }),
    null
  );
  assert.equal(
    readOwnerEnsAutofill({
      currentOwnerName: "",
      hasUserEditedOwnerName: true,
      reverseEnsName: "alice.eth"
    }),
    null
  );
});

test("owner ENS status blocks unresolved or unowned owner names", async () => {
  const { buildOwnerEnsStatus } = await import("../apps/web/lib/registerAgent.ts");
  const connectedWallet = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  const checkingManager = buildOwnerEnsStatus({
    connectedWallet,
    effectiveOwnerManager: null,
    isOwnerManagerSettled: false,
    isOwnerResolutionSettled: true,
    isReverseEnsSettled: true,
    normalizedOwnerName: "alice.eth",
    ownerResolvedAddress: null,
    reverseEnsName: null
  });
  assert.equal(checkingManager.canSubmit, false);
  assert.equal(checkingManager.blocker, "Checking whether this wallet can manage the ENS name");

  const ownedWithoutAddressRecord = buildOwnerEnsStatus({
    connectedWallet,
    effectiveOwnerManager: connectedWallet,
    isOwnerManagerSettled: true,
    isOwnerResolutionSettled: true,
    isReverseEnsSettled: true,
    normalizedOwnerName: "alice.eth",
    ownerResolvedAddress: null,
    reverseEnsName: null
  });
  assert.equal(ownedWithoutAddressRecord.canSubmit, true);
  assert.equal(ownedWithoutAddressRecord.blocker, null);

  const unowned = buildOwnerEnsStatus({
    connectedWallet,
    effectiveOwnerManager: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    isOwnerManagerSettled: true,
    isOwnerResolutionSettled: true,
    isReverseEnsSettled: true,
    normalizedOwnerName: "alice.eth",
    ownerResolvedAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
    reverseEnsName: null
  });
  assert.equal(unowned.canSubmit, false);
  assert.equal(unowned.blocker, "This wallet cannot manage the entered ENS name");

  const owned = buildOwnerEnsStatus({
    connectedWallet,
    effectiveOwnerManager: connectedWallet,
    isOwnerManagerSettled: true,
    isOwnerResolutionSettled: true,
    isReverseEnsSettled: true,
    normalizedOwnerName: "alice.eth",
    ownerResolvedAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
    reverseEnsName: null
  });
  assert.equal(owned.canSubmit, true);
  assert.equal(owned.blocker, null);
});

test("effective owner manager unwraps NameWrapper ownership for registration checks", async () => {
  const { resolveEffectiveOwnerManager } = await import("../apps/web/lib/registerAgent.ts");
  const nameWrapper = "0x1111111111111111111111111111111111111111";
  const wrappedManager = "0x2222222222222222222222222222222222222222";
  const directManager = "0x3333333333333333333333333333333333333333";

  assert.equal(
    resolveEffectiveOwnerManager({ nameWrapperAddress: nameWrapper, registryOwner: nameWrapper, wrapperOwner: wrappedManager }),
    wrappedManager
  );
  assert.equal(
    resolveEffectiveOwnerManager({ nameWrapperAddress: nameWrapper, registryOwner: directManager, wrapperOwner: null }),
    directManager
  );
});
