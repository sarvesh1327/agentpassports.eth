"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Hex } from "@agentpassport/config";
import { encodeFunctionData } from "viem";
import { usePublicClient, useReadContract, useSendTransaction } from "wagmi";
import {
  ENS_REGISTRY_ABI,
  NAME_WRAPPER_ABI,
  PUBLIC_RESOLVER_ABI,
  nonZeroAddress
} from "../lib/contracts";
import { buildAgentDeletePlan } from "../lib/agentDelete";
import { OWNER_INDEX_AGENTS_KEY, parseOwnerAgentIndex } from "../lib/ownerIndex";
import type { SerializableAgentProfile } from "../lib/demoProfile";
import { StatusBanner } from "./StatusBanner";
import { shortenHex } from "./EnsProofPanel";
import { UiIcon } from "./icons/UiIcons";
import { TransactionProgressModal, type TransactionProgressStep } from "./TransactionProgressModal";

type AgentManagementPanelProps = {
  gasBudgetWei: bigint;
  initialProfile: SerializableAgentProfile;
  liveAgentAddress: Hex | null;
  onDeleted: () => void;
  onRefresh: () => Promise<void>;
  policyEnabled?: boolean;
  resolverAddress: Hex | null;
};

type GeneratedPolicyMetadataResponse = {
  policyHash?: Hex;
  policyUri?: string;
  status?: string;
};

/**
 * Provides reversible owner management actions for an ENS-backed agent passport.
 */
