"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { type Hex } from "@agentpassport/config";
import { usePublicClient, useReadContract, useSignTypedData } from "wagmi";
import {
  AGENT_POLICY_EXECUTOR_ABI,
  ENS_REGISTRY_ABI,
  PUBLIC_RESOLVER_ABI,
  TASK_RECORDED_EVENT,
  type PolicyContractResult,
  nonZeroAddress
} from "../lib/contracts";
import { normalizeEnsFormName, safeNamehash } from "../lib/ensPreview";
import { hashPolicyContractResult } from "../lib/policyProof";
import {
  buildFreshTaskRunDraft,
  buildStoredSignedTaskPayload,
  recoverTaskSigner,
  serializeRelayerExecutePayload,
  serializeTypedData,
  storeSignedTaskPayload
} from "../lib/taskDemo";
import { EnsProofPanel, formatWei, shortenHex } from "./EnsProofPanel";

const INTENT_TTL_SECONDS = 600n;

export type RunTaskDemoProps = {
  chainId: bigint;
  defaultAgentName: string;
  defaultMetadataURI: string;
  defaultOwnerName: string;
  defaultTaskDescription: string;
  ensRegistryAddress?: Hex | null;
  executorAddress?: Hex | null;
  taskLogAddress?: Hex | null;
};

type TaskHistoryItem = {
  id: string;
  metadataURI: string;
  taskHash: Hex;
  timestamp: string;
  txHash: Hex;
};

type RelayerResponse = {
  details?: string;
  status?: string;
  txHash?: Hex;
};

type SignDraftOptions = {
  persistForRevocation: boolean;
};

/**
 * Builds, signs, submits, and stores one TaskLog execution intent for the live demo flow.
 */
