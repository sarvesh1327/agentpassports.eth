import { ZERO_ADDRESS, type Hex } from "@agentpassport/config";

export { ZERO_ADDRESS } from "@agentpassport/config";

export const AGENT_TEXT_RECORD_KEYS = [
  "agent.v",
  "agent.owner",
  "agent.kind",
  "agent.capabilities",
  "agent.policy.uri",
  "agent.policy.schema",
  "agent.policy.digest",
  "agent.policy.target",
  "agent.policy.selector",
  "agent.policy.maxValueWei",
  "agent.policy.maxGasReimbursementWei",
  "agent.policy.expiresAt",
  "agent.policy.hash",
  "agent.policy.uniswap.chainId",
  "agent.policy.uniswap.allowedTokenIn",
  "agent.policy.uniswap.allowedTokenOut",
  "agent.policy.uniswap.maxInputAmount",
  "agent.policy.uniswap.maxSlippageBps",
  "agent.policy.uniswap.deadlineSeconds",
  "agent.policy.uniswap.enabled",
  "agent.policy.uniswap.recipient",
  "agent.policy.uniswap.router",
  "agent.policy.uniswap.selector",
  "agent.executor",
  "agent.status",
  "agent.description"
] as const;

/**
 * ENS registry calls needed for live resolver and owner-manager checks.
 */
export const ENS_REGISTRY_ABI = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "owner", type: "address" }]
  },
  {
    type: "function",
    name: "resolver",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "resolver", type: "address" }]
  },
  {
    type: "function",
    name: "setSubnodeRecord",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "label", type: "bytes32" },
      { name: "owner", type: "address" },
      { name: "resolver", type: "address" },
      { name: "ttl", type: "uint64" }
    ],
    outputs: []
  }
] as const;

/**
 * ENS NameWrapper read used to resolve the current manager for wrapped names.
 */
export const NAME_WRAPPER_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }]
  },
  {
    type: "function",
    name: "setSubnodeRecord",
    stateMutability: "nonpayable",
    inputs: [
      { name: "parentNode", type: "bytes32" },
      { name: "label", type: "string" },
      { name: "owner", type: "address" },
      { name: "resolver", type: "address" },
      { name: "ttl", type: "uint64" },
      { name: "fuses", type: "uint32" },
      { name: "expiry", type: "uint64" }
    ],
    outputs: []
  }
] as const;

/**
 * Public resolver reads and writes used by registration and profile pages.
 */
export const PUBLIC_RESOLVER_ABI = [
  {
    type: "function",
    name: "addr",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "addr", type: "address" }]
  },
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" }
    ],
    outputs: [{ name: "value", type: "string" }]
  },
  {
    type: "function",
    name: "setAddr",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "addr", type: "address" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "setText",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "multicall",
    stateMutability: "nonpayable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }]
  }
] as const;

/**
 * Executor reads and writes needed for policy creation, funding, and profile display.
 */
export const AGENT_ENS_EXECUTOR_ABI = [
  {
    type: "function",
    name: "gasBudgetWei",
    stateMutability: "view",
    inputs: [{ name: "agentNode", type: "bytes32" }],
    outputs: [{ name: "budget", type: "uint256" }]
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
    name: "depositGasBudget",
    stateMutability: "payable",
    inputs: [{ name: "agentNode", type: "bytes32" }],
    outputs: []
  },
  {
    type: "function",
    name: "withdrawGasBudget",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentNode", type: "bytes32" },
      { name: "amount", type: "uint256" }
    ],
    outputs: []
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
 * TaskLog event/read surface used to display historical agent proofs.
 */
export const TASK_LOG_ABI = [
  {
    type: "event",
    name: "TaskRecorded",
    inputs: [
      { indexed: true, name: "taskId", type: "uint256" },
      { indexed: true, name: "agentNode", type: "bytes32" },
      { indexed: true, name: "ownerNode", type: "bytes32" },
      { indexed: false, name: "taskHash", type: "bytes32" },
      { indexed: false, name: "metadataURI", type: "string" },
      { indexed: false, name: "timestamp", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "recordTask",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentNode", type: "bytes32" },
      { name: "ownerNode", type: "bytes32" },
      { name: "taskHash", type: "bytes32" },
      { name: "metadataURI", type: "string" }
    ],
    outputs: [{ name: "taskId", type: "uint256" }]
  },
  {
    type: "function",
    name: "taskCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "count", type: "uint256" }]
  }
] as const;

export const TASK_RECORDED_EVENT = TASK_LOG_ABI[0];

/**
 * Removes the zero address sentinel returned by unset ENS and executor reads.
 */
export function nonZeroAddress(value?: Hex | null): Hex | null {
  return value && value.toLowerCase() !== ZERO_ADDRESS ? value : null;
}
