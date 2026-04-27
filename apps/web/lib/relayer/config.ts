import type { Hex } from "@agentpassport/config";
import { assertHex, normalizeAddress } from "@agentpassport/config";
import { RelayerValidationError } from "./errors";

export type RelayerConfig = {
  chainId: bigint;
  ensRegistryAddress: Hex;
  executorAddress: Hex;
  relayerPrivateKey: Hex;
  rpcUrl: string;
};

type RelayerEnv = Record<string, string | undefined>;

/**
 * Loads the server-only relayer settings needed by the API route.
 */
export function loadRelayerConfig(env: RelayerEnv = process.env): RelayerConfig {
  return {
    chainId: readChainId(env, "NEXT_PUBLIC_CHAIN_ID"),
    ensRegistryAddress: readAddress(env, "NEXT_PUBLIC_ENS_REGISTRY"),
    executorAddress: readAddress(env, "NEXT_PUBLIC_EXECUTOR_ADDRESS"),
    relayerPrivateKey: readPrivateKey(env, "RELAYER_PRIVATE_KEY"),
    rpcUrl: readUrl(env, "RPC_URL")
  };
}

function readRequired(env: RelayerEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new RelayerValidationError("MissingConfig", `Missing ${name}`, 500);
  }
  return value;
}

function readAddress(env: RelayerEnv, name: string): Hex {
  try {
    return normalizeAddress(readRequired(env, name) as Hex, "preserve");
  } catch (error) {
    if (error instanceof RelayerValidationError) {
      throw error;
    }
    throw new RelayerValidationError("InvalidConfig", `${name} must be a 20-byte address`, 500);
  }
}

function readPrivateKey(env: RelayerEnv, name: string): Hex {
  try {
    return assertHex(readRequired(env, name) as Hex, 32);
  } catch (error) {
    if (error instanceof RelayerValidationError) {
      throw error;
    }
    throw new RelayerValidationError("InvalidConfig", `${name} must be a 32-byte private key`, 500);
  }
}

function readChainId(env: RelayerEnv, name: string): bigint {
  const value = readRequired(env, name);
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new RelayerValidationError("InvalidConfig", `${name} must be a positive integer`, 500);
  }
  const chainId = BigInt(value);
  if (chainId > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RelayerValidationError("InvalidConfig", `${name} is too large for viem chain configuration`, 500);
  }
  return chainId;
}

function readUrl(env: RelayerEnv, name: string): string {
  const value = readRequired(env, name);
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new RelayerValidationError("InvalidConfig", `${name} must be a valid URL`, 500);
  }
}
