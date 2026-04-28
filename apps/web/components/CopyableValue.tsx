"use client";

import { useState } from "react";

export type ExplorerKind = "address" | "tx";

export type CopyableValueProps = {
  explorerKind?: ExplorerKind;
  fullValue?: string | null;
  label: string;
  value: string;
};

const SEPOLIA_EXPLORER_BASE_URL = "https://sepolia.etherscan.io";

/**
 * Renders dense proof values with copy and Sepolia explorer actions.
 */
export function CopyableValue(props: CopyableValueProps) {
  const [copied, setCopied] = useState(false);
  const copyValue = props.fullValue ?? props.value;
  const explorerHref = props.explorerKind && props.fullValue ? buildExplorerHref(props.explorerKind, props.fullValue) : null;

  /**
   * Copies the unshortened value without blocking the page if clipboard access is unavailable.
   */
  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className="copyable-value">
      <span className="copyable-value__text" title={props.fullValue ?? undefined}>
        {props.value}
      </span>
      <button aria-label={`Copy ${props.label}`} onClick={copyToClipboard} type="button">
        {copied ? "Copied" : "Copy"}
      </button>
      {explorerHref ? (
        <a href={explorerHref} rel="noreferrer" target="_blank">
          View
        </a>
      ) : null}
    </span>
  );
}

/**
 * Builds the Sepolia Etherscan URL for values judges commonly inspect during the demo.
 */
function buildExplorerHref(kind: ExplorerKind, value: string): string {
  return `${SEPOLIA_EXPLORER_BASE_URL}/${kind}/${value}`;
}
