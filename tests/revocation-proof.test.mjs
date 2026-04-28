import assert from "node:assert/strict";
import test from "node:test";

const OWNER_WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const REGISTRY_OWNER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const RESOLVER_ADDRESS = "0xcccccccccccccccccccccccccccccccccccccccc";

test("revocation proof helper accepts only revocation-related relayer errors", async () => {
  const { revocationFailureProof } = await import("../apps/web/lib/revocationProof.ts");

  assert.equal(
    revocationFailureProof({ details: "Policy is disabled", error: "PolicyDisabled", status: "error" }),
    "Policy is disabled",
  );
  assert.equal(
    revocationFailureProof({ details: "Recovered signer changed", error: "BadSignature", status: "error" }),
    "Recovered signer changed",
  );
  assert.equal(
    revocationFailureProof({ details: "ENS addr removed", error: "AgentAddressNotSet", status: "error" }),
    "ENS addr removed",
  );
  assert.equal(
    revocationFailureProof({ details: "ENS resolver removed", error: "ResolverNotSet", status: "error" }),
    "ENS resolver removed",
  );
});

test("revocation proof helper rejects unrelated relayer errors", async () => {
  const { revocationFailureProof } = await import("../apps/web/lib/revocationProof.ts");

  assert.equal(revocationFailureProof({ details: "Consumed nonce", error: "BadNonce", status: "error" }), null);
  assert.equal(revocationFailureProof({ details: "Malformed payload", error: "InvalidRequest", status: "error" }), null);
  assert.equal(revocationFailureProof({ details: "Internal relayer error", error: "RelayerError", status: "error" }), null);
  assert.equal(revocationFailureProof({ status: "submitted", txHash: `0x${"11".repeat(32)}` }), null);
});

test("ENS status writes require the connected wallet to own the live registry node", async () => {
  const { buildEnsStatusWriteState } = await import("../apps/web/lib/revokeAgent.ts");

  assert.deepEqual(
    buildEnsStatusWriteState({
      connectedWallet: OWNER_WALLET,
      registryOwner: REGISTRY_OWNER,
      resolverAddress: RESOLVER_ADDRESS,
      resolverLookupSettled: true
    }),
    {
      blocker: "Connected wallet cannot write ENS text records for this agent node",
      canWrite: false
    }
  );

  assert.deepEqual(
    buildEnsStatusWriteState({
      connectedWallet: OWNER_WALLET,
      registryOwner: OWNER_WALLET,
      resolverAddress: RESOLVER_ADDRESS,
      resolverLookupSettled: true
    }),
    {
      blocker: null,
      canWrite: true
    }
  );
});

test("revocation action is complete when policy and ENS status are both disabled", async () => {
  const { buildRevocationActionState } = await import("../apps/web/lib/revokeAgent.ts");

  assert.deepEqual(
    buildRevocationActionState({
      canWriteEnsStatus: true,
      policyEnabled: false,
      statusText: "disabled"
    }),
    {
      blocker: "Agent is already disabled",
      canRevoke: false,
      isComplete: true,
      shouldWriteEnsStatus: false
    }
  );
});

test("revocation action requires policy and ENS status to move together", async () => {
  const { buildRevocationActionState } = await import("../apps/web/lib/revokeAgent.ts");

  assert.deepEqual(
    buildRevocationActionState({
      canWriteEnsStatus: true,
      policyEnabled: true,
      statusText: "active"
    }),
    {
      blocker: null,
      canRevoke: true,
      isComplete: false,
      shouldWriteEnsStatus: true
    }
  );

  assert.deepEqual(
    buildRevocationActionState({
      canWriteEnsStatus: false,
      ensStatusBlocker: "Connected wallet cannot write ENS text records for this agent node",
      policyEnabled: true,
      statusText: "disabled"
    }),
    {
      blocker: null,
      canRevoke: true,
      isComplete: false,
      shouldWriteEnsStatus: false
    }
  );

  assert.deepEqual(
    buildRevocationActionState({
      canWriteEnsStatus: false,
      ensStatusBlocker: "Connected wallet cannot write ENS text records for this agent node",
      policyEnabled: true,
      statusText: "active"
    }),
    {
      blocker: "Connected wallet cannot write ENS text records for this agent node",
      canRevoke: false,
      isComplete: false,
      shouldWriteEnsStatus: true
    }
  );
});
