"use client";

import { UiIcon } from "./icons/UiIcons";

export type TransactionProgressStepStatus = "pending" | "active" | "complete" | "error";

export type TransactionProgressStep = {
  description?: string;
  hash?: string;
  label: string;
  status: TransactionProgressStepStatus;
};

type TransactionProgressModalProps = {
  isOpen: boolean;
  onClose?: () => void;
  steps: readonly TransactionProgressStep[];
  title: string;
};

/**
 * Modal used while a user signs and waits for multi-transaction wallet flows.
 */
export function TransactionProgressModal(props: TransactionProgressModalProps) {
  if (!props.isOpen) {
    return null;
  }

  const hasActiveStep = props.steps.some((step) => step.status === "active");
  const hasError = props.steps.some((step) => step.status === "error");
  const allComplete = props.steps.length > 0 && props.steps.every((step) => step.status === "complete");
  const canClose = Boolean(props.onClose) && (hasError || allComplete);

  return (
    <div className="tx-progress-modal" role="dialog" aria-modal="true" aria-labelledby="tx-progress-title">
      <div className="tx-progress-modal__backdrop" />
      <section className="tx-progress-modal__card glass-panel">
        <div className="tx-progress-modal__header">
          <div>
            <span className={`status-pill status-pill--${hasError ? "danger" : allComplete ? "success" : "info"}`}>
              {hasError ? "Needs attention" : allComplete ? "Complete" : hasActiveStep ? "In progress" : "Ready"}
            </span>
            <h2 id="tx-progress-title">{props.title}</h2>
          </div>
          {canClose ? (
            <button className="tx-progress-modal__close" type="button" onClick={props.onClose} aria-label="Close transaction progress">
              ×
            </button>
          ) : null}
        </div>

        <ol className="tx-progress-modal__steps">
          {props.steps.map((step, index) => (
            <li className={`tx-progress-step tx-progress-step--${step.status}`} key={`${step.label}-${index}`}>
              <span className="tx-progress-step__icon" aria-hidden="true">
                {step.status === "complete" ? <UiIcon name="check" size={16} /> : step.status === "error" ? <UiIcon name="warning" size={16} /> : index + 1}
              </span>
              <div>
                <strong>{step.label}</strong>
                {step.description ? <p>{step.description}</p> : null}
                {step.hash ? <code title={step.hash}>{shortenHash(step.hash)}</code> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function shortenHash(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}
