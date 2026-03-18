import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import type { ExecResponseBody, PidFile } from './types.js';
import { DEFAULT_BRIDGE_PORT, PID_FILE_DIR, PID_FILE_NAME } from './types.js';

export interface BridgeClient {
  evaluate(expression: string, options?: { timeout?: number; awaitPromise?: boolean }): Promise<unknown>;
  disconnect(): void;
}

/**
 * Create a bridge client that sends code to the bridge server via HTTP.
 * Synchronous creation — no WebSocket handshake needed.
 */
export function createBridgeClient(port?: number): BridgeClient {
  const resolvedPort = port ?? getBridgePort();

  return {
    async evaluate(expression, options = {}) {
      const { timeout = 30_000 } = options;

      const res = await fetch(`http://localhost:${resolvedPort}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: expression, timeout }),
        signal: AbortSignal.timeout(timeout + 2000),
      });

      const body = (await res.json()) as ExecResponseBody;

      if (!body.ok) {
        throw new Error(body.error ?? 'Bridge execution failed');
      }

      return body.result;
    },

    disconnect() {
      // HTTP is stateless — nothing to disconnect
    },
  };
}

/**
 * Check if the bridge server is running and reachable.
 */
export async function isBridgeRunning(port?: number): Promise<boolean> {
  const resolvedPort = port ?? getBridgePort();
  try {
    const res = await fetch(`http://localhost:${resolvedPort}/status`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check if a Figma plugin is connected to the bridge.
 */
export async function isPluginConnected(port?: number): Promise<boolean> {
  const resolvedPort = port ?? getBridgePort();
  try {
    const res = await fetch(`http://localhost:${resolvedPort}/status`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { pluginConnected: boolean };
    return body.pluginConnected;
  } catch {
    return false;
  }
}

/**
 * Get the bridge port from PID file or return default.
 */
function getBridgePort(): number {
  const pidPath = join(homedir(), PID_FILE_DIR, PID_FILE_NAME);
  if (!existsSync(pidPath)) return DEFAULT_BRIDGE_PORT;
  try {
    const data = JSON.parse(readFileSync(pidPath, 'utf8')) as PidFile;
    return data.port;
  } catch {
    return DEFAULT_BRIDGE_PORT;
  }
}

/**
 * Ensure the bridge server is running. Starts it if not.
 * Returns the port number.
 */
export async function ensureBridgeServer(): Promise<number> {
  const port = getBridgePort();

  if (await isBridgeRunning(port)) {
    return port;
  }

  // Start bridge server as a detached child process
  const serverModulePath = join(
    dirname(fileURLToPath(import.meta.url)),
    'server-entry.js',
  );

  const child = fork(serverModulePath, [], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, DESH_BRIDGE_PORT: String(DEFAULT_BRIDGE_PORT) },
  });
  child.unref();

  // Wait for it to come up (max 5s)
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (await isBridgeRunning()) return getBridgePort();
    await new Promise((r) => setTimeout(r, 200));
  }

  throw new Error('Failed to start bridge server');
}
