import type { Hex, PolicySnapshot } from "@agentpassport/config";
import type { AgentTextRecord } from "../lib/agentSession";
import { formatWei, shortenHex } from "./EnsProofPanel";

type AgentLiveDataPanelProps = {
  agentAddress?: Hex | null;
  agentName: string;
  connectedWallet?: Hex | null;
  gasBudgetWei?: bigint;
  isReverseEnsSettled: boolean;
  nextNonce?: bigint | string | null;
  policySnapshot?: PolicySnapshot | null;
  policyHash?: Hex | null;
  resolverAddress?: Hex | null;
  reverseEnsName?: string | null;
  textRecords: readonly AgentTextRecord[];
};

type FactRow = {
  label: string;
  title?: string;
  value: string;
};

/**
 * Displays the live wallet, ENS, resolver, and executor state needed by run/revoke flows.
 */
export function AgentLiveDataPanel(props: AgentLiveDataPanelProps) {
  const rows: FactRow[] = [
    { label: "Connected wallet", title: props.connectedWallet ?? undefined, value: formatNullableHex(props.connectedWallet) },
    { label: "Wallet reverse ENS", value: formatReverseEnsStatus(props) },
    { label: "Agent ENS", value: props.agentName || "Unknown" },
    { label: "Resolver", title: props.resolverAddress ?? undefined, value: formatNullableHex(props.resolverAddress) },
    { label: "ENS addr(agent)", title: props.agentAddress ?? undefined, value: formatNullableHex(props.agentAddress) },
    { label: "Policy state", value: formatPolicyState(props.policySnapshot?.enabled) },
    { label: "Policy target", title: props.policySnapshot?.target, value: formatNullableHex(props.policySnapshot?.target) },
    { label: "Policy selector", title: props.policySnapshot?.selector, value: props.policySnapshot?.selector ?? "Unknown" },
    { label: "Policy hash", title: props.policyHash ?? undefined, value: formatNullableHex(props.policyHash) },
    { label: "Gas budget", value: formatWei(props.gasBudgetWei) },
    { label: "Next nonce", value: formatNonce(props.nextNonce) }
  ];

  return (
    <section className="app-card app-card--wide" aria-labelledby="agent-live-data-title">
      <div className="section-heading">
        <p>Live agent data</p>
        <h2 id="agent-live-data-title">Agent session state</h2>
      </div>

      <dl className="fact-grid">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd title={row.title}>{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="record-table" role="table" aria-label="ENS text records">
        <div className="record-table__row record-table__row--heading" role="row">
          <span role="columnheader">ENS text records</span>
          <strong role="columnheader">Value</strong>
        </div>
        {props.textRecords.map((record) => (
          <div className="record-table__row" role="row" key={record.key}>
            <span role="cell">{record.key}</span>
            <strong role="cell">{record.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Shows reverse ENS lookup state without making reverse ENS mandatory.
 */
function formatReverseEnsStatus(props: Pick<AgentLiveDataPanelProps, "connectedWallet" | "isReverseEnsSettled" | "reverseEnsName">): string {
  if (!props.connectedWallet) {
    return "Connect wallet";
  }
  if (!props.isReverseEnsSettled) {
    return "Checking";
  }
  return props.reverseEnsName ?? "Not set";
}

function formatNullableHex(value?: Hex | null): string {
  return value ? shortenHex(value) : "Unknown";
}

function formatNonce(value?: bigint | string | null): string {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value || "Unknown";
}

function formatPolicyState(value?: boolean): string {
  if (value === undefined) {
    return "Unknown";
  }
  return value ? "Enabled" : "Disabled";
}
