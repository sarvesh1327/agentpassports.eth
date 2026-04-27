import { computeSubnode, namehashEnsName, type Hex } from "@agentpassport/config";

/**
 * Builds the agent ENS name from the user-controlled owner name and agent label fields.
 */
export function buildAgentName(agentLabel: string, ownerName: string): string {
  const normalizedLabel = agentLabel.trim().toLowerCase();
  const normalizedOwner = ownerName.trim().toLowerCase();
  return normalizedLabel && normalizedOwner ? `${normalizedLabel}.${normalizedOwner}` : normalizedOwner;
}

/**
 * Splits a route-level agent name into the label and owner name used by registration previews.
 */
export function splitAgentName(agentName: string, fallbackOwnerName: string): { agentLabel: string; ownerName: string } {
  const normalizedName = agentName.trim().toLowerCase();
  const labels = normalizedName.split(".").filter(Boolean);
  if (labels.length < 2) {
    return { agentLabel: labels[0] ?? "", ownerName: fallbackOwnerName };
  }
  return {
    agentLabel: labels[0],
    ownerName: labels.slice(1).join(".")
  };
}

/**
 * Computes a namehash while falling back to the ENS root for incomplete local form input.
 */
export function safeNamehash(name?: string): Hex {
  if (!name) {
    return namehashEnsName("");
  }
  try {
    return namehashEnsName(name);
  } catch {
    return namehashEnsName("");
  }
}

/**
 * Computes the agent subnode from an owner node and label without breaking the preview on invalid input.
 */
export function safeSubnode(ownerNode: Hex, agentLabel: string): Hex {
  try {
    return computeSubnode(ownerNode, agentLabel.trim().toLowerCase());
  } catch {
    return namehashEnsName("");
  }
}
