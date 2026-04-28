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
  await assertFile("apps/web/components/CopyableValue.tsx");

  const source = await readText("apps/web/components/EnsProofPanel.tsx");
  const copyableSource = await readText("apps/web/components/CopyableValue.tsx");
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
  assert.match(source, /CopyableValue/);
  assert.match(source, /explorerKind/);
  assert.match(copyableSource, /navigator\.clipboard\.writeText/);
  assert.match(copyableSource, /sepolia\.etherscan\.io/);
  for (const label of requiredText) {
    assert.match(source, new RegExp(label.replace(/[()]/g, "\\$&")), `${label} should be rendered`);
  }
});

test("demo readiness panel summarizes live MVP prerequisites", async () => {
  await assertFile("apps/web/components/DemoReadinessPanel.tsx");

  const panelSource = await readText("apps/web/components/DemoReadinessPanel.tsx");
  const agentViewSource = await readText("apps/web/components/AgentProfileView.tsx");
  const runSource = await readText("apps/web/components/RunTaskDemo.tsx");
  const styles = await readText("apps/web/app/globals.css");

  for (const label of ["Resolver", "Agent addr", "Policy", "Gas budget", "TaskLog", "Relayer"]) {
    assert.match(panelSource, new RegExp(label), `${label} should be shown in readiness summary`);
  }
  assert.match(panelSource, /readiness-panel__item--ready/);
  assert.match(panelSource, /readiness-panel__item--blocked/);
  assert.match(agentViewSource, /DemoReadinessPanel/);
  assert.match(runSource, /DemoReadinessPanel/);
  assert.match(styles, /\.readiness-panel/);
});

