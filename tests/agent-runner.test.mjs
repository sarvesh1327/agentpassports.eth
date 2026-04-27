import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const OWNER_NODE = "0x787192fc5378cc32aa956ddfdedbf26b24e8d78e40109add0eea2c1a012c3dec";
const AGENT_NODE = "0xdd6fbcc964c82b43fdd8e204adf97622963b719d8fe12ebf48264a4677a4dd55";
const EXECUTOR_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const TASK_LOG_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const RELAYER_URL = "http://localhost:3000/api/relayer/execute";
const AGENT_PRIVATE_KEY = `0x${"11".repeat(32)}`;
const ENS_REGISTRY_ADDRESS = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const RESOLVER_ADDRESS = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5";
const AGENT_ADDRESS = "0x19E7E376E7C213B7E7E7E46CC70A5DD086DAFF2A";
const TX_HASH = `0x${"aa".repeat(32)}`;

test("agent runner config parses required environment values", async () => {
  const { loadRunnerConfig } = await import("../agent-runner/src/config.ts");

  const config = loadRunnerConfig({
    AGENT_PRIVATE_KEY,
    AGENT_ENS_NAME: "assistant.alice.eth",
    CHAIN_ID: "11155111",
    ENS_REGISTRY: ENS_REGISTRY_ADDRESS,
    EXECUTOR_ADDRESS,
    INTENT_TTL_SECONDS: "600",
    LAST_PAYLOAD_PATH: ".agentpassports/last-intent.json",
    METADATA_URI: "ipfs://demo",
    OWNER_ENS_NAME: "alice.eth",
    RELAYER_URL,
    RPC_URL: "http://127.0.0.1:8545",
    TASK_LOG_ADDRESS,
    TASK_DESCRIPTION: "Record wallet health check",
  });

  assert.deepEqual(config, {
    agentPrivateKey: AGENT_PRIVATE_KEY,
    agentName: "assistant.alice.eth",
    chainId: 11155111n,
    ensRegistryAddress: ENS_REGISTRY_ADDRESS,
    executorAddress: EXECUTOR_ADDRESS,
    intentTtlSeconds: 600n,
    lastPayloadPath: ".agentpassports/last-intent.json",
    metadataURI: "ipfs://demo",
    ownerName: "alice.eth",
    relayerUrl: RELAYER_URL,
    rpcUrl: "http://127.0.0.1:8545",
    taskLogAddress: TASK_LOG_ADDRESS,
    taskDescription: "Record wallet health check",
  });
  assert.throws(() => loadRunnerConfig({ CHAIN_ID: "11155111" }), /Missing AGENT_PRIVATE_KEY/);
});

test("agent runner builds TaskLog calldata and intent input", async () => {
  const { buildTaskPlan } = await import("../agent-runner/src/planTask.ts");

  const plan = buildTaskPlan({
    agentNode: AGENT_NODE,
    expiresAt: 1790000000n,
    metadataURI: "ipfs://demo",
    nonce: 0n,
    ownerNode: OWNER_NODE,
    taskDescription: "Record wallet health check",
    taskLogAddress: TASK_LOG_ADDRESS,
  });

  assert.equal(plan.taskHash, "0x6c81584accfce63b6b5dbd33eefe4e4cb7eea85dfe6661663e2d6d6bebf13afa");
  assert.equal(
    plan.callData,
    "0x36736d1edd6fbcc964c82b43fdd8e204adf97622963b719d8fe12ebf48264a4677a4dd55787192fc5378cc32aa956ddfdedbf26b24e8d78e40109add0eea2c1a012c3dec6c81584accfce63b6b5dbd33eefe4e4cb7eea85dfe6661663e2d6d6bebf13afa0000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000b697066733a2f2f64656d6f000000000000000000000000000000000000000000",
  );
  assert.deepEqual(plan.intent, {
    agentNode: AGENT_NODE,
    callDataHash: "0x54b55f2b11883125ffbf0c612ee43d67e6532afa3a45b64c27319c681e198f56",
    expiresAt: 1790000000n,
    nonce: 0n,
    target: TASK_LOG_ADDRESS,
    value: 0n,
  });
});

test("agent runner signs typed data through an injected signer and verifies the signer", async () => {
  const { signTaskIntent } = await import("../agent-runner/src/signIntent.ts");
  const intent = {
    agentNode: AGENT_NODE,
    target: TASK_LOG_ADDRESS,
    callDataHash: "0x1d9a6570b4147a41f00c51af3f304ef8ed803c660c2ff922ef8304b1373c9fd2",
    value: 0n,
    nonce: 0n,
    expiresAt: 1790000000n,
  };
  const signature =
    "0x21eaf310db27747e87227397b5f7bd44c3bc87e88861d727f834ebeb1af3069d533580f7728d00643630e708367046eab3ef2359d1e499f8e19e2b1df8d197411c";
  let seenTypedData;

  const signed = await signTaskIntent({
    chainId: 11155111n,
    executorAddress: EXECUTOR_ADDRESS,
    expectedSigner: "0xFCAd0B19bB29D4674531d6f115237E16AfCE377c",
    intent,
    signTypedData: (typedData) => {
      seenTypedData = typedData;
      return signature;
    },
  });

  assert.equal(signed.digest, "0x28133eef788c4579d3f97f81863aef1e16c961c3719a7c3190fc6682d50a8bff");
  assert.equal(signed.recoveredSigner, "0xFCAd0B19bB29D4674531d6f115237E16AfCE377c");
  assert.equal(signed.signature, signature);
  assert.deepEqual(seenTypedData.message, intent);
  assert.equal(seenTypedData.primaryType, "TaskIntent");
  assert.equal(signed.typedData.primaryType, "TaskIntent");
  await assert.rejects(
    () =>
      signTaskIntent({
        chainId: 11155111n,
        executorAddress: EXECUTOR_ADDRESS,
        expectedSigner: "0x0000000000000000000000000000000000000001",
        intent,
        signTypedData: () => signature,
      }),
    /Signature does not match expected agent signer/,
  );
});

