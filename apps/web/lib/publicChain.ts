import { SEPOLIA_CHAIN_ID } from "@agentpassport/config";

export const PUBLIC_CHAIN_ID_ENV_NAME = "NEXT_PUBLIC_CHAIN_ID";

/**
 * Reads the public chain id and rejects unsupported networks before wagmi hooks can mix chains.
 */
export function readConfiguredChainId(value = process.env.NEXT_PUBLIC_CHAIN_ID): number {
  const configured = value?.trim() || String(SEPOLIA_CHAIN_ID);

  if (!/^[1-9][0-9]*$/u.test(configured)) {
    throw new Error(`${PUBLIC_CHAIN_ID_ENV_NAME} must be a positive integer`);
  }

  const chainId = Number(configured);
  if (!Number.isSafeInteger(chainId)) {
    throw new Error(`${PUBLIC_CHAIN_ID_ENV_NAME} is too large for browser chain configuration`);
  }
  if (chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(`${PUBLIC_CHAIN_ID_ENV_NAME} must be ${SEPOLIA_CHAIN_ID} for the current MVP`);
  }

  return chainId;
}
