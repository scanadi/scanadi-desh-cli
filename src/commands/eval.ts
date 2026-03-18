import type { Command } from 'commander';
import { createBridgeClient, ensureBridgeServer } from '../bridge/client.js';
import { error, printResult } from '../utils/output.js';

export function registerEvalCommand(program: Command): void {
  program
    .command('eval <expression>')
    .description('Execute JavaScript in Figma')
    .option('--timeout <ms>', 'Timeout in milliseconds', '30000')
    .action(async (expression: string, opts: { timeout: string }) => {
      try {
        await ensureBridgeServer();
        const client = createBridgeClient();
        const result = await client.evaluate(expression, { timeout: parseInt(opts.timeout, 10) });

        if (result !== undefined) {
          printResult(result);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
