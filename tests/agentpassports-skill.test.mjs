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

test("AgentPassports skill index describes the protocol and links the two operating skills", async () => {
  const skill = await readText("skills/agentpassports/SKILL.md");

  assert.match(skill, /AgentPassports/i);
  assert.match(skill, /ENS/i);
  assert.match(skill, /owner-defined policy/i);
  assert.match(skill, /key-setup\.md/i);
  assert.match(skill, /mcp-safety-flow\.md/i);
});

test("key setup skill teaches agent-owned key file setup and UI registration", async () => {
  const skill = await readText("skills/agentpassports/key-setup.md");

  assertMentionsAll(
    skill,
    [
      "\\.agentPassports/keys\\.txt",
      "private key",
      "Ethereum private key",
      "ECDSA|secp256k1",
      "create a new key pair",
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

test("MCP safety flow skill explains hosted/system MCP connection without agent-side chain config", async () => {
  const skill = await readText("skills/agentpassports/mcp-safety-flow.md");

  assertMentionsAll(
    skill,
    [
      "hosted MCP server|system MCP server",
      "localhost:3333/mcp",
      "only call tools",
      "do not configure.*RPC",
      "do not configure.*contract",
      "list.*tools",
      "resolve_agent_passport",
      "operator"
    ],
    "MCP connection instructions"
  );

  assert.doesNotMatch(skill, /mcpServers/i, "skill should not include local MCP client JSON config");
  assert.doesNotMatch(skill, /RPC_URL|ENS_REGISTRY|EXECUTOR_ADDRESS|TASK_LOG_ADDRESS|AGENT_PRIVATE_KEY/i, "skill should not ask agents to configure server env vars");
});

test("MCP safety flow skill teaches intent JSON signing script flow and submission via MCP", async () => {
  const skill = await readText("skills/agentpassports/mcp-safety-flow.md");

  assertMentionsAll(
    skill,
    [
      "build_task_intent",
      "intent JSON",
      "skills/agentpassports/sign-intent\\.ts",
      "download.*signing script",
      "npm install.*viem.*tsx",
      "\\.agentPassports/keys\\.txt",
      "sign.*intent",
      "signature",
      "submit_task",
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

test("fresh agent walkthrough explains the complete first-run flow", async () => {
  const walkthrough = await readText("skills/agentpassports/examples/fresh-agent-walkthrough.md");

  assertMentionsAll(
    walkthrough,
    [
      "create-key\.ts",
      "\.agentPassports/keys\.txt",
      "public address",
      "AgentPassports UI",
      "localhost:3333/mcp",
      "resolve_agent_passport",
      "get_agent_policy",
      "check_task_against_policy",
      "build_task_intent",
      "build-task-intent\.json",
      "npm install.*viem.*tsx",
      "sign-intent\.ts",
      "submit_task",
      "agent\.status.*active",
      "policy digest"
    ],
    "fresh agent walkthrough"
  );
});

test("MCP safety flow skill teaches exact AgentPassports MCP tool order and refusal conditions", async () => {
  const skill = await readText("skills/agentpassports/mcp-safety-flow.md");

  assertMentionsAll(
    skill,
    [
      "resolve_agent_passport",
      "get_agent_policy",
      "check_task_against_policy",
      "build_task_intent",
      "submit_task",
      "agent\\.status",
      "exactly.*active",
      "policy digest",
      "ENS signer",
      "must not sign",
      "relayer"
    ],
    "MCP safety flow skill"
  );

  assert.match(skill, /private key.*does not match|signer.*does not match/i, "MCP skill should reject mismatched signer keys");
  assert.match(skill, /outside.*policy|policy violation/i, "MCP skill should reject tasks outside policy");
  assert.match(skill, /digest mismatch/i, "MCP skill should reject policy digest mismatches");
});
