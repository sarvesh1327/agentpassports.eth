import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";
import { webEnv } from "./env";
import { readConfiguredChainId } from "./publicChain";
import { normalizePublicRpcUrl } from "./rpcUrl";

export const appChain = sepolia;

/**
 * Reads the public chain setting and fails loudly instead of silently switching away from Sepolia.
 */
export function requireSepoliaChainId(): number {
  return readConfiguredChainId(webEnv.chainId);
}

const configuredChainId = requireSepoliaChainId();
if (configuredChainId !== appChain.id) {
  throw new Error("NEXT_PUBLIC_CHAIN_ID must match the configured wagmi chain");
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
