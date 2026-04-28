import type { Hex } from "@agentpassport/config";
import { encodeFunctionData, labelhash } from "viem";
import { ENS_REGISTRY_ABI, PUBLIC_RESOLVER_ABI, ZERO_ADDRESS } from "./contracts.ts";
import {
  OWNER_INDEX_AGENTS_KEY,
  OWNER_INDEX_VERSION,
  OWNER_INDEX_VERSION_KEY,
  removeOwnerAgentLabel,
  serializeOwnerAgentIndex
} from "./ownerIndex.ts";

export type AgentDeleteCall = {
  data: Hex;
  label: string;
  to: Hex;
};

export type AgentDeletePlan = {
  calls: AgentDeleteCall[];
  canDelete: boolean;
  reason: string | null;
};

export type AgentDeletePlanInput = {
  agentLabel: string;
  agentNode: Hex;
  ensRegistryAddress?: Hex | null;
  isOwnerWrapped: boolean;
  ownerAgentLabels: readonly string[];
  ownerNode: Hex;
  ownerResolverAddress?: Hex | null;
};

/**
 * Builds the real ENS deletion writes for an unwrapped subname plus owner dashboard index removal.
 */
export function buildAgentDeletePlan(input: AgentDeletePlanInput): AgentDeletePlan {
  if (input.isOwnerWrapped) {
    return {
      calls: [],
      canDelete: false,
      reason: "Wrapped owner names require NameWrapper deletion support before this UI can safely delete subnames."
    };
  }

  if (!input.ensRegistryAddress) {
    return { calls: [], canDelete: false, reason: "ENS registry address is not configured." };
  }

  if (!input.ownerResolverAddress) {
    return { calls: [], canDelete: false, reason: "Owner resolver is not configured for owner index updates." };
  }

  const labelsAfterDelete = removeOwnerAgentLabel(input.ownerAgentLabels, input.agentLabel);

  return {
    canDelete: true,
    reason: null,
    calls: [
      {
        data: encodeFunctionData({
          abi: ENS_REGISTRY_ABI,
          functionName: "setSubnodeRecord",
          args: [input.ownerNode, labelhash(input.agentLabel), ZERO_ADDRESS, ZERO_ADDRESS, 0n]
        }),
        label: "deleteSubname",
        to: input.ensRegistryAddress
      },
      {
        data: encodeFunctionData({
          abi: PUBLIC_RESOLVER_ABI,
          functionName: "multicall",
          args: [
            [
              encodeFunctionData({
                abi: PUBLIC_RESOLVER_ABI,
                functionName: "setText",
                args: [input.ownerNode, OWNER_INDEX_VERSION_KEY, OWNER_INDEX_VERSION]
              }),
              encodeFunctionData({
                abi: PUBLIC_RESOLVER_ABI,
                functionName: "setText",
                args: [input.ownerNode, OWNER_INDEX_AGENTS_KEY, serializeOwnerAgentIndex(labelsAfterDelete)]
              })
            ]
          ]
        }),
        label: "setOwnerIndex",
        to: input.ownerResolverAddress
      }
    ]
  };
}
