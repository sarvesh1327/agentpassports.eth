# AgentPassports Skill

Use this skill when a user asks an agent to act through AgentPassports.eth, prove it is authorized by an ENS owner, check an ENS policy, sign a task intent, submit work through the AgentPassports MCP server, operate as a V2 Uniswap `Swapper` agent with the `uniswap-swap` capability, or run a KeeperHub V3 live workflow through the AgentPassports ENS gate.

AgentPassports is an ENS-native authorization protocol for agents. An owner publishes an agent passport under ENS, including the agent signer address, exact lifecycle status, and an owner-defined policy. The agent must treat ENS as the source of truth before signing, submitting, or executing any task.

## Product model

```text
AgentPassports = ENS trust firewall / policy gate
KeeperHub = execution runner
Run attestation = approved/blocked proof
```

KeeperHub V3 live execution is not a replacement for AgentPassports policy checks. AgentPassports decides whether an ENS agent is allowed to run; KeeperHub runs only after the gate approves; run attestations preserve proof of both approved and blocked paths.

This skill has two operating parts:

1. [`key-setup.md`](./key-setup.md) teaches an agent how to find or provision its local signing key and how to ask the user to complete setup in the UI.
2. [`mcp-safety-flow.md`](./mcp-safety-flow.md) teaches an agent how to interact with the AgentPassports MCP server and follow the required safety flow before signing.

## Core rule

Never sign, submit, quote, or execute work just because the user asks. First confirm the agent is registered, active, policy-authorized, and controlled by the local private key or wallet flow that will sign the intent or swap. For Swapper agents, also confirm the requested token pair, amount, slippage, chain, and proof metadata are allowed by the ENS-published Uniswap policy.
