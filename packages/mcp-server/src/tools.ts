import { z } from "zod";

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/u, "must be a 0x-prefixed hex string");
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/u, "must be a 32-byte hex string");
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/u, "must be an EVM address");
const uintString = z.string().regex(/^[0-9]+$/u, "must be a non-negative integer string");
const ensName = z.string().min(3).describe("Lowercase ENS name, such as assistant.alice.eth.");

const taskSchema = z.object({
  description: z.string().min(1).describe("Natural-language task that will be hashed into the TaskLog proof."),
  ownerName: ensName.optional().describe("Optional owner ENS. Defaults to the immediate parent of agentName."),
  valueWei: uintString.optional().describe("Optional ETH value to send through the executor. Defaults to 0.")
});

const decisionSchema = z.enum(["approved", "blocked"]);
const trustThreshold = z.number().int().min(0).max(100).optional().describe("Minimum deterministic KeeperHub gate score. Defaults to 70.");
const reasonsSchema = z.array(z.string().min(1)).describe("Human-readable KeeperHub gate reasons.");

const intentSchema = z.object({
  agentNode: bytes32,
  policyDigest: bytes32,
  target: address,
  callDataHash: bytes32,
  value: uintString,
  nonce: uintString,
  expiresAt: uintString
});

const policySnapshotSchema = z.object({
  target: address,
  selector: z.string().regex(/^0x[0-9a-fA-F]{8}$/u, "must be a 4-byte selector"),
  maxValueWei: uintString,
  maxGasReimbursementWei: uintString,
  expiresAt: uintString,
  enabled: z.boolean()
});

const swapRequestSchema = {
  agentName: ensName,
  amount: uintString.describe("Exact input token amount in smallest units."),
  chainId: uintString.describe("Swap chain id. Must match ENS Uniswap policy."),
  slippageBps: uintString.describe("Requested slippage in basis points. Must be <= ENS policy limit."),
  tokenIn: address.describe("Input token address. Must be allowed by ENS policy."),
  tokenOut: address.describe("Output token address. Must be allowed by ENS policy."),
  type: z.string().optional().describe("Uniswap quote type. Defaults to EXACT_INPUT.")
};

export type AgentPassportToolName =
  | "resolve_agent_passport"
  | "list_owner_agents"
  | "get_agent_policy"
  | "check_task_against_policy"
  | "build_task_intent"
  | "submit_task"
  | "keeperhub_validate_agent_task"
  | "keeperhub_build_workflow_payload"
  | "keeperhub_emit_run_attestation"
  | "keeperhub_list_workflows"
  | "keeperhub_create_gate_workflow"
  | "keeperhub_execute_approved_workflow"
  | "keeperhub_get_execution_status"
  | "keeperhub_get_execution_logs"
  | "uniswap_check_approval"
  | "uniswap_quote"
  | "uniswap_validate_swap_against_ens_policy"
  | "uniswap_execute_swap"
  | "uniswap_record_swap_proof";

export type AgentPassportToolDefinition = {
  description: string;
  inputShape: Record<string, z.ZodTypeAny>;
  name: AgentPassportToolName;
};

/**
 * Tool definitions are intentionally data-only so tests, docs, and the MCP
 * server registration path all consume the same names, descriptions, and input
 * schemas. Each description is written for an autonomous agent deciding which
 * tool to call, not just for humans reading the source.
 */
