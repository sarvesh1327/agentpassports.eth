import {
  buildPolicyMetadata,
  computeSubnode,
  hashPolicyMetadata,
  taskLogRecordTaskSelector,
  type Hex
} from "@agentpassport/config";
import { normalizeAddressInput } from "./addressInput.ts";
import { buildAgentName, safeNamehash, safeSubnode } from "./ensPreview.ts";

export type RegisterPreviewInput = {
  agentAddress: string;
  agentLabel: string;
  executorAddress?: Hex | null;
  gasBudgetWei: string;
  maxGasReimbursementWei: string;
  maxValueWei: string;
  ownerName: string;
  policyExpiresAt: string;
  policyUri: string;
  taskLogAddress?: Hex | null;
};

export type RegisterPreview = {
  agentName: string;
  agentNode: Hex;
  gasBudgetWei: string;
  ownerNode: Hex;
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
    agentNode,
    expiresAt: input.policyExpiresAt,
    hasCompleteEnsInput,
    maxGasReimbursementWei: input.maxGasReimbursementWei,
    maxValueWei: input.maxValueWei,
    ownerNode,
    taskLogAddress: input.taskLogAddress
  });

  return {
    agentName,
    agentNode,
    gasBudgetWei: safeBigInt(input.gasBudgetWei).toString(),
    ownerNode,
    policyHash,
    textRecords: buildAgentTextRecords({
      executorAddress: input.executorAddress,
      hasCompleteEnsInput,
      normalizedAgentAddress,
      normalizedOwnerName,
      policyHash,
      policyUri: input.policyUri
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
  agentNode: Hex;
  expiresAt: string;
  hasCompleteEnsInput: boolean;
  maxGasReimbursementWei: string;
  maxValueWei: string;
  ownerNode: Hex;
  taskLogAddress?: Hex | null;
}): Hex | null {
  if (!input.hasCompleteEnsInput || !input.taskLogAddress) {
    return null;
  }

  return hashPolicyMetadata(
    buildPolicyMetadata({
      agentNode: input.agentNode,
      expiresAt: safeBigInt(input.expiresAt),
      maxGasReimbursementWei: safeBigInt(input.maxGasReimbursementWei),
      maxValueWei: safeBigInt(input.maxValueWei),
      ownerNode: input.ownerNode,
      selector: taskLogRecordTaskSelector(),
      target: input.taskLogAddress
    })
  );
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
  executorAddress?: Hex | null;
  hasCompleteEnsInput: boolean;
  normalizedAgentAddress: Hex | null;
  normalizedOwnerName: string;
  policyHash: Hex | null;
  policyUri: string;
}): readonly { key: string; value: string }[] {
  if (!input.hasCompleteEnsInput || !input.normalizedAgentAddress || !input.executorAddress || !input.policyHash) {
    return [];
  }

  const records = [
    { key: "agent.v", value: "1" },
    { key: "agent.owner", value: input.normalizedOwnerName },
    { key: "agent.kind", value: "personal-assistant" },
    { key: "agent.capabilities", value: "task-log,sponsored-execution" },
    { key: "agent.policy.hash", value: input.policyHash },
    { key: "agent.executor", value: input.executorAddress },
    { key: "agent.status", value: "active" },
    { key: "agent.description", value: `${input.normalizedOwnerName} onchain assistant` }
  ];

  if (input.policyUri.trim()) {
    records.splice(4, 0, { key: "agent.policy.uri", value: input.policyUri.trim() });
  }

  return records;
}
