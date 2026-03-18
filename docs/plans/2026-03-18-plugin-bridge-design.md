# Plugin Bridge Design

**Date:** 2026-03-18
**Status:** Approved
**Goal:** Replace CDP binary patching with a Figma plugin bridge — no patching, no Full Disk Access, legally clean.

## Problem

The current connection uses Chrome DevTools Protocol (CDP) which requires:
1. Binary patching of Figma's `app.asar` to re-enable `--remote-debugging-port`
2. Full Disk Access on macOS to write to `/Applications/Figma.app/`
3. Re-signing the app with `codesign`

This violates Figma's ToS (§ reverse engineering, AUP § code modification) and is fragile — Figma actively blocks CDP access in newer versions.

## Solution

A Figma plugin acts as a dumb pipe: receive JS code → execute in Plugin API context → return result. The CLI stays identical.

## Architecture

```
CLI Command
  → HTTP POST localhost:9001/exec { code, timeout }
  → Bridge Server (Node.js, auto-managed)
  → WS forward to Figma Plugin
  → Plugin Sandbox: execute code with figma.* API
  → Result back via WS → HTTP response → CLI
```

### Bridge Server

- Lightweight Node.js process (HTTP + WS on port 9001)
- Auto-starts on first command if not running
- Auto-exits after 5 minutes of inactivity
- HTTP endpoint for CLI commands (stateless, one request = one execution)
- WS endpoint for plugin connection (persistent)
- PID file at `~/.desh/bridge.pid` for lifecycle management

### Figma Plugin

- **Manifest** (`plugin/manifest.json`): Standard v4 plugin, `"ui": "ui.html"`
- **Sandbox** (`plugin/code.js`): Receives code via `figma.ui.onMessage`, executes with `new AsyncFunction(code)()`, posts result back
- **UI** (`plugin/ui.html`): Minimal iframe — WS client to `localhost:9001`, bridges messages between WS ↔ sandbox via `postMessage`

Note: The plugin sandbox necessarily executes arbitrary JS code strings because that's the entire purpose — the CLI generates Figma Plugin API calls as JS strings, and the plugin runs them in the context where `figma.*` globals are available. This is the same pattern CDP used with `Runtime.evaluate`. The code originates from the local CLI (trusted), not from any external/untrusted source.

### CLI Client

New `src/bridge/client.ts` implements same `{ evaluate, disconnect }` interface:
- HTTP POST to `http://localhost:9001/exec` with `{ code, timeout }`
- Returns parsed result or throws on error
- Auto-starts bridge server if not running

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `plugin/manifest.json` | Figma plugin manifest |
| `plugin/code.js` | Plugin sandbox — execution bridge |
| `plugin/ui.html` | Plugin UI — WS ↔ sandbox bridge |
| `src/bridge/server.ts` | Bridge server (HTTP + WS) |
| `src/bridge/client.ts` | Bridge client (same interface as CdpClient) |

### Modified Files

| File | Change |
|------|--------|
| `src/utils/figma-eval.ts` | Import `createBridgeClient` instead of `createCdpClient` |
| `src/commands/connect.ts` | Start bridge server, check plugin connection |
| `src/commands/eval.ts` | Import `createBridgeClient` instead of `createCdpClient` |
| `src/commands/render.ts` | Import `createBridgeClient` instead of `createCdpClient` |
| `src/commands/tokens.ts` | Import `createBridgeClient` instead of `createCdpClient` |

### Deprecated (kept but unused)

| File | Reason |
|------|--------|
| `src/patch/figma.ts` | No more binary patching |
| `src/patch/platform.ts` | Port/kill helpers still useful; asar/patch functions deprecated |
| `src/cdp/client.ts` | CDP transport replaced by bridge |
| `src/cdp/protocol.ts` | CDP types no longer needed |

## Interface Contract

The bridge client exposes the exact same interface as CDP:

```typescript
interface BridgeClient {
  evaluate(expression: string, options?: { timeout?: number }): Promise<unknown>;
  disconnect(): void;
}
```

Commands don't know or care which transport is underneath.

## Plugin Communication Protocol

### CLI → Server (HTTP)

```
POST /exec
Content-Type: application/json

{ "code": "figma.currentPage.name", "timeout": 30000 }

Response: { "ok": true, "result": "Page 1" }
     or:  { "ok": false, "error": "TypeError: ..." }
```

### Server → Plugin (WS)

```
→ { "id": "uuid", "type": "exec", "code": "...", "timeout": 30000 }
← { "id": "uuid", "type": "result", "value": "Page 1" }
← { "id": "uuid", "type": "error", "message": "TypeError: ..." }
```

### Plugin Sandbox ↔ UI (postMessage)

```
UI → Sandbox: { pluginMessage: { id, type: "exec", code } }
Sandbox → UI: { pluginMessage: { id, type: "result", value } }
```

## Server Lifecycle

1. `desh connect` — starts server, waits for plugin
2. Auto-start — any command auto-starts server if PID file missing or process dead
3. Idle timeout — server exits after 5 min with no requests
4. `desh disconnect` — kills server, removes PID file
5. PID file — `~/.desh/bridge.pid` stores `{ pid, port }`

## Connect Flow (New)

```
desh connect
  1. Check if bridge server running (ping localhost:9001/status)
  2. If not: start as detached child process
  3. Check if plugin connected (GET /status → { pluginConnected: true })
  4. If not: "Open Figma → Plugins → desh → Run"
  5. If yes: verify with code execution of 'figma.currentPage.name'
  6. Output: "Connected to 'Page Name'"
```

## No New Dependencies

- `ws` — already in package.json (reused for server-side WS)
- `http` — Node built-in (bridge server)
- `crypto` — Node built-in (request IDs)
- Plugin is vanilla JS (no build step)

## Migration

- Default transport switches to bridge
- CDP code stays in tree for now (can be removed in future version)
- `desh connect` no longer patches — just starts server + checks plugin
- Error messages updated to reference plugin instead of patching
