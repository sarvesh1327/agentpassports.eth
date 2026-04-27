import Link from "next/link";
import { buildDemoAgentProfile } from "../lib/demoProfile";

/**
 * Provides the compact product navigation shared by the frontend pages.
 */
export function SiteHeader() {
  const demoAgent = buildDemoAgentProfile();
  const demoAgentHref = `/agent/${encodeURIComponent(demoAgent.agentName)}`;

  return (
    <header className="site-header">
      <Link className="site-header__brand" href="/">
        AgentPassport.eth
      </Link>
      <nav className="site-header__nav" aria-label="Primary navigation">
        <Link href="/register">Register</Link>
        <Link href={demoAgentHref}>Agent</Link>
      </nav>
    </header>
  );
}
