import { taskLogRecordTaskSelector, type Hex } from "@agentpassport/config";
import { encodeFunctionData, labelhash } from "viem";
import { AGENT_POLICY_EXECUTOR_ABI, ENS_REGISTRY_ABI, NAME_WRAPPER_ABI, PUBLIC_RESOLVER_ABI } from "./contracts.ts";
import { requireAddress, safeBigInt } from "./registerAgent.ts";
import type { PolicyContractResult } from "./contracts.ts";
import {
  OWNER_INDEX_AGENTS_KEY,
  OWNER_INDEX_VERSION,
  OWNER_INDEX_VERSION_KEY,
  addOwnerAgentLabel,
  serializeOwnerAgentIndex
} from "./ownerIndex.ts";

export type RegistrationBatchCall = {
  data: Hex;
  label: string;
  to: Hex;
  value?: bigint;
};

export type RegistrationBatch = {
  calls: RegistrationBatchCall[];
  summary: string[];
};

export type RegistrationBatchInput = {
  agentLabel: string;
  agentNode: Hex;
  connectedWallet: Hex;
  ensRegistryAddress?: Hex | null;
  existingGasBudgetWei?: bigint | null;
  existingPolicy?: PolicyContractResult | null;
  executorAddress: Hex;
  gasBudgetWei: string;
  isOwnerWrapped: boolean;
  maxGasReimbursementWei: string;
  maxValueWei: string;
  nameWrapperAddress?: Hex | null;
  normalizedAgentAddress: Hex;
  ownerAgentLabels?: readonly string[];
  ownerNode: Hex;
  ownerResolverAddress?: Hex | null;
  policyExpiresAt: string;
  publicResolverAddress: Hex;
  resolverAddress: Hex;
  shouldCreateSubnameRecord: boolean;
  taskLogAddress: Hex;
  textRecords: readonly { key: string; value: string }[];
};

/**
 * Builds the ordered wallet batch that registers an agent passport in one user approval.
 */
export function buildRegistrationBatch(input: RegistrationBatchInput): RegistrationBatch {
  const calls: RegistrationBatchCall[] = [];
  const summary: string[] = [];

  if (input.shouldCreateSubnameRecord) {
    calls.push(buildSubnameRecordCall(input));
    summary.push("setSubnodeRecord(owner ENS, agent label, connected wallet, public resolver)");
  }

  calls.push(buildResolverMulticall(input));
  summary.push(`multicall(setAddr, ${input.textRecords.length} text records)`);

  const policyCall = buildPolicyOrBudgetCall(input);
  if (policyCall) {
    calls.push(policyCall.call);
    summary.push(policyCall.summary);
  }

  const ownerIndexCall = buildOwnerIndexCall(input);
  if (ownerIndexCall) {
    calls.push(ownerIndexCall);
    summary.push("set owner index text records");
  }

  return { calls, summary };
}

/**
 * Encodes the ENS Registry or NameWrapper subname setup call based on the owner name state.
 */
function buildSubnameRecordCall(input: RegistrationBatchInput): RegistrationBatchCall {
  if (input.isOwnerWrapped) {
    return {
      data: encodeFunctionData({
        abi: NAME_WRAPPER_ABI,
        functionName: "setSubnodeRecord",
        args: [input.ownerNode, input.agentLabel, input.connectedWallet, input.publicResolverAddress, 0n, 0, 0n]
      }),
      label: "setSubnodeRecord",
      to: requireAddress(input.nameWrapperAddress, "NameWrapper address is not configured")
    };
  }

  return {
    data: encodeFunctionData({
      abi: ENS_REGISTRY_ABI,
      functionName: "setSubnodeRecord",
      args: [input.ownerNode, labelhash(input.agentLabel), input.connectedWallet, input.publicResolverAddress, 0n]
    }),
    label: "setSubnodeRecord",
    to: requireAddress(input.ensRegistryAddress, "ENS registry address is not configured")
  };
}

/**
 * Encodes all resolver record writes through PublicResolver.multicall to preserve resolver authorization.
 */
function buildResolverMulticall(input: RegistrationBatchInput): RegistrationBatchCall {
  // PublicResolver.multicall delegatecalls itself, so setAddr/setText still see the wallet as msg.sender.
  const resolverCalls = [
    encodeFunctionData({
      abi: PUBLIC_RESOLVER_ABI,
      functionName: "setAddr",
      args: [input.agentNode, input.normalizedAgentAddress]
    }),
    ...input.textRecords.map((record) =>
      encodeFunctionData({
        abi: PUBLIC_RESOLVER_ABI,
        functionName: "setText",
        args: [input.agentNode, record.key, record.value]
      })
    )
  ];

  return {
    data: encodeFunctionData({
      abi: PUBLIC_RESOLVER_ABI,
      functionName: "multicall",
      args: [resolverCalls]
    }),
    label: "multicall",
    to: input.resolverAddress
  };
}

