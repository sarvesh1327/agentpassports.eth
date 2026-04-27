import { SEPOLIA_CHAIN_ID } from "@agentpassport/config";
import { RunTaskDemo } from "../../components/RunTaskDemo";
import { buildDemoAgentProfile } from "../../lib/demoProfile";

/**
 * Renders the task execution demo where an ENS-published agent signs a policy-limited intent.
 */
export default function RunPage() {
  const profile = buildDemoAgentProfile();

  return (
    <main className="page-shell">
      <section className="page-heading" aria-labelledby="run-title">
        <p>Run</p>
        <h1 id="run-title">Run an agent task</h1>
      </section>

      <RunTaskDemo
        chainId={BigInt(SEPOLIA_CHAIN_ID)}
        defaultAgentName={profile.agentName}
        defaultMetadataURI="ipfs://agentpassports-demo-task"
        defaultOwnerName={profile.ownerName}
        defaultTaskDescription="Record wallet health check"
        ensRegistryAddress={profile.ensRegistryAddress}
        executorAddress={profile.executorAddress}
        taskLogAddress={profile.taskLogAddress}
      />
    </main>
  );
}
