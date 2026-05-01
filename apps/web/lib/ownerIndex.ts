export const OWNER_INDEX_VERSION_KEY = "agnetpassports_no";
export const OWNER_INDEX_AGENTS_KEY = "agentpasspports_agents";
export const OWNER_INDEX_VERSION = "1";
export const LEGACY_OWNER_INDEX_VERSION_KEY = "agentpassports.v";
export const LEGACY_OWNER_INDEX_AGENTS_KEY = "agentpassports.agents";

export type OwnerAgentName = {
  label: string;
  name: string;
};

/**
 * Parses the owner-level ENS text index into unique, normalized agent ENS names.
 */
export function parseOwnerAgentIndex(value?: string | null): string[] {
  const names = new Set<string>();
  for (const item of (value ?? "").split(",")) {
    const name = normalizeOwnerAgentLabel(item);
    if (name) {
      names.add(name);
    }
  }

  return [...names];
}

/**
 * Serializes full agent ENS names into the compact owner-index text-record representation.
 */
export function serializeOwnerAgentIndex(names: readonly string[]): string {
  return parseOwnerAgentIndex(names.join(",")).join(",");
}

/**
 * Adds one full agent ENS name to an existing owner index without duplicates.
 */
export function addOwnerAgentLabel(existingIndex: string | readonly string[], label: string): string[] {
  const existing = parseOwnerAgentLabels(existingIndex);
  return parseOwnerAgentIndex([...existing, label].join(","));
}

/**
 * Removes one full agent ENS name from an existing owner index.
 */
export function removeOwnerAgentLabel(existingIndex: string | readonly string[], label: string): string[] {
  const removed = normalizeOwnerAgentLabel(label);
  const existing = parseOwnerAgentLabels(existingIndex);
  return parseOwnerAgentIndex(existing.join(",")).filter((item) => item !== removed);
}

/**
 * Reads full agent ENS names from the owner ENS index. Legacy bare labels are still
 * expanded against the owner ENS name so old local/dev records do not break the UI.
 */
export function buildOwnerAgentNames(ownerName: string, labels: readonly string[]): OwnerAgentName[] {
  const normalizedOwner = ownerName.trim().toLowerCase();
  return parseOwnerAgentIndex(labels.join(",")).map((label) => ({
    label: label.includes(".") ? label.split(".")[0] ?? label : label,
    name: label.includes(".") || !normalizedOwner ? label : `${label}.${normalizedOwner}`
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
