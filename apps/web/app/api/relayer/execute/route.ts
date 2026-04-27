import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "@agentpassport/config";
import {
  ADDR_RESOLVER_ABI,
  AGENT_POLICY_EXECUTOR_ABI,
  ENS_REGISTRY_ABI,
  type PolicyContractResult,
  policyFromContractResult
} from "../../../../lib/relayer/contracts";
import { loadRelayerConfig, type RelayerConfig } from "../../../../lib/relayer/config";
import { RelayerValidationError, relayerErrorResponse } from "../../../../lib/relayer/errors";
import { reserveIntentSubmission } from "../../../../lib/relayer/inflight";
import {
  ZERO_ADDRESS,
  parseRelayerExecuteRequest,
  validateRelayerExecution
} from "../../../../lib/relayer/validation";

export const runtime = "nodejs";

/**
 * Accepts a signed task intent, pre-checks it, and submits executor.execute.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const config = loadRelayerConfig();
    const payload = parseRelayerExecuteRequest(await readJsonBody(request));
    const chain = relayerChain(config);
    const transport = http(config.rpcUrl);
    const publicClient = createPublicClient({ chain, transport });
    const [policyResult, nextNonce, gasBudgetWei, resolverAddress, latestBlock] = await Promise.all([
      publicClient.readContract({
        address: config.executorAddress,
        abi: AGENT_POLICY_EXECUTOR_ABI,
        functionName: "policies",
        args: [payload.intent.agentNode]
      }),
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
    const resolvedAgentAddress = await readResolvedAgent(publicClient, resolverAddress as Hex, payload.intent.agentNode);
    const validated = validateRelayerExecution({
      context: {
        chainId: config.chainId,
        executorAddress: config.executorAddress,
        gasBudgetWei: gasBudgetWei as bigint,
        nextNonce: nextNonce as bigint,
        policy: policyFromContractResult(policyResult as PolicyContractResult),
        resolvedAgentAddress,
        resolverAddress: resolverAddress as Hex
      },
      now: latestBlock.timestamp,
      payload
    });
    const reservation = reserveIntentSubmission({
      agentNode: validated.intent.agentNode,
      nonce: validated.intent.nonce
    });
    if (reservation.status === "submitted") {
      return NextResponse.json({ status: "submitted", txHash: reservation.txHash });
    }
    if (reservation.status === "pending") {
      throw new RelayerValidationError(
        "IntentAlreadyPending",
        "A transaction for this agent nonce is already being relayed",
        409
      );
    }

    const account = privateKeyToAccount(config.relayerPrivateKey);
    const walletClient = createWalletClient({ account, chain, transport });
    let txHash: Hex;
    try {
      txHash = await walletClient.writeContract({
        address: config.executorAddress,
        abi: AGENT_POLICY_EXECUTOR_ABI,
        functionName: "execute",
        args: [validated.intent, validated.callData, validated.signature]
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        throw new RelayerValidationError("TransactionReverted", "Relayer transaction reverted", 502);
      }
      reservation.markSubmitted(txHash);
    } catch (error) {
      reservation.release();
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

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new RelayerValidationError("InvalidRequest", "Expected a JSON request body");
  }
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

function relayerChain(config: RelayerConfig) {
  const id = Number(config.chainId);
  return defineChain({
    id,
    name: id === 11155111 ? "Sepolia" : `Chain ${id}`,
    nativeCurrency: {
      decimals: 18,
      name: "Ether",
      symbol: "ETH"
    },
    rpcUrls: {
      default: {
        http: [config.rpcUrl]
      }
    }
  });
}
