import type { Command } from 'commander';
import { ensureBridgeServer, isBridgeRunning, isPluginConnected, createBridgeClient } from '../bridge/client.js';
import { readPidFile } from '../bridge/server.js';
import { success, error, info, warn } from '../utils/output.js';

export function registerConnectCommand(program: Command): void {
  program
    .command('connect')
    .description('Start bridge server and verify plugin connection')
    .action(async () => {
      try {
        // 1. Ensure bridge server is running
        if (await isBridgeRunning()) {
          info('Bridge server already running');
        } else {
          info('Starting bridge server...');
          await ensureBridgeServer();
          success('Bridge server started');
        }

        // 2. Check if plugin is connected
        if (!(await isPluginConnected())) {
          warn('No Figma plugin connected.');
          info('Open Figma → Plugins → desh → Run');
          info('Then run `desh connect` again to verify.');
          return;
        }

        // 3. Verify by executing code
        const client = createBridgeClient();
        const pageInfo = (await client.evaluate(`(function() {
          return { name: figma.currentPage.name, id: figma.currentPage.id };
        })()`)) as { name: string; id: string } | undefined;

        success(pageInfo ? `Connected to "${pageInfo.name}"` : 'Connected to Figma');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  program
    .command('disconnect')
    .description('Stop the bridge server')
    .action(async () => {
      try {
        if (!(await isBridgeRunning())) {
          info('Bridge server is not running');
          return;
        }

        const pid = readPidFile();
        if (pid) {
          try {
            process.kill(pid.pid, 'SIGTERM');
            success('Bridge server stopped');
          } catch {
            warn('Could not stop bridge server — it may have already exited');
          }
        } else {
          warn('No PID file found');
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
