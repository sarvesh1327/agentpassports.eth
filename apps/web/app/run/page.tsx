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
        chainId={profile.chainId}
        defaultAgentName=""
        defaultMetadataURI=""
        defaultOwnerName=""
        defaultTaskDescription=""
        ensRegistryAddress={profile.ensRegistryAddress}
        executorAddress={profile.executorAddress}
        taskLogAddress={profile.taskLogAddress}
        taskLogStartBlock={profile.taskLogStartBlock}
      />
    </main>
  );
}
