import type { Hex } from "@agentpassport/config";
import { normalizeAddressInput } from "./addressInput.ts";
import { readMergedServerEnv, type ServerEnv } from "./serverEnv.ts";

export type AgentDirectoryConfig = {
  chainId: bigint;
  databasePath?: string;
  ensRegistryAddress: Hex;
  rpcUrl: string;
};

/**
 * Loads the server-side settings required to verify directory entries against ENS.
 */
export function loadAgentDirectoryConfig(env: ServerEnv = process.env): AgentDirectoryConfig {
  const mergedEnv = readMergedServerEnv(env);

  return {
    chainId: readChainId(mergedEnv, "NEXT_PUBLIC_CHAIN_ID"),
    databasePath: readOptional(mergedEnv, "AGENT_DIRECTORY_DB_PATH"),
    ensRegistryAddress: readAddress(mergedEnv, "NEXT_PUBLIC_ENS_REGISTRY"),
    rpcUrl: readUrl(mergedEnv, "RPC_URL")
  };
}

/**
 * Reads an optional env var and normalizes blank values to undefined.
 */
function readOptional(env: ServerEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Reads a required env var with a clear message for API responses.
 */
function readRequired(env: ServerEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

/**
 * Parses a public chain id for viem server clients.
 */
function readChainId(env: ServerEnv, name: string): bigint {
  const value = readRequired(env, name);
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new Error(`${name} must be a positive integer`);
  }

  return BigInt(value);
}

/**
 * Parses an EVM address from env without requiring checksum casing.
 */
function readAddress(env: ServerEnv, name: string): Hex {
  const address = normalizeAddressInput(readRequired(env, name));
  if (!address) {
    throw new Error(`${name} must be a 20-byte address`);
  }

  return address;
}

/**
 * Parses and canonicalizes the RPC URL used for ENS verification reads.
 */
function readUrl(env: ServerEnv, name: string): string {
  const value = readRequired(env, name);
  try {
    return new URL(value).toString().replace(/\/$/u, "");
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}
