"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { policySnapshotFromTextRecords, type Hex } from "@agentpassport/config";
import { useAccount, useEnsName, usePublicClient, useReadContract, useReadContracts, useSignTypedData } from "wagmi";
import {
  AGENT_ENS_EXECUTOR_ABI,
  AGENT_TEXT_RECORD_KEYS,
  ENS_REGISTRY_ABI,
  PUBLIC_RESOLVER_ABI,
  nonZeroAddress
} from "../lib/contracts";
import { normalizeEnsFormName, safeNamehash } from "../lib/ensPreview";
import {
  buildStoredSignedTaskPayload,
  buildFreshTaskRunDraft,
  recoverTaskSigner,
  serializeRelayerExecutePayload,
  serializeTypedData,
  storeSignedTaskPayload,
  taskAuthorizationResult,
  taskGasBudgetStatus
} from "../lib/taskDemo";
import {
  mapAgentTextRecords,
  readAgentEnsAutofill,
  readImmediateOwnerName,
  type AgentTextReadResult
} from "../lib/agentSession";
import {
  loadTaskHistory,
  type TaskHistoryItem
} from "../lib/taskHistory";
import { AgentLiveDataPanel } from "./AgentLiveDataPanel";
import { DemoReadinessPanel } from "./DemoReadinessPanel";
import { EnsProofPanel, formatWei, shortenHex } from "./EnsProofPanel";
import { StatusBanner } from "./StatusBanner";
import { TaskHistoryPanel } from "./TaskHistoryPanel";

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
  taskLogStartBlock?: bigint | null;
};

type RelayerResponse = {
  details?: string;
  status?: string;
  txHash?: Hex;
};

type DirectoryAgent = {
  agentName: string;
  ownerName: string;
};

type DirectoryAgentResponse = {
  agentName?: string;
  ownerName?: string;
  status?: string;
};

/**
 * Builds, signs, and submits one TaskLog execution intent for the live demo flow.
 */
