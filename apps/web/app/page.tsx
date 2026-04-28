import { OwnerDashboardEntry } from "../components/OwnerDashboardEntry";

/**
 * Renders the dashboard-first owner entry without prefilled user identity values.
 */
export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="landing-hero" aria-labelledby="home-title">
        <div className="landing-hero__content">
          <p className="home-intro__eyebrow">Owner dashboard</p>
          <h1 id="home-title">AgentPassports.eth</h1>
          <p>
            Manage ENS agent subnames from one owner view, register new agents from the owner index,
            and open each agent for policy, gas, signer, task history, and delete controls.
          </p>
          <OwnerDashboardEntry />
        </div>

        <div className="landing-visual" aria-label="Agent passport workflow preview">
          <div className="landing-visual__rail">
            <span>ENS subname</span>
            <strong>Owner supplied</strong>
          </div>
          <div className="landing-visual__rail">
            <span>Live resolver</span>
            <strong>addr(agent)</strong>
          </div>
          <div className="landing-visual__rail">
            <span>Executor policy</span>
            <strong>TaskLog only</strong>
          </div>
          <div className="landing-visual__rail">
            <span>Revocation proof</span>
            <strong>Old signatures fail</strong>
          </div>
        </div>
      </section>

      <section className="landing-steps" aria-labelledby="landing-steps-title">
        <div className="section-heading">
          <p>Flow</p>
          <h2 id="landing-steps-title">Start from the owner ENS</h2>
        </div>
        <ol>
          <li>Open the owner dashboard for the ENS name that controls agent subnames.</li>
          <li>Register new agents from that dashboard so the owner ENS index is updated.</li>
          <li>Manage each agent from its agent page while keeping TaskLog history visible.</li>
        </ol>
      </section>
    </main>
  );
}
