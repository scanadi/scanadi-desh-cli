import { writeFileSync } from 'fs';
import type { Command } from 'commander';
import { runFigmaCode } from '../utils/figma-eval.js';
import { error } from '../utils/output.js';

// ---------------------------------------------------------------------------
// XPath-like query parser
// ---------------------------------------------------------------------------

function buildQueryCode(query: string): string {
  // Supported patterns:
  //   //FRAME               → find all FRAME nodes
  //   //FRAME[@name="foo"]  → find all FRAME nodes named "foo"
  //   //TEXT                → find all TEXT nodes
  //   /[@name="foo"]        → find node named "foo" at top level
  //   //[@type="COMPONENT"] → find all COMPONENT nodes (alias)

  const matchAll = query.startsWith('//');
  const path = query.replace(/^\/\//, '').replace(/^\//, '');

  // Parse predicate: e.g. FRAME[@name="foo"]
  const predicateMatch = path.match(/^(\w+)?\[(.+)\]$/);
  const typePart = predicateMatch ? predicateMatch[1] : path.replace(/\[.*\]/, '');
  const predicate = predicateMatch ? predicateMatch[2] : null;

  let typeFilter = '';
  if (typePart && typePart !== '*' && typePart !== '') {
    typeFilter = `n.type === ${JSON.stringify(typePart.toUpperCase())}`;
  }

  let predFilter = '';
  if (predicate) {
    // @name="value"
    const nameMatch = predicate.match(/@name\s*=\s*["']([^"']+)["']/);
    const typeMatch = predicate.match(/@type\s*=\s*["']([^"']+)["']/);
    if (nameMatch) predFilter = `n.name === ${JSON.stringify(nameMatch[1])}`;
    else if (typeMatch) predFilter = `n.type === ${JSON.stringify(typeMatch[1].toUpperCase())}`;
  }

  const filterParts = [typeFilter, predFilter].filter(Boolean);
  const filterExpr = filterParts.length > 0 ? filterParts.join(' && ') : 'true';

  if (matchAll) {
    return `(function() {
  const results = [];
  const MAX = 200;
  const MAX_DEPTH = 8;
  function walk(n, depth) {
    if (results.length >= MAX) return;
    if (${filterExpr}) {
      results.push({ id: n.id, name: n.name, type: n.type, x: Math.round(n.x || 0), y: Math.round(n.y || 0), width: Math.round(n.width || 0), height: Math.round(n.height || 0) });
    }
    if (depth < MAX_DEPTH && 'children' in n && n.type !== 'INSTANCE') {
      for (const child of n.children) { walk(child, depth + 1); if (results.length >= MAX) return; }
    }
  }
  for (const child of figma.currentPage.children) { walk(child, 0); if (results.length >= MAX) break; }
  return results;
})()`;
  } else {
    return `(function() {
  const results = figma.currentPage.children
    .filter(n => ${filterExpr})
    .map(n => ({ id: n.id, name: n.name, type: n.type, x: Math.round(n.x || 0), y: Math.round(n.y || 0), width: Math.round(n.width || 0), height: Math.round(n.height || 0) }));
  return results.slice(0, 200);
})()`;
  }
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerRawCommands(program: Command): void {
  const raw = program
    .command('raw')
    .description('Raw Figma tree operations (query, select, export)');

  // ---- raw query ------------------------------------------------------------
  raw
    .command('query <xpath>')
    .description('XPath-like query on Figma tree (e.g. "//FRAME", "//TEXT[@name=\\"Title\\"]")')
    .option('--json', 'Output as JSON')
    .option('--limit <n>', 'Max results', '50')
    .action(async (xpath: string, opts: { json?: boolean; limit: string }) => {
      const limit = parseInt(opts.limit, 10) || 50;
      const code = buildQueryCode(xpath);

      try {
        const result = await runFigmaCode(code) as Array<{ id: string; name: string; type: string; x: number; y: number; width: number; height: number }>;

        if (!Array.isArray(result)) {
          error('Query returned unexpected result');
          process.exit(1);
        }

        const items = result.slice(0, limit);

        if (opts.json) {
          console.log(JSON.stringify(items, null, 2));
          return;
        }

        if (items.length === 0) {
          console.log('\x1b[90mNo nodes matched.\x1b[0m');
          return;
        }

        console.log(`\n\x1b[36mQuery: ${xpath}  (${items.length} result${items.length === 1 ? '' : 's'})\x1b[0m\n`);
        for (const node of items) {
          console.log(`  \x1b[1m${node.name}\x1b[0m  \x1b[90m[${node.type}]\x1b[0m  ${node.width}x${node.height} @ (${node.x}, ${node.y})`);
          console.log(`    \x1b[90mID: ${node.id}\x1b[0m`);
        }
        console.log('');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- raw select -----------------------------------------------------------
  raw
    .command('select <nodeId>')
    .description('Select and focus a node by ID')
    .action(async (nodeId: string) => {
      const code = `(async () => {
  const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
  if (!node) return JSON.stringify({ error: 'Node not found: ' + ${JSON.stringify(nodeId)} });
  if (node.type === 'PAGE' || node.type === 'DOCUMENT') {
    return JSON.stringify({ error: 'Cannot select page or document nodes' });
  }
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
  return JSON.stringify({
    success: true,
    id: node.id,
    name: node.name,
    type: node.type,
    width: Math.round(node.width || 0),
    height: Math.round(node.height || 0)
  });
})()`;

      try {
        const raw = await runFigmaCode(code);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
        if (result.error) { error(String(result.error)); process.exit(1); }
        console.log(`\x1b[32m✓\x1b[0m Selected "${result.name}" [${result.type}] (${result.width}x${result.height})`);
        console.log(`  \x1b[90mID: ${result.id}\x1b[0m`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- raw export -----------------------------------------------------------
  raw
    .command('export <nodeId>')
    .description('Export a node by ID to a file')
    .option('-o, --output <file>', 'Output file (default: <name>.<format>)')
    .option('-s, --scale <number>', 'Export scale (1-4)', '2')
    .option('-f, --format <format>', 'Format: png, svg, pdf, jpg', 'png')
    .action(async (nodeId: string, opts: { output?: string; scale: string; format: string }) => {
      const format = opts.format.toUpperCase();
      const scale = parseFloat(opts.scale) || 2;

      const code = `(async () => {
  const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
  if (!node) return JSON.stringify({ error: 'Node not found: ' + ${JSON.stringify(nodeId)} });
  if (!('exportAsync' in node)) return JSON.stringify({ error: 'Node type cannot be exported: ' + node.type });

  const bytes = await node.exportAsync({
    format: ${JSON.stringify(format)},
    constraint: { type: 'SCALE', value: ${scale} }
  });

  return JSON.stringify({
    success: true,
    name: node.name,
    id: node.id,
    type: node.type,
    width: Math.round(node.width || 0),
    height: Math.round(node.height || 0),
    bytes: Array.from(bytes)
  });
})()`;

      try {
        const raw = await runFigmaCode(code, 60_000);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
        if (result.error) { error(String(result.error)); process.exit(1); }

        const r = result as { name: string; id: string; type: string; width: number; height: number; bytes: number[] };
        const safeName = r.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const outputFile = opts.output ?? `${safeName}.${format.toLowerCase()}`;

        const buffer = Buffer.from(r.bytes);
        writeFileSync(outputFile, buffer);

        console.log(`\x1b[32m✓\x1b[0m Exported "${r.name}" [${r.type}] (${r.width}x${r.height}) → ${outputFile}`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
