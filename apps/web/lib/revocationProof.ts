import type { Hex } from "@agentpassport/config";
import type { RelayerErrorCode } from "./relayer/errors.ts";

const REVOCATION_PROOF_ERROR_CODES: readonly RelayerErrorCode[] = [
  "PolicyDisabled",
  "BadSignature",
  "AgentAddressNotSet",
  "ResolverNotSet"
];

export type RelayerRetryResponse = {
  details?: string;
  error?: RelayerErrorCode | string;
  status?: string;
  txHash?: Hex;
};

/**
 * Returns a proof message only when the relayer rejected the retry for a revocation-specific reason.
 */
export function revocationFailureProof(response: RelayerRetryResponse): string | null {
  if (response.status !== "error" || !isRevocationProofError(response.error)) {
    return null;
  }
  return response.details ?? response.error;
}

function isRevocationProofError(error?: string): error is RelayerErrorCode {
  return Boolean(error && REVOCATION_PROOF_ERROR_CODES.includes(error as RelayerErrorCode));
}
