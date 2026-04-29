/**
 * Canonicalizes ENS input used by web, runner, and MCP flows. Lowercasing is
 * safe for the demo ENS names we produce, while the structure check prevents an
 * agent from accidentally resolving bare labels such as `assistant`.
 */
export function normalizeEnsName(name: string, label = "ENS name"): string {
  const normalized = name.trim().toLowerCase();
  if (!normalized || !normalized.includes(".") || normalized.split(".").some((part) => !part)) {
    throw new Error(`Expected a valid ${label}`);
  }
  return normalized;
}

/**
 * Returns the direct owner ENS name for an agent subname, e.g.
 * `assistant.owner.eth` -> `owner.eth`. The helper is shared so MCP and browser
 * task builders derive the same owner node for TaskLog calldata.
 */
export function parentEnsName(agentName: string): string {
  const parts = normalizeEnsName(agentName, "agent ENS name").split(".");
  if (parts.length < 3) {
    throw new Error("Expected a valid agent ENS name with an owner parent");
  }
  return parts.slice(1).join(".");
}

/**
 * Parses the owner's comma-separated `agentpassports.agents` ENS text record into
 * deterministic labels. Empty labels are ignored so owners can keep readable
 * spacing without breaking MCP list tools.
 */
export function parseOwnerAgentLabels(value: string): string[] {
  return value
    .split(",")
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);
}
