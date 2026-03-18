import type { Command } from 'commander';
import { requireConfig } from '../config.js';
import { extractTokens } from '../scanner/tokens.js';
import { generateTokenSyncJs } from '../codegen/tokens.js';
import { createBridgeClient, ensureBridgeServer } from '../bridge/client.js';
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
        await ensureBridgeServer();
        const client = createBridgeClient();
        const raw = await client.evaluate(js, { timeout: 60_000 });
        process.stdout.write('\r\x1b[K');

        const result = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
        if (result) {
          const created = (result.created as number ?? 0) + (result.floatCreated as number ?? 0);
          success(`Synced ${created} variables to "${result.collection}"`);
          if ((result.alphaWarnings as string[])?.length > 0) {
            for (const w of result.alphaWarnings as string[]) console.log(`  ⚠ ${w}`);
          }
        } else {
          success('Token sync complete');
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
