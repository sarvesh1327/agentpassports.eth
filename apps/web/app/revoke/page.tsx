import { RevokeAgentPanel } from "../../components/RevokeAgentPanel";
import { buildDemoAgentProfile } from "../../lib/demoProfile";

/**
 * Renders the revocation demo workspace for disabling policy and invalidating old signatures.
 */
export default function RevokePage() {
  const profile = buildDemoAgentProfile();

  return (
    <main className="page-shell">
      <section className="page-heading" aria-labelledby="revoke-page-title">
        <p>Revoke</p>
        <h1 id="revoke-page-title">Revoke an agent</h1>
      </section>

      <div className="agent-layout">
        <RevokeAgentPanel
          defaultAgentName={profile.agentName}
          defaultOwnerName={profile.ownerName}
          ensRegistryAddress={profile.ensRegistryAddress}
          executorAddress={profile.executorAddress}
        />
      </div>
    </main>
  );
}
