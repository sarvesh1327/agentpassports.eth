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
  assert.doesNotMatch(configSource, /sepolia\.gateway\.tenderly\.co/);
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
  assert.match(formSource, /validateRegistrationInput/);
  assert.match(formSource, /Agent label is required/);
  assert.ok(
    formSource.indexOf("validateRegistrationInput") < formSource.indexOf("setAddr"),
    "registration input should be validated before resolver writes",
  );
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
  assert.match(viewSource, /agentAddressReadSettled/);
  assert.doesNotMatch(
    viewSource,
    /nonZeroAddress\(agentAddress\.data as Hex \| undefined\) \?\? initialProfile\.agentAddress/,
    "live zero ENS addr reads must not fall back to stale demo signer addresses",
  );
});

test("run page signs task intents and submits them to the relayer", async () => {
  await assertFile("apps/web/app/run/page.tsx");
  await assertFile("apps/web/components/RunTaskDemo.tsx");
  await assertFile("apps/web/lib/taskDemo.ts");

  const pageSource = await readText("apps/web/app/run/page.tsx");
  const componentSource = await readText("apps/web/components/RunTaskDemo.tsx");
  const helperSource = await readText("apps/web/lib/taskDemo.ts");
  const source = `${pageSource}\n${componentSource}\n${helperSource}`;
  const requiredText = [
    "RunTaskDemo",
    "Agent ENS",
    "Owner ENS",
    "Task text",
    "Metadata URI",
    "Typed data",
    "Sign and save for revocation",
    "Submit to relayer",
    "Transaction status",
    "Task history"
  ];

  assert.match(componentSource, /useSignTypedData/);
  assert.match(componentSource, /fetch\("\/api\/relayer\/execute"/);
  assert.match(`${componentSource}\n${helperSource}`, /localStorage/);
  assert.match(componentSource, /buildFreshTaskRunDraft/);
  assert.match(componentSource, /currentUnixSeconds\(\)/);
  assert.match(componentSource, /hashPolicyContractResult/);
  assert.match(componentSource, /policyHash={livePolicyHash}/);
  assert.doesNotMatch(componentSource, /policyHash={null}/);
  assert.match(componentSource, /normalizedAgentName/);
  assert.match(componentSource, /safeNamehash\(normalizedAgentName\)/);
  assert.match(componentSource, /agentName: normalizedAgentName/);
  assert.match(componentSource, /ownerName: normalizedOwnerName/);
  assert.doesNotMatch(
    componentSource,
    /safeNamehash\(agentName\)/,
    "run page must not query nonce, policy, or resolver data from a raw ENS input node",
  );
  assert.match(helperSource, /buildTaskRunDraft/);
  assert.match(helperSource, /serializeRelayerExecutePayload/);
  assert.match(source, /EnsProofPanel/);
  assert.match(source, /TaskRecorded/);
  for (const label of requiredText) {
    assert.match(source, new RegExp(label), `${label} should be rendered`);
  }
});

test("revoke page disables policy, updates ENS records, and retries the last payload", async () => {
  await assertFile("apps/web/app/revoke/page.tsx");
  await assertFile("apps/web/components/RevokeAgentPanel.tsx");

  const pageSource = await readText("apps/web/app/revoke/page.tsx");
  const panelSource = await readText("apps/web/components/RevokeAgentPanel.tsx");
  const contractsSource = await readText("apps/web/lib/contracts.ts");
  const source = `${pageSource}\n${panelSource}\n${contractsSource}`;
  const requiredText = [
    "RevokeAgentPanel",
    "Current agent address",
    "Revoke policy",
    "Set status revoked",
    "Update addr record",
    "Retry last signed payload",
    "Failure proof"
  ];

  assert.match(panelSource, /useWriteContract/);
  assert.match(panelSource, /revokePolicy/);
  assert.match(panelSource, /setText/);
  assert.match(panelSource, /setAddr/);
  assert.match(panelSource, /fetch\("\/api\/relayer\/execute"/);
  assert.match(panelSource, /localStorage/);
  assert.match(panelSource, /resolverRead\.isSuccess/);
  assert.match(panelSource, /hashPolicyContractResult/);
  assert.match(panelSource, /policyHash={livePolicyHash}/);
  assert.doesNotMatch(panelSource, /policyHash={null}/);
  assert.match(panelSource, /normalizeAddressInput/);
  assert.match(panelSource, /normalizedReplacementAddress/);
  assert.doesNotMatch(
    panelSource,
    /args: \[writeAgentNode, replacementAddress\]/,
    "revoke page must not pass untrimmed address input to setAddr",
  );
  assert.match(panelSource, /normalizedAgentName/);
  assert.match(panelSource, /safeNamehash\(normalizedAgentName\)/);
  assert.match(panelSource, /requireAgentNode/);
  assert.match(panelSource, /namehashEnsName\(normalizedAgentName\)/);
  assert.doesNotMatch(
    panelSource,
    /safeNamehash\(agentName\)/,
    "revoke page must not send policy or ENS record writes against a raw ENS input node",
  );
  assert.doesNotMatch(
    panelSource,
    /nonZeroAddress\(resolverRead\.data as Hex \| undefined\) \?\? props\.resolverAddress \?\? null/,
    "revoke panel must not fall back to a configured resolver after a live zero resolver read",
  );
  assert.match(source, /EnsProofPanel/);
  assert.match(contractsSource, /name: "revokePolicy"/);
  for (const label of requiredText) {
    assert.match(source, new RegExp(label), `${label} should be rendered`);
  }
});
