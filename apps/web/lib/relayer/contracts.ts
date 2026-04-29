import { normalizePolicySnapshot, type Hex, type PolicySnapshot } from "../../../../packages/config/src/index.ts";

/**
 * Minimal AgentEnsExecutor ABI used for relayer reads and execution.
 */
export const AGENT_POLICY_EXECUTOR_ABI = [
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
          { name: "policyDigest", type: "bytes32" },
          { name: "target", type: "address" },
          { name: "callDataHash", type: "bytes32" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "expiresAt", type: "uint64" }
        ]
      },
      {
        name: "policy",
        type: "tuple",
        components: [
          { name: "target", type: "address" },
          { name: "selector", type: "bytes4" },
          { name: "maxValueWei", type: "uint96" },
          { name: "maxGasReimbursementWei", type: "uint96" },
          { name: "expiresAt", type: "uint64" },
          { name: "enabled", type: "bool" }
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
 * Minimal resolver ABI for reading ENS text records used as V1 policy source of truth.
 */
export const TEXT_RESOLVER_ABI = [
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" }
    ],
    outputs: [{ name: "value", type: "string" }]
  }
] as const;

export { normalizePolicySnapshot };
export type { PolicySnapshot };
