import assert from "node:assert/strict";
import test from "node:test";

const OWNER_NODE = "0x787192fc5378cc32aa956ddfdedbf26b24e8d78e40109add0eea2c1a012c3dec";
const AGENT_NODE = "0xdd6fbcc964c82b43fdd8e204adf97622963b719d8fe12ebf48264a4677a4dd55";
const EXECUTOR_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const TASK_LOG_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const RELAYER_URL = "http://localhost:3000/api/relayer/execute";
const AGENT_PRIVATE_KEY = `0x${"11".repeat(32)}`;

test("agent runner config parses required environment values", async () => {
  const { loadRunnerConfig } = await import("../agent-runner/src/config.ts");

  const config = loadRunnerConfig({
    AGENT_PRIVATE_KEY,
    CHAIN_ID: "11155111",
    EXECUTOR_ADDRESS,
    RELAYER_URL,
    RPC_URL: "http://127.0.0.1:8545",
    TASK_LOG_ADDRESS,
  });

  assert.deepEqual(config, {
    agentPrivateKey: AGENT_PRIVATE_KEY,
    chainId: 11155111n,
    executorAddress: EXECUTOR_ADDRESS,
    relayerUrl: RELAYER_URL,
    rpcUrl: "http://127.0.0.1:8545",
    taskLogAddress: TASK_LOG_ADDRESS,
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
