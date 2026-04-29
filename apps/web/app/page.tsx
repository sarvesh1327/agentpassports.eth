import { OwnerDashboardEntry } from "../components/OwnerDashboardEntry";
import { LandingOwnerPreview } from "../components/LandingOwnerPreview";

/**
 * Renders the dashboard-first owner entry without prefilled user identity values.
 */
export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="landing-hero" aria-labelledby="home-title">
        <div className="landing-hero__content">
          <p className="home-intro__eyebrow">ENS-native agent control plane</p>
          <h1 id="home-title">Manage agent passports from one owner dashboard.</h1>
          <p>
            Register ENS agent subnames, publish policy from ENS, monitor gas budgets, and open each agent for signer,
            task history, revocation, and MCP execution controls.
          </p>
          <p className="sr-only">AgentPassports.eth</p>
          <p className="sr-only">Open owner dashboard</p>
          <OwnerDashboardEntry />
        </div>

        <LandingOwnerPreview />
      </section>
    </main>
  );
}
