import assert from "node:assert/strict";
import test from "node:test";

const INITIAL_AGENT_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const LIVE_AGENT_ADDRESS = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

test("agent profile display waits for live resolver reads before replacing demo address", async () => {
  const { resolveVisibleAgentAddress } = await import("../apps/web/lib/agentProfileDisplay.ts");

  assert.equal(
    resolveVisibleAgentAddress({
      agentAddressReadSettled: false,
      initialAgentAddress: INITIAL_AGENT_ADDRESS,
      resolverAddress: null,
      resolverReadSettled: false,
      resolvedAgentAddress: null
    }),
    INITIAL_AGENT_ADDRESS
  );
});

test("agent profile display treats live missing resolver or zero addr as no agent", async () => {
  const { resolveVisibleAgentAddress } = await import("../apps/web/lib/agentProfileDisplay.ts");

  assert.equal(
    resolveVisibleAgentAddress({
      agentAddressReadSettled: false,
      initialAgentAddress: INITIAL_AGENT_ADDRESS,
      resolverAddress: null,
      resolverReadSettled: true,
      resolvedAgentAddress: null
    }),
    null
  );
  assert.equal(
    resolveVisibleAgentAddress({
      agentAddressReadSettled: true,
      initialAgentAddress: INITIAL_AGENT_ADDRESS,
      resolverAddress: LIVE_AGENT_ADDRESS,
      resolverReadSettled: true,
      resolvedAgentAddress: null
    }),
    null
  );
});

test("agent profile display prefers live agent address once addr read settles", async () => {
  const { resolveVisibleAgentAddress } = await import("../apps/web/lib/agentProfileDisplay.ts");

  assert.equal(
    resolveVisibleAgentAddress({
      agentAddressReadSettled: true,
      initialAgentAddress: INITIAL_AGENT_ADDRESS,
      resolverAddress: LIVE_AGENT_ADDRESS,
      resolverReadSettled: true,
      resolvedAgentAddress: LIVE_AGENT_ADDRESS
    }),
    LIVE_AGENT_ADDRESS
  );
});

test("agent profile display parses capabilities and status from ENS text records", async () => {
  const { parseCapabilities, readPassportStatus } = await import("../apps/web/lib/agentProfileDisplay.ts");

  assert.deepEqual(parseCapabilities("task-log, sponsored-execution, ", ["fallback"]), [
    "task-log",
    "sponsored-execution"
  ]);
  assert.deepEqual(parseCapabilities("", ["fallback"]), ["fallback"]);
  assert.equal(readPassportStatus("disabled", LIVE_AGENT_ADDRESS), "disabled");
  assert.equal(readPassportStatus("", LIVE_AGENT_ADDRESS), "active");
  assert.equal(readPassportStatus("", null), "unknown");
});
