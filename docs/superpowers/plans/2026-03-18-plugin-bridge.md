# Plugin Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CDP binary patching with a Figma plugin bridge so desh requires no patching, no Full Disk Access, and complies with Figma's ToS.

**Architecture:** A lightweight bridge server (HTTP + WS) runs locally. The Figma plugin connects via WebSocket. CLI commands send HTTP requests to the server, which forwards them to the plugin for execution. The `{ evaluate, disconnect }` interface stays identical.

**Tech Stack:** Node.js built-in `http`/`net`, `ws` (existing dep), vanilla JS for plugin, vitest for tests.

**Design doc:** `docs/plans/2026-03-18-plugin-bridge-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/bridge/server.ts` | Bridge server: HTTP endpoint for CLI, WS endpoint for plugin, idle timeout, PID file |
| `src/bridge/client.ts` | Bridge client: HTTP calls to server, same `{ evaluate, disconnect }` interface as CdpClient |
| `src/bridge/types.ts` | Shared types for bridge protocol messages |
| `plugin/manifest.json` | Figma plugin manifest (v4) |
| `plugin/code.js` | Plugin sandbox: receives code, executes, returns result |
| `plugin/ui.html` | Plugin UI: WS client ↔ sandbox postMessage bridge |
| `tests/bridge/server.test.ts` | Unit tests for bridge server |
| `tests/bridge/client.test.ts` | Unit tests for bridge client |

Modified files:
| File | Change |
|------|--------|
| `src/utils/figma-eval.ts` | Import `createBridgeClient` instead of `createCdpClient` |
| `src/commands/connect.ts` | New flow: start server, check plugin |
| `src/commands/eval.ts` | Import `createBridgeClient` instead of `createCdpClient` |
| `src/commands/render.ts` | Import `createBridgeClient` instead of `createCdpClient` |
| `src/commands/tokens.ts` | Import `createBridgeClient` instead of `createCdpClient` |

---

### Task 1: Bridge Protocol Types

**Files:**
- Create: `src/bridge/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/bridge/types.ts

/** Message from CLI server → plugin via WS */
export interface BridgeRequest {
  id: string;
  type: 'exec';
  code: string;
  timeout: number;
}

/** Message from plugin → CLI server via WS */
export interface BridgeResponse {
  id: string;
  type: 'result' | 'error';
  value?: unknown;
  message?: string;
}

/** HTTP request body: CLI command → bridge server */
export interface ExecRequestBody {
  code: string;
  timeout?: number;
}

/** HTTP response body: bridge server → CLI command */
export interface ExecResponseBody {
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** Server status response */
export interface StatusResponse {
  ok: boolean;
  pluginConnected: boolean;
  uptime: number;
}

/** PID file contents */
export interface PidFile {
  pid: number;
  port: number;
  startedAt: string;
}

export const DEFAULT_BRIDGE_PORT = 9001;
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const PID_FILE_DIR = '.desh';
export const PID_FILE_NAME = 'bridge.pid';
```

- [ ] **Step 2: Commit**

```bash
git add src/bridge/types.ts
git commit -m "feat(bridge): add protocol types for plugin bridge"
```

---

### Task 2: Bridge Server

