import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterAgentForm } from "../../components/RegisterAgentForm";
import { UiIcon } from "../../components/icons/UiIcons";
import { buildDemoAgentProfile } from "../../lib/demoProfile";

type RegisterPageProps = {
  searchParams?: Promise<{ owner?: string }>;
};

/**
 * Renders dashboard-scoped agent registration for one owner ENS name.
 */
export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const profile = buildDemoAgentProfile();
  const defaultOwnerName = decodeURIComponent((await searchParams)?.owner ?? "").trim().toLowerCase();

  if (!defaultOwnerName) {
    redirect("/");
  }

  return (
    <main className="page-shell">
      <section className="page-heading page-heading--register" aria-labelledby="register-title">
        <div className="page-heading__title-row">
          <span className="page-heading__icon" aria-hidden="true"><UiIcon name="shield" size={30} /></span>
          <div>
            <h1 id="register-title">Register new agent</h1>
            <span className="page-heading__subtitle">
              Create an ENS subname, publish policy metadata, and fund execution budget.
            </span>
          </div>
        </div>
        <Link className="sr-only" href={`/owner/${encodeURIComponent(defaultOwnerName)}`}>
          Back to owner dashboard
        </Link>
      </section>

      <RegisterAgentForm
        chainId={profile.chainId}
        defaultAgentAddress={null}
        defaultAgentLabel="assistant"
        defaultGasBudgetWei="500000000000000"
        defaultMaxGasReimbursementWei={profile.maxGasReimbursementWei.toString()}
        defaultMaxValueWei={profile.maxValueWei.toString()}
        defaultOwnerName={defaultOwnerName}
        defaultPolicyExpiresAt={profile.policyExpiresAt.toString()}
        defaultPolicyUri=""
        ensRegistryAddress={profile.ensRegistryAddress}
        executorAddress={profile.executorAddress}
        nameWrapperAddress={profile.nameWrapperAddress}
        publicResolverAddress={profile.resolverAddress}
        taskLogAddress={profile.taskLogAddress}
      />
    </main>
  );
}
