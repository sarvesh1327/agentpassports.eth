import "dotenv/config";
import { pathToFileURL } from "node:url";
import { loadRunnerConfig } from "./config.ts";
import { runAgentTask } from "./runTask.ts";

export { loadRunnerConfig } from "./config.ts";
export { buildTaskPlan } from "./planTask.ts";
export {
  createPrivateKeyAgentSigner,
  createRunnerPublicClient,
  runAgentTask,
  submitRelayerPayload,
  writeSignedPayload
} from "./runTask.ts";
export { signTaskIntent } from "./signIntent.ts";
export type { RunnerConfig } from "./config.ts";
export type { TaskPlan, TaskPlanInput } from "./planTask.ts";
export type {
  AgentTaskSigner,
  RelayerPayload,
  RelayerSubmissionResponse,
  RunAgentTaskInput,
  RunAgentTaskResult,
  SavedSignedPayload
} from "./runTask.ts";
export type { SignedTaskIntent, SignTaskIntentInput, TaskIntentSigner } from "./signIntent.ts";

if (isMainModule(import.meta.url)) {
  void main();
}

/**
 * Loads environment config and executes one signed TaskLog intent from the CLI.
 */
async function main(): Promise<void> {
  try {
    const result = await runAgentTask({ config: loadRunnerConfig() });
    console.log(
      JSON.stringify(
        {
          agentNode: result.agentNode,
          recoveredSigner: result.signed.recoveredSigner,
          relayerStatus: result.relayerResponse.status,
          resolverAddress: result.resolverAddress,
          resolvedAgentAddress: result.resolvedAgentAddress,
          txHash: result.relayerResponse.txHash
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

function isMainModule(moduleUrl: string): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && moduleUrl === pathToFileURL(entrypoint).href);
}
