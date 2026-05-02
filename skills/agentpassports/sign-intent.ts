#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { hashTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const DEFAULT_KEY_PATH = ".agentPassports/keys.txt";

/**
 * Agent-side AgentPassports intent signer.
 *
 * Download or copy this skill-provided script into the agent's signing working
 * directory. It signs intent JSON returned by the `build_task_intent` MCP tool
 * with the private key stored locally at `.agentPassports/keys.txt`.
 *
 * Install dependencies in that signing directory before running:
 *   npm install viem tsx
 *
 * Run:
 *   npx tsx sign-intent.ts --input build-task-intent.json
 *
 * Owner-funded Uniswap note: for a SwapRouter02 exactInputSingle flow, first
 * call MCP `build_task_intent` with the exact router `callData`, then use this
 * script unchanged to sign that returned typed data. Submit the signature via
 * MCP `submit_task` with public `ownerFundedErc20` (`tokenIn`, `amount`) and
 * `swapContext` (`tokenOut`, recipient/slippage/deadline metadata). This script
 * does not call KeeperHub, does not execute swaps, and does not check owner
 * allowance for `AgentEnsExecutor.executeOwnerFundedERC20`.
 *
 * Never paste the private key in chat. Never send `.agentPassports/keys.txt` to
 * the MCP server. The MCP server provides intent JSON; this script only signs it.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const privateKey = await readPrivateKey(args.keyPath);
  const account = privateKeyToAccount(privateKey);
  const buildIntentResponse = JSON.parse(await readFile(args.input, "utf8"));
  const typedData = readTypedData(buildIntentResponse);
  const signature = await account.signTypedData(typedData);
  const digest = hashTypedData(typedData);

  console.log(
    JSON.stringify(
      {
        digest,
        intent: buildIntentResponse.intent ?? buildIntentResponse.signingPayload?.intent,
        signer: account.address,
        signature,
        typedData
      },
      bigintJsonReplacer,
      2
    )
  );
}

type Args = {
  input: string;
  keyPath: string;
};

function parseArgs(args: string[]): Args {
  const input = readFlag(args, "--input") ?? readFlag(args, "-i") ?? args[0];
  const keyPath = readFlag(args, "--key") ?? DEFAULT_KEY_PATH;
  if (!input) {
    throw new Error("Usage: npx tsx sign-intent.ts --input build-task-intent.json [--key .agentPassports/keys.txt]");
  }
  return { input, keyPath };
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.findIndex((arg) => arg === flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readPrivateKey(keyPath: string): Promise<`0x${string}`> {
  const file = await readFile(keyPath, "utf8").catch((error) => {
    throw new Error(`Unable to read ${keyPath}. Create it during key setup and protect it with chmod 600. ${error}`);
  });
  const privateKey = file
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => /^0x[0-9a-fA-F]{64}$/u.test(line));
  if (!privateKey) {
    throw new Error(`${keyPath} must contain one 0x-prefixed 32-byte private key line`);
  }
  return privateKey as `0x${string}`;
}

function readTypedData(input: any) {
  const typedData = input.typedData ?? input.signingPayload?.typedData;
  if (!typedData?.domain || !typedData?.types || !typedData?.primaryType || !typedData?.message) {
    throw new Error("Expected intent JSON from build_task_intent with signingPayload.typedData");
  }
  return {
    domain: {
      ...typedData.domain,
      chainId: BigInt(typedData.domain.chainId)
    },
    primaryType: typedData.primaryType,
    types: typedData.types,
    message: normalizeTypedDataMessage(typedData.message)
  } as const;
}

function normalizeTypedDataMessage(message: any) {
  return {
    agentNode: assertBytes32(message.agentNode, "agentNode"),
    policyDigest: assertBytes32(message.policyDigest, "policyDigest"),
    target: assertAddress(message.target),
    callDataHash: assertBytes32(message.callDataHash, "callDataHash"),
    value: BigInt(message.value),
    nonce: BigInt(message.nonce),
    expiresAt: BigInt(message.expiresAt)
  };
}

function assertAddress(value: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/u.test(value)) throw new Error("Expected EVM address");
  return value as `0x${string}`;
}

function assertBytes32(value: string, label: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{64}$/u.test(value)) throw new Error(`Expected ${label} to be bytes32`);
  return value as `0x${string}`;
}

function bigintJsonReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
