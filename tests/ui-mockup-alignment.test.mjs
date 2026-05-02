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
  const landing = await readText("apps/web/components/LandingPage.tsx");
  const header = await readText("apps/web/components/SiteHeader.tsx");

  assert.doesNotMatch(page, /demo/i);
  assert.match(page, /LandingPage/);
  assert.match(landing, /landing-product-card/);
  assert.match(landing, /useAccount/);
  assert.match(landing, /useEnsName/);
  assert.match(landing, /Register agents\. Issue Visas\. Revoke access onchain\./);
  assert.match(landing, /Dashboard and registration are wallet-gated/);
  assert.match(landing, /ProductPreview/);
  assert.match(landing, /WalletPromptModal/);
  assert.doesNotMatch(page, /LandingOwnerPreview/);
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
  assert.match(agent, /agent-detail--permission-manager/);
  assert.match(agent, /agent-detail__protocol-strip/);
  assert.match(agent, /KeeperHub Stamps/);
  assert.match(agent, /Visa Scope/);
  assert.match(agent, /status-pill/);
  assert.match(agent, /metric-card/);
  assert.match(management, /action-button/);
  assert.match(history, /record-table__icon/);
  assert.match(proof, /policy-source-badge/);
});

test("agent fact table labels and values can shrink and wrap without overlap", async () => {
  const css = await readText("apps/web/app/globals.css");

  assert.match(css, /\.agent-fact-table div\s*{[^}]*align-items:\s*start/s);
  assert.match(css, /\.agent-fact-table div\s*{[^}]*grid-template-columns:\s*minmax\(140px,\s*0\.55fr\)\s+minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.agent-fact-table dt\s*{[^}]*min-width:\s*0/s);
  assert.match(css, /\.agent-fact-table dt\s*{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.agent-fact-table dd\s*{[^}]*min-width:\s*0/s);
  assert.match(css, /\.agent-fact-table dd\s*{[^}]*overflow-wrap:\s*anywhere/s);
});

test("register page label and value rows can shrink and wrap without overlap", async () => {
  const css = await readText("apps/web/app/globals.css");

  assert.match(css, /\.segmented-control\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(145px,\s*1fr\)\)/s);
  assert.match(css, /\.segmented-control button\s*{[^}]*min-width:\s*0/s);
  assert.match(css, /\.segmented-control button\s*{[^}]*white-space:\s*normal/s);
  assert.match(css, /\.segmented-control button\s*{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.register-preview-list div\s*{[^}]*align-items:\s*start/s);
  assert.match(css, /\.register-preview-list dt\s*{[^}]*min-width:\s*0/s);
  assert.match(css, /\.register-preview-list dt\s*{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.register-preview-list dd\s*{[^}]*min-width:\s*0/s);
  assert.match(css, /\.register-preview-list dd\s*{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.record-table__row\s*{[^}]*align-items:\s*start/s);
  assert.match(css, /\.record-table__row span\s*{[^}]*min-width:\s*0/s);
  assert.match(css, /\.record-table__row span\s*{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.record-table__row strong\s*{[^}]*min-width:\s*0/s);
  assert.match(css, /\.record-table__row strong\s*{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.register-step__heading,\s*\.register-side-card__header\s*{[^}]*align-items:\s*flex-start/s);
  assert.match(css, /\.register-step__heading,\s*\.register-side-card__header\s*{[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /\.register-step__heading h2,\s*\.register-side-card__header h2,\s*\.register-side-card__header h3\s*{[^}]*min-width:\s*0/s);
  assert.match(css, /\.register-step__heading h2,\s*\.register-side-card__header h2,\s*\.register-side-card__header h3\s*{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.register-step__heading strong\s*{[^}]*min-width:\s*0/s);
  assert.match(css, /\.register-step__heading strong\s*{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.register-side-card__header > span\s*{[^}]*min-width:\s*0/s);
  assert.match(css, /\.register-side-card__header > span\s*{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.record-table__footer\s*{[^}]*background:/s);
  assert.match(css, /\.record-table__toggle\s*{[^}]*width:\s*100%/s);
});

test("MCP page uses polished setup cards and no demo wording", async () => {
  const mcp = await readText("apps/web/app/mcp/page.tsx");

  assert.doesNotMatch(mcp, /demo/i);
  assert.match(mcp, /mcp-setup-grid/);
  assert.match(mcp, /code-pill/);
  assert.match(mcp, /status-pill/);
  assert.match(mcp, /glass-panel/);
});
