import assert from "node:assert/strict";
import test from "node:test";

const utilities = await import("../packages/config/src/index.ts");

const OWNER_NODE = "0x787192fc5378cc32aa956ddfdedbf26b24e8d78e40109add0eea2c1a012c3dec";
const AGENT_NODE = "0xdd6fbcc964c82b43fdd8e204adf97622963b719d8fe12ebf48264a4677a4dd55";
const EXECUTOR_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const TASK_LOG_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const CALL_DATA_HASH = "0x1d9a6570b4147a41f00c51af3f304ef8ed803c660c2ff922ef8304b1373c9fd2";

test("ENS utilities compute Solidity-compatible namehashes and subnodes", () => {
  assert.equal(
    utilities.namehashEnsName("eth"),
    "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae",
  );
  assert.equal(utilities.namehashEnsName("alice.eth"), OWNER_NODE);
  assert.equal(utilities.namehashEnsName("assistant.alice.eth"), AGENT_NODE);
  assert.equal(utilities.computeSubnode(OWNER_NODE, "assistant"), AGENT_NODE);
  assert.equal(
    utilities.namehashEnsName("büro.eth"),
    "0x3334e64070a37532a7a5b8e14dacdef412cdd833f2b617e226a3973cd066bb36",
  );
  assert.equal(
    utilities.computeSubnode(OWNER_NODE, "büro"),
    "0x67316299f7da7d93e214a42a5714b08347585da755a432a6d8d6732ddf7e2838",
  );
});

test("TypeScript helpers build task intent typed data and Solidity-compatible hashes", () => {
  const intent = {
    agentNode: AGENT_NODE,
    target: TASK_LOG_ADDRESS,
    callDataHash: CALL_DATA_HASH,
    value: 0n,
    nonce: 0n,
    expiresAt: 1790000000n,
  };

  assert.equal(utilities.taskLogRecordTaskSelector(), "0x36736d1e");
  assert.equal(utilities.hashCallData("0x36736d1e"), CALL_DATA_HASH);
  assert.equal(utilities.hashTaskIntentStruct(intent), "0x7f1b61a9d6365ebae242e225a0631c642b6add9ced18388ca7c22e03129ace20");
  assert.equal(
    utilities.hashTaskIntent(intent, 11155111n, EXECUTOR_ADDRESS),
    "0x28133eef788c4579d3f97f81863aef1e16c961c3719a7c3190fc6682d50a8bff",
  );

  assert.deepEqual(utilities.buildTaskIntentTypedData(intent, 11155111n, EXECUTOR_ADDRESS), {
    domain: {
      name: "AgentPolicyExecutor",
      version: "1",
      chainId: 11155111n,
      verifyingContract: EXECUTOR_ADDRESS,
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
    message: intent,
  });
});

test("Signer recovery returns the Ethereum address that produced a raw digest signature", () => {
  const digest = "0x28133eef788c4579d3f97f81863aef1e16c961c3719a7c3190fc6682d50a8bff";
  const signature =
    "0x21eaf310db27747e87227397b5f7bd44c3bc87e88861d727f834ebeb1af3069d533580f7728d00643630e708367046eab3ef2359d1e499f8e19e2b1df8d197411c";

  assert.equal(utilities.recoverSignerAddress(digest, signature), "0xFCAd0B19bB29D4674531d6f115237E16AfCE377c");
});

test("Policy helpers produce deterministic metadata and hashes", () => {
  const metadata = utilities.buildPolicyMetadata({
    ownerNode: OWNER_NODE,
    agentNode: AGENT_NODE,
    target: TASK_LOG_ADDRESS,
    selector: "0x36736d1e",
    maxValueWei: 0n,
    maxGasReimbursementWei: 1000000000000000n,
    expiresAt: 1790000000n,
  });

  assert.deepEqual(metadata, {
    agentNode: AGENT_NODE,
    expiresAt: "1790000000",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    ownerNode: OWNER_NODE,
    selector: "0x36736d1e",
    target: "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
  });
  assert.equal(utilities.hashPolicyMetadata(metadata), "0x25d8cf6943e62236be9c527f4896664a057b825fe65eef1072a1dacbc01ad8f6");
});

test("ENS and hex validation rejects malformed inputs before they reach clients", () => {
  assert.throws(() => utilities.namehashEnsName("alice..eth"), /Invalid ENS name/);
  assert.throws(() => utilities.computeSubnode(OWNER_NODE, "bad.label"), /Invalid ENS label/);
  assert.throws(() => utilities.computeSubnode(OWNER_NODE, "Assistant"), /Invalid ENS label/);
  assert.throws(() => utilities.hashCallData("36736d1e"), /Expected hex string/);
  assert.throws(
    () =>
      utilities.hashTaskIntentStruct({
        agentNode: AGENT_NODE,
        target: TASK_LOG_ADDRESS,
        callDataHash: CALL_DATA_HASH,
        value: 0n,
        nonce: 0n,
        expiresAt: 1n << 64n,
      }),
    /uint64 value out of range/,
  );
  assert.throws(() => utilities.recoverSignerAddress(CALL_DATA_HASH, "0x1234"), /Expected 65-byte signature/);
  assert.throws(
    () =>
      utilities.recoverSignerAddress(
        CALL_DATA_HASH,
        "0x000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000000000000000000000011b",
      ),
    /Invalid ECDSA signature/,
  );
  assert.throws(
    () =>
      utilities.recoverSignerAddress(
        CALL_DATA_HASH,
        "0x000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000011d",
      ),
    /Invalid ECDSA signature/,
  );
  assert.throws(
    () =>
      utilities.recoverSignerAddress(
        "0x28133eef788c4579d3f97f81863aef1e16c961c3719a7c3190fc6682d50a8bff",
        "0x21eaf310db27747e87227397b5f7bd44c3bc87e88861d727f834ebeb1af3069dacca7f088d72ff9bc9cf18f7c98fb91406bfb98cdd640642de34336ed764aa001b",
      ),
    /Invalid ECDSA signature/,
  );
});
