export const REQUEST_TIMEOUT_MS = 30_000;
export const MAX_RETRIES = 5;

export function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|network|socket/i.test(String(e));
}
