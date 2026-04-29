"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useEnsName } from "wagmi";
import { AgentBotIcon, EnsIndexIcon, UiIcon } from "./icons/UiIcons";

type AgentDirectorySummary = {
  agentAddress: string;
  agentName: string;
  agentNode: string;
  ownerName: string;
  updatedAt: number;
};

type AgentsResponse = {
  agents?: AgentDirectorySummary[];
  status?: string;
};

/**
 * Shows a connected-owner preview on the landing page, falling back to the
 * product mock data when no wallet/ENS owner is available.
 */
export function LandingOwnerPreview() {
  const { address, isConnected } = useAccount();
  const ens = useEnsName({ address });
  const ownerName = ens.data?.trim().toLowerCase() ?? null;
  const [agents, setAgents] = useState<AgentDirectorySummary[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);

  useEffect(() => {
    if (!ownerName) {
      setAgents([]);
      setIsLoadingAgents(false);
      return;
    }

    const abortController = new AbortController();
    setIsLoadingAgents(true);

    fetch(`/api/agents?ownerName=${encodeURIComponent(ownerName)}`, { signal: abortController.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Agent directory lookup failed");
        }
        return response.json() as Promise<AgentsResponse>;
      })
      .then((body) => setAgents(body.agents ?? []))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setAgents([]);
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoadingAgents(false);
        }
      });

    return () => abortController.abort();
  }, [ownerName]);

  const preview = useMemo(() => {
    if (!isConnected) {
      return {
        activeCount: "2",
        agentCount: "3",
        agentDetail: "addr(agent) verified",
        agentName: "assistant.owner.eth",
        ownerDisplay: "owner.eth",
        statusLabel: "Live ENS",
        statusTone: "success" as const
      };
    }

    const firstAgent = agents[0];
    return {
      activeCount: isLoadingAgents ? "…" : agents.length.toString(),
      agentCount: isLoadingAgents ? "…" : agents.length.toString(),
      agentDetail: firstAgent ? shortenAddress(firstAgent.agentAddress) : ownerName ? "No indexed agents yet" : "Reverse ENS not found",
      agentName: firstAgent?.agentName ?? (ownerName ? `assistant.${ownerName}` : "Connect owner ENS"),
      ownerDisplay: ownerName ?? shortenAddress(address),
      statusLabel: ownerName ? "Connected ENS" : "Wallet connected",
      statusTone: ownerName ? ("success" as const) : ("info" as const)
    };
  }, [address, agents, isConnected, isLoadingAgents, ownerName]);

  return (
    <div className="landing-product-preview glass-panel" aria-label="Owner dashboard preview">
      <div className="landing-product-preview__header">
        <span className="landing-product-preview__icon"><EnsIndexIcon size={22} /></span>
        <div>
          <strong>Owner dashboard</strong>
          <span>{preview.ownerDisplay}</span>
        </div>
        <span className={`status-pill status-pill--${preview.statusTone}`}>{preview.statusLabel}</span>
      </div>
      <div className="landing-product-preview__metrics">
        <div className="metric-card"><span>Agents</span><strong>{preview.agentCount}</strong><small>{isConnected ? "Indexed for owner" : "Indexed"}</small></div>
        <div className="metric-card"><span>Active</span><strong>{preview.activeCount}</strong><small>Policy source: ENS</small></div>
      </div>
      <div className="landing-product-preview__agent">
        <AgentBotIcon size={34} />
        <div>
          <strong>{preview.agentName}</strong>
          <span>{preview.agentDetail}</span>
        </div>
        <span className="status-pill status-pill--info">TaskLog</span>
      </div>
      <div className="landing-product-preview__flow">
        <span><UiIcon name="check" size={15} /> Resolve ENS</span>
        <span><UiIcon name="check" size={15} /> Check policy</span>
        <span><UiIcon name="check" size={15} /> Submit task</span>
      </div>
    </div>
  );
}

function shortenAddress(value?: string): string {
  if (!value) {
    return "Connected wallet";
  }

  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
