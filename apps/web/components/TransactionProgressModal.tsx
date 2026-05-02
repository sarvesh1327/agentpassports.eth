"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
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
 * Dark, portal-mounted modal used while a user signs and waits for multi-transaction wallet flows.
 * Register Agent and Delete Passport both use this surface, so keep it page-independent.
 */
export function TransactionProgressModal(props: TransactionProgressModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const hasActiveStep = props.steps.some((step) => step.status === "active");
  const hasError = props.steps.some((step) => step.status === "error");
  const allComplete = props.steps.length > 0 && props.steps.every((step) => step.status === "complete");
  const canClose = Boolean(props.onClose) && (hasError || allComplete);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (!props.isOpen) {
      return;
    }

    document.body.classList.add("tx-progress-modal-open");
    return () => {
      document.body.classList.remove("tx-progress-modal-open");
    };
  }, [props.isOpen]);

  useEffect(() => {
    if (!props.isOpen || !canClose) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        props.onClose?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canClose, props.isOpen, props.onClose]);

  if (!props.isOpen || !portalTarget) {
    return null;
  }

  const modal = (
    <div className="tx-progress-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <div className="tx-progress-modal__backdrop" aria-hidden="true" onClick={canClose ? props.onClose : undefined} />
      <section className="tx-progress-modal__card">
        <div className="tx-progress-modal__header">
          <div>
            <span className={`status-pill status-pill--${hasError ? "danger" : allComplete ? "success" : "info"}`}>
              {hasError ? "Needs attention" : allComplete ? "Complete" : hasActiveStep ? "In progress" : "Ready"}
            </span>
            <h2 id={titleId}>{props.title}</h2>
            <p id={descriptionId} className="tx-progress-modal__description">
              Keep this tab open while your wallet signs and the chain confirms each Passport/Visa transaction.
            </p>
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
              <div className="tx-progress-step__content">
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

  return createPortal(modal, portalTarget);
}

function shortenHash(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}
