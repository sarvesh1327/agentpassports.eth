import {
  buildPolicyMetadata,
  hashPolicyMetadata,
  taskLogRecordTaskSelector,
  type Hex
} from "@agentpassport/config";
import { webEnv } from "./env";
import { buildAgentName, safeNamehash, splitAgentName } from "./ensPreview";

export const DEFAULT_DEMO_OWNER_ENS = "agentpassports.eth";
export const DEFAULT_DEMO_AGENT_LABEL = "assistant";

const DEFAULT_DEMO_POLICY_URI = "ipfs://agentpassports-demo-policy";
const DEFAULT_POLICY_EXPIRES_AT = 1_790_000_000n;
const DEFAULT_GAS_BUDGET_WEI = 10_000_000_000_000_000n;
const DEFAULT_MAX_GAS_REIMBURSEMENT_WEI = 1_000_000_000_000_000n;
const DEFAULT_MAX_VALUE_WEI = 0n;
const AGENT_CAPABILITIES = ["task-log", "sponsored-execution"] as const;

export type TextRecordPreview = {
  key: string;
  value: string;
};

export type AgentProfilePreview = {
  agentAddress: Hex | null;
  agentLabel: string;
  agentName: string;
  agentNode: Hex;
  capabilities: readonly string[];
  ensRegistryAddress: Hex | null;
  executorAddress: Hex | null;
  gasBudgetWei: bigint;
  maxGasReimbursementWei: bigint;
  maxValueWei: bigint;
  nextNonce: bigint | null;
  ownerName: string;
  ownerNode: Hex;
  policyEnabled: boolean | undefined;
  policyExpiresAt: bigint;
  policyHash: Hex | null;
  policyUri: string;
  resolverAddress: Hex | null;
  taskLogAddress: Hex | null;
  textRecords: readonly TextRecordPreview[];
};

export type SerializableAgentProfile = Omit<
  AgentProfilePreview,
  "gasBudgetWei" | "maxGasReimbursementWei" | "maxValueWei" | "nextNonce" | "policyExpiresAt"
> & {
  gasBudgetWei: string;
  maxGasReimbursementWei: string;
  maxValueWei: string;
  nextNonce: string | null;
  policyExpiresAt: string;
};

/**
 * Builds the shared demo profile used by the home, register, and agent pages.
 */
export function buildDemoAgentProfile(input?: { agentName?: string }): AgentProfilePreview {
  const fallbackOwnerName = readTextEnv(webEnv.demoOwnerEns) ?? DEFAULT_DEMO_OWNER_ENS;
  const fallbackAgentLabel = readTextEnv(webEnv.demoAgentLabel) ?? DEFAULT_DEMO_AGENT_LABEL;
  const routeAgentName = readTextEnv(input?.agentName);
  const routeParts = routeAgentName ? splitAgentName(routeAgentName, fallbackOwnerName) : undefined;
  const ownerName = routeParts?.ownerName ?? fallbackOwnerName;
  const agentLabel = routeParts?.agentLabel || fallbackAgentLabel;
  const agentName = buildAgentName(agentLabel, ownerName);
  const ownerNode = safeNamehash(ownerName);
  const agentNode = safeNamehash(agentName);
  const agentAddress = readAddressEnv(webEnv.demoAgentAddress);
  const ensRegistryAddress = readAddressEnv(webEnv.ensRegistry);
  const executorAddress = readAddressEnv(webEnv.executorAddress);
  const resolverAddress = readAddressEnv(webEnv.publicResolver);
  const taskLogAddress = readAddressEnv(webEnv.taskLogAddress);
  const policyUri = readTextEnv(webEnv.demoPolicyUri) ?? DEFAULT_DEMO_POLICY_URI;
  const policyHash = taskLogAddress
    ? hashPolicyMetadata(
        buildPolicyMetadata({
          agentNode,
          expiresAt: DEFAULT_POLICY_EXPIRES_AT,
          maxGasReimbursementWei: DEFAULT_MAX_GAS_REIMBURSEMENT_WEI,
          maxValueWei: DEFAULT_MAX_VALUE_WEI,
          ownerNode,
          selector: taskLogRecordTaskSelector(),
          target: taskLogAddress
        })
      )
    : null;

  return {
    agentAddress,
    agentLabel,
    agentName,
    agentNode,
    capabilities: AGENT_CAPABILITIES,
    ensRegistryAddress,
    executorAddress,
    gasBudgetWei: DEFAULT_GAS_BUDGET_WEI,
    maxGasReimbursementWei: DEFAULT_MAX_GAS_REIMBURSEMENT_WEI,
    maxValueWei: DEFAULT_MAX_VALUE_WEI,
    nextNonce: null,
    ownerName,
    ownerNode,
    policyEnabled: policyHash ? true : undefined,
    policyExpiresAt: DEFAULT_POLICY_EXPIRES_AT,
    policyHash,
    policyUri,
    resolverAddress,
    taskLogAddress,
    textRecords: buildAgentTextRecords({
      agentAddress,
      capabilities: AGENT_CAPABILITIES,
      executorAddress,
      ownerName,
      policyHash,
      policyUri
    })
  };
}

/**
 * Converts bigint-heavy profile previews into props that can cross the server/client boundary.
 */
export function serializeAgentProfile(profile: AgentProfilePreview): SerializableAgentProfile {
  return {
    ...profile,
    gasBudgetWei: profile.gasBudgetWei.toString(),
    maxGasReimbursementWei: profile.maxGasReimbursementWei.toString(),
    maxValueWei: profile.maxValueWei.toString(),
    nextNonce: profile.nextNonce?.toString() ?? null,
    policyExpiresAt: profile.policyExpiresAt.toString()
  };
}

/**
 * Converts the profile preview into the ENS text records the register page prepares.
 */
function buildAgentTextRecords(input: {
  agentAddress: Hex | null;
  capabilities: readonly string[];
  executorAddress: Hex | null;
  ownerName: string;
  policyHash: Hex | null;
  policyUri: string;
}): readonly TextRecordPreview[] {
  return [
    { key: "agent.v", value: "1" },
    { key: "agent.owner", value: input.ownerName },
    { key: "agent.kind", value: "personal-assistant" },
    { key: "agent.capabilities", value: input.capabilities.join(",") },
    { key: "agent.policy.uri", value: input.policyUri },
    { key: "agent.policy.hash", value: input.policyHash ?? "Pending policy target" },
    { key: "agent.executor", value: input.executorAddress ?? "Pending executor" },
    { key: "agent.status", value: input.agentAddress ? "active" : "draft" },
    { key: "agent.description", value: `${input.ownerName} onchain assistant` }
  ];
}

/**
 * Treats blank env values as unset so demo defaults remain visible.
 */
function readTextEnv(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

/**
 * Accepts only complete EVM addresses from optional public env values.
 */
function readAddressEnv(value?: string): Hex | null {
  const normalized = readTextEnv(value);
  return normalized && /^0x[0-9a-fA-F]{40}$/u.test(normalized) ? (normalized as Hex) : null;
}
