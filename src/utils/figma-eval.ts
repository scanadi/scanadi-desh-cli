import { createBridgeClient, ensureBridgeServer } from '../bridge/client.js';

/**
 * Execute a JS expression in Figma via the bridge plugin and return the result.
 * Automatically ensures bridge server is running, sends code, and returns.
 * Retries once (after 2s) on connection-level errors.
 * Execution errors (syntax errors, Figma API errors) are NOT retried.
 */
export async function runFigmaCode<T = unknown>(code: string, timeout = 30_000): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await ensureBridgeServer();
      const client = createBridgeClient();
      const result = await client.evaluate(code, { timeout });
      return result as T;
    } catch (err) {
      lastError = err as Error;
      const msg = lastError.message.toLowerCase();
      // Only retry on connection errors, not execution errors
      if (
        msg.includes('econnrefused') ||
        msg.includes('fetch failed') ||
        msg.includes('failed to start') ||
        msg.includes('plugin disconnected') ||
        msg.includes('timed out')
      ) {
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error('Failed after retries');
}
