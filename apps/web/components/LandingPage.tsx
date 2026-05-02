"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { useAccount, useEnsName } from "wagmi";
import { AgentPassportsLogo, UiIcon } from "./icons/UiIcons";

type RouteIntent = "Dashboard" | "Register Agent";

const INSTALL_COMMAND = "curl -fsSL https://agentpassports.eth/install | bash";

const skillPackSteps = [
  {
    label: "01",
    title: "Install Skill Pack",
    copy: "Download the AgentPassports skill docs and local signing scripts from GitHub with one command."
  },
  {
    label: "02",
    title: "Create local signer",
    copy: "Run agentpassports-create-key in the agent workspace; only the public signer address is printed."
  },
  {
    label: "03",
    title: "Register Agent",
    copy: "Paste that public signer into the Register Agent flow so the owner wallet issues a Passport and Visa."
  },
  {
    label: "04",
    title: "Act through KeeperHub",
    copy: "The agent builds an intent, signs locally, submits through thin MCP, and reads KeeperHub Stamps."
  }
] as const;

type LandingGateActionProps = {
  children: ReactNode;
  className?: string;
  href: string;
  onGate: (route: RouteIntent) => void;
  ready: boolean;
  route: RouteIntent;
};

const flowSteps = [
  {
    label: "01",
    title: "Register the agent Passport",
    copy: "Bind an agent signer to an ENS subname so humans can inspect who is acting before any execution starts."
  },
  {
    label: "02",
    title: "Issue a scoped Visa",
    copy: "Publish target, selector, budget, token, recipient, and expiry limits as explicit policy metadata."
  },
  {
    label: "03",
    title: "KeeperHub checks the border",
    copy: "Every run is checked against Passport, Visa, and policy gates before execution can reach chain."
  },
  {
    label: "04",
    title: "Show the Stamp",
    copy: "Allowed, blocked, and failed executions produce evidence users can review from the Agent page."
  }
] as const;

const featureCards = [
  {
    title: "Agent identity users can understand",
    copy: "Agent names, signer addresses, resolver records, and policy hashes stay visible through ENS instead of hidden in backend config."
  },
  {
    title: "Scoped grants, not blank checks",
    copy: "A Visa describes exactly what an agent can call, how much it can spend, when it expires, and what owner wallet context it uses."
  },
  {
    title: "Execution evidence without handwaving",
    copy: "KeeperHub Stamps make both successful swaps and blocked attempts visible, including failed node, status, and transaction evidence."
  }
] as const;

/**
 * Production landing page for the permission-manager thesis.
 * Route CTAs intentionally gate Dashboard/Register behind wallet connection so
 * visitors learn that owner context is required before entering the app flows.
 */
