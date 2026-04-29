import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { decodeFunctionData, labelhash } from "../apps/web/node_modules/viem/_esm/index.js";

const root = process.cwd();
const OWNER_NODE = "0x1111111111111111111111111111111111111111111111111111111111111111";
const AGENT_NODE = "0x2222222222222222222222222222222222222222222222222222222222222222";
const CONNECTED_WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const RESOLVER_ADDRESS = "0x1111111111111111111111111111111111111111";
const ENS_REGISTRY_ADDRESS = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const EXECUTOR_ADDRESS = "0x3B42d507E1B13eE164cAb0FbA4EA66f8a1B653f1";
const TASK_LOG_ADDRESS = "0x3AB718580b476D64fdD3CE6a9Ab63491B15767d9";

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function assertFile(relativePath) {
  const entry = await stat(path.join(root, relativePath));
  assert.equal(entry.isFile(), true, `${relativePath} should be a file`);
}

test("owner index helpers parse, serialize, add, remove, and derive agent names", async () => {
  const {
    addOwnerAgentLabel,
    buildOwnerAgentNames,
    parseOwnerAgentIndex,
    removeOwnerAgentLabel,
    serializeOwnerAgentIndex
  } = await import("../apps/web/lib/ownerIndex.ts");

  assert.deepEqual(parseOwnerAgentIndex(""), []);
  assert.deepEqual(parseOwnerAgentIndex(" assistant, worker ,assistant,, Runner "), ["assistant", "worker", "runner"]);
  assert.equal(serializeOwnerAgentIndex(["assistant", "worker", "assistant"]), "assistant,worker");
  assert.deepEqual(addOwnerAgentLabel("assistant,worker", "Runner"), ["assistant", "worker", "runner"]);
  assert.deepEqual(removeOwnerAgentLabel("assistant,worker,runner", " worker "), ["assistant", "runner"]);
  assert.deepEqual(buildOwnerAgentNames("Alice.eth", ["assistant", "runner"]), [
    { label: "assistant", name: "assistant.alice.eth" },
    { label: "runner", name: "runner.alice.eth" }
  ]);
});

test("registration batch updates owner ENS index after agent registration", async () => {
  const { buildRegistrationBatch } = await import("../apps/web/lib/registrationBatch.ts");
  const { PUBLIC_RESOLVER_ABI } = await import("../apps/web/lib/contracts.ts");

  const batch = buildRegistrationBatch({
    agentLabel: "assistant",
    agentNode: AGENT_NODE,
    connectedWallet: CONNECTED_WALLET,
    ensRegistryAddress: ENS_REGISTRY_ADDRESS,
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: "10000000000000000",
    isOwnerWrapped: false,
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "0",
    normalizedAgentAddress: CONNECTED_WALLET,
    ownerAgentLabels: ["worker"],
    ownerNode: OWNER_NODE,
    ownerResolverAddress: RESOLVER_ADDRESS,
    policyExpiresAt: "1790000000",
    publicResolverAddress: RESOLVER_ADDRESS,
    resolverAddress: RESOLVER_ADDRESS,
    shouldCreateSubnameRecord: true,
    taskLogAddress: TASK_LOG_ADDRESS,
    textRecords: [{ key: "agent.status", value: "active" }]
  });

  assert.equal(batch.summary.at(-1), "set owner index text records");
  const ownerIndexCall = batch.calls.at(-1);
  assert.equal(ownerIndexCall.label, "setOwnerIndex");
  const multicall = decodeFunctionData({ abi: PUBLIC_RESOLVER_ABI, data: ownerIndexCall.data });
  assert.equal(multicall.functionName, "multicall");
  const encodedResolverCalls = multicall.args[0];
  const decodedTextCalls = encodedResolverCalls.map((data) => decodeFunctionData({ abi: PUBLIC_RESOLVER_ABI, data }));
  assert.deepEqual(
    decodedTextCalls.map((call) => call.args),
    [
      [OWNER_NODE, "agentpassports.v", "1"],
      [OWNER_NODE, "agentpassports.agents", "worker,assistant"]
    ]
  );
});

