import assert from "node:assert/strict";
import test from "node:test";

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
