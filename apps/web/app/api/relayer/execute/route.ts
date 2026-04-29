import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, parseEventLogs, type TransactionReceipt } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ZERO_ADDRESS, type Hex } from "@agentpassport/config";
import {
  ADDR_RESOLVER_ABI,
  AGENT_POLICY_EXECUTOR_ABI,
  ENS_REGISTRY_ABI,
  TEXT_RESOLVER_ABI
} from "../../../../lib/relayer/contracts";
import { buildServerChain } from "../../../../lib/serverChain";
import { TASK_LOG_ABI } from "../../../../lib/contracts";
import { loadRelayerConfig } from "../../../../lib/relayer/config";
import { RelayerValidationError, relayerErrorResponse } from "../../../../lib/relayer/errors";
import {
  assertSufficientEstimatedExecutionBudget,
  estimateExecutionReimbursementWei
} from "../../../../lib/relayer/gasBudget";
import {
  createIntentSubmissionStore,
  reserveIntentSubmission
} from "../../../../lib/relayer/inflight";
import { reconcileBroadcastReceipt } from "../../../../lib/relayer/reconcile";
import {
  parseRelayerExecuteRequest,
  validateRelayerExecution
} from "../../../../lib/relayer/validation";
import { buildTaskRecord } from "../../../../lib/taskStore";
import { createSqliteTaskStore } from "../../../../lib/taskStoreSqlite";

export const runtime = "nodejs";

