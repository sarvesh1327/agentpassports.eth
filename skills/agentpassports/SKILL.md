# AgentPassports Skill

Use this skill when a user asks an agent to act through AgentPassports.eth, prove it is authorized by an ENS owner, check an ENS policy, sign a task intent, or submit work through the AgentPassports MCP server.

AgentPassports is an ENS-native authorization protocol for agents. An owner publishes an agent passport under ENS, including the agent signer address, exact lifecycle status, and an owner-defined policy. The agent must treat ENS as the source of truth before signing or submitting any task.

This skill has two operating parts:

1. [`key-setup.md`](./key-setup.md) teaches an agent how to find or provision its local signing key and how to ask the user to complete setup in the UI.
2. [`mcp-safety-flow.md`](./mcp-safety-flow.md) teaches an agent how to interact with the AgentPassports MCP server and follow the required safety flow before signing.

## Core rule

Never sign or submit work just because the user asks. First confirm the agent is registered, active, policy-authorized, and controlled by the local private key that will sign the intent.
