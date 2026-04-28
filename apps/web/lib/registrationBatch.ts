import { taskLogRecordTaskSelector, type Hex } from "@agentpassport/config";
import { encodeFunctionData, labelhash } from "viem";
import { AGENT_POLICY_EXECUTOR_ABI, ENS_REGISTRY_ABI, NAME_WRAPPER_ABI, PUBLIC_RESOLVER_ABI } from "./contracts.ts";
import { requireAddress, safeBigInt } from "./registerAgent.ts";

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
  executorAddress: Hex;
  gasBudgetWei: string;
  isOwnerWrapped: boolean;
  maxGasReimbursementWei: string;
  maxValueWei: string;
  nameWrapperAddress?: Hex | null;
  normalizedAgentAddress: Hex;
  ownerNode: Hex;
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

  calls.push(buildPolicyCall(input));
  summary.push("setPolicy(..., with gas budget)");

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
    value: safeBigInt(input.gasBudgetWei)
  };
}
