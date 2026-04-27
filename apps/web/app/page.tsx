import { SEPOLIA_CHAIN_ID } from "@agentpassport/config";

// Temporary shell page until the ENS registration and demo routes are implemented.
export default function HomePage() {
  return (
    <main>
      <h1>AgentPassport.eth</h1>
      <p>ENS-native identity and sponsored execution for onchain agents.</p>
      <p>Default network: Sepolia ({SEPOLIA_CHAIN_ID}).</p>
    </main>
  );
}
