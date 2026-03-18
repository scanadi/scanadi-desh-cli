import { createCdpClient } from '../cdp/client.js';

/**
 * Evaluate a JS expression in Figma via CDP and return the result.
 * Automatically connects, evaluates, and disconnects.
 * Retries once (after 2s) on connection-level errors (timeout, ECONNREFUSED, WebSocket).
 * Eval errors (syntax errors, Figma API errors) are NOT retried.
 */
export async function runFigmaCode<T = unknown>(code: string, timeout = 30_000): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const client = await createCdpClient();
      try {
        const result = await client.evaluate(code, { timeout });
        return result as T;
      } finally {
        client.disconnect();
      }
    } catch (err) {
      lastError = err as Error;
      const msg = lastError.message.toLowerCase();
      // Only retry on connection errors, not eval errors
      if (
        msg.includes('connection timeout') ||
        msg.includes('not running') ||
        msg.includes('econnrefused') ||
        msg.includes('websocket')
      ) {
        if (attempt === 0) {
          // Wait a moment and retry once
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error('Failed after retries');
}
