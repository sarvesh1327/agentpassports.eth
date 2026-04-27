import {
  SEPOLIA_CHAIN_ID,
  buildPolicyMetadata,
  hashPolicyMetadata,
  namehashEnsName,
  taskLogRecordTaskSelector,
  type Hex
} from "@agentpassport/config";
import { AgentPassportCard } from "../components/AgentPassportCard";
import { EnsProofPanel } from "../components/EnsProofPanel";
import { webEnv } from "../lib/env";

// These names keep the demo populated until NEXT_PUBLIC_DEMO_OWNER_ENS or NEXT_PUBLIC_DEMO_AGENT_LABEL are set.
const DEFAULT_DEMO_OWNER_ENS = "agentpassports.eth";
const DEFAULT_DEMO_AGENT_LABEL = "assistant";

type HomePreview = {
  agentAddress: Hex | null;
  agentName: string;
  agentNode: Hex;
  ownerName?: string;
  ownerNode: Hex;
  policyHash: Hex | null;
  policyUri?: string;
  resolverAddress: Hex | null;
};

/**
 * Builds a configurable demo preview without depending on a private ENS name or local deployment address.
 */
function buildHomePreview(): HomePreview {
  const ownerName = readTextEnv(webEnv.demoOwnerEns) ?? DEFAULT_DEMO_OWNER_ENS;
  const agentLabel = readTextEnv(webEnv.demoAgentLabel) ?? DEFAULT_DEMO_AGENT_LABEL;
  const agentAddress = readHexEnv(webEnv.demoAgentAddress);
  const resolverAddress = readHexEnv(webEnv.publicResolver);
  const taskLogAddress = readHexEnv(webEnv.taskLogAddress);
  const ownerNode = safeNamehash(ownerName);
  const agentName = `${agentLabel}.${ownerName}`;
  const agentNode = safeNamehash(agentName);
  const policyHash =
    taskLogAddress
      ? hashPolicyMetadata(
          buildPolicyMetadata({
            agentNode,
            expiresAt: 1_790_000_000n,
            maxGasReimbursementWei: 1_000_000_000_000_000n,
            maxValueWei: 0n,
            ownerNode,
            selector: taskLogRecordTaskSelector(),
            target: taskLogAddress
          })
        )
      : null;

  return {
    agentAddress,
    agentName,
    agentNode,
    ownerName,
    ownerNode,
    policyHash,
    policyUri: readTextEnv(webEnv.demoPolicyUri),
    resolverAddress
  };
}

/**
 * Renders the landing demo with the same ENS proof facts the dedicated flow will expose.
 */
export default function HomePage() {
  const preview = buildHomePreview();

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
          capabilities={["task-log", "sponsored-execution"]}
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
          ownerName={preview.ownerName}
          ownerNode={preview.ownerNode}
          policyEnabled={preview.policyHash ? true : undefined}
          policyHash={preview.policyHash}
          recoveredSigner={null}
          resolverAddress={preview.resolverAddress}
        />
      </div>
    </main>
  );
}

/**
 * Normalizes optional text env values so blank strings fall back to demo defaults.
 */
function readTextEnv(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

/**
 * Accepts configured hex values only when they keep the expected 0x prefix.
 */
function readHexEnv(value?: string): Hex | null {
  const normalized = readTextEnv(value);
  return normalized?.startsWith("0x") ? (normalized as Hex) : null;
}

/**
 * Keeps the preview renderable even if a local env override contains an invalid ENS name.
 */
function safeNamehash(name?: string): Hex {
  if (!name) {
    return namehashEnsName("");
  }
  try {
    return namehashEnsName(name);
  } catch {
    return namehashEnsName("");
  }
}
