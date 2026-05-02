import Link from "next/link";

const FLOW_STEPS = [
  {
    label: "01",
    title: "Create a local signer",
    body: "The agent gets a local key from the Agent Skill Pack. The private key stays on the agent machine."
  },
  {
    label: "02",
    title: "Register the Passport",
    body: "The owner wallet registers an agent ENS name and signer address so people know which agent is acting."
  },
  {
    label: "03",
    title: "Issue a Visa",
    body: "The owner defines exactly what the agent can do: target, selector, tokens, recipient, spend limits, expiry, and Gas budget."
  },
  {
    label: "04",
    title: "Agent signs an intent",
    body: "The agent uses thin MCP to build a task intent, then signs it locally. MCP never receives private keys."
  },
  {
    label: "05",
    title: "KeeperHub checks it",
    body: "KeeperHub reads the Passport and Visa, validates the request, and only then routes allowed work to execution."
  },
  {
    label: "06",
    title: "Show the Stamp",
    body: "Successful, blocked, and failed runs produce KeeperHub Stamps that the owner can review on the Agent page."
  }
] as const;

const PRODUCT_TERMS = [
  {
    term: "Passport",
    definition: "The agent identity: ENS name, owner wallet, and signer address."
  },
  {
    term: "Visa",
    definition: "The permission grant: what the agent can call, how much it can spend, and when it expires."
  },
  {
    term: "KeeperHub Stamp",
    definition: "The execution receipt: evidence that KeeperHub allowed, blocked, or failed a run."
  }
] as const;

const SCREENSHOTS = [
  {
    title: "Landing",
    image: "/docs/landing.png",
    body: "Explains the product promise and gives agents a one-command Skill Pack install."
  },
  {
    title: "Register Agent",
    image: "/docs/register.png",
    body: "Creates the Passport, first Visa, ENS records, and owner-wallet transaction queue."
  },
  {
    title: "Dashboard",
    image: "/docs/dashboard.png",
    body: "Owner view for Passports, active Visas, Gas budget, and management actions."
  },
  {
    title: "Agent Passport",
    image: "/docs/agent.png",
    body: "Public proof page showing Passport facts, Visa state, KeeperHub Stamps, and revocation controls."
  },
  {
    title: "MCP",
    image: "/docs/mcp.png",
    body: "Agent runtime page for build → local sign → submit → status, with KeeperHub as the authority."
  }
] as const;

/**
 * Simple product docs for visitors who need the AgentPassports mental model
 * before touching the dashboard or MCP details.
 */
export default function DocsPage() {
  return (
    <main className="page-shell page-shell--docs docs-page docs-page--permission-manager">
      <section className="docs-hero glass-panel" aria-labelledby="docs-title">
        <div>
          <p className="docs-eyebrow">Simple docs</p>
          <h1 id="docs-title">What is AgentPassports.eth?</h1>
          <p className="docs-hero__lead">
            AgentPassports.eth is a permission manager for AI agents. A human owner gives an agent a
            <strong> Passport</strong> for identity, a <strong>Visa</strong> for scoped access, and a
            <strong> KeeperHub Stamp</strong> for each allowed, blocked, or failed run.
          </p>
        </div>
        <div className="docs-hero__card" aria-label="Product summary">
          <span className="status-pill status-pill--info">Short version</span>
          <p>Register agents like identities. Issue Visas like permissions. Revoke access onchain.</p>
          <Link className="action-button action-button--primary" href="/register">
            Register Agent
          </Link>
        </div>
      </section>

      <section className="docs-term-grid" aria-label="Product terms">
        {PRODUCT_TERMS.map((item) => (
          <article className="docs-term-card" key={item.term}>
            <span>{item.term}</span>
            <p>{item.definition}</p>
          </article>
        ))}
      </section>

      <section className="docs-section glass-panel" aria-labelledby="docs-flow-title">
        <div className="docs-section__intro">
          <p className="docs-eyebrow">Flow of things</p>
          <h2 id="docs-flow-title">From owner permission to agent execution.</h2>
          <p>
            The product is intentionally split: owner control happens in the web app, agent signing happens locally,
            MCP only transports intent, and KeeperHub makes the final Passport/Visa decision.
          </p>
        </div>
        <div className="docs-flow-grid">
          {FLOW_STEPS.map((step) => (
            <article className="docs-flow-step" key={step.label}>
              <span>{step.label}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="docs-section docs-screenshot-section" aria-labelledby="docs-pages-title">
        <div className="docs-section__intro">
          <p className="docs-eyebrow">Screenshots</p>
          <h2 id="docs-pages-title">The main pages at a glance.</h2>
          <p>Each page maps to one job in the Passport → Visa → KeeperHub Stamp lifecycle.</p>
        </div>
        <div className="docs-screenshot-grid">
          {SCREENSHOTS.map((item) => (
            <figure className="docs-screenshot-card" key={item.title}>
              <img alt={`${item.title} page screenshot`} src={item.image} />
              <figcaption>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="docs-section glass-panel docs-workflow-section" aria-labelledby="docs-keeperhub-title">
        <div className="docs-section__intro docs-section__intro--split">
          <div>
            <p className="docs-eyebrow">KeeperHub</p>
            <h2 id="docs-keeperhub-title">KeeperHub is the execution border.</h2>
          </div>
          <p>
            Agents do not approve themselves. KeeperHub reads the Passport and Visa, blocks invalid requests,
            executes allowed owner-funded work, and sends Stamp evidence back to the app.
          </p>
        </div>
        <figure className="docs-workflow-card">
          <img alt="Simplified KeeperHub workflow map" src="/docs/keeperhub-workflow.svg" />
          <figcaption>
            Simplified KeeperHub workflow map. It shows the same product boundary as the live workflow: intent in,
            Passport/Visa checks, execution, then Stamp evidence.
          </figcaption>
        </figure>
      </section>

      <section className="docs-section docs-final-card glass-panel" aria-labelledby="docs-next-title">
        <div>
          <p className="docs-eyebrow">Next step</p>
          <h2 id="docs-next-title">Start with the owner wallet.</h2>
          <p>Register one agent, issue a narrow Visa, run through KeeperHub, then review the Stamp.</p>
        </div>
        <div className="docs-final-card__actions">
          <Link className="action-button action-button--primary" href="/register">
            Register Agent
          </Link>
          <Link className="action-button" href="/mcp">
            Read MCP flow
          </Link>
          <Link className="action-button" href="https://github.com/sarvesh1327/agentpassports.eth">
            GitHub
          </Link>
        </div>
      </section>
    </main>
  );
}
