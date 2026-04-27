import type { Hex } from "@agentpassport/config";
import {
  assertUint64,
  assertUint256,
  normalizeAddress,
  normalizeBytes32,
  normalizeSelector
} from "@agentpassport/config";
import type { RelayerPolicy } from "./types";

export type PolicyContractResult = readonly [Hex, Hex, Hex, Hex, bigint, bigint, bigint, boolean];

/**
 * Minimal AgentPolicyExecutor ABI used for relayer reads and execution.
 */
export const AGENT_POLICY_EXECUTOR_ABI = [
  {
    type: "function",
    name: "policies",
    stateMutability: "view",
    inputs: [{ name: "agentNode", type: "bytes32" }],
    outputs: [
      { name: "ownerNode", type: "bytes32" },
      { name: "ownerWallet", type: "address" },
      { name: "target", type: "address" },
      { name: "selector", type: "bytes4" },
      { name: "maxValueWei", type: "uint96" },
      { name: "maxGasReimbursementWei", type: "uint96" },
      { name: "expiresAt", type: "uint64" },
      { name: "enabled", type: "bool" }
    ]
  },
  {
    type: "function",
    name: "nextNonce",
    stateMutability: "view",
    inputs: [{ name: "agentNode", type: "bytes32" }],
    outputs: [{ name: "nonce", type: "uint256" }]
  },
  {
    type: "function",
    name: "gasBudgetWei",
    stateMutability: "view",
    inputs: [{ name: "agentNode", type: "bytes32" }],
    outputs: [{ name: "budget", type: "uint256" }]
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "intent",
        type: "tuple",
        components: [
          { name: "agentNode", type: "bytes32" },
          { name: "target", type: "address" },
          { name: "callDataHash", type: "bytes32" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "expiresAt", type: "uint64" }
        ]
      },
      { name: "callData", type: "bytes" },
      { name: "signature", type: "bytes" }
    ],
    outputs: [{ name: "result", type: "bytes" }]
  }
] as const;

/**
 * Minimal ENS registry ABI used to find the current resolver for an agent node.
 */
export const ENS_REGISTRY_ABI = [
  {
    type: "function",
    name: "resolver",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "resolver", type: "address" }]
  }
] as const;

/**
 * Minimal resolver ABI for reading the standard EVM address record.
 */
export const ADDR_RESOLVER_ABI = [
  {
    type: "function",
    name: "addr",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "addr", type: "address" }]
  }
] as const;

/**
 * Converts the executor policy getter result into the relayer validation shape.
 */
export function policyFromContractResult(result: PolicyContractResult): RelayerPolicy {
  const [
    ownerNode,
    ownerWallet,
    target,
    selector,
    maxValueWei,
    maxGasReimbursementWei,
    expiresAt,
    enabled
  ] = result;

  return {
    ownerNode: normalizeBytes32(ownerNode),
    ownerWallet: normalizeAddress(ownerWallet, "preserve"),
    target: normalizeAddress(target, "preserve"),
    selector: normalizeSelector(selector),
    maxValueWei: assertUint256(maxValueWei),
    maxGasReimbursementWei: assertUint256(maxGasReimbursementWei),
    expiresAt: assertUint64(expiresAt),
    enabled
  };
}
