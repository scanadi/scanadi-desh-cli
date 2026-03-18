import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startBridgeServer, type BridgeServer } from '../../src/bridge/server.js';
import { createBridgeClient } from '../../src/bridge/client.js';

describe('BridgeClient', () => {
  let server: BridgeServer;

  // Simulate plugin: poll for requests, execute, post result
  let pluginRunning = true;
  async function simulatePlugin(port: number) {
    while (pluginRunning) {
      try {
        const pollRes = await fetch(`http://localhost:${port}/poll`, {
          signal: AbortSignal.timeout(5000),
        });
        if (pollRes.status === 204) continue; // no pending request, poll again
        const msg = await pollRes.json();
        if (msg.type === 'exec') {
          await fetch(`http://localhost:${port}/result`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: msg.id,
              type: 'result',
              value: `executed: ${msg.code}`,
            }),
          });
        }
      } catch {
        if (!pluginRunning) break;
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }

  beforeAll(async () => {
    server = await startBridgeServer({ port: 0, idleTimeoutMs: 60_000, writePidFile: false });
    pluginRunning = true;
    // Start simulated plugin (don't await — it loops)
    simulatePlugin(server.port);
    // Give plugin a moment to make first poll
    await new Promise(r => setTimeout(r, 100));
  });

  afterAll(async () => {
    pluginRunning = false;
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

  it('reports plugin connected in status after poll', async () => {
    const res = await fetch(`http://localhost:${server.port}/status`);
    const body = await res.json();
    expect(body.pluginConnected).toBe(true);
  });
});
