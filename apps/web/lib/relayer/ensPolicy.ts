import type { Hex } from "@agentpassport/config";
import { normalizeBytes32 } from "../../../../packages/config/src/hex.ts";

export type RelayerEnsPolicyRead = {
  digest: Hex;
  status: string;
};

/**
 * Normalizes resolver text records to match AgentEnsExecutor semantics.
 */
export function normalizeEnsPolicyRead(input: { digest: unknown; status: unknown }): RelayerEnsPolicyRead {
  return {
    digest: readPolicyDigest(input.digest),
    // AgentEnsExecutor hashes the raw status text, so the relayer must not trim it.
    status: typeof input.status === "string" ? input.status : ""
  };
}

function readPolicyDigest(value: unknown): Hex {
  if (typeof value !== "string" || !/^0[xX][0-9a-fA-F]{64}$/.test(value)) {
    return `0x${"00".repeat(32)}` as Hex;
  }

  return normalizeBytes32(`0x${value.slice(2)}` as Hex);
}
