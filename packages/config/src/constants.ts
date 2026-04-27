// Sepolia is the default network for the hackathon MVP.
export const SEPOLIA_CHAIN_ID = 11155111 as const;

// Public ENS infrastructure addresses. Runtime deployments should still be configurable via env vars.
export const ENS_REGISTRY_ADDRESS = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const;
export const NAME_WRAPPER_ADDRESS = "0x0635513f179D50A207757E05759CbD106d7dFcE8" as const;
export const PUBLIC_RESOLVER_ADDRESS = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5" as const;

// Grouped defaults make app, runner, and deployment code consume the same baseline addresses.
export const DEFAULT_SEPOLIA_ADDRESSES = {
  ensRegistry: ENS_REGISTRY_ADDRESS,
  nameWrapper: NAME_WRAPPER_ADDRESS,
  publicResolver: PUBLIC_RESOLVER_ADDRESS
} as const;
