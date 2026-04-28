"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { namehashEnsName, type Hex } from "@agentpassport/config";
import { encodeFunctionData } from "viem";
import { useAccount, useEnsName, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import {
  AGENT_POLICY_EXECUTOR_ABI,
  AGENT_TEXT_RECORD_KEYS,
  ENS_REGISTRY_ABI,
  PUBLIC_RESOLVER_ABI,
  ZERO_ADDRESS,
  type PolicyContractResult,
  nonZeroAddress
} from "../lib/contracts";
import { normalizeAddressInput } from "../lib/addressInput";
import { formatWeiAsEth, parseEthInputToWei } from "../lib/ethAmount";
import {
  mapAgentTextRecords,
  readImmediateOwnerName,
  type AgentTextReadResult
} from "../lib/agentSession";
import { normalizeEnsFormName, safeNamehash } from "../lib/ensPreview";
import { hashPolicyContractResult } from "../lib/policyProof";
import { readOwnerEnsAutofill } from "../lib/registerAgent";
import { buildEnsStatusWriteState, buildRevocationActionState } from "../lib/revokeAgent";
import { revocationFailureProof, type RelayerRetryResponse } from "../lib/revocationProof";
import {
  LAST_SIGNED_TASK_STORAGE_KEY,
  type StoredSignedTaskPayload,
  storedPayloadMatchesAgentNode,
  storedPayloadToRelayerBody
} from "../lib/taskDemo";
import { AgentLiveDataPanel } from "./AgentLiveDataPanel";
import { EnsProofPanel, shortenHex } from "./EnsProofPanel";
import { StatusBanner } from "./StatusBanner";

export type RevokeAgentPanelProps = {
  chainId: bigint;
  defaultAgentName: string;
  defaultOwnerName: string;
  ensRegistryAddress?: Hex | null;
  executorAddress?: Hex | null;
};

type OwnerDirectoryAgent = {
  agentAddress: Hex;
  agentName: string;
  agentNode: Hex;
  ownerName: string;
};

type OwnerAgentDirectoryResponse = {
  agents?: unknown;
  status?: string;
};

type GeneratedPolicyMetadataResponse = {
  policyHash?: Hex;
  policyUri?: string;
  status?: string;
};

type StatusMetadataWrite = {
  newPolicyUri: string;
  oldPolicyUri: string;
  txHash: Hex;
};

type AgentPolicyStatus = "active" | "disabled";

const AGENT_CAPABILITIES = ["task-log", "sponsored-execution"] as const;

/**
 * Demonstrates policy and ENS-record revocation, then retries the previous signed task intent.
 */
export function RevokeAgentPanel(props: RevokeAgentPanelProps) {
  const { address: connectedWallet } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: Number(props.chainId) });
  const [agentName, setAgentName] = useState(props.defaultAgentName);
  const [agentNameEdited, setAgentNameEdited] = useState(Boolean(props.defaultAgentName));
  const [ownerName, setOwnerName] = useState(props.defaultOwnerName);
  const [ownerNameEdited, setOwnerNameEdited] = useState(Boolean(props.defaultOwnerName));
  const [ownerAgents, setOwnerAgents] = useState<OwnerDirectoryAgent[]>([]);
  const [replacementAddress, setReplacementAddress] = useState<string>(ZERO_ADDRESS);
  const [withdrawAmountEth, setWithdrawAmountEth] = useState("");
  const [lastPayload, setLastPayload] = useState<StoredSignedTaskPayload | null>(null);
  const [statusMessage, setStatusMessage] = useState("Load or create a signed task before retrying revocation");
  const [failureProof, setFailureProof] = useState<string | null>(null);
  const [txHashes, setTxHashes] = useState<Hex[]>([]);
  const normalizedAgentName = useMemo(() => normalizeEnsFormName(agentName), [agentName]);
  const normalizedOwnerName = useMemo(() => normalizeEnsFormName(ownerName), [ownerName]);
  const agentNode = useMemo(() => safeNamehash(normalizedAgentName), [normalizedAgentName]);
  const ownerNode = useMemo(() => safeNamehash(normalizedOwnerName), [normalizedOwnerName]);
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
  const resolverRead = useReadContract({
    address: props.ensRegistryAddress ?? undefined,
    abi: ENS_REGISTRY_ABI,
    functionName: "resolver",
    args: [agentNode],
    query: { enabled: Boolean(props.ensRegistryAddress) }
  });
  const agentRegistryOwnerRead = useReadContract({
    address: props.ensRegistryAddress ?? undefined,
    abi: ENS_REGISTRY_ABI,
    functionName: "owner",
    args: [agentNode],
    query: { enabled: Boolean(props.ensRegistryAddress) }
  });
  const registryResolverAddress = nonZeroAddress(resolverRead.data as Hex | undefined);
  const resolverAddress = resolverRead.isSuccess ? registryResolverAddress : null;
  const agentRegistryOwner = nonZeroAddress(agentRegistryOwnerRead.data as Hex | undefined);
  const ensStatusWriteState = buildEnsStatusWriteState({
    connectedWallet: connectedWallet ?? null,
    registryOwner: agentRegistryOwner,
    resolverAddress,
    resolverLookupSettled: resolverRead.isSuccess || resolverRead.isError
  });
  const currentAgentAddress = useReadContract({
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
  const liveAgentAddress = nonZeroAddress(currentAgentAddress.data as Hex | undefined);
  const livePolicy = policyRead.data as PolicyContractResult | undefined;
  const livePolicyHash = hashPolicyContractResult({ agentNode, policy: livePolicy });
  const liveGasBudget = typeof gasBudgetRead.data === "bigint" ? gasBudgetRead.data : 0n;
  const liveNextNonce = typeof nextNonceRead.data === "bigint" ? nextNonceRead.data : null;
  const textRecords = useMemo(
    () => mapAgentTextRecords(textRecordReads.data as AgentTextReadResult[] | undefined),
    [textRecordReads.data]
  );
  const agentStatusText = textRecords.find((record) => record.key === "agent.status")?.value ?? null;
  const livePolicyUri = textRecords.find((record) => record.key === "agent.policy.uri")?.value ?? "";
  const revocationActionState = buildRevocationActionState({
    canWriteEnsStatus: ensStatusWriteState.canWrite,
    ensStatusBlocker: ensStatusWriteState.blocker,
    policyEnabled: livePolicy?.[7],
    statusText: agentStatusText
  });
  const displayRecoveredSigner = storedRecoveredSigner(lastPayload);
  /**
   * Keeps stale localStorage payloads from driving the active revocation proof surface.
   */
  const savedPayloadMatchesAgentNode = lastPayload ? storedPayloadMatchesAgentNode(lastPayload, agentNode) : false;
  const proofRecoveredSigner = savedPayloadMatchesAgentNode ? displayRecoveredSigner : null;
  const activeFailureProof = savedPayloadMatchesAgentNode ? failureProof : null;
  const proofStatus =
    activeFailureProof || (proofRecoveredSigner && liveAgentAddress && !sameAddress(proofRecoveredSigner, liveAgentAddress))
      ? "fail"
      : "unknown";

  useEffect(() => {
    setLastPayload(readLastPayload());
  }, []);

  useEffect(() => {
    if (ownerEnsAutofill) {
      setOwnerName(ownerEnsAutofill);
    }
  }, [ownerEnsAutofill]);

  useEffect(() => {
    const derivedOwnerName = readImmediateOwnerName(agentName);
    if (!ownerNameEdited && derivedOwnerName && ownerName !== derivedOwnerName) {
      setOwnerName(derivedOwnerName);
    }
  }, [agentName, ownerName, ownerNameEdited]);

  useEffect(() => {
    let cancelled = false;

    /**
     * Loads already registered agents for the selected owner ENS from the server-side verified directory.
     */
    async function lookupOwnerAgentDirectory() {
      if (!normalizedOwnerName.includes(".")) {
        setOwnerAgents([]);
        return;
      }

      const response = await fetch(`/api/agents?ownerName=${encodeURIComponent(normalizedOwnerName)}`);
      const body = (await response.json().catch(() => ({}))) as OwnerAgentDirectoryResponse;
      const agents =
        response.ok && body.status === "found" && Array.isArray(body.agents)
          ? body.agents.filter(isOwnerDirectoryAgent)
          : [];

      if (!cancelled) {
        setOwnerAgents(agents);
      }
    }

    lookupOwnerAgentDirectory().catch(() => {
      if (!cancelled) {
        setOwnerAgents([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [normalizedOwnerName]);

  useEffect(() => {
    if (!agentNameEdited && !agentName.trim() && ownerAgents.length > 0) {
      setAgentName(ownerAgents[0].agentName);
    }
  }, [agentName, agentNameEdited, ownerAgents]);

  /**
   * Updates the selected agent ENS; owner wallet reverse ENS is never copied into this field.
   */
  function handleAgentNameChange(event: ChangeEvent<HTMLInputElement>) {
    setAgentNameEdited(true);
    setAgentName(event.target.value);
  }

  /**
   * Marks owner ENS as manual while preserving the default immediate-parent autofill.
   */
  function handleOwnerNameChange(event: ChangeEvent<HTMLInputElement>) {
    setOwnerNameEdited(true);
    setOwnerName(event.target.value);
    if (!agentNameEdited) {
      setAgentName("");
    }
  }

  /**
   * Builds the validated agent node used by write transactions so invalid input cannot hit the ENS root.
   */
  function requireAgentNode(): Hex {
    if (!normalizedAgentName.includes(".")) {
      throw new Error("Agent ENS must be a complete ENS name");
    }
    return namehashEnsName(normalizedAgentName);
  }

  /**
   * Returns the live registry resolver for resolver writes after the lookup has settled.
   */
  function requireLiveResolverAddress(): Hex {
    if (!resolverRead.isSuccess) {
      throw new Error("Waiting for live resolver lookup");
    }
    if (!registryResolverAddress) {
      throw new Error("Resolver address is not configured");
    }
    return registryResolverAddress;
  }

  /**
   * Guards public resolver writes so wrapped names do not submit transactions that the resolver rejects.
   */
  function requireEnsStatusWrite(): Hex {
    if (ensStatusWriteState.blocker) {
      throw new Error(ensStatusWriteState.blocker);
    }

    return requireLiveResolverAddress();
  }

  /**
   * Pins a fresh policy/profile document for the requested public ENS status.
   */
  async function generatePolicyMetadata(status: AgentPolicyStatus): Promise<{ policyHash: Hex; policyUri: string }> {
    const policy = requireLivePolicy();
    const agentAddress = requireAddress(liveAgentAddress, "Agent ENS address is not configured");
    const executorAddress = requireAddress(props.executorAddress, "Executor address is not configured");
    const response = await fetch("/api/policy-metadata", {
      body: JSON.stringify({
        agentAddress,
        agentName: normalizedAgentName,
        agentNode,
        capabilities: AGENT_CAPABILITIES,
        chainId: props.chainId.toString(),
        executorAddress,
        expiresAt: policy[6].toString(),
        maxGasReimbursementWei: policy[5].toString(),
        maxValueWei: policy[4].toString(),
        ownerName: normalizedOwnerName,
        ownerNode,
        status,
        target: policy[2]
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
   * Writes status, policy URI, and policy hash together so ENS metadata and pinned JSON stay in sync.
   */
  async function writeAgentStatusMetadata(status: AgentPolicyStatus): Promise<StatusMetadataWrite> {
    const writeAgentNode = requireAgentNode();
    const generatedPolicy = await generatePolicyMetadata(status);
    const resolver = requireEnsStatusWrite();

    const txHash = await writeContractAsync({
      address: resolver,
      abi: PUBLIC_RESOLVER_ABI,
      functionName: "multicall",
      args: [
        [
          encodeFunctionData({
            abi: PUBLIC_RESOLVER_ABI,
            functionName: "setText",
            args: [writeAgentNode, "agent.status", status]
          }),
          encodeFunctionData({
            abi: PUBLIC_RESOLVER_ABI,
            functionName: "setText",
            args: [writeAgentNode, "agent.policy.uri", generatedPolicy.policyUri]
          }),
          encodeFunctionData({
            abi: PUBLIC_RESOLVER_ABI,
            functionName: "setText",
            args: [writeAgentNode, "agent.policy.hash", generatedPolicy.policyHash]
          })
        ]
      ]
    });

    return {
      newPolicyUri: generatedPolicy.policyUri,
      oldPolicyUri: livePolicyUri,
      txHash
    };
  }

  /**
   * Best-effort cleanup for the previous Pinata CID after ENS has moved to a replacement URI.
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
   * Returns the live executor policy tuple needed to regenerate policy JSON.
   */
  function requireLivePolicy(): PolicyContractResult {
    if (!livePolicy) {
      throw new Error("Policy state is not loaded");
    }

    return livePolicy;
  }

  /**
   * Disables the policy in AgentPolicyExecutor so new and old intents are blocked.
   */
  async function handleRevokePolicy() {
    try {
      if (revocationActionState.blocker) {
        throw new Error(revocationActionState.blocker);
      }
      const executorAddress = requireAddress(props.executorAddress, "Executor address is not configured");
      const writeAgentNode = requireAgentNode();
      const statusWrite = revocationActionState.shouldWriteEnsStatus
        ? await writeAgentStatusMetadata("disabled")
        : null;
      if (statusWrite) {
        if (!publicClient) {
          throw new Error("Sepolia public client is not ready");
        }
        await publicClient.waitForTransactionReceipt({ hash: statusWrite.txHash });
        await unpinOldPolicyMetadata(statusWrite.oldPolicyUri, statusWrite.newPolicyUri);
      }
      const policyTxHash = await writeContractAsync({
        address: executorAddress,
        abi: AGENT_POLICY_EXECUTOR_ABI,
        functionName: "revokePolicy",
        args: [writeAgentNode]
      });
      setTxHashes((hashes) => [...hashes, ...[statusWrite?.txHash, policyTxHash].filter(Boolean) as Hex[]]);
      setStatusMessage("Policy revocation and ENS status disable transactions submitted");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Policy revocation failed");
    }
  }

  /**
   * Withdraws unused gas budget to the owner wallet that submits the transaction.
   */
  async function handleWithdrawGasBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const executorAddress = requireAddress(props.executorAddress, "Executor address is not configured");
      const writeAgentNode = requireAgentNode();
      const withdrawAmountWei = parseEthInputToWei(withdrawAmountEth);
      if (withdrawAmountWei === 0n) {
        throw new Error("Enter a withdrawal amount");
      }
      const txHash = await writeContractAsync({
        address: executorAddress,
        abi: AGENT_POLICY_EXECUTOR_ABI,
        functionName: "withdrawGasBudget",
        args: [writeAgentNode, withdrawAmountWei]
      });
      setTxHashes((hashes) => [...hashes, txHash]);
      setStatusMessage("Withdraw gas budget transaction submitted");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Gas budget withdrawal failed");
    }
  }

  /**
   * Copies the live budget into the withdrawal input when the owner wants to close the budget.
   */
  function handleUseMaxGasBudget() {
    setWithdrawAmountEth(formatWeiAsEth(liveGasBudget).replace(/ ETH$/u, ""));
  }

  /**
   * Publishes agent.status=disabled for the public ENS metadata surface.
   */
  async function handleSetStatusDisabled() {
    try {
      const statusWrite = await writeAgentStatusMetadata("disabled");
      if (!publicClient) {
        throw new Error("Sepolia public client is not ready");
      }
      await publicClient.waitForTransactionReceipt({ hash: statusWrite.txHash });
      await unpinOldPolicyMetadata(statusWrite.oldPolicyUri, statusWrite.newPolicyUri);
      setTxHashes((hashes) => [...hashes, statusWrite.txHash]);
      setStatusMessage("Set status disabled and policy metadata transaction submitted");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Status update failed");
    }
  }

  /**
   * Changes addr(agentNode), which invalidates signatures from the previous ENS-published signer.
   */
  async function handleUpdateAddrRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const resolver = requireLiveResolverAddress();
      const writeAgentNode = requireAgentNode();
      const normalizedReplacementAddress = normalizeAddressInput(replacementAddress);
      if (!normalizedReplacementAddress) {
        throw new Error("Enter a valid replacement address");
      }
      const txHash = await writeContractAsync({
        address: resolver,
        abi: PUBLIC_RESOLVER_ABI,
        functionName: "setAddr",
        args: [writeAgentNode, normalizedReplacementAddress]
      });
      setTxHashes((hashes) => [...hashes, txHash]);
      setStatusMessage("Update addr record transaction submitted");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Address update failed");
    }
  }

  /**
   * Replays the previous relayer request so the UI can show the old signature failing after revocation.
   */
  async function handleRetryLastPayload() {
    const payload = lastPayload ?? readLastPayload();
    setLastPayload(payload);
    if (!payload) {
      setStatusMessage("No saved signed payload found");
      return;
    }
    if (!storedPayloadMatchesAgentNode(payload, agentNode)) {
      setFailureProof(null);
      setStatusMessage("Saved payload belongs to a different agent");
      return;
    }

    try {
      const response = await fetch("/api/relayer/execute", {
        body: JSON.stringify(storedPayloadToRelayerBody(payload)),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const body = (await response.json().catch(() => ({}))) as RelayerRetryResponse;
      if (response.ok && body.status === "submitted" && body.txHash) {
        setFailureProof(null);
        setStatusMessage(`Retry unexpectedly submitted: ${body.txHash}`);
        return;
      }
      const proof = revocationFailureProof(body);
      if (proof) {
        setFailureProof(proof);
        setStatusMessage("Failure proof captured");
        return;
      }
      setFailureProof(null);
      setStatusMessage(`Not a revocation proof: ${body.details ?? body.error ?? response.statusText}`);
    } catch (error) {
      const details = error instanceof Error ? error.message : "Retry request failed";
      setFailureProof(null);
      setStatusMessage(`Not a revocation proof: ${details}`);
    }
  }

  return (
    <>
      <section className="register-form" aria-labelledby="revoke-title">
        <div className="register-form__section">
          <div className="section-heading">
            <p>Revoke</p>
            <h2 id="revoke-title">Revocation controls</h2>
          </div>
          <div className="field-grid">
            <label>
              <span>Agent ENS</span>
              <input list="owner-agent-options" name="agentName" onChange={handleAgentNameChange} value={agentName} />
              <datalist id="owner-agent-options">
                {ownerAgents.map((agent) => (
                  <option key={agent.agentNode} value={agent.agentName} />
                ))}
              </datalist>
              {ownerAgents.length > 0 ? (
                <small className="field-help">Registered agent: {ownerAgents[0].agentName}</small>
              ) : null}
            </label>
            <label>
              <span>Owner ENS</span>
              <input name="ownerName" onChange={handleOwnerNameChange} value={ownerName} />
            </label>
            <label>
              <span>Current agent address</span>
              <input readOnly title={liveAgentAddress ?? undefined} value={liveAgentAddress ?? "Unknown"} />
            </label>
            <label>
              <span>Agent registry owner</span>
              <input readOnly title={agentRegistryOwner ?? undefined} value={agentRegistryOwner ?? "Unknown"} />
            </label>
            <label>
              <span>Policy enabled</span>
              <input readOnly value={livePolicy?.[7] === false ? "Disabled" : livePolicy?.[7] ? "Enabled" : "Unknown"} />
            </label>
          </div>
        </div>

        <div className="register-form__section">
          <div className="section-heading">
            <p>Policy</p>
            <h2>Disable executor policy</h2>
          </div>
          <div className="register-form__actions register-form__actions--flush">
            <button disabled={!revocationActionState.canRevoke} onClick={handleRevokePolicy} type="button">
              Revoke policy
            </button>
            <button disabled={!ensStatusWriteState.canWrite} onClick={handleSetStatusDisabled} type="button">
              Set status disabled
            </button>
          </div>
          {revocationActionState.blocker ? (
            <small className="field-help field-help--warning">{revocationActionState.blocker}</small>
          ) : null}
        </div>

        <form className="register-form__section" onSubmit={handleWithdrawGasBudget}>
          <div className="section-heading">
            <p>Budget</p>
            <h2>Withdraw gas budget</h2>
          </div>
          <div className="field-grid">
            <label>
              <span>Available gas budget</span>
              <input readOnly value={formatWeiAsEth(liveGasBudget)} />
            </label>
            <label>
              <span>
                Withdraw amount ETH
                <button className="inline-field-action" onClick={handleUseMaxGasBudget} type="button">Max</button>
              </span>
              <input
                inputMode="decimal"
                name="withdrawAmountEth"
                onChange={(event) => setWithdrawAmountEth(event.target.value)}
                value={withdrawAmountEth}
              />
            </label>
            <label>
              <span>Owner receives</span>
              <input readOnly title={connectedWallet ?? undefined} value={connectedWallet ?? "Connect owner wallet"} />
            </label>
          </div>
          <div className="register-form__actions register-form__actions--flush">
            <button type="submit">Withdraw gas budget</button>
          </div>
        </form>

        <form className="register-form__section" onSubmit={handleUpdateAddrRecord}>
          <div className="section-heading">
            <p>ENS</p>
            <h2>Update addr record</h2>
          </div>
          <div className="field-grid">
            <label>
              <span>Replacement agent address</span>
              <input
                name="replacementAddress"
                onChange={(event) => setReplacementAddress(event.target.value)}
                value={replacementAddress}
              />
            </label>
          </div>
          <div className="register-form__actions register-form__actions--flush">
            <button type="submit">Update addr record</button>
          </div>
        </form>

        <div className="register-form__section">
          <div className="section-heading">
            <p>Retry</p>
            <h2>Retry last signed payload</h2>
          </div>
          <dl className="fact-grid">
            <PreviewRow label="Saved agent" value={lastPayload?.agentName ?? "No saved payload"} />
            <PreviewRow label="Saved nonce" value={lastPayload?.intent?.nonce ?? "Unknown"} />
            <PreviewRow label="Recovered signer" title={displayRecoveredSigner ?? undefined} value={formatNullableHex(displayRecoveredSigner)} />
            <PreviewRow label="Failure proof" value={activeFailureProof ?? "Not retried"} />
          </dl>
          <div className="register-form__actions register-form__actions--flush">
            <button onClick={handleRetryLastPayload} type="button">Retry last signed payload</button>
          </div>
          <StatusBanner
            details={activeFailureProof ?? "Waiting for revocation data, saved payload, and live resolver reads."}
            message={statusMessage}
            title="Revocation status"
            variant={statusMessage.startsWith("Revocation proof") ? "success" : statusMessage.includes("failed") ? "error" : "idle"}
          />
        </div>

        {txHashes.length > 0 ? (
          <div className="transaction-result" aria-label="Revocation submitted transactions">
            <span>Revocation transactions</span>
            {txHashes.map((hash) => (
              <code key={hash}>{hash}</code>
            ))}
          </div>
        ) : null}
      </section>

      <div className="detail-grid">
        <AgentLiveDataPanel
          agentAddress={liveAgentAddress}
          agentName={agentName}
          connectedWallet={connectedWallet ?? null}
          gasBudgetWei={liveGasBudget}
          isReverseEnsSettled={!connectedWallet || ownerReverseName.isSuccess || ownerReverseName.isError}
          nextNonce={nextNonceRead.isSuccess ? liveNextNonce : null}
          policy={livePolicy}
          policyHash={livePolicyHash}
          resolverAddress={resolverAddress}
          reverseEnsName={ownerReverseName.data ?? null}
          textRecords={textRecords}
        />
        <EnsProofPanel
          agentName={agentName}
          agentNode={agentNode}
          authorizationStatus={proofStatus}
          ensAgentAddress={liveAgentAddress}
          failureReason={activeFailureProof ?? undefined}
          gasBudgetWei={liveGasBudget}
          ownerName={ownerName}
          ownerNode={ownerNode}
          policyEnabled={livePolicy?.[7]}
          policyHash={livePolicyHash}
          recoveredSigner={proofRecoveredSigner}
          resolverAddress={resolverAddress}
        />
      </div>
    </>
  );
}

/**
 * Renders one compact revocation fact.
 */
function PreviewRow(props: { label: string; title?: string; value: string }) {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd title={props.title}>{props.value}</dd>
    </div>
  );
}

function readLastPayload(): StoredSignedTaskPayload | null {
  try {
    const value = localStorage.getItem(LAST_SIGNED_TASK_STORAGE_KEY);
    return value ? (JSON.parse(value) as StoredSignedTaskPayload) : null;
  } catch {
    return null;
  }
}

function formatNullableHex(value?: Hex | null): string {
  return value ? shortenHex(value) : "Unknown";
}

function storedRecoveredSigner(payload: StoredSignedTaskPayload | null): Hex | null {
  const recoveredSigner = (payload as { recoveredSigner?: unknown } | null)?.recoveredSigner;
  if (typeof recoveredSigner !== "string") {
    return null;
  }
  return normalizeAddressInput(recoveredSigner);
}

/**
 * Narrows untrusted directory API entries before they become input suggestions.
 */
function isOwnerDirectoryAgent(value: unknown): value is OwnerDirectoryAgent {
  const agent = value as Partial<OwnerDirectoryAgent> | null;
  return Boolean(
    agent &&
      typeof agent.agentAddress === "string" &&
      typeof agent.agentName === "string" &&
      typeof agent.agentNode === "string" &&
      typeof agent.ownerName === "string"
  );
}

function requireAddress(value: Hex | null | undefined, message: string): Hex {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function sameAddress(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
