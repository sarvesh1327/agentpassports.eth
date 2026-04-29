import type { Hex } from "@agentpassport/config";
import { encodeFunctionData, labelhash } from "viem";
import { AGENT_ENS_EXECUTOR_ABI, ENS_REGISTRY_ABI, PUBLIC_RESOLVER_ABI, ZERO_ADDRESS } from "./contracts.ts";
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
  executorAddress?: Hex | null;
  gasBudgetWei?: bigint;
  isAgentWrapped?: boolean;
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

  if (input.isAgentWrapped) {
    return {
      calls: [],
      canDelete: false,
      reason: "Wrapped agent subnames require NameWrapper deletion support before this UI can safely delete subnames."
    };
  }

  if (!input.ensRegistryAddress) {
    return { calls: [], canDelete: false, reason: "ENS registry address is not configured." };
  }

  if (!input.ownerResolverAddress) {
    return { calls: [], canDelete: false, reason: "Owner resolver is not configured for owner index updates." };
  }

  const labelsAfterDelete = removeOwnerAgentLabel(input.ownerAgentLabels, input.agentLabel);
  const gasBudgetWei = input.gasBudgetWei ?? 0n;
  const executorAddress = input.executorAddress;
  const shouldWithdrawGasBudget = gasBudgetWei > 0n;

  if (shouldWithdrawGasBudget && !executorAddress) {
    return {
      calls: [],
      canDelete: false,
      reason: "Executor address is not configured for gas budget withdrawal before deletion."
    };
  }

  const withdrawGasBudget: AgentDeleteCall | null = shouldWithdrawGasBudget
    ? {
        data: encodeFunctionData({
          abi: AGENT_ENS_EXECUTOR_ABI,
          functionName: "withdrawGasBudget",
          args: [input.agentNode, gasBudgetWei]
        }),
        label: "withdrawGasBudget",
        to: executorAddress as Hex
      }
    : null;

  const deleteSubname = {
    data: encodeFunctionData({
      abi: ENS_REGISTRY_ABI,
      functionName: "setSubnodeRecord",
      args: [input.ownerNode, labelhash(input.agentLabel), ZERO_ADDRESS, ZERO_ADDRESS, 0n]
    }),
    label: "deleteSubname",
    to: input.ensRegistryAddress
  };
  const setOwnerIndex = {
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
  };

  return {
    canDelete: true,
    reason: null,
    // Executor-held ETH is not part of ENS state, so return it before deleting records.
    calls: withdrawGasBudget ? [withdrawGasBudget, deleteSubname, setOwnerIndex] : [deleteSubname, setOwnerIndex]
  };
}