test("registration batch requires the owner resolver because dashboard membership is ENS-backed", async () => {
  const { buildRegistrationBatch } = await import("../apps/web/lib/registrationBatch.ts");

  assert.throws(
    () => buildRegistrationBatch({
      agentLabel: "assistant",
      agentNode: AGENT_NODE,
      connectedWallet: CONNECTED_WALLET,
      ensRegistryAddress: ENS_REGISTRY_ADDRESS,
      executorAddress: EXECUTOR_ADDRESS,
      gasBudgetWei: "10000000000000000",
      isOwnerWrapped: false,
      maxGasReimbursementWei: "1000000000000000",
      maxValueWei: "0",
      normalizedAgentAddress: CONNECTED_WALLET,
      ownerAgentLabels: ["worker"],
      ownerNode: OWNER_NODE,
      ownerResolverAddress: null,
      policyExpiresAt: "1790000000",
      publicResolverAddress: RESOLVER_ADDRESS,
      resolverAddress: RESOLVER_ADDRESS,
      shouldCreateSubnameRecord: true,
      taskLogAddress: TASK_LOG_ADDRESS,
      textRecords: [{ key: "agent.status", value: "active" }]
    }),
    /Owner resolver address is required/
  );
});

test("owner dashboard route renders owner index, multiple agent cards, and quick actions", async () => {
  await assertFile("apps/web/app/owner/[name]/page.tsx");
  await assertFile("apps/web/components/OwnerDashboardView.tsx");

  const pageSource = await readText("apps/web/app/owner/[name]/page.tsx");
  const dashboardSource = await readText("apps/web/components/OwnerDashboardView.tsx");
  const helperSource = await readText("apps/web/lib/ownerIndex.ts");
  const source = `${pageSource}\n${dashboardSource}\n${helperSource}`;

  for (const label of [
    "agentpassports.v",
    "agentpassports.agents",
    "Add agent",
    "Resolver",
    "Gas budget",
    "Latest task history",
    "View",
    "Revoke",
    "Enable",
    "Delete"
  ]) {
    assert.match(source, new RegExp(label.replace(/[()]/g, "\\$&")), `${label} should be rendered`);
  }
  assert.match(pageSource, /decodeURIComponent/);
  assert.match(dashboardSource, /buildOwnerAgentNames/);
  assert.match(dashboardSource, /loadTaskHistory/);
  assert.match(dashboardSource, /\/register\?owner=/);
});

test("owner dashboard aggregates live agent state instead of showing placeholder summary values", async () => {
  const dashboardSource = await readText("apps/web/components/OwnerDashboardView.tsx");

  for (const token of [
    "agentSnapshots",
    "totalGasBudgetWei",
    "activeAgentCount",
    "disabledAgentCount",
    "onSnapshot",
    "waitForTransactionReceipt",
    "refetch"
  ]) {
    assert.match(dashboardSource, new RegExp(token), `${token} should be used for live dashboard aggregation`);
  }

  assert.doesNotMatch(dashboardSource, /label="Total Gas Budget" value="Live"/);
  assert.doesNotMatch(dashboardSource, /label="Disabled" value="0"/);
  assert.doesNotMatch(dashboardSource, /countStatusHint/);
});

test("primary UI flow points owners through the dashboard instead of legacy standalone pages", async () => {
  await assertFile("apps/web/components/OwnerDashboardEntry.tsx");

  const homeSource = await readText("apps/web/app/page.tsx");
  const headerSource = await readText("apps/web/components/SiteHeader.tsx");
  const entrySource = await readText("apps/web/components/OwnerDashboardEntry.tsx");
  const source = `${homeSource}\n${headerSource}\n${entrySource}`;

  assert.match(homeSource, /OwnerDashboardEntry/);
  assert.match(source, /Open owner dashboard/);
  assert.match(source, /router\.push\(`\/owner\/\$\{encodeURIComponent\(normalizedOwnerName\)\}`\)/);
  assert.doesNotMatch(headerSource, /href="\/run"/);
  assert.doesNotMatch(headerSource, /href="\/revoke"/);
  assert.match(headerSource, /registerHref = ownerName \? `\/register\?owner=\$\{encodeURIComponent\(ownerName\)\}` : "\/register"/);
  assert.doesNotMatch(homeSource, /Run task/);
  assert.doesNotMatch(homeSource, /Revoke access/);
  assert.doesNotMatch(homeSource, /Register agent/);
});

