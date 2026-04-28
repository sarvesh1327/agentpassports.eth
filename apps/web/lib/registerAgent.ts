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

/**
 * Derives the ENS node, policy hash, and text records from the current registration form values.
 */
export function buildRegisterPreview(input: RegisterPreviewInput): RegisterPreview {
  const normalizedAgentLabel = input.agentLabel.trim().toLowerCase();
  const normalizedOwnerName = input.ownerName.trim().toLowerCase();
  const agentName = buildAgentName(normalizedAgentLabel, normalizedOwnerName) || ".eth";
  const ownerNode = safeNamehash(normalizedOwnerName);
  const agentNode = normalizedAgentLabel ? safeSubnode(ownerNode, normalizedAgentLabel) : safeNamehash(agentName);
  const policyHash = buildPreviewPolicyHash({
    agentNode,
    expiresAt: input.policyExpiresAt,
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
      agentAddress: input.agentAddress,
      executorAddress: input.executorAddress,
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
  maxGasReimbursementWei: string;
  maxValueWei: string;
  ownerNode: Hex;
  taskLogAddress?: Hex | null;
}): Hex | null {
  if (!input.taskLogAddress) {
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
 * Produces the public ENS text records that make the agent passport inspectable.
 */
function buildAgentTextRecords(input: {
  agentAddress: string;
  executorAddress?: Hex | null;
  normalizedOwnerName: string;
  policyHash: Hex | null;
  policyUri: string;
}): readonly { key: string; value: string }[] {
  return [
    { key: "agent.v", value: "1" },
    { key: "agent.owner", value: input.normalizedOwnerName || "Pending owner ENS" },
    { key: "agent.kind", value: "personal-assistant" },
    { key: "agent.capabilities", value: "task-log,sponsored-execution" },
    { key: "agent.policy.uri", value: input.policyUri || "Pending metadata URI" },
    { key: "agent.policy.hash", value: input.policyHash ?? "Pending policy target" },
    { key: "agent.executor", value: input.executorAddress ?? "Pending executor" },
    { key: "agent.status", value: normalizeAddressInput(input.agentAddress) ? "active" : "draft" },
    {
      key: "agent.description",
      value: input.normalizedOwnerName ? `${input.normalizedOwnerName} onchain assistant` : "Pending owner ENS"
    }
  ];
}
