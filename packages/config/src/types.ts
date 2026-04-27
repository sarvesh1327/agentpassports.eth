export type Hex = `0x${string}`;

export type TaskIntentMessage = {
  agentNode: Hex;
  target: Hex;
  callDataHash: Hex;
  value: bigint;
  nonce: bigint;
  expiresAt: bigint;
};

export type TaskIntentTypedData = {
  domain: {
    name: "AgentPolicyExecutor";
    version: "1";
    chainId: bigint;
    verifyingContract: Hex;
  };
  types: {
    TaskIntent: readonly [
      { readonly name: "agentNode"; readonly type: "bytes32" },
      { readonly name: "target"; readonly type: "address" },
      { readonly name: "callDataHash"; readonly type: "bytes32" },
      { readonly name: "value"; readonly type: "uint256" },
      { readonly name: "nonce"; readonly type: "uint256" },
      { readonly name: "expiresAt"; readonly type: "uint64" }
    ];
  };
  message: TaskIntentMessage;
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
