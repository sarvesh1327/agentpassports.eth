import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("KeeperHub MCP prompt guides agents through the thin build/sign/submit flow", async () => {
  const { KEEPERHUB_GATE_PROMPT_NAME, buildKeeperHubGatePromptText } = await import("../packages/mcp-server/src/prompts.ts");

  assert.equal(KEEPERHUB_GATE_PROMPT_NAME, "agentpassport_keeperhub_gate");
  const prompt = buildKeeperHubGatePromptText({
    agentName: "assistant.agentpassports.eth",
    task: "Record a KeeperHub-gated task",
    metadataURI: "ipfs://keeperhub-proof"
  });

  assert.match(prompt, /build_task_intent/);
  assert.match(prompt, /build-task-intent\.json/);
  assert.match(prompt, /sign locally outside MCP/i);
  assert.match(prompt, /skills\/agentpassports\/sign-intent\.ts/);
  assert.match(prompt, /\.agentPassports\/keys\.txt/);
  assert.match(prompt, /submit_task/);
  assert.match(prompt, /check_task_status/);
  assert.match(prompt, /KeeperHub as the Passport\/Visa validator/i);
  assert.match(prompt, /tx hash|KeeperHub error/i);
  assert.match(prompt, /MCP must not resolve ENS/i);
  assert.match(prompt, /read policy/i);
  assert.match(prompt, /check active status/i);
  assert.match(prompt, /receive private keys/i);
  assert.doesNotMatch(prompt, /resolve_agent_passport/);
  assert.doesNotMatch(prompt, /keeperhub_validate_agent_task/);
  assert.doesNotMatch(prompt, /keeperhub_build_workflow_payload/);
});

test("KeeperHub MCP resource guide exposes thin tool order and safety boundaries", async () => {
  const { KEEPERHUB_GATE_RESOURCE_TEMPLATE, buildKeeperHubResourceGuide } = await import("../packages/mcp-server/src/resources.ts");

  assert.equal(KEEPERHUB_GATE_RESOURCE_TEMPLATE, "agentpassport://keeperhub/{agentName}");
  const guide = buildKeeperHubResourceGuide("Assistant.AgentPassports.eth");

  assert.equal(guide.agentName, "assistant.agentpassports.eth");
  assert.equal(guide.policyAuthority, "KeeperHub");
  assert.equal(guide.workflowName, "AgentPassports Execute ENS-Verified Task");
  assert.equal(guide.executionMode, "thin-mcp-live-keeperhub-submit");
  assert.equal(guide.liveKeeperHubSubmit, true);
  assert.deepEqual(guide.requiredToolOrder, ["build_task_intent", "submit_task", "check_task_status"]);
  assert.ok(guide.safetyBoundaries.some((item) => /does not resolve ENS/i.test(item)));
  assert.ok(guide.safetyBoundaries.some((item) => /does not read or validate Visa policy/i.test(item)));
  assert.ok(guide.safetyBoundaries.some((item) => /KeeperHub owns Passport\/Visa validation/i.test(item)));
  assert.equal(guide.signingScript, "skills/agentpassports/sign-intent.ts");
  assert.equal(guide.keypairScript, "skills/agentpassports/create-key.ts");
  assert.equal(JSON.stringify(guide).includes("privateKey"), false);
});

test("tracked KeeperHub action-pack artifacts remain secret-free until MCP docs are rewritten", async () => {
  const actionPack = await readText("packages/mcp-server/keeperhub/action-pack.md");
  const workflowTemplate = JSON.parse(await readText("packages/mcp-server/keeperhub/workflow-template.json"));
  const attestationSchema = JSON.parse(await readText("packages/mcp-server/keeperhub/run-attestation-schema.json"));

  assert.match(actionPack, /KeeperHub/i);
  assert.match(actionPack, /Passport/i);
  assert.match(actionPack, /Visa/i);
  assert.doesNotMatch(actionPack, /kh_[A-Za-z0-9]/);

  assert.equal(workflowTemplate.name, "AgentPassports Execute ENS-Verified Task");
  assert.equal(JSON.stringify(workflowTemplate).includes("privateKey"), false);

  assert.equal(attestationSchema.$id, "agentpassport.keeperhubRunAttestation.v1");
  assert.equal(attestationSchema.required.includes("decision"), true);
  assert.deepEqual(attestationSchema.properties.decision.enum, ["approved", "blocked"]);
});
