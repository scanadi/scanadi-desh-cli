import type { Command } from 'commander';
import { createBridgeClient, ensureBridgeServer } from '../bridge/client.js';
import { createCdpClient } from '../cdp/client.js';
import { isCdpMode } from '../utils/figma-eval.js';
import { generateJsFromJsx } from '../codegen/jsx.js';
import { error, success } from '../utils/output.js';

async function getFigmaClient() {
  if (isCdpMode()) {
    return await createCdpClient();
  }
  await ensureBridgeServer();
  return createBridgeClient();
}

export function registerRenderCommand(program: Command): void {
  program
    .command('render <jsx>')
    .description('Render JSX to Figma')
    .action(async (jsx: string) => {
      try {
        const js = await generateJsFromJsx(jsx);
        const client = await getFigmaClient();
        try {
          const result = await client.evaluate(js, { timeout: 90_000 });
          if (result && typeof result === 'object') {
            console.log(JSON.stringify(result, null, 2));
          }
          success('Rendered');
        } finally {
          client.disconnect();
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  program
    .command('render-batch <jsxArray>')
    .description('Render multiple JSX frames')
    .option('-d, --direction <dir>', 'Layout direction: row or col', 'row')
    .option('-g, --gap <n>', 'Gap between frames', '40')
    .action(async (jsxArray: string, opts: { direction: string; gap: string }) => {
      try {
        const items = JSON.parse(jsxArray) as string[];
        if (!Array.isArray(items)) {
          throw new Error('Argument must be a JSON array of JSX strings');
        }

        const client = await getFigmaClient();
        try {
          for (const jsx of items) {
            const js = await generateJsFromJsx(jsx);
            await client.evaluate(js, { timeout: 60_000 });
          }
        } finally {
          client.disconnect();
        }
        success(`Rendered ${items.length} frames`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