export const AGENTPASSPORT_MCP_TOOLS: AgentPassportToolDefinition[] = [
  {
    name: "resolve_agent_passport",
    description:
      "Resolve one AgentPassport ENS name into the live agent node, resolver address, addr() signer, and AgentPassports text records. Use this before any task so the agent acts on current ENS identity and metadata instead of cached state.",
    inputShape: { agentName: ensName }
  },
  {
    name: "list_owner_agents",
    description:
      "Read the owner ENS index records agnetpassports_no and agentpasspports_agents, then resolve every listed full agent ENS name. Use this to discover all agents managed under one owner ENS name.",
    inputShape: { ownerName: ensName }
  },
  {
    name: "get_agent_policy",
    description:
      "Load the executable policy snapshot from live ENS text records for an agent. This verifies exact agent.status, reconstructs the policy snapshot, computes its policy digest, and compares it to the ENS policy digest.",
    inputShape: { agentName: ensName }
  },
  {
    name: "check_task_against_policy",
    description:
      "Preflight a requested task against the current ENS-published policy digest before building or signing. This is the mandatory safety gate: never sign if status is not exactly active or the policy digest does not match ENS.",
    inputShape: { agentName: ensName, task: taskSchema }
  },
  {
    name: "build_task_intent",
    description:
      "Build TaskLog.recordTask calldata, unsigned intent JSON, and typed-data signing metadata from live ENS policy, current executor nonce, task text, metadata URI, and TTL. This only prepares data; it does not sign, submit, or access an agent private key.",
    inputShape: {
      agentName: ensName,
      task: taskSchema,
      metadataURI: z.string().min(1).describe("URI stored in TaskLog metadataURI for the task proof."),
      ttlSeconds: z.number().int().positive().max(86_400).optional().describe("Intent lifetime in seconds. Defaults to 600.")
    }
  },
  {
    name: "submit_task",
    description:
      "Submit an externally signed intent, policy snapshot, calldata, and signature to the configured AgentPassports relayer. The relayer rechecks ENS policy and signer state before broadcasting AgentEnsExecutor.execute.",
    inputShape: { agentName: ensName, intent: intentSchema, policySnapshot: policySnapshotSchema, callData: hex, signature: hex }
  },
  {
    name: "keeperhub_validate_agent_task",
    description:
      "Validate whether a live ENS AgentPassport is allowed to enter a KeeperHub workflow. This is a pre-execution gate: it resolves ENS identity, checks exact active status, verifies policy digest compliance, evaluates task policy limits, and returns approved/blocked reasons without signing or calling KeeperHub.",
    inputShape: { agentName: ensName, task: taskSchema, trustThreshold }
  },
  {
    name: "keeperhub_build_workflow_payload",
    description:
      "Build a KeeperHub workflow payload only after the AgentPassports ENS gate approves the task. Returns unsigned AgentPassports intent data, policy facts, gate decision, and signing payload for external signing; it never receives private keys and never calls KeeperHub directly.",
    inputShape: { agentName: ensName, task: taskSchema, metadataURI: z.string().min(1), ttlSeconds: z.number().int().positive().max(86_400).optional(), trustThreshold }
  },
  {
    name: "keeperhub_emit_run_attestation",
    description:
      "Create a portable AgentPassports run attestation for a KeeperHub-approved or KeeperHub-blocked execution. The attestation records ENS agent name, policy digest, task hash, decision, reasons, blockers, optional KeeperHub run id, and optional tx hash for audit trails.",
    inputShape: {
      agentName: ensName,
      decision: decisionSchema,
      taskDescription: z.string().min(1),
      policyDigest: bytes32,
      txHash: bytes32.optional(),
      keeperhubRunId: z.string().optional(),
      reasons: reasonsSchema,
      blockers: z.array(z.string().min(1)).optional()
    }
  },
  {
    name: "keeperhub_list_workflows",
    description:
      "List workflows from the live KeeperHub API using the runtime KEEPERHUB_API_KEY. This helps agents find reusable KeeperHub workflows without exposing secrets, signing payloads, or bypassing ENS policy checks.",
    inputShape: {}
  },
  {
    name: "keeperhub_create_gate_workflow",
    description:
      "Create the verified AgentPassports V3 KeeperHub gate workflow using the live KeeperHub API. The workflow definition includes the required name, nodes, and edges shape, contains no secrets, and is intended to run only after ENS policy gating.",
    inputShape: {
      name: z.string().min(1).optional().describe("Optional KeeperHub workflow name. Defaults to a timestamped AgentPassports V3 name."),
      description: z.string().min(1).optional().describe("Optional public workflow description. Do not include secrets.")
    }
  },
  {
    name: "keeperhub_execute_approved_workflow",
    description:
      "Run the full live V3 KeeperHub path after AgentPassports ENS gating. It resolves ENS, validates policy, blocks without calling KeeperHub when disallowed, builds an unsigned workflow payload when approved, executes a configured KeeperHub workflow, reads status/logs, and returns a run attestation. It never signs or submits private keys.",
    inputShape: {
      agentName: ensName,
      task: taskSchema,
      metadataURI: z.string().min(1),
      workflowId: z.string().min(1).optional().describe("KeeperHub workflow id. Defaults to KEEPERHUB_WORKFLOW_ID."),
      ttlSeconds: z.number().int().positive().max(86_400).optional(),
      trustThreshold
    }
  },
  {
    name: "keeperhub_get_execution_status",
    description:
      "Fetch a live KeeperHub execution status by execution id. Use after keeperhub_execute_approved_workflow to verify whether KeeperHub completed the ENS-approved workflow. Requires runtime API key and never returns secrets.",
    inputShape: { executionId: z.string().min(1) }
  },
  {
    name: "keeperhub_get_execution_logs",
    description:
      "Fetch live KeeperHub execution logs by execution id and return safe JSON, including runId when present. Use this as audit evidence for AgentPassports ENS-gated run attestations. Requires runtime API key and never returns secrets.",
    inputShape: { executionId: z.string().min(1) }
  },
  {
    name: "uniswap_check_approval",
    description:
      "Call the Uniswap API approval check for an agent wallet after checking the token, amount, and chain against live ENS Uniswap policy. Never exposes the Uniswap API key to the browser or agent.",
    inputShape: {
      agentName: ensName,
      amount: uintString,
      chainId: uintString,
      token: address
    }
  },
  {
    name: "uniswap_validate_swap_against_ens_policy",
    description:
      "Validate a proposed Uniswap swap against the agent's live ENS Uniswap policy without calling Uniswap. Use before quote or execution to explain exactly which policy checks pass or fail.",
    inputShape: swapRequestSchema
  },
  {
    name: "uniswap_quote",
    description:
      "Request a Uniswap API quote for an agent only after live ENS policy allows chain, token pair, amount, and slippage. Returns the exact API payload, policy validation, and Uniswap response.",
    inputShape: swapRequestSchema
  },
  {
    name: "uniswap_execute_swap",
    description:
      "Execute a previously quoted Uniswap swap for an agent only after rechecking live ENS policy. Requires the quote object and optional Permit2 signature/data returned from the quote flow. Returns Uniswap swap calldata for executor submission.",
    inputShape: {
      ...swapRequestSchema,
      permit2Signature: hex.optional(),
      permitData: z.record(z.string(), z.unknown()).optional(),
      quote: z.record(z.string(), z.unknown())
    }
  },
  {
    name: "uniswap_record_swap_proof",
    description:
      "Build canonical swap proof metadata after a Uniswap API quote or swap so the agent can persist quote ID, transaction/order ID, token pair, amount, and ENS policy digest in TaskLog or external storage.",
    inputShape: {
      agentName: ensName,
      amount: uintString,
      chainId: uintString,
      policyDigest: bytes32,
      quoteId: z.string().optional(),
      requestId: z.string().optional(),
      routing: z.string().optional(),
      tokenIn: address,
      tokenOut: address,
      txHashOrOrderId: z.string().optional()
    }
  }
];
