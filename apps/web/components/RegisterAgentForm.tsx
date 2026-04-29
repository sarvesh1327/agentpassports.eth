"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { taskLogRecordTaskSelector, type Hex } from "@agentpassport/config";
import { waitForCallsStatus } from "viem/actions";
import {
  useAccount,
  useEnsAddress,
  useEnsName,
  usePublicClient,
  useReadContract,
  useSendCalls,
  useSendTransaction,
  useWalletClient
} from "wagmi";
import {
  AGENT_ENS_EXECUTOR_ABI,
  ENS_REGISTRY_ABI,
  NAME_WRAPPER_ABI,
  PUBLIC_RESOLVER_ABI,
  nonZeroAddress
} from "../lib/contracts";
import { normalizeAddressInput } from "../lib/addressInput";
import {
  buildOwnerEnsStatus,
  buildRegisterPreview,
  buildRegistrationDraftStatus,
  readOwnerEnsAutofill,
  requireAddress,
  resolveEffectiveOwnerManager,
  safeBigInt,
  validateRegistrationInput
} from "../lib/registerAgent";
import { formatWeiAsEth, formatWeiInputAsEth, parseEthInputToWeiString } from "../lib/ethAmount";
import { buildRegistrationBatch, type RegistrationBatchInput } from "../lib/registrationBatch";
import { OWNER_INDEX_AGENTS_KEY, parseOwnerAgentIndex } from "../lib/ownerIndex";
import {
  submitRegistrationBatch,
  type RegistrationSubmissionResult
} from "../lib/registrationSubmission";
import { shortenHex } from "./EnsProofPanel";
import { UiIcon } from "./icons/UiIcons";
import { StatusBanner } from "./StatusBanner";

export type RegisterAgentFormProps = {
  chainId: bigint;
  defaultAgentAddress?: Hex | null;
  defaultAgentLabel: string;
  defaultGasBudgetWei: string;
  defaultMaxGasReimbursementWei: string;
  defaultMaxValueWei: string;
  defaultOwnerName: string;
  defaultPolicyExpiresAt: string;
  defaultPolicyUri: string;
  ensRegistryAddress?: Hex | null;
  executorAddress?: Hex | null;
  nameWrapperAddress?: Hex | null;
  publicResolverAddress?: Hex | null;
  taskLogAddress?: Hex | null;
};

type AgentIndexResponse = {
  status?: string;
};

type GeneratedPolicyMetadataResponse = {
  policyHash?: Hex;
  policyUri?: string;
  status?: string;
};

const AGENT_DIRECTORY_INDEX_RETRY_DELAYS_MS = [0, 2_000, 6_000, 12_000] as const;
const AGENT_CAPABILITIES = ["task-log", "sponsored-execution"] as const;

/**
 * Captures the ENS identity, record metadata, policy, and gas budget inputs for a new agent.
 */