export function LandingPage() {
  const { address } = useAccount();
  const ens = useEnsName({ address });
  const ownerName = ens.data?.trim().toLowerCase() ?? null;
  const dashboardHref = ownerName ? `/owner/${encodeURIComponent(ownerName)}` : "/";
  const registerHref = ownerName ? `/register?owner=${encodeURIComponent(ownerName)}` : "/register";
  const [pendingRoute, setPendingRoute] = useState<RouteIntent | null>(null);
  const [installCopied, setInstallCopied] = useState(false);

  async function copyInstallCommand() {
    await navigator.clipboard.writeText(INSTALL_COMMAND);
    setInstallCopied(true);
    window.setTimeout(() => setInstallCopied(false), 1800);
  }

  return (
    <main className="landing-site">
      <section className="landing-shell landing-hero-redesign" aria-labelledby="landing-title">
        <div className="landing-hero-redesign__copy">
          <p className="landing-eyebrow"><span aria-hidden="true" /> PERMISSION MANAGER FOR AUTONOMOUS AGENTS</p>
          <h1 id="landing-title">Register agents. Issue Visas. Revoke access onchain.</h1>
          <p className="landing-hero-redesign__lead">
            AgentPassports turns ENS into the control surface for AI agents: a <strong>Passport</strong> for identity,
            a <strong>Visa</strong> for scoped permissions, and <strong>KeeperHub Stamps</strong> for every allowed or blocked run.
          </p>

          <div className="landing-actions" aria-label="Primary landing actions">
            <LandingGateAction className="landing-button landing-button--primary" href={dashboardHref} onGate={setPendingRoute} ready={Boolean(ownerName)} route="Dashboard">
              Open Dashboard
            </LandingGateAction>
            <LandingGateAction className="landing-button landing-button--secondary" href={registerHref} onGate={setPendingRoute} ready={Boolean(address)} route="Register Agent">
              Register an Agent
            </LandingGateAction>
          </div>
          <p className="landing-route-note">
            <UiIcon name="wallet" size={16} /> Dashboard and registration are wallet-gated. Clicking either prompts the owner to connect first.
          </p>
        </div>

        <ProductPreview ownerName={ownerName} />
      </section>

      <section className="landing-shell landing-section landing-agent-install" id="agent-skill-pack" aria-labelledby="agent-install-title">
        <div className="landing-section__intro landing-section__intro--split">
          <div>
            <p className="landing-kicker">Agent Skill Pack</p>
            <h2 id="agent-install-title">One command gives any agent the AgentPassports workflow.</h2>
          </div>
          <p>
            Download the skill, create a local signer, register the public address, then use thin MCP to build,
            locally sign, submit, and read KeeperHub Stamps.
          </p>
        </div>
        <div className="landing-install-grid">
          <article className="landing-install-command-card" aria-label="AgentPassports one-command install">
            <span className="landing-route-card__label">One-command install</span>
            <code>{INSTALL_COMMAND}</code>
            <div className="landing-install-actions">
              <button className="landing-button landing-button--primary" onClick={copyInstallCommand} type="button">
                <UiIcon name="copy" size={17} /> {installCopied ? "Copied" : "Copy install command"}
              </button>
              <Link className="landing-button landing-button--secondary" href="https://github.com/sarvesh1327/agentpassports.eth/tree/main/skills/agentpassports" target="_blank">
                <UiIcon name="external" size={17} /> View GitHub
              </Link>
            </div>
            <p>
              The installer serves <code>scripts/install-agentpassports.sh</code>, installs local helpers, and does not touch env files or create keys unless asked.
            </p>
          </article>
          <div className="landing-install-steps" aria-label="Agent Skill Pack setup steps">
            {skillPackSteps.map((step) => (
              <article className="landing-install-step" key={step.label}>
                <span>{step.label}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="landing-safety-row" aria-label="Agent Skill Pack safety guarantees">
          <span><UiIcon name="shield" size={15} /> Private key stays local</span>
          <span><UiIcon name="queue" size={15} /> MCP stays thin</span>
          <span><UiIcon name="check" size={15} /> KeeperHub validates Visa</span>
          <span><UiIcon name="wallet" size={15} /> Owner wallet controls revoke</span>
        </div>
      </section>

      <section className="landing-shell landing-section" id="how-it-works" aria-labelledby="flow-title">
        <div className="landing-section__intro">
          <p className="landing-kicker">How it works</p>
          <h2 id="flow-title">A consent screen for agents, backed by ENS and runtime checks.</h2>
        </div>
        <div className="landing-flow-grid">
          {flowSteps.map((step) => (
            <article className="landing-flow-step" key={step.label}>
              <span>{step.label}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-shell landing-section" aria-labelledby="routes-title">
        <div className="landing-section__intro landing-section__intro--split">
          <div>
            <p className="landing-kicker">Product routes</p>
            <h2 id="routes-title">Two entry points. Both start from the owner wallet.</h2>
          </div>
          <p>Dashboard is for managing registered agents. Register Agent is for creating a new Passport and first Visa.</p>
        </div>
        <div className="landing-route-grid">
          <RouteCard
            copy="Review registered agents, active Visas, recent KeeperHub Stamps, and revoke access from one owner view."
            href={dashboardHref}
            label="Dashboard"
            onGate={setPendingRoute}
            ready={Boolean(ownerName)}
            route="Dashboard"
            title="Manage registered agents"
          />
          <RouteCard
            copy="Create a Passport, bind the signer to an ENS subname, and issue the first scoped Visa for the agent."
            href={registerHref}
            label="Register Agent"
            onGate={setPendingRoute}
            ready={Boolean(address)}
            route="Register Agent"
            title="Register a new agent"
          />
        </div>
      </section>

      <section className="landing-shell landing-section landing-feature-band" aria-labelledby="language-title">
        <div className="landing-section__intro">
          <p className="landing-kicker">Permission language</p>
          <h2 id="language-title">Built around clear nouns: Passport, Visa, Stamp.</h2>
        </div>
        <div className="landing-feature-grid">
          {featureCards.map((card) => (
            <article className="landing-feature-card" key={card.title}>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-shell landing-final-cta" aria-labelledby="final-cta-title">
        <div>
          <p className="landing-kicker">Start with the owner wallet</p>
          <h2 id="final-cta-title">Leave with a controlled agent.</h2>
        </div>
        <LandingGateAction className="landing-button landing-button--primary" href={registerHref} onGate={setPendingRoute} ready={Boolean(address)} route="Register Agent">
          Connect wallet and continue
        </LandingGateAction>
      </section>

      <WalletPromptModal onClose={() => setPendingRoute(null)} route={pendingRoute} />
    </main>
  );
}

function ProductPreview({ ownerName }: { ownerName: string | null }) {
  return (
    <aside className="landing-product-card" aria-label="AgentPassports product preview">
      <div className="landing-product-card__topline">
        <AgentPassportsLogo className="landing-product-card__logo" size={54} title="AgentPassports" />
        <div>
          <strong>{ownerName ?? "owner.eth"}</strong>
          <span>{ownerName ? "Connected owner" : "Wallet required"}</span>
        </div>
      </div>
      <div className="landing-passport-preview">
        <span className="landing-passport-preview__label">Passport</span>
        <strong>swapper.{ownerName ?? "owner.eth"}</strong>
        <p>Signer bound through ENS addr(agent)</p>
      </div>
      <div className="landing-visa-stack">
        <div><span>Visa</span><strong>Uniswap swapper</strong></div>
        <div><span>Scope</span><strong>SwapRouter02 · exactInputSingle</strong></div>
        <div><span>Stamp</span><strong>Allowed / blocked evidence</strong></div>
      </div>
      <div className="landing-stamp-row">
        <span><UiIcon name="check" size={15} /> Passport active</span>
        <span><UiIcon name="check" size={15} /> Visa scoped</span>
        <span><UiIcon name="check" size={15} /> KeeperHub checked</span>
      </div>
    </aside>
  );
}

function RouteCard(props: {
  copy: string;
  href: string;
  label: string;
  onGate: (route: RouteIntent) => void;
  ready: boolean;
  route: RouteIntent;
  title: string;
}) {
  return (
    <article className="landing-route-card">
      <span className="landing-route-card__label">{props.label}</span>
      <h3>{props.title}</h3>
      <p>{props.copy}</p>
      <LandingGateAction className="landing-route-card__action" href={props.href} onGate={props.onGate} ready={props.ready} route={props.route}>
        Continue to {props.label}
      </LandingGateAction>
      <small>{props.ready ? "✓ Wallet connected — ready to continue" : "Connect wallet to continue"}</small>
    </article>
  );
}

function LandingGateAction({ children, className, href, onGate, ready, route }: LandingGateActionProps) {
  if (ready) {
    return <Link className={className} data-route={route} href={href}>{children}</Link>;
  }

  return (
    <button className={className} data-route={route} onClick={() => onGate(route)} type="button">
      {children}
    </button>
  );
}

function WalletPromptModal({ onClose, route }: { onClose: () => void; route: RouteIntent | null }) {
  if (!route) {
    return null;
  }

  const routeCopy = route === "Dashboard"
    ? "Dashboard needs the owner wallet first. Connect the wallet so the app can load owner ENS context and show registered agents safely."
    : "Register Agent needs the owner wallet first. Connect the wallet so the app can prefill owner context and prepare registration safely.";

  return (
    <div className="landing-wallet-modal" data-open="true" role="presentation">
      <div aria-labelledby="wallet-modal-title" aria-modal="true" className="landing-wallet-modal__dialog" role="dialog">
        <button aria-label="Close wallet prompt" className="landing-wallet-modal__close" onClick={onClose} type="button">×</button>
        <p className="landing-kicker">Wallet required</p>
        <h2 id="wallet-modal-title">Connect wallet to continue</h2>
        <p>{routeCopy}</p>
        <div className="landing-wallet-modal__actions">
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button className="landing-button landing-button--primary" onClick={() => { openConnectModal?.(); onClose(); }} type="button">
                Connect wallet
              </button>
            )}
          </ConnectButton.Custom>
          <button className="landing-button landing-button--ghost" onClick={onClose} type="button">Not now</button>
        </div>
      </div>
    </div>
  );
}
