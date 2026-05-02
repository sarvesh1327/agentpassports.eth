# AgentPassports Skill

Use this skill when a user asks an agent to act through AgentPassports.eth, build an AgentPassports task intent, sign it outside MCP, submit a signed intent through the AgentPassports MCP server to KeeperHub, or check a submitted KeeperHub execution's final status.

AgentPassports is the agent identity/authorization protocol. An ENS owner can publish an agent signer and owner-defined policy, but in the current KeeperHub flow the **MCP server is intentionally thin**: it does not resolve ENS, read policies, validate active status, check signer ownership, or decide whether a task is allowed. KeeperHub owns the Passport/Visa validation and returns the success or error back to the agent.

## Product model

```text
AgentPassports = passport / visa data model
KeeperHub = validation + execution gate
MCP server = build unsigned intent + submit signed intent + check KeeperHub execution status
Skill scripts = local key creation and local signing
```

## Skill parts

1. [`key-setup.md`](./key-setup.md) explains local key storage and the skill-provided `create-key.ts` helper. Key creation is **not** an MCP tool.
2. [`mcp-safety-flow.md`](./mcp-safety-flow.md) explains the only MCP task flow: `build_task_intent` → local signing → `submit_task` → `check_task_status`.
3. [`sign-intent.ts`](./sign-intent.ts) signs the exact build output locally from `.agentPassports/keys.txt`; the private key never goes to MCP.

## Core rule

Do not ask MCP to perform policy or identity checks. MCP should only build the unsigned intent from explicit inputs, submit the externally signed payload to KeeperHub, and read KeeperHub execution status/logs by execution id. If KeeperHub rejects or errors, return KeeperHub's result to the user instead of inventing a backend-side authorization decision.

## Owner-funded Uniswap support

Owner-funded Uniswap swaps use the same thin MCP flow. The owner wallet holds `tokenIn` and approves `AgentEnsExecutor`; the agent wallet only signs exact router calldata and should not hold gas token or user funds. Use `mcp-safety-flow.md` plus `sign-intent.ts` for this path: build a `SwapRouter02.exactInputSingle` intent with explicit `callData`, sign the returned typed data locally, submit with `ownerFundedErc20` (`tokenIn`, `amount`) and `swapContext` (`tokenOut`, recipient/slippage/deadline/chain metadata), then use `check_task_status` for KeeperHub evidence from `AgentEnsExecutor.executeOwnerFundedERC20`.