**Files:**
- Create: `src/bridge/server.ts`
- Test: `tests/bridge/server.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/bridge/server.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { startBridgeServer, type BridgeServer } from '../../src/bridge/server.js';

describe('BridgeServer', () => {
  let server: BridgeServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  it('starts and responds to /status', async () => {
    server = await startBridgeServer({ port: 0, idleTimeoutMs: 60_000, writePidFile: false });
    const port = server.port;

    const res = await fetch(`http://localhost:${port}/status`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.pluginConnected).toBe(false);
  });

  it('returns 503 on /exec when no plugin connected', async () => {
    server = await startBridgeServer({ port: 0, idleTimeoutMs: 60_000, writePidFile: false });
    const port = server.port;

    const res = await fetch(`http://localhost:${port}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'figma.currentPage.name', timeout: 5000 }),
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('plugin');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bridge/server.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the bridge server**

```typescript
// src/bridge/server.ts
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type {
  BridgeRequest,
  BridgeResponse,
  ExecRequestBody,
  ExecResponseBody,
  StatusResponse,
  PidFile,
} from './types.js';
import {
  DEFAULT_BRIDGE_PORT,
  IDLE_TIMEOUT_MS,
  PID_FILE_DIR,
  PID_FILE_NAME,
} from './types.js';

export interface BridgeServerOptions {
  port?: number;
  idleTimeoutMs?: number;
  writePidFile?: boolean;
}

export interface BridgeServer {
  port: number;
  stop(): Promise<void>;
}

export async function startBridgeServer(
  options: BridgeServerOptions = {},
): Promise<BridgeServer> {
  const {
    port = DEFAULT_BRIDGE_PORT,
    idleTimeoutMs = IDLE_TIMEOUT_MS,
    writePidFile = true,
  } = options;

  let pluginSocket: WebSocket | null = null;
  const pendingRequests = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  // Idle timeout
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const startTime = Date.now();

  function resetIdleTimer(): void {
    if (idleTimer) clearTimeout(idleTimer);
    if (idleTimeoutMs > 0) {
      idleTimer = setTimeout(() => {
        server.close();
        wss.close();
        removePidFile();
      }, idleTimeoutMs);
    }
  }

  // HTTP server
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    resetIdleTimer();

    // CORS headers for plugin UI
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/status') {
      const status: StatusResponse = {
        ok: true,
        pluginConnected: pluginSocket !== null && pluginSocket.readyState === WebSocket.OPEN,
        uptime: Date.now() - startTime,
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
      return;
    }

    if (req.method === 'POST' && req.url === '/exec') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        handleExec(body, res);
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  });

  // WebSocket server (same port, upgrade)
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    // Only allow one plugin connection at a time
    if (pluginSocket && pluginSocket.readyState === WebSocket.OPEN) {
      pluginSocket.close();
    }
    pluginSocket = ws;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as BridgeResponse;
        const pending = pendingRequests.get(msg.id);
        if (!pending) return;

        clearTimeout(pending.timer);
        pendingRequests.delete(msg.id);

        if (msg.type === 'error') {
          pending.reject(new Error(msg.message ?? 'Plugin execution error'));
        } else {
          pending.resolve(msg.value);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      if (pluginSocket === ws) pluginSocket = null;
      // Reject all pending requests
      for (const [id, pending] of pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Plugin disconnected'));
        pendingRequests.delete(id);
      }
    });
  });

  function handleExec(rawBody: string, res: ServerResponse): void {
    let parsed: ExecRequestBody;
    try {
      parsed = JSON.parse(rawBody) as ExecRequestBody;
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' } satisfies ExecResponseBody));
      return;
    }

    if (!pluginSocket || pluginSocket.readyState !== WebSocket.OPEN) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: false,
          error: 'No Figma plugin connected. Open Figma → Plugins → desh → Run',
        } satisfies ExecResponseBody),
      );
      return;
    }

    const id = randomUUID();
    const timeout = parsed.timeout ?? 30_000;

    const request: BridgeRequest = {
      id,
      type: 'exec',
      code: parsed.code,
      timeout,
    };

    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: false,
          error: `Execution timed out after ${timeout}ms`,
        } satisfies ExecResponseBody),
      );
    }, timeout + 1000); // +1s buffer for WS overhead

    pendingRequests.set(id, {
      resolve: (value) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result: value } satisfies ExecResponseBody));
      },
      reject: (err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ ok: false, error: err.message } satisfies ExecResponseBody),
        );
      },
      timer,
    });

    pluginSocket.send(JSON.stringify(request));
  }

  // PID file management
  function writePid(actualPort: number): void {
    if (!writePidFile) return;
    const dir = join(homedir(), PID_FILE_DIR);
    mkdirSync(dir, { recursive: true });
    const pidData: PidFile = {
      pid: process.pid,
      port: actualPort,
      startedAt: new Date().toISOString(),
    };
    writeFileSync(join(dir, PID_FILE_NAME), JSON.stringify(pidData));
  }

  function removePidFile(): void {
    if (!writePidFile) return;
    const path = join(homedir(), PID_FILE_DIR, PID_FILE_NAME);
    try {
      unlinkSync(path);
    } catch {
      // File may not exist
    }
  }

  // Start listening
  return new Promise<BridgeServer>((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      writePid(actualPort);
      resetIdleTimer();

      resolve({
        port: actualPort,
        async stop() {
          if (idleTimer) clearTimeout(idleTimer);
          for (const [, pending] of pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(new Error('Server stopping'));
          }
          pendingRequests.clear();
          wss.close();
          removePidFile();
          return new Promise<void>((res) => server.close(() => res()));
        },
      });
    });
  });
}

