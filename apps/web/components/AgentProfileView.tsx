"use client";

import { useEffect, useMemo, useState } from "react";
import type { Hex } from "@agentpassport/config";
import { encodeFunctionData } from "viem";
import { usePublicClient, useReadContract, useReadContracts, useSendTransaction } from "wagmi";
import { AgentManagementPanel } from "./AgentManagementPanel";
import { StatusBanner } from "./StatusBanner";
import {
  AGENT_ENS_EXECUTOR_ABI,
  AGENT_TEXT_RECORD_KEYS,
  ENS_REGISTRY_ABI,
  LEGACY_AGENT_TEXT_RECORD_KEYS,
  PUBLIC_RESOLVER_ABI,
  nonZeroAddress
} from "../lib/contracts";
import { parseCapabilities, readPassportStatus, resolveVisibleAgentAddress } from "../lib/agentProfileDisplay";
import type { SerializableAgentProfile } from "../lib/demoProfile";
import { formatWeiAsEth, formatWeiInputAsEth, parseEthInputToWei } from "../lib/ethAmount";
import { AgentBotIcon, UiIcon } from "./icons/UiIcons";
import {
  loadKeeperHubAttestations,
  type KeeperHubAttestation
} from "../lib/keeperhubAttestations";

const KEEPERHUB_STAMP_PREVIEW_LIMIT = 2;

type TextReadResult = {
  result?: unknown;
  status?: string;
};

/**
 * Hydrates the agent passport with live ENS, executor, and KeeperHub Stamp reads.
 */
