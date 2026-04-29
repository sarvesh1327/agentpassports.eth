import type { Hex, PolicySnapshot, TaskIntentMessage } from "@agentpassport/config";

export type RelayerExecuteBody = {
  intent: {
    agentNode: unknown;
    policyDigest: unknown;
    target: unknown;
    callDataHash: unknown;
    value: unknown;
    nonce: unknown;
    expiresAt: unknown;
  };
  policySnapshot: unknown;
  callData: unknown;
  signature: unknown;
};

export type RelayerExecutePayload = {
  intent: TaskIntentMessage;
  policySnapshot: PolicySnapshot;
  callData: Hex;
  signature: Hex;
};

export type RelayerPolicy = PolicySnapshot;

export type RelayerEnsPolicy = {
  digest: Hex;
  status: string;
};

export type RelayerPolicySnapshotBody = {
  target: Hex;
  selector: Hex;
  maxValueWei: unknown;
  maxGasReimbursementWei: unknown;
  expiresAt: unknown;
  enabled: boolean;
};

export type RelayerPrecheckContext = {
  chainId: bigint;
  executorAddress: Hex;
  gasBudgetWei?: bigint;
  nextNonce: bigint;
  ensPolicy: RelayerEnsPolicy;
  resolvedAgentAddress: Hex;
  resolverAddress: Hex;
};

export type ValidatedRelayerExecution = RelayerExecutePayload & {
  calldataHash: Hex;
  digest: Hex;
  policyDigest: Hex;
  recoveredSigner: Hex;
  selector: Hex;
};
