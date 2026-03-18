import type { Command } from 'commander';
import { isPatched, patchFigma, getCdpPort } from '../patch/figma.js';
import { startFigmaApp, isFigmaRunning, killFigmaApp } from '../patch/platform.js';
import { createCdpClient } from '../cdp/client.js';
import { success, error, info, warn } from '../utils/output.js';

async function isCdpReachable(): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${getCdpPort()}/json`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForCdp(maxWaitMs = 15_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isCdpReachable()) return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

export function registerConnectCommand(program: Command): void {
  program
    .command('connect')
    .description('Patch Figma and verify CDP connection')
    .action(async () => {
      try {
        // 1. Ensure Figma is patched
        const patched = isPatched();
        if (patched === false) {
          info('Patching Figma...');
          patchFigma();
          success('Figma patched');
        } else if (patched === true) {
          info('Figma already patched');
        } else {
          warn('Cannot determine patch state — will attempt connection anyway');
        }

        // 2. Check if CDP is already reachable (Figma running with debug port)
        if (await isCdpReachable()) {
          // Already good — verify connection
          const client = await createCdpClient();
          const pageInfo = await client.evaluate(`(function() {
            return { name: figma.currentPage.name, id: figma.currentPage.id };
          })()`) as { name: string; id: string } | undefined;
          client.disconnect();
          success(pageInfo ? `Connected to "${pageInfo.name}"` : 'Connected to Figma');
          return;
        }

        // 3. CDP not reachable — Figma needs (re)start with debug port
        if (isFigmaRunning()) {
          info('Figma is running but CDP is not reachable — restarting with debug port...');
          killFigmaApp();
          await new Promise(r => setTimeout(r, 2000));
        } else {
          info('Starting Figma...');
        }

        startFigmaApp(getCdpPort());

        // 4. Wait for CDP to become available
        info('Waiting for Figma to start...');
        const ready = await waitForCdp(15_000);
        if (!ready) {
          error('Figma started but CDP is not responding. Try quitting Figma completely and running `desh connect` again.');
          process.exit(1);
        }

        // 5. Verify connection
        // Give Figma a moment to load the design file
        await new Promise(r => setTimeout(r, 2000));

        try {
          const client = await createCdpClient();
          const pageInfo = await client.evaluate(`(function() {
            return { name: figma.currentPage.name, id: figma.currentPage.id };
          })()`) as { name: string; id: string } | undefined;
          client.disconnect();
          success(pageInfo ? `Connected to "${pageInfo.name}"` : 'Connected to Figma');
        } catch {
          success('Figma started with debug port. Open a design file and run `desh connect` again to verify.');
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