export function AgentProfileView({ initialProfile }: { initialProfile: SerializableAgentProfile }) {
  const publicClient = usePublicClient({ chainId: Number(initialProfile.chainId) });
  const { sendTransactionAsync } = useSendTransaction();
  const [keeperHubAttestations, setKeeperHubAttestations] = useState<KeeperHubAttestation[]>([]);
  const [keeperHubStatus, setKeeperHubStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [keeperHubMessage, setKeeperHubMessage] = useState("KeeperHub Stamps have not loaded yet.");
  const [managementStatus, setManagementStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [managementMessage, setManagementMessage] = useState("Owner actions are ready.");
  const registryResolver = useReadContract({
    address: initialProfile.ensRegistryAddress ?? undefined,
    abi: ENS_REGISTRY_ABI,
    functionName: "resolver",
    args: [initialProfile.agentNode],
    query: { enabled: Boolean(initialProfile.ensRegistryAddress) }
  });
  const registryResolverAddress = nonZeroAddress(registryResolver.data as Hex | undefined);
  const resolverReadSettled = registryResolver.isSuccess;
  const resolverAddress = resolverReadSettled ? registryResolverAddress : registryResolverAddress ?? initialProfile.resolverAddress ?? null;
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
  const gasBudgetRead = useReadContract({
    address: initialProfile.executorAddress ?? undefined,
    abi: AGENT_ENS_EXECUTOR_ABI,
    functionName: "gasBudgetWei",
    args: [initialProfile.agentNode],
    query: { enabled: Boolean(initialProfile.executorAddress) }
  });
  const nextNonceRead = useReadContract({
    address: initialProfile.executorAddress ?? undefined,
    abi: AGENT_ENS_EXECUTOR_ABI,
    functionName: "nextNonce",
    args: [initialProfile.agentNode],
    query: { enabled: Boolean(initialProfile.executorAddress) }
  });
  const textRecords = useMemo(
    () => mergeTextRecords(initialProfile.textRecords, textRecordReads.data as TextReadResult[] | undefined),
    [initialProfile.textRecords, textRecordReads.data]
  );
  const resolvedAgentAddress = nonZeroAddress(agentAddress.data as Hex | undefined);
  const agentAddressReadSettled = Boolean(resolverAddress) && agentAddress.isSuccess;
  const liveAgentAddress = resolveVisibleAgentAddress({
    agentAddressReadSettled,
    initialAgentAddress: initialProfile.agentAddress,
    resolverAddress,
    resolverReadSettled,
    resolvedAgentAddress
  });
  const liveGasBudget = (gasBudgetRead.data as bigint | undefined) ?? safeBigInt(initialProfile.gasBudgetWei);
  const liveNextNonce = (nextNonceRead.data as bigint | undefined)?.toString() ?? initialProfile.nextNonce ?? "Unknown";
  const capabilityText = textRecords.find((record) => record.key === "agent_capabilities")?.value;
  const capabilities = parseCapabilities(capabilityText, initialProfile.capabilities);
  const statusText = textRecords.find((record) => record.key === "agent_status")?.value;
  const policyUri = textRecords.find((record) => record.key === "agent_policy_uri")?.value || initialProfile.policyUri;
  const policyHash = textRecords.find((record) => record.key === "agent_policy_hash")?.value || initialProfile.policyHash;
  const policyDigest = textRecords.find((record) => record.key === "agent_policy_digest")?.value || null;
  const policyTarget = textRecords.find((record) => record.key === "agent_policy_target")?.value || null;
  const policySelector = textRecords.find((record) => record.key === "agent_policy_selector")?.value || "";
  const maxValueWei = textRecords.find((record) => record.key === "agent_policy_max_value_wei")?.value || "";
  const maxGasReimbursementWei = textRecords.find((record) => record.key === "agent_policy_max_gas_reimbursement_wei")?.value || "";
  const policyExpiresAt = textRecords.find((record) => record.key === "agent_policy_expires_at")?.value || "";
  const uniswapPolicy = readUniswapPolicyDisplay(textRecords);
  const hasUniswapSwapCapability = capabilities.includes("uniswap-swap");
  const shouldShowKeeperHubAttestations = hasUniswapSwapCapability || keeperHubStatus === "loading" || keeperHubStatus === "error" || keeperHubAttestations.length > 0;
  const passportStatus = readPassportStatus(statusText, liveAgentAddress);
  const policyEnabled = passportStatus === "active";
  const nextStatusAction = passportStatus === "disabled" ? "active" : "disabled";

  async function refreshAgentReads() {
    await Promise.all([
      registryResolver.refetch(),
      agentAddress.refetch(),
      textRecordReads.refetch(),
      gasBudgetRead.refetch(),
      nextNonceRead.refetch()
    ]);
  }

  async function sendAgentManagementCall(input: { data: Hex; label: string; to?: Hex | null; value?: bigint }) {
    if (!input.to) {
      setManagementStatus("error");
      setManagementMessage(`${input.label} target is not configured.`);
      return;
    }

    setManagementStatus("loading");
    setManagementMessage(`Awaiting wallet approval for ${input.label}.`);
    try {
      const hash = await sendTransactionAsync({ data: input.data, to: input.to, value: input.value });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await refreshAgentReads();
      setManagementStatus("success");
      setManagementMessage(`${input.label} transaction confirmed.`);
    } catch (error) {
      setManagementStatus("error");
      setManagementMessage(error instanceof Error ? error.message : `${input.label} failed.`);
    }
  }

  async function writeAgentStatus(nextStatus: "active" | "disabled") {
    await sendAgentManagementCall({
      data: encodeFunctionData({
        abi: PUBLIC_RESOLVER_ABI,
        functionName: "multicall",
        args: [[
          encodeFunctionData({
            abi: PUBLIC_RESOLVER_ABI,
            functionName: "setText",
            args: [initialProfile.agentNode, "agent_status", nextStatus]
          }),
          ...LEGACY_AGENT_TEXT_RECORD_KEYS.map((key) =>
            encodeFunctionData({
              abi: PUBLIC_RESOLVER_ABI,
              functionName: "setText",
              args: [initialProfile.agentNode, key, ""]
            })
          )
        ]]
      }),
      label: nextStatus === "active" ? "Enable agent" : "Disable agent",
      to: resolverAddress
    });
  }

  async function submitGasBudgetChange(mode: "deposit" | "withdraw", amountEth: string) {
    const amountWei = parseEthInputToWei(amountEth);
    if (amountWei === 0n) {
      setManagementStatus("error");
      setManagementMessage("Enter a nonzero ETH amount before changing gas.");
      return;
    }

    await sendAgentManagementCall({
      data: encodeFunctionData({
        abi: AGENT_ENS_EXECUTOR_ABI,
        functionName: mode === "deposit" ? "depositGasBudget" : "withdrawGasBudget",
        args: mode === "deposit" ? [initialProfile.agentNode] : [initialProfile.agentNode, amountWei]
      }),
      label: mode === "deposit" ? "Add gas" : "Withdraw gas",
      to: initialProfile.executorAddress,
      value: mode === "deposit" ? amountWei : undefined
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function refreshKeeperHubAttestations() {
      setKeeperHubStatus("loading");
      setKeeperHubMessage("Loading KeeperHub Stamps...");
      try {
        const rows = await loadKeeperHubAttestations({
          agentName: initialProfile.agentName,
          agentNode: initialProfile.agentNode,
          limit: 50
        });
        if (!cancelled) {
          setKeeperHubAttestations(rows);
          setKeeperHubStatus("success");
          setKeeperHubMessage(rows.length > 0 ? `${rows.length} KeeperHub Stamps loaded.` : "No KeeperHub Stamps found for this agent yet.");
        }
      } catch (error) {
        if (!cancelled) {
          setKeeperHubAttestations([]);
          setKeeperHubStatus("error");
          setKeeperHubMessage(error instanceof Error ? error.message : "KeeperHub Stamp request failed.");
        }
      }
    }

    refreshKeeperHubAttestations().catch(() => {
      if (!cancelled) {
        setKeeperHubStatus("error");
        setKeeperHubMessage("KeeperHub Stamp request failed.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initialProfile.agentName, initialProfile.agentNode]);

  return (
    <div className="agent-detail agent-detail--permission-manager">
      <section className="agent-detail__topbar agent-detail__hero glass-panel" aria-labelledby="agent-title">
        <a className="agent-detail__back" href={`/owner/${encodeURIComponent(initialProfile.ownerName)}`}>
          <UiIcon name="arrow-left" size={15} /> Back to dashboard
        </a>
        <span className="agent-detail__eyebrow">Passport Preview</span>
        <div className="agent-detail__header">
          <div className="agent-detail__identity">
            <span className="agent-detail__avatar" aria-hidden="true"><AgentBotIcon size={36} /></span>
            <div>
              <div className="agent-detail__name-row">
                <h1 id="agent-title">{initialProfile.agentName}</h1>
                <span className={`status-pill status-pill--${passportStatus === "active" ? "success" : passportStatus === "disabled" ? "warning" : "neutral"}`}>
                  {passportStatus === "active" ? "Active" : passportStatus === "disabled" ? "Disabled" : "Unknown"}
                </span>
              </div>
              <dl className="agent-detail__quick-facts">
                <div>
                  <dt>Agent signer</dt>
                  <dd title={liveAgentAddress ?? undefined}>{liveAgentAddress ? shortenHex(liveAgentAddress) : "Unknown"}</dd>
                </div>
                <div>
                  <dt>Passport proof</dt>
                  <dd><span className="status-pill status-pill--success">ENS</span></dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="agent-detail__actions" aria-label="Agent quick actions">
            <button className="action-button action-button--secondary" type="button" onClick={() => void writeAgentStatus(nextStatusAction)}>
              <UiIcon name={nextStatusAction === "active" ? "check" : "shield"} size={16} /> {nextStatusAction === "active" ? "Enable" : "Disable"}
            </button>
            <a className="action-button action-button--secondary" href="#agent-management-policy-title"><UiIcon name="edit" size={16} /> Edit Visa</a>
            <a className="agent-detail__delete-link action-button action-button--danger" href="#agent-management-delete-title" aria-label="Delete Passport"><UiIcon name="trash" size={16} /> Delete Passport</a>
          </div>
        </div>
        <StatusBanner
          details={`Resolver ${resolverAddress ? shortenHex(resolverAddress) : "not configured"}`}
          message={managementMessage}
          title="Owner action status"
          variant={managementStatus}
        />
      </section>

      <section className="agent-detail__protocol-strip" aria-label="AgentPassports trust flow">
        <article>
          <span>01</span>
          <strong>Passport</strong>
          <p>ENS identity for {initialProfile.agentName}; owner can update or revoke it onchain.</p>
        </article>
        <article>
          <span>02</span>
          <strong>Visa state</strong>
          <p>Exact scope from ENS text records: target, selector, value cap, expiry, and gas reimbursement.</p>
        </article>
        <article>
          <span>03</span>
          <strong>KeeperHub Stamps</strong>
          <p>KeeperHub validates the Passport/Visa before execution and records latest stamps.</p>
        </article>
      </section>

      <div className="agent-detail__grid">
        <LiveEnsPassportPanel
          agentAddress={liveAgentAddress}
          agentName={initialProfile.agentName}
          agentNode={initialProfile.agentNode}
          ownerName={initialProfile.ownerName}
          ownerNode={initialProfile.ownerNode}
          policyHash={policyHash}
          policyUri={policyUri}
          resolverAddress={resolverAddress}
          status={passportStatus}
        />
        <PolicyStatePanel
          capabilities={capabilities}
          executorAddress={initialProfile.executorAddress}
          gasBudgetWei={liveGasBudget}
          maxGasReimbursementWei={maxGasReimbursementWei}
          maxValueWei={maxValueWei}
          nextNonce={liveNextNonce}
          policyDigest={typeof policyDigest === "string" && policyDigest.startsWith("0x") ? policyDigest as Hex : null}
          policyExpiresAt={policyExpiresAt}
          policyHash={typeof policyHash === "string" && policyHash.startsWith("0x") ? policyHash as Hex : initialProfile.policyHash}
          policySelector={policySelector}
          policyTarget={typeof policyTarget === "string" && policyTarget.startsWith("0x") ? policyTarget as Hex : null}
          policyUri={policyUri}
          status={passportStatus}
          taskLogAddress={initialProfile.taskLogAddress}
        />
        <AgentProofPanel
          agentNode={initialProfile.agentNode}
          ownerNode={initialProfile.ownerNode}
          recoveredSigner={liveAgentAddress}
          resolverAddress={resolverAddress}
        />
        <GasBudgetPanel
          gasBudgetWei={liveGasBudget}
          onAddGas={(amountEth) => void submitGasBudgetChange("deposit", amountEth)}
          onWithdrawGas={(amountEth) => void submitGasBudgetChange("withdraw", amountEth)}
        />
        {hasUniswapSwapCapability ? (
          <UniswapPolicyPanel policy={uniswapPolicy} />
        ) : null}
        {shouldShowKeeperHubAttestations ? (
          <KeeperHubAttestationsPanel
            attestations={keeperHubAttestations}
            message={keeperHubMessage}
            policyDigest={policyDigest}
            status={keeperHubStatus}
          />
        ) : null}
      </div>

      <AgentManagementPanel
        gasBudgetWei={liveGasBudget}
        initialProfile={initialProfile}
        liveAgentAddress={liveAgentAddress}
        onDeleted={() => {
          window.location.href = `/owner/${encodeURIComponent(initialProfile.ownerName)}`;
        }}
        onRefresh={refreshAgentReads}
        policyEnabled={policyEnabled}
        resolverAddress={resolverAddress}
      />
    </div>
  );
}

function AgentProofPanel(props: {
  agentNode: Hex;
  ownerNode: Hex;
  recoveredSigner: Hex | null;
  resolverAddress: Hex | null;
}) {
  const rows = [
    { label: "agentNode", title: props.agentNode, value: shortenHex(props.agentNode) },
    { label: "ownerNode", title: props.ownerNode, value: shortenHex(props.ownerNode) },
    {
      label: "Live resolver",
      title: props.resolverAddress ?? undefined,
      value: props.resolverAddress ? shortenHex(props.resolverAddress) : "Unknown"
    },
    {
      label: "Recovered signer",
      title: props.recoveredSigner ?? undefined,
      value: props.recoveredSigner ? shortenHex(props.recoveredSigner) : "Unknown"
    }
  ];

  return (
    <section className="agent-panel agent-proof-card metric-card" aria-labelledby="agent-proof-title">
      <h2 id="agent-proof-title"><UiIcon name="shield" size={18} /> Passport proof</h2>
      <dl className="agent-fact-table">
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
 * Displays the live ENS passport fields in the management-page layout.
 */
function LiveEnsPassportPanel(props: {
  agentAddress: Hex | null;
  agentName: string;
  agentNode: Hex;
  ownerName: string;
  ownerNode: Hex;
  policyHash: Hex | string | null;
  policyUri: string;
  resolverAddress: Hex | null;
  status: string;
}) {
  const rows = [
    { label: "Agent signer", title: props.agentAddress ?? undefined, value: props.agentAddress ? shortenHex(props.agentAddress) : "Unknown" },
    { label: "ENS resolver", title: props.resolverAddress ?? undefined, value: props.resolverAddress ? shortenHex(props.resolverAddress) : "Unknown" },
    { label: "Owner Passport", title: props.ownerNode, value: props.ownerName },
    { label: "Passport status", value: props.status },
    { label: "Visa URI", title: props.policyUri, value: props.policyUri || "Unknown" },
    { label: "Visa digest", title: props.policyHash ?? undefined, value: props.policyHash ? shortenHex(props.policyHash as Hex) : "Unknown" }
  ];

  return (
    <section className="agent-panel agent-passport-panel" aria-labelledby="agent-passport-title">
      <h2 id="agent-passport-title"><UiIcon name="shield" size={18} /> Agent Passport</h2>
      <dl className="agent-fact-table">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd title={row.title}>
              {row.label === "Passport status" ? <span className="pill pill--success">{row.value}</span> : row.value}
            </dd>
          </div>
        ))}
      </dl>
      <span className="sr-only">{props.agentName}</span>
    </section>
  );
}

/**
 * Shows the executor-facing policy and gas budget facts for the agent node.
 */
function PolicyStatePanel(props: {
  capabilities: readonly string[];
  executorAddress: Hex | null;
  gasBudgetWei: bigint;
  maxGasReimbursementWei: string;
  maxValueWei: string;
  nextNonce: string;
  policyDigest: Hex | null;
  policyExpiresAt: string;
  policyHash: Hex | null;
  policySelector: string;
  policyTarget: Hex | null;
  policyUri: string;
  status: string;
  taskLogAddress: Hex | null;
}) {
  const rows = [
    { label: "Visa target", title: props.policyTarget ?? props.taskLogAddress ?? undefined, value: props.policyTarget ? shortenHex(props.policyTarget) : props.taskLogAddress ? shortenHex(props.taskLogAddress) : "Unknown" },
    { label: "Visa selector", title: props.policySelector || undefined, value: props.policySelector || "Unknown" },
    { label: "Max value per call", value: props.maxValueWei ? formatWei(safeBigInt(props.maxValueWei)) : "Unknown" },
    { label: "Gas reimbursement cap", value: props.maxGasReimbursementWei ? formatWei(safeBigInt(props.maxGasReimbursementWei)) : "Unknown" },
    { label: "Visa expiry", value: props.policyExpiresAt ? formatUnixTime(safeBigInt(props.policyExpiresAt)) : "Unknown" },
    {
      label: "Visa digest",
      title: props.policyDigest ?? undefined,
      value: props.policyDigest ? shortenHex(props.policyDigest) : "Unknown"
    },
    {
      label: "Visa metadata hash",
      title: props.policyHash ?? undefined,
      value: props.policyHash ? shortenHex(props.policyHash) : "Unknown"
    },
    {
      label: "Executor",
      title: props.executorAddress ?? undefined,
      value: props.executorAddress ? shortenHex(props.executorAddress) : "Unknown"
    },
    { label: "Passport proof", value: props.policyUri ? "ENS" : "Unknown" },
    { label: "Visa state", value: props.status === "active" ? "Enabled by exact ENS status" : "Disabled or unknown" },
    { label: "Next nonce", value: props.nextNonce }
  ];

  return (
    <section className="agent-panel agent-policy-card" aria-labelledby="agent-policy-title">
      <h2 id="agent-policy-title"><UiIcon name="document" size={18} /> Visa state</h2>
      <dl className="agent-fact-table">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd title={row.title}>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="agent-policy-card__capabilities">
        <span>Visa Scope</span>
        <div>
          {props.capabilities.map((capability) => (
            <span className="pill pill--info" key={capability}>{capability}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function GasBudgetPanel(props: {
  gasBudgetWei: bigint;
  onAddGas: (amountEth: string) => void;
  onWithdrawGas: (amountEth: string) => void;
}) {
  const [addAmountEth, setAddAmountEth] = useState("");
  const [withdrawAmountEth, setWithdrawAmountEth] = useState("");

  return (
    <section className="agent-panel agent-gas-card" aria-labelledby="agent-gas-title">
      <h2 id="agent-gas-title"><UiIcon name="gas" size={18} /> Gas budget</h2>
      <span>Balance</span>
      <strong>{formatWei(props.gasBudgetWei)}</strong>
      <div className="agent-gas-card__inputs">
        <form onSubmit={(event) => {
          event.preventDefault();
          props.onAddGas(addAmountEth);
        }}>
          <label>
          <span>Add amount (ETH)</span>
            <input
              id="agent-gas-add-input"
              inputMode="decimal"
              onChange={(event) => setAddAmountEth(event.target.value)}
              placeholder="0.0"
              value={addAmountEth}
            />
          </label>
          <button type="submit"><UiIcon name="plus" size={16} /> Add gas</button>
        </form>
        <form onSubmit={(event) => {
          event.preventDefault();
          props.onWithdrawGas(withdrawAmountEth);
        }}>
          <label>
          <span>Withdraw amount (ETH)</span>
          <span className="agent-gas-card__input-row">
              <input
                id="agent-gas-withdraw-input"
                inputMode="decimal"
                onChange={(event) => setWithdrawAmountEth(event.target.value)}
                placeholder="0.0"
                value={withdrawAmountEth}
              />
              <button type="button" onClick={() => setWithdrawAmountEth(formatWeiInputAsEth(props.gasBudgetWei.toString()))}>Max</button>
          </span>
          </label>
          <button type="submit"><UiIcon name="download" size={16} /> Withdraw gas</button>
        </form>
      </div>
    </section>
  );
}

type UniswapPolicyDisplay = {
  allowedChainId: string;
  allowedTokenIn: string;
  allowedTokenOut: string;
  deadlineSeconds: string;
  enabled: string;
  maxInputAmount: string;
  maxSlippageBps: string;
  recipient: string;
  router: string;
  selector: string;
};

function UniswapPolicyPanel(props: { policy: UniswapPolicyDisplay }) {
  const allowedTokens = `${shortenAddressCsv(props.policy.allowedTokenIn)} → ${shortenAddressCsv(props.policy.allowedTokenOut)}`;
  const allowedTokensTitle = `${props.policy.allowedTokenIn} → ${props.policy.allowedTokenOut}`;
  const routerSelector = `${shortenMaybeHex(props.policy.router)} · ${props.policy.selector}`;
  const limits = [
    `${props.policy.maxInputAmount} max input`,
    `${props.policy.maxSlippageBps} bps slippage`,
    props.policy.deadlineSeconds === "Unknown" ? "deadline unknown" : `${props.policy.deadlineSeconds}s quote deadline`
  ].join(" · ");
  const rows = [
    { label: "Chain", value: props.policy.allowedChainId },
    { label: "Router / selector", title: `${props.policy.router} · ${props.policy.selector}`, value: routerSelector },
    { label: "Allowed tokens", title: allowedTokensTitle, value: allowedTokens },
    { label: "Limits", value: limits },
    { label: "Recipient", title: props.policy.recipient, value: shortenMaybeHex(props.policy.recipient) },
    { label: "Visa status", value: props.policy.enabled }
  ];

  return (
    <section className="agent-panel agent-policy-card agent-uniswap-card" aria-labelledby="agent-uniswap-policy-title">
      <h2 id="agent-uniswap-policy-title"><UiIcon name="queue" size={18} /> Uniswap Visa</h2>
      <dl className="agent-fact-table">
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

function KeeperHubAttestationsPanel(props: {
  attestations: readonly KeeperHubAttestation[];
  message: string;
  policyDigest: string | null;
  status: "idle" | "loading" | "success" | "error";
}) {
  const [areStampsExpanded, setAreStampsExpanded] = useState(false);
  const digestLabel = props.policyDigest && props.policyDigest.startsWith("0x") ? shortenHex(props.policyDigest as Hex) : "Unknown";
  const visibleAttestations = areStampsExpanded ? props.attestations : props.attestations.slice(0, KEEPERHUB_STAMP_PREVIEW_LIMIT);
  const hiddenStampCount = props.attestations.length - visibleAttestations.length;
  const hasHiddenStamps = props.attestations.length > KEEPERHUB_STAMP_PREVIEW_LIMIT;

  return (
    <section className="agent-panel agent-proof-card metric-card" aria-labelledby="agent-keeperhub-attestations-title">
      <div className="agent-section-heading">
        <h2 id="agent-keeperhub-attestations-title"><UiIcon name="shield" size={18} /> KeeperHub Stamps</h2>
        <span className={`pill ${props.status === "error" ? "pill--danger" : props.status === "loading" ? "pill--warning" : "pill--success"}`}>{props.status}</span>
      </div>
      <p className="muted-copy">{props.message}</p>
      <dl className="agent-fact-table">
        <div>
          <dt>Visa digest</dt>
          <dd title={props.policyDigest ?? undefined}>{digestLabel}</dd>
        </div>
        <div>
          <dt>Stamps loaded</dt>
          <dd>{props.attestations.length}</dd>
        </div>
      </dl>
      {props.attestations.length > 0 ? (
        <div className="keeperhub-attestations" aria-label="Execution trace">
          {visibleAttestations.map((attestation) => (
            <article className="keeperhub-attestation" key={attestation.executionId}>
              <div className="keeperhub-attestation__heading">
                <div>
                  <strong>{attestation.taskDescription || "Uniswap swap"}</strong>
                  <span>{formatMaybeDate(attestation.startedAt)} · {attestation.executionId}</span>
                </div>
                <span className={`pill ${keeperHubDecisionTone(attestation.decision)}`}>{attestation.decision}</span>
              </div>
              <dl className="agent-fact-table keeperhub-attestation__facts">
                <div>
                  <dt>Tx hash</dt>
                  <dd title={attestation.txHash ?? undefined}>{attestation.txHash ? shortenHex(attestation.txHash as Hex) : "No tx"}</dd>
                </div>
                <div>
                  <dt>Latest Stamp</dt>
                  <dd title={attestation.stampReason ?? undefined}>{attestation.blockedCode ?? "None"}</dd>
                </div>
                <div>
                  <dt>Failed node</dt>
                  <dd title={attestation.failedNodeId ?? undefined}>{attestation.failedNodeId ?? "None"}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{attestation.status}</dd>
                </div>
                <div>
                  <dt>Token in</dt>
                  <dd title={attestation.tokenIn ?? undefined}>{attestation.tokenIn ? shortenMaybeHex(attestation.tokenIn) : "Unknown"}</dd>
                </div>
                <div>
                  <dt>Token out</dt>
                  <dd title={attestation.tokenOut ?? undefined}>{attestation.tokenOut ? shortenMaybeHex(attestation.tokenOut) : "Unknown"}</dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd>{attestation.amount ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt>Visa target</dt>
                  <dd title={attestation.requestedTarget ?? undefined}>{attestation.requestedTarget ? shortenMaybeHex(attestation.requestedTarget) : "Unknown"}</dd>
                </div>
                <div>
                  <dt>Visa selector</dt>
                  <dd>{attestation.requestedSelector ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt>Execution trace</dt>
                  <dd title={attestation.trace.join(" → ")}>{formatTrace(attestation.trace)}</dd>
                </div>
                <div>
                  <dt>Error</dt>
                  <dd title={attestation.failureReason ?? attestation.stampReason ?? undefined}>{attestation.failureReason ?? attestation.stampReason ?? "None"}</dd>
                </div>
              </dl>
            </article>
          ))}
          {hasHiddenStamps ? (
            <div className="keeperhub-attestations__footer">
              <button className="keeperhub-attestations__toggle" type="button" onClick={() => setAreStampsExpanded((value) => !value)}>
                {areStampsExpanded ? "Show less" : `See more (${hiddenStampCount} more)`}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
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

function readUniswapPolicyDisplay(records: readonly { key: string; value: string }[]): UniswapPolicyDisplay {
  const read = (key: string) => {
    const value = records.find((record) => record.key === key)?.value.trim();
    return value && value !== "Unknown" ? value : "Unknown";
  };

  return {
    allowedChainId: read("agent_policy_uniswap_chain_id"),
    allowedTokenIn: read("agent_policy_uniswap_allowed_token_in"),
    allowedTokenOut: read("agent_policy_uniswap_allowed_token_out"),
    deadlineSeconds: read("agent_policy_uniswap_deadline_seconds"),
    enabled: read("agent_policy_uniswap_enabled"),
    maxInputAmount: read("agent_policy_uniswap_max_input_amount"),
    maxSlippageBps: read("agent_policy_uniswap_max_slippage_bps"),
    recipient: read("agent_policy_uniswap_recipient"),
    router: read("agent_policy_uniswap_router"),
    selector: read("agent_policy_uniswap_selector")
  };
}

/**
 * Parses bigint strings from serialized server props.
 */
function safeBigInt(value: string): bigint {
  return /^\d+$/u.test(value) ? BigInt(value) : 0n;
}

function formatUnixTime(value: bigint): string {
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(timestamp * 1000));
}

function formatMaybeDate(value: string | null): string {
  if (!value) {
    return "Unknown time";
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(parsed));
}

function formatTrace(trace: readonly string[]): string {
  if (trace.length === 0) {
    return "No trace";
  }
  if (trace.length <= 4) {
    return trace.join(" → ");
  }
  return `${trace[0]} → ${trace[1]} → … → ${trace[trace.length - 2]} → ${trace[trace.length - 1]}`;
}

function keeperHubDecisionTone(decision: KeeperHubAttestation["decision"]): string {
  if (decision === "executed") return "pill--success";
  if (decision === "blocked") return "pill--warning";
  if (decision === "failed") return "pill--danger";
  return "pill--info";
}

function formatWei(value?: bigint): string {
  return formatWeiAsEth(value);
}

function shortenAddressCsv(value: string): string {
  if (value === "Unknown") {
    return value;
  }
  return value.split(",").map((item) => shortenMaybeHex(item.trim())).join(", ");
}

function shortenMaybeHex(value: string): string {
  return value.startsWith("0x") ? shortenHex(value as Hex) : value || "Unknown";
}

function shortenHex(value: Hex): string {
  return value.length <= 18 ? value : `${value.slice(0, 10)}...${value.slice(-6)}`;
}