/** Read the PID file and return its contents, or null if not found / stale. */
export function readPidFile(): PidFile | null {
  const path = join(homedir(), PID_FILE_DIR, PID_FILE_NAME);
  if (!existsSync(path)) return null;
  try {
    const { readFileSync } = await import('fs');
    const data = JSON.parse(readFileSync(path, 'utf8')) as PidFile;
    // Check if process is alive
    try {
      process.kill(data.pid, 0);
      return data;
    } catch {
      // Process is dead — stale PID file
      unlinkSync(path);
      return null;
    }
  } catch {
    return null;
  }
}
```

Wait — `readPidFile` uses top-level await import which won't work. Let me fix that in the actual implementation. The `readFileSync` is already imported at the top. I'll use the existing import. Here's the corrected `readPidFile`:

```typescript
export function readPidFile(): PidFile | null {
  const path = join(homedir(), PID_FILE_DIR, PID_FILE_NAME);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf8');
    const data = JSON.parse(raw) as PidFile;
    // Check if process is alive
    try {
      process.kill(data.pid, 0);
      return data;
    } catch {
      // Process is dead — stale PID file
      try { unlinkSync(path); } catch {}
      return null;
    }
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bridge/server.test.ts`
Expected: 2 passing

- [ ] **Step 5: Commit**

```bash
git add src/bridge/server.ts tests/bridge/server.test.ts
git commit -m "feat(bridge): add bridge server with HTTP + WS endpoints"
```

---

### Task 3: Bridge Client

**Files:**
- Create: `src/bridge/client.ts`
- Test: `tests/bridge/client.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/bridge/client.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { startBridgeServer, type BridgeServer } from '../../src/bridge/server.js';
import { createBridgeClient } from '../../src/bridge/client.js';
import type { BridgeRequest } from '../../src/bridge/types.js';

describe('BridgeClient', () => {
  let server: BridgeServer;
  let pluginWs: WebSocket;

  beforeAll(async () => {
    server = await startBridgeServer({ port: 0, idleTimeoutMs: 60_000, writePidFile: false });

    // Simulate plugin connection
    pluginWs = new WebSocket(`ws://localhost:${server.port}`);
    await new Promise<void>((resolve) => pluginWs.on('open', resolve));

    // Plugin echoes back results
    pluginWs.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as BridgeRequest;
      if (msg.type === 'exec') {
        pluginWs.send(JSON.stringify({
          id: msg.id,
          type: 'result',
          value: `executed: ${msg.code}`,
        }));
      }
    });
  });

  afterAll(async () => {
    pluginWs?.close();
    await server?.stop();
  });

  it('evaluate sends code and returns result', async () => {
    const client = createBridgeClient(server.port);
    const result = await client.evaluate('test-code');
    expect(result).toBe('executed: test-code');
    client.disconnect();
  });

  it('evaluate respects timeout option', async () => {
    const client = createBridgeClient(server.port);
    const result = await client.evaluate('test', { timeout: 5000 });
    expect(result).toBe('executed: test');
    client.disconnect();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bridge/client.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the bridge client**

```typescript
// src/bridge/client.ts
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { ExecResponseBody, PidFile } from './types.js';
import { DEFAULT_BRIDGE_PORT, PID_FILE_DIR, PID_FILE_NAME } from './types.js';

export interface BridgeClient {
  evaluate(expression: string, options?: { timeout?: number; awaitPromise?: boolean }): Promise<unknown>;
  disconnect(): void;
}

/**
 * Create a bridge client that sends code to the bridge server via HTTP.
 * The server forwards it to the connected Figma plugin for execution.
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
        signal: AbortSignal.timeout(timeout + 2000), // HTTP timeout > exec timeout
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
```

- [ ] **Step 4: Create the server entry point for detached process**

```typescript
// src/bridge/server-entry.ts
import { startBridgeServer } from './server.js';
import { DEFAULT_BRIDGE_PORT } from './types.js';

const port = parseInt(process.env['DESH_BRIDGE_PORT'] ?? '', 10) || DEFAULT_BRIDGE_PORT;

startBridgeServer({ port }).then((server) => {
  // Keep process alive — server handles idle shutdown
  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/bridge/client.test.ts`
Expected: 2 passing

- [ ] **Step 6: Commit**

```bash
git add src/bridge/client.ts src/bridge/server-entry.ts tests/bridge/client.test.ts
git commit -m "feat(bridge): add bridge client with auto-start and HTTP transport"
```

---

### Task 4: Figma Plugin

**Files:**
- Create: `plugin/manifest.json`
- Create: `plugin/code.js`
- Create: `plugin/ui.html`

- [ ] **Step 1: Create plugin manifest**

```json
{
  "name": "desh",
  "id": "desh-bridge",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "documentAccess": "dynamic-page",
  "editorType": ["figma"],
  "networkAccess": {
    "allowedDomains": ["localhost"],
    "reasoning": "Connects to local desh bridge server for CLI communication"
  }
}
```

- [ ] **Step 2: Create plugin sandbox code**

```javascript
// plugin/code.js

// Show the UI (hidden — just a WS bridge, no visible window needed)
figma.showUI(__html__, { visible: false, width: 0, height: 0 });

figma.ui.onMessage = async (msg) => {
  if (msg.type !== 'exec') return;

  try {
    // Execute code in Figma plugin context where figma.* is available
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(msg.code);
    const result = await fn();
    figma.ui.postMessage({ id: msg.id, type: 'result', value: result });
  } catch (err) {
    figma.ui.postMessage({
      id: msg.id,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

// Keep plugin alive
figma.on('close', () => {});
```

- [ ] **Step 3: Create plugin UI (WS bridge)**

```html
<!-- plugin/ui.html -->
<!DOCTYPE html>
<html>
<head><style>body { font: 12px sans-serif; padding: 8px; }</style></head>
<body>
  <div id="status">Connecting to desh...</div>
  <script>
    const PORT = 9001;
    const statusEl = document.getElementById('status');
    let ws = null;
    let reconnectTimer = null;

    function connect() {
      ws = new WebSocket(`ws://localhost:${PORT}`);

      ws.onopen = () => {
        statusEl.textContent = 'Connected to desh bridge';
        statusEl.style.color = '#22c55e';
        if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'exec') {
            // Forward to plugin sandbox
            parent.postMessage({ pluginMessage: msg }, '*');
          }
        } catch (e) {
          // ignore malformed
        }
      };

      ws.onclose = () => {
        statusEl.textContent = 'Disconnected. Reconnecting...';
        statusEl.style.color = '#ef4444';
        scheduleReconnect();
      };

      ws.onerror = () => {
        statusEl.textContent = 'Connection error. Is desh running?';
        statusEl.style.color = '#ef4444';
      };
    }

    function scheduleReconnect() {
      if (reconnectTimer) return;
      reconnectTimer = setInterval(() => {
        if (!ws || ws.readyState === WebSocket.CLOSED) {
          connect();
        }
      }, 3000);
    }

    // Receive results from sandbox, forward to server
    window.onmessage = (event) => {
      const msg = event.data?.pluginMessage;
      if (!msg || !msg.id) return;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };

    connect();
  </script>