test("register route is dashboard scoped instead of a standalone legacy flow", async () => {
  const registerSource = await readText("apps/web/app/register/page.tsx");

  assert.doesNotMatch(registerSource, /redirect\("\/"\)/);
  assert.match(registerSource, /Register new agent/);
  assert.match(registerSource, /Create an ENS subname, publish policy metadata, and fund execution budget\./);
  assert.match(registerSource, /Back to owner dashboard/);
  assert.match(registerSource, /\/owner\/\$\{encodeURIComponent\(defaultOwnerName\)\}/);
  assert.doesNotMatch(registerSource, /<h1 id="register-title">Register new agent for/);
  assert.doesNotMatch(registerSource, /Create an agent passport/);
});

test("dashboard and register pages use the management mockup layout vocabulary", async () => {
  const dashboardSource = await readText("apps/web/components/OwnerDashboardView.tsx");
  const registerSource = await readText("apps/web/components/RegisterAgentForm.tsx");
  const styles = await readText("apps/web/app/globals.css");

  for (const token of [
    "owner-summary-strip",
    "owner-agent-row",
    "owner-agent-row__actions",
    "ENS index",
    "Total Gas Budget",
    "Add agent"
  ]) {
    assert.match(dashboardSource, new RegExp(token), `${token} should be in dashboard UI`);
  }

  for (const token of [
    "register-workspace",
    "register-step",
    "Prepared registration",
    "Transaction queue",
    "Owner index update",
    "ENS records that will be written",
    "Register agent"
  ]) {
    assert.match(registerSource, new RegExp(token), `${token} should be in register UI`);
  }

  assert.match(styles, /\.owner-summary-strip/);
  assert.match(styles, /\.owner-agent-row/);
  assert.match(styles, /\.register-workspace/);
  assert.match(styles, /\.register-step/);
  assert.match(styles, /\.page-shell\s*{[^}]*max-width: 1488px/s);
  assert.match(styles, /\.site-header\s*{[^}]*calc\(\(100vw - 1488px\)/s);
  assert.match(styles, /\.register-workspace\s*{[^}]*grid-template-columns: minmax\(0, 1\.55fr\) minmax\(420px, 0\.9fr\)/s);
  assert.match(styles, /\.register-step--identity\s*{[^}]*grid-column: span 1/s);
});

test("image-generated UI spec and SVG symbol set are source-controlled", async () => {
  await assertFile("docs/UI_SPEC.md");
  await assertFile("apps/web/components/icons/UiIcons.tsx");
  for (const asset of [
    "apps/web/public/ui/agentpassports-logo.svg",
    "apps/web/public/ui/agent-bot.svg",
    "apps/web/public/ui/agent-swapper.svg",
    "apps/web/public/ui/agent-researcher.svg",
    "apps/web/public/ui/ens-index.svg",
    "apps/web/public/ui/ui-icons.svg"
  ]) {
    await assertFile(asset);
  }

  const spec = await readText("docs/UI_SPEC.md");
  const icons = await readText("apps/web/components/icons/UiIcons.tsx");
  const headerSource = await readText("apps/web/components/SiteHeader.tsx");
  const dashboardSource = await readText("apps/web/components/OwnerDashboardView.tsx");
  const agentSource = await readText("apps/web/components/AgentProfileView.tsx");
  const registerSource = await readText("apps/web/components/RegisterAgentForm.tsx");
  const uiSource = `${headerSource}\n${dashboardSource}\n${agentSource}\n${registerSource}`;

  for (const token of [
    "Source Images",
    "Owner Dashboard",
    "Agent Management",
    "Register Agent",
    "Icon Contract",
    "standalone source assets",
    "1536x1024",
    "8px"
  ]) {
    assert.match(spec, new RegExp(token), `${token} should be documented in UI spec`);
  }

  for (const icon of [
    "AgentPassportsLogo",
    "AgentBotIcon",
    "SwapperAgentIcon",
    "ResearcherAgentIcon",
    "EnsIndexIcon",
    "UiIcon"
  ]) {
    assert.match(icons, new RegExp(`export function ${icon}|export const ${icon}|${icon}:`), `${icon} should exist`);
  }

  assert.match(uiSource, /AgentPassportsLogo/);
  assert.match(uiSource, /AgentBotIcon/);
  assert.match(uiSource, /UiIcon/);
  assert.doesNotMatch(uiSource, /[⌁▣☷▦⌕✓↗]/u);
});

test("agent management page exposes policy, gas, signer, delete, and persistent history sections", async () => {
  const viewSource = await readText("apps/web/components/AgentProfileView.tsx");
  const managementSource = await readText("apps/web/components/AgentManagementPanel.tsx");
  const historySource = await readText("apps/web/components/TaskHistoryPanel.tsx");
  const source = `${viewSource}\n${managementSource}\n${historySource}`;

  for (const label of [
    "Agent management",
    "Disable policy",
    "Enable policy",
    "Edit policy metadata",
    "Add gas",
    "Withdraw gas",
    "Update signer address",
    "Delete agent",
    "Historical task history remains visible"
  ]) {
    assert.match(source, new RegExp(label), `${label} section should be present`);
  }
  assert.match(viewSource, /AgentManagementPanel/);
  assert.match(viewSource, /TaskHistoryPanel/);
});

test("agent page exposes visible signer and policy management and refreshes after wallet transactions", async () => {
  const viewSource = await readText("apps/web/components/AgentProfileView.tsx");
  const managementSource = await readText("apps/web/components/AgentManagementPanel.tsx");
  const source = `${viewSource}\n${managementSource}`;

  for (const token of [
    "Policy metadata",
    "Policy URI",
    "agent.policy.hash",
    "Update signer address",
    "waitForTransactionReceipt",
    "refreshAgentReads",
    "generatePolicyMetadata",
    "unpinOldPolicyMetadata"
  ]) {
    assert.match(source, new RegExp(token), `${token} should be part of visible agent management`);
  }

  assert.doesNotMatch(managementSource, /agent-management-utility sr-only/);
  assert.doesNotMatch(viewSource, /window\.prompt/);
});

test("agent page keeps explicit ENS proof and demo route intent visible in source", async () => {
  const agentSource = await readText("apps/web/components/AgentProfileView.tsx");
  const runPageSource = await readText("apps/web/app/run/page.tsx");
  const revokePageSource = await readText("apps/web/app/revoke/page.tsx");

  for (const token of [
    "Agent proof",
    "Recovered signer",
    "Live resolver",
    "agentNode",
    "ownerNode"
  ]) {
    assert.match(agentSource, new RegExp(token), `${token} should be visible in agent proof UI`);
  }

  assert.match(runPageSource, /Intentional demo route/);
  assert.match(revokePageSource, /Intentional demo route/);
});

test("new owner and agent UI controls are wired to concrete interactions", async () => {
  const dashboardSource = await readText("apps/web/components/OwnerDashboardView.tsx");
  const agentSource = await readText("apps/web/components/AgentProfileView.tsx");

  assert.match(dashboardSource, /setViewMode\("grid"\)/);
  assert.match(dashboardSource, /setViewMode\("list"\)/);
  assert.match(dashboardSource, /aria-pressed=\{viewMode === "grid"\}/);
  assert.match(dashboardSource, /aria-pressed=\{viewMode === "list"\}/);
  assert.match(dashboardSource, /status === "disabled" \? "Enable" : "Revoke"/);
  assert.match(dashboardSource, /#agent-management-delete-title/);

  for (const token of [
    "useSendTransaction",
    "writeAgentStatus",
    "#agent-management-policy-title",
    "depositGasBudget",
    "withdrawGasBudget",
    "agent-gas-add-input",
    "agent-gas-withdraw-input",
    "Max"
  ]) {
    assert.match(agentSource, new RegExp(token), `${token} should be wired in the agent page`);
  }
});

test("delete flow blocks wrapped deletes and encodes unwrapped subname deletion", async () => {
  const { buildAgentDeletePlan } = await import("../apps/web/lib/agentDelete.ts");
  const { AGENT_ENS_EXECUTOR_ABI, ENS_REGISTRY_ABI, PUBLIC_RESOLVER_ABI, ZERO_ADDRESS } = await import("../apps/web/lib/contracts.ts");

  const blocked = buildAgentDeletePlan({
    agentLabel: "assistant",
    agentNode: AGENT_NODE,
    ensRegistryAddress: ENS_REGISTRY_ADDRESS,
    isOwnerWrapped: true,
    ownerAgentLabels: ["assistant"],
    ownerNode: OWNER_NODE,
    ownerResolverAddress: RESOLVER_ADDRESS
  });
  assert.equal(blocked.canDelete, false);
  assert.match(blocked.reason ?? "", /wrapped/i);
  assert.deepEqual(blocked.calls, []);

  const plan = buildAgentDeletePlan({
    agentLabel: "assistant",
    agentNode: AGENT_NODE,
    ensRegistryAddress: ENS_REGISTRY_ADDRESS,
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: 123n,
    isOwnerWrapped: false,
    ownerAgentLabels: ["assistant", "worker"],
    ownerNode: OWNER_NODE,
    ownerResolverAddress: RESOLVER_ADDRESS
  });
  assert.equal(plan.canDelete, true);
  assert.equal(plan.calls.length, 3);

  const withdrawCall = decodeFunctionData({ abi: AGENT_ENS_EXECUTOR_ABI, data: plan.calls[0].data });
  assert.equal(withdrawCall.functionName, "withdrawGasBudget");
  assert.deepEqual(withdrawCall.args, [AGENT_NODE, 123n]);
  assert.equal(plan.calls[0].label, "withdrawGasBudget");
  assert.equal(plan.calls[0].to, EXECUTOR_ADDRESS);

  const registryCall = decodeFunctionData({ abi: ENS_REGISTRY_ABI, data: plan.calls[1].data });
  assert.equal(registryCall.functionName, "setSubnodeRecord");
  assert.deepEqual(registryCall.args, [OWNER_NODE, labelhash("assistant"), ZERO_ADDRESS, ZERO_ADDRESS, 0n]);

  const resolverCall = decodeFunctionData({ abi: PUBLIC_RESOLVER_ABI, data: plan.calls[2].data });
  assert.equal(resolverCall.functionName, "multicall");
  const textCalls = resolverCall.args[0].map((data) => decodeFunctionData({ abi: PUBLIC_RESOLVER_ABI, data }));
  assert.deepEqual(
    textCalls.map((call) => call.args),
    [
      [OWNER_NODE, "agentpassports.v", "1"],
      [OWNER_NODE, "agentpassports.agents", "worker"]
    ]
  );
});

test("delete flow skips gas withdrawal when there is no remaining agent budget", async () => {
  const { buildAgentDeletePlan } = await import("../apps/web/lib/agentDelete.ts");

  const plan = buildAgentDeletePlan({
    agentLabel: "assistant",
    agentNode: AGENT_NODE,
    ensRegistryAddress: ENS_REGISTRY_ADDRESS,
    executorAddress: EXECUTOR_ADDRESS,
    gasBudgetWei: 0n,
    isOwnerWrapped: false,
    ownerAgentLabels: ["assistant"],
    ownerNode: OWNER_NODE,
    ownerResolverAddress: RESOLVER_ADDRESS
  });

  assert.equal(plan.canDelete, true);
  assert.deepEqual(plan.calls.map((call) => call.label), ["deleteSubname", "setOwnerIndex"]);
});

test("delete flow blocks positive gas budget deletion without executor withdrawal target", async () => {
  const { buildAgentDeletePlan } = await import("../apps/web/lib/agentDelete.ts");

  const plan = buildAgentDeletePlan({
    agentLabel: "assistant",
    agentNode: AGENT_NODE,
    ensRegistryAddress: ENS_REGISTRY_ADDRESS,
    gasBudgetWei: 1n,
    isOwnerWrapped: false,
    ownerAgentLabels: ["assistant"],
    ownerNode: OWNER_NODE,
    ownerResolverAddress: RESOLVER_ADDRESS
  });

  assert.equal(plan.canDelete, false);
  assert.match(plan.reason ?? "", /gas budget withdrawal/i);
  assert.deepEqual(plan.calls, []);
});

test("delete flow blocks wrapped agent subnames and waits for deletion receipts before reporting success", async () => {
  const { buildAgentDeletePlan } = await import("../apps/web/lib/agentDelete.ts");
  const managementSource = await readText("apps/web/components/AgentManagementPanel.tsx");

  const blocked = buildAgentDeletePlan({
    agentLabel: "assistant",
    agentNode: AGENT_NODE,
    ensRegistryAddress: ENS_REGISTRY_ADDRESS,
    isAgentWrapped: true,
    isOwnerWrapped: false,
    ownerAgentLabels: ["assistant"],
    ownerNode: OWNER_NODE,
    ownerResolverAddress: RESOLVER_ADDRESS
  });
  assert.equal(blocked.canDelete, false);
  assert.match(blocked.reason ?? "", /wrapped agent/i);

  for (const token of ["waitForTransactionReceipt", "onDeleted", "Delete agent transactions confirmed"]) {
    assert.match(managementSource, new RegExp(token), `${token} should be used by the delete UI`);
  }
});
