import {
  buildPolicyMetadata,
  buildSwapPolicyMetadata,
  hashPolicyMetadata,
  taskLogRecordTaskSelector,
  type Hex,
  type PolicyMetadata,
  type SwapPolicy,
  type SwapPolicyMetadata
} from "@agentpassport/config";
import type { ServerEnv } from "./serverEnv";

const PINATA_JSON_ENDPOINT = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PINATA_UNPIN_ENDPOINT = "https://api.pinata.cloud/pinning/unpin";

export type AgentPolicyDocumentInput = {
  agentAddress: Hex;
  agentName: string;
  agentNode: Hex;
  capabilities: readonly string[];
  chainId: bigint;
  executorAddress: Hex;
  expiresAt: bigint;
  maxGasReimbursementWei: bigint;
  maxValueWei: bigint;
  ownerName: string;
  ownerNode: Hex;
  status?: "active" | "disabled";
  swapPolicy?: SwapPolicy | null;
  target: Hex;
};

export type AgentPolicyDocument = {
  version: 1;
  agent: {
    address: Hex;
    capabilities: readonly string[];
    name: string;
    node: Hex;
    ownerName: string;
    ownerNode: Hex;
    status: "active" | "disabled";
  };
  chainId: string;
  executor: Hex;
  policy: PolicyMetadata;
  swapPolicy?: SwapPolicyMetadata;
};

export type GeneratedAgentPolicy = {
  document: AgentPolicyDocument;
  policyHash: Hex;
};

export type PinataUploadResult = {
  cid: string;
  uri: `ipfs://${string}`;
};

export type PinataUnpinResult = {
  cid: string | null;
  status: "skipped" | "unpinned";
};

type PinataConfig = {
  headers: Record<string, string>;
};

/**
 * Builds the canonical policy/profile document that gets pinned and referenced from ENS.
 */
export function buildAgentPolicyDocument(input: AgentPolicyDocumentInput): GeneratedAgentPolicy {
  const policy = buildPolicyMetadata({
    agentNode: input.agentNode,
    expiresAt: input.expiresAt,
    maxGasReimbursementWei: input.maxGasReimbursementWei,
    maxValueWei: input.maxValueWei,
    ownerNode: input.ownerNode,
    selector: taskLogRecordTaskSelector(),
    target: input.target
  });
  const sortedCapabilities = [...new Set(input.capabilities.map((capability) => capability.trim()).filter(Boolean))].sort();
  const document: AgentPolicyDocument = {
    version: 1,
    agent: {
      address: input.agentAddress.toLowerCase() as Hex,
      capabilities: sortedCapabilities,
      name: input.agentName.trim().toLowerCase(),
      node: input.agentNode,
      ownerName: input.ownerName.trim().toLowerCase(),
      ownerNode: input.ownerNode,
      status: input.status ?? "active"
    },
    chainId: input.chainId.toString(),
    executor: input.executorAddress.toLowerCase() as Hex,
    policy
  };

  // Keep the executable V1 policy hash stable while attaching V2 swap guardrails
  // as transparent metadata for agents, MCP, UI, and reviewers.
  if (input.swapPolicy) {
    document.swapPolicy = buildSwapPolicyMetadata(input.swapPolicy);
  }

  return {
    document,
    policyHash: hashPolicyMetadata(policy)
  };
}

/**
 * Uploads the generated policy document to Pinata with server-only credentials.
 */
export async function uploadPolicyDocumentToPinata(input: {
  document: AgentPolicyDocument;
  env: ServerEnv;
  fetch?: typeof fetch;
}): Promise<PinataUploadResult> {
  const config = loadPinataConfig(input.env);
  const fetcher = input.fetch ?? fetch;
  const response = await fetcher(PINATA_JSON_ENDPOINT, {
    body: JSON.stringify(buildPinataJsonBody(input.document)),
    headers: {
      "content-type": "application/json",
      ...config.headers
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Pinata upload failed with status ${response.status}`);
  }

  const body = await response.json().catch(() => null) as { IpfsHash?: unknown } | null;
  if (!body || typeof body.IpfsHash !== "string" || !body.IpfsHash.trim()) {
    throw new Error("Pinata upload response did not include IpfsHash");
  }

  const cid = body.IpfsHash.trim();
  return {
    cid,
    uri: `ipfs://${cid}`
  };
}

/**
 * Unpins an old policy document from Pinata after ENS no longer points at that CID.
 */
export async function unpinPolicyDocumentFromPinata(input: {
  env: ServerEnv;
  fetch?: typeof fetch;
  policyUri: string;
}): Promise<PinataUnpinResult> {
  const cid = extractPinataCidFromUri(input.policyUri);
  if (!cid) {
    return {
      cid: null,
      status: "skipped"
    };
  }

  const config = loadPinataConfig(input.env);
  const fetcher = input.fetch ?? fetch;
  const response = await fetcher(`${PINATA_UNPIN_ENDPOINT}/${encodeURIComponent(cid)}`, {
    headers: config.headers,
    method: "DELETE"
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Pinata unpin failed with status ${response.status}`);
  }

  return {
    cid,
    status: "unpinned"
  };
}

/**
 * Extracts CIDs from IPFS URIs or common gateway URLs; non-IPFS URLs are left alone.
 */
export function extractPinataCidFromUri(policyUri: string): string | null {
  const value = policyUri.trim();
  if (!value) {
    return null;
  }

  if (value.startsWith("ipfs://")) {
    return readFirstPathSegment(value.slice("ipfs://".length));
  }

  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const ipfsIndex = parts.findIndex((part) => part === "ipfs");
    return ipfsIndex >= 0 ? parts[ipfsIndex + 1] ?? null : null;
  } catch {
    return null;
  }
}

/**
 * Creates the Pinata request body while keeping the policy JSON itself deterministic.
 */
function buildPinataJsonBody(document: AgentPolicyDocument) {
  return {
    pinataContent: document,
    pinataMetadata: {
      keyvalues: {
        agent: document.agent.name,
        chainId: document.chainId,
        owner: document.agent.ownerName
      },
      name: `agentpassports-${document.agent.name}-policy`
    }
  };
}

/**
 * Reads the leading CID segment while ignoring optional gateway path suffixes.
 */
function readFirstPathSegment(value: string): string | null {
  const cid = value.split(/[/?#]/u)[0]?.trim();
  return cid || null;
}

/**
 * Accepts either a JWT or API key pair so local demos can use the available Pinata credential style.
 */
function loadPinataConfig(env: ServerEnv): PinataConfig {
  const jwt = env.PINATA_JWT?.trim();
  if (jwt) {
    return {
      headers: {
        authorization: `Bearer ${jwt}`
      }
    };
  }

  const apiKey = env.PINATA_API_KEY?.trim();
  const secret = (env.PINATA_SECRET_API_KEY ?? env.PINATA_API_SECRET)?.trim();
  if (apiKey && secret) {
    return {
      headers: {
        pinata_api_key: apiKey,
        pinata_secret_api_key: secret
      }
    };
  }

  throw new Error("PINATA_JWT or PINATA_API_KEY and PINATA_SECRET_API_KEY are required");
}
