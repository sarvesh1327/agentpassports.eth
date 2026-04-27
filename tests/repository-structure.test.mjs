import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const hiddenWorkflowLabel = ["pha", "se"].join("");

// Read helpers fail with direct messages so scaffold regressions point at the missing path.
async function readText(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch {
    assert.fail(`Expected ${relativePath} to exist`);
  }
}

// Directory and file assertions intentionally avoid snapshots; the scaffold contract should stay explicit.
async function assertDirectory(relativePath) {
  try {
    const entry = await stat(path.join(root, relativePath));
    assert.equal(entry.isDirectory(), true, `${relativePath} should be a directory`);
  } catch {
    assert.fail(`Expected ${relativePath} to exist`);
  }
}

async function assertFile(relativePath) {
  try {
    const entry = await stat(path.join(root, relativePath));
    assert.equal(entry.isFile(), true, `${relativePath} should be a file`);
  } catch {
    assert.fail(`Expected ${relativePath} to exist`);
  }
}

// Recursively collect repository files while skipping generated or tool-owned directories.
async function collectFiles(directory, prefix = "") {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name);

    if (entry.name === ".git" || entry.name === ".next" || entry.name === "node_modules" || entry.name === "docs") {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path.join(directory, entry.name), relativePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

test("workspace metadata defines a strict pnpm monorepo", async () => {
  const packageJson = JSON.parse(await readText("package.json"));
  const workspace = await readText("pnpm-workspace.yaml");
  const tsconfig = JSON.parse(await readText("tsconfig.base.json"));
  const gitignore = await readText(".gitignore");

  assert.equal(packageJson.private, true);
  assert.equal(packageJson.packageManager.startsWith("pnpm@"), true);
  assert.equal(packageJson.scripts.test, "node --test tests/*.test.mjs");
  assert.match(workspace, /apps\/web/);
  assert.match(workspace, /packages\/config/);
  assert.match(workspace, /agent-runner/);
  assert.match(workspace, /contracts/);
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.match(gitignore, /\/docs\/\*/);
  assert.match(gitignore, /\.env/);
});

test("project scaffold includes the web app, contracts project, agent runner, and shared config package", async () => {
  await assertDirectory("apps/web/app");
  await assertDirectory("apps/web/lib");
  await assertFile("apps/web/package.json");
  await assertFile("apps/web/next.config.ts");
  await assertFile("apps/web/tsconfig.json");
  await assertFile("apps/web/app/layout.tsx");
  await assertFile("apps/web/app/page.tsx");

  await assertDirectory("contracts/src");
  await assertDirectory("contracts/test");
  await assertDirectory("contracts/script");
  await assertFile("contracts/foundry.toml");
  await assertFile("contracts/remappings.txt");

  await assertDirectory("agent-runner/src");
  await assertFile("agent-runner/package.json");
  await assertFile("agent-runner/tsconfig.json");
  await assertFile("agent-runner/src/index.ts");

  await assertDirectory("packages/config/src");
  await assertFile("packages/config/package.json");
  await assertFile("packages/config/src/index.ts");
});

test("environment templates document required variables for Sepolia-first development", async () => {
  const rootEnv = await readText(".env.example");
  const webEnv = await readText("apps/web/.env.example");
  const runnerEnv = await readText("agent-runner/.env.example");
  const contractsEnv = await readText("contracts/.env.example");

  for (const name of [
    "NEXT_PUBLIC_CHAIN_ID",
    "NEXT_PUBLIC_ENS_REGISTRY",
    "NEXT_PUBLIC_NAME_WRAPPER",
    "NEXT_PUBLIC_PUBLIC_RESOLVER",
    "NEXT_PUBLIC_EXECUTOR_ADDRESS",
    "NEXT_PUBLIC_TASK_LOG_ADDRESS",
    "RELAYER_PRIVATE_KEY",
    "RELAYER_RESERVATION_REDIS_REST_TOKEN",
    "RELAYER_RESERVATION_REDIS_REST_URL",
    "AGENT_PRIVATE_KEY",
  ]) {
    assert.match(rootEnv, new RegExp(`${name}=`), `${name} should be documented at the root`);
  }

  assert.match(webEnv, /NEXT_PUBLIC_CHAIN_ID=11155111/);
  assert.match(webEnv, /RELAYER_PRIVATE_KEY=/);
  assert.match(webEnv, /RELAYER_RESERVATION_REDIS_REST_URL=/);
  assert.match(webEnv, /RELAYER_RESERVATION_REDIS_REST_TOKEN=/);
  assert.match(runnerEnv, /RELAYER_URL=http:\/\/localhost:3000\/api\/relayer\/execute/);
  assert.match(runnerEnv, /CHAIN_ID=11155111/);
  assert.match(contractsEnv, /ENS_REGISTRY=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e/);
  assert.match(contractsEnv, /NAME_WRAPPER=0x0635513f179D50A207757E05759CbD106d7dFcE8/);
});

test("shared config exposes Sepolia address constants and README setup instructions", async () => {
  const constants = await readText("packages/config/src/constants.ts");
  const readme = await readText("README.md");

  assert.match(constants, /SEPOLIA_CHAIN_ID = 11155111/);
  assert.match(constants, /ENS_REGISTRY_ADDRESS/);
  assert.match(constants, /NAME_WRAPPER_ADDRESS/);
  assert.match(constants, /PUBLIC_RESOLVER_ADDRESS/);
  assert.match(constants, /DEFAULT_SEPOLIA_ADDRESSES/);

  assert.match(readme, /## Setup/);
  assert.match(readme, /pnpm install/);
  assert.match(readme, /pnpm test/);
  assert.match(readme, /forge test/);
  assert.match(readme, /pnpm --filter @agentpassport\/web dev/);
});

test("shared config keeps utilities split by responsibility", async () => {
  const modulePaths = [
    "packages/config/src/constants.ts",
    "packages/config/src/eip712.ts",
    "packages/config/src/ens.ts",
    "packages/config/src/hex.ts",
    "packages/config/src/keccak.ts",
    "packages/config/src/policy.ts",
    "packages/config/src/secp256k1.ts",
    "packages/config/src/types.ts",
  ];
  const barrel = await readText("packages/config/src/index.ts");

  for (const modulePath of modulePaths) {
    await assertFile(modulePath);
  }

  assert.equal(barrel.length < 800, true, "index.ts should stay a small public export barrel");
  assert.doesNotMatch(barrel, /KECCAK_ROUND_CONSTANTS/);
  assert.doesNotMatch(barrel, /SECP256K1_P/);
  assert.match(barrel, /export \* from "\.\/ens\.ts";/);
  assert.match(barrel, /export \* from "\.\/eip712\.ts";/);
  assert.match(barrel, /export \* from "\.\/policy\.ts";/);
});

test("repository-facing files do not expose staged workflow labels", async () => {
  const files = await collectFiles(".");
  // Construct the term dynamically so this guard can check for it without matching itself.
  const labelPattern = new RegExp(hiddenWorkflowLabel, "i");
  const offenders = [];

  for (const file of files) {
    if (file === "tests/repository-structure.test.mjs") {
      continue;
    }

    if (labelPattern.test(file)) {
      offenders.push(file);
      continue;
    }

    const text = await readText(file);
    if (labelPattern.test(text)) {
      offenders.push(file);
    }
  }

  assert.deepEqual(offenders, []);
});
