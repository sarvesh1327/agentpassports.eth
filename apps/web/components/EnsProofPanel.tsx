import type { Hex } from "@agentpassport/config";

export type EnsProofPanelProps = {
  ownerName?: string;
  ownerNode: Hex;
  agentName: string;
  agentNode: Hex;
  resolverAddress?: Hex | null;
  ensAgentAddress?: Hex | null;
  recoveredSigner?: Hex | null;
  policyHash?: Hex | null;
  policyEnabled?: boolean;
  gasBudgetWei?: bigint;
  authorizationStatus?: "pass" | "fail" | "unknown";
  failureReason?: string;
};

type ProofRow = {
  label: string;
  title?: string;
  value: string;
};

/**
 * Displays the live ENS and signer facts that prove why an agent task is authorized.
 */
export function EnsProofPanel(props: EnsProofPanelProps) {
  const rows: ProofRow[] = [
    { label: "Owner ENS", value: props.ownerName ?? "Not connected" },
    { label: "Owner node", title: props.ownerNode, value: shortenHex(props.ownerNode) },
    { label: "Agent ENS", value: props.agentName },
    { label: "Agent node", title: props.agentNode, value: shortenHex(props.agentNode) },
    { label: "Resolver", title: props.resolverAddress ?? undefined, value: formatNullableHex(props.resolverAddress) },
    { label: "ENS addr(agent)", title: props.ensAgentAddress ?? undefined, value: formatNullableHex(props.ensAgentAddress) },
    { label: "Recovered signer", title: props.recoveredSigner ?? undefined, value: formatNullableHex(props.recoveredSigner) },
    { label: "Policy hash", title: props.policyHash ?? undefined, value: formatNullableHex(props.policyHash) },
    { label: "Policy enabled", value: formatBoolean(props.policyEnabled) },
    { label: "Gas budget", value: formatWei(props.gasBudgetWei) }
  ];
  const status = props.authorizationStatus ?? "unknown";

  return (
    <section className="proof-panel" aria-labelledby="ens-proof-panel-title">
      <div className="proof-panel__header">
        <div>
          <p className="proof-panel__eyebrow">ENS proof</p>
          <h2 id="ens-proof-panel-title">Agent authorization</h2>
        </div>
        <span className={`proof-panel__status proof-panel__status--${status}`}>{authorizationLabel(status)}</span>
      </div>

      <dl className="proof-panel__grid">
        {rows.map((row) => (
          <div className="proof-panel__row" key={row.label}>
            <dt>{row.label}</dt>
            <dd title={row.title}>{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="proof-panel__result">
        <span>Authorization result</span>
        <strong>{props.failureReason ?? authorizationLabel(status)}</strong>
      </div>
    </section>
  );
}

/**
 * Converts wei into a compact ETH amount for dense proof surfaces.
 */
export function formatWei(value?: bigint): string {
  if (value === undefined) {
    return "Unknown";
  }
  const whole = value / 1_000_000_000_000_000_000n;
  const fraction = value % 1_000_000_000_000_000_000n;
  const fractionText = fraction.toString().padStart(18, "0").slice(0, 4).replace(/0+$/u, "");
  return fractionText ? `${whole}.${fractionText} ETH` : `${whole} ETH`;
}

/**
 * Shortens long hex values while preserving enough prefix and suffix for visual comparison.
 */
export function shortenHex(value: Hex): string {
  return value.length <= 18 ? value : `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function authorizationLabel(status: NonNullable<EnsProofPanelProps["authorizationStatus"]>): string {
  if (status === "pass") {
    return "Authorized";
  }
  if (status === "fail") {
    return "Rejected";
  }
  return "Unknown";
}

function formatBoolean(value?: boolean): string {
  if (value === undefined) {
    return "Unknown";
  }
  return value ? "Enabled" : "Disabled";
}

function formatNullableHex(value?: Hex | null): string {
  return value ? shortenHex(value) : "Unknown";
}