export function RunTaskDemo(props: RunTaskDemoProps) {
  const { address: connectedWallet } = useAccount();
  const publicClient = usePublicClient({ chainId: Number(props.chainId) });
  const { signTypedDataAsync } = useSignTypedData();
  const [agentName, setAgentName] = useState(props.defaultAgentName);
  const [agentNameEdited, setAgentNameEdited] = useState(Boolean(props.defaultAgentName));
  const [ownerName, setOwnerName] = useState(props.defaultOwnerName);
  const [ownerNameEdited, setOwnerNameEdited] = useState(Boolean(props.defaultOwnerName));
  const [taskDescription, setTaskDescription] = useState(props.defaultTaskDescription);
  const [metadataURI, setMetadataURI] = useState(props.defaultMetadataURI);
  const [status, setStatus] = useState<"idle" | "signing" | "submitted" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("Ready to sign a task intent");
  const [signature, setSignature] = useState<Hex | null>(null);
  const [recoveredSigner, setRecoveredSigner] = useState<Hex | null>(null);
  const [submittedTxHash, setSubmittedTxHash] = useState<Hex | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [optimisticNextNonce, setOptimisticNextNonce] = useState<bigint | null>(null);
  const [chainNowSeconds, setChainNowSeconds] = useState<bigint | null>(null);
  const [taskHistory, setTaskHistory] = useState<TaskHistoryItem[]>([]);
  const [directoryAgent, setDirectoryAgent] = useState<DirectoryAgent | null>(null);
  const normalizedAgentName = useMemo(() => normalizeEnsFormName(agentName), [agentName]);
  const normalizedOwnerName = useMemo(() => normalizeEnsFormName(ownerName), [ownerName]);
  const agentNode = useMemo(() => safeNamehash(normalizedAgentName), [normalizedAgentName]);
  const ownerNode = useMemo(() => safeNamehash(normalizedOwnerName), [normalizedOwnerName]);
  const agentReverseName = useEnsName({
    address: connectedWallet,
    chainId: Number(props.chainId),
    query: { enabled: Boolean(connectedWallet) }
  });
  const agentEnsAutofill = readAgentEnsAutofill({
    currentAgentName: agentName,
    directoryAgentName: directoryAgent?.agentName ?? null,
    hasUserEditedAgentName: agentNameEdited,
    reverseEnsName: agentReverseName.data ?? null
  });
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
  const gasBudgetRead = useReadContract({
    address: props.executorAddress ?? undefined,
    abi: AGENT_ENS_EXECUTOR_ABI,
    functionName: "gasBudgetWei",
    args: [agentNode],
    query: { enabled: Boolean(props.executorAddress) }
  });
  const nextNonceRead = useReadContract({
    address: props.executorAddress ?? undefined,
    abi: AGENT_ENS_EXECUTOR_ABI,
    functionName: "nextNonce",
    args: [agentNode],
    query: { enabled: Boolean(props.executorAddress) }
  });
  const chainNextNonce = safeBigInt(nextNonceRead.data as bigint | undefined);
  const effectiveNextNonce = optimisticNextNonce ?? chainNextNonce;
  const textRecords = useMemo(
    () => mapAgentTextRecords(textRecordReads.data as AgentTextReadResult[] | undefined),
    [textRecordReads.data]
  );
  const textRecordMap = useMemo(
    () =>
      Object.fromEntries(
        textRecords.map((record) => [record.key, record.value === "Unknown" ? "" : record.value])
      ),
    [textRecords]
  );
  const livePolicyState = useMemo(() => {
    try {
      return {
        error: null,
        policyDigest: textRecordMap["agent_policy_digest"] as Hex | undefined,
        policySnapshot: policySnapshotFromTextRecords(agentNode, textRecordMap)
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Waiting for ENS policy snapshot",
        policyDigest: textRecordMap["agent_policy_digest"] as Hex | undefined,
        policySnapshot: null
      };
    }
  }, [agentNode, textRecordMap]);

  useEffect(() => {
    if (agentEnsAutofill) {
      setAgentName(agentEnsAutofill);
    }
  }, [agentEnsAutofill]);

  useEffect(() => {
    const derivedOwnerName = directoryAgent?.ownerName ?? readImmediateOwnerName(agentName);
    if (!ownerNameEdited && derivedOwnerName && ownerName !== derivedOwnerName) {
      setOwnerName(derivedOwnerName);
    }
  }, [agentName, directoryAgent?.ownerName, ownerName, ownerNameEdited]);

  useEffect(() => {
    let cancelled = false;
    const reverseEnsSettled = !connectedWallet || agentReverseName.isSuccess || agentReverseName.isError;

    /**
     * Looks up a backend-indexed agent ENS only after reverse ENS is absent.
     */
    async function lookupVerifiedAgentDirectory() {
      if (!connectedWallet) {
        setDirectoryAgent(null);
        return;
      }

      const response = await fetch(`/api/agents?address=${encodeURIComponent(connectedWallet)}`);
      const body = (await response.json().catch(() => ({}))) as DirectoryAgentResponse;
      if (cancelled) {
        return;
      }

      if (response.ok && body.status === "found" && body.agentName && body.ownerName) {
        setDirectoryAgent({
          agentName: body.agentName,
          ownerName: body.ownerName
        });
        return;
      }

      setDirectoryAgent(null);
    }

    if (!connectedWallet || agentNameEdited || !reverseEnsSettled || agentReverseName.data) {
      setDirectoryAgent(null);
      return;
    }

    lookupVerifiedAgentDirectory().catch(() => {
      if (!cancelled) {
        setDirectoryAgent(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    agentNameEdited,
    agentReverseName.data,
    agentReverseName.isError,
    agentReverseName.isSuccess,
    connectedWallet
  ]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setPreviewRefreshKey((key) => key + 1), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  /**
   * Reads the latest block timestamp so signed expiries use the same clock as relayer validation.
   */
  async function readLatestBlockTimestamp(): Promise<bigint> {
    if (!publicClient) {
      throw new Error("Waiting for latest block timestamp");
    }
    const block = await publicClient.getBlock({ blockTag: "latest" });
    return block.timestamp;
  }

  useEffect(() => {
    let cancelled = false;

    /**
     * Refreshes the latest chain timestamp used for previewed TaskIntent expiries.
     */
    async function refreshChainNowSeconds() {
      try {
        const latestTimestamp = await readLatestBlockTimestamp();
        if (!cancelled) {
          setChainNowSeconds(latestTimestamp);
        }
      } catch {
        if (!cancelled) {
          setChainNowSeconds(null);
        }
      }
    }

    refreshChainNowSeconds();

    return () => {
      cancelled = true;
    };
  }, [publicClient, previewRefreshKey]);

  useEffect(() => {
    setOptimisticNextNonce(null);
  }, [agentNode]);

  useEffect(() => {
    if (optimisticNextNonce !== null && nextNonceRead.isSuccess && chainNextNonce >= optimisticNextNonce) {
      setOptimisticNextNonce(null);
    }
  }, [chainNextNonce, nextNonceRead.isSuccess, optimisticNextNonce]);

  /**
   * Builds a task draft from a chain timestamp so expiresAt matches relayer validation time.
   */
  function buildCurrentDraft(nowSeconds: bigint) {
    if (!props.executorAddress || !props.taskLogAddress) {
      throw new Error("Executor and TaskLog addresses must be configured");
    }
    if (!nextNonceRead.isSuccess) {
      throw new Error("Waiting for executor nextNonce");
    }
    if (!livePolicyState.policySnapshot) {
      throw new Error(livePolicyState.error ?? "Waiting for ENS policy snapshot");
    }
    return buildFreshTaskRunDraft({
      agentName: normalizedAgentName,
      chainId: props.chainId,
      executorAddress: props.executorAddress,
      metadataURI,
      nonce: effectiveNextNonce,
      nowSeconds,
      ownerName: normalizedOwnerName,
      policySnapshot: livePolicyState.policySnapshot,
      taskDescription,
      taskLogAddress: props.taskLogAddress,
      ttlSeconds: INTENT_TTL_SECONDS
    });
  }

  /**
   * Marks the agent ENS as user-controlled so reverse ENS never overwrites a manual selection.
   */
  function handleAgentNameChange(event: ChangeEvent<HTMLInputElement>) {
    setAgentNameEdited(true);
    setAgentName(event.target.value);
  }

  /**
   * Allows advanced users to override the immediate parent when testing invalid-owner failures.
   */
  function handleOwnerNameChange(event: ChangeEvent<HTMLInputElement>) {
    setOwnerNameEdited(true);
    setOwnerName(event.target.value);
  }

  const draftState = useMemo(() => {
    try {
      if (chainNowSeconds === null) {
        throw new Error("Waiting for latest block timestamp");
      }
      return {
        draft: buildCurrentDraft(chainNowSeconds),
        error: null
      };
    } catch (error) {
      return { draft: null, error: error instanceof Error ? error.message : "Task draft is invalid" };
    }
  }, [
    chainNowSeconds,
    effectiveNextNonce,
    metadataURI,
    nextNonceRead.isSuccess,
    livePolicyState.error,
    livePolicyState.policySnapshot,
    normalizedAgentName,
    normalizedOwnerName,
    previewRefreshKey,
    props.chainId,
    props.executorAddress,
    props.taskLogAddress,
    taskDescription
  ]);
  const liveAgentAddress = nonZeroAddress(agentAddressRead.data as Hex | undefined);
  const liveGasBudget = safeBigInt(gasBudgetRead.data as bigint | undefined);
  const gasBudgetStatus = taskGasBudgetStatus({
    gasBudgetWei: liveGasBudget,
    maxGasReimbursementWei: livePolicyState.policySnapshot?.maxGasReimbursementWei,
    maxValueWei: livePolicyState.policySnapshot?.maxValueWei
  });
  const runSubmitBlocker = draftState.error ?? gasBudgetStatus.blocker;
  const authorization = taskAuthorizationResult({
    liveAgentAddress,
    policyEnabled: livePolicyState.policySnapshot?.enabled,
    recoveredSigner
  });

  useEffect(() => {
    let cancelled = false;

    /**
     * Loads indexed and onchain TaskLog records so the task proof appears after any valid execution lands.
     */
    async function refreshTaskHistory() {
      if (!normalizedAgentName) {
        setTaskHistory([]);
        return;
      }
      const tasks = await loadTaskHistory({
        agentNode,
        fromBlock: props.taskLogStartBlock,
        publicClient,
        taskLogAddress: props.taskLogAddress ?? null
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
  }, [agentNode, historyRefreshKey, normalizedAgentName, props.taskLogAddress, props.taskLogStartBlock, publicClient]);

  /**
   * Signs the prepared EIP-712 payload and returns the relayer request body.
   */
  async function signDraft() {
    const chainTimestamp = await readLatestBlockTimestamp();
    setChainNowSeconds(chainTimestamp);
    const draft = buildCurrentDraft(chainTimestamp);

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
      policySnapshot: draft.policySnapshot,
      signature: signed as Hex
    });
    const storedPayload = buildStoredSignedTaskPayload({
      agentName: normalizedAgentName,
      callData: draft.callData,
      digest: draft.digest,
      intent: draft.intent,
      ownerName: normalizedOwnerName,
      policySnapshot: draft.policySnapshot,
      recoveredSigner: recovered,
      signature: signed as Hex,
      taskHash: draft.taskHash,
      typedData: draft.typedData
    });
    storeSignedTaskPayload({ payload: storedPayload });

    setSignature(signed as Hex);
    setRecoveredSigner(recovered);
    return relayerPayload;
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
      if (runSubmitBlocker) {
        throw new Error(runSubmitBlocker);
      }

      const relayerPayload = await signDraft();
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
      setOptimisticNextNonce(BigInt(relayerPayload.intent.nonce) + 1n);
      void nextNonceRead.refetch().catch(() => undefined);
      setStatus("submitted");
      setStatusMessage("Task submitted and saved for revocation proof");
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
              <input name="agentName" onChange={handleAgentNameChange} value={agentName} />
            </label>
            <label>
              <span>Owner ENS</span>
              <input name="ownerName" onChange={handleOwnerNameChange} value={ownerName} />
            </label>
            <label>
              <span>Task text</span>
              <input
                name="taskDescription"
                onChange={(event) => setTaskDescription(event.target.value)}
                value={taskDescription}
              />
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
            <PreviewRow
              label="ENS addr(agent)"
              title={liveAgentAddress ?? undefined}
              value={formatNullableHex(liveAgentAddress)}
            />
            <PreviewRow label="Next nonce" value={nextNonceRead.isSuccess ? effectiveNextNonce.toString() : "Unknown"} />
            <PreviewRow label="Gas budget" value={formatWei(liveGasBudget)} />
            <PreviewRow
              label="Call data hash"
              title={draftState.draft?.intent.callDataHash}
              value={formatNullableHex(draftState.draft?.intent.callDataHash)}
            />
            <PreviewRow
              label="Recovered signer"
              title={recoveredSigner ?? undefined}
              value={formatNullableHex(recoveredSigner)}
            />
          </dl>
          <pre className="json-panel">
            {JSON.stringify(
              draftState.draft ? serializeTypedData(draftState.draft.typedData) : { error: draftState.error },
              null,
              2
            )}
          </pre>
        </section>

        <div className="register-form__actions">
          <button disabled={status === "signing" || Boolean(runSubmitBlocker)} type="submit">
            {status === "signing" ? "Signing..." : "Submit to relayer"}
          </button>
          <a href={`/agent/${encodeURIComponent(agentName)}`}>View task history</a>
          {runSubmitBlocker ? <small className="field-help field-help--warning">{runSubmitBlocker}</small> : null}
        </div>

        <div className="register-form__section">
          <StatusBanner
            details={runSubmitBlocker ?? "Waiting for live agent data, policy state, nonce, and gas budget."}
            message={statusMessage}
            title="Run status"
            variant={status === "signing" ? "loading" : status === "submitted" ? "success" : status}
          />
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
        <AgentLiveDataPanel
          agentAddress={liveAgentAddress}
          agentName={agentName}
          connectedWallet={connectedWallet ?? null}
          gasBudgetWei={liveGasBudget}
          isReverseEnsSettled={!connectedWallet || agentReverseName.isSuccess || agentReverseName.isError}
          nextNonce={nextNonceRead.isSuccess ? effectiveNextNonce : null}
          policySnapshot={livePolicyState.policySnapshot}
          policyHash={livePolicyState.policyDigest ?? null}
          resolverAddress={resolverAddress}
          reverseEnsName={agentReverseName.data ?? null}
          textRecords={textRecords}
        />
        <EnsProofPanel
          agentName={agentName}
          agentNode={agentNode}
          authorizationStatus={authorization.status}
          ensAgentAddress={liveAgentAddress}
          failureReason={authorization.failureReason ?? runSubmitBlocker ?? undefined}
          gasBudgetWei={liveGasBudget}
          ownerName={ownerName}
          ownerNode={ownerNode}
          policyEnabled={livePolicyState.policySnapshot?.enabled}
          policyHash={livePolicyState.policyDigest ?? null}
          recoveredSigner={recoveredSigner}
          resolverAddress={resolverAddress}
        />
        <TaskHistoryPanel
          emptyDescription="Task history refreshes after the relayer submits a TaskRecorded event."
          eyebrow="TaskRecorded events"
          headingId="run-history-title"
          tasks={taskHistory}
          title="Task history"
        />
        <DemoReadinessPanel
          agentAddress={liveAgentAddress}
          gasBudgetWei={liveGasBudget}
          policyEnabled={livePolicyState.policySnapshot?.enabled}
          relayerReady={Boolean(props.executorAddress)}
          resolverAddress={resolverAddress}
          taskLogAddress={props.taskLogAddress}
        />
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

function formatNullableHex(value?: Hex | null): string {
  return value ? shortenHex(value) : "Unknown";
}

function safeBigInt(value?: bigint): bigint {
  return typeof value === "bigint" ? value : 0n;
}
