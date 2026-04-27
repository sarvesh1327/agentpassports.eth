import type { Hex } from "../../packages/config/src/index.ts";
import { assertHex, normalizeAddress } from "../../packages/config/src/hex.ts";

export type RunnerConfig = {
  agentPrivateKey: Hex;
  chainId: bigint;
  executorAddress: Hex;
  relayerUrl: string;
  rpcUrl: string;
  taskLogAddress: Hex;
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
    chainId: readChainId(env, "CHAIN_ID"),
    executorAddress: readAddress(env, "EXECUTOR_ADDRESS"),
    relayerUrl: readUrl(env, "RELAYER_URL"),
    rpcUrl: readUrl(env, "RPC_URL"),
    taskLogAddress: readAddress(env, "TASK_LOG_ADDRESS")
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

function readChainId(env: RunnerEnv, name: string): bigint {
  const value = readRequired(env, name);
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${name} must be a positive integer`);
  }
  return BigInt(value);
}

function readUrl(env: RunnerEnv, name: string): string {
  const value = readRequired(env, name);
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}
