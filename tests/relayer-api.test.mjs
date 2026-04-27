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
const TX_HASH = `0x${"33".repeat(32)}`;
const RESERVATION_STORE_URL = "https://redis.example";
const RESERVATION_STORE_TOKEN = "redis-token";

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
    () => validateRelayerExecution({ context: precheckContext({ gasBudgetWei: 0n }), now: 1700000000n, payload }),
    "InsufficientGasBudget",
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
      reservationStore: { kind: "memory" },
      relayerPrivateKey: RELAYER_PRIVATE_KEY,
      rpcUrl: "http://127.0.0.1:8545",
    },
  );

  assert.deepEqual(
    loadRelayerConfig({
      NEXT_PUBLIC_CHAIN_ID: "11155111",
      NEXT_PUBLIC_ENS_REGISTRY: ENS_REGISTRY_ADDRESS,
      NEXT_PUBLIC_EXECUTOR_ADDRESS: EXECUTOR_ADDRESS,
      RELAYER_PRIVATE_KEY,
      RELAYER_RESERVATION_REDIS_REST_TOKEN: RESERVATION_STORE_TOKEN,
      RELAYER_RESERVATION_REDIS_REST_URL: `${RESERVATION_STORE_URL}/`,
      RPC_URL: "http://127.0.0.1:8545",
    }).reservationStore,
    {
      kind: "redisRest",
      token: RESERVATION_STORE_TOKEN,
      url: RESERVATION_STORE_URL,
    },
  );

  assertRelayerCode(
    () =>
      loadRelayerConfig({
        NEXT_PUBLIC_CHAIN_ID: "11155111",
        NEXT_PUBLIC_ENS_REGISTRY: ENS_REGISTRY_ADDRESS,
        NEXT_PUBLIC_EXECUTOR_ADDRESS: EXECUTOR_ADDRESS,
        NODE_ENV: "production",
        RELAYER_PRIVATE_KEY,
        RPC_URL: "http://127.0.0.1:8545",
      }),
    "MissingConfig",
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

test("relayer error responses do not expose internal provider details", async () => {
  const { relayerErrorResponse, RelayerValidationError } = await import("../apps/web/lib/relayer/errors.ts");

  assert.deepEqual(relayerErrorResponse(new RelayerValidationError("BadNonce", "Nonce mismatch")), {
    body: {
      status: "error",
      error: "BadNonce",
      details: "Nonce mismatch",
    },
    httpStatus: 400,
  });

  const response = relayerErrorResponse(new Error("RPC failed for https://provider.example/secret-token"));

  assert.equal(response.httpStatus, 500);
  assert.equal(response.body.status, "error");
  assert.equal(response.body.error, "RelayerError");
  assert.equal(response.body.details, "Internal relayer error");
  assert.doesNotMatch(response.body.details, /secret-token|provider\.example/);
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

test("relayer in-flight guard prevents duplicate broadcasts for the same agent nonce", async () => {
  const {
    ACQUIRED_PENDING_TTL_MS,
    BROADCAST_PENDING_TTL_MS,
    INTENT_SUBMISSION_TTL_MS,
    markIntentSubmissionSubmitted,
    releaseIntentSubmission,
    reserveIntentSubmission,
    resetIntentSubmissionCache,
  } = await import("../apps/web/lib/relayer/inflight.ts");
  resetIntentSubmissionCache();

  const first = await reserveIntentSubmission({ agentNode: AGENT_NODE, nonce: 0n, nowMs: 1_000 });
  assert.equal(first.status, "acquired");
  assert.deepEqual(await reserveIntentSubmission({ agentNode: AGENT_NODE, nonce: 0n, nowMs: 1_001 }), {
    status: "pending",
  });
  assert.equal(
    (await reserveIntentSubmission({ agentNode: AGENT_NODE, nonce: 0n, nowMs: 1_000 + ACQUIRED_PENDING_TTL_MS + 1 }))
      .status,
    "acquired",
  );
  resetIntentSubmissionCache();

  const acquiredBeforeBroadcast = await reserveIntentSubmission({ agentNode: AGENT_NODE, nonce: 0n, nowMs: 1_000 });
  assert.equal(acquiredBeforeBroadcast.status, "acquired");
  assert.deepEqual(
    await reserveIntentSubmission({ agentNode: AGENT_NODE, nonce: 0n, nowMs: 1_000 + INTENT_SUBMISSION_TTL_MS + 1 }),
    {
      status: "pending",
    },
  );

  assert.equal(first.status, "acquired");
  await first.markBroadcast(TX_HASH, 1_200);
  assert.deepEqual(await reserveIntentSubmission({ agentNode: AGENT_NODE, nonce: 0n, nowMs: 1_250 }), {
    status: "pending",
    txHash: TX_HASH,
  });
  const staleBroadcast = await reserveIntentSubmission({
    agentNode: AGENT_NODE,
    nonce: 0n,
    nowMs: 1_200 + BROADCAST_PENDING_TTL_MS + 1,
  });
  assert.equal(staleBroadcast.status, "acquired");

  resetIntentSubmissionCache();
  const pending = await reserveIntentSubmission({ agentNode: AGENT_NODE, nonce: 0n, nowMs: 1_000 });
  assert.equal(pending.status, "acquired");
  await pending.markBroadcast(TX_HASH, 1_100);
  await markIntentSubmissionSubmitted({ agentNode: AGENT_NODE, nonce: 0n, txHash: TX_HASH, nowMs: 1_200 });
  assert.deepEqual(await reserveIntentSubmission({ agentNode: AGENT_NODE, nonce: 0n, nowMs: 1_201 }), {
    status: "submitted",
    txHash: TX_HASH,
  });
  await releaseIntentSubmission({ agentNode: AGENT_NODE, nonce: 0n });
  assert.equal((await reserveIntentSubmission({ agentNode: AGENT_NODE, nonce: 0n, nowMs: 1_202 })).status, "acquired");

  resetIntentSubmissionCache();
  const firstAfterReset = await reserveIntentSubmission({ agentNode: AGENT_NODE, nonce: 0n, nowMs: 1_000 });
  assert.equal(firstAfterReset.status, "acquired");
  await firstAfterReset.markSubmitted(TX_HASH, 1_500);
  assert.deepEqual(await reserveIntentSubmission({ agentNode: AGENT_NODE, nonce: 0n, nowMs: 1_501 }), {
    status: "submitted",
    txHash: TX_HASH,
  });

  const afterTtl = await reserveIntentSubmission({
    agentNode: AGENT_NODE,
    nonce: 0n,
    nowMs: 1_500 + INTENT_SUBMISSION_TTL_MS + 1,
  });
  assert.equal(afterTtl.status, "acquired");
  resetIntentSubmissionCache();
});

test("relayer in-flight guard supports a shared Redis REST reservation store", async () => {
  const {
    createRedisRestIntentSubmissionStore,
    markIntentSubmissionSubmitted,
    releaseIntentSubmission,
    reserveIntentSubmission,
  } = await import("../apps/web/lib/relayer/inflight.ts");
  const commands = [];
  const values = new Map();
  const store = createRedisRestIntentSubmissionStore({
    fetch: async (_url, init) => {
      const command = JSON.parse(init.body);
      commands.push(command);
      const [name, key, value, ...options] = command;
      let result = null;

      if (name === "GET") {
        result = values.get(key) ?? null;
      }
      if (name === "SET") {
        const requiresMissing = options.includes("NX");
        const requiresExisting = options.includes("XX");
        if ((!requiresMissing || !values.has(key)) && (!requiresExisting || values.has(key))) {
          values.set(key, value);
          result = "OK";
        }
      }
      if (name === "DEL") {
        result = values.delete(key) ? 1 : 0;
      }

      return new Response(JSON.stringify({ result }), { status: 200 });
    },
    token: RESERVATION_STORE_TOKEN,
    url: RESERVATION_STORE_URL,
  });

  const first = await reserveIntentSubmission({ agentNode: AGENT_NODE, nonce: 7n, nowMs: 1_000, store });
  assert.equal(first.status, "acquired");
  assert.deepEqual(await reserveIntentSubmission({ agentNode: AGENT_NODE, nonce: 7n, nowMs: 1_001, store }), {
    status: "pending",
  });

  await first.markBroadcast(TX_HASH, 1_200);
  assert.deepEqual(await reserveIntentSubmission({ agentNode: AGENT_NODE, nonce: 7n, nowMs: 1_201, store }), {
    status: "pending",
    txHash: TX_HASH,
  });

  await markIntentSubmissionSubmitted({ agentNode: AGENT_NODE, nonce: 7n, nowMs: 1_300, store, txHash: TX_HASH });
  assert.deepEqual(await reserveIntentSubmission({ agentNode: AGENT_NODE, nonce: 7n, nowMs: 1_301, store }), {
    status: "submitted",
    txHash: TX_HASH,
  });

  await releaseIntentSubmission({ agentNode: AGENT_NODE, nonce: 7n, store });
  assert.equal((await reserveIntentSubmission({ agentNode: AGENT_NODE, nonce: 7n, nowMs: 1_302, store })).status, "acquired");
  assert.ok(commands.some((command) => command[0] === "SET" && command.includes("NX")));
  assert.ok(commands.some((command) => command[0] === "SET" && command.includes("PX")));
});

test("relayer receipt reconciliation surfaces store failures after known transaction outcomes", async () => {
  const { reconcileBroadcastReceipt } = await import("../apps/web/lib/relayer/reconcile.ts");
  const receiptClient = {
    getTransactionReceipt: async () => ({ status: "success" }),
  };
  const missingReceiptClient = {
    getTransactionReceipt: async () => {
      throw new Error("receipt not found");
    },
  };
  const failingStore = {
    markBroadcast: async () => {},
    markSubmitted: async () => {
      throw new Error("reservation store unavailable");
    },
    release: async () => {},
    reserve: async () => ({ status: "pending" }),
  };

  await assert.rejects(
    () => reconcileBroadcastReceipt(receiptClient, failingStore, { agentNode: AGENT_NODE, nonce: 0n, txHash: TX_HASH }),
    /reservation store unavailable/,
  );
  assert.equal(
    await reconcileBroadcastReceipt(missingReceiptClient, failingStore, { agentNode: AGENT_NODE, nonce: 0n, txHash: TX_HASH }),
    "pending",
  );
});

test("relayer route submits validated executor transactions from a thin API handler", async () => {
  await assertFile("apps/web/app/api/relayer/execute/route.ts");
  await assertFile("apps/web/lib/relayer/config.ts");
  await assertFile("apps/web/lib/relayer/contracts.ts");
  await assertFile("apps/web/lib/relayer/inflight.ts");
  await assertFile("apps/web/lib/relayer/reconcile.ts");
  await assertFile("apps/web/lib/relayer/validation.ts");

  const source = await readText("apps/web/app/api/relayer/execute/route.ts");
  const reconciliationSource = await readText("apps/web/lib/relayer/reconcile.ts");
  const validationSource = await readText("apps/web/lib/relayer/validation.ts");
  const txHashIndex = source.indexOf("let txHash");
  const innerTryIndex = source.indexOf("try {", txHashIndex);
  const accountIndex = source.indexOf("privateKeyToAccount", txHashIndex);
  assert.match(source, /export const runtime = "nodejs"/);
  assert.match(source, /createIntentSubmissionStore/);
  assert.match(source, /validateRelayerExecution/);
  assert.match(source, /reserveIntentSubmission/);
  assert.match(source, /markBroadcast/);
  assert.match(source, /reconcileBroadcastReceipt/);
  assert.match(reconciliationSource, /markIntentSubmissionSubmitted/);
  assert.match(reconciliationSource, /releaseIntentSubmission/);
  assert.match(reconciliationSource, /getTransactionReceipt/);
  assert.match(source, /getBlock/);
  assert.match(source, /timestamp/);
  assert.match(source, /writeContract/);
  assert.match(source, /waitForTransactionReceipt/);
  assert.ok(
    source.indexOf("reservation.markBroadcast") < source.indexOf("waitForTransactionReceipt"),
    "broadcast hashes should be stored before waiting for a receipt",
  );
  assert.ok(
    txHashIndex !== -1 && innerTryIndex !== -1 && innerTryIndex < accountIndex,
    "relayer wallet setup should be inside the reservation cleanup try block",
  );
  assert.ok(
    source.indexOf("waitForTransactionReceipt") < source.indexOf("reservation.markSubmitted"),
    "submitted cache entries should only be written after a successful receipt",
  );
  assert.doesNotMatch(source, /NEXT_PUBLIC_RELAYER_PRIVATE_KEY/);
  assert.doesNotMatch(validationSource, /Date\.now/);
});
