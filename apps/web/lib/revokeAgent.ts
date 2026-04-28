import type { Hex } from "@agentpassport/config";

export type EnsStatusWriteStateInput = {
  connectedWallet?: Hex | null;
  registryOwner?: Hex | null;
  resolverAddress?: Hex | null;
  resolverLookupSettled: boolean;
};

export type EnsStatusWriteState = {
  blocker: string | null;
  canWrite: boolean;
};

export type RevocationActionStateInput = {
  canWriteEnsStatus: boolean;
  ensStatusBlocker?: string | null;
  policyEnabled?: boolean;
  statusText?: string | null;
};

export type RevocationActionState = {
  blocker: string | null;
  canRevoke: boolean;
  isComplete: boolean;
  shouldWriteEnsStatus: boolean;
};

/**
 * Explains whether the connected wallet can safely write public resolver text records for the agent node.
 */
export function buildEnsStatusWriteState(input: EnsStatusWriteStateInput): EnsStatusWriteState {
  const blocker = readEnsStatusWriteBlocker(input);

  return {
    blocker,
    canWrite: blocker === null
  };
}

/**
 * Combines executor policy and ENS metadata state into the single revoke action state.
 */
export function buildRevocationActionState(input: RevocationActionStateInput): RevocationActionState {
  const normalizedStatus = input.statusText?.trim().toLowerCase() ?? "";
  const shouldWriteEnsStatus = normalizedStatus !== "disabled";
  const isComplete = input.policyEnabled === false && normalizedStatus === "disabled";
  if (isComplete) {
    return {
      blocker: "Agent is already disabled",
      canRevoke: false,
      isComplete,
      shouldWriteEnsStatus
    };
  }

  if (shouldWriteEnsStatus && !input.canWriteEnsStatus) {
    return {
      blocker: input.ensStatusBlocker ?? "ENS status cannot be updated",
      canRevoke: false,
      isComplete,
      shouldWriteEnsStatus
    };
  }

  return {
    blocker: null,
    canRevoke: true,
    isComplete,
    shouldWriteEnsStatus
  };
}

/**
 * Returns the first ENS resolver-write blocker before the UI asks the wallet to sign a transaction.
 */
function readEnsStatusWriteBlocker(input: EnsStatusWriteStateInput): string | null {
  if (!input.connectedWallet) {
    return "Connect owner wallet before writing ENS records";
  }

  if (!input.resolverLookupSettled) {
    return "Waiting for live resolver lookup";
  }

  if (!input.resolverAddress) {
    return "Resolver address is not configured";
  }

  if (!input.registryOwner || !sameAddress(input.connectedWallet, input.registryOwner)) {
    return "Connected wallet cannot write ENS text records for this agent node";
  }

  return null;
}

/**
 * Compares EVM addresses case-insensitively without rewriting the caller's original value.
 */
function sameAddress(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
