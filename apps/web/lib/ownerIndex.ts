export const OWNER_INDEX_VERSION_KEY = "agentpassports.v";
export const OWNER_INDEX_AGENTS_KEY = "agentpassports.agents";
export const OWNER_INDEX_VERSION = "1";

export type OwnerAgentName = {
  label: string;
  name: string;
};

/**
 * Parses the owner-level ENS text index into unique, normalized agent labels.
 */
export function parseOwnerAgentIndex(value?: string | null): string[] {
  const labels = new Set<string>();
  for (const item of (value ?? "").split(",")) {
    const label = normalizeOwnerAgentLabel(item);
    if (label) {
      labels.add(label);
    }
  }

  return [...labels];
}

/**
 * Serializes labels into the compact text-record representation stored at agentpassports.agents.
 */
export function serializeOwnerAgentIndex(labels: readonly string[]): string {
  return parseOwnerAgentIndex(labels.join(",")).join(",");
}

/**
 * Adds one label to an existing owner index without duplicating labels.
 */
export function addOwnerAgentLabel(existingIndex: string | readonly string[], label: string): string[] {
  const existing = parseOwnerAgentLabels(existingIndex);
  return parseOwnerAgentIndex([...existing, label].join(","));
}

/**
 * Removes one label from an existing owner index.
 */
export function removeOwnerAgentLabel(existingIndex: string | readonly string[], label: string): string[] {
  const removed = normalizeOwnerAgentLabel(label);
  const existing = parseOwnerAgentLabels(existingIndex);
  return parseOwnerAgentIndex(existing.join(",")).filter((item) => item !== removed);
}

/**
 * Derives full agent ENS names from an owner ENS name and owner index labels.
 */
export function buildOwnerAgentNames(ownerName: string, labels: readonly string[]): OwnerAgentName[] {
  const normalizedOwner = ownerName.trim().toLowerCase();
  return parseOwnerAgentIndex(labels.join(",")).map((label) => ({
    label,
    name: normalizedOwner ? `${label}.${normalizedOwner}` : label
  }));
}

/**
 * Normalizes one owner index label for deterministic ENS subname display and writes.
 */
export function normalizeOwnerAgentLabel(label: string): string {
  return label.trim().toLowerCase();
}

function parseOwnerAgentLabels(value: string | readonly string[]): string[] {
  return typeof value === "string" ? parseOwnerAgentIndex(value) : parseOwnerAgentIndex(value.join(","));
}
