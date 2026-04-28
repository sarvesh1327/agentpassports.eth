import { RegisterAgentForm } from "../../components/RegisterAgentForm";
import { buildDemoAgentProfile } from "../../lib/demoProfile";

/**
 * Renders the agent registration workspace with blank user-controlled identity fields.
 */
export default function RegisterPage() {
  const profile = buildDemoAgentProfile();

  return (
    <main className="page-shell">
      <section className="page-heading" aria-labelledby="register-title">
        <p>Register</p>
        <h1 id="register-title">Create an agent passport</h1>
      </section>

      <RegisterAgentForm
        chainId={profile.chainId}
        defaultAgentAddress={null}
        defaultAgentLabel=""
        defaultGasBudgetWei=""
        defaultMaxGasReimbursementWei={profile.maxGasReimbursementWei.toString()}
        defaultMaxValueWei={profile.maxValueWei.toString()}
        defaultOwnerName=""
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
