const TOOLS = [
  "resolve_agent_passport",
  "list_owner_agents",
  "get_agent_policy",
  "check_task_against_policy",
  "build_task_intent",
  "submit_task"
] as const;

const RESOURCES = [
  "agentpassport://agent/{agentName}",
  "agentpassport://owner/{ownerName}/agents",
  "agentpassport://policy/{agentName}",
  "agentpassport://tasks/{agentName}"
] as const;

/**
 * Documents the agent-facing MCP runtime. V1 keeps the browser as owner/admin UI
 * only; autonomous agents use MCP for live ENS policy reads and local skill
 * signing for private-key custody.
 */
export default function McpPage() {
  return (
    <main className="page-shell mcp-page">
      <section className="page-heading glass-panel" aria-labelledby="mcp-title">
        <span className="status-pill status-pill--info">Local endpoint</span>
        <p>Agent runtime</p>
        <h1 id="mcp-title">AgentPassports MCP</h1>
        <p>
          Connect your MCP-capable agent to <code className="code-pill">http://localhost:3333/mcp</code>. The MCP server resolves live ENS policy,
          builds unsigned intents, and submits signed payloads. Policy source: ENS.
        </p>
      </section>

      <section className="mcp-setup-grid" aria-label="MCP setup">
        <article className="glass-panel">
          <span className="status-pill status-pill--success">Prompt</span>
          <h2>Use agentpassport_execute_task</h2>
          <p>Guides resolve, policy check, unsigned intent build, local signing, and submission.</p>
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
          <li>Use the <code className="code-pill">agentpassport_execute_task</code> prompt for guided execution.</li>
          <li>Call <code className="code-pill">resolve_agent_passport</code> to read live ENS resolver, text records, and addr(agent).</li>
          <li>Call <code className="code-pill">get_agent_policy</code> and <code className="code-pill">check_task_against_policy</code> before building or signing.</li>
          <li>Call <code className="code-pill">build_task_intent</code> to receive unsigned intent JSON and typed data.</li>
          <li>Sign locally with the skill-provided <code className="code-pill">sign-intent.ts</code> script.</li>
          <li>Call <code className="code-pill">submit_task</code> with the signed payload.</li>
        </ol>
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
        <h2 id="mcp-refusal-title">Refusal conditions</h2>
        <p>
          Never sign if ENS <code className="code-pill">agent.status</code> is not exactly <code className="code-pill">active</code>, the policy digest does not match live ENS,
          the task fails policy preflight, or the local signer does not match ENS <code className="code-pill">addr(agentName)</code>.
        </p>
      </section>
    </main>
  );
}
