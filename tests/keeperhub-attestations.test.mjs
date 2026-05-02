import assert from "node:assert/strict";
import test from "node:test";

const AGENT_NODE = `0x${"11".repeat(32)}`;
const POLICY_DIGEST = `0x${"22".repeat(32)}`;
const TX_HASH = `0x${"33".repeat(32)}`;
const UNI = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";
const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";

function successExecution(overrides = {}) {
  return {
    id: "exec_success",
    workflowId: "workflow_1",
    status: "success",
    input: {
      agentName: "assistant.sarvesh.eth",
      agentNode: AGENT_NODE,
      amount: "100000000000",
      metadataURI: "keeperhub://uni-weth-owner-funded-smoke",
      policyDigest: POLICY_DIGEST,
      recipient: "0xc828e4a8a0e821d26416b56cb492b92d618abe0e",
      requestedSelector: "0x04e45aaf",
      requestedTarget: "0x3bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e",
      taskDescription: "AgentPassports UNI -> WETH owner-wallet smoke",
      tokenIn: UNI,
      tokenOut: WETH,
      signature: `0x${"aa".repeat(65)}`,
      functionArgs: "serialized secret-bearing args",
      callData: `0x${"bb".repeat(256)}`
    },
    output: {
      effectiveGasPrice: "100000045",
      gasUsedUnits: "232736",
      success: true,
      transactionHash: TX_HASH
    },
    startedAt: "2026-05-02T10:01:00.000Z",
    completedAt: "2026-05-02T10:02:00.000Z",
    duration: "60000",
    lastSuccessfulNodeId: "agentens_execute",
    lastSuccessfulNodeName: "AgentEnsExecutor.executeOwnerFundedERC20",
    executionTrace: ["agentpassports_gate_trigger", "check_uniswap_execution_window", "agentens_execute"],
    ...overrides
  };
}

test("KeeperHub execution normalizer exposes successful swap attestations without secret-bearing payloads", async () => {
  const { normalizeKeeperHubExecution } = await import("../apps/web/lib/keeperhubAttestations.ts");

  const attestation = normalizeKeeperHubExecution(successExecution());

  assert.deepEqual(attestation, {
    amount: "100000000000",
    agentName: "assistant.sarvesh.eth",
    agentNode: AGENT_NODE,
    blockedCode: null,
    completedAt: "2026-05-02T10:02:00.000Z",
    decision: "executed",
    durationMs: "60000",
    executionId: "exec_success",
    failedNodeId: null,
    failureReason: null,
    gasUsedUnits: "232736",
    lastSuccessfulNodeId: "agentens_execute",
    lastSuccessfulNodeName: "AgentEnsExecutor.executeOwnerFundedERC20",
    metadataURI: "keeperhub://uni-weth-owner-funded-smoke",
    policyDigest: POLICY_DIGEST,
    recipient: "0xc828e4a8a0e821d26416b56cb492b92d618abe0e",
    requestedSelector: "0x04e45aaf",
    requestedTarget: "0x3bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e",
    stampReason: null,
    startedAt: "2026-05-02T10:01:00.000Z",
    status: "success",
    taskDescription: "AgentPassports UNI -> WETH owner-wallet smoke",
    tokenIn: UNI,
    tokenOut: WETH,
    trace: ["agentpassports_gate_trigger", "check_uniswap_execution_window", "agentens_execute"],
    txHash: TX_HASH,
    workflowId: "workflow_1"
  });
  const serialized = JSON.stringify(attestation);
  assert.doesNotMatch(serialized, /signature|functionArgs|callData|serialized secret-bearing args|aaaa/);
});

test("KeeperHub execution normalizer surfaces blocked stamps and failed gate ids", async () => {
  const { normalizeKeeperHubExecution } = await import("../apps/web/lib/keeperhubAttestations.ts");

  const attestation = normalizeKeeperHubExecution(successExecution({
    id: "exec_blocked",
    output: {
      success: true,
      result: {
        schema: "agentpassport.blockedStamp.v1",
        decision: "blocked",
        blockedCode: "UNISWAP_TOKEN_IN_BLOCKED",
        failedNodeId: "check_uniswap_token_in_allowed",
        reason: "Token-in is outside the Swapper Visa allow-list."
      }
    },
    lastSuccessfulNodeId: "stamp_blocked_uniswap_token_in",
    lastSuccessfulNodeName: "Stamp blocked: UNISWAP_TOKEN_IN_BLOCKED",
    executionTrace: ["check_uniswap_route", "check_uniswap_token_in_allowed", "stamp_blocked_uniswap_token_in"]
  }));

  assert.equal(attestation.decision, "blocked");
  assert.equal(attestation.blockedCode, "UNISWAP_TOKEN_IN_BLOCKED");
  assert.equal(attestation.failedNodeId, "check_uniswap_token_in_allowed");
  assert.equal(attestation.stampReason, "Token-in is outside the Swapper Visa allow-list.");
  assert.equal(attestation.txHash, null);
});

test("KeeperHub execution normalizer identifies failed execution nodes and redacts long revert payloads", async () => {
  const { normalizeKeeperHubExecution } = await import("../apps/web/lib/keeperhubAttestations.ts");
  const longHex = `0x${"ab".repeat(180)}`;

  const attestation = normalizeKeeperHubExecution(successExecution({
    id: "exec_failed",
    status: "error",
    output: {},
    error: `Contract call failed: execution reverted (data=${longHex})`,
    lastSuccessfulNodeId: "check_uniswap_execution_window",
    lastSuccessfulNodeName: "Condition: slippage/deadline inside Visa",
    executionTrace: ["check_uniswap_execution_window", "agentens_execute"]
  }));

  assert.equal(attestation.decision, "failed");
  assert.equal(attestation.failedNodeId, "agentens_execute");
  assert.match(attestation.failureReason, /execution reverted/);
  assert.doesNotMatch(attestation.failureReason, new RegExp(longHex));
  assert.match(attestation.failureReason, /\[hex-redacted/);
});

test("KeeperHub attestation response filtering keeps only the requested agent and newest first", async () => {
  const { normalizeKeeperHubExecutionsResponse } = await import("../apps/web/lib/keeperhubAttestations.ts");
  const older = successExecution({ id: "older", startedAt: "2026-05-02T09:00:00.000Z" });
  const newer = successExecution({ id: "newer", startedAt: "2026-05-02T11:00:00.000Z" });
  const other = successExecution({ id: "other", input: { ...successExecution().input, agentName: "other.sarvesh.eth", agentNode: `0x${"99".repeat(32)}` } });

  const rows = normalizeKeeperHubExecutionsResponse([older, other, newer], {
    agentName: "assistant.sarvesh.eth",
    agentNode: AGENT_NODE,
    limit: 10
  });

  assert.deepEqual(rows.map((row) => row.executionId), ["newer", "older"]);
});