test("agent runner resolves ENS signer, reads nonce, submits intent, and saves payload", async () => {
  const { createPrivateKeyAgentSigner, runAgentTask } = await import("../agent-runner/src/index.ts");
  const signer = createPrivateKeyAgentSigner(AGENT_PRIVATE_KEY);
  const reads = [];
  const submissions = [];
  const savedPayloads = [];
  const client = {
    async readContract(call) {
      reads.push([call.address, call.functionName, call.args]);
      if (call.functionName === "resolver") {
        return RESOLVER_ADDRESS;
      }
      if (call.functionName === "addr") {
        return signer.address;
      }
      if (call.functionName === "nextNonce") {
        return 3n;
      }
      throw new Error(`Unexpected read ${call.functionName}`);
    },
  };

  const result = await runAgentTask({
    client,
    config: {
      agentName: "assistant.alice.eth",
      agentPrivateKey: AGENT_PRIVATE_KEY,
      chainId: 11155111n,
      ensRegistryAddress: ENS_REGISTRY_ADDRESS,
      executorAddress: EXECUTOR_ADDRESS,
      intentTtlSeconds: 600n,
      lastPayloadPath: ".agentpassports/last-intent.json",
      metadataURI: "ipfs://demo",
      ownerName: "alice.eth",
      relayerUrl: RELAYER_URL,
      rpcUrl: "http://127.0.0.1:8545",
      taskDescription: "Record wallet health check",
      taskLogAddress: TASK_LOG_ADDRESS,
    },
    now: 1_700_000_000n,
    savePayload: async (path, payload) => {
      savedPayloads.push([path, payload]);
    },
    signer: {
      address: AGENT_ADDRESS,
      signTypedData: signer.signTypedData,
    },
    submitRelayer: async (url, payload) => {
      submissions.push([url, payload]);
      return { status: "submitted", txHash: TX_HASH };
    },
  });

  assert.deepEqual(
    reads.map(([, functionName]) => functionName),
    ["resolver", "addr", "nextNonce"],
  );
  assert.equal(result.agentNode, AGENT_NODE);
  assert.equal(result.ownerNode, OWNER_NODE);
  assert.equal(result.resolvedAgentAddress, signer.address);
  assert.equal(result.resolverAddress, RESOLVER_ADDRESS);
  assert.equal(result.plan.intent.nonce, 3n);
  assert.equal(result.plan.intent.expiresAt, 1_700_000_600n);
  assert.equal(result.relayerResponse.txHash, TX_HASH);
  assert.equal(result.signed.recoveredSigner, signer.address);
  assert.equal(submissions[0][0], RELAYER_URL);
  assert.equal(submissions[0][1].callData, result.plan.callData);
  assert.equal(savedPayloads[0][0], ".agentpassports/last-intent.json");
  assert.equal(savedPayloads[0][1].signature, result.signed.signature);
});

test("agent runner writes bigint typed data as JSON-safe strings", async () => {
  const { writeSignedPayload } = await import("../agent-runner/src/index.ts");
  const directory = await mkdtemp(path.join(os.tmpdir(), "agentpassports-runner-"));
  const filePath = path.join(directory, "last-intent.json");

  try {
    await writeSignedPayload(filePath, {
      agentName: "assistant.alice.eth",
      agentNode: AGENT_NODE,
      callData: "0x36736d1e",
      digest: `0x${"12".repeat(32)}`,
      intent: {
        agentNode: AGENT_NODE,
        callDataHash: `0x${"34".repeat(32)}`,
        expiresAt: "1700000600",
        nonce: "3",
        target: TASK_LOG_ADDRESS,
        value: "0",
      },
      ownerName: "alice.eth",
      ownerNode: OWNER_NODE,
      recoveredSigner: AGENT_ADDRESS,
      resolverAddress: RESOLVER_ADDRESS,
      resolvedAgentAddress: AGENT_ADDRESS,
      signature: `0x${"56".repeat(65)}`,
      taskHash: `0x${"78".repeat(32)}`,
      typedData: {
        domain: {
          chainId: 11155111n,
          name: "AgentPolicyExecutor",
          verifyingContract: EXECUTOR_ADDRESS,
          version: "1",
        },
        message: {
          agentNode: AGENT_NODE,
          callDataHash: `0x${"34".repeat(32)}`,
          expiresAt: 1700000600n,
          nonce: 3n,
          target: TASK_LOG_ADDRESS,
          value: 0n,
        },
        primaryType: "TaskIntent",
        types: {
          TaskIntent: [
            { name: "agentNode", type: "bytes32" },
            { name: "target", type: "address" },
            { name: "callDataHash", type: "bytes32" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "expiresAt", type: "uint64" },
          ],
        },
      },
    });

    const payload = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(payload.typedData.domain.chainId, "11155111");
    assert.equal(payload.typedData.message.nonce, "3");
    assert.equal(payload.typedData.message.expiresAt, "1700000600");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
