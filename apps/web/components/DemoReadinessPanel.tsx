export type DemoReadinessPanelProps = {
  agentAddress?: string | null;
  gasBudgetWei?: bigint;
  policyEnabled?: boolean;
  relayerReady?: boolean;
  resolverAddress?: string | null;
  taskLogAddress?: string | null;
};

type ReadinessItem = {
  label: string;
  ready: boolean;
  value: string;
};

const READY_ITEM_CLASS_NAME = "readiness-panel__item readiness-panel__item--ready";
const BLOCKED_ITEM_CLASS_NAME = "readiness-panel__item readiness-panel__item--blocked";

/**
 * Summarizes the live prerequisites needed for a judge-facing execution demo.
 */
export function DemoReadinessPanel(props: DemoReadinessPanelProps) {
  const items: ReadinessItem[] = [
    { label: "Resolver", ready: Boolean(props.resolverAddress), value: props.resolverAddress ? "Configured" : "Missing" },
    { label: "Agent addr", ready: Boolean(props.agentAddress), value: props.agentAddress ? "Resolved" : "Missing" },
    { label: "Policy", ready: props.policyEnabled === true, value: props.policyEnabled ? "Enabled" : "Disabled" },
    { label: "Gas budget", ready: (props.gasBudgetWei ?? 0n) > 0n, value: (props.gasBudgetWei ?? 0n) > 0n ? "Funded" : "Empty" },
    { label: "TaskLog", ready: Boolean(props.taskLogAddress), value: props.taskLogAddress ? "Configured" : "Missing" },
    { label: "Relayer", ready: props.relayerReady !== false, value: props.relayerReady === false ? "Check config" : "Ready" }
  ];

  return (
    <section className="readiness-panel" aria-labelledby="demo-readiness-title">
      <div className="section-heading">
        <p>Demo</p>
        <h2 id="demo-readiness-title">Readiness checklist</h2>
      </div>
      <div className="readiness-panel__grid">
        {items.map((item) => (
          <div
            className={item.ready ? READY_ITEM_CLASS_NAME : BLOCKED_ITEM_CLASS_NAME}
            key={item.label}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
