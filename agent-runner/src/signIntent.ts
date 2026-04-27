import type { Hex, TaskIntentMessage, TaskIntentTypedData } from "../../packages/config/src/index.ts";
import {
  buildTaskIntentTypedData,
  hashTaskIntent,
  recoverSignerAddress
} from "../../packages/config/src/index.ts";
import { normalizeAddress } from "../../packages/config/src/hex.ts";

export type TaskIntentSigner = (typedData: TaskIntentTypedData) => Hex | Promise<Hex>;

export type SignTaskIntentInput = {
  chainId: bigint;
  executorAddress: Hex;
  expectedSigner?: Hex;
  intent: TaskIntentMessage;
  signTypedData: TaskIntentSigner;
};

export type SignedTaskIntent = {
  digest: Hex;
  intent: TaskIntentMessage;
  recoveredSigner: Hex;
  signature: Hex;
  typedData: TaskIntentTypedData;
};

/**
 * Builds EIP-712 typed data, delegates signing, and verifies the signer.
 *
 * The signer is injected so production can use viem/private-key accounts while
 * tests can provide fixed signatures without depending on wallet libraries.
 */
export async function signTaskIntent(input: SignTaskIntentInput): Promise<SignedTaskIntent> {
  const typedData = buildTaskIntentTypedData(input.intent, input.chainId, input.executorAddress);
  const signature = await input.signTypedData(typedData);
  const digest = hashTaskIntent(typedData.message, input.chainId, input.executorAddress);
  const recoveredSigner = recoverSignerAddress(digest, signature);

  if (input.expectedSigner && !sameAddress(recoveredSigner, input.expectedSigner)) {
    throw new Error("Signature does not match expected agent signer");
  }

  return {
    digest,
    intent: typedData.message,
    recoveredSigner,
    signature,
    typedData
  };
}

function sameAddress(left: Hex, right: Hex): boolean {
  return normalizeAddress(left, "lower") === normalizeAddress(right, "lower");
}