/**
 * Accepts a signed task intent, pre-checks it, and submits executor.execute.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const config = loadRelayerConfig();
    const payload = parseRelayerExecuteRequest(await readJsonBody(request));
    const chain = buildServerChain(config);
    const transport = http(config.rpcUrl);
    const publicClient = createPublicClient({ chain, transport });
    const account = privateKeyToAccount(config.relayerPrivateKey);
    const reservationStore = createIntentSubmissionStore(config.reservationStore);
    const [nextNonce, gasBudgetWei, resolverAddress, latestBlock] = await Promise.all([
      publicClient.readContract({
        address: config.executorAddress,
        abi: AGENT_POLICY_EXECUTOR_ABI,
        functionName: "nextNonce",
        args: [payload.intent.agentNode]
      }),
      publicClient.readContract({
        address: config.executorAddress,
        abi: AGENT_POLICY_EXECUTOR_ABI,
        functionName: "gasBudgetWei",
        args: [payload.intent.agentNode]
      }),
      publicClient.readContract({
        address: config.ensRegistryAddress,
        abi: ENS_REGISTRY_ABI,
        functionName: "resolver",
        args: [payload.intent.agentNode]
      }),
      publicClient.getBlock({ blockTag: "latest" })
    ]);
    const [resolvedAgentAddress, ensPolicy] = await Promise.all([
      readResolvedAgent(publicClient, resolverAddress as Hex, payload.intent.agentNode),
      readEnsPolicy(publicClient, resolverAddress as Hex, payload.intent.agentNode)
    ]);
    const validated = validateRelayerExecution({
      context: {
        chainId: config.chainId,
        executorAddress: config.executorAddress,
        gasBudgetWei: gasBudgetWei as bigint,
        nextNonce: nextNonce as bigint,
        ensPolicy,
        resolvedAgentAddress,
        resolverAddress: resolverAddress as Hex
      },
      now: latestBlock.timestamp,
      payload
    });
    await assertEstimatedBudget({
      account: account.address,
      gasBudgetWei: gasBudgetWei as bigint,
      payload: validated,
      publicClient,
      relayerConfig: config
    });
    const reservation = await reserveIntentSubmission({
      agentNode: validated.intent.agentNode,
      nonce: validated.intent.nonce,
      store: reservationStore
    });
    if (reservation.status === "submitted") {
      return NextResponse.json({ status: "submitted", txHash: reservation.txHash });
    }
    if (reservation.status === "pending") {
      if (reservation.txHash) {
        const reconciled = await reconcileBroadcastReceipt(
          publicClient,
          reservationStore,
          {
            agentNode: validated.intent.agentNode,
            nonce: validated.intent.nonce,
            txHash: reservation.txHash
          }
        );
        if (reconciled === "submitted") {
          return NextResponse.json({ status: "submitted", txHash: reservation.txHash });
        }
        if (reconciled === "reverted") {
          throw new RelayerValidationError("TransactionReverted", "Relayer transaction reverted", 502);
        }
      }

      const pendingDetails = reservation.txHash
        ? `A transaction for this agent nonce is already being relayed: ${reservation.txHash}`
        : "A transaction for this agent nonce is already being relayed";
      throw new RelayerValidationError(
        "IntentAlreadyPending",
        pendingDetails,
        409
      );
    }

    let txHash: Hex | undefined;
    try {
      const walletClient = createWalletClient({ account, chain, transport });
      txHash = await walletClient.writeContract({
        address: config.executorAddress,
        abi: AGENT_POLICY_EXECUTOR_ABI,
        functionName: "execute",
        args: [validated.intent, validated.policySnapshot, validated.callData, validated.signature]
      });
      await reservation.markBroadcast(txHash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        await reservation.release();
        throw new RelayerValidationError("TransactionReverted", "Relayer transaction reverted", 502);
      }
      await persistTaskReceipt(receipt);
      await reservation.markSubmitted(txHash);
    } catch (error) {
      if (!txHash) {
        await reservation.release();
      }
      throw error;
    }

    return NextResponse.json({ status: "submitted", txHash });
  } catch (error) {
    if (!(error instanceof RelayerValidationError)) {
      console.error("Relayer execute failed", error);
    }
    const response = relayerErrorResponse(error);
    return NextResponse.json(response.body, { status: response.httpStatus });
  }
}

async function persistTaskReceipt(receipt: TransactionReceipt): Promise<void> {
  try {
    const record = taskRecordFromReceipt(receipt);
    if (!record) {
      return;
    }

    const store = createSqliteTaskStore();
    try {
      store.upsert(record);
    } finally {
      store.close();
    }
  } catch (error) {
    console.error("Task history persistence failed", error);
  }
}

function taskRecordFromReceipt(receipt: TransactionReceipt) {
  const [taskLog] = parseEventLogs({
    abi: TASK_LOG_ABI,
    eventName: "TaskRecorded",
    logs: receipt.logs
  });
  if (!taskLog) {
    return null;
  }

  return buildTaskRecord({
    agentNode: taskLog.args.agentNode,
    metadataURI: taskLog.args.metadataURI,
    ownerNode: taskLog.args.ownerNode,
    taskHash: taskLog.args.taskHash,
    taskId: taskLog.args.taskId,
    timestamp: taskLog.args.timestamp,
    txHash: receipt.transactionHash
  });
}

async function assertEstimatedBudget(input: {
  account: Hex;
  gasBudgetWei: bigint;
  payload: ReturnType<typeof validateRelayerExecution>;
  publicClient: ReturnType<typeof createPublicClient>;
  relayerConfig: ReturnType<typeof loadRelayerConfig>;
}): Promise<void> {
  try {
    // Estimate the actual executor call before reserving the nonce so the cap is treated as a ceiling, not a debit.
    const [estimatedGas, gasPriceWei] = await Promise.all([
      input.publicClient.estimateContractGas({
        account: input.account,
        address: input.relayerConfig.executorAddress,
        abi: AGENT_POLICY_EXECUTOR_ABI,
        functionName: "execute",
        args: [input.payload.intent, input.payload.policySnapshot, input.payload.callData, input.payload.signature]
      }),
      input.publicClient.getGasPrice()
    ]);
    const estimatedReimbursementWei = estimateExecutionReimbursementWei({
      gasPriceWei,
      gasUsed: estimatedGas,
      reimbursementCapWei: input.payload.policySnapshot.maxGasReimbursementWei
    });

    assertSufficientEstimatedExecutionBudget({
      estimatedReimbursementWei,
      gasBudgetWei: input.gasBudgetWei,
      intentValueWei: input.payload.intent.value
    });
  } catch (error) {
    if (error instanceof RelayerValidationError) {
      throw error;
    }

    // RPC and simulation failures are relayer failures; only explicit budget checks report budget errors.
    throw error;
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new RelayerValidationError("InvalidRequest", "Expected a JSON request body");
  }
}

async function readEnsPolicy(
  publicClient: ReturnType<typeof createPublicClient>,
  resolverAddress: Hex,
  agentNode: Hex
): Promise<{ digest: Hex; status: string }> {
  if (resolverAddress.toLowerCase() === ZERO_ADDRESS) {
    return { digest: `0x${"00".repeat(32)}`, status: "" };
  }
  const [status, digest] = await Promise.all([
    publicClient.readContract({
      address: resolverAddress,
      abi: TEXT_RESOLVER_ABI,
      functionName: "text",
      args: [agentNode, "agent.status"]
    }),
    publicClient.readContract({
      address: resolverAddress,
      abi: TEXT_RESOLVER_ABI,
      functionName: "text",
      args: [agentNode, "agent.policy.digest"]
    })
  ]);
  return {
    digest: typeof digest === "string" && /^0x[0-9a-fA-F]{64}$/.test(digest) ? digest as Hex : `0x${"00".repeat(32)}`,
    status: typeof status === "string" ? status.trim() : ""
  };
}

async function readResolvedAgent(
  publicClient: ReturnType<typeof createPublicClient>,
  resolverAddress: Hex,
  agentNode: Hex
): Promise<Hex> {
  if (resolverAddress.toLowerCase() === ZERO_ADDRESS) {
    return ZERO_ADDRESS;
  }
  return publicClient.readContract({
    address: resolverAddress,
    abi: ADDR_RESOLVER_ABI,
    functionName: "addr",
    args: [agentNode]
  }) as Promise<Hex>;
}
