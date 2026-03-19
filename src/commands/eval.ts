import type { Command } from 'commander';
import { createBridgeClient, ensureBridgeServer } from '../bridge/client.js';
import { createCdpClient } from '../cdp/client.js';
import { isCdpMode } from '../utils/figma-eval.js';
import { error, printResult } from '../utils/output.js';

export function registerEvalCommand(program: Command): void {
  program
    .command('eval <expression>')
    .description('Execute JavaScript in Figma')
    .option('--timeout <ms>', 'Timeout in milliseconds', '30000')
    .action(async (expression: string, opts: { timeout: string }) => {
      try {
        const timeout = parseInt(opts.timeout, 10);
        let result: unknown;

        if (isCdpMode()) {
          const client = await createCdpClient();
          try {
            result = await client.evaluate(expression, { timeout });
          } finally {
            client.disconnect();
          }
        } else {
          await ensureBridgeServer();
          const client = createBridgeClient();
          result = await client.evaluate(expression, { timeout });
        }

        if (result !== undefined) {
          printResult(result);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
