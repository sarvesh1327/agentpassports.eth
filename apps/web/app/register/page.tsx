import Link from "next/link";
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
  const ownerLabel = defaultOwnerName || "connected owner ENS";

  return (
    <main className="page-shell page-shell--register">
      <section className="register-hero register-hero--permission-manager" aria-labelledby="register-title">
        <div className="register-hero__copy">
          <p className="register-hero__eyebrow"><span aria-hidden="true" /> Agent Permission Manager</p>
          <h1 id="register-title">Register Agent Passport</h1>
          <p>
            Create a Passport, issue an initial Visa, and publish KeeperHub-readable ENS records for {ownerLabel}.
            The owner wallet stays in control and can revoke access onchain.
          </p>
          <div className="register-hero__actions">
            {defaultOwnerName ? (
              <Link className="landing-button landing-button--secondary" href={`/owner/${encodeURIComponent(defaultOwnerName)}`}>
                <UiIcon name="arrow-left" size={16} /> Back to owner dashboard
              </Link>
            ) : null}
          </div>
        </div>
        <div className="register-hero__flow" aria-label="Register Agent flow">
          <div>
            <span>01</span>
            <strong>Passport</strong>
            <small>ENS subname + signer address</small>
          </div>
          <div>
            <span>02</span>
            <strong>Visa</strong>
            <small>Scoped policy + Gas budget</small>
          </div>
          <div>
            <span>03</span>
            <strong>KeeperHub Stamp</strong>
            <small>Validation rows read the ENS Visa</small>
          </div>
        </div>
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
