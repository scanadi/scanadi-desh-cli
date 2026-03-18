import type { Command } from 'commander';
import { runFigmaCode } from '../utils/figma-eval.js';
import { success, error } from '../utils/output.js';

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerCanvasCommands(program: Command): void {
  // ---- canvas (parent) -----------------------------------------------------
  const canvas = program
    .command('canvas')
    .description('Canvas awareness and smart positioning');

  // ---- canvas info ----------------------------------------------------------
  canvas
    .command('info')
    .description('List all top-level nodes on the current page (id, name, type, x, y, width, height)')
    .action(async () => {
      const code = `(function() {
const children = figma.currentPage.children;
if (children.length === 0) {
  return JSON.stringify({ empty: true, message: 'Canvas is empty', nodes: [] }, null, 2);
}
const nodes = children.map(n => ({
  id: n.id,
  name: n.name,
  type: n.type,
  x: Math.round(n.x),
  y: Math.round(n.y),
  width: Math.round(n.width),
  height: Math.round(n.height)
}));
return JSON.stringify(nodes, null, 2);
})()`;

      try {
        const result = await runFigmaCode(code);
        if (typeof result === 'string') {
          console.log(result);
        } else if (result !== undefined) {
          console.log(JSON.stringify(result, null, 2));
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- canvas next ----------------------------------------------------------
  canvas
    .command('next')
    .description('Find next free position (to the right of existing content)')
    .option('-g, --gap <n>', 'Gap from existing elements', '100')
    .option('-d, --direction <dir>', 'Direction: right | below', 'right')
    .action(async (opts: { gap: string; direction: string }) => {
      const gap = parseFloat(opts.gap) || 100;
      const direction = opts.direction === 'below' ? 'below' : 'right';

      const code = `(function() {
const children = figma.currentPage.children;
const gap = ${gap};
if (children.length === 0) {
  return JSON.stringify({ x: 0, y: 0 });
}
${
  direction === 'below'
    ? `let maxY = -Infinity;
children.forEach(n => { maxY = Math.max(maxY, n.y + n.height); });
return JSON.stringify({ x: 0, y: Math.round(maxY + gap) });`
    : `let maxX = -Infinity;
children.forEach(n => { maxX = Math.max(maxX, n.x + n.width); });
return JSON.stringify({ x: Math.round(maxX + gap), y: 0 });`
}
})()`;

      try {
        const result = await runFigmaCode(code);
        if (typeof result === 'string') {
          console.log(result);
        } else if (result !== undefined) {
          console.log(JSON.stringify(result, null, 2));
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- arrange --------------------------------------------------------------
  program
    .command('arrange')
    .description('Arrange top-level frames/components on the canvas in a grid')
    .option('-g, --gap <n>', 'Gap between frames', '100')
    .option('-c, --columns <n>', 'Number of columns (0 = single row)', '0')
    .action(async (opts: { gap: string; columns: string }) => {
      const gap = parseFloat(opts.gap) || 100;
      const cols = parseInt(opts.columns, 10) || 0;

      const code = `(function() {
const frames = figma.currentPage.children.filter(n => n.type === 'FRAME' || n.type === 'COMPONENT');
if (frames.length === 0) return 'No frames to arrange';
frames.sort((a, b) => a.name.localeCompare(b.name));
let x = 0, y = 0, rowHeight = 0, col = 0;
const gap = ${gap};
const cols = ${cols};
frames.forEach(f => {
  f.x = x;
  f.y = y;
  rowHeight = Math.max(rowHeight, f.height);
  if (cols > 0 && ++col >= cols) {
    col = 0;
    x = 0;
    y += rowHeight + gap;
    rowHeight = 0;
  } else {
    x += f.width + gap;
  }
});
return 'Arranged ' + frames.length + ' frames';
})()`;

      try {
        const result = await runFigmaCode(code, 30_000);
        if (typeof result === 'string') {
          success(result);
        } else {
          success('Done');
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- duplicate / dup ------------------------------------------------------
  program
    .command('duplicate [nodeId]')
    .alias('dup')
    .description('Duplicate selection or a specific node by ID')
    .option('--offset <n>', 'Offset from original (x and y)', '20')
    .action(async (nodeId: string | undefined, opts: { offset: string }) => {
      const offset = parseFloat(opts.offset) || 20;

      let code: string;
      if (nodeId) {
        code = `(async () => {
const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
if (!node) return 'Node not found: ${nodeId}';
const clone = node.clone();
clone.x += ${offset};
clone.y += ${offset};
figma.currentPage.selection = [clone];
return 'Duplicated: ' + clone.id;
})()`;
      } else {
        code = `(function() {
const sel = figma.currentPage.selection;
if (sel.length === 0) return 'No selection';
const clones = sel.map(n => {
  const c = n.clone();
  c.x += ${offset};
  c.y += ${offset};
  return c;
});
figma.currentPage.selection = clones;
return 'Duplicated ' + clones.length + ' element(s)';
})()`;
      }

      try {
        const result = await runFigmaCode(code, 30_000);
        if (typeof result === 'string') {
          success(result);
        } else {
          success('Done');
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- delete ---------------------------------------------------------------
  program
    .command('delete [nodeId]')
    .alias('remove')
    .description('Delete selection or a specific node by ID')
    .action(async (nodeId: string | undefined) => {
      let code: string;
      if (nodeId) {
        code = `(async () => {
const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
if (!node) return 'Node not found: ${nodeId}';
node.remove();
return 'Deleted: ${nodeId}';
})()`;
      } else {
        code = `(function() {
const sel = figma.currentPage.selection;
if (sel.length === 0) return 'No selection';
const count = sel.length;
sel.forEach(n => n.remove());
return 'Deleted ' + count + ' element(s)';
})()`;
      }

      try {
        const result = await runFigmaCode(code, 30_000);
        if (typeof result === 'string') {
          success(result);
        } else {
          success('Done');
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

}
