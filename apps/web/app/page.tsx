import Link from "next/link";

/**
 * Renders the product landing page without prefilled owner or agent identity values.
 */
export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="landing-hero" aria-labelledby="home-title">
        <div className="landing-hero__content">
          <p className="home-intro__eyebrow">ENS-first agent identity</p>
          <h1 id="home-title">AgentPassports.eth</h1>
          <p>
            Register an ENS subname for an agent, set a narrow execution policy, fund a capped
            gas budget, and prove revocation by changing the live ENS address.
          </p>
          <div className="landing-hero__actions" aria-label="Primary workflow">
            <Link href="/register">Register agent</Link>
            <Link href="/run">Run task</Link>
            <Link href="/revoke">Revoke access</Link>
          </div>
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
          <h2 id="landing-steps-title">Build the proof one step at a time</h2>
        </div>
        <ol>
          <li>Connect the owner wallet and register the agent ENS records.</li>
          <li>Switch to the agent wallet and sign a policy-limited task intent.</li>
          <li>Submit through the relayer, inspect TaskLog history, then revoke and retry.</li>
        </ol>
      </section>
    </main>
  );
}
