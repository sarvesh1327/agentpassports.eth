"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import {
  buildPolicyMetadata,
  computeSubnode,
  hashPolicyMetadata,
  namehashEnsName,
  taskLogRecordTaskSelector,
  type Hex
} from "@agentpassport/config";
import { buildAgentName, safeNamehash } from "../lib/ensPreview";
import { shortenHex } from "./EnsProofPanel";

export type RegisterAgentFormProps = {
  defaultAgentAddress?: Hex | null;
  defaultAgentLabel: string;
  defaultGasBudgetWei: string;
  defaultMaxGasReimbursementWei: string;
  defaultMaxValueWei: string;
  defaultOwnerName: string;
  defaultPolicyExpiresAt: string;
  defaultPolicyUri: string;
  executorAddress?: Hex | null;
  resolverAddress?: Hex | null;
  taskLogAddress?: Hex | null;
};

type RegisterPreview = {
  agentName: string;
  agentNode: Hex;
  gasBudgetWei: string;
  ownerNode: Hex;
  policyHash: Hex | null;
  textRecords: readonly { key: string; value: string }[];
};

/**
 * Captures the ENS identity, record metadata, policy, and gas budget inputs for a new agent.
 */
export function RegisterAgentForm(props: RegisterAgentFormProps) {
  const [ownerName, setOwnerName] = useState(props.defaultOwnerName);
  const [agentLabel, setAgentLabel] = useState(props.defaultAgentLabel);
  const [agentAddress, setAgentAddress] = useState(props.defaultAgentAddress ?? "");
  const [policyUri, setPolicyUri] = useState(props.defaultPolicyUri);
  const [gasBudgetWei, setGasBudgetWei] = useState(props.defaultGasBudgetWei);
  const [status, setStatus] = useState<"idle" | "ready">("idle");
  const preview = useMemo(
    () =>
      buildRegisterPreview({
        agentAddress,
        agentLabel,
        executorAddress: props.executorAddress,
        gasBudgetWei,
        maxGasReimbursementWei: props.defaultMaxGasReimbursementWei,
        maxValueWei: props.defaultMaxValueWei,
        ownerName,
        policyExpiresAt: props.defaultPolicyExpiresAt,
        policyUri,
        taskLogAddress: props.taskLogAddress
      }),
    [
      agentAddress,
      agentLabel,
      gasBudgetWei,
      ownerName,
      policyUri,
      props.defaultMaxGasReimbursementWei,
      props.defaultMaxValueWei,
      props.defaultPolicyExpiresAt,
      props.executorAddress,
      props.taskLogAddress
    ]
  );
  const agentPageHref = `/agent/${encodeURIComponent(preview.agentName)}`;

  /**
   * Marks the form as locally prepared until wallet-backed writes are connected.
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("ready");
  }

  return (
    <form className="register-form" onSubmit={handleSubmit}>
      <section className="register-form__section" aria-labelledby="register-identity-title">
        <div className="section-heading">
          <p>Identity</p>
          <h2 id="register-identity-title">Agent ENS</h2>
        </div>
        <div className="field-grid">
          <label>
            <span>Owner ENS</span>
            <input name="ownerName" onChange={(event) => setOwnerName(event.target.value)} value={ownerName} />
          </label>
          <label>
            <span>Agent label</span>
            <input name="agentLabel" onChange={(event) => setAgentLabel(event.target.value)} value={agentLabel} />
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
          <label>
            <span>Metadata URI</span>
            <input name="policyUri" onChange={(event) => setPolicyUri(event.target.value)} value={policyUri} />
          </label>
        </div>
      </section>

      <section className="register-form__section" aria-labelledby="register-policy-title">
        <div className="section-heading">
          <p>Policy</p>
          <h2 id="register-policy-title">Execution limits</h2>
        </div>
        <div className="field-grid">
          <label>
            <span>Policy target</span>
            <input readOnly value={props.taskLogAddress ?? "TaskLog not configured"} />
          </label>
          <label>
            <span>TaskLog selector</span>
            <input readOnly value={taskLogRecordTaskSelector()} />
          </label>
          <label>
            <span>Gas budget</span>
            <input name="gasBudgetWei" onChange={(event) => setGasBudgetWei(event.target.value)} value={gasBudgetWei} />
          </label>
          <label>
            <span>Max reimbursement</span>
            <input readOnly value={props.defaultMaxGasReimbursementWei} />
          </label>
        </div>
      </section>

      <section className="register-form__preview" aria-labelledby="register-preview-title">
        <div className="section-heading">
          <p>Preview</p>
          <h2 id="register-preview-title">Registration facts</h2>
        </div>
        <dl className="fact-grid">
          <PreviewRow label="Agent ENS" value={preview.agentName} />
          <PreviewRow label="Owner node" title={preview.ownerNode} value={shortenHex(preview.ownerNode)} />
          <PreviewRow label="Agent node" title={preview.agentNode} value={shortenHex(preview.agentNode)} />
          <PreviewRow label="Resolver" title={props.resolverAddress ?? undefined} value={formatNullableHex(props.resolverAddress)} />
          <PreviewRow label="Policy hash" title={preview.policyHash ?? undefined} value={formatNullableHex(preview.policyHash)} />
          <PreviewRow label="Gas budget" value={`${preview.gasBudgetWei} wei`} />
        </dl>
      </section>

      <section className="register-form__section" aria-labelledby="register-records-title">
        <div className="section-heading">
          <p>Records</p>
          <h2 id="register-records-title">ENS text records</h2>
        </div>
        <div className="record-table" role="table" aria-label="ENS text records">
          {preview.textRecords.map((record) => (
            <div className="record-table__row" role="row" key={record.key}>
              <span role="cell">{record.key}</span>
              <strong role="cell">{record.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="register-form__section" aria-labelledby="register-transactions-title">
        <div className="section-heading">
          <p>Queue</p>
          <h2 id="register-transactions-title">Prepared transactions</h2>
        </div>
        <ol className="transaction-list">
          <li>setAddr({preview.agentNode}, {agentAddress || "agent address"})</li>
          <li>setText(agent.v, agent.owner, agent.capabilities, agent.policy.uri, agent.policy.hash, agent.executor)</li>
          <li>setPolicy({preview.agentNode}, TaskLog, {taskLogRecordTaskSelector()})</li>
          <li>depositGasBudget({preview.agentNode}, {preview.gasBudgetWei} wei)</li>
        </ol>
      </section>

      <div className="register-form__actions">
        <button type="submit">Prepare registration</button>
        <a href={agentPageHref}>View agent passport</a>
        <strong>{status === "ready" ? "Registration draft ready" : "Draft not prepared"}</strong>
      </div>
    </form>
  );
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
 * Derives the node, policy hash, and text records from current form values.
 */
function buildRegisterPreview(input: {
  agentAddress: string;
  agentLabel: string;
  executorAddress?: Hex | null;
  gasBudgetWei: string;
  maxGasReimbursementWei: string;
  maxValueWei: string;
  ownerName: string;
  policyExpiresAt: string;
  policyUri: string;
  taskLogAddress?: Hex | null;
}): RegisterPreview {
  const normalizedAgentLabel = input.agentLabel.trim().toLowerCase();
  const normalizedOwnerName = input.ownerName.trim().toLowerCase();
  const agentName = buildAgentName(normalizedAgentLabel, normalizedOwnerName);
  const ownerNode = safeNamehash(normalizedOwnerName);
  const agentNode = normalizedAgentLabel ? safeComputeSubnode(ownerNode, normalizedAgentLabel) : safeNamehash(agentName);
  const policyHash = input.taskLogAddress
    ? hashPolicyMetadata(
        buildPolicyMetadata({
          agentNode,
          expiresAt: safeBigInt(input.policyExpiresAt),
          maxGasReimbursementWei: safeBigInt(input.maxGasReimbursementWei),
          maxValueWei: safeBigInt(input.maxValueWei),
          ownerNode,
          selector: taskLogRecordTaskSelector(),
          target: input.taskLogAddress
        })
      )
    : null;

  return {
    agentName,
    agentNode,
    gasBudgetWei: safeBigInt(input.gasBudgetWei).toString(),
    ownerNode,
    policyHash,
    textRecords: [
      { key: "agent.v", value: "1" },
      { key: "agent.owner", value: normalizedOwnerName || "Pending owner ENS" },
      { key: "agent.kind", value: "personal-assistant" },
      { key: "agent.capabilities", value: "task-log,sponsored-execution" },
      { key: "agent.policy.uri", value: input.policyUri || "Pending metadata URI" },
      { key: "agent.policy.hash", value: policyHash ?? "Pending policy target" },
      { key: "agent.executor", value: input.executorAddress ?? "Pending executor" },
      { key: "agent.status", value: isAddress(input.agentAddress) ? "active" : "draft" },
      { key: "agent.description", value: normalizedOwnerName ? `${normalizedOwnerName} onchain assistant` : "Pending owner ENS" }
    ]
  };
}

/**
 * Computes a Solidity-compatible subnode while tolerating partially typed labels.
 */
function safeComputeSubnode(ownerNode: Hex, agentLabel: string): Hex {
  try {
    return computeSubnode(ownerNode, agentLabel);
  } catch {
    return namehashEnsName("");
  }
}

/**
 * Parses numeric form fields into bigint values without throwing during editing.
 */
function safeBigInt(value: string): bigint {
  return /^\d+$/u.test(value.trim()) ? BigInt(value.trim()) : 0n;
}

/**
 * Checks whether a form value is a complete EVM address.
 */
function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/u.test(value.trim());
}

/**
 * Formats nullable hex values for the dense preview grid.
 */
function formatNullableHex(value?: Hex | null): string {
  return value ? shortenHex(value) : "Unknown";
}
