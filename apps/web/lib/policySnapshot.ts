import { encodeAbiParameters, keccak256, toBytes } from "viem";
import { taskLogRecordTaskSelector, type Hex } from "@agentpassport/config";

const POLICY_SNAPSHOT_TYPEHASH = keccak256(
  toBytes("PolicySnapshot(bytes32 agentNode,address target,bytes4 selector,uint96 maxValueWei,uint96 maxGasReimbursementWei,uint64 expiresAt,bool enabled)")
);

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
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "address" },
        { type: "bytes4" },
        { type: "uint96" },
        { type: "uint96" },
        { type: "uint64" },
        { type: "bool" }
      ],
      [
        POLICY_SNAPSHOT_TYPEHASH,
        input.agentNode,
        input.target,
        taskLogRecordTaskSelector(),
        input.maxValueWei,
        input.maxGasReimbursementWei,
        input.expiresAt,
        input.enabled ?? true
      ]
    )
  );
}
