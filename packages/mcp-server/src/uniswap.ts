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
  return {
    amount: request.amount,
    chainId: Number(request.chainId),
    slippageTolerance: Number(request.slippageBps),
    swapper: agentAddress,
    tokenIn: request.tokenIn,
    tokenOut: request.tokenOut,
    type: request.type ?? "EXACT_INPUT"
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

function normalizeAddress(value: Hex): Hex {
  return value.toLowerCase() as Hex;
}
