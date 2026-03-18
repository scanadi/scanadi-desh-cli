import type { Command } from 'commander';
import chalk from 'chalk';
import { runFigmaCode } from '../utils/figma-eval.js';
import { error, printResult } from '../utils/output.js';

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerNodeCommands(program: Command): void {
  const node = program
    .command('node')
    .description('Node operations (tree, bindings, to-component, delete)');

  // ---- node tree ------------------------------------------------------------
  node
    .command('tree [nodeId]')
    .description('Show node tree structure with indentation, type, and name')
    .option('-d, --depth <n>', 'Max depth', '3')
    .action(async (nodeId: string | undefined, opts: { depth: string }) => {
      const maxDepth = parseInt(opts.depth, 10) || 3;

      const code = `(async () => {
  const maxDepth = ${maxDepth};
  const targetId = ${nodeId ? JSON.stringify(nodeId) : 'null'};
  const root = targetId ? await figma.getNodeByIdAsync(targetId) : figma.currentPage;
  if (!root) return 'Node not found';

  const lines = [];
  function printNode(node, indent, depth) {
    if (depth > maxDepth) return;
    const prefix = '  '.repeat(indent);
    const size = node.width && node.height ? ' (' + Math.round(node.width) + 'x' + Math.round(node.height) + ')' : '';
    lines.push(prefix + node.type + ': ' + node.name + size);
    if ('children' in node && depth < maxDepth) {
      node.children.forEach(function(c) { printNode(c, indent + 1, depth + 1); });
    }
  }
  printNode(root, 0, 0);
  return lines.join('\\n');
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

  // ---- node bindings --------------------------------------------------------
  node
    .command('bindings [nodeId]')
    .description('Show variable bindings on node (which props are bound to which variables)')
    .action(async (nodeId: string | undefined) => {
      const code = `(async () => {
  const targetId = ${nodeId ? JSON.stringify(nodeId) : 'null'};
  const nodes = targetId
    ? [await figma.getNodeByIdAsync(targetId)]
    : figma.currentPage.selection.slice();

  if (!nodes.length) return 'No node selected';

  const results = [];
  for (const node of nodes) {
    if (!node) continue;
    const bindings = {};
    if (node.boundVariables) {
      for (const [prop, binding] of Object.entries(node.boundVariables)) {
        const b = Array.isArray(binding) ? binding[0] : binding;
        if (b && b.id) {
          const variable = figma.variables.getVariableById(b.id);
          bindings[prop] = variable ? variable.name : b.id;
        }
      }
    }
    results.push({ id: node.id, name: node.name, bindings });
  }
  return JSON.stringify(results);
})()`;

      try {
        const raw = await runFigmaCode(code);

        if (typeof raw === 'string' && raw.startsWith('[')) {
          const results: Array<{ id: string; name: string; bindings: Record<string, string> }> = JSON.parse(raw);
          results.forEach(r => {
            console.log(chalk.cyan(`\n${r.name} (${r.id}):`));
            if (Object.keys(r.bindings).length === 0) {
              console.log(chalk.gray('  No variable bindings'));
            } else {
              Object.entries(r.bindings).forEach(([prop, varName]) => {
                console.log(`  ${prop}: ${chalk.green(varName)}`);
              });
            }
          });
        } else {
          printResult(raw);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- node to-component ----------------------------------------------------
  node
    .command('to-component <nodeId>')
    .description('Convert a frame or group to a component')
    .action(async (nodeId: string) => {
      const code = `(async () => {
  const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
  if (!node) return 'Node not found: ${nodeId}';
  if (node.type !== 'FRAME' && node.type !== 'GROUP') {
    return 'Node must be a FRAME or GROUP (got ' + node.type + ')';
  }
  const comp = figma.createComponentFromNode(node);
  return JSON.stringify({ id: comp.id, name: comp.name });
})()`;

      try {
        const raw = await runFigmaCode(code);
        if (typeof raw === 'string' && raw.startsWith('{')) {
          const r: { id: string; name: string } = JSON.parse(raw);
          console.log(chalk.green(`✓ Converted: ${r.id} (${r.name})`));
        } else {
          printResult(raw);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- node delete ----------------------------------------------------------
  node
    .command('delete <nodeId>')
    .description('Delete a node by ID')
    .action(async (nodeId: string) => {
      const code = `(async () => {
  const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
  if (!node) return 'Node not found: ${nodeId}';
  const name = node.name;
  node.remove();
  return 'Deleted: ' + name + ' (' + ${JSON.stringify(nodeId)} + ')';
})()`;

      try {
        const result = await runFigmaCode(code);
        if (result !== undefined) {
          console.log(
            typeof result === 'string'
              ? chalk.green('✓ ' + result)
              : JSON.stringify(result, null, 2)
          );
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
