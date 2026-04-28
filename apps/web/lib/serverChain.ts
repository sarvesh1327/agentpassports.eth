import { chainNameForId } from "@agentpassport/config";
import { defineChain } from "viem";

export type ServerChainConfig = {
  chainId: bigint;
  rpcUrl: string;
};

/**
 * Builds a viem chain object from runtime config so API routes never silently switch networks.
 */
export function buildServerChain(config: ServerChainConfig) {
  const id = Number(config.chainId);

  return defineChain({
    id,
    name: chainNameForId(config.chainId),
    nativeCurrency: {
      decimals: 18,
      name: "Ether",
      symbol: "ETH"
    },
    rpcUrls: {
      default: {
        http: [config.rpcUrl]
      }
    }
  });
}
