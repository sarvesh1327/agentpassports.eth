import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function assertMentionsAll(text, requiredPhrases, label) {
  for (const phrase of requiredPhrases) {
    assert.match(text, new RegExp(phrase, "i"), `${label} should mention ${phrase}`);
  }
}

function assertOmitsAll(text, forbiddenPhrases, label) {
  for (const phrase of forbiddenPhrases) {
    assert.doesNotMatch(text, new RegExp(phrase, "i"), `${label} should omit ${phrase}`);
  }
}

test("AgentPassports skill index documents the thin MCP / KeeperHub-authoritative model", async () => {
  const skill = await readText("skills/agentpassports/SKILL.md");

  assertMentionsAll(
    skill,
    [
      "AgentPassports",
      "owner-defined policy",
      "KeeperHub",
      "MCP server is intentionally thin",
      "build unsigned intent",
      "submit signed intent",
      "key-setup\\.md",
      "mcp-safety-flow\\.md",
      "create-key\\.ts.*not.*MCP tool",
      "sign-intent\\.ts"
    ],
    "skill index"
  );

  assertOmitsAll(
    skill,
    ["resolve_agent_passport", "get_agent_policy", "check_task_against_policy", "keeperhub_validate_agent_task", "uniswap_"],
    "skill index"
  );
});

test("key setup skill teaches script-owned keypair creation and no MCP keypair tool", async () => {
  const skill = await readText("skills/agentpassports/key-setup.md");

  assertMentionsAll(
    skill,
    [
      "\\.agentPassports/keys\\.txt",
      "private key",
      "Ethereum private key",
      "ECDSA|secp256k1",
      "create a new key pair",
      "create-key\\.ts",
      "not.*MCP tool|MCP server.*does not.*create",
      "public address",
      "ask the user",
      "complete setup",
      "UI",
      "chmod 600|owner-only",
      "must not.*commit"
    ],
    "key setup skill"
  );

  assert.doesNotMatch(skill, /AGENT_PRIVATE_KEY/i, "skill should not expose MCP server secret env vars to the agent");
  assert.doesNotMatch(skill, /RPC_URL|ENS_REGISTRY|EXECUTOR_ADDRESS|TASK_LOG_ADDRESS/i, "skill should not ask agents to configure server env vars");
});

test("MCP flow skill teaches build_task_intent, submit_task, then check_task_status", async () => {
  const skill = await readText("skills/agentpassports/mcp-safety-flow.md");

  assertMentionsAll(
    skill,
    [
      "hosted MCP server|system MCP server",
      "localhost:3333/mcp",
      "list.*tools",
      "build_task_intent",
      "submit_task",
      "check_task_status",
      "execution id",
      "KeeperHub-authoritative",
      "does.*not.*resolve ENS",
      "does.*not.*read.*policy",
      "does.*not.*check.*active status",
      "does.*not.*create keypairs",
      "KeeperHub performs Passport/Visa validation",
      "return KeeperHub"
    ],
    "MCP thin flow skill"
  );

  assertOmitsAll(
    skill,
    ["get_agent_policy", "check_task_against_policy", "keeperhub_validate_agent_task", "keeperhub_build_workflow_payload", "uniswap_"],
    "MCP thin flow skill"
  );
  assert.doesNotMatch(skill, /mcpServers/i, "skill should not include local MCP client JSON config");
  assert.doesNotMatch(skill, /RPC_URL|ENS_REGISTRY|EXECUTOR_ADDRESS|TASK_LOG_ADDRESS|AGENT_PRIVATE_KEY/i, "skill should not ask agents to configure server env vars");
});

