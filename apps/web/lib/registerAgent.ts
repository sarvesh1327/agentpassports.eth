import {
  buildPolicyMetadata,
  buildSwapPolicyMetadata,
  computeSubnode,
  hashPolicyMetadata,
  hashPolicySnapshot,
  taskLogRecordTaskSelector,
  type Hex,
  type SwapPolicy
} from "@agentpassport/config";
import { normalizeAddressInput } from "./addressInput.ts";
import { LEGACY_AGENT_TEXT_RECORD_KEYS } from "./contracts.ts";
import { buildAgentName, safeNamehash, safeSubnode } from "./ensPreview.ts";

export type RegisterPreviewInput = {
  agentAddress: string;
  agentKind?: AgentKind;
  agentLabel: string;
  executorAddress?: Hex | null;
  gasBudgetWei: string;
  maxGasReimbursementWei: string;
  maxValueWei: string;
  ownerName: string;
  policyExpiresAt: string;
  policyUri: string;
  swapPolicy?: SwapPolicyInput | null;
  taskLogAddress?: Hex | null;
};

export type AgentKind = "personal-assistant" | "swapper" | "researcher" | "keeper";

export type SwapPolicyFormValues = {
  allowedChainId: string;
  allowedTokensIn: string;
  allowedTokensOut: string;
  deadlineSeconds: string;
  maxAmountInWei: string;
  maxSlippageBps: string;
  recipient: string;
  router: string;
  selector: string;
};

const SEPOLIA_UNISWAP_ALLOWED_TOKEN_PAIR = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984,0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as const;
const SEPOLIA_SWAP_ROUTER_02 = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as const;
const SWAP_ROUTER_02_EXACT_INPUT_SINGLE_SELECTOR = "0x04e45aaf" as const;

/**
 * Returns the demo-ready Sepolia Uniswap defaults for the Swapper registration form.
 */
export function buildDefaultSwapPolicyFormValues(ownerAddress?: Hex | null): SwapPolicyFormValues {
  return {
    allowedChainId: "11155111",
    allowedTokensIn: SEPOLIA_UNISWAP_ALLOWED_TOKEN_PAIR,
    allowedTokensOut: SEPOLIA_UNISWAP_ALLOWED_TOKEN_PAIR,
    deadlineSeconds: "60",
    maxAmountInWei: "10000000000000000",
    maxSlippageBps: "50",
    recipient: ownerAddress ?? "",
    router: SEPOLIA_SWAP_ROUTER_02,
    selector: SWAP_ROUTER_02_EXACT_INPUT_SINGLE_SELECTOR
  };
}

export type SwapPolicyInput = {
  allowedChainId: bigint | string;
  allowedTokensIn: readonly Hex[];
  allowedTokensOut: readonly Hex[];
  deadlineSeconds: bigint | string;
  enabled: boolean;
  maxAmountInWei: bigint | string;
  maxSlippageBps: bigint | string;
  recipient: Hex;
  router: Hex;
  selector: Hex;
};

export type RegisterPreview = {
  agentName: string;
  agentNode: Hex;
  gasBudgetWei: string;
  ownerNode: Hex;
  policyDigest: Hex | null;
  policyHash: Hex | null;
  textRecords: readonly { key: string; value: string }[];
};

export type OwnerEnsStatusInput = {
  connectedWallet?: Hex | null;
  effectiveOwnerManager?: Hex | null;
  isOwnerManagerSettled: boolean;
  isOwnerResolutionSettled: boolean;
  isReverseEnsSettled: boolean;
  normalizedOwnerName: string;
  ownerResolvedAddress?: Hex | null;
  reverseEnsName?: string | null;
};

export type OwnerEnsAutofillInput = {
  currentOwnerName: string;
  hasUserEditedOwnerName: boolean;
  reverseEnsName?: string | null;
};

export type EffectiveOwnerManagerInput = {
  nameWrapperAddress?: Hex | null;
  registryOwner?: Hex | null;
  wrapperOwner?: Hex | null;
};

export type OwnerEnsStatus = {
  blocker: string | null;
  canSubmit: boolean;
  guidance: string;
};

