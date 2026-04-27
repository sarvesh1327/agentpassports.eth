/**
 * Converts blank public RPC settings into an unset value so Wagmi can use its default Sepolia transport.
 */
export function normalizePublicRpcUrl(publicRpcUrl: string | undefined): string | undefined {
  const normalizedUrl = publicRpcUrl?.trim();
  if (normalizedUrl === undefined || normalizedUrl.length === 0) {
    return undefined;
  }
  return normalizedUrl;
}
