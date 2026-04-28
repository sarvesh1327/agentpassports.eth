import { AGENT_TEXT_RECORD_KEYS } from "./contracts.ts";

export type AgentTextRecord = {
  key: (typeof AGENT_TEXT_RECORD_KEYS)[number];
  value: string;
};

export type AgentTextReadResult = {
  result?: unknown;
  status?: string;
};

export type AgentEnsAutofillInput = {
  currentAgentName: string;
  directoryAgentName?: string | null;
  hasUserEditedAgentName: boolean;
  reverseEnsName?: string | null;
};

/**
 * Selects a connected agent wallet's verified ENS name without overriding manual input.
 */
export function readAgentEnsAutofill(input: AgentEnsAutofillInput): string | null {
  const reverseEnsName = input.reverseEnsName?.trim().toLowerCase();
  const directoryAgentName = input.directoryAgentName?.trim().toLowerCase();
  if (input.hasUserEditedAgentName || input.currentAgentName.trim()) {
    return null;
  }

  return reverseEnsName || directoryAgentName || null;
}

/**
 * Derives the owner ENS name as the immediate parent of the selected agent ENS subname.
 */
export function readImmediateOwnerName(agentName: string): string | null {
  const labels = agentName.trim().toLowerCase().split(".").filter(Boolean);
  if (labels.length < 2) {
    return null;
  }

  return labels.slice(1).join(".");
}

/**
 * Converts resolver text read results into a complete agent passport metadata table.
 */
export function mapAgentTextRecords(liveRecords?: readonly AgentTextReadResult[]): AgentTextRecord[] {
  return AGENT_TEXT_RECORD_KEYS.map((key, index) => {
    const read = liveRecords?.[index];
    const value = read?.status === "success" ? String(read.result ?? "").trim() : "";

    return {
      key,
      value: value || "Unknown"
    };
  });
}
