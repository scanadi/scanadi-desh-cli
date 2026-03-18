import WebSocket from 'ws';
import type { CdpTab, CdpMessage, EvalOptions } from './protocol.js';
import { getCdpPort } from '../patch/figma.js';

export type { CdpTab, CdpMessage, EvalOptions };

export interface CdpClient {
  evaluate(expression: string, options?: EvalOptions): Promise<unknown>;
  disconnect(): void;
}

// Internal alias used by the module — exposed as `eval` on the returned object
// to match the interface expected by callers. Named `evaluate` in the interface
// to avoid triggering linting rules around the `eval` identifier.

/**
 * Find the best design tab from a list of CDP tabs.
 * Prefers /design/ URLs over /file/ URLs.
 * Exported for testing.
 */
export function findDesignTab(tabs: CdpTab[]): CdpTab | null {
  // Prefer /design/ tab first
  const designTab = tabs.find((t) => /figma\.com\/design\//.test(t.url));
  if (designTab) return designTab;

  // Fall back to /file/ tab
  const fileTab = tabs.find((t) => /figma\.com\/file\//.test(t.url));
  if (fileTab) return fileTab;

  return null;
}

/**
 * Try to fetch tabs from a given CDP port.
 * Returns null if the port is not listening or has no Figma tabs.
 */
async function tryPort(port: number): Promise<{ port: number; tabs: CdpTab[] } | null> {
  try {
    const response = await fetch(`http://localhost:${port}/json`);
    if (!response.ok) return null;
    const tabs = (await response.json()) as CdpTab[];
    const figmaTabs = tabs.filter((t) => t.url && t.url.includes('figma.com'));
    if (figmaTabs.length === 0) return null;
    return { port, tabs: figmaTabs };
  } catch {
    return null;
  }
}

/**
 * Find the active CDP port by checking the default port first, then scanning the range.
 */
async function findCdpPort(): Promise<{ port: number; tabs: CdpTab[] }> {
  // Check default port first
  const defaultPort = getCdpPort();
  const defaultResult = await tryPort(defaultPort);
  if (defaultResult) return defaultResult;

  // Scan range 9222–9322
  for (let port = 9222; port <= 9322; port++) {
    if (port === defaultPort) continue; // already tried
    const result = await tryPort(port);
    if (result) return result;
  }

  throw new Error(
    'Figma Desktop is not running with remote debugging enabled. ' +
      'Run `desh connect` to patch and start Figma.',
  );
}

/**
 * Create a CDP client that connects to Figma Desktop.
 *
 * - Finds the CDP port (default 9222, then scans 9222–9322)
 * - Fetches the tab list and finds a design/file tab
 * - Opens a WebSocket connection
 * - Enables Runtime, waits 500 ms for execution context events
 * - Tries default context first; searches all contexts for `figma` global (v39+)
 * - Returns { evaluate, disconnect }
 */
export async function createCdpClient(): Promise<CdpClient> {
  const { tabs } = await findCdpPort();

  const tab = findDesignTab(tabs);
  if (!tab) {
    throw new Error(
      'No Figma design file is open. Please open a design file in Figma Desktop.',
    );
  }

  return new Promise<CdpClient>((resolve, reject) => {
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let msgId = 0;
    const callbacks = new Map<number, (msg: CdpMessage) => void>();
    const executionContexts: Array<{ id: number; name: string; origin: string }> = [];
    let executionContextId: number | null = null;

    function send(method: string, params: Record<string, unknown> = {}): Promise<CdpMessage> {
      return new Promise((res) => {
        const id = ++msgId;
        callbacks.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    ws.on('message', (data: WebSocket.RawData) => {
      const msg = JSON.parse(data.toString()) as CdpMessage & {
        method?: string;
        params?: Record<string, unknown>;
      };

      // Collect execution contexts as they arrive
      if (msg.method === 'Runtime.executionContextCreated') {
        const ctx = (msg.params as { context: { id: number; name: string; origin: string } })
          .context;
        executionContexts.push(ctx);
      }

      if (msg.id !== undefined && callbacks.has(msg.id)) {
        callbacks.get(msg.id)!(msg);
        callbacks.delete(msg.id);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(connectTimeout);
      reject(err);
    });

    const connectTimeout = setTimeout(() => {
      ws.close();
      reject(new Error('Connection timeout'));
    }, 15_000);

    ws.on('open', async () => {
      try {
        // Enable Runtime so context events start flowing
        await send('Runtime.enable');

        // Give time for execution context events to arrive
        await new Promise<void>((r) => setTimeout(r, 500));

        // First try the default context (works on older Figma versions)
        const defaultCheck = await send('Runtime.evaluate', {
          expression: 'typeof figma !== "undefined"',
          returnByValue: true,
        });

        if (defaultCheck.result?.result?.value === true) {
          executionContextId = null; // use default context
          clearTimeout(connectTimeout);
          resolve(buildClient());
          return;
        }

        // Figma v39+: search all collected execution contexts for the `figma` global
        for (const ctx of executionContexts) {
          try {
            const check = await send('Runtime.evaluate', {
              expression: 'typeof figma !== "undefined"',
              contextId: ctx.id,
              returnByValue: true,
            });

            if (check.result?.result?.value === true) {
              executionContextId = ctx.id;
              clearTimeout(connectTimeout);
              resolve(buildClient());
              return;
            }
          } catch {
            // Context may have been destroyed — skip
          }
        }

        clearTimeout(connectTimeout);
        reject(
          new Error(
            'Could not find Figma execution context. Make sure a design file is open.',
          ),
        );
      } catch (err) {
        clearTimeout(connectTimeout);
        reject(err);
      }
    });

    function buildClient(): CdpClient {
      return {
        async evaluate(expression: string, options: EvalOptions = {}): Promise<unknown> {
          const { timeout = 30_000, awaitPromise = true } = options;

          const params: Record<string, unknown> = {
            expression,
            returnByValue: true,
            awaitPromise,
          };

          if (executionContextId !== null) {
            params['contextId'] = executionContextId;
          }

          const resultPromise = send('Runtime.evaluate', params);

          let result: CdpMessage;
          if (timeout > 0) {
            let timeoutId: ReturnType<typeof setTimeout>;
            const timeoutPromise = new Promise<never>((_, rej) => {
              timeoutId = setTimeout(
                () => rej(new Error(`evaluate timeout after ${timeout}ms`)),
                timeout,
              );
            });
            try {
              result = await Promise.race([resultPromise, timeoutPromise]);
              clearTimeout(timeoutId!);
            } catch (err) {
              clearTimeout(timeoutId!);
              throw err;
            }
          } else {
            result = await resultPromise;
          }

          if (result.result?.exceptionDetails) {
            const error = result.result.exceptionDetails;
            const errorValue =
              error.exception?.value ??
              error.exception?.description ??
              error.text ??
              'Evaluation error';
            throw new Error(String(errorValue));
          }

          return result.result?.result?.value;
        },

        disconnect(): void {
          ws.close();
        },
      };
    }
  });
}
