import { hashPolicySnapshot, taskLogRecordTaskSelector, type Hex } from "@agentpassport/config";

export type PolicySnapshotDigestInput = {
  agentNode: Hex;
  enabled?: boolean;
  expiresAt: bigint;
  maxGasReimbursementWei: bigint;
  maxValueWei: bigint;
  target: Hex;
};

/**
 * Mirrors AgentEnsExecutor.hashPolicySnapshot for the digest published in ENS.
 */
export function hashTaskLogPolicySnapshot(input: PolicySnapshotDigestInput): Hex {
  return hashPolicySnapshot(input.agentNode, {
    enabled: input.enabled ?? true,
    expiresAt: input.expiresAt,
    maxGasReimbursementWei: input.maxGasReimbursementWei,
    maxValueWei: input.maxValueWei,
    selector: taskLogRecordTaskSelector(),
    target: input.target
  });
}
