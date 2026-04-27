import type { Hex } from "@agentpassport/config";
import {
  type IntentSubmissionStore,
  markIntentSubmissionSubmitted,
  releaseIntentSubmission
} from "./inflight.ts";

type ReceiptReader = {
  getTransactionReceipt: (input: { hash: Hex }) => Promise<{ status: string }>;
};

export type BroadcastReceiptReconciliation = "pending" | "reverted" | "submitted";

/**
 * Re-checks a previously broadcast transaction before rejecting a duplicate retry.
 */
export async function reconcileBroadcastReceipt(
  publicClient: ReceiptReader,
  reservationStore: IntentSubmissionStore,
  input: {
    agentNode: Hex;
    nonce: bigint;
    txHash: Hex;
  }
): Promise<BroadcastReceiptReconciliation> {
  let receipt: { status: string };
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: input.txHash });
  } catch {
    return "pending";
  }

  if (receipt.status === "success") {
    await markIntentSubmissionSubmitted({ ...input, store: reservationStore });
    return "submitted";
  }
  await releaseIntentSubmission({ ...input, store: reservationStore });
  return "reverted";
}
