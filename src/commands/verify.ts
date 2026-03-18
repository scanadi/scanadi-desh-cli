import { existsSync, readFileSync } from 'fs';
import type { Command } from 'commander';
import { runFigmaCode } from '../utils/figma-eval.js';
import { error, printResult } from '../utils/output.js';

export function registerVerifyCommand(program: Command): void {
  program
    .command('verify [nodeId]')
    .description('Take a screenshot of selection or specific node for AI verification (returns base64 JSON)')
    .option('-s, --scale <number>', 'Override auto-scaling (e.g. 1, 2)')
    .action(async (nodeId?: string, opts: { scale?: string } = {}) => {
      const nodeSelector = nodeId
        ? `const node = await figma.getNodeByIdAsync('${nodeId}');`
        : `const node = figma.currentPage.selection[0];`;

      const scaleOverride = opts.scale !== undefined ? Number(opts.scale) : null;

      const code = `(async () => {
${nodeSelector}
if (!node) return { error: 'No node selected' };
const maxDim = Math.max(node.width, node.height);
const scaleOverride = ${scaleOverride === null ? 'null' : scaleOverride};
let scale = scaleOverride !== null ? scaleOverride : 2;
if (scaleOverride === null && maxDim * scale > 2048) {
  scale = Math.max(1, Math.floor(2048 / maxDim));
}
if (scale < 1) scale = 1;
const warn = maxDim > 4096 ? 'Node is very large (>' + maxDim + 'px); export may be slow or truncated' : null;
const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
const base64 = figma.base64Encode(bytes);
const exportedWidth = Math.round(node.width * scale);
const exportedHeight = Math.round(node.height * scale);
const out = { id: node.id, name: node.name, width: node.width, height: node.height, scale, exportedWidth, exportedHeight, image: base64 };
if (warn) out.warn = warn;
return out;
})()`;

      try {
        const result = await runFigmaCode(code, 60_000);

        if (result !== undefined) {
          printResult(result);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  program
    .command('run <file>')
    .description('Run a JavaScript file in Figma')
    .action(async (file: string) => {
      if (!existsSync(file)) {
        error('File not found: ' + file);
        process.exit(1);
      }

      const code = readFileSync(file, 'utf8');

      try {
        const result = await runFigmaCode(code, 60_000);

        if (result !== undefined) {
          printResult(result);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
