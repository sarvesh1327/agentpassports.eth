import type { Hex, TaskIntentMessage } from "@agentpassport/config";

export type RelayerExecuteBody = {
  intent: {
    agentNode: unknown;
    target: unknown;
    callDataHash: unknown;
    value: unknown;
    nonce: unknown;
    expiresAt: unknown;
  };
  callData: unknown;
  signature: unknown;
};

export type RelayerExecutePayload = {
  intent: TaskIntentMessage;
  callData: Hex;
  signature: Hex;
};

export type RelayerPolicy = {
  ownerNode: Hex;
  ownerWallet: Hex;
  target: Hex;
  selector: Hex;
  maxValueWei: bigint;
  maxGasReimbursementWei: bigint;
  expiresAt: bigint;
  enabled: boolean;
};

export type RelayerPrecheckContext = {
  chainId: bigint;
  executorAddress: Hex;
  gasBudgetWei?: bigint;
  nextNonce: bigint;
  policy: RelayerPolicy;
  resolvedAgentAddress: Hex;
  resolverAddress: Hex;
};

export type ValidatedRelayerExecution = RelayerExecutePayload & {
  calldataHash: Hex;
  digest: Hex;
  recoveredSigner: Hex;
  selector: Hex;
};
