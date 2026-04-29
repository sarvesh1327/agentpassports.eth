import { RevokeAgentPanel } from "../../components/RevokeAgentPanel";
import { buildDemoAgentProfile } from "../../lib/demoProfile";

/**
 * Renders the revocation demo workspace for disabling policy and invalidating old signatures.
 * Intentional demo route: dashboard/agent pages own the management flow, while /revoke
 * remains available for the required revocation proof workflow.
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
          chainId={profile.chainId}
          defaultAgentName=""
          defaultOwnerName=""
          ensRegistryAddress={profile.ensRegistryAddress}
          executorAddress={profile.executorAddress}
        />
      </div>
    </main>
  );
}
