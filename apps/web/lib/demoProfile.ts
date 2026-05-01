import {
  buildPolicyMetadata,
  hashPolicyMetadata,
  taskLogRecordTaskSelector,
  type Hex
} from "@agentpassport/config";
import { webEnv } from "./env";
import { buildAgentName, safeNamehash, splitAgentName } from "./ensPreview";
import { readConfiguredChainId } from "./publicChain";

export const DEFAULT_DEMO_OWNER_ENS = "";
export const DEFAULT_DEMO_AGENT_LABEL = "";

const DEFAULT_DEMO_POLICY_URI = "";
const DEFAULT_POLICY_EXPIRES_AT = 1_790_000_000n;
const DEFAULT_GAS_BUDGET_WEI = 10_000_000_000_000_000n;
const DEFAULT_MAX_GAS_REIMBURSEMENT_WEI = 200_000_000_000_000n;
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
  chainId: bigint;
  ensRegistryAddress: Hex | null;
  executorAddress: Hex | null;
  gasBudgetWei: bigint;
  maxGasReimbursementWei: bigint;
  maxValueWei: bigint;
  nameWrapperAddress: Hex | null;
  nextNonce: bigint | null;
  ownerName: string;
  ownerNode: Hex;
  policyEnabled: boolean | undefined;
  policyExpiresAt: bigint;
  policyHash: Hex | null;
  policyUri: string;
  resolverAddress: Hex | null;
  taskLogAddress: Hex | null;
  taskLogStartBlock: bigint | null;
  textRecords: readonly TextRecordPreview[];
};

export type SerializableAgentProfile = Omit<
  AgentProfilePreview,
  | "chainId"
  | "gasBudgetWei"
  | "maxGasReimbursementWei"
  | "maxValueWei"
  | "nextNonce"
  | "policyExpiresAt"
  | "taskLogStartBlock"
> & {
  chainId: string;
  gasBudgetWei: string;
  maxGasReimbursementWei: string;
  maxValueWei: string;
  nextNonce: string | null;
  policyExpiresAt: string;
  taskLogStartBlock: string | null;
};

/**
 * Builds shared chain and contract configuration plus optional route-derived agent identity.
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
  const chainId = BigInt(readConfiguredChainId(webEnv.chainId));
  const agentAddress = readAddressEnv(webEnv.demoAgentAddress);
  const ensRegistryAddress = readAddressEnv(webEnv.ensRegistry);
  const executorAddress = readAddressEnv(webEnv.executorAddress);
  const nameWrapperAddress = readAddressEnv(webEnv.nameWrapper);
  const resolverAddress = readAddressEnv(webEnv.publicResolver);
  const taskLogAddress = readAddressEnv(webEnv.taskLogAddress);
  const taskLogStartBlock = readBlockEnv(webEnv.taskLogStartBlock);
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
    chainId,
    ensRegistryAddress,
    executorAddress,
    gasBudgetWei: DEFAULT_GAS_BUDGET_WEI,
    maxGasReimbursementWei: DEFAULT_MAX_GAS_REIMBURSEMENT_WEI,
    maxValueWei: DEFAULT_MAX_VALUE_WEI,
    nameWrapperAddress,
    nextNonce: null,
    ownerName,
    ownerNode,
    policyEnabled: policyHash ? true : undefined,
    policyExpiresAt: DEFAULT_POLICY_EXPIRES_AT,
    policyHash,
    policyUri,
    resolverAddress,
    taskLogAddress,
    taskLogStartBlock,
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
 * Reads optional deployment block hints used to keep event scans inside provider limits.
 */
function readBlockEnv(value?: string): bigint | null {
  const normalized = readTextEnv(value);
  return normalized && /^\d+$/u.test(normalized) ? BigInt(normalized) : null;
}

/**
 * Converts bigint-heavy profile previews into props that can cross the server/client boundary.
 */
export function serializeAgentProfile(profile: AgentProfilePreview): SerializableAgentProfile {
  return {
    ...profile,
    chainId: profile.chainId.toString(),
    gasBudgetWei: profile.gasBudgetWei.toString(),
    maxGasReimbursementWei: profile.maxGasReimbursementWei.toString(),
    maxValueWei: profile.maxValueWei.toString(),
    nextNonce: profile.nextNonce?.toString() ?? null,
    policyExpiresAt: profile.policyExpiresAt.toString(),
    taskLogStartBlock: profile.taskLogStartBlock?.toString() ?? null
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
    { key: "agent_v", value: "1" },
    { key: "agent_owner", value: input.ownerName },
    { key: "agent_kind", value: "personal-assistant" },
    { key: "agent_capabilities", value: input.capabilities.join(",") },
    { key: "agent_policy_uri", value: input.policyUri },
    { key: "agent_policy_hash", value: input.policyHash ?? "Pending policy target" },
    { key: "agent_executor", value: input.executorAddress ?? "Pending executor" },
    { key: "agent_status", value: input.agentAddress ? "active" : "draft" },
    { key: "agent_description", value: `${input.ownerName} onchain assistant` }
  ];
}

/**
 * Treats blank env values as unset so user-controlled fields can start empty.
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
