import type { Hex } from "@agentpassport/config";
import type { RegistrationBatch } from "./registrationBatch.ts";

export type RegistrationSendCallsRequest = {
  account: Hex;
  calls: readonly { data: Hex; to: Hex; value?: bigint }[];
  chainId: number;
  forceAtomic: true;
};

export type RegistrationSendTransactionRequest = {
  account: Hex;
  chainId: number;
  data: Hex;
  to: Hex;
  value?: bigint;
};

export type RegistrationSubmissionResult = {
  mode: "batch" | "sequential";
  transactionIds: string[];
};

export type RegistrationSubmissionInput = {
  account: Hex;
  batch: RegistrationBatch;
  call?: (request: RegistrationSendTransactionRequest) => Promise<unknown>;
  chainId: number;
  sendCalls: (request: RegistrationSendCallsRequest) => Promise<{ id: string }>;
  sendTransaction: (request: RegistrationSendTransactionRequest) => Promise<Hex>;
  waitForTransactionReceipt: (request: { hash: Hex }) => Promise<unknown>;
};

/**
 * Submits registration with atomic wallet batching when supported, then falls back to normal wallet transactions.
 */
export async function submitRegistrationBatch(input: RegistrationSubmissionInput): Promise<RegistrationSubmissionResult> {
  const calls = input.batch.calls.map((call) => ({
    data: call.data,
    label: call.label,
    to: call.to,
    value: call.value
  }));

  try {
    const result = await input.sendCalls({
      account: input.account,
      calls,
      chainId: input.chainId,
      forceAtomic: true
    });

    return {
      mode: "batch",
      transactionIds: [result.id]
    };
  } catch (error) {
    if (!isWalletSendCallsUnavailable(error)) {
      throw error;
    }
  }

  const transactionIds: string[] = [];
  for (const call of calls) {
    await preflightRegistrationCall(input.call, {
      account: input.account,
      chainId: input.chainId,
      data: call.data,
      to: call.to,
      value: call.value
    }, call.label);

    const hash = await input.sendTransaction({
      account: input.account,
      chainId: input.chainId,
      data: call.data,
      to: call.to,
      value: call.value
    });

    transactionIds.push(hash);
    await input.waitForTransactionReceipt({ hash });
  }

  return {
    mode: "sequential",
    transactionIds
  };
}

/**
 * Simulates a fallback transaction immediately before wallet signing so contract reverts become form errors.
 */
async function preflightRegistrationCall(
  call: RegistrationSubmissionInput["call"],
  request: RegistrationSendTransactionRequest,
  label: string
): Promise<void> {
  if (!call) {
    return;
  }

  try {
    await call(request);
  } catch (error) {
    throw new Error(readRegistrationPreflightMessage(error, label, request.data));
  }
}

/**
 * Converts low-level revert selectors into registration messages users can act on.
 */
function readRegistrationPreflightMessage(error: unknown, label: string, data: Hex): string {
  const message = readNestedErrorMessage(error);
  if (label === "setPolicy" || data.startsWith("0xd879609b")) {
    if (message.includes("0x42f058b4") || message.toLowerCase().includes("execution reverted")) {
      return "Connected wallet cannot set policy for this owner ENS. Make sure the connected wallet manages the owner ENS name, then try again.";
    }
  }

  return `Registration transaction "${label}" would fail before wallet signing: ${message || "Unexpected contract error"}`;
}

/**
 * Detects wallets/providers that do not implement the EIP-5792 wallet_sendCalls RPC method.
 */
export function isWalletSendCallsUnavailable(error: unknown): boolean {
  const message = readNestedErrorMessage(error).toLowerCase();

  return (
    message.includes("wallet_sendcalls") &&
    (
      message.includes("does not exist") ||
      message.includes("not available") ||
      message.includes("not supported") ||
      message.includes("unsupported") ||
      message.includes("method not found")
    )
  );
}

/**
 * Flattens viem/wallet error wrappers so fallback detection can match nested provider messages.
 */
function readNestedErrorMessage(error: unknown): string {
  const parts: string[] = [];
  let current = error;

  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (typeof current === "string") {
      parts.push(current);
      break;
    }

    if (typeof current !== "object") {
      parts.push(String(current));
      break;
    }

    const record = current as {
      cause?: unknown;
      details?: unknown;
      message?: unknown;
      shortMessage?: unknown;
    };

    for (const key of ["shortMessage", "message", "details"] as const) {
      if (typeof record[key] === "string") {
        parts.push(record[key]);
      }
    }

    current = record.cause;
  }

  return parts.join(" ");
}
