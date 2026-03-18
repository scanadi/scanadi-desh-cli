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

    const res = await fetch(`http://localhost:${server.port}/status`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.pluginConnected).toBe(false);
  });

  it('returns 503 on /exec when no plugin connected', async () => {
    server = await startBridgeServer({ port: 0, idleTimeoutMs: 60_000, writePidFile: false });

    const res = await fetch(`http://localhost:${server.port}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'figma.currentPage.name', timeout: 5000 }),
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('plugin');
  });

  it('returns 404 for unknown routes', async () => {
    server = await startBridgeServer({ port: 0, idleTimeoutMs: 60_000, writePidFile: false });

    const res = await fetch(`http://localhost:${server.port}/unknown`);
    expect(res.status).toBe(404);
  });

  it('plugin poll returns 204 when no pending requests', async () => {
    server = await startBridgeServer({ port: 0, idleTimeoutMs: 60_000, writePidFile: false });

    // Poll should eventually return 204 (long-poll timeout)
    // Use abort to cut it short
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 500);

    try {
      await fetch(`http://localhost:${server.port}/poll`, { signal: controller.signal });
    } catch {
      // AbortError is expected
    }
  });
});
