"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { namehashEnsName, type Hex } from "@agentpassport/config";
import { useReadContract, useWriteContract } from "wagmi";
import {
  AGENT_POLICY_EXECUTOR_ABI,
  ENS_REGISTRY_ABI,
  PUBLIC_RESOLVER_ABI,
  ZERO_ADDRESS,
  type PolicyContractResult,
  nonZeroAddress
} from "../lib/contracts";
import { normalizeAddressInput } from "../lib/addressInput";
import { normalizeEnsFormName, safeNamehash } from "../lib/ensPreview";
import { hashPolicyContractResult } from "../lib/policyProof";
import {
  LAST_SIGNED_TASK_STORAGE_KEY,
  type StoredSignedTaskPayload,
  storedPayloadMatchesAgentNode,
  storedPayloadToRelayerBody
} from "../lib/taskDemo";
import { EnsProofPanel, shortenHex } from "./EnsProofPanel";

export type RevokeAgentPanelProps = {
  defaultAgentName: string;
  defaultOwnerName: string;
  ensRegistryAddress?: Hex | null;
  executorAddress?: Hex | null;
};

type RelayerRetryResponse = {
  details?: string;
  error?: string;
  status?: string;
  txHash?: Hex;
};

/**
 * Demonstrates policy and ENS-record revocation, then retries the previous signed task intent.
 */
export function RevokeAgentPanel(props: RevokeAgentPanelProps) {
  const { writeContractAsync } = useWriteContract();
  const [agentName, setAgentName] = useState(props.defaultAgentName);
  const [ownerName, setOwnerName] = useState(props.defaultOwnerName);
  const [replacementAddress, setReplacementAddress] = useState<string>(ZERO_ADDRESS);
  const [lastPayload, setLastPayload] = useState<StoredSignedTaskPayload | null>(null);
  const [statusMessage, setStatusMessage] = useState("Load or create a signed task before retrying revocation");
  const [failureProof, setFailureProof] = useState<string | null>(null);
  const [txHashes, setTxHashes] = useState<Hex[]>([]);
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
  const registryResolverAddress = nonZeroAddress(resolverRead.data as Hex | undefined);
  const resolverAddress = resolverRead.isSuccess ? registryResolverAddress : null;
  const currentAgentAddress = useReadContract({
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
  const liveAgentAddress = nonZeroAddress(currentAgentAddress.data as Hex | undefined);
  const livePolicy = policyRead.data as PolicyContractResult | undefined;
  const livePolicyHash = hashPolicyContractResult({ agentNode, policy: livePolicy });
  const liveGasBudget = typeof gasBudgetRead.data === "bigint" ? gasBudgetRead.data : 0n;
  /**
   * Keeps stale localStorage payloads from driving the active revocation proof surface.
   */
  const savedPayloadMatchesAgentNode = lastPayload ? storedPayloadMatchesAgentNode(lastPayload, agentNode) : false;
  const proofRecoveredSigner = savedPayloadMatchesAgentNode ? lastPayload?.recoveredSigner ?? null : null;
  const activeFailureProof = savedPayloadMatchesAgentNode ? failureProof : null;
  const proofStatus =
    activeFailureProof || (proofRecoveredSigner && liveAgentAddress && !sameAddress(proofRecoveredSigner, liveAgentAddress))
      ? "fail"
      : "unknown";

  useEffect(() => {
    setLastPayload(readLastPayload());
  }, []);

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
   * Disables the policy in AgentPolicyExecutor so new and old intents are blocked.
   */
  async function handleRevokePolicy() {
    try {
      const executorAddress = requireAddress(props.executorAddress, "Executor address is not configured");
      const writeAgentNode = requireAgentNode();
      const txHash = await writeContractAsync({
        address: executorAddress,
        abi: AGENT_POLICY_EXECUTOR_ABI,
        functionName: "revokePolicy",
        args: [writeAgentNode]
      });
      setTxHashes((hashes) => [...hashes, txHash]);
      setStatusMessage("Revoke policy transaction submitted");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Policy revocation failed");
    }
  }

  /**
   * Publishes agent.status=revoked for the public ENS metadata surface.
   */
  async function handleSetStatusRevoked() {
    try {
      const resolver = requireLiveResolverAddress();
      const writeAgentNode = requireAgentNode();
      const txHash = await writeContractAsync({
        address: resolver,
        abi: PUBLIC_RESOLVER_ABI,
        functionName: "setText",
        args: [writeAgentNode, "agent.status", "revoked"]
      });
      setTxHashes((hashes) => [...hashes, txHash]);
      setStatusMessage("Set status revoked transaction submitted");
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
      const details = body.details ?? body.error ?? response.statusText;
      setFailureProof(details || "Relayer rejected the old signed payload");
      setStatusMessage("Failure proof captured");
    } catch (error) {
      const details = error instanceof Error ? error.message : "Retry request failed";
      setFailureProof(details);
      setStatusMessage("Failure proof captured");
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
              <input name="agentName" onChange={(event) => setAgentName(event.target.value)} value={agentName} />
            </label>
            <label>
              <span>Owner ENS</span>
              <input name="ownerName" onChange={(event) => setOwnerName(event.target.value)} value={ownerName} />
            </label>
            <label>
              <span>Current agent address</span>
              <input readOnly title={liveAgentAddress ?? undefined} value={liveAgentAddress ?? "Unknown"} />
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
            <button onClick={handleRevokePolicy} type="button">Revoke policy</button>
            <button onClick={handleSetStatusRevoked} type="button">Set status revoked</button>
          </div>
        </div>

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
            <PreviewRow label="Saved nonce" value={lastPayload?.intent.nonce ?? "Unknown"} />
            <PreviewRow label="Recovered signer" title={lastPayload?.recoveredSigner ?? undefined} value={formatNullableHex(lastPayload?.recoveredSigner)} />
            <PreviewRow label="Failure proof" value={activeFailureProof ?? "Not retried"} />
          </dl>
          <div className="register-form__actions register-form__actions--flush">
            <button onClick={handleRetryLastPayload} type="button">Retry last signed payload</button>
            <strong>{statusMessage}</strong>
          </div>
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

function requireAddress(value: Hex | null | undefined, message: string): Hex {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function sameAddress(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
