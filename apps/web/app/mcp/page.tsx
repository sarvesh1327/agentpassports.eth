const TOOLS = [
  {
    name: "build_task_intent",
    label: "Build unsigned intent",
    description: "Packages explicit public task inputs into typed data. No local Visa validation happens inside MCP."
  },
  {
    name: "submit_task",
    label: "Submit signed payload",
    description: "Forwards the owner-approved, locally signed payload to KeeperHub and returns an execution id quickly."
  },
  {
    name: "check_task_status",
    label: "Poll KeeperHub status",
    description: "Reads final KeeperHub execution state, logs, errors, tx hashes, and KeeperHub Stamp evidence."
  }
] as const;

const RESOURCES = [
  {
    uri: "agentpassport://tasks/{agentName}",
    label: "Task intent guide",
    description: "Agent-facing task input shape for a Passport and its scoped Visa."
  },
  {
    uri: "agentpassport://keeperhub/{agentName}",
    label: "KeeperHub guide",
    description: "Execution and Stamp context for the KeeperHub workflow protecting that Passport."
  }
] as const;

const FLOW_STEPS = [
  {
    step: "01",
    title: "Passport",
    body: "The agent proves identity through its Agent Passport and local signer."
  },
  {
    step: "02",
    title: "Visa",
    body: "The signed intent carries the requested target, selector, spend, and Visa Scope."
  },
  {
    step: "03",
    title: "KeeperHub Stamp",
    body: "KeeperHub validates the Passport/Visa, executes allowed work, and returns proof."
  }
] as const;

/**
 * Documents the agent-facing MCP runtime. The browser stays owner/admin UI only;
 * autonomous agents use MCP for intent construction/status checks and local skill
 * signing for private-key custody. KeeperHub owns Passport/Visa validation.
 */
export default function McpPage() {
  return (
    <main className="page-shell page-shell--mcp mcp-page mcp-page--permission-manager">
      <section className="mcp-hero mcp-hero--permission-manager glass-panel" aria-labelledby="mcp-title">
        <div className="mcp-hero__copy">
          <span className="mcp-hero__eyebrow">Agent Permission Manager · MCP</span>
          <h1 id="mcp-title">AgentPassports MCP</h1>
          <p>
            Connect your MCP-capable agent to <code className="code-pill">https://mcp.agentpassports.xyz/mcp</code>. MCP stays thin: it builds unsigned task intents,
            submits locally signed payloads, and polls KeeperHub for final status.
          </p>
          <p className="mcp-hero__authority">Passport/Visa authority: KeeperHub validates scope, routes execution, and emits KeeperHub Stamps.</p>
        </div>
        <div className="mcp-endpoint-card" aria-label="MCP endpoint summary">
          <span className="status-pill status-pill--info">Hosted endpoint</span>
          <code>https://mcp.agentpassports.xyz/mcp</code>
          <p>Public MCP runtime. Owner wallet control stays in the web app and local signing environment.</p>
        </div>
      </section>

      <section className="mcp-protocol-strip" aria-label="Passport Visa KeeperHub flow">
        {FLOW_STEPS.map((item) => (
          <article key={item.title}>
            <span>{item.step}</span>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
          </article>
        ))}
      </section>

      <section className="mcp-setup-grid" aria-label="MCP setup">
        <article className="glass-panel">
          <span className="status-pill status-pill--success">Prompt</span>
          <h2>Use agentpassport_keeperhub_gate</h2>
          <p>Guides task-intent build, local signing, async KeeperHub submit, and final status polling.</p>
        </article>
        <article className="glass-panel">
          <span className="status-pill status-pill--warning">Private key stays local</span>
          <h2>Sign with the skill script</h2>
          <p>Use <code className="code-pill">sign-intent.ts</code> and <code className="code-pill">.agentPassports/keys.txt</code>. Never send the private key to MCP.</p>
        </article>
      </section>

      <section className="content-card glass-panel" aria-labelledby="mcp-flow-title">
        <h2 id="mcp-flow-title">Safe Passport/Visa execution flow</h2>
        <ol>
          <li>Use the <code className="code-pill">agentpassport_keeperhub_gate</code> prompt for guided execution.</li>
          <li>Call <code className="code-pill">build_task_intent</code> with explicit public inputs to receive unsigned intent JSON and typed data.</li>
          <li>Sign locally with the skill-provided <code className="code-pill">sign-intent.ts</code> script.</li>
          <li>Call <code className="code-pill">submit_task</code> with the signed payload; it returns a KeeperHub execution id quickly by default.</li>
          <li>Call <code className="code-pill">check_task_status</code> with that execution id until KeeperHub returns final status, logs, errors, tx hash evidence, and KeeperHub Stamps.</li>
        </ol>
      </section>

      <section className="content-card glass-panel" aria-labelledby="mcp-authority-title">
        <h2 id="mcp-authority-title">Authority boundary</h2>
        <p>
          KeeperHub validates the Agent Passport, Visa Scope, action limits, workflow routing, and execution. MCP does not create keys, receive private keys,
          perform local authorization checks, or convert KeeperHub output into a local approval decision.
        </p>
      </section>

      <section className="content-card glass-panel" aria-labelledby="mcp-tools-title">
        <h2 id="mcp-tools-title">Thin MCP tools</h2>
        <div className="mcp-tool-list">
          {TOOLS.map((tool) => (
            <article key={tool.name}>
              <span>{tool.label}</span>
              <code className="code-pill">{tool.name}</code>
              <p>{tool.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="content-card glass-panel" aria-labelledby="mcp-resources-title">
        <h2 id="mcp-resources-title">Resources</h2>
        <div className="mcp-resource-list">
          {RESOURCES.map((resource) => (
            <article key={resource.uri}>
              <span>{resource.label}</span>
              <code className="code-pill">{resource.uri}</code>
              <p>{resource.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="content-card glass-panel" aria-labelledby="mcp-refusal-title">
        <h2 id="mcp-refusal-title">Stop conditions</h2>
        <p>
          Stop if a private key would leave the local machine, the unsigned intent JSON is altered before signing, the signature is malformed,
          or KeeperHub returns a blocked/error Stamp.
        </p>
      </section>
    </main>
  );
}