</body>
</html>
```

- [ ] **Step 4: Commit**

```bash
git add plugin/manifest.json plugin/code.js plugin/ui.html
git commit -m "feat(plugin): add Figma bridge plugin for desh CLI communication"
```

---

### Task 5: Update figma-eval.ts

**Files:**
- Modify: `src/utils/figma-eval.ts`

- [ ] **Step 1: Replace CDP import with bridge import**

Replace the entire file contents:

```typescript
// src/utils/figma-eval.ts
import { createBridgeClient, ensureBridgeServer } from '../bridge/client.js';

/**
 * Execute a JS expression in Figma via the bridge plugin and return the result.
 * Automatically ensures bridge server is running, sends code, and returns.
 * Retries once (after 2s) on connection-level errors.
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
```

- [ ] **Step 2: Run existing tests to check nothing breaks in codegen/scanner layers**

Run: `npx vitest run`
Expected: All existing tests pass (codegen, scanner, registry, config tests are unaffected)

- [ ] **Step 3: Commit**

```bash
git add src/utils/figma-eval.ts
git commit -m "refactor: switch figma-eval from CDP to bridge client"
```

---

### Task 6: Update Direct CDP Consumers

**Files:**
- Modify: `src/commands/eval.ts`
- Modify: `src/commands/render.ts`
- Modify: `src/commands/tokens.ts`

- [ ] **Step 1: Update eval.ts**

In `src/commands/eval.ts`, change line 2:

Old: `import { createCdpClient } from '../cdp/client.js';`
New: `import { createBridgeClient, ensureBridgeServer } from '../bridge/client.js';`

And in the action handler, change:
Old: `const client = await createCdpClient();`
New:
```typescript
await ensureBridgeServer();
const client = createBridgeClient();
```

- [ ] **Step 2: Update render.ts**

In `src/commands/render.ts`, change line 2:

Old: `import { createCdpClient } from '../cdp/client.js';`
New: `import { createBridgeClient, ensureBridgeServer } from '../bridge/client.js';`

In the `render` action (line 13):
Old: `const client = await createCdpClient();`
New:
```typescript
await ensureBridgeServer();
const client = createBridgeClient();
```

In the `render-batch` action (line 40):
Old: `const client = await createCdpClient();`
New:
```typescript
await ensureBridgeServer();
const client = createBridgeClient();
```

- [ ] **Step 3: Update tokens.ts**

In `src/commands/tokens.ts`, change line 5:

Old: `import { createCdpClient } from '../cdp/client.js';`
New: `import { createBridgeClient, ensureBridgeServer } from '../bridge/client.js';`

In the action handler (line 31):
Old: `const client = await createCdpClient();`
New:
```typescript
await ensureBridgeServer();
const client = createBridgeClient();
```

- [ ] **Step 4: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/commands/eval.ts src/commands/render.ts src/commands/tokens.ts
git commit -m "refactor: switch eval, render, tokens commands from CDP to bridge"
```

---

### Task 7: Rewrite Connect Command

**Files:**
- Modify: `src/commands/connect.ts`

- [ ] **Step 1: Rewrite connect.ts**

```typescript
// src/commands/connect.ts
import type { Command } from 'commander';
import { ensureBridgeServer, isBridgeRunning, isPluginConnected, createBridgeClient } from '../bridge/client.js';
import { success, error, info, warn } from '../utils/output.js';

export function registerConnectCommand(program: Command): void {
  program
    .command('connect')
    .description('Start bridge server and verify plugin connection')
    .action(async () => {
      try {
        // 1. Ensure bridge server is running
        if (await isBridgeRunning()) {
          info('Bridge server already running');
        } else {
          info('Starting bridge server...');
          await ensureBridgeServer();
          success('Bridge server started');
        }

        // 2. Check if plugin is connected
        if (!(await isPluginConnected())) {
          warn('No Figma plugin connected.');
          info('Open Figma → Plugins → desh → Run');
          info('Then run `desh connect` again to verify.');
          return;
        }

        // 3. Verify by executing code
        const client = createBridgeClient();
        const pageInfo = (await client.evaluate(`(function() {
          return { name: figma.currentPage.name, id: figma.currentPage.id };
        })()`)) as { name: string; id: string } | undefined;

        success(pageInfo ? `Connected to "${pageInfo.name}"` : 'Connected to Figma');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  program
    .command('disconnect')
    .description('Stop the bridge server')
    .action(async () => {
      try {
        const port = 9001; // default
        if (!(await isBridgeRunning(port))) {
          info('Bridge server is not running');
          return;
        }
        // Send shutdown request (read PID file and kill)
        const { readPidFile } = await import('../bridge/server.js');
        const pid = readPidFile();
        if (pid) {
          try {
            process.kill(pid.pid, 'SIGTERM');
            success('Bridge server stopped');
          } catch {
            warn('Could not stop bridge server — it may have already exited');
          }
        } else {
          warn('No PID file found');
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
```

- [ ] **Step 2: Register disconnect command in cli.ts**

No change needed — `registerConnectCommand` already registers under the same function. The `disconnect` subcommand is added in the same registration call.

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/commands/connect.ts
git commit -m "refactor: rewrite connect command for plugin bridge (no patching)"
```

---

### Task 8: Update Package Config and Clean Up

**Files:**
- Modify: `package.json` — add `plugin` to files array so it ships with npm
- Modify: `tsconfig.json` — exclude `plugin/` from TS compilation (it's vanilla JS)

- [ ] **Step 1: Update package.json files array**

In `package.json`, change the `files` array:

Old: `["dist", "LICENSE", "README.md"]`
New: `["dist", "plugin", "LICENSE", "README.md"]`

Also update keywords — remove `"cdp"`, add `"plugin"`:

Old keywords include `"cdp"`.
New: replace `"cdp"` with `"figma-plugin"`.

- [ ] **Step 2: Exclude plugin from tsconfig**

In `tsconfig.json`, add `"plugin"` to the exclude array:

Old: `"exclude": ["node_modules", "dist", ".reference"]`
New: `"exclude": ["node_modules", "dist", ".reference", "plugin"]`

- [ ] **Step 3: Verify full build**

Run: `npm run build && npx tsc --noEmit`
Expected: Clean build, no errors

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new bridge tests)

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json
git commit -m "chore: include plugin in package, exclude from TS compilation"
```

---

### Task 9: Update CLAUDE.md and Error Messages

**Files:**
- Modify: `CLAUDE.md` — update Connection section

- [ ] **Step 1: Update CLAUDE.md connection section**

Replace the Connection section with:

```markdown
## Connection

Uses a Figma plugin bridge. No binary patching, no special permissions needed.

\`\`\`bash
desh connect
\`\`\`

1. Starts a local bridge server (auto-managed, exits after 5min idle)
2. Checks if the desh plugin is running in Figma
3. If not: prompts to open Figma → Plugins → desh → Run

Each command auto-starts the bridge server if needed. The plugin must be running in Figma.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update connection docs for plugin bridge architecture"
```

---

### Task 10: Smoke Test

This is a manual verification task. Requires Figma Desktop.

- [ ] **Step 1: Build**

Run: `npm run build`

- [ ] **Step 2: Install plugin in Figma**

In Figma Desktop: Plugins → Development → Import plugin from manifest → select `plugin/manifest.json`

- [ ] **Step 3: Test connect flow**

```bash
desh connect
# Expected: "Starting bridge server... Bridge server started"
# Expected: "No Figma plugin connected. Open Figma → Plugins → desh → Run"
```

Run the desh plugin in Figma, then:

```bash
desh connect
# Expected: "Connected to 'Page Name'"
```

- [ ] **Step 4: Test basic commands**

```bash
desh eval "figma.currentPage.name"
desh canvas info
desh find "Frame"
```

- [ ] **Step 5: Test render**

```bash
desh render '<Frame w={200} h={100} bg="#3b82f6" rounded={8}><Text color="#fff" size={16}>Bridge works!</Text></Frame>'
desh verify
```

- [ ] **Step 6: Commit any fixes if needed**
