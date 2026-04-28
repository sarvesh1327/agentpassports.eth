import type { Hex } from "@agentpassport/config";
import { shortenHex } from "./EnsProofPanel";

export type AgentPassportCardProps = {
  agentName: string;
  agentNode: Hex;
  agentAddress?: Hex | null;
  capabilities: readonly string[];
  ownerName?: string;
  policyUri?: string;
  status: "active" | "disabled" | "unknown";
  summary?: string;
};

/**
 * Shows the public profile fields that make an agent recognizable before proving authorization.
 */
export function AgentPassportCard(props: AgentPassportCardProps) {
  return (
    <section className="passport-card" aria-labelledby="agent-passport-title">
      <div className="passport-card__header">
        <p className="passport-card__eyebrow">Agent passport</p>
        <span className={`passport-card__status passport-card__status--${props.status}`}>{statusLabel(props.status)}</span>
      </div>

      <h2 id="agent-passport-title">{props.agentName}</h2>
      <p className="passport-card__summary">
        {props.summary ?? "Public ENS profile for an onchain agent with owner-funded execution permissions."}
      </p>

      <dl className="passport-card__facts">
        <div>
          <dt>Agent ENS</dt>
          <dd>{props.agentName}</dd>
        </div>
        <div>
          <dt>Owner ENS</dt>
          <dd>{props.ownerName ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>Agent node</dt>
          <dd title={props.agentNode}>{shortenHex(props.agentNode)}</dd>
        </div>
        <div>
          <dt>Agent address</dt>
          <dd title={props.agentAddress ?? undefined}>{props.agentAddress ? shortenHex(props.agentAddress) : "Unknown"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{statusLabel(props.status)}</dd>
        </div>
      </dl>

      <div className="passport-card__section">
        <h3>Capabilities</h3>
        <ul className="passport-card__capabilities">
          {props.capabilities.map((capability) => (
            <li key={capability}>{capability}</li>
          ))}
        </ul>
      </div>

      <div className="passport-card__section">
        <h3>Policy metadata</h3>
        {props.policyUri ? (
          <a className="passport-card__link" href={props.policyUri}>
            {props.policyUri}
          </a>
        ) : (
          <p className="passport-card__muted">Not configured</p>
        )}
      </div>
    </section>
  );
}

function statusLabel(status: AgentPassportCardProps["status"]): string {
  if (status === "active") {
    return "Active";
  }
  if (status === "disabled") {
    return "Disabled";
  }
  return "Unknown";
}
