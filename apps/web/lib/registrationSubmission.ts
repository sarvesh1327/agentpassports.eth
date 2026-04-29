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
  gas?: bigint;
  to: Hex;
  value?: bigint;
};

export type RegistrationSubmissionResult = {
  finalized: boolean;
  mode: "batch" | "sequential";
  transactionIds: string[];
};

export type RegistrationCallsStatus = {
  receipts?: readonly { transactionHash?: Hex }[];
  status?: string;
};

export type RegistrationSubmissionInput = {
  account: Hex;
  batch: RegistrationBatch;
  call?: (request: RegistrationSendTransactionRequest) => Promise<unknown>;
  chainId: number;
  estimateGas?: (request: RegistrationSendTransactionRequest) => Promise<bigint>;
  sendCalls: (request: RegistrationSendCallsRequest) => Promise<{ id: string }>;
  sendTransaction: (request: RegistrationSendTransactionRequest) => Promise<Hex>;
  waitForCallsStatus?: (request: { id: string }) => Promise<RegistrationCallsStatus>;
  waitForTransactionReceipt: (request: { hash: Hex }) => Promise<unknown>;
};

const GAS_LIMIT_BUFFER_NUMERATOR = 120n;
const GAS_LIMIT_BUFFER_DENOMINATOR = 100n;
const GAS_LIMIT_BUFFER_FLOOR = 10_000n;

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

    return finalizeCallBatch(input.waitForCallsStatus, result.id);
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

    const request = {
      account: input.account,
      chainId: input.chainId,
      data: call.data,
      to: call.to,
      value: call.value
    };
    const hash = await input.sendTransaction({
      ...request,
      gas: await estimateBufferedGas(input.estimateGas, request)
    });

    transactionIds.push(hash);
    await input.waitForTransactionReceipt({ hash });
  }

  return {
    finalized: true,
    mode: "sequential",
    transactionIds
  };
}

/**
 * Waits for EIP-5792 wallet batches when the wallet exposes status tracking.
 */
async function finalizeCallBatch(
  waitForCallsStatus: RegistrationSubmissionInput["waitForCallsStatus"],
  id: string
): Promise<RegistrationSubmissionResult> {
  if (!waitForCallsStatus) {
    return {
      finalized: false,
      mode: "batch",
      transactionIds: [id]
    };
  }

  const result = await waitForCallsStatus({ id });
  if (result.status !== "success") {
    throw new Error("Registration batch did not finalize successfully");
  }

  const receiptHashes = (result.receipts ?? [])
    .map((receipt) => receipt.transactionHash)
    .filter((hash): hash is Hex => typeof hash === "string" && hash.startsWith("0x"));

  return {
    finalized: true,
    mode: "batch",
    transactionIds: receiptHashes.length > 0 ? receiptHashes : [id]
  };
}

/**
 * Uses the app's public RPC to give wallets a gas limit and avoid provider-side estimation failures.
 */
async function estimateBufferedGas(
  estimateGas: RegistrationSubmissionInput["estimateGas"],
  request: RegistrationSendTransactionRequest
): Promise<bigint | undefined> {
  if (!estimateGas) {
    return undefined;
  }

  const estimatedGas = await estimateGas(request);
  return (estimatedGas * GAS_LIMIT_BUFFER_NUMERATOR) / GAS_LIMIT_BUFFER_DENOMINATOR + GAS_LIMIT_BUFFER_FLOOR;
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
  if (label === "depositGasBudget") {
    if (message.includes("0x42f058b4") || message.toLowerCase().includes("execution reverted")) {
      return "Agent ENS subname must exist before funding its gas budget. Create or restore the subname, then try again.";
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
