import type { Hex } from "@agentpassport/config";

/**
 * Trims and validates an address typed or pasted into a wallet transaction form.
 */
export function normalizeAddressInput(value: string): Hex | null {
  const normalized = value.trim();
  return /^0x[0-9a-fA-F]{40}$/u.test(normalized) ? (normalized as Hex) : null;
}
