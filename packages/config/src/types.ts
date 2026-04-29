export type Hex = `0x${string}`;

export type TaskIntentMessage = {
  agentNode: Hex;
  policyDigest: Hex;
  target: Hex;
  callDataHash: Hex;
  value: bigint;
  nonce: bigint;
  expiresAt: bigint;
};

export type TaskIntentTypedData = {
  domain: {
    name: "AgentEnsExecutor";
    version: "1";
    chainId: bigint;
    verifyingContract: Hex;
  };
  primaryType: "TaskIntent";
  types: {
    TaskIntent: readonly [
      { readonly name: "agentNode"; readonly type: "bytes32" },
      { readonly name: "policyDigest"; readonly type: "bytes32" },
      { readonly name: "target"; readonly type: "address" },
      { readonly name: "callDataHash"; readonly type: "bytes32" },
      { readonly name: "value"; readonly type: "uint256" },
      { readonly name: "nonce"; readonly type: "uint256" },
      { readonly name: "expiresAt"; readonly type: "uint64" }
    ];
  };
  message: TaskIntentMessage;
};

export type PolicySnapshot = {
  target: Hex;
  selector: Hex;
  maxValueWei: bigint;
  maxGasReimbursementWei: bigint;
  expiresAt: bigint;
  enabled: boolean;
};

export type PolicyMetadataInput = {
  ownerNode: Hex;
  agentNode: Hex;
  target: Hex;
  selector: Hex;
  maxValueWei: bigint;
  maxGasReimbursementWei: bigint;
  expiresAt: bigint;
};

export type PolicyMetadata = {
  agentNode: Hex;
  expiresAt: string;
  maxGasReimbursementWei: string;
  maxValueWei: string;
  ownerNode: Hex;
  selector: Hex;
  target: Hex;
};

export type SwapPolicy = {
  allowedChainId: bigint;
  allowedTokensIn: readonly Hex[];
  allowedTokensOut: readonly Hex[];
  deadlineSeconds: bigint;
  enabled: boolean;
  maxAmountInWei: bigint;
  maxSlippageBps: bigint;
  recipient: Hex;
  router: Hex;
  selector: Hex;
};

export type SwapPolicyMetadata = {
  allowedChainId: string;
  allowedTokensIn: readonly Hex[];
  allowedTokensOut: readonly Hex[];
  deadlineSeconds: string;
  enabled: boolean;
  maxAmountInWei: string;
  maxSlippageBps: string;
  recipient: Hex;
  router: Hex;
  schema: "agentpassport.swapPolicy.v2";
  selector: Hex;
};

export type LatestBlock = {
  timestamp: bigint;
};
