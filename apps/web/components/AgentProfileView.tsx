"use client";

import { useEffect, useMemo, useState } from "react";
import type { Hex } from "@agentpassport/config";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { AgentPassportCard } from "./AgentPassportCard";
import { EnsProofPanel, formatWei, shortenHex } from "./EnsProofPanel";
import {
  AGENT_POLICY_EXECUTOR_ABI,
  AGENT_TEXT_RECORD_KEYS,
  ENS_REGISTRY_ABI,
  PUBLIC_RESOLVER_ABI,
  TASK_RECORDED_EVENT,
  type PolicyContractResult,
  nonZeroAddress
} from "../lib/contracts";
import type { SerializableAgentProfile } from "../lib/demoProfile";
import { SEPOLIA_CHAIN_ID } from "@agentpassport/config";

type TaskHistoryItem = {
  id: string;
  metadataURI: string;
  taskHash: Hex;
  timestamp: string;
  txHash: Hex;
};

type TextReadResult = {
  result?: unknown;
  status?: string;
};

/**
 * Hydrates the agent passport with live ENS, executor, and TaskLog reads.
 */
export function AgentProfileView({ initialProfile }: { initialProfile: SerializableAgentProfile }) {
  const publicClient = usePublicClient({ chainId: SEPOLIA_CHAIN_ID });
  const [taskHistory, setTaskHistory] = useState<TaskHistoryItem[]>([]);
  const registryResolver = useReadContract({
    address: initialProfile.ensRegistryAddress ?? undefined,
    abi: ENS_REGISTRY_ABI,
    functionName: "resolver",
    args: [initialProfile.agentNode],
    query: { enabled: Boolean(initialProfile.ensRegistryAddress) }
  });
  const resolverAddress = nonZeroAddress(registryResolver.data as Hex | undefined) ?? initialProfile.resolverAddress ?? null;
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
  const liveAgentAddress = nonZeroAddress(agentAddress.data as Hex | undefined) ?? initialProfile.agentAddress;
  const liveGasBudget = (gasBudgetRead.data as bigint | undefined) ?? safeBigInt(initialProfile.gasBudgetWei);
  const liveNextNonce = (nextNonceRead.data as bigint | undefined)?.toString() ?? initialProfile.nextNonce ?? "Unknown";
  const policyEnabled = livePolicy?.[7] ?? initialProfile.policyEnabled;
  const capabilityText = textRecords.find((record) => record.key === "agent.capabilities")?.value;
  const capabilities = capabilityText ? capabilityText.split(",").map((value) => value.trim()).filter(Boolean) : initialProfile.capabilities;
  const statusText = textRecords.find((record) => record.key === "agent.status")?.value;
  const passportStatus = statusText === "active" || statusText === "revoked" ? statusText : liveAgentAddress ? "active" : "unknown";

  useEffect(() => {
    let cancelled = false;

    /**
     * Reads historical TaskRecorded events for the selected agent node.
     */
    async function loadTaskHistory() {
      if (!publicClient || !initialProfile.taskLogAddress) {
        setTaskHistory([]);
        return;
      }
      const logs = await publicClient.getLogs({
        address: initialProfile.taskLogAddress,
        event: TASK_RECORDED_EVENT,
        args: { agentNode: initialProfile.agentNode },
        fromBlock: 0n,
        toBlock: "latest"
      });
      if (!cancelled) {
        setTaskHistory(logs.map((log) => taskFromLog(log as TaskRecordedLog)));
      }
    }

    loadTaskHistory().catch(() => {
      if (!cancelled) {
        setTaskHistory([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initialProfile.agentNode, initialProfile.taskLogAddress, publicClient]);

  return (
    <>
      <div className="agent-layout">
        <AgentPassportCard
          agentAddress={liveAgentAddress}
          agentName={initialProfile.agentName}
          agentNode={initialProfile.agentNode}
          capabilities={capabilities}
          ownerName={initialProfile.ownerName}
          policyUri={initialProfile.policyUri}
          status={passportStatus}
        />

        <EnsProofPanel
          agentName={initialProfile.agentName}
          agentNode={initialProfile.agentNode}
          authorizationStatus="unknown"
          ensAgentAddress={liveAgentAddress}
          failureReason={liveAgentAddress ? undefined : "ENS addr(agent) not configured"}
          gasBudgetWei={liveGasBudget}
          ownerName={initialProfile.ownerName}
          ownerNode={initialProfile.ownerNode}
          policyEnabled={policyEnabled}
          policyHash={initialProfile.policyHash}
          recoveredSigner={null}
          resolverAddress={resolverAddress}
        />
      </div>

      <div className="detail-grid">
        <TextRecordPanel textRecords={textRecords} />
        <PolicyStatePanel
          executorAddress={initialProfile.executorAddress}
          gasBudgetWei={liveGasBudget}
          nextNonce={liveNextNonce}
          policy={livePolicy}
          policyHash={initialProfile.policyHash}
          taskLogAddress={initialProfile.taskLogAddress}
        />
        <TaskHistoryPanel tasks={taskHistory} />
      </div>
    </>
  );
}

/**
 * Displays the ENS text records that make up the public agent metadata surface.
 */
function TextRecordPanel({ textRecords }: { textRecords: readonly { key: string; value: string }[] }) {
  return (
    <section className="app-card" aria-labelledby="agent-records-title">
      <div className="section-heading">
        <p>ENS</p>
        <h2 id="agent-records-title">ENS text records</h2>
      </div>
      <div className="record-table" role="table" aria-label="ENS text records">
        {textRecords.map((record) => (
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
 * Shows the executor-facing policy and gas budget facts for the agent node.
 */
function PolicyStatePanel(props: {
  executorAddress: Hex | null;
  gasBudgetWei: bigint;
  nextNonce: string;
  policy?: PolicyContractResult;
  policyHash: Hex | null;
  taskLogAddress: Hex | null;
}) {
  const rows = [
    { label: "Policy state", value: props.policy?.[7] ? "Enabled" : "Unknown" },
    { label: "Policy hash", title: props.policyHash ?? undefined, value: props.policyHash ? shortenHex(props.policyHash) : "Unknown" },
    { label: "Executor", title: props.executorAddress ?? undefined, value: props.executorAddress ? shortenHex(props.executorAddress) : "Unknown" },
    { label: "TaskLog", title: props.taskLogAddress ?? undefined, value: props.taskLogAddress ? shortenHex(props.taskLogAddress) : "Unknown" },
    { label: "Policy target", title: props.policy?.[2], value: props.policy?.[2] ? shortenHex(props.policy[2]) : "Unknown" },
    { label: "Policy selector", title: props.policy?.[3], value: props.policy?.[3] ? shortenHex(props.policy[3]) : "Unknown" },
    { label: "Gas budget", value: formatWei(props.gasBudgetWei) },
    { label: "Next nonce", value: props.nextNonce }
  ];

  return (
    <section className="app-card" aria-labelledby="agent-policy-title">
      <div className="section-heading">
        <p>Policy</p>
        <h2 id="agent-policy-title">Policy state</h2>
      </div>
      <dl className="fact-grid">
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
 * Displays TaskLog event history for the agent.
 */
function TaskHistoryPanel({ tasks }: { tasks: readonly TaskHistoryItem[] }) {
  return (
    <section className="app-card app-card--wide" aria-labelledby="agent-history-title">
      <div className="section-heading">
        <p>TaskLog</p>
        <h2 id="agent-history-title">Task history</h2>
      </div>
      {tasks.length > 0 ? (
        <div className="record-table" role="table" aria-label="Task history">
          {tasks.map((task) => (
            <div className="record-table__row" role="row" key={task.id}>
              <span role="cell">{task.timestamp}</span>
              <strong role="cell">
                {shortenHex(task.taskHash)} {task.metadataURI}
              </strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>No task proofs recorded</strong>
          <span>TaskLog events will appear here after the relayer submits executor transactions.</span>
        </div>
      )}
    </section>
  );
}

type TaskRecordedLog = {
  args: {
    metadataURI?: string;
    taskHash?: Hex;
    taskId?: bigint;
    timestamp?: bigint;
  };
  transactionHash: Hex;
};

/**
 * Converts one TaskRecorded log into a compact row for the history table.
 */
function taskFromLog(log: TaskRecordedLog): TaskHistoryItem {
  const taskId = log.args.taskId?.toString() ?? log.transactionHash;
  const timestamp = log.args.timestamp ? new Date(Number(log.args.timestamp) * 1000).toISOString() : "Unknown time";
  return {
    id: `${log.transactionHash}-${taskId}`,
    metadataURI: log.args.metadataURI ?? "",
    taskHash: log.args.taskHash ?? "0x",
    timestamp,
    txHash: log.transactionHash
  };
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
