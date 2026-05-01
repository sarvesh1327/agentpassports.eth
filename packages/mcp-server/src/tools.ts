import { z } from "zod";

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/u, "must be a 0x-prefixed hex string");
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/u, "must be a 32-byte hex string");
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/u, "must be an EVM address");
const uintString = z.string().regex(/^[0-9]+$/u, "must be a non-negative integer string");
const ensName = z.string().min(3).describe("ENS name, such as assistant.alice.eth.");

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

export type AgentPassportToolName = "build_task_intent" | "submit_task" | "check_task_status";

export type AgentPassportToolDefinition = {
  description: string;
  inputShape: Record<string, z.ZodTypeAny>;
  name: AgentPassportToolName;
};

/**
 * Thin AgentPassports MCP surface.
 *
 * KeeperHub is now the policy/Passport/Visa authority. The MCP server only
 * prepares an unsigned intent and submits an externally signed intent to
 * KeeperHub. Keypair creation and signing stay in the skill scripts outside MCP.
 */
export const AGENTPASSPORT_MCP_TOOLS: AgentPassportToolDefinition[] = [
  {
    name: "build_task_intent",
    description:
      "Build TaskLog.recordTask calldata, unsigned intent JSON, and EIP-712 typed data from explicit caller-provided task and policy snapshot inputs. This tool does not resolve ENS, read policy text records, check active status, verify policy authorization, sign, or submit; KeeperHub performs Passport/Visa validation after submission.",
    inputShape: {
      agentName: ensName,
      task: taskSchema,
      metadataURI: z.string().min(1).describe("URI stored in TaskLog metadataURI for the task proof."),
      policySnapshot: policySnapshotSchema.describe("Policy snapshot to include with the KeeperHub submission. MCP hashes it into the intent but does not verify it against ENS."),
      nonce: uintString.optional().describe("Optional executor nonce. If omitted, MCP reads AgentEnsExecutor.nextNonce(agentNode); this is not a policy check."),
      expiresAt: uintString.optional().describe("Optional absolute Unix expiry timestamp. If omitted, latest block time + ttlSeconds is used."),
      ttlSeconds: z.number().int().positive().max(86_400).optional().describe("Intent lifetime in seconds when expiresAt is omitted. Defaults to 600.")
    }
  },
  {
    name: "submit_task",
    description:
      "Submit an externally signed AgentPassports intent payload to the configured KeeperHub workflow using { input: payload }. This tool does not resolve ENS, check policy, block disallowed tasks locally, or use a relayer; it returns the KeeperHub execution handle by default, while final status can be fetched with check_task_status.",
    inputShape: {
      agentName: ensName,
      intent: intentSchema,
      policySnapshot: policySnapshotSchema,
      callData: hex,
      signature: hex,
      workflowId: z.string().min(1).optional().describe("KeeperHub workflow id. Defaults to KEEPERHUB_WORKFLOW_ID."),
      metadataURI: z.string().min(1).optional().describe("Optional metadata URI for KeeperHub audit payload."),
      taskDescription: z.string().min(1).optional().describe("Optional task description for KeeperHub audit payload."),
      waitForResult: z.boolean().optional().describe("Fetch KeeperHub status/logs after starting execution. Defaults to false; prefer check_task_status for final status."),
      pollAttempts: z.number().int().positive().max(120).optional().describe("Maximum status polls when waitForResult is true. Defaults to 45."),
      pollIntervalMs: z.number().int().positive().max(30_000).optional().describe("Delay between polls when waitForResult is true. Defaults to 5000 after startup.")
    }
  },
  {
    name: "check_task_status",
    description:
      "Fetch final or current KeeperHub status/logs for a previously submitted AgentPassports execution id. This tool only reads KeeperHub execution state and tx hashes; it does not resolve ENS, check policy, validate Passport/Visa, or submit work.",
    inputShape: {
      executionId: z.string().min(1).describe("KeeperHub execution id returned by submit_task."),
      includeLogs: z.boolean().optional().describe("Fetch KeeperHub execution logs as well as status. Defaults to true.")
    }
  }
];
