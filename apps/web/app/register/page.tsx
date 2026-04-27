import { RegisterAgentForm } from "../../components/RegisterAgentForm";
import { buildDemoAgentProfile } from "../../lib/demoProfile";

/**
 * Renders the agent registration workspace with demo defaults and live local previews.
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
        defaultAgentAddress={profile.agentAddress}
        defaultAgentLabel={profile.agentLabel}
        defaultGasBudgetWei={profile.gasBudgetWei.toString()}
        defaultMaxGasReimbursementWei={profile.maxGasReimbursementWei.toString()}
        defaultMaxValueWei={profile.maxValueWei.toString()}
        defaultOwnerName={profile.ownerName}
        defaultPolicyExpiresAt={profile.policyExpiresAt.toString()}
        defaultPolicyUri={profile.policyUri}
        ensRegistryAddress={profile.ensRegistryAddress}
        executorAddress={profile.executorAddress}
        resolverAddress={profile.resolverAddress}
        taskLogAddress={profile.taskLogAddress}
      />
    </main>
  );
}
