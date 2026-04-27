import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function assertFile(relativePath) {
  const entry = await stat(path.join(root, relativePath));
  assert.equal(entry.isFile(), true, `${relativePath} should be a file`);
}

test("ENS proof panel exposes the authorization facts required by the demo", async () => {
  await assertFile("apps/web/components/EnsProofPanel.tsx");

  const source = await readText("apps/web/components/EnsProofPanel.tsx");
  const requiredText = [
    "Owner ENS",
    "Owner node",
    "Agent ENS",
    "Agent node",
    "Resolver",
    "ENS addr(agent)",
    "Recovered signer",
    "Policy hash",
    "Policy enabled",
    "Gas budget",
    "Authorization result",
  ];

  assert.match(source, /export type EnsProofPanelProps/);
  assert.match(source, /authorizationStatus\?: "pass" \| "fail" \| "unknown"/);
  assert.match(source, /formatWei/);
  assert.match(source, /shortenHex/);
  for (const label of requiredText) {
    assert.match(source, new RegExp(label.replace(/[()]/g, "\\$&")), `${label} should be rendered`);
  }
});

test("home page includes an ENS proof panel preview", async () => {
  const source = await readText("apps/web/app/page.tsx");

  assert.match(source, /EnsProofPanel/);
  assert.match(source, /namehashEnsName/);
  assert.match(source, /webEnv/);
  assert.doesNotMatch(source, /alice\.eth/);
  assert.doesNotMatch(source, /0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512/);
  assert.doesNotMatch(source, /0xFCAd0B19bB29D4674531d6f115237E16AfCE377c/);
  assert.doesNotMatch(source, /Temporary shell/);
});

test("agent passport card exposes public profile and policy metadata", async () => {
  await assertFile("apps/web/components/AgentPassportCard.tsx");

  const source = await readText("apps/web/components/AgentPassportCard.tsx");
  const requiredText = ["Agent passport", "Agent ENS", "Status", "Capabilities", "Policy metadata"];

  assert.match(source, /export type AgentPassportCardProps/);
  assert.match(source, /capabilities: readonly string\[\]/);
  assert.match(source, /policyUri\?: string/);
  for (const label of requiredText) {
    assert.match(source, new RegExp(label), `${label} should be rendered`);
  }
});

test("home page includes a configurable agent passport preview", async () => {
  const pageSource = await readText("apps/web/app/page.tsx");
  const envSource = await readText("apps/web/lib/env.ts");
  const rootEnv = await readText(".env.example");
  const webEnv = await readText("apps/web/.env.example");

  assert.match(pageSource, /AgentPassportCard/);
  assert.match(pageSource, /NEXT_PUBLIC_DEMO_OWNER_ENS/);
  assert.match(pageSource, /agentpassports\.eth/);
  assert.match(pageSource, /assistant/);
  assert.doesNotMatch(pageSource, /Configure NEXT_PUBLIC_DEMO_OWNER_ENS/);
  assert.doesNotMatch(pageSource, /Configure NEXT_PUBLIC_DEMO_AGENT_ADDRESS/);
  assert.match(envSource, /demoOwnerEns/);
  assert.match(envSource, /demoAgentLabel/);
  assert.match(envSource, /demoAgentAddress/);
  for (const name of ["NEXT_PUBLIC_DEMO_OWNER_ENS", "NEXT_PUBLIC_DEMO_AGENT_LABEL", "NEXT_PUBLIC_DEMO_AGENT_ADDRESS"]) {
    assert.match(rootEnv, new RegExp(`${name}=`));
    assert.match(webEnv, new RegExp(`${name}=`));
  }
});
