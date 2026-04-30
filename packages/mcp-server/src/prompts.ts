import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const KEEPERHUB_GATE_PROMPT_NAME = "agentpassport_keeperhub_gate";

type KeeperHubGatePromptArgs = {
  agentName: string;
  task: string;
  metadataURI?: string;
};

/**
 * Builds the human/agent-facing V3 KeeperHub prompt text separately from MCP
 * registration so tests can lock the safety flow without constructing a server.
 * Security boundary: this text must guide external signing only and must never
 * ask an agent to paste private-key material into MCP.
 */
export function buildKeeperHubGatePromptText(args: KeeperHubGatePromptArgs): string {
  return [
    `Prepare a KeeperHub-gated AgentPassports workflow for ${args.agentName}.`,
    `Requested task: ${args.task}`,
    args.metadataURI ? `Preferred metadataURI: ${args.metadataURI}` : "Choose or ask for a metadataURI before building a workflow payload.",
    "",
    "V3 KeeperHub Gate flow:",
    "1. Call resolve_agent_passport to read the live ENS resolver, addr(agent), gas budget, and AgentPassports text records.",
    "2. Call keeperhub_validate_agent_task to produce a deterministic approved or blocked decision from ENS status, policy digest, task limits, and trust threshold.",
    "3. If blocked, stop before execution and call keeperhub_emit_run_attestation with the blockers as audit evidence.",
    "4. If approved, call keeperhub_build_workflow_payload to create the unsigned KeeperHub workflow/action-pack payload.",
    "5. Use external signing only. MCP does not sign, does not call live KeeperHub APIs in this iteration, and must never receive a private key.",
    "6. Export or submit the workflow through a verified KeeperHub path outside MCP, then call keeperhub_emit_run_attestation with the KeeperHub run id and tx hash when available.",
    "7. Report the agentName, policy digest, approved/blocked decision, reasons, blockers, workflow payload URI or run id, and attestation JSON.",
    "",
    "Never paste private keys, never sign stale ENS policy, never approve on policy/preflight errors, and never bypass the KeeperHub Gate."
  ].join("\n");
}

/**
 * Registers the canonical V1 task-execution prompt. The prompt deliberately keeps
 * signing outside MCP: the server builds unsigned intent JSON, while the agent
 * signs locally with the skill-provided script and its .agentPassports key file.
 */
export function registerAgentPassportPrompts(server: McpServer): void {
  server.registerPrompt(
    "agentpassport_execute_task",
    {
      title: "Execute an AgentPassport task safely",
      description:
        "Guide an autonomous agent through ENS resolution, policy preflight, unsigned intent building, local skill signing, and relayer submission without exposing private keys to MCP.",
      argsSchema: {
        agentName: z.string().describe("Agent ENS name, for example assistant.alice.eth."),
        task: z.string().describe("Natural-language task to record through AgentPassports."),
        metadataURI: z.string().optional().describe("Task metadata URI to store in TaskLog. Use a short proof URI or ipfs:// URI when available.")
      }
    },
    (args) => ({
      description: "AgentPassports V1 ENS-policy task execution flow",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Execute an AgentPassports task for ${args.agentName}.`,
              `Requested task: ${args.task}`,
              args.metadataURI ? `Preferred metadataURI: ${args.metadataURI}` : "Choose or ask for a metadataURI before building the intent.",
              "",
              "Mandatory safety flow:",
              "1. Call resolve_agent_passport to read the live ENS resolver, addr(agent), and text records.",
              "2. Call get_agent_policy and confirm agent.status is exactly active and Policy source: ENS.",
              "3. Call check_task_against_policy. Never sign if it returns disallowed or if the policy digest does not match live ENS.",
              "4. Call build_task_intent to get unsigned intent JSON, calldata, and signingPayload. MCP does not sign and must not receive the private key.",
              "5. Save the build_task_intent response as build-task-intent.json and sign locally using the skill-provided sign-intent.ts script with .agentPassports/keys.txt.",
              "6. Verify the local script signer matches the live ENS addr(agent). Never sign or submit if it does not match.",
              "7. Call submit_task with the signed intent, policySnapshot, callData, and signature.",
              "8. Return the relayer result, transaction hash when available, agentName, policy digest, and the safety checks performed.",
              "",
              "Never sign stale policy, never bypass check_task_against_policy, and never paste or upload the private key."
            ].join("\n")
          }
        }
      ]
    })
  );

  server.registerPrompt(
    KEEPERHUB_GATE_PROMPT_NAME,
    {
      title: "Gate a KeeperHub workflow with AgentPassports",
      description:
        "Guide an autonomous agent through the V3 AgentPassports KeeperHub Gate: live ENS resolution, approved/blocked gate decision, unsigned workflow payload, external signing, and run attestation.",
      argsSchema: {
        agentName: z.string().describe("Agent ENS name, for example assistant.alice.eth."),
        task: z.string().describe("Natural-language task to gate before KeeperHub execution."),
        metadataURI: z.string().optional().describe("Optional proof URI to include when building the KeeperHub workflow payload.")
      }
    },
    (args) => ({
      description: "AgentPassports V3 KeeperHub Gate workflow",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: buildKeeperHubGatePromptText(args)
          }
        }
      ]
    })
  );
}
