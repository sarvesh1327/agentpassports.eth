# Uniswap API Feedback

## What we used the Uniswap API for

- Getting reference quotes/routes for the intended token pair and chain.
- Inspecting the generated transaction shape: router target, calldata, recipient, slippage/deadline, spender, and approval assumptions.
- Comparing Uniswap's default wallet-driven swap flow against our owner-funded, delegated execution model.

## What worked well

- The quote/build API is useful as a fast sanity check for supported chains, token pairs, routing availability, and rough swap outputs.
- It works well for the default wallet-driven Uniswap flow where the same user wallet owns tokens, manages approvals, and submits the generated transaction.
- It surfaced the important swap assumptions quickly: token holder, spender, approval path, recipient, slippage, deadline, and router choice.
- For our owner-funded design, it was still useful as a reference for route economics and expected token movement, even when we did not use its generated transaction directly.
- Once we moved to direct `SwapRouter02.exactInputSingle` calldata, the execution shape became simpler and easier to bind to an explicit policy.

## What did not work well

- The API-generated flow is too wallet-centric for our agent-permission model: it assumes token holder, approver, and transaction submitter are the same actor, while our design separates owner-funded assets from agent authorization.
- Permit2 expectations do not fit our no-agent-funds constraint. We do not want the agent wallet holding tokens, holding gas, or performing approvals.
- Error messages were not diagnostic enough for agentic/server flows. `TRANSFER_FROM_FAILED` and `"value" contains an invalid value` did not clearly identify whether the issue was token holder, Permit2 allowance, transaction value, spender, or route-build shape.
- Universal Router calldata was harder to reason about and policy-gate than a single explicit router function. It is flexible, but too opaque for exact intent signing and deterministic allowlists.
- The API did not give us a clean owner-funded/delegated execution mode: owner approves an executor, executor pulls exact `tokenIn`, swaps, and sends `tokenOut` to the intended recipient.
- Net: good for quotes/reference and normal wallet swaps; not ideal as the primary transaction builder for AgentPassports-style delegated, policy-gated execution unless Uniswap adds a first-class owner-funded/delegated build mode.