export function RegisterAgentForm(props: RegisterAgentFormProps) {
  const { address: connectedWallet, isConnected } = useAccount();
  const { sendCallsAsync } = useSendCalls();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient({ chainId: Number(props.chainId) });
  const walletClient = useWalletClient({ chainId: Number(props.chainId) });
  const [ownerName, setOwnerName] = useState(props.defaultOwnerName);
  const [ownerNameEdited, setOwnerNameEdited] = useState(false);
  const [agentLabel, setAgentLabel] = useState(props.defaultAgentLabel);
  const [agentAddress, setAgentAddress] = useState(props.defaultAgentAddress ?? "");
  const [gasBudgetEth, setGasBudgetEth] = useState(formatWeiInputAsEth(props.defaultGasBudgetWei));
  const [maxReimbursementEth, setMaxReimbursementEth] = useState(formatWeiInputAsEth(props.defaultMaxGasReimbursementWei));
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("Draft not prepared");
  const [submittedTxHashes, setSubmittedTxHashes] = useState<string[]>([]);
  const gasBudgetWei = parseEthInputToWeiString(gasBudgetEth);
  const maxGasReimbursementWei = parseEthInputToWeiString(maxReimbursementEth);
  const preview = useMemo(
    () =>
      buildRegisterPreview({
        agentAddress,
        agentLabel,
        executorAddress: props.executorAddress,
        gasBudgetWei,
        maxGasReimbursementWei,
        maxValueWei: props.defaultMaxValueWei,
        ownerName,
        policyExpiresAt: props.defaultPolicyExpiresAt,
        policyUri: "",
        taskLogAddress: props.taskLogAddress
      }),
    [
      agentAddress,
      agentLabel,
      gasBudgetWei,
      maxGasReimbursementWei,
      ownerName,
      props.defaultMaxValueWei,
      props.defaultPolicyExpiresAt,
      props.executorAddress,
      props.taskLogAddress
    ]
  );
  const normalizedOwnerName = ownerName.trim().toLowerCase();
  const normalizedAgentLabel = agentLabel.trim().toLowerCase();
  const normalizedAgentAddress = normalizeAddressInput(agentAddress);
  const ownerReverseName = useEnsName({
    address: connectedWallet,
    chainId: Number(props.chainId),
    query: { enabled: Boolean(connectedWallet) }
  });
  const ownerEnsAutofill = readOwnerEnsAutofill({
    currentOwnerName: ownerName,
    hasUserEditedOwnerName: ownerNameEdited,
    reverseEnsName: ownerReverseName.data ?? null
  });
  const ownerResolvedAddress = useEnsAddress({
    chainId: Number(props.chainId),
    name: normalizedOwnerName || undefined,
    query: { enabled: Boolean(normalizedOwnerName) }
  });
  const ownerResolver = useReadContract({
    address: props.ensRegistryAddress ?? undefined,
    abi: ENS_REGISTRY_ABI,
    functionName: "resolver",
    args: [preview.ownerNode],
    query: { enabled: Boolean(props.ensRegistryAddress && normalizedOwnerName) }
  });
  const ownerResolverAddress = ownerResolver.isSuccess
    ? nonZeroAddress(ownerResolver.data as Hex | undefined)
    : null;
  const ownerAgentIndex = useReadContract({
    address: ownerResolverAddress ?? undefined,
    abi: PUBLIC_RESOLVER_ABI,
    functionName: "text",
    args: [preview.ownerNode, OWNER_INDEX_AGENTS_KEY],
    query: { enabled: Boolean(ownerResolverAddress && normalizedOwnerName) }
  });
  const ownerAgentLabels = parseOwnerAgentIndex(typeof ownerAgentIndex.data === "string" ? ownerAgentIndex.data : "");
  const ownerManager = useReadContract({
    address: props.ensRegistryAddress ?? undefined,
    abi: ENS_REGISTRY_ABI,
    functionName: "owner",
    args: [preview.ownerNode],
    query: { enabled: Boolean(props.ensRegistryAddress && normalizedOwnerName) }
  });
  const registryOwnerAddress = nonZeroAddress(ownerManager.data as Hex | undefined);
  const ownerIsWrapped = Boolean(
    registryOwnerAddress &&
      props.nameWrapperAddress &&
      registryOwnerAddress.toLowerCase() === props.nameWrapperAddress.toLowerCase()
  );
  const wrappedOwner = useReadContract({
    address: props.nameWrapperAddress ?? undefined,
    abi: NAME_WRAPPER_ABI,
    functionName: "ownerOf",
    args: [BigInt(preview.ownerNode)],
    query: { enabled: ownerIsWrapped }
  });
  const effectiveOwnerManager = resolveEffectiveOwnerManager({
    nameWrapperAddress: props.nameWrapperAddress,
    registryOwner: registryOwnerAddress,
    wrapperOwner: nonZeroAddress(wrappedOwner.data as Hex | undefined)
  });
  const ownerEnsStatus = buildOwnerEnsStatus({
    connectedWallet,
    effectiveOwnerManager,
    isOwnerManagerSettled: isOwnerManagerSettled({
      isWrapped: ownerIsWrapped,
      normalizedOwnerName,
      ownerManagerSettled: ownerManager.isSuccess || ownerManager.isError,
      wrappedOwnerSettled: wrappedOwner.isSuccess || wrappedOwner.isError
    }),
    isOwnerResolutionSettled: !normalizedOwnerName || ownerResolvedAddress.isSuccess || ownerResolvedAddress.isError,
    isReverseEnsSettled: !connectedWallet || ownerReverseName.isSuccess || ownerReverseName.isError,
    normalizedOwnerName,
    ownerResolvedAddress: nonZeroAddress(ownerResolvedAddress.data as Hex | undefined),
    reverseEnsName: ownerReverseName.data ?? null
  });
  const agentOwner = useReadContract({
    address: props.ensRegistryAddress ?? undefined,
    abi: ENS_REGISTRY_ABI,
    functionName: "owner",
    args: [preview.agentNode],
    query: { enabled: Boolean(props.ensRegistryAddress && normalizedOwnerName && normalizedAgentLabel) }
  });
  const agentResolver = useReadContract({
    address: props.ensRegistryAddress ?? undefined,
    abi: ENS_REGISTRY_ABI,
    functionName: "resolver",
    args: [preview.agentNode],
    query: { enabled: Boolean(props.ensRegistryAddress && normalizedOwnerName && normalizedAgentLabel) }
  });
  const liveAgentOwnerAddress = agentOwner.isSuccess ? nonZeroAddress(agentOwner.data as Hex | undefined) : null;
  const shouldCreateSubnameRecord = agentOwner.isSuccess && liveAgentOwnerAddress === null;
  const registryResolverAddress = nonZeroAddress(agentResolver.data as Hex | undefined);
  const liveResolverAddress = agentResolver.isSuccess ? registryResolverAddress : null;
  const resolverWriteAddress = liveResolverAddress ?? (shouldCreateSubnameRecord ? props.publicResolverAddress ?? null : null);
  const existingGasBudget = useReadContract({
    address: props.executorAddress ?? undefined,
    abi: AGENT_ENS_EXECUTOR_ABI,
    functionName: "gasBudgetWei",
    args: [preview.agentNode],
    query: { enabled: Boolean(props.executorAddress && normalizedOwnerName && normalizedAgentLabel) }
  });
  const liveGasBudgetWei = existingGasBudget.isSuccess && typeof existingGasBudget.data === "bigint" ? existingGasBudget.data : null;
  const oldPolicyUri = useReadContract({
    address: resolverWriteAddress ?? undefined,
    abi: PUBLIC_RESOLVER_ABI,
    functionName: "text",
    args: [preview.agentNode, "agent.policy.uri"],
    query: { enabled: Boolean(resolverWriteAddress && normalizedOwnerName && normalizedAgentLabel) }
  });
  const oldPolicyUriValue = typeof oldPolicyUri.data === "string" ? oldPolicyUri.data : "";
  const registrationDraftStatus = buildRegistrationDraftStatus({
    agentLabel: normalizedAgentLabel,
    executorAddress: props.executorAddress,
    gasBudgetWei: preview.gasBudgetWei,
    hasPreparedTextRecords: preview.textRecords.length > 0,
    maxGasReimbursementWei,
    maxValueWei: props.defaultMaxValueWei,
    normalizedAgentAddress,
    publicResolverAddress: props.publicResolverAddress,
    resolverAddress: liveResolverAddress,
    resolverLookupSettled: isAgentResolverLookupSettled({
      hasEnsInput: Boolean(normalizedOwnerName && normalizedAgentLabel),
      resolverSettled: agentResolver.isSuccess || agentResolver.isError
    }),
    shouldCreateSubnameRecord,
    subnameOwnerLookupSettled: isAgentSubnameOwnerLookupSettled({
      hasEnsInput: Boolean(normalizedOwnerName && normalizedAgentLabel),
      ownerSettled: agentOwner.isSuccess || agentOwner.isError
    }),
    taskLogAddress: props.taskLogAddress
  });
  const ownerIndexBlocker = ownerResolver.isSuccess && !ownerResolverAddress
    ? "Owner resolver address is required for owner dashboard index updates"
    : null;
  const submitBlocker = ownerEnsStatus.blocker ?? ownerIndexBlocker ?? registrationDraftStatus.blocker;
  const hasPreparedTransactions = registrationDraftStatus.canSubmit;
  const preparedBatchSummary = useMemo(
    () => buildPreparedBatchSummary(),
    [
      connectedWallet,
      hasPreparedTransactions,
      liveGasBudgetWei,
      liveAgentOwnerAddress,
      liveResolverAddress,
      normalizedAgentAddress,
      normalizedAgentLabel,
      ownerIsWrapped,
      preview.agentNode,
      preview.gasBudgetWei,
      preview.ownerNode,
      preview.textRecords,
      ownerAgentLabels,
      ownerResolverAddress,
      maxGasReimbursementWei,
      props.defaultMaxValueWei,
      props.defaultPolicyExpiresAt,
      props.ensRegistryAddress,
      props.executorAddress,
      props.nameWrapperAddress,
      props.publicResolverAddress,
      props.taskLogAddress,
      shouldCreateSubnameRecord,
      resolverWriteAddress
    ]
  );

  useEffect(() => {
    if (ownerEnsAutofill) {
      setOwnerName(ownerEnsAutofill);
    }
  }, [ownerEnsAutofill]);

  /**
   * Marks owner ENS as user-controlled so late reverse ENS reads never overwrite manual input.
   */
  function handleOwnerNameChange(event: ChangeEvent<HTMLInputElement>) {
    setOwnerNameEdited(true);
    setOwnerName(event.target.value);
  }

  /**
   * Returns the resolver that will be reachable after the subname setup transaction is mined.
   */
  function requireLiveResolverAddress(): Hex {
    if (liveResolverAddress) {
      return liveResolverAddress;
    }

    if (shouldCreateSubnameRecord) {
      return requireAddress(props.publicResolverAddress, "Public resolver address is not configured");
    }

    if (!agentResolver.isSuccess && !agentResolver.isError) {
      throw new Error("Waiting for live resolver lookup");
    }

    return requireAddress(registryResolverAddress, "Agent ENS resolver is not configured for record writes");
  }

  /**
   * Validates form and environment state before any wallet transaction is requested.
   */
  function readSubmissionInput(textRecords = preview.textRecords): RegistrationBatchInput {
    if (submitBlocker) {
      throw new Error(submitBlocker);
    }

    validateRegistrationInput({ agentLabel: normalizedAgentLabel, ownerNode: preview.ownerNode });

    if (!isConnected || !connectedWallet) {
      throw new Error("Connect a wallet before submitting registration");
    }

    if (!normalizedAgentAddress) {
      throw new Error("Enter a valid agent address before submitting registration");
    }
    if (safeBigInt(preview.gasBudgetWei) === 0n) {
      throw new Error("Enter a nonzero gas budget before submitting registration");
    }
    if (!ownerResolverAddress) {
      throw new Error("Owner resolver address is required for owner dashboard index updates");
    }

    const resolverAddress = requireLiveResolverAddress();

    return {
      agentLabel: normalizedAgentLabel,
      agentNode: preview.agentNode,
      connectedWallet,
      ensRegistryAddress: props.ensRegistryAddress,
      existingGasBudgetWei: liveGasBudgetWei,
      executorAddress: requireAddress(props.executorAddress, "Executor address is not configured"),
      gasBudgetWei: preview.gasBudgetWei,
      isOwnerWrapped: ownerIsWrapped,
      maxGasReimbursementWei,
      maxValueWei: props.defaultMaxValueWei,
      nameWrapperAddress: props.nameWrapperAddress,
      normalizedAgentAddress,
      ownerAgentLabels,
      ownerNode: preview.ownerNode,
      ownerResolverAddress,
      policyExpiresAt: props.defaultPolicyExpiresAt,
      publicResolverAddress: shouldCreateSubnameRecord
        ? requireAddress(props.publicResolverAddress, "Public resolver address is not configured")
        : resolverAddress,
      resolverAddress,
      shouldCreateSubnameRecord,
      taskLogAddress: requireAddress(props.taskLogAddress, "TaskLog address is not configured"),
      textRecords
    };
  }

  /**
   * Builds readable transaction labels for the prepared wallet batch preview.
   */
  function buildPreparedBatchSummary(): string[] {
    if (
      !hasPreparedTransactions ||
      !connectedWallet ||
      !normalizedAgentAddress ||
      !props.executorAddress ||
      !props.taskLogAddress ||
      !ownerResolverAddress ||
      !resolverWriteAddress
    ) {
      return [];
    }

    return buildRegistrationBatch({
      agentLabel: normalizedAgentLabel,
      agentNode: preview.agentNode,
      connectedWallet,
      ensRegistryAddress: props.ensRegistryAddress,
      existingGasBudgetWei: liveGasBudgetWei,
      executorAddress: props.executorAddress,
      gasBudgetWei: preview.gasBudgetWei,
      isOwnerWrapped: ownerIsWrapped,
      maxGasReimbursementWei,
      maxValueWei: props.defaultMaxValueWei,
      nameWrapperAddress: props.nameWrapperAddress,
      normalizedAgentAddress,
      ownerAgentLabels,
      ownerNode: preview.ownerNode,
      ownerResolverAddress,
      policyExpiresAt: props.defaultPolicyExpiresAt,
      publicResolverAddress: props.publicResolverAddress ?? resolverWriteAddress,
      resolverAddress: resolverWriteAddress,
      shouldCreateSubnameRecord,
      taskLogAddress: props.taskLogAddress,
      textRecords: preview.textRecords
    }).summary;
  }

  /**
   * Submits the complete registration flow, falling back when the wallet lacks atomic batching.
   */
  async function submitRegistrationTransactions(input: RegistrationBatchInput): Promise<RegistrationSubmissionResult> {
    if (!publicClient) {
      throw new Error("Sepolia public client is not ready");
    }

    const batch = buildRegistrationBatch(input);

    return submitRegistrationBatch({
      account: input.connectedWallet,
      batch,
      call: (request) => publicClient.call(request),
      chainId: Number(props.chainId),
      estimateGas: ({ account, data, to, value }) => publicClient.estimateGas({ account, data, to, value }),
      sendCalls: (request) => sendCallsAsync(request),
      sendTransaction: (request) => sendTransactionAsync(request),
      waitForCallsStatus: walletClient.data
        ? (request) => waitForCallsStatus(walletClient.data, { id: request.id, throwOnFailure: true, timeout: 180_000 })
        : undefined,
      waitForTransactionReceipt: (request) => publicClient.waitForTransactionReceipt(request)
    });
  }

  /**
   * Creates the ENS policy URI through the server so Pinata credentials never reach the browser bundle.
   */
  async function generatePolicyMetadata(): Promise<{ policyHash: Hex; policyUri: string }> {
    const executorAddress = requireAddress(props.executorAddress, "Executor address is not configured");
    const taskLogAddress = requireAddress(props.taskLogAddress, "TaskLog address is not configured");
    const agentSignerAddress = requireAddress(normalizedAgentAddress, "Enter a valid agent address before submitting registration");
    const response = await fetch("/api/policy-metadata", {
      body: JSON.stringify({
        agentAddress: agentSignerAddress,
        agentName: preview.agentName,
        agentNode: preview.agentNode,
        capabilities: AGENT_CAPABILITIES,
        chainId: props.chainId.toString(),
        executorAddress,
        expiresAt: props.defaultPolicyExpiresAt,
        maxGasReimbursementWei,
        maxValueWei: props.defaultMaxValueWei,
        ownerName: normalizedOwnerName,
        ownerNode: preview.ownerNode,
        status: "active",
        target: taskLogAddress
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    const body = (await response.json().catch(() => ({}))) as GeneratedPolicyMetadataResponse;

    if (!response.ok || body.status !== "pinned" || !body.policyUri || !body.policyHash) {
      throw new Error("Policy metadata Pinata upload failed");
    }

    return {
      policyHash: body.policyHash,
      policyUri: body.policyUri
    };
  }

  /**
   * Best-effort cleanup for the previous Pinata CID after ENS has been pointed at a replacement URI.
   */
  async function unpinOldPolicyMetadata(oldPolicyUri: string, newPolicyUri: string): Promise<boolean> {
    if (!oldPolicyUri.trim() || oldPolicyUri.trim() === newPolicyUri.trim()) {
      return false;
    }

    try {
      const response = await fetch("/api/policy-metadata", {
        body: JSON.stringify({ policyUri: oldPolicyUri }),
        headers: { "content-type": "application/json" },
        method: "DELETE"
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Stores the agent wallet-to-ENS lookup after the backend verifies the live forward ENS record.
   */
  async function indexRegisteredAgent(input: { agentAddress: Hex | null; agentName: string }): Promise<boolean> {
    if (!input.agentAddress) {
      return false;
    }

    try {
      const response = await fetch("/api/agents", {
        body: JSON.stringify({
          agentAddress: input.agentAddress,
          agentName: input.agentName
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const body = (await response.json().catch(() => ({}))) as AgentIndexResponse;

      return response.ok && body.status === "indexed";
    } catch {
      return false;
    }
  }

  /**
   * Retries indexing because wallet batches may return before all ENS reads are visible to the API.
   */
  async function indexRegisteredAgentWithRetry(input: { agentAddress: Hex | null; agentName: string }): Promise<boolean> {
    for (const delayMs of AGENT_DIRECTORY_INDEX_RETRY_DELAYS_MS) {
      if (delayMs > 0) {
        await delay(delayMs);
      }

      if (await indexRegisteredAgent(input)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validates input, requests wallet writes, and records submitted transaction hashes.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setStatusMessage("Awaiting wallet approval");
    setSubmittedTxHashes([]);

    try {
      setStatusMessage("Generating policy metadata with Pinata");
      const generatedPolicy = await generatePolicyMetadata();
      const generatedPreview = buildRegisterPreview({
        agentAddress,
        agentLabel,
        executorAddress: props.executorAddress,
        gasBudgetWei,
        maxGasReimbursementWei,
        maxValueWei: props.defaultMaxValueWei,
        ownerName,
        policyExpiresAt: props.defaultPolicyExpiresAt,
        policyUri: generatedPolicy.policyUri,
        taskLogAddress: props.taskLogAddress
      });

      if (generatedPreview.policyHash !== generatedPolicy.policyHash) {
        throw new Error("Generated policy hash does not match the registration preview");
      }

      setStatusMessage("Awaiting wallet approval");
      const submissionInput = readSubmissionInput(generatedPreview.textRecords);
      const submitted = await submitRegistrationTransactions(submissionInput);
      const directoryIndexed = await indexRegisteredAgentWithRetry({
        agentAddress: normalizedAgentAddress,
        agentName: preview.agentName
      });
      if (submitted.finalized) {
        await unpinOldPolicyMetadata(oldPolicyUriValue, generatedPolicy.policyUri);
      }
      setSubmittedTxHashes(submitted.transactionIds);
      setStatus("submitted");
      setStatusMessage(
        [
          submitted.mode === "batch"
            ? "Registration batch submitted"
            : "Registration submitted with wallet fallback",
          directoryIndexed ? "Agent directory indexed" : "Agent directory will sync after ENS records are visible"
        ].join(". ")
      );
    } catch (error) {
      setStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "Registration failed");
    }
  }

  return (
    <form className="register-form register-workspace" onSubmit={handleSubmit}>
      <div className="register-workspace__main">
        <section className="register-step" aria-labelledby="register-owner-title">
          <div className="register-step__heading">
            <span><UiIcon name="shield" size={18} /></span>
            <h2 id="register-owner-title">Owner ENS</h2>
            {ownerEnsStatus.canSubmit ? <strong>Owner verified</strong> : null}
          </div>
          <div className="register-field-stack">
            <label>
              <span>Owner ENS</span>
              <input name="ownerName" onChange={handleOwnerNameChange} value={ownerName} />
              <small className="field-help">{ownerEnsStatus.guidance}</small>
            </label>
            <label>
              <span>Owner manager</span>
              <input readOnly value={formatNullableHex(effectiveOwnerManager)} />
            </label>
            <label>
              <span>Resolver</span>
              <input readOnly value={formatNullableHex(ownerResolverAddress)} />
            </label>
          </div>
          {ownerEnsStatus.blocker ? <small className="field-help field-help--warning">{ownerEnsStatus.blocker}</small> : null}
        </section>

        <section className="register-step register-step--identity" aria-labelledby="register-agent-title">
          <div className="register-step__heading">
            <span><UiIcon name="document" size={18} /></span>
            <h2 id="register-agent-title">Agent identity</h2>
          </div>
          <div className="register-field-stack">
            <label>
              <span>Agent label</span>
              <input name="agentLabel" onChange={(event) => setAgentLabel(event.target.value)} value={agentLabel} />
            </label>
            <label>
              <span>Full agent ENS (preview)</span>
              <input readOnly value={preview.agentName} />
            </label>
            <label>
              <span>Agent address</span>
              <input
                name="agentAddress"
                onChange={(event) => setAgentAddress(event.target.value)}
                placeholder="0x..."
                value={agentAddress}
              />
            </label>
            <div className="segmented-control" aria-label="Agent kind">
              <button type="button" aria-pressed="true">Personal assistant</button>
              <button type="button">Swapper</button>
              <button type="button">Researcher</button>
              <button type="button">Keeper</button>
            </div>
            <div className="capability-row" aria-label="Capabilities">
              {AGENT_CAPABILITIES.map((capability) => (
                <span key={capability}><input readOnly type="checkbox" /> {capability}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="register-step register-step--wide" aria-labelledby="register-policy-title">
          <div className="register-step__heading">
            <span><UiIcon name="document" size={18} /></span>
            <h2 id="register-policy-title">Policy</h2>
            <strong>Policy source <span className="pill pill--success">ENS</span></strong>
          </div>
          <div className="field-grid">
            <label>
              <span>Target (TaskLog)</span>
              <span className="sr-only">Policy target</span>
              <input readOnly value={props.taskLogAddress ?? "TaskLog not configured"} />
            </label>
            <label>
              <span>Selector</span>
              <input readOnly value={taskLogRecordTaskSelector()} />
            </label>
            <label>
              <span>Max value per call (ETH)</span>
              <input readOnly value={props.defaultMaxValueWei} />
            </label>
            <label>
              <span>Reimbursement cap (ETH)</span>
              <input
                name="maxReimbursementEth"
                onChange={(event) => setMaxReimbursementEth(event.target.value)}
                placeholder="0.0002"
                value={maxReimbursementEth}
              />
            </label>
            <label>
              <span>Policy URI</span>
              <input readOnly value="Generated by Pinata on submit" />
            </label>
            <label>
              <span>Policy digest (preview)</span>
              <input readOnly value={preview.policyDigest ?? "Pending"} />
            </label>
          </div>
        </section>

        <section className="register-step" aria-labelledby="register-gas-title">
          <div className="register-step__heading">
            <span><UiIcon name="gas" size={18} /></span>
            <h2 id="register-gas-title">Gas budget</h2>
          </div>
          <label className="register-field-stack">
            <span>Initial gas budget (ETH)</span>
            <input
              name="gasBudgetEth"
              onChange={(event) => setGasBudgetEth(event.target.value)}
              placeholder="0.0001"
              value={gasBudgetEth}
            />
          </label>
          <div className="budget-preview">
            <span>Estimated required top-up</span>
            <strong>{formatWeiAsEth(safeBigInt(preview.gasBudgetWei))}</strong>
          </div>
        </section>

        <div className="register-workspace__actions">
          <a href={`/owner/${encodeURIComponent(normalizedOwnerName)}`}>Cancel</a>
          <button disabled type="button"><UiIcon name="document" size={17} /> Save draft</button>
          <button disabled={status === "submitting" || Boolean(submitBlocker)} type="submit">
            <UiIcon name="shield" size={18} /> {status === "submitting" ? "Submitting..." : "Register agent"}
          </button>
        </div>
      </div>

      <aside className="register-workspace__side">
        <section className="register-side-card" aria-labelledby="register-preview-title">
          <div className="register-side-card__header">
            <h2 id="register-preview-title"><UiIcon name="eye" size={18} /> Prepared registration</h2>
            <span className="pill pill--success">Preview</span>
          </div>
          <dl className="register-preview-list">
            <PreviewRow label="Owner node" title={preview.ownerNode} value={normalizedOwnerName || "Unknown"} />
            <PreviewRow label="Agent node" title={preview.agentNode} value={preview.agentName ? `${preview.agentName} (new)` : "Unknown"} />
            <PreviewRow label="Subname action" value={preview.agentName ? `create ${preview.agentName}` : "Waiting for agent label"} />
            <PreviewRow label="Resolver writes" value={`addr + ${preview.textRecords.length} text records`} />
            <PreviewRow label="Owner index update" value={`${OWNER_INDEX_AGENTS_KEY} += ${normalizedAgentLabel || "label"}`} />
            <PreviewRow label="Budget transaction" value="depositGasBudget" />
          </dl>

          <div className="transaction-queue" aria-labelledby="register-transactions-title">
            <div className="register-side-card__header">
              <h3 id="register-transactions-title"><UiIcon name="queue" size={18} /> Transaction queue</h3>
              <span className="pill pill--info">{preparedBatchSummary.length || 0} steps</span>
            </div>
            {hasPreparedTransactions ? (
              <ol>
                {preparedBatchSummary.map((step, index) => (
                  <li key={step}>
                    <span>{index + 1}</span>
                    <strong>{step}</strong>
                    <em>Ready</em>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty-state">
                <strong>No transactions prepared</strong>
                <span>{registrationDraftStatus.blocker ?? "Prepared transactions appear after the ENS records, resolver, and gas budget are ready."}</span>
              </div>
            )}
          </div>
        </section>

        <section className="register-side-card" aria-labelledby="register-records-title">
          <div className="register-side-card__header">
            <h2 id="register-records-title"><UiIcon name="document" size={18} /> ENS records that will be written</h2>
          </div>
          {preview.textRecords.length > 0 ? (
            <div className="record-table" role="table" aria-label="ENS text records">
              {preview.textRecords.map((record) => (
                <div className="record-table__row" role="row" key={record.key}>
                  <span role="cell">{record.key}</span>
                  <strong role="cell">{record.value}</strong>
                </div>
              ))}
              <div className="record-table__row" role="row">
                <span role="cell">Total records</span>
                <strong role="cell">{preview.textRecords.length} text + 1 addr</strong>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No ENS records prepared</strong>
              <span>ENS text records appear after owner ENS, agent label, and agent address are ready.</span>
            </div>
          )}
        </section>

        <StatusBanner
          details={submitBlocker ?? "Waiting for ENS and wallet state to become ready."}
          message={statusMessage}
          title="Registration status"
          variant={status === "submitting" ? "loading" : status === "submitted" ? "success" : status}
        />
      </aside>
      {submittedTxHashes.length > 0 ? (
        <div className="transaction-result" aria-label="Registration submitted transactions">
          <span>Registration submitted</span>
          {submittedTxHashes.map((hash) => (
            <code key={hash}>{hash}</code>
          ))}
        </div>
      ) : null}
    </form>
  );
}

/**
 * Waits between post-registration directory verification attempts.
 */
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

/**
 * Renders one preview fact with stable wrapping for long ENS nodes and addresses.
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
 * Formats nullable hex values for the dense preview grid.
 */
function formatNullableHex(value?: Hex | null): string {
  return value ? shortenHex(value) : "Unknown";
}

/**
 * Treats owner-manager checks as settled only after the relevant registry or wrapper read completes.
 */
function isOwnerManagerSettled(input: {
  isWrapped: boolean;
  normalizedOwnerName: string;
  ownerManagerSettled: boolean;
  wrappedOwnerSettled: boolean;
}): boolean {
  if (!input.normalizedOwnerName) {
    return true;
  }

  return input.isWrapped ? input.wrappedOwnerSettled : input.ownerManagerSettled;
}

/**
 * Treats resolver lookup as pending only after enough ENS input exists to query the registry.
 */
function isAgentResolverLookupSettled(input: { hasEnsInput: boolean; resolverSettled: boolean }): boolean {
  if (!input.hasEnsInput) {
    return true;
  }

  return input.resolverSettled;
}

/**
 * Treats subname ownership as pending until the registry confirms whether the agent node already exists.
 */
function isAgentSubnameOwnerLookupSettled(input: { hasEnsInput: boolean; ownerSettled: boolean }): boolean {
  if (!input.hasEnsInput) {
    return true;
  }

  return input.ownerSettled;
}
