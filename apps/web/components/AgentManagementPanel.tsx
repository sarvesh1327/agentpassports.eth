"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import type { Hex } from "@agentpassport/config";
import { encodeFunctionData } from "viem";
import { useReadContract, useSendTransaction } from "wagmi";
import {
  AGENT_POLICY_EXECUTOR_ABI,
  ENS_REGISTRY_ABI,
  NAME_WRAPPER_ABI,
  PUBLIC_RESOLVER_ABI,
  nonZeroAddress
} from "../lib/contracts";
import { parseEthInputToWei, parseEthInputToWeiString } from "../lib/ethAmount";
import { buildAgentDeletePlan } from "../lib/agentDelete";
import { OWNER_INDEX_AGENTS_KEY, parseOwnerAgentIndex } from "../lib/ownerIndex";
import type { SerializableAgentProfile } from "../lib/demoProfile";
import { StatusBanner } from "./StatusBanner";
import { formatWei, shortenHex } from "./EnsProofPanel";
import { UiIcon } from "./icons/UiIcons";

type AgentManagementPanelProps = {
  gasBudgetWei: bigint;
  initialProfile: SerializableAgentProfile;
  liveAgentAddress: Hex | null;
  policyEnabled?: boolean;
  resolverAddress: Hex | null;
};

/**
 * Provides reversible owner management actions for an ENS-backed agent passport.
 */
export function AgentManagementPanel(props: AgentManagementPanelProps) {
  const { sendTransactionAsync } = useSendTransaction();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("Management actions are ready when ENS and executor addresses are configured.");
  const [policyUri, setPolicyUri] = useState(props.initialProfile.policyUri);
  const [signerAddress, setSignerAddress] = useState(props.liveAgentAddress ?? "");
  const [gasAmountEth, setGasAmountEth] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

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

  const ownerAgentLabels = parseOwnerAgentIndex(typeof ownerAgentIndex.data === "string" ? ownerAgentIndex.data : "");
  const deletePlan = useMemo(
    () =>
      buildAgentDeletePlan({
        agentLabel: props.initialProfile.agentLabel,
        agentNode: props.initialProfile.agentNode,
        ensRegistryAddress: props.initialProfile.ensRegistryAddress,
        isOwnerWrapped: ownerIsWrapped,
        ownerAgentLabels,
        ownerNode: props.initialProfile.ownerNode,
        ownerResolverAddress
      }),
    [
      ownerAgentLabels,
      ownerIsWrapped,
      ownerResolverAddress,
      props.initialProfile.agentLabel,
      props.initialProfile.agentNode,
      props.initialProfile.ensRegistryAddress,
      props.initialProfile.ownerNode
    ]
  );

  async function sendManagementCall(input: { data: Hex; label: string; to?: Hex | null; value?: bigint }) {
    if (!input.to) {
      throw new Error(`${input.label} target is not configured`);
    }

    setStatus("loading");
    setStatusMessage(`Awaiting wallet approval for ${input.label}`);
    await sendTransactionAsync({ data: input.data, to: input.to, value: input.value });
    setStatus("success");
    setStatusMessage(`${input.label} transaction submitted`);
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
    await sendManagementCall({
      data: encodeFunctionData({
        abi: PUBLIC_RESOLVER_ABI,
        functionName: "setText",
        args: [props.initialProfile.agentNode, "agent.policy.uri", policyUri]
      }),
      label: "Edit policy metadata",
      to: props.resolverAddress
    });
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

  async function handleGasSubmit(event: FormEvent<HTMLFormElement>, mode: "deposit" | "withdraw") {
    event.preventDefault();
    const amountWei = parseEthInputToWei(gasAmountEth);
    if (amountWei === 0n) {
      setStatus("error");
      setStatusMessage("Enter a nonzero ETH amount before changing gas.");
      return;
    }

    await sendManagementCall({
      data: encodeFunctionData({
        abi: AGENT_POLICY_EXECUTOR_ABI,
        functionName: mode === "deposit" ? "depositGasBudget" : "withdrawGasBudget",
        args: mode === "deposit" ? [props.initialProfile.agentNode] : [props.initialProfile.agentNode, amountWei]
      }),
      label: mode === "deposit" ? "Add gas" : "Withdraw gas",
      to: props.initialProfile.executorAddress,
      value: mode === "deposit" ? amountWei : undefined
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
    for (const call of deletePlan.calls) {
      await sendTransactionAsync({ data: call.data, to: call.to });
    }
    setStatus("success");
    setStatusMessage("Delete agent transactions submitted. Historical task history remains visible.");
  }

  return (
    <>
      <section className="agent-delete-band" aria-labelledby="agent-management-delete-title" id="agent-management-title">
        <div className="agent-delete-band__copy">
          <span className="agent-delete-band__icon" aria-hidden="true"><UiIcon name="warning" size={34} /></span>
          <div>
            <h2 id="agent-management-delete-title">Delete agent</h2>
            <p>This will permanently remove the agent's subname and dashboard index.</p>
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
              <button type="button" className="agent-delete-band__button" onClick={() => void handleDelete()}>
                <UiIcon name="trash" size={18} /> Delete agent
              </button>
            </>
          ) : (
            <p className="field-help field-help--warning">{deletePlan.reason}</p>
          )}
        </div>
      </section>

      <section className="agent-management-utility sr-only" aria-labelledby="agent-management-status-title">
        <h2>Agent management</h2>
        <section aria-labelledby="agent-management-status-title">
          <h3 id="agent-management-status-title">Disable policy</h3>
          <p>Current policy status: {props.policyEnabled ? "enabled" : "disabled or unknown"}</p>
          <button type="button" onClick={() => void handleStatusWrite("disabled")}>Disable policy</button>
          <button type="button" onClick={() => void handleStatusWrite("active")}>Enable policy</button>
        </section>
        <form onSubmit={handlePolicyMetadataSubmit}>
          <h3 id="agent-management-policy-title">Edit policy metadata</h3>
          <input aria-label="Policy URI" value={policyUri} onChange={(event) => setPolicyUri(event.target.value)} />
          <button type="submit">Save policy URI</button>
        </form>
        <form onSubmit={(event) => void handleGasSubmit(event, "deposit")}>
          <h3 id="agent-management-gas-title">Add gas</h3>
          <p>Current budget: {formatWei(props.gasBudgetWei)}</p>
          <input aria-label="Gas amount ETH" value={gasAmountEth} onChange={(event) => setGasAmountEth(event.target.value)} />
          <button type="submit">Add gas</button>
        </form>
        <form onSubmit={(event) => void handleGasSubmit(event, "withdraw")}>
          <h3 id="agent-management-withdraw-title">Withdraw gas</h3>
          <p>Prepared amount: {parseEthInputToWeiString(gasAmountEth)} wei</p>
          <button type="submit">Withdraw gas</button>
        </form>
        <form onSubmit={handleSignerSubmit}>
          <h3>Update signer address</h3>
          <input aria-label="ENS addr(agent)" value={signerAddress} onChange={(event) => setSignerAddress(event.target.value)} />
          <button type="submit">Update signer address</button>
        </form>
        <StatusBanner
          details={`Resolver ${props.resolverAddress ? shortenHex(props.resolverAddress) : "not configured"}`}
          message={statusMessage}
          title="Management status"
          variant={status}
        />
      </section>
    </>
  );
}
