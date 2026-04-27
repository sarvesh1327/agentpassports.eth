import type { Hex, TaskIntentMessage } from "../../../../packages/config/src/index.ts";
import {
  hashCallData,
  hashTaskIntent,
  recoverSignerAddress
} from "../../../../packages/config/src/index.ts";
import {
  assertHex,
  assertUint64,
  assertUint256,
  normalizeAddress,
  normalizeBytes32,
  normalizeSelector
} from "../../../../packages/config/src/hex.ts";
import { RelayerValidationError } from "./errors.ts";
import type {
  RelayerExecuteBody,
  RelayerExecutePayload,
  RelayerPrecheckContext,
  ValidatedRelayerExecution
} from "./types.ts";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Normalizes a JSON relayer request into the bigint and hex types used onchain.
 */
export function parseRelayerExecuteRequest(body: unknown): RelayerExecutePayload {
  const request = readObject(body, "body") as Partial<RelayerExecuteBody>;
  const intent = readObject(request.intent, "intent");

  return {
    intent: {
      agentNode: normalizeBytes32(readHex(intent.agentNode, "intent.agentNode")),
      target: normalizeAddress(readHex(intent.target, "intent.target"), "preserve"),
      callDataHash: normalizeBytes32(readHex(intent.callDataHash, "intent.callDataHash")),
      value: readUint256(intent.value, "intent.value"),
      nonce: readUint256(intent.nonce, "intent.nonce"),
      expiresAt: readUint64(intent.expiresAt, "intent.expiresAt")
    },
    callData: readHex(request.callData, "callData"),
    signature: readHex(request.signature, "signature", 65)
  };
}

/**
 * Performs the relayer's gas-saving checks before submitting executor.execute.
 */
export function validateRelayerExecution(input: {
  context: RelayerPrecheckContext;
  now?: bigint;
  payload: RelayerExecutePayload;
}): ValidatedRelayerExecution {
  const { context, payload } = input;
  const now = input.now ?? BigInt(Math.floor(Date.now() / 1000));
  const calldataHash = hashCallData(payload.callData);

  if (calldataHash !== payload.intent.callDataHash) {
    throw new RelayerValidationError("BadCalldataHash", "Submitted calldata does not match intent.callDataHash");
  }
  if (now > payload.intent.expiresAt) {
    throw new RelayerValidationError("IntentExpired", "Signed intent is expired");
  }
  if (!context.policy.enabled) {
    throw new RelayerValidationError("PolicyDisabled", "Policy is disabled or does not exist");
  }
  if (now > context.policy.expiresAt) {
    throw new RelayerValidationError("PolicyExpired", "Policy is expired");
  }
  if (payload.intent.nonce !== context.nextNonce) {
    throw new RelayerValidationError("BadNonce", "Intent nonce does not match executor nextNonce");
  }
  if (!sameAddress(payload.intent.target, context.policy.target)) {
    throw new RelayerValidationError("TargetNotAllowed", "Intent target does not match the policy target");
  }

  const selector = selectorFromCalldata(payload.callData);
  if (selector !== context.policy.selector) {
    throw new RelayerValidationError("SelectorNotAllowed", "Calldata selector does not match the policy selector");
  }
  if (payload.intent.value > context.policy.maxValueWei) {
    throw new RelayerValidationError("ValueTooHigh", "Intent value exceeds the policy value cap");
  }
  if (isZeroAddress(context.resolverAddress)) {
    throw new RelayerValidationError("ResolverNotSet", "ENS resolver is not set for the agent node");
  }
  if (isZeroAddress(context.resolvedAgentAddress)) {
    throw new RelayerValidationError("AgentAddressNotSet", "ENS addr record is not set for the agent node");
  }

  const digest = hashTaskIntent(payload.intent, context.chainId, context.executorAddress);
  const recoveredSigner = recoverIntentSigner(digest, payload.signature);
  if (!sameAddress(recoveredSigner, context.resolvedAgentAddress)) {
    throw new RelayerValidationError("BadSignature", "Recovered signer does not match ENS-resolved agent address");
  }
  if (context.gasBudgetWei !== undefined && context.gasBudgetWei < payload.intent.value) {
    throw new RelayerValidationError("InsufficientGasBudget", "Gas budget cannot cover the intent value");
  }

  return {
    ...payload,
    calldataHash,
    digest,
    recoveredSigner,
    selector
  };
}

function readObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RelayerValidationError("InvalidRequest", `${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readHex(value: unknown, field: string, byteLength?: number): Hex {
  if (typeof value !== "string") {
    throw new RelayerValidationError("InvalidRequest", `${field} must be a hex string`);
  }
  try {
    return assertHex(value as Hex, byteLength);
  } catch (error) {
    const details = error instanceof Error ? error.message : "invalid hex";
    throw new RelayerValidationError("InvalidRequest", `${field}: ${details}`);
  }
}

function readUint256(value: unknown, field: string): bigint {
  const parsed = readUnsignedInteger(value, field);
  try {
    return assertUint256(parsed);
  } catch {
    throw new RelayerValidationError("InvalidRequest", `${field} is outside uint256 range`);
  }
}

function readUint64(value: unknown, field: string): bigint {
  const parsed = readUnsignedInteger(value, field);
  try {
    return assertUint64(parsed);
  } catch {
    throw new RelayerValidationError("InvalidRequest", `${field} is outside uint64 range`);
  }
}

function readUnsignedInteger(value: unknown, field: string): bigint {
  if (typeof value === "bigint" && value >= 0n) {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return BigInt(value);
  }
  throw new RelayerValidationError("InvalidRequest", `${field} must be a non-negative integer`);
}

function selectorFromCalldata(callData: Hex): Hex {
  if ((callData.length - 2) / 2 < 4) {
    throw new RelayerValidationError("SelectorNotAllowed", "Calldata must include a 4-byte selector");
  }
  return normalizeSelector(`0x${callData.slice(2, 10)}` as Hex);
}

function recoverIntentSigner(digest: Hex, signature: Hex): Hex {
  try {
    return recoverSignerAddress(digest, signature);
  } catch (error) {
    const details = error instanceof Error ? error.message : "signature recovery failed";
    throw new RelayerValidationError("BadSignature", details);
  }
}

function sameAddress(left: Hex, right: Hex): boolean {
  return normalizeAddress(left, "lower") === normalizeAddress(right, "lower");
}

function isZeroAddress(address: Hex): boolean {
  return normalizeAddress(address, "lower") === ZERO_ADDRESS;
}