test("AgentPassports skill docs explain owner-funded Uniswap swaps through the same thin MCP flow", async () => {
  const source = [
    await readText("skills/agentpassports/SKILL.md"),
    await readText("skills/agentpassports/mcp-safety-flow.md"),
    await readText("skills/agentpassports/sign-intent.ts")
  ].join("\n");

  assertMentionsAll(
    source,
    [
      "owner-funded Uniswap",
      "AgentEnsExecutor",
      "executeOwnerFundedERC20",
      "owner wallet holds `tokenIn` and approves `AgentEnsExecutor`",
      "agent wallet",
      "gas token or user funds",
      "build_task_intent",
      "callData",
      "SwapRouter02",
      "exactInputSingle",
      "sign-intent\\.ts",
      "submit_task",
      "ownerFundedErc20",
      "tokenIn",
      "amount",
      "swapContext",
      "tokenOut",
      "check_task_status"
    ],
    "owner-funded Uniswap MCP skill flow"
  );
  assert.doesNotMatch(source, /agent wallet.*approve Permit2/i);
  assert.doesNotMatch(source, /KEEPERHUB_API_KEY=kh_|RPC_URL=https:\/\//i);
});

test("MCP flow skill teaches local signing script and submission via MCP", async () => {
  const skill = await readText("skills/agentpassports/mcp-safety-flow.md");

  assertMentionsAll(
    skill,
    [
      "intent JSON",
      "skills/agentpassports/sign-intent\\.ts",
      "download.*signing script|copy.*signing script",
      "npm install.*viem.*tsx",
      "\\.agentPassports/keys\\.txt",
      "sign.*intent",
      "signature",
      "submit_task",
      "check_task_status",
      "via MCP",
      "do not paste.*private key.*chat"
    ],
    "intent signing flow"
  );
});

test("skill-owned signing script signs provided intent JSON with .agentPassports key file", async () => {
  const source = await readText("skills/agentpassports/sign-intent.ts");

  assert.match(source, /from "viem"/);
  assert.match(source, /from "viem\/accounts"/);
  assert.doesNotMatch(source, /@agentpassport\/config/);
  assert.match(source, /\.agentPassports\/keys\.txt/);
  assert.match(source, /privateKeyToAccount/);
  assert.match(source, /signTypedData/);
  assert.match(source, /hashTypedData/);
  assert.match(source, /bigintJsonReplacer/);
  assert.match(source, /JSON\.stringify\([\s\S]*bigintJsonReplacer/);
  assert.match(source, /intent JSON/i);
  assert.match(source, /signature/);
  assert.match(source, /download/i);
  assert.match(source, /Promise<`0x\$\{string\}`>/);
  assert.doesNotMatch(source, /Promise\s*\{/);
  assert.doesNotMatch(source, /process\.env/);
  assert.doesNotMatch(source, /AGENT_PRIVATE_KEY|AGENTPASSPORT_SIGNER_PRIVATE_KEY/);
  assert.doesNotMatch(source, /0x[0-9a-fA-F]{64}/, "skill script must not contain a hardcoded private key");
});

test("skill-owned create-key helper generates an Ethereum secp256k1 key file safely", async () => {
  const source = await readText("skills/agentpassports/create-key.ts");

  assert.match(source, /generatePrivateKey/);
  assert.match(source, /privateKeyToAccount/);
  assert.match(source, /\.agentPassports\/keys\.txt/);
  assert.match(source, /mkdir/);
  assert.match(source, /chmod/);
  assert.match(source, /0o600/);
  assert.match(source, /address/);
  assert.match(source, /must not.*commit|do not commit/i);
  assert.doesNotMatch(source, /process\.env/);
  assert.doesNotMatch(source, /@agentpassport\/config/);
  assert.doesNotMatch(source, /0x[0-9a-fA-F]{64}/, "create-key script must not contain a hardcoded private key");
});

test("fresh agent walkthrough explains the complete first-run thin MCP flow", async () => {
  const walkthrough = await readText("skills/agentpassports/examples/fresh-agent-walkthrough.md");

  assertMentionsAll(
    walkthrough,
    [
      "create-key\\.ts",
      "\\.agentPassports/keys\\.txt",
      "public address",
      "AgentPassports UI",
      "localhost:3333/mcp",
      "build_task_intent",
      "build-task-intent\\.json",
      "npm install.*viem.*tsx",
      "sign-intent\\.ts",
      "submit_task",
      "check_task_status",
      "KeeperHub performs Passport/Visa validation",
      "return KeeperHub"
    ],
    "fresh agent walkthrough"
  );

  assertOmitsAll(
    walkthrough,
    ["resolve_agent_passport", "get_agent_policy", "check_task_against_policy", "keeperhub_validate_agent_task", "uniswap_"],
    "fresh agent walkthrough"
  );
});

test("AgentPassports skill docs define the new local stop conditions", async () => {
  const flow = await readText("skills/agentpassports/mcp-safety-flow.md");
  const walkthrough = await readText("skills/agentpassports/examples/fresh-agent-walkthrough.md");
  const source = `${flow}\n${walkthrough}`;

  assertMentionsAll(
    source,
    [
      "MCP server is unavailable",
      "build_task_intent.*missing|missing.*build_task_intent",
      "submit_task.*missing|missing.*submit_task",
      "check_task_status.*missing|missing.*check_task_status",
      "local signing key file is missing",
      "signing script fails",
      "KeeperHub API configuration is missing",
      "Do.*not.*stop because MCP thinks ENS status/policy/action is invalid",
      "Do not paste.*KEEPERHUB_API_KEY|KEEPERHUB_API_KEY.*do not paste",
      "wallet secrets",
      "\\.agentPassports/keys\\.txt"
    ],
    "thin flow stop conditions"
  );

  assert.doesNotMatch(source, /kh_[A-Za-z0-9]/, "skill docs must not contain KeeperHub API keys");
});
