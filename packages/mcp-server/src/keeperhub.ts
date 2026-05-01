import { keccak256, stringToHex, type Hex } from "viem";

export const KEEPERHUB_WORKFLOW_NAME = "AgentPassports Execute ENS-Verified Task";
export const RUN_ATTESTATION_SCHEMA = "agentpassport.keeperhubRunAttestation.v1";

const ZERO_BYTES32 = `0x${"0".repeat(64)}` as Hex;

export type KeeperHubDecision = "approved" | "blocked";

type KeeperHubPassportFacts = {
  agentAddress: Hex | null;
  agentName: string;
  agentNode: Hex;
  gasBudgetWei: string;
  resolverAddress: Hex | null;
  textRecords: Record<string, string>;
};

type KeeperHubPolicyFacts = {
  policyDigest: Hex;
  policySnapshot: Record<string, unknown>;
  status: string;
};

type KeeperHubTaskCheck = {
  allowed: boolean;
  selectorAllowed?: boolean;
  targetAllowed?: boolean;
  valueAllowed?: boolean;
};

export type KeeperHubGateDecision = {
  agentName: string;
  agentNode: Hex;
  allowed: boolean;
  blockers: string[];
  decision: KeeperHubDecision;
  gasBudgetWei: string;
  liveSigner: Hex | null;
  policyDigest: Hex;
  policySnapshot: Record<string, unknown>;
  reasons: string[];
  resolverAddress: Hex | null;
  score: number;
  threshold: number;
};

/**
 * Builds the deterministic AgentPassports decision that gates KeeperHub execution.
 *
 * Security boundary: this helper does not call KeeperHub, does not sign payloads,
 * and does not submit transactions. It only turns already-read ENS/passport facts
 * and policy preflight facts into a portable allow/block decision. Runtime handlers
 * must source these facts from live ENS reads immediately before producing a
 * KeeperHub workflow payload.
 */
export function buildKeeperHubGateDecision(input: {
  passport: KeeperHubPassportFacts;
  policy?: KeeperHubPolicyFacts;
  policyError?: Error;
  taskCheck?: KeeperHubTaskCheck;
  trustThreshold?: number;
}): KeeperHubGateDecision {
  const threshold = input.trustThreshold ?? 70;
  const blockers: string[] = [];
  const reasons: string[] = [];
  const taskCheck = input.taskCheck ?? { allowed: false };
  const fallbackPolicyDigest = readPolicyDigestFromPassport(input.passport);
  const policyDigest = input.policy?.policyDigest ?? fallbackPolicyDigest;
  const policySnapshot = input.policy?.policySnapshot ?? {};
  const ensStatus = input.passport.textRecords["agent_status"] ?? input.policy?.status ?? "";

  if (ensStatus === "active" && (!input.policy || input.policy.status === "active")) {
    reasons.push("ENS status is active");
  } else {
    blockers.push("agent_status must be exactly active");
  }

  if (input.passport.agentAddress) {
    reasons.push("live ENS addr() signer is present");
  } else {
    blockers.push("live ENS addr() signer is missing");
  }

  if (policyDigest !== ZERO_BYTES32) {
    reasons.push("policy digest verified against ENS records");
  } else {
    blockers.push("policy digest is missing");
  }

  if (input.policyError) {
    blockers.push(`policy preflight failed: ${input.policyError.message}`);
  }

  if (taskCheck.allowed) {
    reasons.push("task target, selector, and value are allowed by ENS policy");
  } else {
    blockers.push("task is outside ENS policy");
    if (taskCheck.selectorAllowed === false) blockers.push("selector is not allowed");
    if (taskCheck.targetAllowed === false) blockers.push("target is not allowed");
    if (taskCheck.valueAllowed === false) blockers.push("value exceeds policy");
  }

  const score = computeDeterministicScore({ blockers, passport: input.passport, taskCheck });
  if (score < threshold) {
    blockers.push("deterministic trust score is below threshold");
  } else {
    reasons.push("deterministic trust score meets threshold");
  }

  const allowed = blockers.length === 0;
  return {
    agentName: input.passport.agentName,
    agentNode: input.passport.agentNode,
    allowed,
    blockers,
    decision: allowed ? "approved" : "blocked",
    gasBudgetWei: input.passport.gasBudgetWei,
    liveSigner: input.passport.agentAddress,
    policyDigest,
    policySnapshot,
    reasons,
    resolverAddress: input.passport.resolverAddress,
    score,
    threshold
  };
}

