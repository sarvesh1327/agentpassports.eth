import { ENS_REGISTRY_ADDRESS, type Hex } from "../../packages/config/src/index.ts";
import { assertHex, normalizeAddress } from "../../packages/config/src/hex.ts";

export type RunnerConfig = {
  agentName: string;
  agentPrivateKey: Hex;
  chainId: bigint;
  ensRegistryAddress: Hex;
  executorAddress: Hex;
  intentTtlSeconds: bigint;
  lastPayloadPath?: string;
  metadataURI: string;
  ownerName: string;
  relayerUrl: string;
  rpcUrl: string;
  taskLogAddress: Hex;
  taskDescription: string;
};

type RunnerEnv = Record<string, string | undefined>;

/**
 * Loads and validates the local agent runner environment.
 *
 * The returned shape is intentionally small: network clients can consume it
 * without reaching back into process.env or duplicating validation rules.
 */
export function loadRunnerConfig(env: RunnerEnv = process.env): RunnerConfig {
  return {
    agentPrivateKey: readPrivateKey(env, "AGENT_PRIVATE_KEY"),
    agentName: readEnsName(env, "AGENT_ENS_NAME"),
    chainId: readChainId(env, "CHAIN_ID"),
    ensRegistryAddress: readOptionalAddress(env, "ENS_REGISTRY", ENS_REGISTRY_ADDRESS),
    executorAddress: readAddress(env, "EXECUTOR_ADDRESS"),
    intentTtlSeconds: readOptionalPositiveBigInt(env, "INTENT_TTL_SECONDS", 600n),
    lastPayloadPath: readOptionalPath(env, "LAST_PAYLOAD_PATH"),
    metadataURI: readRequired(env, "METADATA_URI"),
    ownerName: readEnsName(env, "OWNER_ENS_NAME"),
    relayerUrl: readUrl(env, "RELAYER_URL"),
    rpcUrl: readUrl(env, "RPC_URL"),
    taskLogAddress: readAddress(env, "TASK_LOG_ADDRESS"),
    taskDescription: readRequired(env, "TASK_DESCRIPTION")
  };
}

function readRequired(env: RunnerEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function readPrivateKey(env: RunnerEnv, name: string): Hex {
  return assertHex(readRequired(env, name) as Hex, 32);
}

function readAddress(env: RunnerEnv, name: string): Hex {
  return normalizeAddress(readRequired(env, name) as Hex, "preserve");
}

function readOptionalAddress(env: RunnerEnv, name: string, fallback: Hex): Hex {
  const value = env[name]?.trim();
  return value ? normalizeAddress(value as Hex, "preserve") : fallback;
}

function readChainId(env: RunnerEnv, name: string): bigint {
  const value = readRequired(env, name);
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${name} must be a positive integer`);
  }
  return BigInt(value);
}

function readEnsName(env: RunnerEnv, name: string): string {
  const value = readRequired(env, name).toLowerCase();
  if (!value.includes(".") || value.split(".").some((label) => label.length === 0)) {
    throw new Error(`${name} must be a valid ENS name`);
  }
  return value;
}

function readOptionalPositiveBigInt(env: RunnerEnv, name: string, fallback: bigint): bigint {
  const value = env[name]?.trim();
  if (!value) {
    return fallback;
  }
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${name} must be a positive integer`);
  }
  return BigInt(value);
}

function readOptionalPath(env: RunnerEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

function readUrl(env: RunnerEnv, name: string): string {
  const value = readRequired(env, name);
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}
