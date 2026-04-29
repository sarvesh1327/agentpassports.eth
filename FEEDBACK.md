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

## Bugs or confusing behavior

- Pending real API testing with a live Uniswap Developer Platform key.

## Documentation gaps

- We need to confirm final request/response field names for `/check_approval`, `/quote`, and `/swap` against the current Uniswap API docs before mainnet demo.

## DX friction

- Agentic flows need a clear quote ID / transaction / order object that can be carried between quote and execution tools.

## Missing features we wished existed

- A compact, canonical policy-validation schema for API consumers would make agent guardrails easier to standardize.

## Screenshots / logs

- Pending final demo capture.
