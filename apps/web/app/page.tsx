import {
  DEFAULT_SEPOLIA_ADDRESSES,
  SEPOLIA_CHAIN_ID,
  buildPolicyMetadata,
  hashPolicyMetadata,
  namehashEnsName
} from "@agentpassport/config";
import { EnsProofPanel } from "../components/EnsProofPanel";

const ownerName = "alice.eth";
const agentName = `assistant.${ownerName}`;
const ownerNode = namehashEnsName(ownerName);
const agentNode = namehashEnsName(agentName);
const demoAgentAddress = "0xFCAd0B19bB29D4674531d6f115237E16AfCE377c";
const demoTaskLogAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const demoPolicyHash = hashPolicyMetadata(
  buildPolicyMetadata({
    agentNode,
    expiresAt: 1_790_000_000n,
    maxGasReimbursementWei: 1_000_000_000_000_000n,
    maxValueWei: 0n,
    ownerNode,
    selector: "0x36736d1e",
    target: demoTaskLogAddress
  })
);

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="home-intro" aria-labelledby="home-title">
        <p className="home-intro__eyebrow">Sepolia ({SEPOLIA_CHAIN_ID})</p>
        <h1 id="home-title">AgentPassport.eth</h1>
        <p>ENS-native identity and sponsored execution for onchain agents.</p>
      </section>

      <EnsProofPanel
        agentName={agentName}
        agentNode={agentNode}
        authorizationStatus="pass"
        ensAgentAddress={demoAgentAddress}
        gasBudgetWei={1_000_000_000_000_000n}
        ownerName={ownerName}
        ownerNode={ownerNode}
        policyEnabled={true}
        policyHash={demoPolicyHash}
        recoveredSigner={demoAgentAddress}
        resolverAddress={DEFAULT_SEPOLIA_ADDRESSES.publicResolver}
      />
    </main>
  );
}
