import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const KEEPERHUB_GATE_PROMPT_NAME = "agentpassport_keeperhub_gate";

type KeeperHubGatePromptArgs = {
  agentName: string;
  task: string;
  metadataURI?: string;
};

/**
 * Builds the human/agent-facing KeeperHub prompt text separately from MCP
 * registration so tests can lock the thin safety boundary without constructing
 * a server.
 */
export function buildKeeperHubGatePromptText(args: KeeperHubGatePromptArgs): string {
  return [
    `Prepare a KeeperHub-submitted AgentPassports task for ${args.agentName}.`,
    `Requested task: ${args.task}`,
    args.metadataURI ? `Preferred metadataURI: ${args.metadataURI}` : "Choose or ask for a metadataURI before building the intent.",
    "",
    "Thin MCP / KeeperHub-authoritative flow:",
    "1. Call build_task_intent with explicit task + policySnapshot inputs to get unsigned intent JSON, calldata, and signingPayload.",
    "2. Save the exact build_task_intent response as build-task-intent.json.",
    "3. Sign locally outside MCP using skills/agentpassports/sign-intent.ts and the local .agentPassports/keys.txt file.",
    "4. Call submit_task with intent, policySnapshot, callData, and signature. It returns the KeeperHub execution id/handle by default; do not wait inside the MCP call.",
    "5. Call check_task_status with the KeeperHub execution id to read final/current status, logs, and tx hashes.",
    "6. Treat KeeperHub as the Passport/Visa validator. Return KeeperHub execution id, status/logs, tx hash, or KeeperHub error back to the user.",
    "",
    "MCP must not resolve ENS, read policy, check active status, verify signer ownership, check target/selector/value, create keys, or receive private keys."
  ].join("\n");
}

/** Registers the canonical thin AgentPassports task prompt. */
export function registerAgentPassportPrompts(server: McpServer): void {
  server.registerPrompt(
    "agentpassport_execute_task",
    {
      title: "Execute an AgentPassport task through KeeperHub",
      description:
        "Guide an autonomous agent through the thin MCP flow: build unsigned intent, sign outside MCP with the skill script, submit signed payload to KeeperHub, then check final status by execution id.",
      argsSchema: {
        agentName: z.string().describe("Agent ENS name, for example assistant.alice.eth."),
        task: z.string().describe("Natural-language task to record through AgentPassports."),
        metadataURI: z.string().optional().describe("Task metadata URI to store in TaskLog. Use a short proof URI or ipfs:// URI when available.")
      }
    },
    (args) => ({
      description: "AgentPassports thin KeeperHub task execution flow",
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

  server.registerPrompt(
    KEEPERHUB_GATE_PROMPT_NAME,
    {
      title: "Submit an AgentPassports task to KeeperHub",
      description:
        "Build an unsigned AgentPassports intent, sign it outside MCP, submit it to KeeperHub, and check KeeperHub final status without MCP-side policy checks.",
      argsSchema: {
        agentName: z.string().describe("Agent ENS name, for example assistant.alice.eth."),
        task: z.string().describe("Natural-language task to submit to KeeperHub."),
        metadataURI: z.string().optional().describe("Optional proof URI to include in the built intent and KeeperHub payload.")
      }
    },
    (args) => ({
      description: "AgentPassports KeeperHub-authoritative submit flow",
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
