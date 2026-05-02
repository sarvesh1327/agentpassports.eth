import { OwnerDashboardView } from "../../../components/OwnerDashboardView";
import { buildDemoAgentProfile } from "../../../lib/demoProfile";
import { safeNamehash } from "../../../lib/ensPreview";

type OwnerPageProps = {
  params: Promise<{ name: string }>;
};

/**
 * Renders the owner dashboard for one ENS name using live owner index records.
 */
export default async function OwnerPage({ params }: OwnerPageProps) {
  const { name } = await params;
  const ownerName = decodeURIComponent(name).trim().toLowerCase();
  const config = buildDemoAgentProfile();

  return (
    <main className="page-shell page-shell--dashboard">
      <OwnerDashboardView
        chainId={config.chainId.toString()}
        ensRegistryAddress={config.ensRegistryAddress}
        executorAddress={config.executorAddress}
        ownerName={ownerName}
        ownerNode={safeNamehash(ownerName)}
        publicResolverAddress={config.resolverAddress}
        taskLogAddress={config.taskLogAddress}
        taskLogStartBlock={config.taskLogStartBlock?.toString() ?? null}
      />
    </main>
  );
}
