import type { Command } from 'commander';
import { runFigmaCode } from '../utils/figma-eval.js';
import { success, error } from '../utils/output.js';

export function registerShortcutCommands(program: Command): void {
  // ---- text (parent) -------------------------------------------------------
  const text = program
    .command('text')
    .description('Get or set text content on a node');

  // ---- text set ------------------------------------------------------------
  text
    .command('set <nodeId> <content>')
    .description('Set text content on a text node')
    .action(async (nodeId: string, content: string) => {
      try {
        const safeContent = JSON.stringify(content);
        const safeId = JSON.stringify(nodeId);
        const code = `(async () => {
  const node = await figma.getNodeByIdAsync(${safeId});
  if (!node || node.type !== 'TEXT') throw new Error('Not a text node');
  // Handle mixed fonts: load all font ranges, or fall back to first character's font
  if (typeof node.fontName === 'symbol') {
    const len = node.characters.length;
    const loaded = new Set();
    for (let i = 0; i < len; i++) {
      const fn = node.getRangeFontName(i, i + 1);
      const key = fn.family + '/' + fn.style;
      if (!loaded.has(key)) { await figma.loadFontAsync(fn); loaded.add(key); }
    }
  } else {
    await figma.loadFontAsync(node.fontName);
  }
  node.characters = ${safeContent};
  return JSON.stringify({ id: node.id, text: node.characters });
})()`;
        const result = await runFigmaCode<string>(code);
        success(typeof result === 'string' ? result : JSON.stringify(result));
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- text get ------------------------------------------------------------
  text
    .command('get <nodeId>')
    .description('Get text content from a text node')
    .action(async (nodeId: string) => {
      try {
        const safeId = JSON.stringify(nodeId);
        const code = `(async () => {
  const node = await figma.getNodeByIdAsync(${safeId});
  if (!node || node.type !== 'TEXT') throw new Error('Not a text node');
  return JSON.stringify({ id: node.id, text: node.characters });
})()`;
        const result = await runFigmaCode<string>(code);
        success(typeof result === 'string' ? result : JSON.stringify(result));
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- resize --------------------------------------------------------------
  program
    .command('resize <nodeId> <width> <height>')
    .description('Resize a node to specific dimensions')
    .action(async (nodeId: string, width: string, height: string) => {
      try {
        const safeId = JSON.stringify(nodeId);
        const w = parseFloat(width);
        const h = parseFloat(height);
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
          throw new Error('Width and height must be positive numbers');
        }
        const code = `(async () => {
  const node = await figma.getNodeByIdAsync(${safeId});
  if (!node) throw new Error('Node not found');
  node.resize(${w}, ${h});
  if ('layoutSizingHorizontal' in node) node.layoutSizingHorizontal = 'FIXED';
  if ('layoutSizingVertical' in node) node.layoutSizingVertical = 'FIXED';
  return JSON.stringify({ id: node.id, width: node.width, height: node.height });
})()`;
        const result = await runFigmaCode<string>(code);
        success(typeof result === 'string' ? result : JSON.stringify(result));
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- rename --------------------------------------------------------------
  program
    .command('rename <nodeId> <name>')
    .description('Rename a node')
    .action(async (nodeId: string, name: string) => {
      try {
        const safeId = JSON.stringify(nodeId);
        const safeName = JSON.stringify(name);
        const code = `(async () => {
  const node = await figma.getNodeByIdAsync(${safeId});
  if (!node) throw new Error('Node not found');
  node.name = ${safeName};
  return JSON.stringify({ id: node.id, name: node.name });
})()`;
        const result = await runFigmaCode<string>(code);
        success(typeof result === 'string' ? result : JSON.stringify(result));
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