/**
 * Packages a prebuilt unsigned AgentPassports intent into a KeeperHub workflow
 * payload. The output is intentionally unsigned: KeeperHub or an agent runtime can
 * execute only after an external signer signs the exact returned signingPayload.
 */
export function buildKeeperHubWorkflowPayload(input: {
  buildIntentResult: Record<string, any>;
  gateDecision: KeeperHubGateDecision;
  passport: KeeperHubPassportFacts;
}) {
  if (!input.gateDecision.allowed) {
    throw new Error(`KeeperHub workflow payload blocked: ${input.gateDecision.blockers.join("; ")}`);
  }

  return {
    gateDecision: input.gateDecision,
    workflowName: KEEPERHUB_WORKFLOW_NAME,
    workflowPayload: {
      executorAddress: input.buildIntentResult.executorAddress,
      agentName: input.passport.agentName,
      agentNode: input.passport.agentNode,
      policyDigest: input.gateDecision.policyDigest,
      policySnapshot: input.buildIntentResult.policySnapshot,
      callData: input.buildIntentResult.callData,
      unsignedIntent: input.buildIntentResult.intent,
      signingPayload: input.buildIntentResult.signingPayload,
      gateDecision: input.gateDecision
    }
  };
}

/**
 * Builds the offchain V3 run attestation JSON. This is display/storage metadata,
 * not an authorization primitive. Later iterations can pin this object to IPFS/0G
 * or reference it from TaskLog metadata, but V3 iteration 1 keeps it local and
 * deterministic for tests and KeeperHub workflow logs.
 */
export function buildRunAttestation(input: {
  agentName: string;
  agentNode?: Hex;
  blockedCode?: string;
  blockers?: readonly string[];
  createdAt?: string;
  decision: KeeperHubDecision;
  failedNodeId?: string;
  keeperhubExecutionId?: string;
  keeperhubRunId?: string;
  policyDigest: Hex;
  reasons: readonly string[];
  taskDescription: string;
  txHash?: Hex;
}) {
  return {
    schema: RUN_ATTESTATION_SCHEMA,
    agentName: input.agentName.trim().toLowerCase(),
    agentNode: input.agentNode,
    decision: input.decision,
    failedNodeId: input.failedNodeId,
    blockedCode: input.blockedCode,
    taskHash: keccak256(stringToHex(input.taskDescription)),
    policyDigest: input.policyDigest.toLowerCase() as Hex,
    txHash: input.txHash,
    keeperhubExecutionId: input.keeperhubExecutionId,
    keeperhubRunId: input.keeperhubRunId,
    reasons: [...input.reasons],
    blockers: [...(input.blockers ?? [])],
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

function readPolicyDigestFromPassport(passport: KeeperHubPassportFacts): Hex {
  const digest = passport.textRecords["agent_policy_digest"]?.trim().toLowerCase();
  return /^0x[0-9a-f]{64}$/u.test(digest ?? "") ? digest as Hex : ZERO_BYTES32;
}

function computeDeterministicScore(input: {
  blockers: readonly string[];
  passport: KeeperHubPassportFacts;
  taskCheck: KeeperHubTaskCheck;
}): number {
  if (input.blockers.length > 0) return 0;
  let score = 60;
  if (input.passport.agentAddress) score += 15;
  if (BigInt(input.passport.gasBudgetWei || "0") > 0n) score += 10;
  if (input.taskCheck.allowed) score += 15;
  return Math.min(score, 100);
}
