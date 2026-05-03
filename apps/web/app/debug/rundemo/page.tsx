import { RunTaskDemo } from "../../../components/RunTaskDemo";
import { buildDemoAgentProfile } from "../../../lib/demoProfile";

/**
 * Debug-only legacy browser signing demo route: /debug/rundemo.
 * Production agent execution should use /mcp plus local Skill Pack signing.
 */
export default function RunDemoPage() {
  const profile = buildDemoAgentProfile();

  return (
    <main className="page-shell">
      <section className="page-heading" aria-labelledby="rundemo-title">
        <p>Debug demo</p>
        <h1 id="rundemo-title">Legacy browser task runner</h1>
        <p>
          This debug route keeps the old RunTaskDemo surface available for local testing. Public/product flows should use
          the thin MCP path and local agent signing instead.
        </p>
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
