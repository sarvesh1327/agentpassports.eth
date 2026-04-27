import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const OWNER_NODE = "0x787192fc5378cc32aa956ddfdedbf26b24e8d78e40109add0eea2c1a012c3dec";
const AGENT_NODE = "0xdd6fbcc964c82b43fdd8e204adf97622963b719d8fe12ebf48264a4677a4dd55";
const EXECUTOR_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ENS_REGISTRY_ADDRESS = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const TASK_LOG_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const RESOLVER_ADDRESS = "0x0000000000000000000000000000000000000002";
const RESOLVED_AGENT_ADDRESS = "0xFCAd0B19bB29D4674531d6f115237E16AfCE377c";
const CALL_DATA = "0x36736d1e";
const CALL_DATA_HASH = "0x1d9a6570b4147a41f00c51af3f304ef8ed803c660c2ff922ef8304b1373c9fd2";
const SIGNATURE =
  "0x21eaf310db27747e87227397b5f7bd44c3bc87e88861d727f834ebeb1af3069d533580f7728d00643630e708367046eab3ef2359d1e499f8e19e2b1df8d197411c";
const RELAYER_PRIVATE_KEY = `0x${"22".repeat(32)}`;

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function assertFile(relativePath) {
  const entry = await stat(path.join(root, relativePath));
  assert.equal(entry.isFile(), true, `${relativePath} should be a file`);
}

function requestBody(overrides = {}) {
  return {
    intent: {
      agentNode: AGENT_NODE,
      target: TASK_LOG_ADDRESS,
      callDataHash: CALL_DATA_HASH,
      value: "0",
      nonce: "0",
      expiresAt: 1790000000,
      ...overrides.intent,
    },
    callData: CALL_DATA,
    signature: SIGNATURE,
    ...overrides,
  };
}

function precheckContext(overrides = {}) {
  return {
    chainId: 11155111n,
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: 1000000000000000n,
    nextNonce: 0n,
    policy: {
      enabled: true,
      expiresAt: 1790000100n,
      maxGasReimbursementWei: 1000000000000000n,
      maxValueWei: 0n,
      ownerNode: OWNER_NODE,
      ownerWallet: "0x0000000000000000000000000000000000000003",
      selector: "0x36736d1e",
      target: TASK_LOG_ADDRESS,
    },
    resolvedAgentAddress: RESOLVED_AGENT_ADDRESS,
    resolverAddress: RESOLVER_ADDRESS,
    ...overrides,
  };
}

function assertRelayerCode(callback, code) {
  assert.throws(
    callback,
    (error) => error?.code === code && error.message.includes(code),
    `expected ${code}`,
  );
}

test("relayer helpers normalize request bodies and validate signed task intents", async () => {
  const { parseRelayerExecuteRequest, validateRelayerExecution } = await import(
    "../apps/web/lib/relayer/validation.ts"
  );

  const payload = parseRelayerExecuteRequest(requestBody());
  assert.deepEqual(payload.intent, {
    agentNode: AGENT_NODE,
    callDataHash: CALL_DATA_HASH,
    expiresAt: 1790000000n,
    nonce: 0n,
    target: TASK_LOG_ADDRESS,
    value: 0n,
  });

  const result = validateRelayerExecution({
    context: precheckContext(),
    now: 1700000000n,
    payload,
  });

  assert.equal(result.calldataHash, CALL_DATA_HASH);
  assert.equal(result.digest, "0x28133eef788c4579d3f97f81863aef1e16c961c3719a7c3190fc6682d50a8bff");
  assert.equal(result.recoveredSigner, RESOLVED_AGENT_ADDRESS);
  assert.equal(result.selector, "0x36736d1e");
});

test("relayer helpers reject requests before the relayer spends gas", async () => {
  const { parseRelayerExecuteRequest, validateRelayerExecution } = await import(
    "../apps/web/lib/relayer/validation.ts"
  );
  const payload = parseRelayerExecuteRequest(requestBody());

  assertRelayerCode(
    () =>
      validateRelayerExecution({
        context: precheckContext(),
        now: 1700000000n,
        payload: { ...payload, callData: "0x36736d1f" },
      }),
    "BadCalldataHash",
  );
  assertRelayerCode(
    () => validateRelayerExecution({ context: precheckContext({ nextNonce: 1n }), now: 1700000000n, payload }),
    "BadNonce",
  );
  assertRelayerCode(
    () => validateRelayerExecution({ context: precheckContext(), now: 1800000000n, payload }),
    "IntentExpired",
  );
  assertRelayerCode(
    () =>
      validateRelayerExecution({
        context: precheckContext({ resolvedAgentAddress: "0x0000000000000000000000000000000000000004" }),
        now: 1700000000n,
        payload,
      }),
    "BadSignature",
  );
  assertRelayerCode(
    () => parseRelayerExecuteRequest(requestBody({ intent: { value: "-1" } })),
    "InvalidRequest",
  );
});

test("relayer config reads only server-safe operational values", async () => {
  const { loadRelayerConfig } = await import("../apps/web/lib/relayer/config.ts");

  assert.deepEqual(
    loadRelayerConfig({
      NEXT_PUBLIC_CHAIN_ID: "11155111",
      NEXT_PUBLIC_ENS_REGISTRY: ENS_REGISTRY_ADDRESS,
      NEXT_PUBLIC_EXECUTOR_ADDRESS: EXECUTOR_ADDRESS,
      RELAYER_PRIVATE_KEY,
      RPC_URL: "http://127.0.0.1:8545/",
    }),
    {
      chainId: 11155111n,
      ensRegistryAddress: ENS_REGISTRY_ADDRESS,
      executorAddress: EXECUTOR_ADDRESS,
      relayerPrivateKey: RELAYER_PRIVATE_KEY,
      rpcUrl: "http://127.0.0.1:8545",
    },
  );

  assertRelayerCode(() => loadRelayerConfig({ NEXT_PUBLIC_CHAIN_ID: "11155111" }), "MissingConfig");
  assertRelayerCode(
    () =>
      loadRelayerConfig({
        NEXT_PUBLIC_CHAIN_ID: "11155111",
        NEXT_PUBLIC_ENS_REGISTRY: ENS_REGISTRY_ADDRESS,
        NEXT_PUBLIC_EXECUTOR_ADDRESS: EXECUTOR_ADDRESS,
        RELAYER_PRIVATE_KEY: "0x1234",
        RPC_URL: "http://127.0.0.1:8545",
      }),
    "InvalidConfig",
  );
});

test("relayer contract adapters map executor reads into validation input", async () => {
  const { policyFromContractResult } = await import("../apps/web/lib/relayer/contracts.ts");

  assert.deepEqual(
    policyFromContractResult([
      OWNER_NODE,
      "0x0000000000000000000000000000000000000003",
      TASK_LOG_ADDRESS,
      "0x36736d1e",
      0n,
      1000000000000000n,
      1790000100n,
      true,
    ]),
    precheckContext().policy,
  );
});

test("relayer route submits validated executor transactions from a thin API handler", async () => {
  await assertFile("apps/web/app/api/relayer/execute/route.ts");
  await assertFile("apps/web/lib/relayer/config.ts");
  await assertFile("apps/web/lib/relayer/contracts.ts");
  await assertFile("apps/web/lib/relayer/validation.ts");

  const source = await readText("apps/web/app/api/relayer/execute/route.ts");
  assert.match(source, /export const runtime = "nodejs"/);
  assert.match(source, /validateRelayerExecution/);
  assert.match(source, /writeContract/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_RELAYER_PRIVATE_KEY/);
});
