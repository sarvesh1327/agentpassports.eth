export type RelayerErrorCode =
  | "InvalidRequest"
  | "MissingConfig"
  | "InvalidConfig"
  | "PolicyDisabled"
  | "PolicyExpired"
  | "IntentExpired"
  | "BadNonce"
  | "TargetNotAllowed"
  | "SelectorNotAllowed"
  | "BadCalldataHash"
  | "ValueTooHigh"
  | "ResolverNotSet"
  | "AgentAddressNotSet"
  | "BadSignature"
  | "InsufficientGasBudget"
  | "RelayerError";

export type RelayerErrorBody = {
  status: "error";
  error: RelayerErrorCode;
  details: string;
};

/**
 * Carries stable relayer error codes through validation and HTTP response mapping.
 */
export class RelayerValidationError extends Error {
  readonly code: RelayerErrorCode;
  readonly details: string;
  readonly httpStatus: number;

  constructor(code: RelayerErrorCode, details: string, httpStatus = 400) {
    super(`${code}: ${details}`);
    this.code = code;
    this.details = details;
    this.httpStatus = httpStatus;
  }
}

/**
 * Converts thrown values into the JSON shape returned by the relayer endpoint.
 */
export function relayerErrorResponse(error: unknown): { body: RelayerErrorBody; httpStatus: number } {
  if (error instanceof RelayerValidationError) {
    return {
      body: {
        status: "error",
        error: error.code,
        details: error.details
      },
      httpStatus: error.httpStatus
    };
  }

  return {
    body: {
      status: "error",
      error: "RelayerError",
      details: "Internal relayer error"
    },
    httpStatus: 500
  };
}
