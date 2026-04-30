import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("KeeperHub MCP prompt guides agents through the V3 gate safely", async () => {
  const { KEEPERHUB_GATE_PROMPT_NAME, buildKeeperHubGatePromptText } = await import("../packages/mcp-server/src/prompts.ts");

  assert.equal(KEEPERHUB_GATE_PROMPT_NAME, "agentpassport_keeperhub_gate");
  const prompt = buildKeeperHubGatePromptText({
    agentName: "assistant.agentpassports.eth",
    task: "Record a KeeperHub-gated task",
    metadataURI: "ipfs://keeperhub-proof"
  });

  assert.match(prompt, /resolve_agent_passport/);
  assert.match(prompt, /keeperhub_validate_agent_task/);
  assert.match(prompt, /keeperhub_build_workflow_payload/);
  assert.match(prompt, /external signing/i);
  assert.match(prompt, /keeperhub_emit_run_attestation/);
  assert.match(prompt, /approved/i);
  assert.match(prompt, /blocked/i);
  assert.match(prompt, /never paste/i);
  assert.match(prompt, /private key/i);
  assert.match(prompt, /does not call live KeeperHub APIs/i);
});

test("KeeperHub MCP resource guide exposes workflow order and safety boundaries", async () => {
  const { KEEPERHUB_GATE_RESOURCE_TEMPLATE, buildKeeperHubResourceGuide } = await import("../packages/mcp-server/src/resources.ts");

  assert.equal(KEEPERHUB_GATE_RESOURCE_TEMPLATE, "agentpassport://keeperhub/{agentName}");
  const guide = buildKeeperHubResourceGuide("Assistant.AgentPassports.eth");

  assert.equal(guide.agentName, "assistant.agentpassports.eth");
  assert.equal(guide.policySource, "ENS");
  assert.equal(guide.workflowName, "AgentPassports Execute ENS-Verified Task");
  assert.deepEqual(guide.requiredToolOrder, [
    "resolve_agent_passport",
    "keeperhub_validate_agent_task",
    "keeperhub_build_workflow_payload",
    "keeperhub_emit_run_attestation"
  ]);
  assert.ok(guide.safetyBoundaries.some((item) => /private keys/i.test(item)));
  assert.ok(guide.safetyBoundaries.some((item) => /no live KeeperHub API/i.test(item)));
  assert.equal(guide.runAttestationSchema.schema, "agentpassport.keeperhubRunAttestation.v1");
  assert.equal(JSON.stringify(guide).includes("privateKey"), false);
});

test("tracked KeeperHub action-pack artifacts are concrete and secret-free", async () => {
  const actionPack = await readText("packages/mcp-server/keeperhub/action-pack.md");
  const workflowTemplate = JSON.parse(await readText("packages/mcp-server/keeperhub/workflow-template.json"));
  const attestationSchema = JSON.parse(await readText("packages/mcp-server/keeperhub/run-attestation-schema.json"));

  assert.match(actionPack, /AgentPassports is the ENS trust firewall/i);
  assert.match(actionPack, /KeeperHub/i);
  assert.match(actionPack, /keeperhub_validate_agent_task/);
  assert.match(actionPack, /keeperhub_build_workflow_payload/);
  assert.match(actionPack, /keeperhub_emit_run_attestation/);
  assert.match(actionPack, /external signing/i);
  assert.match(actionPack, /does not include secrets/i);
  assert.doesNotMatch(actionPack, /kh_[A-Za-z0-9]/);

  assert.equal(workflowTemplate.name, "AgentPassports Execute ENS-Verified Task");
  assert.deepEqual(workflowTemplate.requiredToolOrder, [
    "resolve_agent_passport",
    "keeperhub_validate_agent_task",
    "keeperhub_create_gate_workflow",
    "keeperhub_execute_approved_workflow",
    "keeperhub_get_execution_status",
    "keeperhub_get_execution_logs",
    "keeperhub_emit_run_attestation"
  ]);
  assert.equal(workflowTemplate.executionMode, "live-keeperhub-api");
  assert.equal(workflowTemplate.liveKeeperHubSubmit, true);
  assert.equal(JSON.stringify(workflowTemplate).includes("privateKey"), false);

  assert.equal(attestationSchema.$id, "agentpassport.keeperhubRunAttestation.v1");
  assert.equal(attestationSchema.required.includes("decision"), true);
  assert.deepEqual(attestationSchema.properties.decision.enum, ["approved", "blocked"]);
  assert.ok(attestationSchema.properties.keeperhubRunId);
  assert.ok(attestationSchema.properties.txHash);
});
