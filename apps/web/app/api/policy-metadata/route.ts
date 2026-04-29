import { NextResponse } from "next/server";
import type { Hex } from "@agentpassport/config";
import {
  buildAgentPolicyDocument,
  unpinPolicyDocumentFromPinata,
  uploadPolicyDocumentToPinata
} from "../../../lib/policyMetadata";
import { readMergedServerEnv } from "../../../lib/serverEnv";

export const runtime = "nodejs";

/**
 * Generates the canonical agent policy document, pins it, and returns the ENS-ready URI/hash pair.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const policy = buildAgentPolicyDocument(await readPolicyMetadataRequest(request));
    const upload = await uploadPolicyDocumentToPinata({
      document: policy.document,
      env: readMergedServerEnv()
    });

    return NextResponse.json({
      cid: upload.cid,
      policyHash: policy.policyHash,
      policyUri: upload.uri,
      status: "pinned"
    });
  } catch (error) {
    return policyMetadataErrorResponse(error);
  }
}

/**
 * Best-effort cleanup for old immutable policy CIDs after ENS points at the replacement URI.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const result = await unpinPolicyDocumentFromPinata({
      env: readMergedServerEnv(),
      policyUri: await readPolicyUriRequest(request)
    });

    return NextResponse.json({
      ...result,
      status: result.status
    });
  } catch (error) {
    return policyMetadataErrorResponse(error);
  }
}

/**
 * Parses the client draft into strict typed values before building or uploading JSON.
 */
async function readPolicyMetadataRequest(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    throw new Error("Expected a JSON request body");
  }

  const input = body as Record<string, unknown>;
  return {
    agentAddress: readHex(input.agentAddress, "agentAddress", 20),
    agentName: readRequiredText(input.agentName, "agentName"),
    agentNode: readHex(input.agentNode, "agentNode", 32),
    capabilities: readStringList(input.capabilities, "capabilities"),
    chainId: readBigIntString(input.chainId, "chainId"),
    executorAddress: readHex(input.executorAddress, "executorAddress", 20),
    expiresAt: readBigIntString(input.expiresAt, "expiresAt"),
    maxGasReimbursementWei: readBigIntString(input.maxGasReimbursementWei, "maxGasReimbursementWei"),
    maxValueWei: readBigIntString(input.maxValueWei, "maxValueWei"),
      ownerName: readRequiredText(input.ownerName, "ownerName"),
      ownerNode: readHex(input.ownerNode, "ownerNode", 32),
      status: readPolicyStatus(input.status),
      swapPolicy: readOptionalSwapPolicy(input.swapPolicy),
      target: readHex(input.target, "target", 20)
    };
}

/**
 * Reads the old policy URI targeted for Pinata unpinning.
 */
async function readPolicyUriRequest(request: Request): Promise<string> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    throw new Error("Expected a JSON request body");
  }

  const policyUri = (body as Record<string, unknown>).policyUri;
  if (typeof policyUri !== "string") {
    throw new Error("Expected policyUri");
  }

  return policyUri;
}

/**
 * Reads required strings and trims them once at the API boundary.
 */
function readRequiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Expected ${name}`);
  }

  return value.trim();
}

/**
 * Reads decimal strings as bigint so the JSON request never loses precision.
 */
function readBigIntString(value: unknown, name: string): bigint {
  const text = readRequiredText(value, name);
  if (!/^\d+$/u.test(text)) {
    throw new Error(`Expected ${name} to be a decimal string`);
  }

  return BigInt(text);
}

/**
 * Validates address and bytes32 fields before they reach shared hashing helpers.
 */
function readHex(value: unknown, name: string, bytes: 4 | 20 | 32): Hex {
  const text = readRequiredText(value, name);
  const pattern = bytes === 4 ? /^0x[0-9a-fA-F]{8}$/u : bytes === 20 ? /^0x[0-9a-fA-F]{40}$/u : /^0x[0-9a-fA-F]{64}$/u;
  if (!pattern.test(text)) {
    throw new Error(`Expected ${name} to be ${bytes === 4 ? "a selector" : bytes === 20 ? "an address" : "bytes32"}`);
  }

  return text as Hex;
}

/**
 * Keeps capabilities as a non-empty string list for the generated public policy document.
 */
function readStringList(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`Expected ${name}`);
  }

  return value.map((item) => item.trim());
}

/**
 * Defaults new registration metadata to active while allowing revocation to publish disabled metadata.
 */
function readPolicyStatus(value: unknown): "active" | "disabled" | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === "active" || value === "disabled") {
    return value;
  }

  throw new Error("Expected status to be active or disabled");
}

function readOptionalSwapPolicy(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!value || typeof value !== "object") {
    throw new Error("Expected swapPolicy");
  }
  const policy = value as Record<string, unknown>;
  return {
    allowedChainId: readBigIntString(policy.allowedChainId, "swapPolicy.allowedChainId"),
    allowedTokensIn: readHexList(policy.allowedTokensIn, "swapPolicy.allowedTokensIn"),
    allowedTokensOut: readHexList(policy.allowedTokensOut, "swapPolicy.allowedTokensOut"),
    deadlineSeconds: readBigIntString(policy.deadlineSeconds, "swapPolicy.deadlineSeconds"),
    enabled: policy.enabled !== false,
    maxAmountInWei: readBigIntString(policy.maxAmountInWei, "swapPolicy.maxAmountInWei"),
    maxSlippageBps: readBigIntString(policy.maxSlippageBps, "swapPolicy.maxSlippageBps"),
    recipient: readHex(policy.recipient, "swapPolicy.recipient", 20),
    router: readHex(policy.router, "swapPolicy.router", 20),
    selector: readHex(policy.selector, "swapPolicy.selector", 4)
  };
}

function readHexList(value: unknown, name: string): readonly Hex[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Expected ${name}`);
  }
  return value.map((item, index) => readHex(item, `${name}[${index}]`, 20));
}

/**
 * Returns concise API errors without leaking Pinata credentials or server internals.
 */
function policyMetadataErrorResponse(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Policy metadata generation failed";
  const isClientError = /^Expected/u.test(message);

  return NextResponse.json(
    {
      details: isClientError ? message : "Policy metadata generation failed",
      error: isClientError ? "InvalidPolicyMetadataRequest" : "PolicyMetadataError",
      status: "error"
    },
    { status: isClientError ? 400 : 500 }
  );
}
