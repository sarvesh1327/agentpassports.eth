"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Hex } from "@agentpassport/config";
import { usePublicClient, useReadContract, useReadContracts, useSendTransaction } from "wagmi";
import { encodeFunctionData } from "viem";
import { formatWei, shortenHex } from "./EnsProofPanel";
import { AgentBotIcon, EnsIndexIcon, ResearcherAgentIcon, SwapperAgentIcon, UiIcon } from "./icons/UiIcons";
import {
  AGENT_ENS_EXECUTOR_ABI,
  AGENT_TEXT_RECORD_KEYS,
  ENS_REGISTRY_ABI,
  LEGACY_AGENT_TEXT_RECORD_KEYS,
  PUBLIC_RESOLVER_ABI,
  nonZeroAddress
} from "../lib/contracts";
import {
  OWNER_INDEX_AGENTS_KEY,
  OWNER_INDEX_VERSION_KEY,
  buildOwnerAgentNames,
  parseOwnerAgentIndex
} from "../lib/ownerIndex";
import { safeSubnode } from "../lib/ensPreview";
import { parseCapabilities, readPassportStatus } from "../lib/agentProfileDisplay";
import { loadTaskHistory, type TaskHistoryItem } from "../lib/taskHistory";

type OwnerDashboardViewProps = {
  chainId: string;
  ensRegistryAddress: Hex | null;
  executorAddress: Hex | null;
  ownerName: string;
  ownerNode: Hex;
  publicResolverAddress: Hex | null;
  taskLogAddress: Hex | null;
  taskLogStartBlock: string | null;
};

type TextReadResult = {
  result?: unknown;
  status?: string;
};

type AgentDashboardSnapshot = {
  gasBudgetWei: bigint;
  latestTaskTimestamp: string | null;
  policyEnabled: boolean | null;
  status: string;
};

/**
 * Renders the live owner ENS dashboard backed by agnetpassports_no and agentpasspports_agents.
 */
