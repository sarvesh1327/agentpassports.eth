"use client";

import { useEffect, useMemo, useState } from "react";
import type { Hex } from "@agentpassport/config";
import { encodeFunctionData } from "viem";
import { usePublicClient, useReadContract, useReadContracts, useSendTransaction } from "wagmi";
import { AgentManagementPanel } from "./AgentManagementPanel";
import { StatusBanner } from "./StatusBanner";
import { TaskHistoryPanel } from "./TaskHistoryPanel";
import {
  AGENT_ENS_EXECUTOR_ABI,
  AGENT_TEXT_RECORD_KEYS,
  ENS_REGISTRY_ABI,
  PUBLIC_RESOLVER_ABI,
  nonZeroAddress
} from "../lib/contracts";
import { parseCapabilities, readPassportStatus, resolveVisibleAgentAddress } from "../lib/agentProfileDisplay";
import type { SerializableAgentProfile } from "../lib/demoProfile";
import { formatWeiAsEth, formatWeiInputAsEth, parseEthInputToWei } from "../lib/ethAmount";
import { AgentBotIcon, UiIcon } from "./icons/UiIcons";
import {
  loadTaskHistory,
  type TaskHistoryItem
} from "../lib/taskHistory";

type TextReadResult = {
  result?: unknown;
  status?: string;
};

/**
 * Hydrates the agent passport with live ENS, executor, and TaskLog reads.
 */
