"use client";

import { useEffect, useMemo, useState } from "react";
import type { Hex } from "@agentpassport/config";
import { usePublicClient, useReadContract, useReadContracts, useSendTransaction } from "wagmi";
import { encodeFunctionData } from "viem";
import { formatWei, shortenHex } from "./EnsProofPanel";
import { AgentBotIcon, EnsIndexIcon, ResearcherAgentIcon, SwapperAgentIcon, UiIcon } from "./icons/UiIcons";
import {
  AGENT_POLICY_EXECUTOR_ABI,
  AGENT_TEXT_RECORD_KEYS,
  ENS_REGISTRY_ABI,
  PUBLIC_RESOLVER_ABI,
  type PolicyContractResult,
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

/**
 * Renders the live owner ENS dashboard backed by agentpassports.v and agentpassports.agents.
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

  return (
    <div className="owner-dashboard">
      <section className="owner-dashboard__hero" aria-labelledby="owner-index-title">
        <div className="owner-dashboard__title">
          <span className="owner-dashboard__icon" aria-hidden="true"><EnsIndexIcon size={28} /></span>
          <div>
            <p>Dashboard</p>
            <h1 id="owner-index-title">{props.ownerName} agents</h1>
          </div>
        </div>
        <a className="owner-dashboard__add" href={registerHref}><UiIcon name="plus" size={18} /> Add agent</a>
      </section>

      <section className="owner-summary-strip" aria-label="Owner ENS summary">
        <SummaryCell label="Owner ENS" value={props.ownerName} />
        <SummaryCell
          label="Resolver"
          title={ownerResolverAddress ?? undefined}
          value={ownerResolverAddress ? shortenHex(ownerResolverAddress) : "Unknown"}
        />
        <SummaryCell label="Agents" value={ownerAgents.length.toString()} detail="Total" />
        <SummaryCell label="Total Gas Budget" value="Live" detail="Per agent below" />
        <SummaryCell label="Active" value={countStatusHint(ownerAgents.length, "active")} detail={version ? `v${version}` : "ENS index"} tone="success" />
        <SummaryCell label="Disabled" value="0" detail="Live status" tone="danger" />
      </section>

      {ownerAgents.length > 0 ? (
        <section className="owner-agents-panel" aria-labelledby="owner-agents-title">
          <div className="owner-agents-panel__header">
            <h2 id="owner-agents-title">Agents ({ownerAgents.length})</h2>
            <div aria-label="View mode" className="owner-agents-panel__toggles">
              <button type="button" aria-label="Grid view"><UiIcon name="grid" size={17} /></button>
              <button type="button" aria-label="List view"><UiIcon name="list" size={17} /></button>
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
              taskLogAddress={props.taskLogAddress}
              taskLogStartBlock={props.taskLogStartBlock}
            />
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <strong>No agents indexed</strong>
          <span>Add an ENS subname from the registration flow to populate agentpassports.agents.</span>
        </section>
      )}

      <section className="owner-index-card" aria-label="ENS index">
        <div className="owner-index-card__status"><UiIcon name="check" size={18} /> ENS index</div>
        <dl className="owner-index-card__grid">
          <div>
            <dt>{OWNER_INDEX_AGENTS_KEY}</dt>
            <dd>{rawAgentIndex || "No agents indexed"}</dd>
          </div>
          <div>
            <dt>Policy Source</dt>
            <dd><span className="pill pill--success">ENS</span></dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function SummaryCell(props: { detail?: string; label: string; title?: string; tone?: "success" | "danger"; value: string }) {
  return (
    <div className="owner-summary-strip__cell">
      <span>{props.label}</span>
      <strong className={props.tone ? `owner-summary-strip__value--${props.tone}` : undefined} title={props.title}>
        {props.value}
      </strong>
      {props.detail ? <small>{props.detail}</small> : null}
    </div>
  );
}

function countStatusHint(count: number, status: "active"): string {
  return status === "active" ? count.toString() : "0";
}

function OwnerDashboardAgentCard(props: {
  agentLabel: string;
  agentName: string;
  chainId: string;
  ensRegistryAddress: Hex | null;
  executorAddress: Hex | null;
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
  const policy = useReadContract({
    address: props.executorAddress ?? undefined,
    abi: AGENT_POLICY_EXECUTOR_ABI,
    functionName: "policies",
    args: [agentNode],
    query: { enabled: Boolean(props.executorAddress) }
  });
  const gasBudget = useReadContract({
    address: props.executorAddress ?? undefined,
    abi: AGENT_POLICY_EXECUTOR_ABI,
    functionName: "gasBudgetWei",
    args: [agentNode],
    query: { enabled: Boolean(props.executorAddress) }
  });
  const textRecords = mapTextRecords(textRecordReads.data as TextReadResult[] | undefined);
  const policyState = policy.data as PolicyContractResult | undefined;
  const resolvedAgentAddress = nonZeroAddress(agentAddress.data as Hex | undefined);
  const status = readPassportStatus(textRecords.get("agent.status") ?? "", resolvedAgentAddress);
  const capabilities = parseCapabilities(textRecords.get("agent.capabilities") ?? "", []);
  const policyUri = textRecords.get("agent.policy.uri") ?? "";
  const policyHash = textRecords.get("agent.policy.hash") ?? "";
  const gasBudgetWei = typeof gasBudget.data === "bigint" ? gasBudget.data : 0n;

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

    await sendTransactionAsync({
      data: encodeFunctionData({
        abi: PUBLIC_RESOLVER_ABI,
        functionName: "setText",
        args: [agentNode, "agent.status", nextStatus]
      }),
      to: resolverAddress
    });
  }

  return (
    <section className="owner-agent-row">
      <div className="owner-agent-row__identity">
        <div className={`owner-agent-row__avatar owner-agent-row__avatar--${agentIconTone(props.agentLabel, status)}`} aria-hidden="true">
          <AgentAvatarIcon label={props.agentLabel} size={34} />
        </div>
        <div>
          <div className="owner-agent-row__heading">
            <h3>{props.agentName}</h3>
            <span className={`pill pill--${status === "active" ? "success" : status === "disabled" ? "warning" : "neutral"}`}>
              {status === "active" ? "Active" : status === "disabled" ? "Disabled" : "Unknown"}
            </span>
          </div>
          <dl className="owner-agent-row__facts">
            <div>
              <dt>Signer</dt>
              <dd title={resolvedAgentAddress ?? undefined}>{resolvedAgentAddress ? shortenHex(resolvedAgentAddress) : "Unknown"}</dd>
            </div>
            <div>
              <dt>Policy Digest</dt>
              <dd title={policyHash}>{policyHash ? shortenHex(policyHash as Hex) : "Unknown"}</dd>
            </div>
            <div>
              <dt>Capabilities</dt>
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
        <span>Latest Task</span>
        <span className="sr-only">Latest task history</span>
        <strong>{tasks[0]?.timestamp ?? "No tasks yet"}</strong>
        <small>{policyState?.[7] ? "Policy enabled" : "Policy disabled or unknown"}</small>
      </div>

      <div className="owner-agent-row__actions">
        <a href={`/agent/${encodeURIComponent(props.agentName)}`}><UiIcon name="eye" size={16} /> View</a>
        <button type="button" onClick={() => void setStatus("disabled")}><UiIcon name="shield" size={16} /> Revoke</button>
        <button type="button" onClick={() => void setStatus("active")}><UiIcon name="check" size={16} /> Enable</button>
        <a className="owner-agent-row__delete" href={`/agent/${encodeURIComponent(props.agentName)}#agent-management-title`}><UiIcon name="trash" size={16} /> Delete</a>
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