export function OwnerDashboardView(props: OwnerDashboardViewProps) {
  const ownerResolver = useReadContract({
    address: props.ensRegistryAddress ?? undefined,
    abi: ENS_REGISTRY_ABI,
    functionName: "resolver",
    args: [props.ownerNode],
    query: { enabled: Boolean(props.ensRegistryAddress) }
  });
  const ownerResolverAddress = ownerResolver.isSuccess ? nonZeroAddress(ownerResolver.data as Hex | undefined) : props.publicResolverAddress;
  const ownerIndexReads = useReadContracts({
    contracts: ownerResolverAddress
      ? [
          {
            address: ownerResolverAddress,
            abi: PUBLIC_RESOLVER_ABI,
            functionName: "text",
            args: [props.ownerNode, OWNER_INDEX_VERSION_KEY]
          },
          {
            address: ownerResolverAddress,
            abi: PUBLIC_RESOLVER_ABI,
            functionName: "text",
            args: [props.ownerNode, OWNER_INDEX_AGENTS_KEY]
          }
        ]
      : [],
    query: { enabled: Boolean(ownerResolverAddress) }
  });
  const version = String((ownerIndexReads.data as TextReadResult[] | undefined)?.[0]?.result ?? "");
  const rawAgentIndex = String((ownerIndexReads.data as TextReadResult[] | undefined)?.[1]?.result ?? "");
  const ownerAgentLabels = parseOwnerAgentIndex(rawAgentIndex);
  const ownerAgents = buildOwnerAgentNames(props.ownerName, ownerAgentLabels);
  const registerHref = `/register?owner=${encodeURIComponent(props.ownerName)}`;
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [agentSnapshots, setAgentSnapshots] = useState<Record<string, AgentDashboardSnapshot>>({});
  const dashboardSnapshots = ownerAgents.map((agent) => agentSnapshots[agent.name]).filter(Boolean);
  const totalGasBudgetWei = dashboardSnapshots.reduce((total, snapshot) => total + snapshot.gasBudgetWei, 0n);
  const activeAgentCount = dashboardSnapshots.filter((snapshot) => snapshot.status === "active").length;
  const disabledAgentCount = dashboardSnapshots.filter((snapshot) => snapshot.status === "disabled").length;

  const handleAgentSnapshot = useCallback((agentName: string, snapshot: AgentDashboardSnapshot) => {
    setAgentSnapshots((current) => ({
      ...current,
      [agentName]: snapshot
    }));
  }, []);

  return (
    <div className="owner-dashboard owner-dashboard--permission-manager">
      <section className="owner-dashboard__hero owner-dashboard__hero-card" aria-labelledby="owner-index-title">
        <div className="owner-dashboard__title">
          <span className="owner-dashboard__icon" aria-hidden="true"><EnsIndexIcon size={28} /></span>
          <div className="owner-dashboard__copy">
            <p className="owner-dashboard__eyebrow">OWNER DASHBOARD</p>
            <h1 id="owner-index-title">Manage Passports for {props.ownerName}</h1>
            <span>Review registered agent Passports, active Visas, recent KeeperHub Stamps, and revoke access onchain from one owner view.</span>
          </div>
        </div>
        <div className="owner-dashboard__hero-actions">
          <a className="owner-dashboard__add action-button action-button--primary" href={registerHref}><UiIcon name="plus" size={18} /> Register Agent</a>
          <a className="action-button action-button--secondary" href="/"><UiIcon name="arrow-left" size={16} /> Back to landing</a>
        </div>
      </section>

      <section className="owner-dashboard__stamp-strip" aria-label="Passport Visa Stamp dashboard flow">
        <div>
          <span>Passport index</span>
          <strong>{ownerAgents.length} registered</strong>
          <small>ENS owner directory</small>
        </div>
        <div>
          <span>Visa status</span>
          <strong>{activeAgentCount} active</strong>
          <small>{disabledAgentCount} revoked or disabled</small>
        </div>
        <div>
          <span>Latest KeeperHub Stamps</span>
          <strong>{dashboardSnapshots.filter((snapshot) => snapshot.latestTaskTimestamp).length} with history</strong>
          <small>Allowed, blocked, or no-tx evidence</small>
        </div>
      </section>

      <section className="owner-summary-strip owner-dashboard__preview" aria-label="Owner ENS summary">
        <SummaryCell label="Owner ENS" value={props.ownerName} />
        <SummaryCell
          label="Resolver"
          title={ownerResolverAddress ?? undefined}
          value={ownerResolverAddress ? shortenHex(ownerResolverAddress) : "Unknown"}
        />
        <SummaryCell label="Passports" value={ownerAgents.length.toString()} detail="Registered" />
        <SummaryCell label="Gas budget" value={formatWei(totalGasBudgetWei)} detail="Live aggregate" />
        <SummaryCell label="Active Visas" value={activeAgentCount.toString()} detail={version ? `index v${version}` : "ENS index"} tone="success" />
        <SummaryCell label="Revoked Visas" value={disabledAgentCount.toString()} detail="Live status" tone="danger" />
      </section>

      {ownerAgents.length > 0 ? (
        <section className="owner-agents-panel" aria-labelledby="owner-agents-title" data-view={viewMode}>
          <div className="owner-agents-panel__header">
            <div>
              <p className="owner-dashboard__eyebrow">REGISTERED PASSPORTS</p>
              <h2 id="owner-agents-title">Registered Passports ({ownerAgents.length})</h2>
              <span>Each row is an ENS Passport with signer identity, Visa scope, budget, and Stamp history.</span>
            </div>
            <div aria-label="View mode" className="owner-agents-panel__toggles">
              <button type="button" aria-label="Grid view" aria-pressed={viewMode === "grid"} onClick={() => setViewMode("grid")}><UiIcon name="grid" size={17} /></button>
              <button type="button" aria-label="List view" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")}><UiIcon name="list" size={17} /></button>
            </div>
          </div>
          {ownerAgents.map((agent) => (
            <OwnerDashboardAgentCard
              agentLabel={agent.label}
              agentName={agent.name}
              chainId={props.chainId}
              ensRegistryAddress={props.ensRegistryAddress}
              executorAddress={props.executorAddress}
              key={agent.name}
              ownerName={props.ownerName}
              ownerNode={props.ownerNode}
              onSnapshot={handleAgentSnapshot}
              taskLogAddress={props.taskLogAddress}
              taskLogStartBlock={props.taskLogStartBlock}
            />
          ))}
        </section>
      ) : (
        <section className="empty-state owner-dashboard__empty-state">
          <strong>No Passports registered</strong>
          <span>Register an Agent to create the first Passport and Visa, then populate {OWNER_INDEX_AGENTS_KEY}.</span>
          <a className="action-button action-button--primary" href={registerHref}><UiIcon name="plus" size={16} /> Register Agent</a>
        </section>
      )}

      <section className="owner-index-card" aria-label="ENS Passport index">
        <div className="owner-index-card__status"><UiIcon name="check" size={18} /> ENS Passport index</div>
        <dl className="owner-index-card__grid">
          <div>
            <dt>{OWNER_INDEX_AGENTS_KEY}</dt>
            <dd>{rawAgentIndex || "No Passports registered"}</dd>
          </div>
          <div>
            <dt>Passport Source</dt>
            <dd><span className="pill pill--success">ENS</span></dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function SummaryCell(props: { detail?: string; label: string; title?: string; tone?: "success" | "danger"; value: string }) {
  return (
    <div className="owner-summary-strip__cell metric-card">
      <span>{props.label}</span>
      <strong className={props.tone ? `owner-summary-strip__value--${props.tone}` : undefined} title={props.title}>
        {props.value}
      </strong>
      {props.detail ? <small>{props.detail}</small> : null}
    </div>
  );
}

function OwnerDashboardAgentCard(props: {
  agentLabel: string;
  agentName: string;
  chainId: string;
  ensRegistryAddress: Hex | null;
  executorAddress: Hex | null;
  onSnapshot: (agentName: string, snapshot: AgentDashboardSnapshot) => void;
  ownerName: string;
  ownerNode: Hex;
  taskLogAddress: Hex | null;
  taskLogStartBlock: string | null;
}) {
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient({ chainId: Number(props.chainId) });
  const [tasks, setTasks] = useState<TaskHistoryItem[]>([]);
  const agentNode = useMemo(() => safeSubnode(props.ownerNode, props.agentLabel), [props.agentLabel, props.ownerNode]);
  const agentResolver = useReadContract({
    address: props.ensRegistryAddress ?? undefined,
    abi: ENS_REGISTRY_ABI,
    functionName: "resolver",
    args: [agentNode],
    query: { enabled: Boolean(props.ensRegistryAddress) }
  });
  const resolverAddress = agentResolver.isSuccess ? nonZeroAddress(agentResolver.data as Hex | undefined) : null;
  const agentAddress = useReadContract({
    address: resolverAddress ?? undefined,
    abi: PUBLIC_RESOLVER_ABI,
    functionName: "addr",
    args: [agentNode],
    query: { enabled: Boolean(resolverAddress) }
  });
  const textRecordReads = useReadContracts({
    contracts: resolverAddress
      ? AGENT_TEXT_RECORD_KEYS.map((key) => ({
          address: resolverAddress,
          abi: PUBLIC_RESOLVER_ABI,
          functionName: "text",
          args: [agentNode, key]
        }))
      : [],
    query: { enabled: Boolean(resolverAddress) }
  });
  const gasBudget = useReadContract({
    address: props.executorAddress ?? undefined,
    abi: AGENT_ENS_EXECUTOR_ABI,
    functionName: "gasBudgetWei",
    args: [agentNode],
    query: { enabled: Boolean(props.executorAddress) }
  });
  const textRecords = mapTextRecords(textRecordReads.data as TextReadResult[] | undefined);
  const resolvedAgentAddress = nonZeroAddress(agentAddress.data as Hex | undefined);
  const status = readPassportStatus(textRecords.get("agent_status") ?? "", resolvedAgentAddress);
  const capabilities = parseCapabilities(textRecords.get("agent_capabilities") ?? "", []);
  const policyUri = textRecords.get("agent_policy_uri") ?? "";
  const policyHash = textRecords.get("agent_policy_hash") ?? "";
  const gasBudgetWei = typeof gasBudget.data === "bigint" ? gasBudget.data : 0n;

  useEffect(() => {
    props.onSnapshot(props.agentName, {
      gasBudgetWei,
      latestTaskTimestamp: tasks[0]?.timestamp ?? null,
      policyEnabled: status === "active",
      status
    });
  }, [gasBudgetWei, props.agentName, props.onSnapshot, status, tasks]);

  useEffect(() => {
    let cancelled = false;
    loadTaskHistory({
      agentNode,
      fromBlock: parseOptionalBigInt(props.taskLogStartBlock),
      publicClient,
      taskLogAddress: props.taskLogAddress
    }).then((history) => {
      if (!cancelled) {
        setTasks(history.slice(0, 3));
      }
    }).catch(() => {
      if (!cancelled) {
        setTasks([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [agentNode, props.taskLogAddress, props.taskLogStartBlock, publicClient]);

  async function setStatus(nextStatus: "active" | "disabled") {
    if (!resolverAddress) {
      return;
    }

    const hash = await sendTransactionAsync({
      data: encodeFunctionData({
        abi: PUBLIC_RESOLVER_ABI,
        functionName: "multicall",
        args: [[
          encodeFunctionData({
            abi: PUBLIC_RESOLVER_ABI,
            functionName: "setText",
            args: [agentNode, "agent_status", nextStatus]
          }),
          ...LEGACY_AGENT_TEXT_RECORD_KEYS.map((key) =>
            encodeFunctionData({
              abi: PUBLIC_RESOLVER_ABI,
              functionName: "setText",
              args: [agentNode, key, ""]
            })
          )
        ]]
      }),
      to: resolverAddress
    });

    // The dashboard summary is derived from live reads, so wait for the write and
    // refresh the card before presenting the new aggregate counts.
    if (publicClient) {
      await publicClient.waitForTransactionReceipt({ hash });
    }
    await Promise.all([
      textRecordReads.refetch(),
      gasBudget.refetch()
    ]);
  }

  return (
    <section className="owner-agent-row" aria-label={`Passport ${props.agentName}`}>
      <div className="owner-agent-row__identity">
        <div className={`owner-agent-row__avatar owner-agent-row__avatar--${agentIconTone(props.agentLabel, status)}`} aria-hidden="true">
          <AgentAvatarIcon label={props.agentLabel} size={34} />
        </div>
        <div>
          <div className="owner-agent-row__heading">
            <span className="owner-agent-row__eyebrow">Passport</span>
            <h3>{props.agentName}</h3>
            <span className={`status-pill status-pill--${status === "active" ? "success" : status === "disabled" ? "warning" : "neutral"}`}>
              {status === "active" ? "Active Visa" : status === "disabled" ? "Visa revoked" : "Visa unknown"}
            </span>
          </div>
          <p className="owner-agent-row__summary">ENS Passport, scoped Visa metadata, and KeeperHub Stamp history for this agent.</p>
          <dl className="owner-agent-row__facts">
            <div>
              <dt>Signer</dt>
              <dd title={resolvedAgentAddress ?? undefined}>{resolvedAgentAddress ? shortenHex(resolvedAgentAddress) : "Unknown"}</dd>
            </div>
            <div>
              <dt>Visa Digest</dt>
              <dd title={policyHash}>{policyHash ? shortenHex(policyHash as Hex) : "Unknown"}</dd>
            </div>
            <div>
              <dt>Visa Scope</dt>
              <dd className="owner-agent-row__pills">
                {(capabilities.length ? capabilities : ["task-log"]).map((capability) => (
                  <span className="pill pill--info" key={capability}>{capability}</span>
                ))}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="owner-agent-row__meta">
        <span>Gas budget</span>
        <strong>{formatWei(gasBudgetWei)}</strong>
        <span>Latest Stamp</span>
        <span className="sr-only">Latest KeeperHub Stamps</span>
        <strong>{tasks[0]?.timestamp ?? "No Stamps yet"}</strong>
        <small>{status === "active" ? "Visa active in ENS" : "Visa revoked or unknown"}</small>
      </div>

      <div className="owner-agent-row__actions">
        <a className="action-button action-button--secondary" href={`/agent/${encodeURIComponent(props.agentName)}`}><UiIcon name="eye" size={16} /> View Passport</a>
        <button type="button" onClick={() => void setStatus(status === "disabled" ? "active" : "disabled")}>
          <UiIcon name={status === "disabled" ? "check" : "shield"} size={16} /> {status === "disabled" ? "Enable Visa" : "Revoke Visa"}
        </button>
        <a className="owner-agent-row__delete" href={`/agent/${encodeURIComponent(props.agentName)}#agent-management-delete-title`}><UiIcon name="trash" size={16} /> Delete Passport</a>
      </div>
    </section>
  );
}

function AgentAvatarIcon(props: { label: string; size?: number }) {
  if (/swap/u.test(props.label)) {
    return <SwapperAgentIcon size={props.size} />;
  }
  if (/research/u.test(props.label)) {
    return <ResearcherAgentIcon size={props.size} />;
  }

  return <AgentBotIcon size={props.size} />;
}

function agentIconTone(label: string, status: string): "active" | "disabled" | "swap" | "research" {
  if (status === "disabled") {
    return "disabled";
  }
  if (/swap/u.test(label)) {
    return "swap";
  }
  if (/research/u.test(label)) {
    return "research";
  }

  return "active";
}

function mapTextRecords(liveRecords?: TextReadResult[]): Map<string, string> {
  return new Map(
    AGENT_TEXT_RECORD_KEYS.map((key, index) => [
      key,
      liveRecords?.[index]?.status === "success" ? String(liveRecords[index]?.result ?? "") : ""
    ])
  );
}

function parseOptionalBigInt(value: string | null): bigint | null {
  return value && /^\d+$/u.test(value) ? BigInt(value) : null;
}
