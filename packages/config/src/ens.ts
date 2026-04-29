import type { Hex, LatestBlock } from "./types.ts";
import { ZERO_BYTES32, concatBytes, hexToBytes, normalizeAddress, normalizeBytes32, utf8ToBytes } from "./hex.ts";
import { keccak256Hex } from "./keccak.ts";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export type ContractReadClient = {
  getBlock?: (parameters: { blockTag: "latest" }) => Promise<LatestBlock>;
  readContract(parameters: ContractReadParameters): Promise<unknown>;
};

export type ContractWriteClient = {
  writeContract(parameters: ContractWriteParameters): Promise<Hex>;
};

export type ContractReadParameters = {
  address: Hex;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
};

export type ContractWriteParameters = ContractReadParameters & {
  value?: bigint;
};

export type AgentTextRecord = {
  key: string;
  value: string;
};

export type ResolvedAgentProfile = {
  address: Hex | null;
  name: string;
  node: Hex;
  resolverAddress: Hex | null;
  textRecords: Record<string, string>;
};

/**
 * Minimal ENS registry ABI for resolving the active resolver of an ENS node.
 */
export const ENS_REGISTRY_RESOLVER_ABI = [
  {
    type: "function",
    name: "resolver",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "resolver", type: "address" }]
  }
] as const;

/**
 * Minimal resolver ABI for EVM address and text records used by the MVP.
 */
export const ENS_PUBLIC_RESOLVER_ABI = [
  {
    type: "function",
    name: "addr",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "addr", type: "address" }]
  },
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" }
    ],
    outputs: [{ name: "value", type: "string" }]
  },
  {
    type: "function",
    name: "setAddr",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "addr", type: "address" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "setText",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" }
    ],
    outputs: []
  }
] as const;

/**
 * Computes the ENS namehash for a root or dot-separated ENS name.
 *
 * The executor derives agent subnodes with Solidity's namehash algorithm, so
 * this helper keeps frontend and runner code byte-for-byte aligned with that
 * onchain calculation.
 */
export function namehashEnsName(name: string): Hex {
  const normalizedName = normalizeEnsName(name);
  if (normalizedName === "") {
    return ZERO_BYTES32;
  }

  let node = ZERO_BYTES32;
  const labels = normalizedName.split(".");
  for (let index = labels.length - 1; index >= 0; index -= 1) {
    const labelHash = keccak256Hex(utf8ToBytes(labels[index]));
    node = keccak256Hex(concatBytes(hexToBytes(node), hexToBytes(labelHash))) as Hex;
  }
  return node;
}

/**
 * Computes the ENS subnode hash used for an agent label under an owner ENS node.
 */
export function computeSubnode(parentNode: Hex, label: string): Hex {
  const normalizedParentNode = normalizeBytes32(parentNode);
  const normalizedLabel = normalizeEnsLabel(label);
  const labelHash = keccak256Hex(utf8ToBytes(normalizedLabel));
  return keccak256Hex(concatBytes(hexToBytes(normalizedParentNode), hexToBytes(labelHash)));
}

/**
 * Reads the resolver configured for an ENS node and normalizes zero to null.
 */
export async function getResolverAddress(input: {
  client: ContractReadClient;
  ensRegistryAddress: Hex;
  node: Hex;
}): Promise<Hex | null> {
  const resolverAddress = await input.client.readContract({
    address: normalizeAddress(input.ensRegistryAddress, "preserve"),
    abi: ENS_REGISTRY_RESOLVER_ABI,
    functionName: "resolver",
    args: [normalizeBytes32(input.node)]
  });
  return nonZeroAddress(readAddressResult(resolverAddress, "resolver"));
}

/**
 * Reads the agent EVM signer address from the resolver's addr(node) record.
 */
export async function getAgentAddress(input: {
  agentNode: Hex;
  client: ContractReadClient;
  resolverAddress: Hex | null;
}): Promise<Hex | null> {
  const resolverAddress = nonZeroAddress(input.resolverAddress);
  if (!resolverAddress) {
    return null;
  }
  const agentAddress = await input.client.readContract({
    address: resolverAddress,
    abi: ENS_PUBLIC_RESOLVER_ABI,
    functionName: "addr",
    args: [normalizeBytes32(input.agentNode)]
  });
  return nonZeroAddress(readAddressResult(agentAddress, "addr"));
}

/**
 * Reads selected text records for an agent node from the current resolver.
 */
