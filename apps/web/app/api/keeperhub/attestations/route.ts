import { homedir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { fetchKeeperHubAttestations } from "../../../../lib/keeperhubAttestations";
import { mergeNonEmptyEnv, readDotenvFile, readLocalServerFallbackEnv } from "../../../../lib/serverEnv";

export const runtime = "nodejs";

/**
 * Returns public, redacted KeeperHub run attestations for the Agent page.
 * The browser never receives KeeperHub API keys, signatures, functionArgs, or raw callData.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const agentName = url.searchParams.get("agentName") ?? undefined;
  const agentNode = url.searchParams.get("agentNode") ?? undefined;
  const limit = parseLimit(url.searchParams.get("limit"));
  const env = mergeNonEmptyEnv(
    readLocalServerFallbackEnv(),
    readDotenvFile(path.join(homedir(), ".agentPassports", "keeperhub.env")),
    process.env
  );
  const apiKey = env.KEEPERHUB_API_KEY;
  const workflowId = env.KEEPERHUB_WORKFLOW_ID;
  const apiBaseUrl = env.KEEPERHUB_API_BASE_URL ?? "https://app.keeperhub.com";

  if (!apiKey || !workflowId) {
    return NextResponse.json({
      attestations: [],
      details: "KeeperHub API key or KEEPERHUB_WORKFLOW_ID is not configured on the server.",
      status: "unconfigured"
    });
  }

  try {
    const attestations = await fetchKeeperHubAttestations({
      agentName,
      agentNode,
      apiBaseUrl,
      apiKey,
      limit,
      workflowId
    });

    return NextResponse.json({
      attestations,
      count: attestations.length,
      status: "ok",
      workflowId
    });
  } catch (error) {
    return NextResponse.json(
      {
        attestations: [],
        details: redactSecret(error instanceof Error ? error.message : "KeeperHub attestation request failed", apiKey),
        error: "KeeperHubAttestationRequestFailed",
        status: "error"
      },
      { status: 502 }
    );
  }
}

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function redactSecret(message: string, secret: string): string {
  return message.replaceAll(secret, "[redacted]");
}