export type RegistrationDraftStatusInput = {
  agentLabel: string;
  executorAddress?: Hex | null;
  gasBudgetWei: string;
  hasPreparedTextRecords: boolean;
  maxGasReimbursementWei?: string;
  maxValueWei?: string;
  normalizedAgentAddress?: Hex | null;
  publicResolverAddress?: Hex | null;
  resolverAddress?: Hex | null;
  resolverLookupSettled: boolean;
  shouldCreateSubnameRecord: boolean;
  subnameOwnerLookupSettled: boolean;
  taskLogAddress?: Hex | null;
};

export type RegistrationDraftStatus = {
  blocker: string | null;
  canSubmit: boolean;
};

/**
 * Derives the ENS node, policy hash, and text records from the current registration form values.
 */
export function buildRegisterPreview(input: RegisterPreviewInput): RegisterPreview {
  const normalizedAgentLabel = input.agentLabel.trim().toLowerCase();
  const normalizedOwnerName = input.ownerName.trim().toLowerCase();
  const normalizedAgentAddress = normalizeAddressInput(input.agentAddress);
  const hasCompleteEnsInput = Boolean(normalizedAgentLabel && normalizedOwnerName);
  const agentName = hasCompleteEnsInput ? buildAgentName(normalizedAgentLabel, normalizedOwnerName) : "";
  const ownerNode = safeNamehash(normalizedOwnerName);
  const agentNode = normalizedAgentLabel ? safeSubnode(ownerNode, normalizedAgentLabel) : safeNamehash(agentName);
  const policyHash = buildPreviewPolicyHash({
    agentKind: input.agentKind ?? "personal-assistant",
    agentNode,
    expiresAt: input.policyExpiresAt,
    hasCompleteEnsInput,
    maxGasReimbursementWei: input.maxGasReimbursementWei,
    maxValueWei: input.maxValueWei,
    ownerNode,
    swapPolicy: input.swapPolicy,
    taskLogAddress: input.taskLogAddress
  });
  const policyDigest = buildPreviewPolicyDigest({
    agentKind: input.agentKind ?? "personal-assistant",
    agentNode,
    expiresAt: input.policyExpiresAt,
    hasCompleteEnsInput,
    maxGasReimbursementWei: input.maxGasReimbursementWei,
    maxValueWei: input.maxValueWei,
    swapPolicy: input.swapPolicy,
    taskLogAddress: input.taskLogAddress
  });

  return {
    agentName,
    agentNode,
    gasBudgetWei: safeBigInt(input.gasBudgetWei).toString(),
    ownerNode,
    policyDigest,
    policyHash,
    textRecords: buildAgentTextRecords({
      executorAddress: input.executorAddress,
      agentKind: input.agentKind ?? "personal-assistant",
      hasCompleteEnsInput,
      normalizedAgentAddress,
      normalizedOwnerName,
      policyDigest,
      policyHash,
      policyExpiresAt: input.policyExpiresAt,
      maxGasReimbursementWei: input.maxGasReimbursementWei,
      maxValueWei: input.maxValueWei,
      policyUri: input.policyUri,
      swapPolicy: input.swapPolicy,
      taskLogAddress: input.taskLogAddress
    })
  };
}

/**
 * Validates that the submitted label can produce the same subnode previewed by the form.
 */
export function validateRegistrationInput(input: { agentLabel: string; ownerNode: Hex }): void {
  if (!input.agentLabel) {
    throw new Error("Agent label is required");
  }
  computeSubnode(input.ownerNode, input.agentLabel);
}

/**
 * Returns the wallet that actually manages an ENS name, accounting for wrapped names.
 */
export function resolveEffectiveOwnerManager(input: EffectiveOwnerManagerInput): Hex | null {
  if (!input.registryOwner) {
    return null;
  }

  if (input.nameWrapperAddress && sameAddress(input.registryOwner, input.nameWrapperAddress)) {
    return input.wrapperOwner ?? null;
  }

  return input.registryOwner;
}

/**
 * Explains whether the entered owner ENS can safely anchor an agent subname.
 */
export function buildOwnerEnsStatus(input: OwnerEnsStatusInput): OwnerEnsStatus {
  const guidance = buildOwnerEnsGuidance(input);
  const blocker = readOwnerEnsBlocker(input);

  return {
    blocker,
    canSubmit: blocker === null,
    guidance
  };
}

