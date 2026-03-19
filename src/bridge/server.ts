import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type {
  BridgeRequest,
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

  // Queue of exec requests waiting for the plugin to pick them up
  const execQueue: BridgeRequest[] = [];

  // Pending long-poll responses from the plugin (waiting for a request to arrive)
  let pendingPollRes: ServerResponse | null = null;

  // Pending CLI requests waiting for results from the plugin
  const pendingRequests = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  // Track plugin connectivity via poll activity
  let lastPollTime = 0;
  const PLUGIN_ALIVE_THRESHOLD = 30_000; // 30s — must exceed long-poll hold time (25s)

  function isPluginConnected(): boolean {
    return Date.now() - lastPollTime < PLUGIN_ALIVE_THRESHOLD;
  }

  // Idle timeout
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const startTime = Date.now();

  function resetIdleTimer(): void {
    if (idleTimer) clearTimeout(idleTimer);
    if (idleTimeoutMs > 0) {
      idleTimer = setTimeout(() => {
        server.close();
        removePidFile();
      }, idleTimeoutMs);
    }
  }

  // HTTP server
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    resetIdleTimer();

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
        pluginConnected: isPluginConnected(),
        uptime: Date.now() - startTime,
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
      return;
    }

    // CLI sends code to execute
    if (req.method === 'POST' && req.url === '/exec') {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk));
      req.on('end', () => handleExec(body, res));
      return;
    }

    // Plugin long-polls for the next exec request
    if (req.method === 'GET' && req.url === '/poll') {
      handlePoll(res);
      return;
    }

    // Plugin heartbeat — keeps connection alive during long executions
    if (req.method === 'POST' && req.url === '/heartbeat') {
      lastPollTime = Date.now();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // Plugin sends back execution result
    if (req.method === 'POST' && req.url === '/result') {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk));
      req.on('end', () => handleResult(body, res));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  });

  /** CLI → server: queue exec request, wait for plugin result */
  function handleExec(rawBody: string, res: ServerResponse): void {
    let parsed: ExecRequestBody;
    try {
      parsed = JSON.parse(rawBody) as ExecRequestBody;
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' } satisfies ExecResponseBody));
      return;
    }

    if (!isPluginConnected()) {
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
    const request: BridgeRequest = { id, type: 'exec', code: parsed.code, timeout };

    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: false,
          error: `Execution timed out after ${timeout}ms`,
        } satisfies ExecResponseBody),
      );
    }, timeout + 1000);

    pendingRequests.set(id, {
      resolve: (value) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result: value } satisfies ExecResponseBody));
      },
      reject: (err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message } satisfies ExecResponseBody));
      },
      timer,
    });

    // If plugin is already long-polling, send immediately
    if (pendingPollRes) {
      const pollRes = pendingPollRes;
      pendingPollRes = null;
      pollRes.writeHead(200, { 'Content-Type': 'application/json' });
      pollRes.end(JSON.stringify(request));
    } else {
      execQueue.push(request);
    }
  }

  /** Plugin → server: long-poll for next request */
  function handlePoll(res: ServerResponse): void {
    lastPollTime = Date.now();

    // If there's a queued request, return it immediately
    if (execQueue.length > 0) {
      const request = execQueue.shift()!;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(request));
      return;
    }

    // Otherwise hold the response open (long-poll)
    // Close any previous pending poll
    if (pendingPollRes) {
      try {
        pendingPollRes.writeHead(204);
        pendingPollRes.end();
      } catch {
        // Previous response may already be closed
      }
    }
    pendingPollRes = res;

    // Timeout the long-poll after 25s (keep-alive)
    setTimeout(() => {
      if (pendingPollRes === res) {
        pendingPollRes = null;
        res.writeHead(204);
        res.end();
      }
    }, 25_000);
  }

  /** Plugin → server: send back execution result */
  function handleResult(rawBody: string, res: ServerResponse): void {
    lastPollTime = Date.now();

    let msg: { id: string; type: string; value?: unknown; message?: string };
    try {
      msg = JSON.parse(rawBody);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      return;
    }

    const pending = pendingRequests.get(msg.id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingRequests.delete(msg.id);

      if (msg.type === 'error') {
        pending.reject(new Error(msg.message ?? 'Plugin execution error'));
      } else {
        pending.resolve(msg.value);
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
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
    try { unlinkSync(path); } catch {}
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
          if (pendingPollRes) {
            try { pendingPollRes.writeHead(503); pendingPollRes.end(); } catch {}
            pendingPollRes = null;
          }
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
    const raw = readFileSync(path, 'utf8');
    const data = JSON.parse(raw) as PidFile;
    try {
      process.kill(data.pid, 0);
      return data;
    } catch {
      try { unlinkSync(path); } catch {}
      return null;
    }
  } catch {
    return null;
  }
}
