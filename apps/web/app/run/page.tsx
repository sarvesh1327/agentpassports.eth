import Link from "next/link";

/**
 * Intentional demo route: /run now points agents to the MCP execution path.
 * V1 repurposes /run as an MCP demo/instructions route. Agent task signing no
 * longer happens in the browser; the browser remains owner/admin UI while agents
 * use MCP plus local skill signing.
 */
export default function RunPage() {
  return (
    <main className="page-shell">
      <section className="page-heading" aria-labelledby="run-title">
        <p>MCP demo</p>
        <h1 id="run-title">Run tasks through AgentPassports MCP</h1>
        <p>
          The V1 agent runtime uses MCP to resolve live ENS policy, build unsigned intents, and submit locally signed payloads.
          Continue to the MCP guide instead of signing as the agent in the browser.
        </p>
        <Link className="button-primary" href="/mcp">Open /mcp setup guide</Link>
      </section>
    </main>
  );
}
