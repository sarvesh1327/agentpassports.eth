import type { Hex, SwapPolicy } from "@agentpassport/sdk";

export type UniswapRuntimeConfig = {
  apiBaseUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

export type SwapRequest = {
  amount: string;
  chainId: number | string;
  slippageBps: number | string;
  tokenIn: Hex;
  tokenOut: Hex;
  type?: string;
};

export type ApprovalRequest = {
  amount: string;
  chainId: number | string;
  token: Hex;
};

export type ExecuteSwapRequest = SwapRequest & {
  permit2Signature?: Hex;
  quote: Record<string, unknown>;
  quoteId?: string;
};

const DEFAULT_UNISWAP_API_BASE_URL = "https://api.uniswap.org/v1";
const DEFAULT_QUOTE_PROTOCOLS = ["UNISWAPX_V2", "V4", "V3", "V2"] as const;

/**
 * Validates agent-requested swap fields against ENS-published Uniswap policy.
 */
export function validateSwapRequestAgainstPolicy(request: SwapRequest, policy: SwapPolicy) {
  const chainAllowed = BigInt(request.chainId) === policy.allowedChainId;
  const tokenIn = normalizeAddress(request.tokenIn);
  const tokenOut = normalizeAddress(request.tokenOut);
  const tokenInAllowed = policy.allowedTokensIn.map(normalizeAddress).includes(tokenIn);
  const tokenOutAllowed = policy.allowedTokensOut.map(normalizeAddress).includes(tokenOut);
  const amountAllowed = BigInt(request.amount) <= policy.maxAmountInWei;
  const slippageAllowed = BigInt(request.slippageBps) <= policy.maxSlippageBps;

  return {
    allowed: policy.enabled && chainAllowed && tokenInAllowed && tokenOutAllowed && amountAllowed && slippageAllowed,
    amountAllowed,
    chainAllowed,
    policy,
    policyEnabled: policy.enabled,
    slippageAllowed,
    tokenInAllowed,
    tokenOutAllowed
  };
}

export async function callUniswapApi(path: string, payload: Record<string, unknown>, config: UniswapRuntimeConfig = {}) {
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = (config.apiBaseUrl ?? DEFAULT_UNISWAP_API_BASE_URL).replace(/\/$/u, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.apiKey) {
    headers["x-api-key"] = config.apiKey;
  }

  const response = await fetchImpl(`${baseUrl}${path}`, {
    body: JSON.stringify(payload),
    headers,
    method: "POST"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body?.detail === "string" ? body.detail : `Uniswap API failed with HTTP ${response.status}`);
  }
  return body;
}

export function buildUniswapQuotePayload(agentAddress: Hex, request: SwapRequest) {
  const chainId = Number(request.chainId);
  return {
    amount: request.amount,
    autoSlippage: undefined,
    // The Uniswap API expects percentage slippage, while AgentPassports policy
    // stores basis points because bps are easier to compare deterministically.
    slippageTolerance: Number(request.slippageBps) / 100,
    generatePermitAsTransaction: false,
    permitAmount: "FULL",
    protocols: [...DEFAULT_QUOTE_PROTOCOLS],
    routingPreference: "BEST_PRICE",
    spreadOptimization: "EXECUTION",
    swapper: agentAddress,
    tokenIn: request.tokenIn,
    tokenInChainId: chainId,
    tokenOut: request.tokenOut,
    tokenOutChainId: chainId,
    type: request.type ?? "EXACT_INPUT",
    urgency: "normal"
  };
}

export function buildUniswapApprovalPayload(agentAddress: Hex, request: ApprovalRequest) {
  return {
    amount: request.amount,
    chainId: Number(request.chainId),
    token: request.token,
    walletAddress: agentAddress
  };
}

export function normalizeUniswapQuoteResponse(response: Record<string, any>) {
  const quote = response.quote && typeof response.quote === "object" ? response.quote : {};
  return {
    gasFee: typeof quote.gasFee === "string" ? quote.gasFee : undefined,
    quoteId: typeof quote.quoteId === "string" ? quote.quoteId : undefined,
    requestId: typeof response.requestId === "string" ? response.requestId : undefined,
    routeString: typeof quote.routeString === "string" ? quote.routeString : undefined,
    routing: typeof response.routing === "string" ? response.routing : undefined
  };
}

export function normalizeUniswapSwapResponse(response: Record<string, any>) {
  return {
    orderId: typeof response.orderId === "string" ? response.orderId : undefined,
    requestId: typeof response.requestId === "string" ? response.requestId : undefined,
    txHash: typeof response.txHash === "string" ? response.txHash : undefined,
    transaction: response.transaction && typeof response.transaction === "object" ? response.transaction : undefined
  };
}

export function buildSwapProofMetadata(input: {
  agentName: string;
  agentNode: Hex;
  amount: string;
  chainId: number | string;
  policyDigest: Hex;
  quoteId?: string;
  requestId?: string;
  routing?: string;
  tokenIn: Hex;
  tokenOut: Hex;
  txHashOrOrderId?: string;
}) {
  return {
    agentName: input.agentName.trim().toLowerCase(),
    agentNode: input.agentNode.toLowerCase() as Hex,
    amount: input.amount,
    chainId: input.chainId.toString(),
    policyDigest: input.policyDigest.toLowerCase() as Hex,
    quoteId: input.quoteId,
    requestId: input.requestId,
    routing: input.routing,
    schema: "agentpassport.uniswapSwapProof.v2" as const,
    tokenIn: normalizeAddress(input.tokenIn),
    tokenOut: normalizeAddress(input.tokenOut),
    txHashOrOrderId: input.txHashOrOrderId
  };
}

function normalizeAddress(value: Hex): Hex {
  return value.toLowerCase() as Hex;
}
