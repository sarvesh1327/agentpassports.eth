"use client";

import { useEffect, useMemo, useState } from "react";
import type { Hex } from "@agentpassport/config";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { AgentManagementPanel } from "./AgentManagementPanel";
import { TaskHistoryPanel } from "./TaskHistoryPanel";
import {
  AGENT_POLICY_EXECUTOR_ABI,
  AGENT_TEXT_RECORD_KEYS,
  ENS_REGISTRY_ABI,
  PUBLIC_RESOLVER_ABI,
  type PolicyContractResult,
  nonZeroAddress
} from "../lib/contracts";
import { parseCapabilities, readPassportStatus, resolveVisibleAgentAddress } from "../lib/agentProfileDisplay";
import type { SerializableAgentProfile } from "../lib/demoProfile";
import { formatWeiAsEth } from "../lib/ethAmount";
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
  const [taskHistory, setTaskHistory] = useState<TaskHistoryItem[]>([]);
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
  const policyRead = useReadContract({
    address: initialProfile.executorAddress ?? undefined,
    abi: AGENT_POLICY_EXECUTOR_ABI,
    functionName: "policies",
    args: [initialProfile.agentNode],
    query: { enabled: Boolean(initialProfile.executorAddress) }
  });
  const gasBudgetRead = useReadContract({
    address: initialProfile.executorAddress ?? undefined,
    abi: AGENT_POLICY_EXECUTOR_ABI,
    functionName: "gasBudgetWei",
    args: [initialProfile.agentNode],
    query: { enabled: Boolean(initialProfile.executorAddress) }
  });
  const nextNonceRead = useReadContract({
    address: initialProfile.executorAddress ?? undefined,
    abi: AGENT_POLICY_EXECUTOR_ABI,
    functionName: "nextNonce",
    args: [initialProfile.agentNode],
    query: { enabled: Boolean(initialProfile.executorAddress) }
  });
  const textRecords = useMemo(
    () => mergeTextRecords(initialProfile.textRecords, textRecordReads.data as TextReadResult[] | undefined),
    [initialProfile.textRecords, textRecordReads.data]
  );
  const livePolicy = policyRead.data as PolicyContractResult | undefined;
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
  const policyEnabled = livePolicy?.[7] ?? initialProfile.policyEnabled;
  const capabilityText = textRecords.find((record) => record.key === "agent.capabilities")?.value;
  const capabilities = parseCapabilities(capabilityText, initialProfile.capabilities);
  const statusText = textRecords.find((record) => record.key === "agent.status")?.value;
  const policyUri = textRecords.find((record) => record.key === "agent.policy.uri")?.value || initialProfile.policyUri;
  const policyHash = textRecords.find((record) => record.key === "agent.policy.hash")?.value || initialProfile.policyHash;
  const passportStatus = readPassportStatus(statusText, liveAgentAddress);

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
      <section className="agent-detail__topbar" aria-labelledby="agent-title">
        <a className="agent-detail__back" href={`/owner/${encodeURIComponent(initialProfile.ownerName)}`}>
          <UiIcon name="arrow-left" size={15} /> Back to dashboard
        </a>
        <div className="agent-detail__header">
          <div className="agent-detail__identity">
            <span className="agent-detail__avatar" aria-hidden="true"><AgentBotIcon size={36} /></span>
            <div>
              <div className="agent-detail__name-row">
                <h1 id="agent-title">{initialProfile.agentName}</h1>
                <span className={`pill pill--${passportStatus === "active" ? "success" : passportStatus === "disabled" ? "warning" : "neutral"}`}>
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
                  <dd><span className="pill pill--success">ENS</span></dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="agent-detail__actions" aria-label="Agent quick actions">
            <a href="#agent-management-status-title"><UiIcon name="shield" size={16} /> Disable</a>
            <a href="#agent-management-policy-title"><UiIcon name="edit" size={16} /> Edit policy</a>
            <a href="#agent-management-gas-title"><UiIcon name="plus" size={16} /> Add gas</a>
            <a href="#agent-management-withdraw-title"><UiIcon name="download" size={16} /> Withdraw gas</a>
            <a className="agent-detail__delete-link" href="#agent-management-delete-title" aria-label="Delete agent"><UiIcon name="trash" size={16} /> Delete</a>
          </div>
        </div>
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
          nextNonce={liveNextNonce}
          policy={livePolicy}
          policyHash={typeof policyHash === "string" && policyHash.startsWith("0x") ? policyHash as Hex : initialProfile.policyHash}
          policyUri={policyUri}
          taskLogAddress={initialProfile.taskLogAddress}
        />
        <GasBudgetPanel gasBudgetWei={liveGasBudget} />
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
        policyEnabled={policyEnabled}
        resolverAddress={resolverAddress}
      />
    </div>
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
  nextNonce: string;
  policy?: PolicyContractResult;
  policyHash: Hex | null;
  policyUri: string;
  taskLogAddress: Hex | null;
}) {
  const rows = [
    { label: "Allowed Target (TaskLog)", title: props.policy?.[2] ?? props.taskLogAddress ?? undefined, value: props.policy?.[2] ? shortenHex(props.policy[2]) : props.taskLogAddress ? shortenHex(props.taskLogAddress) : "Unknown" },
    { label: "Allowed Selector", title: props.policy?.[3], value: props.policy?.[3] ?? "Unknown" },
    { label: "Max Value per Call", value: props.policy?.[4] !== undefined ? formatWei(props.policy[4]) : "Unknown" },
    { label: "Reimbursement Cap", value: props.policy?.[5] !== undefined ? formatWei(props.policy[5]) : "Unknown" },
    { label: "Expiry", value: props.policy?.[6] !== undefined ? formatUnixTime(props.policy[6]) : "Unknown" },
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
    { label: "Policy state", value: props.policy?.[7] ? "Enabled" : "Unknown" },
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

function GasBudgetPanel(props: { gasBudgetWei: bigint }) {
  return (
    <section className="agent-panel agent-gas-card" aria-labelledby="agent-gas-title">
      <h2 id="agent-gas-title"><UiIcon name="gas" size={18} /> Gas Budget</h2>
      <span>Balance</span>
      <strong>{formatWei(props.gasBudgetWei)}</strong>
      <div className="agent-gas-card__inputs">
        <label>
          <span>Add amount (ETH)</span>
          <input readOnly value="0.0" />
        </label>
        <label>
          <span>Withdraw amount (ETH)</span>
          <span className="agent-gas-card__input-row">
            <input readOnly value="0.0" />
            <button type="button">Max</button>
          </span>
        </label>
      </div>
      <a href="#agent-management-gas-title">Manage gas</a>
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
