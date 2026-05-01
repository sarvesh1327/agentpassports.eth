import assert from "node:assert/strict";
import test from "node:test";

test("connected agent ENS autofill uses reverse ENS only while the agent field is untouched", async () => {
  const { readAgentEnsAutofill } = await import("../apps/web/lib/agentSession.ts");

  assert.equal(
    readAgentEnsAutofill({
      currentAgentName: "",
      hasUserEditedAgentName: false,
      reverseEnsName: "Assistant.AgentPassports.eth"
    }),
    "assistant.agentpassports.eth"
  );
  assert.equal(
    readAgentEnsAutofill({
      currentAgentName: "manual.agentpassports.eth",
      hasUserEditedAgentName: false,
      reverseEnsName: "assistant.agentpassports.eth"
    }),
    null
  );
  assert.equal(
    readAgentEnsAutofill({
      currentAgentName: "",
      hasUserEditedAgentName: true,
      reverseEnsName: "assistant.agentpassports.eth"
    }),
    null
  );
});

test("connected agent ENS autofill falls back to verified backend directory entries", async () => {
  const { readAgentEnsAutofill } = await import("../apps/web/lib/agentSession.ts");

  assert.equal(
    readAgentEnsAutofill({
      currentAgentName: "",
      directoryAgentName: "Directory.AgentPassports.eth",
      hasUserEditedAgentName: false,
      reverseEnsName: null
    }),
    "directory.agentpassports.eth"
  );
  assert.equal(
    readAgentEnsAutofill({
      currentAgentName: "",
      directoryAgentName: "directory.agentpassports.eth",
      hasUserEditedAgentName: false,
      reverseEnsName: "Reverse.AgentPassports.eth"
    }),
    "reverse.agentpassports.eth"
  );
});

test("agent session derives the owner ENS from the selected agent subname", async () => {
  const { readImmediateOwnerName } = await import("../apps/web/lib/agentSession.ts");

  assert.equal(readImmediateOwnerName("assistant.agentpassports.eth"), "agentpassports.eth");
  assert.equal(readImmediateOwnerName("assistant.team.agentpassports.eth"), "team.agentpassports.eth");
  assert.equal(readImmediateOwnerName("agentpassports.eth"), "eth");
  assert.equal(readImmediateOwnerName(""), null);
});

test("agent session maps live ENS text reads into every passport metadata key", async () => {
  const { mapAgentTextRecords } = await import("../apps/web/lib/agentSession.ts");
  const { AGENT_TEXT_RECORD_KEYS } = await import("../apps/web/lib/contracts.ts");

  const records = mapAgentTextRecords([
    { result: "1", status: "success" },
    { result: "agentpassports.eth", status: "success" }
  ]);

  assert.equal(records.length, AGENT_TEXT_RECORD_KEYS.length);
  assert.deepEqual(records.slice(0, 3), [
    { key: "agent_v", value: "1" },
    { key: "agent_owner", value: "agentpassports.eth" },
    { key: "agent_kind", value: "Unknown" }
  ]);
});