/**
 * Encodes the owner-level dashboard index text writes when the owner resolver is known.
 */
function buildOwnerIndexCall(input: RegistrationBatchInput): RegistrationBatchCall | null {
  // The owner dashboard is ENS-index backed, so registration must not succeed without
  // writing agentpassports.v and agentpassports.agents on the owner resolver.
  const ownerResolverAddress = requireAddress(
    input.ownerResolverAddress,
    "Owner resolver address is required for owner dashboard index updates"
  );

  const nextLabels = addOwnerAgentLabel(input.ownerAgentLabels ?? [], input.agentLabel);
  const resolverCalls = [
    encodeFunctionData({
      abi: PUBLIC_RESOLVER_ABI,
      functionName: "setText",
      args: [input.ownerNode, OWNER_INDEX_VERSION_KEY, OWNER_INDEX_VERSION]
    }),
    encodeFunctionData({
      abi: PUBLIC_RESOLVER_ABI,
      functionName: "setText",
      args: [input.ownerNode, OWNER_INDEX_AGENTS_KEY, serializeOwnerAgentIndex(nextLabels)]
    })
  ];

  return {
    data: encodeFunctionData({
      abi: PUBLIC_RESOLVER_ABI,
      functionName: "multicall",
      args: [resolverCalls]
    }),
    label: "setOwnerIndex",
    to: ownerResolverAddress
  };
}

/**
 * Encodes policy creation and sends the initial gas budget as setPolicy msg.value.
 */
function buildPolicyCall(input: RegistrationBatchInput): RegistrationBatchCall {
  return {
    data: encodeFunctionData({
      abi: AGENT_POLICY_EXECUTOR_ABI,
      functionName: "setPolicy",
      args: [
        input.ownerNode,
        input.agentLabel,
        input.taskLogAddress,
        taskLogRecordTaskSelector(),
        safeBigInt(input.maxValueWei),
        safeBigInt(input.maxGasReimbursementWei),
        safeBigInt(input.policyExpiresAt)
      ]
    }),
    label: "setPolicy",
    to: input.executorAddress,
    value: requiredBudgetTopUp(input)
  };
}

/**
 * Encodes only the policy or budget change that is still missing from live executor state.
 */
function buildPolicyOrBudgetCall(input: RegistrationBatchInput): { call: RegistrationBatchCall; summary: string } | null {
  if (!policyMatchesDesiredInput(input) || input.existingPolicy?.[7] === false) {
    return {
      call: buildPolicyCall(input),
      summary: "setPolicy(..., with gas budget)"
    };
  }

  const topUpWei = requiredBudgetTopUp(input);
  if (topUpWei === 0n) {
    return null;
  }

  return {
    call: buildDepositGasBudgetCall(input, topUpWei),
    summary: "depositGasBudget(top up)"
  };
}

/**
 * Encodes a budget-only top-up when the live policy already matches the requested policy.
 */
function buildDepositGasBudgetCall(input: RegistrationBatchInput, topUpWei: bigint): RegistrationBatchCall {
  return {
    data: encodeFunctionData({
      abi: AGENT_POLICY_EXECUTOR_ABI,
      functionName: "depositGasBudget",
      args: [input.agentNode]
    }),
    label: "depositGasBudget",
    to: input.executorAddress,
    value: topUpWei
  };
}

/**
 * Returns the additional budget needed to reach the requested gas budget, not the full requested budget.
 */
function requiredBudgetTopUp(input: RegistrationBatchInput): bigint {
  const requestedBudgetWei = safeBigInt(input.gasBudgetWei);
  const existingBudgetWei = input.existingGasBudgetWei ?? 0n;

  return requestedBudgetWei > existingBudgetWei ? requestedBudgetWei - existingBudgetWei : 0n;
}

/**
 * Compares the live executor policy against the policy the registration form would create.
 */
function policyMatchesDesiredInput(input: RegistrationBatchInput): boolean {
  const policy = input.existingPolicy;
  if (!policy || policy[1] === "0x0000000000000000000000000000000000000000") {
    return false;
  }

  return (
    policy[0].toLowerCase() === input.ownerNode.toLowerCase() &&
    policy[2].toLowerCase() === input.taskLogAddress.toLowerCase() &&
    policy[3].toLowerCase() === taskLogRecordTaskSelector().toLowerCase() &&
    policy[4] === safeBigInt(input.maxValueWei) &&
    policy[5] === safeBigInt(input.maxGasReimbursementWei) &&
    policy[6] === safeBigInt(input.policyExpiresAt)
  );
}
