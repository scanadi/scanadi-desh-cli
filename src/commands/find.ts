import type { Command } from 'commander';
import { runFigmaCode } from '../utils/figma-eval.js';
import { error, printResult } from '../utils/output.js';

export function registerFindCommands(program: Command): void {
  program
    .command('find <name>')
    .description('Find nodes by name (partial match, searches recursively)')
    .option('-t, --type <type>', 'Filter by node type (FRAME, TEXT, RECTANGLE, etc.)')
    .option('-l, --limit <n>', 'Limit results', '20')
    .action(async (name: string, opts: { type?: string; limit: string }) => {
      const limit = parseInt(opts.limit, 10);
      const nameLower = name.toLowerCase();
      const typeFilter = opts.type ? opts.type.toUpperCase() : null;

      const code = `(function() {
const results = [];
function search(node) {
  if (node.name && node.name.toLowerCase().includes('${nameLower}')) {
    ${typeFilter ? `if (node.type === '${typeFilter}')` : ''}
    results.push({ id: node.id, type: node.type, name: node.name, width: node.width, height: node.height });
  }
  if (node.children && results.length < ${limit}) {
    node.children.forEach(search);
  }
}
search(figma.currentPage);
if (results.length === 0) return 'No nodes found matching "${name}"';
return results.slice(0, ${limit}).map(r => r.id + ' [' + r.type + '] ' + r.name + (r.width != null ? ' (' + Math.round(r.width) + 'x' + Math.round(r.height) + ')' : '')).join('\\n');
})()`;

      try {
        const result = await runFigmaCode(code);

        if (result !== undefined) {
          printResult(result);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  program
    .command('select <nodeId>')
    .description('Select a node by ID')
    .action(async (nodeId: string) => {
      const code = `(async () => {
const node = await figma.getNodeByIdAsync('${nodeId}');
if (node) {
  figma.currentPage.selection = [node];
  return 'Selected: ' + node.name + ' [' + node.type + ']';
}
return 'Node not found: ${nodeId}';
})()`;

      try {
        const result = await runFigmaCode(code);

        if (result !== undefined) {
          printResult(result);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  program
    .command('get [nodeId]')
    .description('Get properties of selected node or a specific node by ID')
    .action(async (nodeId?: string) => {
      const nodeSelector = nodeId
        ? `const node = await figma.getNodeByIdAsync('${nodeId}');`
        : `const node = figma.currentPage.selection[0];`;

      const code = `(async () => {
${nodeSelector}
if (!node) return 'No node found';
return JSON.stringify({
  id: node.id,
  name: node.name,
  type: node.type,
  x: node.x,
  y: node.y,
  width: node.width,
  height: node.height,
  visible: node.visible,
  locked: node.locked,
  opacity: node.opacity,
  rotation: node.rotation,
  cornerRadius: node.cornerRadius,
  layoutMode: node.layoutMode,
  fills: node.fills?.length,
  strokes: node.strokes?.length,
  children: node.children?.length
}, null, 2);
})()`;

      try {
        const result = await runFigmaCode(code);

        if (result !== undefined) {
          printResult(result);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