/**
 * Explains whether the non-owner registration fields are ready for wallet submission.
 */
export function buildRegistrationDraftStatus(input: RegistrationDraftStatusInput): RegistrationDraftStatus {
  const blocker = readRegistrationDraftBlocker(input);

  return {
    blocker,
    canSubmit: blocker === null
  };
}

/**
 * Selects a reverse ENS name for one-time owner-field autofill without overriding user edits.
 */
export function readOwnerEnsAutofill(input: OwnerEnsAutofillInput): string | null {
  const reverseEnsName = input.reverseEnsName?.trim().toLowerCase();
  if (input.hasUserEditedOwnerName || input.currentOwnerName.trim() || !reverseEnsName) {
    return null;
  }

  return reverseEnsName;
}

/**
 * Parses bigint form values without throwing while the user is still typing.
 */
export function safeBigInt(value: string): bigint {
  return /^\d+$/u.test(value.trim()) ? BigInt(value.trim()) : 0n;
}

/**
 * Returns a configured contract address or raises the caller-facing setup error.
 */
export function requireAddress(value: Hex | null | undefined, message: string): Hex {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

/**
 * Builds a deterministic policy hash only when the target contract is configured.
 */
function buildPreviewPolicyHash(input: {
  agentKind: AgentKind;
  agentNode: Hex;
  expiresAt: string;
  hasCompleteEnsInput: boolean;
  maxGasReimbursementWei: string;
  maxValueWei: string;
  ownerNode: Hex;
  swapPolicy?: SwapPolicyInput | null;
  taskLogAddress?: Hex | null;
}): Hex | null {
  const executable = readExecutablePolicy(input);
  if (!input.hasCompleteEnsInput || !executable) {
    return null;
  }

  return hashPolicyMetadata(
    buildPolicyMetadata({
      agentNode: input.agentNode,
      expiresAt: safeBigInt(input.expiresAt),
      maxGasReimbursementWei: safeBigInt(input.maxGasReimbursementWei),
      maxValueWei: safeBigInt(input.maxValueWei),
      ownerNode: input.ownerNode,
      selector: executable.selector,
      target: executable.target
    })
  );
}

/**
 * Builds the exact policy snapshot digest that AgentEnsExecutor verifies against ENS.
 */
function buildPreviewPolicyDigest(input: {
  agentKind: AgentKind;
  agentNode: Hex;
  expiresAt: string;
  hasCompleteEnsInput: boolean;
  maxGasReimbursementWei: string;
  maxValueWei: string;
  swapPolicy?: SwapPolicyInput | null;
  taskLogAddress?: Hex | null;
}): Hex | null {
  const executable = readExecutablePolicy(input);
  if (!input.hasCompleteEnsInput || !executable) {
    return null;
  }

  return hashPolicySnapshot(input.agentNode, {
    enabled: true,
    expiresAt: safeBigInt(input.expiresAt),
    maxGasReimbursementWei: safeBigInt(input.maxGasReimbursementWei),
    maxValueWei: safeBigInt(input.maxValueWei),
    selector: executable.selector,
    target: executable.target
  });
}

function readExecutablePolicy(input: {
  agentKind: AgentKind;
  swapPolicy?: SwapPolicyInput | null;
  taskLogAddress?: Hex | null;
}): { selector: Hex; target: Hex } | null {
  if (input.agentKind === "swapper") {
    if (!input.swapPolicy) {
      return null;
    }
    const policy = buildSwapPolicyMetadata(readSwapPolicyInput(input.swapPolicy));
    // Trust boundary: AgentEnsExecutor enforces the executable target/selector from the
    // ENS policy digest. For owner-funded Swapper agents that executable is the router
    // call made by executeOwnerFundedERC20, not TaskLog's recordTask helper.
    return { selector: policy.selector, target: policy.router };
  }

  return input.taskLogAddress ? { selector: taskLogRecordTaskSelector(), target: input.taskLogAddress } : null;
}

/**
 * Provides a stable message for reverse ENS lookup without treating reverse ENS as required.
 */
function buildOwnerEnsGuidance(input: OwnerEnsStatusInput): string {
  if (!input.connectedWallet) {
    return "Connect a wallet, then enter an ENS name you control.";
  }

  if (!input.isReverseEnsSettled) {
    return "Checking this wallet for a reverse ENS name.";
  }

  if (input.reverseEnsName) {
    return `Reverse ENS detected: ${input.reverseEnsName}. You can use it or enter another ENS name you control.`;
  }

  return "No owner ENS detected for this wallet. Enter an ENS name you control.";
}

/**
 * Returns the first registration blocker caused by the owner ENS identity checks.
 */
function readOwnerEnsBlocker(input: OwnerEnsStatusInput): string | null {
  if (!input.connectedWallet) {
    return "Connect a wallet before submitting registration";
  }

  if (!input.normalizedOwnerName) {
    return "Enter an ENS name you control before submitting registration";
  }

  if (!input.isOwnerManagerSettled) {
    return "Checking whether this wallet can manage the ENS name";
  }

  // Subname creation authority comes from the registry owner or NameWrapper owner, not from addr(owner).
  if (!input.effectiveOwnerManager || !sameAddress(input.connectedWallet, input.effectiveOwnerManager)) {
    return "This wallet cannot manage the entered ENS name";
  }

  return null;
}

/**
 * Returns the first missing registration prerequisite outside the owner ENS checks.
 */
function readRegistrationDraftBlocker(input: RegistrationDraftStatusInput): string | null {
  if (!input.agentLabel.trim()) {
    return "Agent label is required";
  }

  if (!input.normalizedAgentAddress) {
    return "Enter a valid agent address before submitting registration";
  }

  if (!input.executorAddress) {
    return "Executor address is not configured";
  }

  if (!input.taskLogAddress) {
    return "TaskLog address is not configured";
  }

  if (safeBigInt(input.gasBudgetWei) === 0n) {
    return "Enter a nonzero gas budget before submitting registration";
  }

  if (input.maxGasReimbursementWei !== undefined && safeBigInt(input.maxGasReimbursementWei) === 0n) {
    return "Enter a nonzero reimbursement cap before submitting registration";
  }

  if (readRequiredGasBudgetWei(input) > safeBigInt(input.gasBudgetWei)) {
    return "Gas budget must cover the max task value";
  }

  if (!input.hasPreparedTextRecords) {
    return "ENS text records are not ready yet";
  }

  if (!input.resolverLookupSettled) {
    return "Waiting for live resolver lookup";
  }

  if (!input.subnameOwnerLookupSettled) {
    return "Waiting for agent subname owner lookup";
  }

  if (!input.resolverAddress && input.shouldCreateSubnameRecord && !input.publicResolverAddress) {
    return "Public resolver address is not configured";
  }

  if (!input.resolverAddress && !input.shouldCreateSubnameRecord) {
    return "Agent ENS resolver is not configured for record writes";
  }

  return null;
}

/**
 * Computes the task value that must be funded up front; gas reimbursement is estimated per relayer execution.
 */
function readRequiredGasBudgetWei(input: RegistrationDraftStatusInput): bigint {
  return safeBigInt(input.maxValueWei ?? "0");
}

/**
 * Compares EVM addresses case-insensitively without normalizing non-address form input.
 */
function sameAddress(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * Produces the public ENS text records that make the agent passport inspectable.
 */
function buildAgentTextRecords(input: {
  agentKind: AgentKind;
  executorAddress?: Hex | null;
  hasCompleteEnsInput: boolean;
  normalizedAgentAddress: Hex | null;
  normalizedOwnerName: string;
  maxGasReimbursementWei: string;
  maxValueWei: string;
  policyDigest: Hex | null;
  policyExpiresAt: string;
  policyHash: Hex | null;
  policyUri: string;
  swapPolicy?: SwapPolicyInput | null;
  taskLogAddress?: Hex | null;
}): readonly { key: string; value: string }[] {
  if (
    !input.hasCompleteEnsInput ||
    !input.normalizedAgentAddress ||
    !input.executorAddress ||
    !input.policyHash ||
    !input.policyDigest ||
    !readExecutablePolicy(input)
  ) {
    return [];
  }

  const capabilities = buildCapabilities(input.agentKind);
  const executable = readExecutablePolicy(input)!;
  const records = [
    ...LEGACY_AGENT_TEXT_RECORD_KEYS.map((key) => ({ key, value: "" })),
    { key: "agent_v", value: "2" },
    { key: "agent_owner", value: input.normalizedOwnerName },
    { key: "agent_kind", value: input.agentKind },
    { key: "agent_capabilities", value: capabilities.join(",") },
    { key: "agent_policy_schema", value: "agentpassport.policy.v1" },
    { key: "agent_policy_digest", value: input.policyDigest },
    { key: "agent_policy_target", value: executable.target },
    { key: "agent_policy_selector", value: executable.selector },
    { key: "agent_policy_max_value_wei", value: safeBigInt(input.maxValueWei).toString() },
    { key: "agent_policy_max_gas_reimbursement_wei", value: safeBigInt(input.maxGasReimbursementWei).toString() },
    { key: "agent_policy_expires_at", value: safeBigInt(input.policyExpiresAt).toString() },
    { key: "agent_policy_hash", value: input.policyHash },
    { key: "agent_executor", value: input.executorAddress },
    { key: "agent_status", value: "active" },
    { key: "agent_description", value: `${input.normalizedOwnerName} ${input.agentKind === "swapper" ? "Uniswap swapper" : "onchain assistant"}` }
  ];

  // Swapper agents publish human-readable Uniswap constraints as ENS text records.
  // These metadata guardrails are intentionally preflight gates for MCP/KeeperHub/UI;
  // the V1 executor only verifies the signed target/selector/value policy digest.
  // Owner ERC20 approval remains a separate wallet action outside registration.
  if (input.agentKind === "swapper" && input.swapPolicy) {
    records.push(...buildSwapPolicyTextRecords(input.swapPolicy));
  }

  if (input.policyUri.trim()) {
    records.splice(4, 0, { key: "agent_policy_uri", value: input.policyUri.trim() });
  }

  return records;
}

function buildCapabilities(agentKind: AgentKind): string[] {
  const capabilities = ["task-log", "sponsored-execution"];
  if (agentKind === "swapper") {
    capabilities.push("uniswap-swap");
  }
  return capabilities;
}

function buildSwapPolicyTextRecords(input: SwapPolicyInput): { key: string; value: string }[] {
  const policy = buildSwapPolicyMetadata(readSwapPolicyInput(input));
  return [
    { key: "agent_policy_uniswap_chain_id", value: policy.allowedChainId },
    { key: "agent_policy_uniswap_allowed_token_in", value: policy.allowedTokensIn.join(",") },
    { key: "agent_policy_uniswap_allowed_token_out", value: policy.allowedTokensOut.join(",") },
    { key: "agent_policy_uniswap_max_input_amount", value: policy.maxAmountInWei },
    { key: "agent_policy_uniswap_max_slippage_bps", value: policy.maxSlippageBps },
    { key: "agent_policy_uniswap_deadline_seconds", value: policy.deadlineSeconds },
    { key: "agent_policy_uniswap_enabled", value: String(policy.enabled) },
    { key: "agent_policy_uniswap_recipient", value: policy.recipient },
    { key: "agent_policy_uniswap_router", value: policy.router },
    { key: "agent_policy_uniswap_selector", value: policy.selector }
  ];
}

function readSwapPolicyInteger(value: bigint | string): bigint {
  return typeof value === "bigint" ? value : safeBigInt(value);
}

function readSwapPolicyInput(input: SwapPolicyInput): SwapPolicy {
  return {
    allowedChainId: readSwapPolicyInteger(input.allowedChainId),
    allowedTokensIn: input.allowedTokensIn,
    allowedTokensOut: input.allowedTokensOut,
    deadlineSeconds: readSwapPolicyInteger(input.deadlineSeconds),
    enabled: input.enabled,
    maxAmountInWei: readSwapPolicyInteger(input.maxAmountInWei),
    maxSlippageBps: readSwapPolicyInteger(input.maxSlippageBps),
    recipient: input.recipient,
    router: input.router,
    selector: input.selector
  };
}
