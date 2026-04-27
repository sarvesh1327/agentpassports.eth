// Centralized raw environment access for the web app.
// Validation and typed address parsing should live next to the callers that need them.
export const webEnv = {
  chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
  ensRegistry: process.env.NEXT_PUBLIC_ENS_REGISTRY,
  nameWrapper: process.env.NEXT_PUBLIC_NAME_WRAPPER,
  publicResolver: process.env.NEXT_PUBLIC_PUBLIC_RESOLVER,
  executorAddress: process.env.NEXT_PUBLIC_EXECUTOR_ADDRESS,
  taskLogAddress: process.env.NEXT_PUBLIC_TASK_LOG_ADDRESS
};