export async function getAgentTextRecords(input: {
  agentNode: Hex;
  client: ContractReadClient;
  keys: readonly string[];
  resolverAddress: Hex | null;
}): Promise<Record<string, string>> {
  const resolverAddress = nonZeroAddress(input.resolverAddress);
  const records: Record<string, string> = {};
  for (const key of input.keys) {
    const normalizedKey = normalizeTextKey(key);
    records[normalizedKey] = "";
    if (!resolverAddress) {
      continue;
    }
    const value = await input.client.readContract({
      address: resolverAddress,
      abi: ENS_PUBLIC_RESOLVER_ABI,
      functionName: "text",
      args: [normalizeBytes32(input.agentNode), normalizedKey]
    });
    records[normalizedKey] = typeof value === "string" ? value : String(value ?? "");
  }
  return records;
}

/**
 * Resolves the ENS node, resolver, signer address, and requested text records for an agent name.
 */
export async function resolveAgentProfile(input: {
  client: ContractReadClient;
  ensRegistryAddress: Hex;
  name: string;
  textKeys?: readonly string[];
}): Promise<ResolvedAgentProfile> {
  const normalizedName = normalizeEnsName(input.name);
  const node = namehashEnsName(normalizedName);
  const resolverAddress = await getResolverAddress({
    client: input.client,
    ensRegistryAddress: input.ensRegistryAddress,
    node
  });
  const [address, textRecords] = await Promise.all([
    getAgentAddress({ agentNode: node, client: input.client, resolverAddress }),
    getAgentTextRecords({
      agentNode: node,
      client: input.client,
      keys: input.textKeys ?? [],
      resolverAddress
    })
  ]);

  return {
    address,
    name: normalizedName,
    node,
    resolverAddress,
    textRecords
  };
}

/**
 * Writes the resolver addr(node) record for an agent signer address.
 */
export async function setAgentAddress(input: {
  agentAddress: Hex;
  agentNode: Hex;
  client: ContractWriteClient;
  resolverAddress: Hex;
}): Promise<Hex> {
  return input.client.writeContract({
    address: normalizeAddress(input.resolverAddress, "preserve"),
    abi: ENS_PUBLIC_RESOLVER_ABI,
    functionName: "setAddr",
    args: [normalizeBytes32(input.agentNode), normalizeAddress(input.agentAddress, "preserve")]
  });
}

/**
 * Writes the requested resolver text records in order and returns each transaction hash.
 */
export async function setAgentTextRecords(input: {
  agentNode: Hex;
  client: ContractWriteClient;
  records: readonly AgentTextRecord[];
  resolverAddress: Hex;
}): Promise<Hex[]> {
  const txHashes: Hex[] = [];
  for (const record of input.records) {
    txHashes.push(
      await input.client.writeContract({
        address: normalizeAddress(input.resolverAddress, "preserve"),
        abi: ENS_PUBLIC_RESOLVER_ABI,
        functionName: "setText",
        args: [normalizeBytes32(input.agentNode), normalizeTextKey(record.key), record.value]
      })
    );
  }
  return txHashes;
}

/**
 * Converts unset ENS address records into a nullable value.
 */
export function nonZeroAddress(value?: Hex | null): Hex | null {
  if (!value) {
    return null;
  }
  const normalizedAddress = normalizeAddress(value, "preserve");
  return normalizedAddress.toLowerCase() === ZERO_ADDRESS ? null : normalizedAddress;
}

function normalizeEnsName(name: string): string {
  if (name === "") {
    return "";
  }
  const normalizedName = name.trim().toLowerCase();
  const labels = normalizedName.split(".");
  if (normalizedName !== name.toLowerCase() || labels.some((label) => label.length === 0)) {
    throw new Error("Invalid ENS name");
  }
  for (const label of labels) {
    normalizeEnsLabel(label);
  }
  return normalizedName;
}

function normalizeEnsLabel(label: string): string {
  const normalizedLabel = label.trim();
  if (normalizedLabel.length === 0 || normalizedLabel.includes(".") || normalizedLabel !== label || normalizedLabel !== label.toLowerCase()) {
    throw new Error("Invalid ENS label");
  }
  if (normalizedLabel !== normalizedLabel.normalize("NFC") || /[\u0000-\u0020\u007f]/u.test(normalizedLabel)) {
    throw new Error("Invalid ENS label");
  }
  if (normalizedLabel.startsWith("-") || normalizedLabel.endsWith("-")) {
    throw new Error("Invalid ENS label");
  }
  return normalizedLabel;
}

function readAddressResult(value: unknown, field: string): Hex {
  if (typeof value !== "string") {
    throw new Error(`${field} must return an address`);
  }
  return normalizeAddress(value as Hex, "preserve");
}

function normalizeTextKey(key: string): string {
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    throw new Error("ENS text record key is required");
  }
  return normalizedKey;
}
