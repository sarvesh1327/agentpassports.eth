import { SEPOLIA_CHAIN_ID } from "@agentpassport/config";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";
import { webEnv } from "./env";
import { normalizePublicRpcUrl } from "./rpcUrl";

const CHAIN_ID_ENV_NAME = "NEXT_PUBLIC_CHAIN_ID";

export const appChain = sepolia;

/**
 * Reads the public chain setting and fails loudly instead of silently switching away from Sepolia.
 */
export function requireSepoliaChainId(): number {
  const configuredChainId = Number(webEnv.chainId ?? SEPOLIA_CHAIN_ID);
  if (configuredChainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(`${CHAIN_ID_ENV_NAME} must be ${SEPOLIA_CHAIN_ID} for the current MVP`);
  }
  return configuredChainId;
}

/**
 * Configures wallet access with an injected connector and the Sepolia transport used by browser reads.
 */
export const wagmiConfig = createConfig({
  chains: [appChain],
  connectors: [injected({ shimDisconnect: true })],
  ssr: true,
  transports: {
    [appChain.id]: http(normalizePublicRpcUrl(webEnv.publicRpcUrl))
  }
});
