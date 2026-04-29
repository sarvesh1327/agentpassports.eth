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
    <main className="page-shell">
      <section className="page-heading" aria-labelledby="mcp-title">
        <p>Agent runtime</p>
        <h1 id="mcp-title">AgentPassports MCP</h1>
        <p>
          Connect your MCP-capable agent to <code>http://localhost:3333/mcp</code>. The MCP server resolves live ENS policy,
          builds unsigned intents, and submits signed payloads. Policy source: ENS.
        </p>
      </section>

      <section className="content-card" aria-labelledby="mcp-flow-title">
        <h2 id="mcp-flow-title">Safe execution flow</h2>
        <ol>
          <li>Use the <code>agentpassport_execute_task</code> prompt for guided execution.</li>
          <li>Call <code>resolve_agent_passport</code> to read live ENS resolver, text records, and addr(agent).</li>
          <li>Call <code>get_agent_policy</code> and <code>check_task_against_policy</code> before building or signing.</li>
          <li>Call <code>build_task_intent</code> to receive unsigned intent JSON and typed data.</li>
          <li>Sign locally with the skill-provided <code>sign-intent.ts</code> script and <code>.agentPassports/keys.txt</code>.</li>
          <li>Call <code>submit_task</code> with the signed payload. Never send the private key to MCP.</li>
        </ol>
      </section>

      <section className="content-card" aria-labelledby="mcp-tools-title">
        <h2 id="mcp-tools-title">Tools</h2>
        <ul>
          {TOOLS.map((tool) => (
            <li key={tool}><code>{tool}</code></li>
          ))}
        </ul>
      </section>

      <section className="content-card" aria-labelledby="mcp-resources-title">
        <h2 id="mcp-resources-title">Resources</h2>
        <ul>
          {RESOURCES.map((resource) => (
            <li key={resource}><code>{resource}</code></li>
          ))}
        </ul>
      </section>

      <section className="content-card" aria-labelledby="mcp-refusal-title">
        <h2 id="mcp-refusal-title">Refusal conditions</h2>
        <p>
          Never sign if ENS <code>agent.status</code> is not exactly <code>active</code>, the policy digest does not match live ENS,
          the task fails policy preflight, or the local signer does not match ENS <code>addr(agentName)</code>.
        </p>
      </section>
    </main>
  );
}
