import { createBridgeClient, ensureBridgeServer } from '../bridge/client.js';
import { createCdpClient } from '../cdp/client.js';

/**
 * Check whether CDP mode is enabled via --cdp flag or DESH_USE_CDP env var.
 */
export function isCdpMode(): boolean {
  return process.env['DESH_USE_CDP'] === '1' || process.argv.includes('--cdp');
}

/**
 * Execute a JS expression in Figma and return the result.
 *
 * In CDP mode (DESH_USE_CDP=1 or --cdp flag): connects directly to Figma
 * via Chrome DevTools Protocol. Faster but requires patching Figma first.
 *
 * In bridge mode (default): uses the plugin bridge server.
 *
 * Retries once (after 2s) on connection-level errors.
 * Execution errors (syntax errors, Figma API errors) are NOT retried.
 */
export async function runFigmaCode<T = unknown>(code: string, timeout = 30_000): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (isCdpMode()) {
        const client = await createCdpClient();
        try {
          const result = await client.evaluate(code, { timeout });
          return result as T;
        } finally {
          client.disconnect();
        }
      } else {
        await ensureBridgeServer();
        const client = createBridgeClient();
        const result = await client.evaluate(code, { timeout });
        return result as T;
      }
    } catch (err) {
      lastError = err as Error;
      const msg = lastError.message.toLowerCase();
      // Only retry on connection errors, not execution errors
      if (
        msg.includes('econnrefused') ||
        msg.includes('fetch failed') ||
        msg.includes('failed to start') ||
        msg.includes('plugin disconnected') ||
        msg.includes('timed out') ||
        msg.includes('connection timeout') ||
        msg.includes('not running with remote debugging')
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
