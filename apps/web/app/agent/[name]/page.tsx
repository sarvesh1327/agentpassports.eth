import { AgentProfileView } from "../../../components/AgentProfileView";
import { buildDemoAgentProfile, serializeAgentProfile } from "../../../lib/demoProfile";

type AgentPageProps = {
  params: Promise<{ name: string }>;
};

/**
 * Renders the owner-management detail surface for a route-selected agent name.
 */
export default async function AgentPage({ params }: AgentPageProps) {
  const { name } = await params;
  const profile = buildDemoAgentProfile({ agentName: decodeAgentName(name) });

  return (
    <main className="page-shell">
      <AgentProfileView initialProfile={serializeAgentProfile(profile)} />
    </main>
  );
}

/**
 * Decodes a URL path segment into the ENS name shown on the profile page.
 */
function decodeAgentName(value: string): string {
  return decodeURIComponent(value);
}
