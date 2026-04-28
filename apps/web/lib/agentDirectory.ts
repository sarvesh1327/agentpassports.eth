import { namehashEnsName, type Hex } from "@agentpassport/config";
import { normalizeAddressInput } from "./addressInput.ts";
import { readImmediateOwnerName } from "./agentSession.ts";

export type AgentDirectoryRecord = {
  agentAddress: Hex;
  agentName: string;
  agentNode: Hex;
  ownerName: string;
  updatedAt: number;
};

export type AgentDirectoryStore = {
  listByAgentAddress(agentAddress: Hex): AgentDirectoryRecord[];
  listByOwnerName(ownerName: string): AgentDirectoryRecord[];
  upsert(record: AgentDirectoryRecord): void;
};

export type ForwardAgentAddressReader = (record: AgentDirectoryRecord) => Promise<Hex | null>;

/**
 * Creates a normalized directory record from user input before it is stored server-side.
 */
export function buildAgentDirectoryRecord(input: {
  agentAddress: string;
  agentName: string;
  updatedAt?: number;
}): AgentDirectoryRecord {
  const agentAddress = normalizeDirectoryAddress(input.agentAddress);
  const agentName = normalizeAgentName(input.agentName);
  const ownerName = readImmediateOwnerName(agentName);

  if (!ownerName) {
    throw new Error("Enter a complete agent ENS name");
  }

  return {
    agentAddress,
    agentName,
    agentNode: namehashEnsName(agentName),
    ownerName,
    updatedAt: input.updatedAt ?? Date.now()
  };
}

/**
 * Returns the newest stored agent name that still resolves forward to the requested wallet address.
 */
export async function resolveVerifiedAgentDirectoryRecord(input: {
  agentAddress: string;
  readForwardAgentAddress: ForwardAgentAddressReader;
  store: AgentDirectoryStore;
}): Promise<AgentDirectoryRecord | null> {
  const agentAddress = normalizeDirectoryAddress(input.agentAddress);
  const candidates = input.store
    .listByAgentAddress(agentAddress)
    .toSorted((left, right) => right.updatedAt - left.updatedAt);

  for (const candidate of candidates) {
    const resolvedAddress = await readForwardAddress(candidate, input.readForwardAgentAddress);
    if (resolvedAddress && addressesMatch(resolvedAddress, agentAddress)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Returns owner-owned agent names that still forward-resolve to their indexed signer addresses.
 */
export async function resolveVerifiedAgentDirectoryRecordsByOwner(input: {
  ownerName: string;
  readForwardAgentAddress: ForwardAgentAddressReader;
  store: AgentDirectoryStore;
}): Promise<AgentDirectoryRecord[]> {
  const ownerName = normalizeOwnerName(input.ownerName);
  const candidates = input.store
    .listByOwnerName(ownerName)
    .filter((candidate) => candidate.ownerName.toLowerCase() === ownerName)
    .toSorted((left, right) => right.updatedAt - left.updatedAt);
  const verifiedRecords: AgentDirectoryRecord[] = [];

  for (const candidate of candidates) {
    const resolvedAddress = await readForwardAddress(candidate, input.readForwardAgentAddress);
    if (resolvedAddress && addressesMatch(resolvedAddress, candidate.agentAddress)) {
      verifiedRecords.push(candidate);
    }
  }

  return verifiedRecords;
}

/**
 * Lowercases a valid EVM address for stable SQLite keys and comparisons.
 */
function normalizeDirectoryAddress(value: string): Hex {
  const trimmed = value.trim();
  const normalized = normalizeAddressInput(trimmed.startsWith("0X") ? `0x${trimmed.slice(2)}` : trimmed);
  if (!normalized) {
    throw new Error("Enter a valid agent address");
  }

  return normalized.toLowerCase() as Hex;
}

/**
 * Lowercases ENS names and rejects incomplete single-label values.
 */
function normalizeAgentName(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.split(".").filter(Boolean).length < 2) {
    throw new Error("Enter a complete agent ENS name");
  }

  return normalized;
}

/**
 * Lowercases owner ENS names so owner-based discovery uses stable lookup keys.
 */
function normalizeOwnerName(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.split(".").filter(Boolean).length < 2) {
    throw new Error("Enter a complete owner ENS name");
  }

  return normalized;
}

/**
 * Treats stale or temporarily unreadable ENS records as unverified directory candidates.
 */
async function readForwardAddress(
  record: AgentDirectoryRecord,
  reader: ForwardAgentAddressReader
): Promise<Hex | null> {
  try {
    return await reader(record);
  } catch {
    return null;
  }
}

/**
 * Compares two address strings without relying on checksum casing.
 */
function addressesMatch(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
