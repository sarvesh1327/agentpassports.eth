# Uniswap API Feedback

## What we built

- Added MCP tools for policy-gated Uniswap API usage:
  - `uniswap_check_approval`
  - `uniswap_validate_swap_against_ens_policy`
  - `uniswap_quote`
  - `uniswap_execute_swap`
- Added ENS text-record parsing for V2 Uniswap swap policy.
- Added server-side Uniswap API calls so API keys are not exposed to the browser.

## Endpoints used

- `/check_approval`
- `/quote`
- `/swap`

## What worked well

- The API maps naturally to an agent workflow: check approval, quote, validate, execute.
- Keeping the API call in MCP/server code makes secret handling straightforward.
- A live /quote worked on Sepolia for WETH -> UNI, so quote metadata is usable as an experimental policy-gated proof path.

## Bugs or confusing behavior

- `/swap` currently fails with `TRANSFER_FROM_FAILED` because WETH must approve Permit2 before Permit2 can transfer tokens.
- That approval blocker conflicts with the product constraint that the agent wallet holds no gas token.
- Owner-funded `AgentEnsExecutor` gas sponsorship cannot directly create ERC20 approval for tokens owned by the agent EOA without a separate delegation/account-abstraction model.
- Therefore full gasless sponsored swap execution is frozen and should not be part of the main KeeperHub demo path.

## Documentation gaps

- `/quote` field shape has been exercised with the live API. `/swap` still needs a proven initial approval/delegation architecture before it can be documented as a complete sponsored-swap flow.
- If Uniswap is revisited, document the exact Permit2 allowance state, initial ERC20 approval requirement, and who pays gas for that setup transaction.

## DX friction

- Agentic flows need a clear quote ID / transaction / order object that can be carried between quote and execution tools.
- Gasless execution needs a clean answer for the initial ERC20 approval to Permit2 while preserving the rule that the agent wallet holds no gas token.

## Missing features we wished existed

- A compact, canonical policy-validation schema for API consumers would make agent guardrails easier to standardize.
- A supported account/delegation flow for owner-sponsored initial ERC20 approvals would make sponsored swaps much easier to demo safely.

## Screenshots / logs

- Pending final demo capture.
