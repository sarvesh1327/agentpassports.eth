# AGENTS.md — Coding Agent Instructions

This file is intended for coding agents working on AgentPassport.eth.

## Product objective

Build an ENS-first hackathon MVP where an AI agent is represented by an ENS subname and can perform limited onchain tasks using an owner-funded gas budget.

The core value proposition:

```txt
ENS is the source of truth for the agent signer identity and public agent metadata.
```

## Non-negotiable invariants

1. **Do not hard-code the agent signer in the executor.**
   - The executor must resolve `addr(agentNode)` from ENS during `execute()`.
   - Old signatures must fail after the ENS `addr` record changes.

2. **Do not allow arbitrary target calls in the MVP.**
   - Policy must restrict target contract and function selector.
   - MVP target should be `TaskLog.recordTask(...)`.

3. **Always use nonces and expiries.**
   - Each signed intent must include `nonce` and `expiresAt`.
   - Executor must reject replayed or expired intents.

4. **ENS should be visible in the UI.**
   - Show owner ENS, agent ENS, resolver, resolved address, policy hash, and recovered signer.
   - The user/judge must see that live ENS resolution is being used.

5. **Keep the ENS track first.**
   - Do not build Uniswap, KeeperHub, Gensyn, or 0G integrations until the ENS MVP works.

6. **Use Sepolia first.**
   - Keep all addresses configurable through environment variables and constants.
   - Do not silently switch networks.

7. **Use the public resolver for MVP.**
   - Custom resolver is not required.
   - CCIP Read/offchain resolver is not required for MVP.

## MVP target behavior

A passing MVP demonstrates:

1. Agent ENS profile exists, for example `assistant.alice.eth`.
2. Agent ENS records include current agent address and metadata.
3. Owner creates a policy and gas budget.
4. Agent signs EIP-712 `TaskIntent`.
5. Relayer submits `execute(...)`.
6. Executor resolves current ENS agent address and validates the signature.
7. Executor calls `TaskLog.recordTask(...)`.
8. Relayer receives capped reimbursement.
9. Revocation by changing ENS `addr` or disabling policy causes the same old signature to fail.

## Required contracts

Create:

```txt
contracts/src/AgentEnsExecutor.sol
contracts/src/TaskLog.sol
```

Optional stretch:

```txt
contracts/src/AgentSubnameRegistrar.sol
```

## Required frontend pages

Create:

```txt
/register
/agent/[name]
/run
/revoke
```

or equivalent app-router routes.

## Required frontend components

Create:

```txt
EnsProofPanel.tsx
RegisterAgentForm.tsx
AgentPassportCard.tsx
RunTaskDemo.tsx
RevokeAgentPanel.tsx
```

## Required agent runner files

Create:

```txt
agent-runner/src/index.ts
agent-runner/src/signIntent.ts
agent-runner/src/planTask.ts
```

## Required relayer

Create one endpoint:

```txt
POST /api/relayer/execute
```

The endpoint accepts an intent, calldata, and signature, then submits `AgentEnsExecutor.execute(...)`.

## Implementation preferences

- Use TypeScript strictly.
- Use viem for encoding, typed data, and contract calls.
- Use wagmi/RainbowKit for wallet connection.
- Use Foundry for Solidity build/test/deploy unless the existing repo uses Hardhat.
- Use OpenZeppelin `EIP712`, `ECDSA`, and `ReentrancyGuard`.
- Keep environment variables documented in `.env.example`.

## Environment variables to support

```txt
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_ENS_REGISTRY=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
NEXT_PUBLIC_NAME_WRAPPER=0x0635513f179D50A207757E05759CbD106d7dFcE8
NEXT_PUBLIC_PUBLIC_RESOLVER=0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5
NEXT_PUBLIC_EXECUTOR_ADDRESS=
NEXT_PUBLIC_TASK_LOG_ADDRESS=
RELAYER_PRIVATE_KEY=
AGENT_PRIVATE_KEY=
```

Keep these configurable. The Sepolia addresses above are intended for hackathon development, but the implementation must not make it impossible to update them.

## EIP-712 typed data

Domain:

```ts
{
  name: 'AgentEnsExecutor',
  version: '1',
  chainId: 11155111,
  verifyingContract: executorAddress
}
```

Type:

```ts
TaskIntent: [
  { name: 'agentNode', type: 'bytes32' },
  { name: 'target', type: 'address' },
  { name: 'callDataHash', type: 'bytes32' },
  { name: 'value', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'expiresAt', type: 'uint64' }
]
```

## Solidity execution checks

`execute(...)` must check, in this order or an equivalent safe order:

1. Policy exists and is enabled.
2. Policy has not expired.
3. Intent has not expired.
4. Intent nonce equals `nextNonce[agentNode]`.
5. Target matches policy target.
6. Selector matches policy selector.
7. `keccak256(callData)` equals `intent.callDataHash`.
8. `intent.value <= policy.maxValueWei`.
9. ENS resolver exists for `agentNode`.
10. Current ENS `addr(agentNode)` is nonzero.
11. EIP-712 recovered signer equals current ENS-resolved address.
12. Execute target call.
13. Increment nonce.
14. Reimburse relayer from gas budget, capped by `maxGasReimbursementWei`.

Nonce increment can happen before the external call if revert rolls back state. Use `nonReentrant`.

## Avoid these mistakes

- Do not store agent address or executable policy fields as the authorization source.
- Do not compare signer to the owner wallet. Compare signer to the current ENS-resolved agent address.
- Do not let `callData` point to any function. Check selector.
- Do not skip the calldata hash.
- Do not reimburse uncapped gas.
- Do not assume every ENS name is unwrapped. Wrapped names may have `ENSRegistry.owner(node) == NameWrapper`.
- Do not make the demo depend on a private hard-coded ENS name. Make the name configurable.

## First build order

1. Build and test `TaskLog.sol`.
2. Build and test `AgentEnsExecutor.sol` using mock ENS resolver/registry contracts.
3. Create deployment script.
4. Build TypeScript namehash and EIP-712 utilities.
5. Build agent runner signing flow.
6. Build relayer endpoint.
7. Build frontend proof panel.
8. Build register/policy/revoke flows.
9. Run full Sepolia integration test.

## Definition of done

See `docs/ACCEPTANCE_CRITERIA.md`.