export function RunTaskDemo(props: RunTaskDemoProps) {
  const publicClient = usePublicClient({ chainId: Number(props.chainId) });
  const { signTypedDataAsync } = useSignTypedData();
  const [agentName, setAgentName] = useState(props.defaultAgentName);
  const [ownerName, setOwnerName] = useState(props.defaultOwnerName);
  const [taskDescription, setTaskDescription] = useState(props.defaultTaskDescription);
  const [metadataURI, setMetadataURI] = useState(props.defaultMetadataURI);
  const [status, setStatus] = useState<"idle" | "signing" | "signed" | "submitted" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("Ready to sign a task intent");
  const [signature, setSignature] = useState<Hex | null>(null);
  const [recoveredSigner, setRecoveredSigner] = useState<Hex | null>(null);
  const [submittedTxHash, setSubmittedTxHash] = useState<Hex | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [taskHistory, setTaskHistory] = useState<TaskHistoryItem[]>([]);
  const normalizedAgentName = useMemo(() => normalizeEnsFormName(agentName), [agentName]);
  const normalizedOwnerName = useMemo(() => normalizeEnsFormName(ownerName), [ownerName]);
  const agentNode = useMemo(() => safeNamehash(normalizedAgentName), [normalizedAgentName]);
  const ownerNode = useMemo(() => safeNamehash(normalizedOwnerName), [normalizedOwnerName]);
  const resolverRead = useReadContract({
    address: props.ensRegistryAddress ?? undefined,
    abi: ENS_REGISTRY_ABI,
    functionName: "resolver",
    args: [agentNode],
    query: { enabled: Boolean(props.ensRegistryAddress) }
  });
  const resolverAddress = nonZeroAddress(resolverRead.data as Hex | undefined);
  const agentAddressRead = useReadContract({
    address: resolverAddress ?? undefined,
    abi: PUBLIC_RESOLVER_ABI,
    functionName: "addr",
    args: [agentNode],
    query: { enabled: Boolean(resolverAddress) }
  });
  const policyRead = useReadContract({
    address: props.executorAddress ?? undefined,
    abi: AGENT_POLICY_EXECUTOR_ABI,
    functionName: "policies",
    args: [agentNode],
    query: { enabled: Boolean(props.executorAddress) }
  });
  const gasBudgetRead = useReadContract({
    address: props.executorAddress ?? undefined,
    abi: AGENT_POLICY_EXECUTOR_ABI,
    functionName: "gasBudgetWei",
    args: [agentNode],
    query: { enabled: Boolean(props.executorAddress) }
  });
  const nextNonceRead = useReadContract({
    address: props.executorAddress ?? undefined,
    abi: AGENT_POLICY_EXECUTOR_ABI,
    functionName: "nextNonce",
    args: [agentNode],
    query: { enabled: Boolean(props.executorAddress) }
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => setPreviewRefreshKey((key) => key + 1), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  /**
   * Builds a task draft from the latest wall-clock time so expiresAt cannot go stale before signing.
   */
  function buildCurrentDraft() {
    if (!props.executorAddress || !props.taskLogAddress) {
      throw new Error("Executor and TaskLog addresses must be configured");
    }
    if (!nextNonceRead.isSuccess) {
      throw new Error("Waiting for executor nextNonce");
    }
    return buildFreshTaskRunDraft({
      agentName: normalizedAgentName,
      chainId: props.chainId,
      executorAddress: props.executorAddress,
      metadataURI,
      nonce: safeBigInt(nextNonceRead.data as bigint | undefined),
      nowSeconds: currentUnixSeconds(),
      ownerName: normalizedOwnerName,
      taskDescription,
      taskLogAddress: props.taskLogAddress,
      ttlSeconds: INTENT_TTL_SECONDS
    });
  }

  const draftState = useMemo(() => {
    try {
      return {
        draft: buildCurrentDraft(),
        error: null
      };
    } catch (error) {
      return { draft: null, error: error instanceof Error ? error.message : "Task draft is invalid" };
    }
  }, [
    metadataURI,
    nextNonceRead.data,
    nextNonceRead.isSuccess,
    normalizedAgentName,
    normalizedOwnerName,
    previewRefreshKey,
    props.chainId,
    props.executorAddress,
    props.taskLogAddress,
    taskDescription
  ]);
  const liveAgentAddress = nonZeroAddress(agentAddressRead.data as Hex | undefined);
  const livePolicy = policyRead.data as PolicyContractResult | undefined;
  const livePolicyHash = hashPolicyContractResult({ agentNode, policy: livePolicy });
  const liveGasBudget = safeBigInt(gasBudgetRead.data as bigint | undefined);
  const authorizationStatus =
    recoveredSigner && liveAgentAddress
      ? sameAddress(recoveredSigner, liveAgentAddress)
        ? "pass"
        : "fail"
      : "unknown";

  useEffect(() => {
    let cancelled = false;

    /**
     * Loads TaskRecorded events so the task proof appears after the relayer transaction lands.
     */
    async function loadTaskHistory() {
      if (!publicClient || !props.taskLogAddress) {
        setTaskHistory([]);
        return;
      }
      const logs = await publicClient.getLogs({
        address: props.taskLogAddress,
        event: TASK_RECORDED_EVENT,
        args: { agentNode },
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
  }, [agentNode, historyRefreshKey, props.taskLogAddress, publicClient]);

  /**
   * Signs the prepared EIP-712 payload and optionally stores an unsubmitted copy for revoke retries.
   */
  async function signAndStoreDraft(options: SignDraftOptions) {
    const draft = buildCurrentDraft();

    const signed = await signTypedDataAsync({
      domain: draft.typedData.domain,
      message: draft.typedData.message,
      primaryType: draft.typedData.primaryType,
      types: draft.typedData.types
    });
    const recovered = recoverTaskSigner(draft.digest, signed as Hex);
    const relayerPayload = serializeRelayerExecutePayload({
      callData: draft.callData,
      intent: draft.intent,
      signature: signed as Hex
    });
    let stored = false;

    if (options.persistForRevocation) {
      const storedPayload = buildStoredSignedTaskPayload({
        agentName: normalizedAgentName,
        callData: draft.callData,
        digest: draft.digest,
        intent: draft.intent,
        ownerName: normalizedOwnerName,
        recoveredSigner: recovered,
        signature: signed as Hex,
        taskHash: draft.taskHash,
        typedData: draft.typedData
      });
      stored = storeSignedTaskPayload({ payload: storedPayload });
    }
    setSignature(signed as Hex);
    setRecoveredSigner(recovered);
    return { relayerPayload, stored };
  }

  /**
   * Stores an unsubmitted signature so the revoke page can prove ENS addr changes invalidate it.
   */
  async function handleSaveSignedPayload() {
    setStatus("signing");
    setStatusMessage("Awaiting agent wallet signature");
    setSignature(null);
    setRecoveredSigner(null);
    setSubmittedTxHash(null);

    try {
      const { stored } = await signAndStoreDraft({ persistForRevocation: true });
      setStatus("signed");
      setStatusMessage(stored ? "Signed payload saved for revocation retry" : "Signed payload created; browser storage unavailable");
    } catch (error) {
      setStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "Task signing failed");
    }
  }

  /**
   * Signs the prepared EIP-712 payload and submits it to the server-side relayer endpoint.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("signing");
    setStatusMessage("Awaiting agent wallet signature");
    setSignature(null);
    setRecoveredSigner(null);
    setSubmittedTxHash(null);

    try {
      const { relayerPayload } = await signAndStoreDraft({ persistForRevocation: false });
      const response = await fetch("/api/relayer/execute", {
        body: JSON.stringify(relayerPayload),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const body = (await response.json().catch(() => ({}))) as RelayerResponse;
      if (!response.ok || body.status !== "submitted" || !body.txHash) {
        throw new Error(body.details ?? "Relayer did not submit the task");
      }

      setSubmittedTxHash(body.txHash);
      setStatus("submitted");
      setStatusMessage("Transaction status: submitted");
      setHistoryRefreshKey((key) => key + 1);
    } catch (error) {
      setStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "Task submission failed");
    }
  }

  return (
    <>
      <form className="register-form" onSubmit={handleSubmit}>
        <section className="register-form__section" aria-labelledby="run-input-title">
          <div className="section-heading">
            <p>Run</p>
            <h2 id="run-input-title">Task intent</h2>
          </div>
          <div className="field-grid">
            <label>
              <span>Agent ENS</span>
              <input name="agentName" onChange={(event) => setAgentName(event.target.value)} value={agentName} />
            </label>
            <label>
              <span>Owner ENS</span>
              <input name="ownerName" onChange={(event) => setOwnerName(event.target.value)} value={ownerName} />
            </label>
            <label>
              <span>Task text</span>
              <input name="taskDescription" onChange={(event) => setTaskDescription(event.target.value)} value={taskDescription} />
            </label>
            <label>
              <span>Metadata URI</span>
              <input name="metadataURI" onChange={(event) => setMetadataURI(event.target.value)} value={metadataURI} />
            </label>
          </div>
        </section>

        <section className="register-form__preview" aria-labelledby="run-proof-title">
          <div className="section-heading">
            <p>Preview</p>
            <h2 id="run-proof-title">Typed data</h2>
          </div>
          <dl className="fact-grid">
            <PreviewRow label="Agent node" title={agentNode} value={shortenHex(agentNode)} />
            <PreviewRow label="Owner node" title={ownerNode} value={shortenHex(ownerNode)} />
            <PreviewRow label="Resolver" title={resolverAddress ?? undefined} value={formatNullableHex(resolverAddress)} />
            <PreviewRow label="ENS addr(agent)" title={liveAgentAddress ?? undefined} value={formatNullableHex(liveAgentAddress)} />
            <PreviewRow label="Next nonce" value={nextNonceRead.data?.toString() ?? "Unknown"} />
            <PreviewRow label="Gas budget" value={formatWei(liveGasBudget)} />
            <PreviewRow label="Call data hash" title={draftState.draft?.intent.callDataHash} value={formatNullableHex(draftState.draft?.intent.callDataHash)} />
            <PreviewRow label="Recovered signer" title={recoveredSigner ?? undefined} value={formatNullableHex(recoveredSigner)} />
          </dl>
          <pre className="json-panel">{JSON.stringify(draftState.draft ? serializeTypedData(draftState.draft.typedData) : { error: draftState.error }, null, 2)}</pre>
        </section>

        <div className="register-form__actions">
          <button disabled={status === "signing"} onClick={handleSaveSignedPayload} type="button">
            {status === "signing" ? "Signing..." : "Sign and save for revocation"}
          </button>
          <button disabled={status === "signing"} type="submit">
            {status === "signing" ? "Signing..." : "Submit to relayer"}
          </button>
          <a href={`/agent/${encodeURIComponent(agentName)}`}>View task history</a>
          <strong>{statusMessage}</strong>
        </div>

        {submittedTxHash || signature ? (
          <div className="transaction-result" aria-label="Transaction status">
            <span>Transaction status</span>
            {submittedTxHash ? <code>{submittedTxHash}</code> : null}
            {signature ? <code>{signature}</code> : null}
          </div>
        ) : null}
      </form>

      <div className="detail-grid">
        <EnsProofPanel
          agentName={agentName}
          agentNode={agentNode}
          authorizationStatus={authorizationStatus}
          ensAgentAddress={liveAgentAddress}
          failureReason={authorizationStatus === "fail" ? "Recovered signer does not match ENS addr(agent)" : draftState.error ?? undefined}
          gasBudgetWei={liveGasBudget}
          ownerName={ownerName}
          ownerNode={ownerNode}
          policyEnabled={livePolicy?.[7]}
          policyHash={livePolicyHash}
          recoveredSigner={recoveredSigner}
          resolverAddress={resolverAddress}
        />
        <TaskHistoryPanel tasks={taskHistory} />
      </div>
    </>
  );
}

/**
 * Renders one compact preview row.
 */
function PreviewRow(props: { label: string; title?: string; value: string }) {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd title={props.title}>{props.value}</dd>
    </div>
  );
}

/**
 * Displays TaskRecorded events for the selected agent.
 */
function TaskHistoryPanel({ tasks }: { tasks: readonly TaskHistoryItem[] }) {
  return (
    <section className="app-card" aria-labelledby="run-history-title">
      <div className="section-heading">
        <p>TaskRecorded events</p>
        <h2 id="run-history-title">Task history</h2>
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
          <span>Task history refreshes after the relayer submits a TaskRecorded event.</span>
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
 * Converts one TaskRecorded log into a display row.
 */
function taskFromLog(log: TaskRecordedLog): TaskHistoryItem {
  const taskId = log.args.taskId?.toString() ?? log.transactionHash;
  return {
    id: `${log.transactionHash}-${taskId}`,
    metadataURI: log.args.metadataURI ?? "",
    taskHash: log.args.taskHash ?? "0x",
    timestamp: log.args.timestamp ? new Date(Number(log.args.timestamp) * 1000).toISOString() : "Unknown time",
    txHash: log.transactionHash
  };
}

function formatNullableHex(value?: Hex | null): string {
  return value ? shortenHex(value) : "Unknown";
}

function safeBigInt(value?: bigint): bigint {
  return typeof value === "bigint" ? value : 0n;
}

function currentUnixSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

function sameAddress(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
