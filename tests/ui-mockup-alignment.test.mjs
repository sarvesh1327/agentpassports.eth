import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("mockup visual system tokens and reusable surfaces are present", async () => {
  const css = await readText("apps/web/app/globals.css");

  for (const token of [
    "--surface-raised",
    "--accent-blue",
    "--accent-indigo",
    "--shadow-soft",
    "--radius-xl",
    ".metric-card",
    ".status-pill",
    ".action-button",
    ".code-pill",
    ".glass-panel",
    "linear-gradient"
  ]) {
    assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${token} should exist`);
  }
});

test("landing page matches product UI and dashboard navigation requirements", async () => {
  const page = await readText("apps/web/app/page.tsx");
  const entry = await readText("apps/web/components/OwnerDashboardEntry.tsx");
  const header = await readText("apps/web/components/SiteHeader.tsx");

  assert.doesNotMatch(page, /demo/i);
  assert.match(page, /landing-product-preview/);
  assert.match(page, /Open owner dashboard/);
  assert.match(entry, /router\.push\(`\/owner\/\$\{encodeURIComponent\(normalizedOwnerName\)\}`\)/);
  assert.doesNotMatch(entry, /encodeURIComponent\(ownerName\)/);
  assert.match(header, /href="\/mcp"/);
  assert.match(header, /href="https:\/\/github\.com\/sarvesh1327\/agentpassports\.eth"/);
});

test("wallet connection prefers ENS name over raw address when reverse ENS is available", async () => {
  const source = await readText("apps/web/components/WalletConnection.tsx");

  assert.match(source, /ConnectButton\.Custom/);
  assert.match(source, /useEnsName/);
  assert.match(source, /displayName = ensName/);
  assert.match(source, /account\.displayName/);
  assert.match(source, /wallet-identity__ens/);
});

test("owner dashboard and agent detail use mockup-aligned cards and chips", async () => {
  const owner = await readText("apps/web/components/OwnerDashboardView.tsx");
  const agent = await readText("apps/web/components/AgentProfileView.tsx");
  const management = await readText("apps/web/components/AgentManagementPanel.tsx");
  const history = await readText("apps/web/components/TaskHistoryPanel.tsx");
  const proof = await readText("apps/web/components/EnsProofPanel.tsx");

  assert.match(owner, /metric-card/);
  assert.match(owner, /status-pill/);
  assert.match(owner, /action-button/);
  assert.match(owner, /owner-dashboard__preview/);
  assert.match(agent, /agent-detail__hero/);
  assert.match(agent, /status-pill/);
  assert.match(agent, /metric-card/);
  assert.match(management, /action-button/);
  assert.match(history, /record-table__icon/);
  assert.match(proof, /policy-source-badge/);
});

test("MCP page uses polished setup cards and no demo wording", async () => {
  const mcp = await readText("apps/web/app/mcp/page.tsx");

  assert.doesNotMatch(mcp, /demo/i);
  assert.match(mcp, /mcp-setup-grid/);
  assert.match(mcp, /code-pill/);
  assert.match(mcp, /status-pill/);
  assert.match(mcp, /glass-panel/);
});
