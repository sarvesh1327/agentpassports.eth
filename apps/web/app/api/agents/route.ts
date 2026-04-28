import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import {
  getAgentAddress,
  getResolverAddress,
  type ContractReadClient,
  type Hex
} from "@agentpassport/config";
import {
  buildAgentDirectoryRecord,
  resolveVerifiedAgentDirectoryRecord,
  resolveVerifiedAgentDirectoryRecordsByOwner,
  type AgentDirectoryRecord
} from "../../../lib/agentDirectory";
import { loadAgentDirectoryConfig } from "../../../lib/agentDirectoryConfig";
import { createSqliteAgentDirectoryStore } from "../../../lib/agentDirectorySqlite";
import { buildServerChain } from "../../../lib/serverChain";

export const runtime = "nodejs";

/**
 * Looks up indexed agents by signer address or owner ENS, returning only records still verified by ENS.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const config = loadAgentDirectoryConfig();
    const searchParams = new URL(request.url).searchParams;
    const address = searchParams.get("address");
    const ownerName = searchParams.get("ownerName");
    const publicClient = createDirectoryPublicClient(config);
    const store = createSqliteAgentDirectoryStore({ databasePath: config.databasePath });

    try {
      if (ownerName) {
        const records = await resolveVerifiedAgentDirectoryRecordsByOwner({
          ownerName,
          readForwardAgentAddress: (candidate) =>
            readForwardAgentAddress({
              candidate,
              ensRegistryAddress: config.ensRegistryAddress,
              publicClient
            }),
          store
        });

        return NextResponse.json({
          agents: records.map(serializeAgentRecord),
          status: records.length > 0 ? "found" : "not_found"
        });
      }

      if (!address) {
        throw new Error("Expected address or ownerName");
      }

      const record = await resolveVerifiedAgentDirectoryRecord({
        agentAddress: address,
        readForwardAgentAddress: (candidate) =>
          readForwardAgentAddress({
            candidate,
            ensRegistryAddress: config.ensRegistryAddress,
            publicClient
          }),
        store
      });

      return NextResponse.json(record ? serializeRecord("found", record) : { status: "not_found" });
    } finally {
      store.close();
    }
  } catch (error) {
    return directoryErrorResponse(error);
  }
}

/**
 * Indexes a registered agent only after the live ENS resolver confirms the address record.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const config = loadAgentDirectoryConfig();
    const record = buildAgentDirectoryRecord(await readJsonBody(request));
    const publicClient = createDirectoryPublicClient(config);
    const verifiedAddress = await readForwardAgentAddress({
      candidate: record,
      ensRegistryAddress: config.ensRegistryAddress,
      publicClient
    });

    if (!verifiedAddress || verifiedAddress.toLowerCase() !== record.agentAddress.toLowerCase()) {
      return NextResponse.json(
        {
          details: "ENS addr(agent) does not match the submitted agent address",
          error: "ForwardEnsMismatch",
          status: "error"
        },
        { status: 409 }
      );
    }

    const store = createSqliteAgentDirectoryStore({ databasePath: config.databasePath });
    try {
      store.upsert(record);
    } finally {
      store.close();
    }

    return NextResponse.json(serializeRecord("indexed", record));
  } catch (error) {
    return directoryErrorResponse(error);
  }
}

/**
 * Reads and validates the JSON body shape used by register form indexing.
 */
async function readJsonBody(request: Request): Promise<{ agentAddress: string; agentName: string }> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    throw new Error("Expected a JSON request body");
  }

  const input = body as Record<string, unknown>;
  if (typeof input.agentAddress !== "string" || typeof input.agentName !== "string") {
    throw new Error("Expected agentAddress and agentName");
  }

  return {
    agentAddress: input.agentAddress,
    agentName: input.agentName
  };
}

/**
 * Builds a viem public client for the configured chain and RPC endpoint.
 */
function createDirectoryPublicClient(config: { chainId: bigint; rpcUrl: string }): ContractReadClient {
  return createPublicClient({
    chain: buildServerChain(config),
    transport: http(config.rpcUrl)
  }) as ContractReadClient;
}

/**
 * Resolves the candidate's current resolver and addr(node), keeping ENS as the source of truth.
 */
async function readForwardAgentAddress(input: {
  candidate: AgentDirectoryRecord;
  ensRegistryAddress: Hex;
  publicClient: ContractReadClient;
}): Promise<Hex | null> {
  const resolverAddress = await getResolverAddress({
    client: input.publicClient,
    ensRegistryAddress: input.ensRegistryAddress,
    node: input.candidate.agentNode
  });

  return getAgentAddress({
    agentNode: input.candidate.agentNode,
    client: input.publicClient,
    resolverAddress
  });
}

/**
 * Shapes API responses so the client never has to parse internal SQLite columns.
 */
function serializeRecord(status: "found" | "indexed", record: AgentDirectoryRecord) {
  return {
    ...serializeAgentRecord(record),
    status
  };
}

/**
 * Shapes one directory record for both single-address and owner-list API responses.
 */
function serializeAgentRecord(record: AgentDirectoryRecord) {
  return {
    agentAddress: record.agentAddress,
    agentName: record.agentName,
    agentNode: record.agentNode,
    ownerName: record.ownerName,
    updatedAt: record.updatedAt
  };
}

/**
 * Returns concise validation failures without exposing RPC URLs or server internals.
 */
function directoryErrorResponse(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Agent directory request failed";
  const validationError =
    /^Expected/u.test(message) ||
    /^Enter/u.test(message) ||
    /^Missing/u.test(message) ||
    /must be/u.test(message);

  return NextResponse.json(
    {
      details: validationError ? message : "Agent directory request failed",
      error: validationError ? "InvalidAgentDirectoryRequest" : "AgentDirectoryError",
      status: "error"
    },
    { status: validationError ? 400 : 500 }
  );
}
