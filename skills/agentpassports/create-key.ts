#!/usr/bin/env node
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const DEFAULT_KEY_PATH = ".agentPassports/keys.txt";

/**
 * Agent-side Ethereum ECDSA secp256k1 key generator for AgentPassports.
 *
 * Download or copy this skill-provided helper into the agent's working
 * directory, install dependencies with `npm install viem tsx`, then run:
 *
 *   npx tsx create-key.ts
 *
 * It creates `.agentPassports/keys.txt`, writes one newly generated Ethereum
 * private key, protects the file with chmod 600, and prints only the public EVM
 * address that the user should register in the AgentPassports UI.
 *
 * Security rules:
 * - Do not commit `.agentPassports/keys.txt`.
 * - Do not paste the private key in chat.
 * - Do not send the private key to the MCP server.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  await assertKeyDoesNotAlreadyExist(args.keyPath, args.force);
  await mkdir(dirname(args.keyPath), { recursive: true });

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  await writeFile(args.keyPath, `${privateKey}\n`, { encoding: "utf8", flag: args.force ? "w" : "wx", mode: 0o600 });
  await chmod(args.keyPath, 0o600);

  console.log(
    JSON.stringify(
      {
        address: account.address,
        keyPath: args.keyPath,
        nextStep: "Register this public address in the AgentPassports UI. Keep .agentPassports/keys.txt private and do not commit it."
      },
      null,
      2
    )
  );
}

type Args = {
  force: boolean;
  keyPath: string;
};

function parseArgs(args: string[]): Args {
  return {
    force: args.includes("--force"),
    keyPath: readFlag(args, "--key") ?? DEFAULT_KEY_PATH
  };
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.findIndex((arg) => arg === flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function assertKeyDoesNotAlreadyExist(keyPath: string, force: boolean) {
  if (force) return;
  const existing = await readFile(keyPath, "utf8").catch(() => undefined);
  if (existing !== undefined) {
    throw new Error(`${keyPath} already exists. Refusing to overwrite an agent key without --force.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
