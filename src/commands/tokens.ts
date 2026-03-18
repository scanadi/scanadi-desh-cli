import type { Command } from 'commander';
import { requireConfig } from '../config.js';
import { extractTokens } from '../scanner/tokens.js';
import { generateTokenSyncJs } from '../codegen/tokens.js';
import { createCdpClient } from '../cdp/client.js';
import { success, error, info, status } from '../utils/output.js';
import { join } from 'path';

export function registerTokenCommands(program: Command): void {
  const tokens = program.command('tokens').description('Design token commands');

  tokens
    .command('push')
    .alias('sync')
    .description('Push tokens from project CSS to Figma variables')
    .action(async () => {
      try {
        const config = requireConfig();
        const cssFiles = config.tokens.map(f => join(config.configDir, f));

        info('Parsing CSS tokens...');
        const tokenMap = await extractTokens(cssFiles);

        const themeCount = Object.keys(tokenMap.theme).length;
        const lightCount = Object.keys(tokenMap.light).length;
        const darkCount = Object.keys(tokenMap.dark).length;
        info(`Found ${themeCount} theme + ${lightCount} light + ${darkCount} dark variables`);

        status('Syncing to Figma...');
        const js = generateTokenSyncJs(tokenMap);
        const client = await createCdpClient();
        const result = await client.evaluate(js, { timeout: 60_000 }) as { created: number; collection: string } | undefined;
        client.disconnect();
        process.stdout.write('\r\x1b[K');

        if (result) {
          success(`Synced ${result.created} variables to "${result.collection}" collection`);
        } else {
          success('Token sync complete');
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
