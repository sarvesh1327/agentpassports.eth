import type { Hex } from "../../../../packages/config/src/index.ts";
import { assertHex, normalizeAddress } from "../../../../packages/config/src/hex.ts";
import {
  readLocalServerFallbackEnv,
  readMergedServerEnv,
  type ServerEnv
} from "../serverEnv.ts";
import { RelayerValidationError } from "./errors.ts";

export type RelayerConfig = {
  chainId: bigint;
  ensRegistryAddress: Hex;
  executorAddress: Hex;
  reservationStore: RelayerReservationStoreConfig;
  relayerPrivateKey: Hex;
  rpcUrl: string;
};

export type RelayerReservationStoreConfig =
  | {
      kind: "memory";
    }
  | {
      kind: "redisRest";
      token: string;
      url: string;
    };

type RelayerEnv = ServerEnv;

/**
 * Loads the server-only relayer settings needed by the API route.
 */
export function loadRelayerConfig(
  env: RelayerEnv = process.env,
  fallbackEnv: RelayerEnv = env === process.env ? readLocalServerFallbackEnv() : {}
): RelayerConfig {
  const mergedEnv = readMergedServerEnv(env, fallbackEnv);

  return {
    chainId: readChainId(mergedEnv, "NEXT_PUBLIC_CHAIN_ID"),
    ensRegistryAddress: readAddress(mergedEnv, "NEXT_PUBLIC_ENS_REGISTRY"),
    executorAddress: readAddress(mergedEnv, "NEXT_PUBLIC_EXECUTOR_ADDRESS"),
    reservationStore: readReservationStore(mergedEnv),
    relayerPrivateKey: readPrivateKey(mergedEnv, "RELAYER_PRIVATE_KEY"),
    rpcUrl: readUrl(mergedEnv, "RPC_URL")
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

function readOptional(env: RelayerEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function readReservationStore(env: RelayerEnv): RelayerReservationStoreConfig {
  const url = readOptional(env, "RELAYER_RESERVATION_REDIS_REST_URL");
  const token = readOptional(env, "RELAYER_RESERVATION_REDIS_REST_TOKEN");
  if (!url && !token) {
    if (env.NODE_ENV === "production") {
      throw new RelayerValidationError("MissingConfig", "Missing RELAYER_RESERVATION_REDIS_REST_URL", 500);
    }
    return { kind: "memory" };
  }
  if (!url) {
    throw new RelayerValidationError("MissingConfig", "Missing RELAYER_RESERVATION_REDIS_REST_URL", 500);
  }
  if (!token) {
    throw new RelayerValidationError("MissingConfig", "Missing RELAYER_RESERVATION_REDIS_REST_TOKEN", 500);
  }
  try {
    return {
      kind: "redisRest",
      token,
      url: new URL(url).toString().replace(/\/$/, "")
    };
  } catch {
    throw new RelayerValidationError("InvalidConfig", "RELAYER_RESERVATION_REDIS_REST_URL must be a valid URL", 500);
  }
}
