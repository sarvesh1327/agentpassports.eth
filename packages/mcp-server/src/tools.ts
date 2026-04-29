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

export type AgentPassportToolName =
  | "resolve_agent_passport"
  | "list_owner_agents"
  | "get_agent_policy"
  | "check_task_against_policy"
  | "build_task_intent"
  | "submit_task";

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
      "Read the owner ENS index records agentpassports.v and agentpassports.agents, derive each label.ownerName agent ENS name, and resolve their current passports. Use this to discover all agents managed under one owner ENS name.",
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
  }
];
