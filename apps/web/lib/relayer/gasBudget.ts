import { RelayerValidationError } from "./errors.ts";

export const DEFAULT_GAS_SAFETY_MULTIPLIER_BPS = 12_000n;

/**
 * Estimates the actual reimbursement needed for a relayed execution and applies the policy cap.
 */
export function estimateExecutionReimbursementWei(input: {
  gasPriceWei: bigint;
  gasSafetyMultiplierBps?: bigint;
  gasUsed: bigint;
  reimbursementCapWei: bigint;
}): bigint {
  const multiplierBps = input.gasSafetyMultiplierBps ?? DEFAULT_GAS_SAFETY_MULTIPLIER_BPS;
  const adjustedGas = (input.gasUsed * multiplierBps + 9_999n) / 10_000n;
  const estimatedReimbursementWei = adjustedGas * input.gasPriceWei;

  return estimatedReimbursementWei > input.reimbursementCapWei
    ? input.reimbursementCapWei
    : estimatedReimbursementWei;
}

/**
 * Rejects relayer submissions that cannot cover the estimated debit for this execution.
 */
export function assertSufficientEstimatedExecutionBudget(input: {
  estimatedReimbursementWei: bigint;
  gasBudgetWei: bigint;
  intentValueWei: bigint;
}): void {
  const requiredBudgetWei = input.intentValueWei + input.estimatedReimbursementWei;
  if (input.gasBudgetWei < requiredBudgetWei) {
    throw new RelayerValidationError(
      "InsufficientGasBudget",
      "Gas budget cannot cover the estimated execution reimbursement"
    );
  }
}
