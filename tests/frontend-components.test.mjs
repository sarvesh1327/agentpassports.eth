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
  const previewSource = await readText("apps/web/lib/ensPreview.ts");

  assert.match(source, /EnsProofPanel/);
  assert.match(`${source}\n${previewSource}`, /namehashEnsName/);
  assert.match(source, /buildDemoAgentProfile/);
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
  const demoSource = await readText("apps/web/lib/demoProfile.ts");
  const envSource = await readText("apps/web/lib/env.ts");
  const rootEnv = await readText(".env.example");
  const webEnv = await readText("apps/web/.env.example");
  const previewSource = `${pageSource}\n${demoSource}`;

  assert.match(pageSource, /AgentPassportCard/);
  assert.match(pageSource, /buildDemoAgentProfile/);
  assert.match(previewSource, /demoOwnerEns/);
  assert.match(previewSource, /agentpassports\.eth/);
  assert.match(previewSource, /assistant/);
  assert.doesNotMatch(previewSource, /Configure NEXT_PUBLIC_DEMO_OWNER_ENS/);
  assert.doesNotMatch(previewSource, /Configure NEXT_PUBLIC_DEMO_AGENT_ADDRESS/);
  assert.match(envSource, /demoOwnerEns/);
  assert.match(envSource, /demoAgentLabel/);
  assert.match(envSource, /demoAgentAddress/);
  for (const name of ["NEXT_PUBLIC_DEMO_OWNER_ENS", "NEXT_PUBLIC_DEMO_AGENT_LABEL", "NEXT_PUBLIC_DEMO_AGENT_ADDRESS"]) {
    assert.match(rootEnv, new RegExp(`${name}=`));
    assert.match(webEnv, new RegExp(`${name}=`));
  }
});

test("register page renders the ENS registration workflow", async () => {
  await assertFile("apps/web/app/register/page.tsx");
  await assertFile("apps/web/components/RegisterAgentForm.tsx");

  const pageSource = await readText("apps/web/app/register/page.tsx");
  const formSource = await readText("apps/web/components/RegisterAgentForm.tsx");
  const requiredText = [
    "Owner ENS",
    "Agent label",
    "Agent address",
    "Agent ENS",
    "Owner node",
    "Agent node",
    "Resolver",
    "Policy target",
    "TaskLog",
    "Policy hash",
    "Gas budget",
    "Metadata URI",
    "ENS text records",
    "Prepared transactions"
  ];

  assert.match(pageSource, /RegisterAgentForm/);
  assert.match(pageSource, /buildDemoAgentProfile/);
  assert.match(formSource, /export type RegisterAgentFormProps/);
  assert.match(formSource, /useState/);
  assert.match(formSource, /namehashEnsName/);
  assert.match(formSource, /computeSubnode/);
  assert.match(formSource, /agent\.policy\.hash/);
  assert.match(formSource, /setPolicy/);
  assert.match(formSource, /depositGasBudget/);
  for (const label of requiredText) {
    assert.match(formSource, new RegExp(label), `${label} should be rendered`);
  }
});

test("agent passport page exposes route-level ENS profile sections", async () => {
  await assertFile("apps/web/app/agent/[name]/page.tsx");

  const pageSource = await readText("apps/web/app/agent/[name]/page.tsx");
  const demoSource = await readText("apps/web/lib/demoProfile.ts");
  const viewSource = await readText("apps/web/components/AgentProfileView.tsx");
  const source = `${pageSource}\n${demoSource}\n${viewSource}`;
  const requiredText = [
    "AgentPassportCard",
    "EnsProofPanel",
    "decodeURIComponent",
    "ENS text records",
    "Policy state",
    "Gas budget",
    "Next nonce",
    "Task history",
    "agent.policy.hash",
    "agent.executor"
  ];

  for (const label of requiredText) {
    assert.match(source, new RegExp(label.replace(/[()]/g, "\\$&")), `${label} should be rendered`);
  }
});

test("web layout configures wallet providers for Sepolia", async () => {
  await assertFile("apps/web/components/Web3Providers.tsx");
  await assertFile("apps/web/components/WalletConnection.tsx");
  await assertFile("apps/web/lib/wagmiConfig.ts");

  const layoutSource = await readText("apps/web/app/layout.tsx");
  const providerSource = await readText("apps/web/components/Web3Providers.tsx");
  const walletSource = await readText("apps/web/components/WalletConnection.tsx");
  const configSource = await readText("apps/web/lib/wagmiConfig.ts");
  const packageSource = await readText("apps/web/package.json");

  assert.match(layoutSource, /@rainbow-me\/rainbowkit\/styles\.css/);
  assert.match(layoutSource, /Web3Providers/);
  assert.match(providerSource, /WagmiProvider/);
  assert.match(providerSource, /RainbowKitProvider/);
  assert.match(providerSource, /QueryClientProvider/);
  assert.match(walletSource, /ConnectButton/);
  assert.match(configSource, /sepolia/);
  assert.match(configSource, /createConfig/);
  assert.match(configSource, /injected/);
  assert.match(configSource, /NEXT_PUBLIC_CHAIN_ID/);
  assert.match(packageSource, /@tanstack\/react-query/);
});

test("register form resolves ENS ownership and submits wallet transactions", async () => {
  const formSource = await readText("apps/web/components/RegisterAgentForm.tsx");
  const contractsSource = await readText("apps/web/lib/contracts.ts");

  assert.match(formSource, /useAccount/);
  assert.match(formSource, /useEnsAddress/);
  assert.match(formSource, /useReadContract/);
  assert.match(formSource, /useWriteContract/);
  assert.match(formSource, /ownerResolvedAddress/);
  assert.match(formSource, /ownerManager/);
  assert.match(formSource, /writeContractAsync/);
  assert.match(formSource, /setAddr/);
  assert.match(formSource, /setText/);
  assert.match(formSource, /setPolicy/);
  assert.match(formSource, /depositGasBudget/);
  assert.match(formSource, /Registration submitted/);
  assert.match(contractsSource, /PUBLIC_RESOLVER_ABI/);
  assert.match(contractsSource, /AGENT_POLICY_EXECUTOR_ABI/);
});

test("agent page reads live ENS, policy, gas budget, and task history", async () => {
  await assertFile("apps/web/components/AgentProfileView.tsx");

  const pageSource = await readText("apps/web/app/agent/[name]/page.tsx");
  const viewSource = await readText("apps/web/components/AgentProfileView.tsx");
  const contractsSource = await readText("apps/web/lib/contracts.ts");
  const source = `${pageSource}\n${viewSource}\n${contractsSource}`;

  assert.match(pageSource, /serializeAgentProfile/);
  assert.match(viewSource, /useReadContract/);
  assert.match(viewSource, /useReadContracts/);
  assert.match(viewSource, /usePublicClient/);
  assert.match(viewSource, /getLogs/);
  assert.match(viewSource, /TaskRecorded/);
  assert.match(viewSource, /AGENT_TEXT_RECORD_KEYS/);
  assert.match(source, /ENS_REGISTRY_ABI/);
  assert.match(source, /PUBLIC_RESOLVER_ABI/);
  assert.match(source, /TASK_LOG_ABI/);
  assert.match(source, /gasBudgetWei/);
  assert.match(source, /nextNonce/);
});
