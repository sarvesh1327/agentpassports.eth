import {
  SEPOLIA_CHAIN_ID
} from "@agentpassport/config";
import { AgentPassportCard } from "../components/AgentPassportCard";
import { EnsProofPanel } from "../components/EnsProofPanel";
import { buildDemoAgentProfile } from "../lib/demoProfile";

/**
 * Renders the landing demo with the same ENS proof facts the dedicated flow will expose.
 */
export default function HomePage() {
  const preview = buildDemoAgentProfile();

  return (
    <main className="home-shell">
      <section className="home-intro" aria-labelledby="home-title">
        <p className="home-intro__eyebrow">Sepolia ({SEPOLIA_CHAIN_ID})</p>
        <h1 id="home-title">AgentPassport.eth</h1>
        <p>ENS-native identity and sponsored execution for onchain agents.</p>
      </section>

      <div className="home-grid">
        <AgentPassportCard
          agentAddress={preview.agentAddress}
          agentName={preview.agentName}
          agentNode={preview.agentNode}
          capabilities={preview.capabilities}
          ownerName={preview.ownerName}
          policyUri={preview.policyUri}
          status={preview.agentAddress ? "active" : "unknown"}
        />

        <EnsProofPanel
          agentName={preview.agentName}
          agentNode={preview.agentNode}
          authorizationStatus="unknown"
          ensAgentAddress={preview.agentAddress}
          failureReason={preview.agentAddress ? undefined : "Demo agent address not configured"}
          gasBudgetWei={preview.gasBudgetWei}
          ownerName={preview.ownerName}
          ownerNode={preview.ownerNode}
          policyEnabled={preview.policyEnabled}
          policyHash={preview.policyHash}
          recoveredSigner={null}
          resolverAddress={preview.resolverAddress}
        />
      </div>
    </main>
  );
}
