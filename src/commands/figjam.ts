import type { Command } from 'commander';
import WebSocket from 'ws';
import { error } from '../utils/output.js';

// ---------------------------------------------------------------------------
// CDP client for FigJam tabs
// ---------------------------------------------------------------------------

interface CdpTab {
  id: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
  type: string;
}

interface FigJamClient {
  evaluate(expression: string, timeout?: number): Promise<unknown>;
  disconnect(): void;
}

async function tryPort(port: number): Promise<{ port: number; tabs: CdpTab[] } | null> {
  try {
    const response = await fetch(`http://localhost:${port}/json`);
    if (!response.ok) return null;
    const tabs = (await response.json()) as CdpTab[];
    // Match both design and FigJam URLs
    const figmaTabs = tabs.filter(
      (t) => t.url && (t.url.includes('figma.com/design/') || t.url.includes('figma.com/file/') || t.url.includes('figma.com/board/')),
    );
    if (figmaTabs.length === 0) return null;
    return { port, tabs: figmaTabs };
  } catch {
    return null;
  }
}

async function findFigJamTab(): Promise<CdpTab | null> {
  for (let port = 9222; port <= 9322; port++) {
    const result = await tryPort(port);
    if (!result) continue;
    // Prefer FigJam board tab
    const jamTab = result.tabs.find((t) => t.url.includes('/board/'));
    if (jamTab) return jamTab;
  }
  return null;
}