export function AgentManagementPanel(props: AgentManagementPanelProps) {
  const publicClient = usePublicClient({ chainId: Number(props.initialProfile.chainId) });
  const { sendTransactionAsync } = useSendTransaction();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("Management actions are ready when ENS and executor addresses are configured.");
  const [policyUri, setPolicyUri] = useState(props.initialProfile.policyUri);
  const [signerAddress, setSignerAddress] = useState(props.liveAgentAddress ?? "");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteProgressSteps, setDeleteProgressSteps] = useState<TransactionProgressStep[]>([]);
  const [isDeleteProgressOpen, setIsDeleteProgressOpen] = useState(false);

  const ownerResolver = useReadContract({
    address: props.initialProfile.ensRegistryAddress ?? undefined,
    abi: ENS_REGISTRY_ABI,
    functionName: "resolver",
    args: [props.initialProfile.ownerNode],
    query: { enabled: Boolean(props.initialProfile.ensRegistryAddress) }
  });
  const ownerResolverAddress = ownerResolver.isSuccess ? nonZeroAddress(ownerResolver.data as Hex | undefined) : null;
  const ownerAgentIndex = useReadContract({
    address: ownerResolverAddress ?? undefined,
    abi: PUBLIC_RESOLVER_ABI,
    functionName: "text",
    args: [props.initialProfile.ownerNode, OWNER_INDEX_AGENTS_KEY],
    query: { enabled: Boolean(ownerResolverAddress) }
  });
  const registryOwner = useReadContract({
    address: props.initialProfile.ensRegistryAddress ?? undefined,
    abi: ENS_REGISTRY_ABI,
    functionName: "owner",
    args: [props.initialProfile.ownerNode],
    query: { enabled: Boolean(props.initialProfile.ensRegistryAddress) }
  });
  const registryOwnerAddress = nonZeroAddress(registryOwner.data as Hex | undefined);
  const ownerIsWrapped = Boolean(
    registryOwnerAddress &&
      props.initialProfile.nameWrapperAddress &&
      registryOwnerAddress.toLowerCase() === props.initialProfile.nameWrapperAddress.toLowerCase()
  );
  useReadContract({
    address: props.initialProfile.nameWrapperAddress ?? undefined,
    abi: NAME_WRAPPER_ABI,
    functionName: "ownerOf",
    args: [BigInt(props.initialProfile.ownerNode)],
    query: { enabled: ownerIsWrapped }
  });
  const agentRegistryOwner = useReadContract({
    address: props.initialProfile.ensRegistryAddress ?? undefined,
    abi: ENS_REGISTRY_ABI,
    functionName: "owner",
    args: [props.initialProfile.agentNode],
    query: { enabled: Boolean(props.initialProfile.ensRegistryAddress) }
  });
  const agentRegistryOwnerAddress = nonZeroAddress(agentRegistryOwner.data as Hex | undefined);
  const agentIsWrapped = Boolean(
    agentRegistryOwnerAddress &&
      props.initialProfile.nameWrapperAddress &&
      agentRegistryOwnerAddress.toLowerCase() === props.initialProfile.nameWrapperAddress.toLowerCase()
  );

  const ownerAgentLabels = parseOwnerAgentIndex(typeof ownerAgentIndex.data === "string" ? ownerAgentIndex.data : "");
  const deletePlan = useMemo(
    () =>
      buildAgentDeletePlan({
        agentLabel: props.initialProfile.agentLabel,
        agentNode: props.initialProfile.agentNode,
        ensRegistryAddress: props.initialProfile.ensRegistryAddress,
        executorAddress: props.initialProfile.executorAddress,
        gasBudgetWei: props.gasBudgetWei,
        isAgentWrapped: agentIsWrapped,
        isOwnerWrapped: ownerIsWrapped,
        ownerAgentLabels,
        ownerNode: props.initialProfile.ownerNode,
        ownerResolverAddress
      }),
    [
      ownerAgentLabels,
      ownerIsWrapped,
      ownerResolverAddress,
      agentIsWrapped,
      props.initialProfile.agentLabel,
      props.initialProfile.agentNode,
      props.initialProfile.ensRegistryAddress,
      props.initialProfile.executorAddress,
      props.initialProfile.ownerNode,
      props.gasBudgetWei
    ]
  );

  useEffect(() => {
    setSignerAddress(props.liveAgentAddress ?? "");
  }, [props.liveAgentAddress]);

  async function runManagementAction(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      setDeleteProgressSteps((steps) => markActiveDeleteStepError(steps));
      setStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "Management action failed.");
    }
  }

  async function sendManagementCall(input: { data: Hex; label: string; to?: Hex | null; value?: bigint }) {
    if (!input.to) {
      throw new Error(`${input.label} target is not configured`);
    }

    setStatus("loading");
    setStatusMessage(`Awaiting wallet approval for ${input.label}`);
    const hash = await sendTransactionAsync({ data: input.data, to: input.to, value: input.value });
    if (publicClient) {
      await publicClient.waitForTransactionReceipt({ hash });
    }
    await props.onRefresh();
    setStatus("success");
    setStatusMessage(`${input.label} transaction confirmed`);
  }

  async function handleStatusWrite(nextStatus: "active" | "disabled") {
    await sendManagementCall({
      data: encodeFunctionData({
        abi: PUBLIC_RESOLVER_ABI,
        functionName: "setText",
        args: [props.initialProfile.agentNode, "agent.status", nextStatus]
      }),
      label: nextStatus === "active" ? "Enable policy" : "Disable policy",
      to: props.resolverAddress
    });
  }

  async function handlePolicyMetadataSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const generatedPolicy = await generatePolicyMetadata();
    await sendManagementCall({
      data: encodeFunctionData({
        abi: PUBLIC_RESOLVER_ABI,
        functionName: "multicall",
        args: [[
          encodeFunctionData({
            abi: PUBLIC_RESOLVER_ABI,
            functionName: "setText",
            args: [props.initialProfile.agentNode, "agent.policy.uri", generatedPolicy.policyUri]
          }),
          encodeFunctionData({
            abi: PUBLIC_RESOLVER_ABI,
            functionName: "setText",
            args: [props.initialProfile.agentNode, "agent.policy.hash", generatedPolicy.policyHash]
          })
        ]]
      }),
      label: "Edit policy metadata",
      to: props.resolverAddress
    });
    await unpinOldPolicyMetadata(policyUri, generatedPolicy.policyUri);
    setPolicyUri(generatedPolicy.policyUri);
  }

  async function handleSignerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^0x[0-9a-fA-F]{40}$/u.test(signerAddress)) {
      setStatus("error");
      setStatusMessage("Enter a valid signer address before updating ENS addr(agent).");
      return;
    }

    await sendManagementCall({
      data: encodeFunctionData({
        abi: PUBLIC_RESOLVER_ABI,
        functionName: "setAddr",
        args: [props.initialProfile.agentNode, signerAddress as Hex]
      }),
      label: "Update signer address",
      to: props.resolverAddress
    });
  }

  async function handleDelete() {
    if (deleteConfirmation !== props.initialProfile.agentName) {
      setStatus("error");
      setStatusMessage("Type the full agent ENS name to confirm deletion.");
      return;
    }

    if (!deletePlan.canDelete) {
      setStatus("error");
      setStatusMessage(deletePlan.reason ?? "Delete is not available for this agent.");
      return;
    }

    setStatus("loading");
    setStatusMessage("Awaiting wallet approval for Delete agent");
    setDeleteProgressSteps(deletePlan.calls.map((call) => ({
      description: describeDeleteCall(call.label),
      label: readableDeleteCallLabel(call.label),
      status: "pending"
    })));
    setIsDeleteProgressOpen(true);

    for (const [index, call] of deletePlan.calls.entries()) {
      setDeleteProgressSteps((steps) => updateDeleteProgressStep(steps, index, {
        description: "Open your wallet and approve this transaction.",
        status: "active"
      }));
      const hash = await sendTransactionAsync({ data: call.data, to: call.to });
      setDeleteProgressSteps((steps) => updateDeleteProgressStep(steps, index, {
        description: "Transaction submitted. Waiting for confirmation.",
        hash,
        status: "active"
      }));
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      setDeleteProgressSteps((steps) => updateDeleteProgressStep(steps, index, {
        description: "Transaction confirmed onchain.",
        hash,
        status: "complete"
      }));
    }
    await props.onRefresh();
    setStatus("success");
    setStatusMessage("Delete agent transactions confirmed. Historical task history remains visible.");
    props.onDeleted();
  }

  async function generatePolicyMetadata(): Promise<{ policyHash: Hex; policyUri: string }> {
    const response = await fetch("/api/policy-metadata", {
      body: JSON.stringify({
        agentAddress: props.liveAgentAddress,
        agentName: props.initialProfile.agentName,
        agentNode: props.initialProfile.agentNode,
        capabilities: props.initialProfile.capabilities,
        chainId: props.initialProfile.chainId,
        executorAddress: props.initialProfile.executorAddress,
        expiresAt: props.initialProfile.policyExpiresAt,
        maxGasReimbursementWei: props.initialProfile.maxGasReimbursementWei,
        maxValueWei: props.initialProfile.maxValueWei,
        ownerName: props.initialProfile.ownerName,
        ownerNode: props.initialProfile.ownerNode,
        status: props.policyEnabled === false ? "disabled" : "active",
        target: props.initialProfile.taskLogAddress
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    const body = (await response.json().catch(() => ({}))) as GeneratedPolicyMetadataResponse;

    if (!response.ok || body.status !== "pinned" || !body.policyUri || !body.policyHash) {
      throw new Error("Policy metadata Pinata upload failed");
    }

    return { policyHash: body.policyHash, policyUri: body.policyUri };
  }

  async function unpinOldPolicyMetadata(oldPolicyUri: string, newPolicyUri: string): Promise<void> {
    if (!oldPolicyUri.trim() || oldPolicyUri.trim() === newPolicyUri.trim()) {
      return;
    }

    await fetch("/api/policy-metadata", {
      body: JSON.stringify({ policyUri: oldPolicyUri }),
      headers: { "content-type": "application/json" },
      method: "DELETE"
    }).catch(() => undefined);
  }

  return (
    <>
      <TransactionProgressModal
        isOpen={isDeleteProgressOpen}
        onClose={() => setIsDeleteProgressOpen(false)}
        steps={deleteProgressSteps}
        title="Delete agent transactions"
      />
      <section className="management-panel" aria-labelledby="agent-management-status-title">
        <div className="management-panel__header">
          <h2 id="agent-management-status-title">Agent management</h2>
          <StatusBanner
            details={`Resolver ${props.resolverAddress ? shortenHex(props.resolverAddress) : "not configured"}`}
            message={statusMessage}
            title="Management status"
            variant={status}
          />
        </div>

        <div className="management-panel__grid">
          <section aria-labelledby="agent-management-policy-status-title">
            <h3 id="agent-management-policy-status-title">Disable policy</h3>
            <p>Current policy status: {props.policyEnabled ? "enabled" : "disabled or unknown"}</p>
            <div className="management-panel__actions">
              <button type="button" onClick={() => void runManagementAction(() => handleStatusWrite("disabled"))}>Disable policy</button>
              <button className="action-button action-button--secondary" type="button" onClick={() => void runManagementAction(() => handleStatusWrite("active"))}>Enable policy</button>
            </div>
          </section>

          <form onSubmit={(event) => void runManagementAction(() => handlePolicyMetadataSubmit(event))}>
            <h3 id="agent-management-policy-title">Edit policy metadata <span className="sr-only">Policy metadata</span></h3>
            <label>
              <span>Policy URI</span>
              <input aria-label="Policy URI" readOnly value={policyUri || "Generated on save"} />
            </label>
            <button type="submit">Regenerate policy metadata</button>
          </form>

          <form onSubmit={(event) => void runManagementAction(() => handleSignerSubmit(event))}>
            <h3>Update signer address</h3>
            <label>
              <span>ENS addr(agent)</span>
              <input aria-label="ENS addr(agent)" value={signerAddress} onChange={(event) => setSignerAddress(event.target.value)} />
            </label>
            <button type="submit">Update signer address</button>
          </form>
        </div>
      </section>

      <section className="agent-delete-band" aria-labelledby="agent-management-delete-title" id="agent-management-title">
        <div className="agent-delete-band__copy">
          <span className="agent-delete-band__icon" aria-hidden="true"><UiIcon name="warning" size={34} /></span>
          <div>
            <h2 id="agent-management-delete-title">Delete agent</h2>
            <p>This will permanently remove the agent's subname and dashboard index.</p>
            <p>Remaining gas budget is withdrawn to the owner manager before deletion.</p>
            <p>Task history remains on-chain and cannot be deleted.</p>
          </div>
        </div>

        <div className="agent-delete-band__confirm">
          {deletePlan.canDelete ? (
            <>
              <label>
                <span>To confirm, type {props.initialProfile.agentName}</span>
                <input
                  aria-label={`Type ${props.initialProfile.agentName} to confirm deletion`}
                  placeholder={props.initialProfile.agentName}
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                />
              </label>
              <button type="button" className="agent-delete-band__button" onClick={() => void runManagementAction(handleDelete)}>
                <UiIcon name="trash" size={18} /> Delete agent
              </button>
            </>
          ) : (
            <p className="field-help field-help--warning">{deletePlan.reason}</p>
          )}
        </div>
      </section>
    </>
  );
}

function readableDeleteCallLabel(label: string): string {
  switch (label) {
    case "withdrawGasBudget":
      return "Withdraw remaining gas budget";
    case "deleteSubname":
      return "Delete agent ENS subname";
    case "setOwnerIndex":
      return "Update owner dashboard index";
    default:
      return label;
  }
}

function describeDeleteCall(label: string): string {
  switch (label) {
    case "withdrawGasBudget":
      return "Returns the executor-held gas budget before ENS records are removed.";
    case "deleteSubname":
      return "Clears the agent subname owner and resolver in the ENS registry.";
    case "setOwnerIndex":
      return "Removes the agent label from the owner ENS dashboard index.";
    default:
      return "Wallet transaction required for deletion.";
  }
}

function updateDeleteProgressStep(
  steps: TransactionProgressStep[],
  targetIndex: number,
  patch: Partial<TransactionProgressStep>
): TransactionProgressStep[] {
  return steps.map((step, index) => {
    if (index < targetIndex) {
      return { ...step, status: "complete" };
    }

    return index === targetIndex ? { ...step, ...patch } : step;
  });
}

function markActiveDeleteStepError(steps: TransactionProgressStep[]): TransactionProgressStep[] {
  if (steps.length === 0) {
    return steps;
  }

  const activeIndex = steps.findIndex((step) => step.status === "active");
  const errorIndex = activeIndex >= 0 ? activeIndex : steps.findLastIndex((step) => step.status !== "complete");
  return steps.map((step, index) => index === errorIndex ? { ...step, status: "error" } : step);
}
