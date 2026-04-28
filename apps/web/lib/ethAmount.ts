import { formatEther, parseEther } from "viem";

/**
 * Formats wei as ETH without rounding a nonzero value down to 0 ETH.
 */
export function formatWeiAsEth(value?: bigint): string {
  if (value === undefined) {
    return "Unknown";
  }

  return `${formatWeiAsEthValue(value)} ETH`;
}

/**
 * Formats a wei string for an editable ETH input while preserving small nonzero values.
 */
export function formatWeiInputAsEth(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+$/u.test(trimmed)) {
    return "";
  }

  return formatWeiAsEthValue(BigInt(trimmed));
}

/**
 * Parses an ETH-denominated form value into wei, returning zero while input is invalid or incomplete.
 */
export function parseEthInputToWei(value: string): bigint {
  const normalized = normalizeEthInput(value);
  if (!normalized) {
    return 0n;
  }

  try {
    return parseEther(normalized);
  } catch {
    return 0n;
  }
}

/**
 * Parses an ETH-denominated form value into a wei string for contract calldata builders.
 */
export function parseEthInputToWeiString(value: string): string {
  return parseEthInputToWei(value).toString();
}

/**
 * Returns the raw ETH decimal string used inside formatted labels and inputs.
 */
function formatWeiAsEthValue(value: bigint): string {
  const formatted = formatEther(value);
  if (!formatted.includes(".")) {
    return formatted;
  }

  return formatted.replace(/0+$/u, "").replace(/\.$/u, "") || "0";
}

/**
 * Normalizes user-entered ETH decimals and rejects values with more precision than wei supports.
 */
function normalizeEthInput(value: string): `${number}` | null {
  const trimmed = value.trim();
  if (!/^(?:\d+\.?\d*|\.\d+)$/u.test(trimmed)) {
    return null;
  }

  const [, fraction = ""] = trimmed.split(".");
  if (fraction.length > 18) {
    return null;
  }

  if (trimmed.startsWith(".")) {
    return `0${trimmed}` as `${number}`;
  }

  if (trimmed.endsWith(".")) {
    return trimmed.slice(0, -1) as `${number}`;
  }

  return trimmed as `${number}`;
}
