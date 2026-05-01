const TOOLS = [
  "build_task_intent",
  "submit_task",
  "check_task_status"
] as const;

const RESOURCES = [
  "agentpassport://tasks/{agentName}",
  "agentpassport://keeperhub/{agentName}"
] as const;

/**
 * Documents the agent-facing MCP runtime. The browser stays owner/admin UI only;
 * autonomous agents use MCP for intent construction/status checks and local skill
 * signing for private-key custody. KeeperHub owns Passport/Visa validation.
 */
export default function McpPage() {
  return (
    <main className="page-shell mcp-page">
      <section className="page-heading glass-panel" aria-labelledby="mcp-title">
        <span className="status-pill status-pill--info">Local endpoint</span>
        <p>Agent runtime</p>
        <h1 id="mcp-title">AgentPassports MCP</h1>
        <p>
          Connect your MCP-capable agent to <code className="code-pill">http://localhost:3333/mcp</code>. The MCP server is thin: it builds unsigned intents,
          submits signed payloads to KeeperHub, and checks final status. Policy authority: KeeperHub.
        </p>
      </section>

      <section className="mcp-setup-grid" aria-label="MCP setup">
        <article className="glass-panel">
          <span className="status-pill status-pill--success">Prompt</span>
          <h2>Use agentpassport_keeperhub_gate</h2>
          <p>Guides build, local signing, async KeeperHub submit, and final status polling.</p>
        </article>
        <article className="glass-panel">
          <span className="status-pill status-pill--warning">Private key stays local</span>
          <h2>Sign with the skill script</h2>
          <p>Use <code className="code-pill">sign-intent.ts</code> and <code className="code-pill">.agentPassports/keys.txt</code>. Never send the private key to MCP.</p>
        </article>
      </section>

      <section className="content-card glass-panel" aria-labelledby="mcp-flow-title">
        <h2 id="mcp-flow-title">Safe execution flow</h2>
        <ol>
          <li>Use the <code className="code-pill">agentpassport_keeperhub_gate</code> prompt for guided execution.</li>
          <li>Call <code className="code-pill">build_task_intent</code> with explicit public inputs to receive unsigned intent JSON and typed data.</li>
          <li>Sign locally with the skill-provided <code className="code-pill">sign-intent.ts</code> script.</li>
          <li>Call <code className="code-pill">submit_task</code> with the signed payload; it returns a KeeperHub execution id quickly by default.</li>
          <li>Call <code className="code-pill">check_task_status</code> with that execution id until KeeperHub returns final status, logs, errors, and tx hash evidence.</li>
        </ol>
      </section>

      <section className="content-card glass-panel" aria-labelledby="mcp-authority-title">
        <h2 id="mcp-authority-title">Authority boundary</h2>
        <p>
          KeeperHub performs Passport/Visa validation, policy validation, workflow routing, and execution. MCP does not create keys, receive private keys,
          perform local authorization checks, or convert KeeperHub output into a local approval decision.
        </p>
      </section>

      <section className="content-card glass-panel" aria-labelledby="mcp-tools-title">
        <h2 id="mcp-tools-title">Tools</h2>
        <ul className="code-list">
          {TOOLS.map((tool) => <li key={tool}><code className="code-pill">{tool}</code></li>)}
        </ul>
      </section>

      <section className="content-card glass-panel" aria-labelledby="mcp-resources-title">
        <h2 id="mcp-resources-title">Resources</h2>
        <ul className="code-list">
          {RESOURCES.map((resource) => <li key={resource}><code className="code-pill">{resource}</code></li>)}
        </ul>
      </section>

      <section className="content-card glass-panel" aria-labelledby="mcp-refusal-title">
        <h2 id="mcp-refusal-title">Stop conditions</h2>
        <p>
          Stop if a private key would leave the local machine, the unsigned intent JSON is altered before signing, the signature is malformed,
          or KeeperHub returns a blocked/error status.
        </p>
      </section>
    </main>
  );
}
