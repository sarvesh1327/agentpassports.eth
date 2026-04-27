import {
  buildPolicyMetadata,
  hashPolicyMetadata,
  namehashEnsName,
  type Hex
} from "@agentpassport/config";
import type { PolicyContractResult } from "./contracts";

const EMPTY_NODE = namehashEnsName("");

/**
 * Reconstructs the ENS-published policy metadata hash from the live executor policy tuple.
 */
export function hashPolicyContractResult(input: {
  agentNode: Hex;
  policy?: PolicyContractResult | null;
}): Hex | null {
  if (!input.policy) {
    return null;
  }

  const [
    ownerNode,
    ,
    target,
    selector,
    maxValueWei,
    maxGasReimbursementWei,
    expiresAt
  ] = input.policy;
  if (ownerNode.toLowerCase() === EMPTY_NODE) {
    return null;
  }

  return hashPolicyMetadata(
    buildPolicyMetadata({
      agentNode: input.agentNode,
      expiresAt,
      maxGasReimbursementWei,
      maxValueWei,
      ownerNode,
      selector,
      target
    })
  );
}
