const DEFAULT_ATTEMPTS = 3;
const BASE_DELAY_MS    = 800;

/**
 * Retries `fn` up to `attempts` times with exponential backoff.
 * Aborts immediately on non-retryable errors (400-level except 429).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = DEFAULT_ATTEMPTS,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (isClientError(err)) throw err;
      if (i < attempts - 1) {
        await sleep(BASE_DELAY_MS * 2 ** i);
      }
    }
  }
  throw lastErr;
}

function isClientError(err: unknown): boolean {
  // Prefer a typed status property (set by most HTTP client errors)
  const status = (err as { status?: number; statusCode?: number }).status
    ?? (err as { statusCode?: number }).statusCode;
  if (typeof status === "number") return status >= 400 && status < 500 && status !== 429;
  // Fall back to message heuristic for plain fetch errors that embed the status in text
  const msg = String(err);
  return /\bHTTP [4][0-9]{2}\b/.test(msg) && !/\b429\b/.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