async function createFigJamClient(): Promise<FigJamClient> {
  const tab = await findFigJamTab();
  if (!tab) {
    throw new Error(
      'No FigJam board is open. Open a FigJam file (board URL) in Figma Desktop first.',
    );
  }

  return new Promise<FigJamClient>((resolve, reject) => {
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let msgId = 0;
    const callbacks = new Map<number, (msg: { id?: number; result?: unknown; error?: { message: string } }) => void>();
    let contextId: number | null = null;
    const contexts: Array<{ id: number; name: string }> = [];

    function send(method: string, params: Record<string, unknown> = {}): Promise<{ id?: number; result?: unknown; error?: { message: string } }> {
      return new Promise((res) => {
        const id = ++msgId;
        callbacks.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    ws.on('message', (data: WebSocket.RawData) => {
      const msg = JSON.parse(data.toString()) as { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message: string } };

      if (msg.method === 'Runtime.executionContextCreated') {
        const ctx = (msg.params as { context: { id: number; name: string } }).context;
        contexts.push(ctx);
      }

      if (msg.id !== undefined && callbacks.has(msg.id)) {
        const cb = callbacks.get(msg.id)!;
        callbacks.delete(msg.id);
        cb(msg);
      }
    });

    ws.on('error', reject);

    ws.on('open', async () => {
      try {
        await send('Runtime.enable', {});
        await new Promise((r) => setTimeout(r, 600));

        // Find context with figma global
        for (const ctx of contexts) {
          const testMsg = await send('Runtime.evaluate', {
            expression: 'typeof figma !== "undefined"',
            contextId: ctx.id,
          }) as { result?: { result?: { value?: unknown } } };
          if (testMsg.result?.result?.value === true) {
            contextId = ctx.id;
            break;
          }
        }

        if (contextId === null) {
          // Try default context
          const testMsg = await send('Runtime.evaluate', {
            expression: 'typeof figma !== "undefined"',
          }) as { result?: { result?: { value?: unknown } } };
          if (testMsg.result?.result?.value !== true) {
            reject(new Error('FigJam API not available. Make sure a FigJam board is active.'));
            ws.close();
            return;
          }
        }

        const evaluate = async (expression: string, timeoutMs = 30_000): Promise<unknown> => {
          const params: Record<string, unknown> = {
            expression: `Promise.resolve(${expression})`,
            awaitPromise: true,
            returnByValue: true,
            timeout: timeoutMs,
          };
          if (contextId !== null) params.contextId = contextId;

          const res = await send('Runtime.evaluate', params) as {
            result?: { result?: { value?: unknown; type?: string }; exceptionDetails?: { exception?: { description?: string } } }
          };

          if (res.result?.exceptionDetails) {
            throw new Error(res.result.exceptionDetails.exception?.description ?? 'Evaluation error');
          }
          return res.result?.result?.value;
        };

        const disconnect = () => ws.close();
        resolve({ evaluate, disconnect });
      } catch (err) {
        reject(err);
        ws.close();
      }
    });

    ws.on('close', () => { /* ignore */ });
  });
}

async function runFigJamCode(code: string, timeout = 30_000): Promise<unknown> {
  const client = await createFigJamClient();
  try {
    const result = await client.evaluate(code, timeout);
    client.disconnect();
    return result;
  } catch (err) {
    client.disconnect();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerFigJamCommands(program: Command): void {
  const fj = program
    .command('fj')
    .description('FigJam operations (sticky notes, shapes, connectors)');

  // ---- fj list --------------------------------------------------------------
  fj
    .command('list')
    .description('List FigJam pages')
    .action(async () => {
      const code = `(function() {
  const pages = figma.root.children.map(p => ({ id: p.id, name: p.name, nodeCount: p.children.length }));
  return JSON.stringify(pages);
})()`;

      try {
        const raw = await runFigJamCode(code);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const pages = Array.isArray(result) ? result : [];

        console.log(`\n\x1b[36mFigJam Pages (${pages.length}):\x1b[0m\n`);
        for (const page of pages as Array<{ id: string; name: string; nodeCount: number }>) {
          console.log(`  \x1b[1m${page.name}\x1b[0m  \x1b[90m${page.nodeCount} node(s)  ID: ${page.id}\x1b[0m`);
        }
        console.log('');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- fj sticky ------------------------------------------------------------
  fj
    .command('sticky <text>')
    .description('Create a sticky note')
    .option('-x <number>', 'X position', '100')
    .option('-y <number>', 'Y position', '100')
    .option('-c, --color <color>', 'Sticky color: yellow, pink, green, blue, purple, gray', 'yellow')
    .action(async (text: string, opts: { x: string; y: string; color: string }) => {
      const x = parseInt(opts.x, 10) || 100;
      const y = parseInt(opts.y, 10) || 100;

      const colorMap: Record<string, string> = {
        yellow: 'YELLOW', pink: 'PINK', green: 'GREEN',
        blue: 'BLUE', purple: 'VIOLET', gray: 'GRAY',
      };
      const figmaColor = colorMap[opts.color.toLowerCase()] ?? 'YELLOW';

      const code = `(async () => {
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });

  const sticky = figma.createSticky();
  sticky.text.characters = ${JSON.stringify(text)};
  sticky.x = ${x};
  sticky.y = ${y};
  sticky.stickyBackgroundColor = { type: 'SOLID', color: { r: 1, g: 0.9, b: 0.3 } };

  figma.currentPage.selection = [sticky];
  figma.viewport.scrollAndZoomIntoView([sticky]);

  return JSON.stringify({ success: true, id: sticky.id, x: sticky.x, y: sticky.y });
})()`;

      try {
        const raw = await runFigJamCode(code);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
        if (result.error) { error(String(result.error)); process.exit(1); }
        console.log(`\x1b[32m✓\x1b[0m Created sticky note at (${result.x}, ${result.y}) — ID: ${result.id}`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- fj shape -------------------------------------------------------------
  fj
    .command('shape <label>')
    .description('Create a shape with label')
    .option('-x <number>', 'X position', '200')
    .option('-y <number>', 'Y position', '100')
    .option('-w, --width <number>', 'Width', '200')
    .option('-h, --height <number>', 'Height', '100')
    .option('--type <type>', 'Shape type: rect, ellipse, diamond, triangle', 'rect')
    .action(async (label: string, opts: { x: string; y: string; width: string; height: string; type: string }) => {
      const x = parseInt(opts.x, 10) || 200;
      const y = parseInt(opts.y, 10) || 100;
      const w = parseInt(opts.width, 10) || 200;
      const h = parseInt(opts.height, 10) || 100;

      const shapeTypeMap: Record<string, string> = {
        rect: 'SQUARE', ellipse: 'ELLIPSE', diamond: 'DIAMOND', triangle: 'TRIANGLE_DOWN',
      };
      const figmaShape = shapeTypeMap[opts.type.toLowerCase()] ?? 'SQUARE';

      const code = `(async () => {
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });

  const shape = figma.createShapeWithText();
  shape.shapeType = ${JSON.stringify(figmaShape)};
  shape.text.characters = ${JSON.stringify(label)};
  shape.resize(${w}, ${h});
  shape.x = ${x};
  shape.y = ${y};
  shape.fills = [{ type: 'SOLID', color: { r: 0.224, g: 0.502, b: 0.961 } }];

  figma.currentPage.selection = [shape];
  figma.viewport.scrollAndZoomIntoView([shape]);

  return JSON.stringify({ success: true, id: shape.id, name: shape.text.characters });
})()`;

      try {
        const raw = await runFigJamCode(code);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
        if (result.error) { error(String(result.error)); process.exit(1); }
        console.log(`\x1b[32m✓\x1b[0m Created shape "${result.name}" — ID: ${result.id}`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- fj connect -----------------------------------------------------------
  fj
    .command('connect <id1> <id2>')
    .description('Connect two elements with a connector')
    .option('--label <text>', 'Connector label')
    .action(async (id1: string, id2: string, opts: { label?: string }) => {
      const code = `(async () => {
  const n1 = await figma.getNodeByIdAsync(${JSON.stringify(id1)});
  const n2 = await figma.getNodeByIdAsync(${JSON.stringify(id2)});
  if (!n1) return JSON.stringify({ error: 'Node 1 not found: ' + ${JSON.stringify(id1)} });
  if (!n2) return JSON.stringify({ error: 'Node 2 not found: ' + ${JSON.stringify(id2)} });

  const connector = figma.createConnector();
  connector.connectorStart = { endpointNodeId: n1.id, magnet: 'AUTO' };
  connector.connectorEnd = { endpointNodeId: n2.id, magnet: 'AUTO' };
  connector.strokeWeight = 2;
  connector.strokes = [{ type: 'SOLID', color: { r: 0.224, g: 0.502, b: 0.961 } }];

  ${opts.label ? `
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  connector.text.characters = ${JSON.stringify(opts.label)};
  ` : ''}

  return JSON.stringify({ success: true, id: connector.id, from: n1.name, to: n2.name });
})()`;

      try {
        const raw = await runFigJamCode(code);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
        if (result.error) { error(String(result.error)); process.exit(1); }
        console.log(`\x1b[32m✓\x1b[0m Connected "${result.from}" → "${result.to}" — Connector ID: ${result.id}`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- fj nodes -------------------------------------------------------------
  fj
    .command('nodes')
    .description('List elements on current FigJam page')
    .option('--json', 'Output as JSON')
    .option('--limit <n>', 'Max results', '50')
    .action(async (opts: { json?: boolean; limit: string }) => {
      const limit = parseInt(opts.limit, 10) || 50;
      const code = `(function() {
  function getNodes(parent, depth) {
    depth = depth || 0;
    const results = [];
    if ('children' in parent) {
      for (const child of parent.children) {
        results.push({
          id: child.id,
          name: child.name || '',
          type: child.type,
          x: Math.round(child.x || 0),
          y: Math.round(child.y || 0),
          width: Math.round(child.width || 0),
          height: Math.round(child.height || 0)
        });
      }
    }
    return results.slice(0, ${limit});
  }
  return JSON.stringify(getNodes(figma.currentPage, 0));
})()`;

      try {
        const raw = await runFigJamCode(code);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const nodes = Array.isArray(result) ? result : [];

        if (opts.json) { console.log(JSON.stringify(nodes, null, 2)); return; }

        console.log(`\n\x1b[36mFigJam Elements (${nodes.length}):\x1b[0m\n`);
        for (const node of nodes as Array<{ id: string; name: string; type: string; x: number; y: number; width: number; height: number }>) {
          console.log(`  \x1b[1m${node.name || '(unnamed)'}\x1b[0m  \x1b[90m[${node.type}]\x1b[0m  ${node.width}x${node.height} @ (${node.x}, ${node.y})`);
          console.log(`    \x1b[90mID: ${node.id}\x1b[0m`);
        }
        console.log('');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- fj delete ------------------------------------------------------------
  fj
    .command('delete <id>')
    .description('Delete a FigJam element by ID')
    .action(async (id: string) => {
      const code = `(async () => {
  const node = await figma.getNodeByIdAsync(${JSON.stringify(id)});
  if (!node) return JSON.stringify({ error: 'Node not found: ' + ${JSON.stringify(id)} });
  const name = node.name;
  const type = node.type;
  node.remove();
  return JSON.stringify({ success: true, name, type });
})()`;

      try {
        const raw = await runFigJamCode(code);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
        if (result.error) { error(String(result.error)); process.exit(1); }
        console.log(`\x1b[32m✓\x1b[0m Deleted "${result.name}" [${result.type}]`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- fj eval --------------------------------------------------------------
  fj
    .command('eval <code>')
    .description('Evaluate JavaScript in FigJam context')
    .action(async (code: string) => {
      try {
        const result = await runFigJamCode(code);
        if (result !== undefined) {
          console.log(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