export function AgentProfileView({ initialProfile }: { initialProfile: SerializableAgentProfile }) {
  const publicClient = usePublicClient({ chainId: Number(initialProfile.chainId) });
  const { sendTransactionAsync } = useSendTransaction();
  const [taskHistory, setTaskHistory] = useState<TaskHistoryItem[]>([]);
  const [managementStatus, setManagementStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [managementMessage, setManagementMessage] = useState("Owner actions are ready.");
  const registryResolver = useReadContract({
    address: initialProfile.ensRegistryAddress ?? undefined,
    abi: ENS_REGISTRY_ABI,
    functionName: "resolver",
    args: [initialProfile.agentNode],
    query: { enabled: Boolean(initialProfile.ensRegistryAddress) }
  });
  const registryResolverAddress = nonZeroAddress(registryResolver.data as Hex | undefined);
  const resolverReadSettled = registryResolver.isSuccess;
  const resolverAddress = resolverReadSettled ? registryResolverAddress : registryResolverAddress ?? initialProfile.resolverAddress ?? null;
  const agentAddress = useReadContract({
    address: resolverAddress ?? undefined,
    abi: PUBLIC_RESOLVER_ABI,
    functionName: "addr",
    args: [initialProfile.agentNode],
    query: { enabled: Boolean(resolverAddress) }
  });
  const textRecordReads = useReadContracts({
    contracts: resolverAddress
      ? AGENT_TEXT_RECORD_KEYS.map((key) => ({
          address: resolverAddress,
          abi: PUBLIC_RESOLVER_ABI,
          functionName: "text",
          args: [initialProfile.agentNode, key]
        }))
      : [],
    query: { enabled: Boolean(resolverAddress) }
  });
  const gasBudgetRead = useReadContract({
    address: initialProfile.executorAddress ?? undefined,
    abi: AGENT_ENS_EXECUTOR_ABI,
    functionName: "gasBudgetWei",
    args: [initialProfile.agentNode],
    query: { enabled: Boolean(initialProfile.executorAddress) }
  });
  const nextNonceRead = useReadContract({
    address: initialProfile.executorAddress ?? undefined,
    abi: AGENT_ENS_EXECUTOR_ABI,
    functionName: "nextNonce",
    args: [initialProfile.agentNode],
    query: { enabled: Boolean(initialProfile.executorAddress) }
  });
  const textRecords = useMemo(
    () => mergeTextRecords(initialProfile.textRecords, textRecordReads.data as TextReadResult[] | undefined),
    [initialProfile.textRecords, textRecordReads.data]
  );
  const resolvedAgentAddress = nonZeroAddress(agentAddress.data as Hex | undefined);
  const agentAddressReadSettled = Boolean(resolverAddress) && agentAddress.isSuccess;
  const liveAgentAddress = resolveVisibleAgentAddress({
    agentAddressReadSettled,
    initialAgentAddress: initialProfile.agentAddress,
    resolverAddress,
    resolverReadSettled,
    resolvedAgentAddress
  });
  const liveGasBudget = (gasBudgetRead.data as bigint | undefined) ?? safeBigInt(initialProfile.gasBudgetWei);
  const liveNextNonce = (nextNonceRead.data as bigint | undefined)?.toString() ?? initialProfile.nextNonce ?? "Unknown";
  const capabilityText = textRecords.find((record) => record.key === "agent.capabilities")?.value;
  const capabilities = parseCapabilities(capabilityText, initialProfile.capabilities);
  const statusText = textRecords.find((record) => record.key === "agent.status")?.value;
  const policyUri = textRecords.find((record) => record.key === "agent.policy.uri")?.value || initialProfile.policyUri;
  const policyHash = textRecords.find((record) => record.key === "agent.policy.hash")?.value || initialProfile.policyHash;
  const policyDigest = textRecords.find((record) => record.key === "agent.policy.digest")?.value || null;
  const policyTarget = textRecords.find((record) => record.key === "agent.policy.target")?.value || null;
  const policySelector = textRecords.find((record) => record.key === "agent.policy.selector")?.value || "";
  const maxValueWei = textRecords.find((record) => record.key === "agent.policy.maxValueWei")?.value || "";
  const maxGasReimbursementWei = textRecords.find((record) => record.key === "agent.policy.maxGasReimbursementWei")?.value || "";
  const policyExpiresAt = textRecords.find((record) => record.key === "agent.policy.expiresAt")?.value || "";
  const passportStatus = readPassportStatus(statusText, liveAgentAddress);
  const policyEnabled = passportStatus === "active";
  const nextStatusAction = passportStatus === "disabled" ? "active" : "disabled";

  async function refreshAgentReads() {
    await Promise.all([
      registryResolver.refetch(),
      agentAddress.refetch(),
      textRecordReads.refetch(),
      gasBudgetRead.refetch(),
      nextNonceRead.refetch()
    ]);

    const tasks = await loadTaskHistory({
      agentNode: initialProfile.agentNode,
      fromBlock: parseOptionalBigInt(initialProfile.taskLogStartBlock),
      publicClient,
      taskLogAddress: initialProfile.taskLogAddress
    });
    setTaskHistory(tasks);
  }

  async function sendAgentManagementCall(input: { data: Hex; label: string; to?: Hex | null; value?: bigint }) {
    if (!input.to) {
      setManagementStatus("error");
      setManagementMessage(`${input.label} target is not configured.`);
      return;
    }

    setManagementStatus("loading");
    setManagementMessage(`Awaiting wallet approval for ${input.label}.`);
    try {
      const hash = await sendTransactionAsync({ data: input.data, to: input.to, value: input.value });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await refreshAgentReads();
      setManagementStatus("success");
      setManagementMessage(`${input.label} transaction confirmed.`);
    } catch (error) {
      setManagementStatus("error");
      setManagementMessage(error instanceof Error ? error.message : `${input.label} failed.`);
    }
  }

  async function writeAgentStatus(nextStatus: "active" | "disabled") {
    await sendAgentManagementCall({
      data: encodeFunctionData({
        abi: PUBLIC_RESOLVER_ABI,
        functionName: "setText",
        args: [initialProfile.agentNode, "agent.status", nextStatus]
      }),
      label: nextStatus === "active" ? "Enable agent" : "Disable agent",
      to: resolverAddress
    });
  }

  async function submitGasBudgetChange(mode: "deposit" | "withdraw", amountEth: string) {
    const amountWei = parseEthInputToWei(amountEth);
    if (amountWei === 0n) {
      setManagementStatus("error");
      setManagementMessage("Enter a nonzero ETH amount before changing gas.");
      return;
    }

    await sendAgentManagementCall({
      data: encodeFunctionData({
        abi: AGENT_ENS_EXECUTOR_ABI,
        functionName: mode === "deposit" ? "depositGasBudget" : "withdrawGasBudget",
        args: mode === "deposit" ? [initialProfile.agentNode] : [initialProfile.agentNode, amountWei]
      }),
      label: mode === "deposit" ? "Add gas" : "Withdraw gas",
      to: initialProfile.executorAddress,
      value: mode === "deposit" ? amountWei : undefined
    });
  }

  useEffect(() => {
    let cancelled = false;

    /**
     * Reads indexed and onchain TaskLog records for the selected agent node.
     */
    async function refreshTaskHistory() {
      const tasks = await loadTaskHistory({
        agentNode: initialProfile.agentNode,
        fromBlock: parseOptionalBigInt(initialProfile.taskLogStartBlock),
        publicClient,
        taskLogAddress: initialProfile.taskLogAddress
      });
      if (!cancelled) {
        setTaskHistory(tasks);
      }
    }

    refreshTaskHistory().catch(() => {
      if (!cancelled) {
        setTaskHistory([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initialProfile.agentNode, initialProfile.taskLogAddress, initialProfile.taskLogStartBlock, publicClient]);

  return (
    <div className="agent-detail">
      <section className="agent-detail__topbar agent-detail__hero glass-panel" aria-labelledby="agent-title">
        <a className="agent-detail__back" href={`/owner/${encodeURIComponent(initialProfile.ownerName)}`}>
          <UiIcon name="arrow-left" size={15} /> Back to dashboard
        </a>
        <div className="agent-detail__header">
          <div className="agent-detail__identity">
            <span className="agent-detail__avatar" aria-hidden="true"><AgentBotIcon size={36} /></span>
            <div>
              <div className="agent-detail__name-row">
                <h1 id="agent-title">{initialProfile.agentName}</h1>
                <span className={`status-pill status-pill--${passportStatus === "active" ? "success" : passportStatus === "disabled" ? "warning" : "neutral"}`}>
                  {passportStatus === "active" ? "Active" : passportStatus === "disabled" ? "Disabled" : "Unknown"}
                </span>
              </div>
              <dl className="agent-detail__quick-facts">
                <div>
                  <dt>Signer</dt>
                  <dd title={liveAgentAddress ?? undefined}>{liveAgentAddress ? shortenHex(liveAgentAddress) : "Unknown"}</dd>
                </div>
                <div>
                  <dt>Policy Source</dt>
                  <dd><span className="status-pill status-pill--success">ENS</span></dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="agent-detail__actions" aria-label="Agent quick actions">
            <button className="action-button action-button--secondary" type="button" onClick={() => void writeAgentStatus(nextStatusAction)}>
              <UiIcon name={nextStatusAction === "active" ? "check" : "shield"} size={16} /> {nextStatusAction === "active" ? "Enable" : "Disable"}
            </button>
            <a className="action-button action-button--secondary" href="#agent-management-policy-title"><UiIcon name="edit" size={16} /> Edit policy</a>
            <a className="agent-detail__delete-link action-button action-button--danger" href="#agent-management-delete-title" aria-label="Delete agent"><UiIcon name="trash" size={16} /> Delete</a>
          </div>
        </div>
        <StatusBanner
          details={`Resolver ${resolverAddress ? shortenHex(resolverAddress) : "not configured"}`}
          message={managementMessage}
          title="Owner action status"
          variant={managementStatus}
        />
      </section>

      <div className="agent-detail__grid">
        <LiveEnsPassportPanel
          agentAddress={liveAgentAddress}
          agentName={initialProfile.agentName}
          agentNode={initialProfile.agentNode}
          ownerName={initialProfile.ownerName}
          ownerNode={initialProfile.ownerNode}
          policyHash={policyHash}
          policyUri={policyUri}
          resolverAddress={resolverAddress}
          status={passportStatus}
        />
        <PolicyStatePanel
          capabilities={capabilities}
          executorAddress={initialProfile.executorAddress}
          gasBudgetWei={liveGasBudget}
          maxGasReimbursementWei={maxGasReimbursementWei}
          maxValueWei={maxValueWei}
          nextNonce={liveNextNonce}
          policyDigest={typeof policyDigest === "string" && policyDigest.startsWith("0x") ? policyDigest as Hex : null}
          policyExpiresAt={policyExpiresAt}
          policyHash={typeof policyHash === "string" && policyHash.startsWith("0x") ? policyHash as Hex : initialProfile.policyHash}
          policySelector={policySelector}
          policyTarget={typeof policyTarget === "string" && policyTarget.startsWith("0x") ? policyTarget as Hex : null}
          policyUri={policyUri}
          status={passportStatus}
          taskLogAddress={initialProfile.taskLogAddress}
        />
        <AgentProofPanel
          agentNode={initialProfile.agentNode}
          ownerNode={initialProfile.ownerNode}
          recoveredSigner={liveAgentAddress}
          resolverAddress={resolverAddress}
        />
        <GasBudgetPanel
          gasBudgetWei={liveGasBudget}
          onAddGas={(amountEth) => void submitGasBudgetChange("deposit", amountEth)}
          onWithdrawGas={(amountEth) => void submitGasBudgetChange("withdraw", amountEth)}
        />
        <TaskHistoryPanel
          cardClassName="agent-panel agent-history-card"
          emptyDescription="TaskLog events remain visible here after disable or delete."
          emptyTitle="No task history"
          eyebrow="TaskLog"
          headingId="agent-history-title"
          tasks={taskHistory}
          title="Task history"
        />
      </div>

      <AgentManagementPanel
        gasBudgetWei={liveGasBudget}
        initialProfile={initialProfile}
        liveAgentAddress={liveAgentAddress}
        onDeleted={() => {
          window.location.href = `/owner/${encodeURIComponent(initialProfile.ownerName)}`;
        }}
        onRefresh={refreshAgentReads}
        policyEnabled={policyEnabled}
        resolverAddress={resolverAddress}
      />
    </div>
  );
}

function AgentProofPanel(props: {
  agentNode: Hex;
  ownerNode: Hex;
  recoveredSigner: Hex | null;
  resolverAddress: Hex | null;
}) {
  const rows = [
    { label: "agentNode", title: props.agentNode, value: shortenHex(props.agentNode) },
    { label: "ownerNode", title: props.ownerNode, value: shortenHex(props.ownerNode) },
    {
      label: "Live resolver",
      title: props.resolverAddress ?? undefined,
      value: props.resolverAddress ? shortenHex(props.resolverAddress) : "Unknown"
    },
    {
      label: "Recovered signer",
      title: props.recoveredSigner ?? undefined,
      value: props.recoveredSigner ? shortenHex(props.recoveredSigner) : "Unknown"
    }
  ];

  return (
    <section className="agent-panel agent-proof-card metric-card" aria-labelledby="agent-proof-title">
      <h2 id="agent-proof-title"><UiIcon name="shield" size={18} /> Agent proof</h2>
      <dl className="agent-fact-table">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd title={row.title}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Displays the live ENS passport fields in the management-page layout.
 */
function LiveEnsPassportPanel(props: {
  agentAddress: Hex | null;
  agentName: string;
  agentNode: Hex;
  ownerName: string;
  ownerNode: Hex;
  policyHash: Hex | string | null;
  policyUri: string;
  resolverAddress: Hex | null;
  status: string;
}) {
  const rows = [
    { label: "addr", title: props.agentAddress ?? undefined, value: props.agentAddress ? shortenHex(props.agentAddress) : "Unknown" },
    { label: "resolver", title: props.resolverAddress ?? undefined, value: props.resolverAddress ? shortenHex(props.resolverAddress) : "Unknown" },
    { label: "owner", title: props.ownerNode, value: props.ownerName },
    { label: "agent.status", value: props.status },
    { label: "agent.policy.uri", title: props.policyUri, value: props.policyUri || "Unknown" },
    { label: "agent.policy.digest", title: props.policyHash ?? undefined, value: props.policyHash ? shortenHex(props.policyHash as Hex) : "Unknown" }
  ];

  return (
    <section className="agent-panel agent-passport-panel" aria-labelledby="agent-passport-title">
      <h2 id="agent-passport-title"><UiIcon name="shield" size={18} /> Live ENS Passport</h2>
      <dl className="agent-fact-table">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd title={row.title}>
              {row.label === "agent.status" ? <span className="pill pill--success">{row.value}</span> : row.value}
            </dd>
          </div>
        ))}
      </dl>
      <span className="sr-only">{props.agentName}</span>
    </section>
  );
}

/**
 * Shows the executor-facing policy and gas budget facts for the agent node.
 */
function PolicyStatePanel(props: {
  capabilities: readonly string[];
  executorAddress: Hex | null;
  gasBudgetWei: bigint;
  maxGasReimbursementWei: string;
  maxValueWei: string;
  nextNonce: string;
  policyDigest: Hex | null;
  policyExpiresAt: string;
  policyHash: Hex | null;
  policySelector: string;
  policyTarget: Hex | null;
  policyUri: string;
  status: string;
  taskLogAddress: Hex | null;
}) {
  const rows = [
    { label: "Allowed Target (TaskLog)", title: props.policyTarget ?? props.taskLogAddress ?? undefined, value: props.policyTarget ? shortenHex(props.policyTarget) : props.taskLogAddress ? shortenHex(props.taskLogAddress) : "Unknown" },
    { label: "Allowed Selector", title: props.policySelector || undefined, value: props.policySelector || "Unknown" },
    { label: "Max Value per Call", value: props.maxValueWei ? formatWei(safeBigInt(props.maxValueWei)) : "Unknown" },
    { label: "Reimbursement Cap", value: props.maxGasReimbursementWei ? formatWei(safeBigInt(props.maxGasReimbursementWei)) : "Unknown" },
    { label: "Expiry", value: props.policyExpiresAt ? formatUnixTime(safeBigInt(props.policyExpiresAt)) : "Unknown" },
    {
      label: "Policy digest",
      title: props.policyDigest ?? undefined,
      value: props.policyDigest ? shortenHex(props.policyDigest) : "Unknown"
    },
    {
      label: "Policy hash",
      title: props.policyHash ?? undefined,
      value: props.policyHash ? shortenHex(props.policyHash) : "Unknown"
    },
    {
      label: "Executor",
      title: props.executorAddress ?? undefined,
      value: props.executorAddress ? shortenHex(props.executorAddress) : "Unknown"
    },
    { label: "Policy Source", value: props.policyUri ? "ENS" : "Unknown" },
    { label: "Policy state", value: props.status === "active" ? "Enabled by exact ENS status" : "Disabled or unknown" },
    { label: "Next nonce", value: props.nextNonce }
  ];

  return (
    <section className="agent-panel agent-policy-card" aria-labelledby="agent-policy-title">
      <h2 id="agent-policy-title"><UiIcon name="document" size={18} /> Policy</h2>
      <dl className="agent-fact-table">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd title={row.title}>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="agent-policy-card__capabilities">
        <span>Capabilities</span>
        <div>
          {props.capabilities.map((capability) => (
            <span className="pill pill--info" key={capability}>{capability}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function GasBudgetPanel(props: {
  gasBudgetWei: bigint;
  onAddGas: (amountEth: string) => void;
  onWithdrawGas: (amountEth: string) => void;
}) {
  const [addAmountEth, setAddAmountEth] = useState("");
  const [withdrawAmountEth, setWithdrawAmountEth] = useState("");

  return (
    <section className="agent-panel agent-gas-card" aria-labelledby="agent-gas-title">
      <h2 id="agent-gas-title"><UiIcon name="gas" size={18} /> Gas Budget</h2>
      <span>Balance</span>
      <strong>{formatWei(props.gasBudgetWei)}</strong>
      <div className="agent-gas-card__inputs">
        <form onSubmit={(event) => {
          event.preventDefault();
          props.onAddGas(addAmountEth);
        }}>
          <label>
          <span>Add amount (ETH)</span>
            <input
              id="agent-gas-add-input"
              inputMode="decimal"
              onChange={(event) => setAddAmountEth(event.target.value)}
              placeholder="0.0"
              value={addAmountEth}
            />
          </label>
          <button type="submit"><UiIcon name="plus" size={16} /> Add gas</button>
        </form>
        <form onSubmit={(event) => {
          event.preventDefault();
          props.onWithdrawGas(withdrawAmountEth);
        }}>
          <label>
          <span>Withdraw amount (ETH)</span>
          <span className="agent-gas-card__input-row">
              <input
                id="agent-gas-withdraw-input"
                inputMode="decimal"
                onChange={(event) => setWithdrawAmountEth(event.target.value)}
                placeholder="0.0"
                value={withdrawAmountEth}
              />
              <button type="button" onClick={() => setWithdrawAmountEth(formatWeiInputAsEth(props.gasBudgetWei.toString()))}>Max</button>
          </span>
          </label>
          <button type="submit"><UiIcon name="download" size={16} /> Withdraw gas</button>
        </form>
      </div>
    </section>
  );
}

/**
 * Replaces demo text record values with live resolver values when they exist.
 */
function mergeTextRecords(
  initialRecords: readonly { key: string; value: string }[],
  liveRecords?: TextReadResult[]
): readonly { key: string; value: string }[] {
  return AGENT_TEXT_RECORD_KEYS.map((key, index) => {
    const liveValue = liveRecords?.[index]?.status === "success" ? String(liveRecords[index]?.result ?? "") : "";
    const fallback = initialRecords.find((record) => record.key === key)?.value ?? "";
    return { key, value: liveValue || fallback || "Unknown" };
  });
}

/**
 * Parses bigint strings from serialized server props.
 */
function safeBigInt(value: string): bigint {
  return /^\d+$/u.test(value) ? BigInt(value) : 0n;
}

/**
 * Converts serialized optional block numbers into bigint values for bounded event reads.
 */
function parseOptionalBigInt(value: string | null): bigint | null {
  return value && /^\d+$/u.test(value) ? BigInt(value) : null;
}

function formatUnixTime(value: bigint): string {
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(timestamp * 1000));
}

function formatWei(value?: bigint): string {
  return formatWeiAsEth(value);
}

function shortenHex(value: Hex): string {
  return value.length <= 18 ? value : `${value.slice(0, 10)}...${value.slice(-6)}`;
}