test("forms expose consistent loading and error states", async () => {
  await assertFile("apps/web/components/StatusBanner.tsx");

  const statusSource = await readText("apps/web/components/StatusBanner.tsx");
  const registerSource = await readText("apps/web/components/RegisterAgentForm.tsx");
  const runSource = await readText("apps/web/components/RunTaskDemo.tsx");
  const revokeSource = await readText("apps/web/components/RevokeAgentPanel.tsx");
  const styles = await readText("apps/web/app/globals.css");

  assert.match(statusSource, /variant: "idle" \| "loading" \| "success" \| "error"/);
  assert.match(statusSource, /role={props\.variant === "error" \? "alert" : "status"}/);
  assert.match(registerSource, /StatusBanner/);
  assert.match(registerSource, /variant={status === "submitting" \? "loading" : status === "submitted" \? "success" : status}/);
  assert.match(registerSource, /Waiting for ENS and wallet state/);
  assert.match(runSource, /StatusBanner/);
  assert.match(runSource, /variant={status === "signing" \? "loading" : status === "submitted" \? "success" : status}/);
  assert.match(runSource, /Waiting for live agent data/);
  assert.match(revokeSource, /StatusBanner/);
  assert.match(revokeSource, /variant={statusMessage\.startsWith\("Revocation proof"/);
  assert.match(revokeSource, /Waiting for revocation data/);
  assert.match(styles, /\.status-banner--loading/);
  assert.match(styles, /\.status-banner--error/);
});

test("README documents release demo, architecture, env, and limitations", async () => {
  const source = await readText("README.md");

  for (const heading of [
    "## Architecture",
    "```mermaid",
    "## Environment variables",
    "## Deployed addresses",
    "## Reproduce the Sepolia demo",
    "## Known limitations",
    "## Test commands"
  ]) {
    assert.match(source, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /AgentPolicyExecutor/);
  assert.match(source, /ENS public resolver/);
  assert.match(source, /TaskLog\.recordTask/);
  assert.match(source, /TaskLog/);
  assert.match(source, /NEXT_PUBLIC_EXECUTOR_ADDRESS/);
  assert.match(source, /RELAYER_PRIVATE_KEY/);
  assert.match(source, /AGENT_PRIVATE_KEY/);
  assert.match(source, /ENS name -> agent metadata -> signed task -> live ENS verification -> task execution -> revocation failure/);
  assert.match(source, /Pinata\/IPFS metadata generation is planned/);
});

test("home page renders a landing page with workflow navigation", async () => {
  const source = await readText("apps/web/app/page.tsx");
  const styles = await readText("apps/web/app/globals.css");
  const headerSource = await readText("apps/web/components/SiteHeader.tsx");

  assert.match(source, /landing-hero/);
  assert.match(source, /AgentPassports\.eth/);
  assert.match(source, /Register agent/);
  assert.match(source, /Run task/);
  assert.match(source, /Revoke access/);
  assert.match(source, /\/register/);
  assert.match(source, /\/run/);
  assert.match(source, /\/revoke/);
  assert.doesNotMatch(headerSource, /buildDemoAgentProfile/);
  assert.doesNotMatch(headerSource, /\/agent\/\$\{/);
  assert.doesNotMatch(source, /buildDemoAgentProfile/);
  assert.doesNotMatch(source, /AgentPassportCard/);
  assert.doesNotMatch(source, /EnsProofPanel/);
  assert.doesNotMatch(source, /alice\.eth/);
  assert.doesNotMatch(source, /0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512/);
  assert.doesNotMatch(source, /0xFCAd0B19bB29D4674531d6f115237E16AfCE377c/);
  assert.doesNotMatch(source, /Temporary shell/);
  assert.match(styles, /\.landing-hero__content\s*{[^}]*min-width: 0/s);
  assert.match(styles, /\.landing-hero__content h1\s*{[^}]*overflow-wrap: anywhere/s);
  assert.match(styles, /\.landing-visual\s*{[^}]*min-width: 0/s);
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

test("home page and demo profile do not prefill user-owned ENS values", async () => {
  const pageSource = await readText("apps/web/app/page.tsx");
  const demoSource = await readText("apps/web/lib/demoProfile.ts");
  const envSource = await readText("apps/web/lib/env.ts");
  const rootEnv = await readText(".env.example");
  const webEnv = await readText("apps/web/.env.example");

  assert.match(pageSource, /landing-hero/);
  assert.match(demoSource, /demoOwnerEns/);
  assert.doesNotMatch(demoSource, /DEFAULT_DEMO_OWNER_ENS\s*=\s*"[^"]+"/);
  assert.doesNotMatch(demoSource, /DEFAULT_DEMO_AGENT_LABEL\s*=\s*"[^"]+"/);
  assert.doesNotMatch(demoSource, /agentpassports\.eth/);
  assert.doesNotMatch(demoSource, /const DEFAULT_DEMO_POLICY_URI = "ipfs:\/\//);
  assert.doesNotMatch(`${pageSource}\n${demoSource}`, /Configure NEXT_PUBLIC_DEMO_OWNER_ENS/);
  assert.doesNotMatch(`${pageSource}\n${demoSource}`, /Configure NEXT_PUBLIC_DEMO_AGENT_ADDRESS/);
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
  const helperSource = await readText("apps/web/lib/registerAgent.ts");
  const batchSource = await readText("apps/web/lib/registrationBatch.ts");
  const submissionSource = await readText("apps/web/lib/registrationSubmission.ts");
  const source = `${formSource}\n${helperSource}\n${batchSource}\n${submissionSource}`;
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
  assert.match(formSource, /useEffect/);
  assert.match(formSource, /ownerNameEdited/);
  assert.match(formSource, /readOwnerEnsAutofill/);
  assert.match(formSource, /setOwnerName\(ownerEnsAutofill\)/);
  assert.match(helperSource, /safeNamehash/);
  assert.match(helperSource, /computeSubnode/);
  assert.match(source, /agent\.policy\.hash/);
  assert.match(batchSource, /setPolicy/);
  assert.doesNotMatch(formSource, /depositGasBudget/);
  assert.match(formSource, /publicResolverAddress/);
  assert.match(formSource, /registrationDraftStatus/);
  assert.match(formSource, /submitBlocker/);
  assert.match(formSource, /buildRegistrationBatch/);
  assert.match(batchSource, /setSubnodeRecord/);
  assert.match(formSource, /useSendCalls/);
  assert.match(formSource, /useSendTransaction/);
  assert.match(formSource, /usePublicClient/);
  assert.match(formSource, /sendCallsAsync/);
  assert.match(formSource, /sendTransactionAsync/);
  assert.match(formSource, /waitForTransactionReceipt/);
  assert.match(formSource, /publicClient\.call/);
  assert.match(formSource, /parseEthInputToWeiString/);
  assert.match(formSource, /formatWeiInputAsEth/);
  assert.match(formSource, /formatWeiAsEth/);
  assert.match(formSource, /Gas budget \(ETH\)/);
  assert.match(formSource, /maxReimbursementEth/);
  assert.match(formSource, /Reimbursement cap \(ETH\)/);
  assert.doesNotMatch(formSource, /<span>Max reimbursement<\/span>\s*<input readOnly/);
  assert.doesNotMatch(formSource, /preview\.gasBudgetWei\} wei/);
  assert.match(submissionSource, /forceAtomic: true/);
  assert.match(submissionSource, /isWalletSendCallsUnavailable/);
  assert.match(formSource, /buildRegistrationBatch/);
  assert.match(formSource, /submitRegistrationBatch/);
  assert.match(batchSource, /multicall/);
  assert.match(formSource, /hasPreparedTransactions/);
  assert.match(formSource, /ENS text records appear after owner ENS, agent label, and agent address are ready/);
  assert.match(formSource, /Prepared transactions appear after the ENS records, resolver, and gas budget are ready/);
  assert.match(batchSource, /setSubnodeRecord\(owner ENS, agent label, connected wallet, public resolver\)/);
  assert.match(formSource, /disabled={status === "submitting" \|\| Boolean\(submitBlocker\)}/);
  for (const label of requiredText) {
    assert.match(formSource, new RegExp(label), `${label} should be rendered`);
  }
});

test("register, run, and revoke pages start with empty user-entered fields", async () => {
  const registerSource = await readText("apps/web/app/register/page.tsx");
  const runSource = await readText("apps/web/app/run/page.tsx");
  const revokeSource = await readText("apps/web/app/revoke/page.tsx");
  const source = `${registerSource}\n${runSource}\n${revokeSource}`;

  assert.match(registerSource, /defaultOwnerName=""/);
  assert.match(registerSource, /defaultAgentLabel=""/);
  assert.match(registerSource, /defaultAgentAddress={null}/);
  assert.match(registerSource, /defaultPolicyUri=""/);
  assert.match(runSource, /defaultAgentName=""/);
  assert.match(runSource, /defaultOwnerName=""/);
  assert.match(runSource, /defaultMetadataURI=""/);
  assert.match(runSource, /defaultTaskDescription=""/);
  assert.match(revokeSource, /defaultAgentName=""/);
  assert.match(revokeSource, /defaultOwnerName=""/);
  assert.doesNotMatch(source, /agentpassports\.eth/);
  assert.doesNotMatch(source, /agentpassports-demo/);
  assert.doesNotMatch(source, /Record wallet health check/);
});

test("agent passport page exposes route-level ENS profile sections", async () => {
  await assertFile("apps/web/app/agent/[name]/page.tsx");
  await assertFile("apps/web/components/TaskHistoryPanel.tsx");

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
  assert.match(walletSource, /accountStatus="full"/);
  assert.doesNotMatch(walletSource, /accountStatus="address"/);
  assert.match(configSource, /sepolia/);
  assert.match(configSource, /createConfig/);
  assert.match(configSource, /injected/);
  assert.match(configSource, /NEXT_PUBLIC_CHAIN_ID/);
  assert.doesNotMatch(configSource, /sepolia\.gateway\.tenderly\.co/);
  assert.match(packageSource, /@tanstack\/react-query/);
});

test("register form resolves ENS ownership and submits wallet transactions", async () => {
  const formSource = await readText("apps/web/components/RegisterAgentForm.tsx");
  const helperSource = await readText("apps/web/lib/registerAgent.ts");
  const batchSource = await readText("apps/web/lib/registrationBatch.ts");
  const submissionSource = await readText("apps/web/lib/registrationSubmission.ts");
  const contractsSource = await readText("apps/web/lib/contracts.ts");
  const source = `${formSource}\n${helperSource}\n${batchSource}\n${submissionSource}`;

  assert.match(formSource, /useAccount/);
  assert.match(formSource, /useEnsAddress/);
  assert.match(formSource, /useEnsName/);
  assert.match(formSource, /chainId: Number\(props\.chainId\)/);
  assert.doesNotMatch(formSource, /chainId: SEPOLIA_CHAIN_ID/);
  assert.match(formSource, /useReadContract/);
  assert.doesNotMatch(formSource, /useWriteContract/);
  assert.match(formSource, /useSendTransaction/);
  assert.match(formSource, /usePublicClient/);
  assert.match(formSource, /ownerResolvedAddress/);
  assert.match(formSource, /ownerReverseName/);
  assert.match(formSource, /ownerManager/);
  assert.match(formSource, /agentOwner/);
  assert.match(formSource, /effectiveOwnerManager/);
  assert.match(formSource, /ownerEnsStatus/);
  assert.match(source, /No owner ENS detected for this wallet/);
  assert.match(source, /This wallet cannot manage the entered ENS name/);
  assert.doesNotMatch(formSource, /writeContractAsync/);
  assert.match(batchSource, /setAddr/);
  assert.match(batchSource, /setText/);
  assert.match(batchSource, /setSubnodeRecord/);
  assert.match(batchSource, /setPolicy/);
  assert.doesNotMatch(formSource, /depositGasBudget/);
  assert.match(formSource, /submitRegistrationTransactions/);
  assert.match(formSource, /submitRegistrationBatch/);
  assert.match(formSource, /indexRegisteredAgent/);
  assert.match(formSource, /indexRegisteredAgentWithRetry/);
  assert.match(formSource, /AGENT_DIRECTORY_INDEX_RETRY_DELAYS_MS/);
  assert.match(formSource, /fetch\("\/api\/agents"/);
  assert.match(formSource, /agentAddress: normalizedAgentAddress/);
  assert.match(formSource, /agentName: preview\.agentName/);
  assert.match(submissionSource, /wallet_sendcalls/);
  assert.doesNotMatch(formSource, /writeResolverRecords/);
  assert.doesNotMatch(formSource, /writeExecutorPolicy/);
  assert.doesNotMatch(formSource, /writeGasBudgetDeposit/);
  assert.match(contractsSource, /name: "multicall"/);
  assert.match(formSource, /from "\.\.\/lib\/registerAgent"/);
  assert.match(formSource, /validateRegistrationInput/);
  assert.match(helperSource, /export function buildRegisterPreview/);
  assert.match(helperSource, /export function validateRegistrationInput/);
  assert.match(helperSource, /Agent label is required/);
  assert.match(formSource, /normalizeAddressInput/);
  assert.match(formSource, /normalizedAgentAddress/);
  assert.doesNotMatch(formSource, /buildPolicyMetadata/);
  assert.doesNotMatch(formSource, /function buildRegisterPreview/);
  assert.doesNotMatch(
    formSource,
    /args: \[preview\.agentNode, agentAddress as Hex\]/,
    "registration should not pass untrimmed address input to setAddr",
  );
  assert.ok(
    formSource.indexOf("validateRegistrationInput") < formSource.indexOf("submitRegistrationTransactions"),
    "registration input should be validated before resolver writes",
  );
  assert.match(formSource, /agentResolver\.isSuccess/);
  assert.match(formSource, /const liveAgentOwnerAddress = agentOwner\.isSuccess \? nonZeroAddress\(agentOwner\.data as Hex \| undefined\) : null/);
  assert.match(formSource, /const shouldCreateSubnameRecord = agentOwner\.isSuccess && liveAgentOwnerAddress === null/);
  assert.doesNotMatch(
    formSource,
    /const shouldCreateSubnameRecord = liveResolverAddress === null/,
    "registration must not recreate a subname just because the resolver read is empty",
  );
  assert.match(
    formSource,
    /const liveResolverAddress = agentResolver\.isSuccess \? registryResolverAddress : null/,
    "registration resolver preview must wait for the live registry resolver read",
  );
  assert.match(formSource, /requireLiveResolverAddress/);
  assert.match(
    formSource,
    /throw new Error\("Waiting for live resolver lookup"\)/,
    "registration resolver writes must wait until the live registry resolver read settles",
  );
  assert.doesNotMatch(
    formSource,
    /nonZeroAddress\(agentResolver\.data as Hex \| undefined\) \?\? props\.resolverAddress \?\? null/,
    "registration must not write records through a configured fallback resolver",
  );
  assert.match(formSource, /Registration submitted/);
  assert.match(contractsSource, /PUBLIC_RESOLVER_ABI/);
  assert.match(contractsSource, /AGENT_POLICY_EXECUTOR_ABI/);
});

test("agent page reads live ENS, policy, gas budget, and task history", async () => {
  await assertFile("apps/web/components/AgentProfileView.tsx");
  await assertFile("apps/web/lib/agentProfileDisplay.ts");

  const pageSource = await readText("apps/web/app/agent/[name]/page.tsx");
  const viewSource = await readText("apps/web/components/AgentProfileView.tsx");
  const historyPanelSource = await readText("apps/web/components/TaskHistoryPanel.tsx");
  const displaySource = await readText("apps/web/lib/agentProfileDisplay.ts");
  const taskHistorySource = await readText("apps/web/lib/taskHistory.ts");
  const contractsSource = await readText("apps/web/lib/contracts.ts");
  const source = `${pageSource}\n${viewSource}\n${historyPanelSource}\n${displaySource}\n${taskHistorySource}\n${contractsSource}`;

  assert.match(pageSource, /serializeAgentProfile/);
  assert.match(viewSource, /useReadContract/);
  assert.match(viewSource, /useReadContracts/);
  assert.match(viewSource, /usePublicClient\(\{ chainId: Number\(initialProfile\.chainId\) \}\)/);
  assert.match(viewSource, /loadTaskHistory/);
  assert.match(viewSource, /fromBlock: parseOptionalBigInt\(initialProfile\.taskLogStartBlock\)/);
  assert.match(taskHistorySource, /\/api\/tasks\?agentNode=/);
  assert.match(taskHistorySource, /getLogs/);
  assert.match(source, /TaskRecorded/);
  assert.match(viewSource, /from "\.\.\/lib\/taskHistory"/);
  assert.match(viewSource, /from "\.\/TaskHistoryPanel"/);
  assert.doesNotMatch(viewSource, /fromBlock: 0n/);
  assert.doesNotMatch(viewSource, /function taskFromLog/);
  assert.doesNotMatch(viewSource, /function TaskHistoryPanel/);
  assert.match(viewSource, /AGENT_TEXT_RECORD_KEYS/);
  assert.match(historyPanelSource, /export function TaskHistoryPanel/);
  assert.match(historyPanelSource, /emptyDescription/);
  assert.match(historyPanelSource, /CopyableValue/);
  assert.match(historyPanelSource, /explorerKind="tx"/);
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
  assert.match(viewSource, /resolveVisibleAgentAddress/);
  assert.match(viewSource, /parseCapabilities/);
  assert.match(viewSource, /readPassportStatus/);
  assert.match(displaySource, /export function resolveVisibleAgentAddress/);
  assert.match(displaySource, /export function parseCapabilities/);
  assert.match(displaySource, /export function readPassportStatus/);
});

test("run page signs task intents and submits them to the relayer", async () => {
  await assertFile("apps/web/app/run/page.tsx");
  await assertFile("apps/web/components/RunTaskDemo.tsx");
  await assertFile("apps/web/components/AgentLiveDataPanel.tsx");
  await assertFile("apps/web/components/TaskHistoryPanel.tsx");
  await assertFile("apps/web/lib/agentSession.ts");
  await assertFile("apps/web/lib/taskDemo.ts");

  const pageSource = await readText("apps/web/app/run/page.tsx");
  const componentSource = await readText("apps/web/components/RunTaskDemo.tsx");
  const liveDataPanelSource = await readText("apps/web/components/AgentLiveDataPanel.tsx");
  const historyPanelSource = await readText("apps/web/components/TaskHistoryPanel.tsx");
  const sessionSource = await readText("apps/web/lib/agentSession.ts");
  const helperSource = await readText("apps/web/lib/taskDemo.ts");
  const taskHistorySource = await readText("apps/web/lib/taskHistory.ts");
  const source = `${pageSource}\n${componentSource}\n${liveDataPanelSource}\n${historyPanelSource}\n${sessionSource}\n${helperSource}\n${taskHistorySource}`;
  const requiredText = [
    "RunTaskDemo",
    "Agent ENS",
    "Owner ENS",
    "Task text",
    "Metadata URI",
    "Typed data",
    "Connected wallet",
    "Wallet reverse ENS",
    "ENS text records",
    "Policy state",
    "Submit to relayer",
    "Transaction status",
    "Task history"
  ];

  assert.match(componentSource, /useAccount/);
  assert.match(componentSource, /useEnsName/);
  assert.match(componentSource, /useReadContracts/);
  assert.match(componentSource, /useSignTypedData/);
  assert.match(componentSource, /usePublicClient\(\{ chainId: Number\(props\.chainId\) \}\)/);
  assert.doesNotMatch(
    componentSource,
    /usePublicClient\(\{ chainId: SEPOLIA_CHAIN_ID \}\)/,
    "run page public reads must use the same configured chain id as signed intents",
  );
  assert.match(componentSource, /fetch\("\/api\/relayer\/execute"/);
  assert.doesNotMatch(source, /Sign and save for revocation/);
  assert.doesNotMatch(componentSource, /persistForRevocation/);
  assert.match(componentSource, /storeSignedTaskPayload/);
  assert.match(componentSource, /buildStoredSignedTaskPayload/);
  assert.match(componentSource, /setStatusMessage\("Task submitted and saved for revocation proof"\)/);
  assert.match(componentSource, /buildFreshTaskRunDraft/);
  assert.match(componentSource, /chainNowSeconds/);
  assert.match(componentSource, /readLatestBlockTimestamp/);
  assert.match(componentSource, /publicClient\.getBlock\(\{ blockTag: "latest" \}\)/);
  assert.match(componentSource, /const chainTimestamp = await readLatestBlockTimestamp\(\)/);
  assert.match(componentSource, /const draft = buildCurrentDraft\(chainTimestamp\)/);
  assert.doesNotMatch(
    componentSource,
    /currentUnixSeconds\(\)/,
    "run page must derive signed intent expiry from chain time instead of the browser clock",
  );
  assert.match(componentSource, /optimisticNextNonce/);
  assert.match(componentSource, /setOptimisticNextNonce\(BigInt\(relayerPayload\.intent\.nonce\) \+ 1n\)/);
  assert.match(componentSource, /nextNonceRead\.refetch\(\)/);
  assert.ok(
    componentSource.indexOf("setOptimisticNextNonce(BigInt(relayerPayload.intent.nonce) + 1n)") <
      componentSource.indexOf('setStatus("submitted")'),
    "run page must advance the next nonce before allowing another submission",
  );
  assert.match(componentSource, /hashPolicyContractResult/);
  assert.match(componentSource, /policyHash={livePolicyHash}/);
  assert.doesNotMatch(componentSource, /policyHash={null}/);
  assert.match(componentSource, /taskGasBudgetStatus/);
  assert.match(componentSource, /runSubmitBlocker/);
  assert.match(componentSource, /readAgentEnsAutofill/);
  assert.match(componentSource, /lookupVerifiedAgentDirectory/);
  assert.match(componentSource, /fetch\(`\/api\/agents\?address=\$\{encodeURIComponent\(connectedWallet\)\}`/);
  assert.match(componentSource, /directoryAgent\?\.agentName/);
  assert.match(componentSource, /directoryAgent\?\.ownerName/);
  assert.match(componentSource, /readImmediateOwnerName/);
  assert.match(componentSource, /setOwnerName\(derivedOwnerName\)/);
  assert.match(componentSource, /AgentLiveDataPanel/);
  assert.match(componentSource, /AGENT_TEXT_RECORD_KEYS/);
  assert.match(componentSource, /mapAgentTextRecords/);
  assert.match(componentSource, /connectedWallet/);
  assert.match(componentSource, /agentReverseName/);
  assert.match(liveDataPanelSource, /formatWei/);
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
  assert.match(helperSource, /normalizeOptionalTaskMetadataURI/);
  assert.doesNotMatch(helperSource, /normalizeRequiredText\(input\.metadataURI, "Metadata URI"\)/);
  assert.match(source, /EnsProofPanel/);
  assert.match(source, /TaskRecorded/);
  assert.match(componentSource, /loadTaskHistory/);
  assert.match(componentSource, /fromBlock: props\.taskLogStartBlock/);
  assert.match(taskHistorySource, /\/api\/tasks\?agentNode=/);
  assert.match(taskHistorySource, /getLogs/);
  assert.match(componentSource, /from "\.\.\/lib\/taskHistory"/);
  assert.match(componentSource, /from "\.\/TaskHistoryPanel"/);
  assert.doesNotMatch(componentSource, /fromBlock: 0n/);
  assert.doesNotMatch(componentSource, /function taskFromLog/);
  assert.doesNotMatch(componentSource, /function TaskHistoryPanel/);
  for (const label of requiredText) {
    assert.match(source, new RegExp(label), `${label} should be rendered`);
  }
});

test("revoke page disables policy, updates ENS records, and retries the last payload", async () => {
  await assertFile("apps/web/app/revoke/page.tsx");
  await assertFile("apps/web/components/RevokeAgentPanel.tsx");
  await assertFile("apps/web/components/AgentLiveDataPanel.tsx");
  await assertFile("apps/web/lib/agentSession.ts");

  const pageSource = await readText("apps/web/app/revoke/page.tsx");
  const panelSource = await readText("apps/web/components/RevokeAgentPanel.tsx");
  const liveDataPanelSource = await readText("apps/web/components/AgentLiveDataPanel.tsx");
  const sessionSource = await readText("apps/web/lib/agentSession.ts");
  const contractsSource = await readText("apps/web/lib/contracts.ts");
  const source = `${pageSource}\n${panelSource}\n${liveDataPanelSource}\n${sessionSource}\n${contractsSource}`;
  const requiredText = [
    "RevokeAgentPanel",
    "Connected wallet",
    "Wallet reverse ENS",
    "ENS text records",
    "Policy state",
    "Next nonce",
    "Current agent address",
    "Revoke policy",
    "Set status disabled",
    "Update addr record",
    "Withdraw gas budget",
    "Withdraw amount ETH",
    "Owner receives",
    "Retry last signed payload",
    "Failure proof"
  ];

  assert.match(panelSource, /useAccount/);
  assert.match(panelSource, /useEnsName/);
  assert.match(panelSource, /useReadContracts/);
  assert.match(panelSource, /usePublicClient/);
  assert.match(panelSource, /useWriteContract/);
  assert.match(panelSource, /revokePolicy/);
  assert.match(panelSource, /handleRevokePolicy/);
  assert.match(panelSource, /agent\.status", "disabled"/);
  assert.match(panelSource, /buildEnsStatusWriteState/);
  assert.match(panelSource, /requireEnsStatusWrite/);
  assert.doesNotMatch(panelSource, /Promise\.all\(\[/);
  assert.match(panelSource, /revocationActionState\.shouldWriteEnsStatus/);
  assert.match(panelSource, /waitForTransactionReceipt/);
  assert.match(panelSource, /const policyTxHash = await writeContractAsync/);
  assert.doesNotMatch(panelSource, /ENS status write skipped/);
  assert.match(panelSource, /withdrawGasBudget/);
  assert.match(panelSource, /handleWithdrawGasBudget/);
  assert.match(panelSource, /withdrawAmountEth/);
  assert.match(panelSource, /parseEthInputToWei/);
  assert.match(panelSource, /formatWeiAsEth/);
  assert.match(panelSource, /handleUseMaxGasBudget/);
  assert.match(panelSource, />Max</);
  assert.doesNotMatch(panelSource, /Use full budget/);
  assert.match(panelSource, /args: \[writeAgentNode, withdrawAmountWei\]/);
  assert.match(panelSource, /Withdraw gas budget transaction submitted/);
  assert.match(contractsSource, /name: "withdrawGasBudget"/);
  assert.match(panelSource, /setText/);
  assert.match(panelSource, /setAddr/);
  assert.match(panelSource, /fetch\("\/api\/relayer\/execute"/);
  assert.match(panelSource, /revocationFailureProof/);
  assert.match(panelSource, /Not a revocation proof/);
  assert.doesNotMatch(
    panelSource,
    /setFailureProof\(details \|\| "Relayer rejected the old signed payload"\)/,
    "revoke page must only capture failure proof for revocation-specific relayer errors",
  );
  assert.match(panelSource, /localStorage/);
  assert.match(panelSource, /resolverRead\.isSuccess/);
  assert.match(panelSource, /requireLiveResolverAddress/);
  assert.match(panelSource, /return registryResolverAddress/);
  assert.match(
    panelSource,
    /const resolverAddress = resolverRead\.isSuccess \? registryResolverAddress : null/,
    "revoke proof reads must stay unknown until the live registry resolver read succeeds",
  );
  assert.doesNotMatch(
    panelSource,
    /const resolverAddress = resolverRead\.isSuccess \? registryResolverAddress : registryResolverAddress \?\? props\.resolverAddress \?\? null/,
    "revoke proof reads must not fall back to configured resolver data while the live registry read is unsettled",
  );
  assert.doesNotMatch(
    panelSource,
    /requireAddress\(resolverAddress, "Resolver address is not configured"\)/,
    "revoke resolver writes must wait for a live registry resolver read instead of using a fallback resolver",
  );
  assert.match(panelSource, /hashPolicyContractResult/);
  assert.match(panelSource, /policyHash={livePolicyHash}/);
  assert.doesNotMatch(panelSource, /policyHash={null}/);
  assert.match(panelSource, /readOwnerEnsAutofill/);
  assert.match(panelSource, /ownerReverseName/);
  assert.match(panelSource, /setOwnerName\(ownerEnsAutofill\)/);
  assert.match(panelSource, /ownerAgents/);
  assert.match(panelSource, /lookupOwnerAgentDirectory/);
  assert.match(panelSource, /fetch\(`\/api\/agents\?ownerName=\$\{encodeURIComponent\(normalizedOwnerName\)\}`/);
  assert.match(panelSource, /setAgentName\(ownerAgents\[0\]\.agentName\)/);
  assert.match(panelSource, /setAgentNameEdited\(true\)/);
  assert.match(panelSource, /owner-agent-options/);
  assert.doesNotMatch(
    panelSource,
    /readAgentEnsAutofill/,
    "revoke is an owner flow, so wallet reverse ENS must not autofill Agent ENS",
  );
  assert.doesNotMatch(
    panelSource,
    /setAgentName\(agentEnsAutofill\)/,
    "revoke must not copy the owner wallet reverse ENS into the Agent ENS field",
  );
  assert.match(panelSource, /readImmediateOwnerName/);
  assert.match(panelSource, /setOwnerName\(derivedOwnerName\)/);
  assert.match(panelSource, /AgentLiveDataPanel/);
  assert.match(panelSource, /AGENT_TEXT_RECORD_KEYS/);
  assert.match(panelSource, /mapAgentTextRecords/);
  assert.match(panelSource, /connectedWallet/);
  assert.doesNotMatch(panelSource, /agentReverseName/);
  assert.match(panelSource, /nextNonceRead/);
  assert.match(liveDataPanelSource, /formatWei/);
  assert.match(panelSource, /normalizeAddressInput/);
  assert.match(panelSource, /normalizedReplacementAddress/);
  assert.doesNotMatch(
    panelSource,
    /args: \[writeAgentNode, replacementAddress\]/,
    "revoke page must not pass untrimmed address input to setAddr",
  );
  assert.match(panelSource, /storedPayloadMatchesAgentNode/);
  assert.match(panelSource, /savedPayloadMatchesAgentNode/);
  assert.match(panelSource, /proofRecoveredSigner/);
  assert.match(panelSource, /recoveredSigner={proofRecoveredSigner}/);
  assert.match(panelSource, /Saved payload belongs to a different agent/);
  assert.match(panelSource, /displayRecoveredSigner/);
  assert.match(panelSource, /storedRecoveredSigner\(lastPayload\)/);
  assert.match(panelSource, /normalizeAddressInput\(recoveredSigner\)/);
  assert.doesNotMatch(
    panelSource,
    /formatNullableHex\(lastPayload\?\.recoveredSigner\)/,
    "revoke retry facts must validate stored signer data before formatting it as hex",
  );
  assert.doesNotMatch(
    panelSource,
    /title={lastPayload\?\.recoveredSigner/,
    "revoke retry facts must not put arbitrary localStorage signer values into the DOM",
  );
  assert.match(panelSource, /lastPayload\?\.intent\?\.nonce/);
  assert.doesNotMatch(
    panelSource,
    /lastPayload\?\.intent\.nonce/,
    "revoke retry facts must not crash on malformed saved payloads without intent data",
  );
  assert.doesNotMatch(
    panelSource,
    /lastPayload\?\.recoveredSigner && liveAgentAddress && !sameAddress\(lastPayload\.recoveredSigner, liveAgentAddress\)/,
    "revoke proof status must not compare recovered signers from mismatched saved payloads",
  );
  assert.ok(
    panelSource.indexOf("storedPayloadMatchesAgentNode") < panelSource.indexOf('fetch("/api/relayer/execute"'),
    "revoke page must verify the stored payload node before retrying the relayer call",
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
