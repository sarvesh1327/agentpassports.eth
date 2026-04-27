import { AgentPassportCard } from "../../../components/AgentPassportCard";
import { EnsProofPanel, formatWei, shortenHex } from "../../../components/EnsProofPanel";
import { buildDemoAgentProfile, type AgentProfilePreview } from "../../../lib/demoProfile";

type AgentPageProps = {
  params: Promise<{ name: string }>;
};

/**
 * Renders the public ENS passport for a route-selected agent name.
 */
export default async function AgentPage({ params }: AgentPageProps) {
  const { name } = await params;
  const profile = buildDemoAgentProfile({ agentName: decodeAgentName(name) });

  return (
    <main className="page-shell">
      <section className="page-heading" aria-labelledby="agent-title">
        <p>Agent</p>
        <h1 id="agent-title">{profile.agentName}</h1>
      </section>

      <div className="agent-layout">
        <AgentPassportCard
          agentAddress={profile.agentAddress}
          agentName={profile.agentName}
          agentNode={profile.agentNode}
          capabilities={profile.capabilities}
          ownerName={profile.ownerName}
          policyUri={profile.policyUri}
          status={profile.agentAddress ? "active" : "unknown"}
        />

        <EnsProofPanel
          agentName={profile.agentName}
          agentNode={profile.agentNode}
          authorizationStatus="unknown"
          ensAgentAddress={profile.agentAddress}
          failureReason={profile.agentAddress ? undefined : "ENS addr(agent) not configured"}
          gasBudgetWei={profile.gasBudgetWei}
          ownerName={profile.ownerName}
          ownerNode={profile.ownerNode}
          policyEnabled={profile.policyEnabled}
          policyHash={profile.policyHash}
          recoveredSigner={null}
          resolverAddress={profile.resolverAddress}
        />
      </div>

      <div className="detail-grid">
        <TextRecordPanel profile={profile} />
        <PolicyStatePanel profile={profile} />
        <TaskHistoryPanel />
      </div>
    </main>
  );
}

/**
 * Displays the ENS text records that make up the public agent metadata surface.
 */
function TextRecordPanel({ profile }: { profile: AgentProfilePreview }) {
  return (
    <section className="app-card" aria-labelledby="agent-records-title">
      <div className="section-heading">
        <p>ENS</p>
        <h2 id="agent-records-title">ENS text records</h2>
      </div>
      <div className="record-table" role="table" aria-label="ENS text records">
        {profile.textRecords.map((record) => (
          <div className="record-table__row" role="row" key={record.key}>
            <span role="cell">{record.key}</span>
            <strong role="cell">{record.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Shows the executor-facing policy and gas budget facts for the agent node.
 */
function PolicyStatePanel({ profile }: { profile: AgentProfilePreview }) {
  const rows = [
    { label: "Agent node", title: profile.agentNode, value: shortenHex(profile.agentNode) },
    { label: "Policy state", value: profile.policyEnabled ? "Enabled" : "Unknown" },
    { label: "Policy hash", title: profile.policyHash ?? undefined, value: profile.policyHash ? shortenHex(profile.policyHash) : "Unknown" },
    { label: "Executor", title: profile.executorAddress ?? undefined, value: profile.executorAddress ? shortenHex(profile.executorAddress) : "Unknown" },
    { label: "TaskLog", title: profile.taskLogAddress ?? undefined, value: profile.taskLogAddress ? shortenHex(profile.taskLogAddress) : "Unknown" },
    { label: "Gas budget", value: formatWei(profile.gasBudgetWei) },
    { label: "Next nonce", value: profile.nextNonce?.toString() ?? "Unknown" }
  ];

  return (
    <section className="app-card" aria-labelledby="agent-policy-title">
      <div className="section-heading">
        <p>Policy</p>
        <h2 id="agent-policy-title">Policy state</h2>
      </div>
      <dl className="fact-grid">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd title={row.title}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Reserves the route surface for TaskLog event history once event reads are wired in.
 */
function TaskHistoryPanel() {
  return (
    <section className="app-card app-card--wide" aria-labelledby="agent-history-title">
      <div className="section-heading">
        <p>TaskLog</p>
        <h2 id="agent-history-title">Task history</h2>
      </div>
      <div className="empty-state">
        <strong>No task proofs recorded</strong>
        <span>TaskLog events will appear here after the relayer submits executor transactions.</span>
      </div>
    </section>
  );
}

/**
 * Decodes a URL path segment into the ENS name shown on the profile page.
 */
function decodeAgentName(value: string): string {
  return decodeURIComponent(value);
}
