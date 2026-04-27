# AgentPassport.eth — ENS-Native Agent Identity

AgentPassport.eth is an ENS-first hackathon project that turns ENS into a public identity and control plane for onchain AI agents.

A user binds an autonomous agent to an ENS subname such as `assistant.alice.eth`, publishes the agent address and metadata in ENS records, and funds a limited execution budget. The agent signs EIP-712 task intents. The executor contract resolves the current agent address from ENS at execution time, verifies the signature, checks policy, executes an allowed task, and reimburses the relayer from the owner-funded gas budget.

## Core demo

1. User owns an ENS name, for example `alice.eth` or a Sepolia test ENS name.
2. User creates/configures an agent subname, for example `assistant.alice.eth`.
3. ENS records are written for the agent:
   - `addr(assistant.alice.eth) = 0xAgent`
   - `text(agent.owner) = alice.eth`
   - `text(agent.capabilities) = task-log,sponsored-execution`
   - `text(agent.executor) = 0xAgentPolicyExecutor`
   - `text(agent.status) = active`
4. User creates an onchain policy and deposits a gas budget.
5. Agent signs an EIP-712 intent to record a task onchain.
6. Relayer submits the transaction.
7. `AgentPolicyExecutor` resolves the agent address from ENS live, verifies the signature, checks policy, executes `TaskLog.recordTask`, and reimburses the relayer.
8. User revokes the agent by changing the ENS address record or disabling policy.
9. The same old signature now fails, proving ENS is part of authorization and revocation.

## Why ENS is central

ENS is not used as a decorative profile. It provides:

- Human-readable agent identity.
- Live resolution of the authorized signer address.
- Public metadata through text records.
- Discoverability through ENS names/subnames.
- Revocation by changing the ENS record.
- A public control plane for delegated agent execution.

The executor must resolve the agent address from ENS during `execute()`. Do not hard-code or permanently store the agent signer address in the executor.

## Recommended MVP stack

- Frontend: Next.js, TypeScript, wagmi, viem, RainbowKit, Tailwind.
- Contracts: Solidity, Foundry, OpenZeppelin.
- Agent runner: Node.js/TypeScript script that signs EIP-712 typed data.
- Relayer: Next.js API route or small Node service.
- Network: Sepolia first.

## Setup

Prerequisites:

- Node.js 22 or newer.
- pnpm 9 or newer.
- Foundry for Solidity build, test, and deployment.

Install JavaScript dependencies:

```bash
pnpm install
```

Copy environment templates before running local services:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp agent-runner/.env.example agent-runner/.env
cp contracts/.env.example contracts/.env
```

Run the repository structure test:

```bash
pnpm test
```

Run the web app:

```bash
pnpm --filter @agentpassport/web dev
```

Run contract tests after contracts are implemented:

```bash
forge test
```

Run the agent runner after the signing flow is implemented:

```bash
pnpm agent:run
```

## Markdown docs in this package

| File | Purpose |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | Coding-agent instructions and project invariants. |
| [`docs/PRD.md`](./docs/PRD.md) | Product requirements. |
| [`docs/IMPLEMENTATION_SPEC.md`](./docs/IMPLEMENTATION_SPEC.md) | End-to-end technical spec. |
| [`docs/ENS_RECORDS.md`](./docs/ENS_RECORDS.md) | ENS records, schema, and write/read behavior. |
| [`docs/CONTRACTS_SPEC.md`](./docs/CONTRACTS_SPEC.md) | Solidity contract APIs, structs, events, and tests. |
| [`docs/FRONTEND_SPEC.md`](./docs/FRONTEND_SPEC.md) | Frontend pages, components, and UX requirements. |
| [`docs/RELAYER_AND_AGENT_RUNNER_SPEC.md`](./docs/RELAYER_AND_AGENT_RUNNER_SPEC.md) | Relayer endpoint and agent signing flow. |
| [`docs/TASKS.md`](./docs/TASKS.md) | Implementation backlog for coding agents. |
| [`docs/SECURITY_CHECKLIST.md`](./docs/SECURITY_CHECKLIST.md) | Security constraints and review checklist. |
| [`docs/DEMO_SCRIPT.md`](./docs/DEMO_SCRIPT.md) | Hackathon demo script. |
| [`docs/ACCEPTANCE_CRITERIA.md`](./docs/ACCEPTANCE_CRITERIA.md) | Definition of done. |

## Minimal repository structure to generate

```txt
agent-passport-ens/
  README.md
  AGENTS.md
  apps/
    web/
      app/
      components/
      lib/
      pages/api/relayer/execute.ts
  contracts/
    src/
      AgentPolicyExecutor.sol
      TaskLog.sol
    test/
      AgentPolicyExecutor.t.sol
      TaskLog.t.sol
    script/
      Deploy.s.sol
  agent-runner/
    src/
      index.ts
      signIntent.ts
      planTask.ts
  docs/
```

## Contract names

- `AgentPolicyExecutor.sol`
- `TaskLog.sol`
- Optional stretch: `AgentSubnameRegistrar.sol`

## Most important implementation rule

```txt
The executor must resolve the current agent address from ENS every time it verifies a task.
```

That single rule makes ENS the identity, authorization, and revocation mechanism.

## License

Licensed under the [Apache License 2.0](./LICENSE).
