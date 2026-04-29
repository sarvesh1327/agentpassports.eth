import type { Hex } from "@agentpassport/config";

export type AgentPassportStatus = "active" | "disabled" | "unknown";

export type VisibleAgentAddressInput = {
  agentAddressReadSettled: boolean;
  initialAgentAddress: Hex | null;
  resolverAddress: Hex | null;
  resolverReadSettled: boolean;
  resolvedAgentAddress: Hex | null;
};

/**
 * Chooses the agent address to display without hiding a settled live ENS failure behind demo data.
 */
export function resolveVisibleAgentAddress(input: VisibleAgentAddressInput): Hex | null {
  if (input.agentAddressReadSettled) {
    return input.resolvedAgentAddress;
  }

  if (input.resolverReadSettled && !input.resolverAddress) {
    return null;
  }

  return input.initialAgentAddress;
}

/**
 * Parses the comma-separated capability text record while preserving fallback demo capabilities.
 */
export function parseCapabilities(capabilityText: string | undefined, fallback: readonly string[]): readonly string[] {
  if (!capabilityText) {
    return fallback;
  }

  const capabilities = capabilityText
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return capabilities.length > 0 ? capabilities : fallback;
}

/**
 * Derives the passport status from ENS metadata and the live agent address proof.
 */
export function readPassportStatus(statusText: string | undefined, _liveAgentAddress: Hex | null): AgentPassportStatus {
  // AgentEnsExecutor compares the raw ENS text bytes exactly, so the UI must not
  // infer active status from an address when agent.status is missing or malformed.
  if (statusText === "active" || statusText === "disabled") {
    return statusText;
  }

  return "unknown";
}
