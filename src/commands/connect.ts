import type { Command } from 'commander';
import { execFileSync } from 'child_process';
import { ensureBridgeServer, isBridgeRunning, isPluginConnected, createBridgeClient } from '../bridge/client.js';
import { readPidFile } from '../bridge/server.js';
import { ensurePluginFiles, isPluginSetUp, getPluginDir } from '../utils/plugin-setup.js';
import { success, error, info, warn, status } from '../utils/output.js';

const POLL_INTERVAL = 2000;
const POLL_TIMEOUT = 120_000;

function isFigmaRunning(): boolean {
  if (process.platform !== 'darwin') return true; // can't detect on other platforms
  try {
    const out = execFileSync('pgrep', ['-x', 'Figma'], { stdio: 'pipe' }).toString();
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

function openFigma(): void {
  if (process.platform !== 'darwin') return;
  try {
    execFileSync('open', ['-a', 'Figma'], { stdio: 'ignore' });
  } catch {
    // Figma may not be installed — user will see the wait message
  }
}

async function waitForPlugin(): Promise<boolean> {
  const start = Date.now();
  let dots = 0;

  while (Date.now() - start < POLL_TIMEOUT) {
    if (await isPluginConnected()) {
      process.stdout.write('\r\x1b[K'); // clear the waiting line
      return true;
    }
    dots = (dots + 1) % 4;
    status(`Waiting for plugin connection${'.'.repeat(dots)}`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  process.stdout.write('\r\x1b[K');
  return false;
}

export function registerConnectCommand(program: Command): void {
  program
    .command('connect')
    .description('Start bridge server and verify plugin connection')
    .action(async () => {
      try {
        // 1. Ensure plugin files are at ~/.desh/plugin/
        const wasSetUp = isPluginSetUp();
        const pluginDir = ensurePluginFiles();

        // 2. Ensure bridge server is running
        if (await isBridgeRunning()) {
          info('Bridge server already running');
        } else {
          info('Starting bridge server...');
          await ensureBridgeServer();
          success('Bridge server started');
        }

        // 3. Check if plugin is already connected
        if (await isPluginConnected()) {
          const client = createBridgeClient();
          const pageInfo = (await client.evaluate(`(function() {
            return { name: figma.currentPage.name, id: figma.currentPage.id };
          })()`)) as { name: string; id: string } | undefined;
          success(pageInfo ? `Connected to "${pageInfo.name}"` : 'Connected to Figma');
          return;
        }

        // 4. Plugin not connected — help the user
        if (!isFigmaRunning()) {
          info('Opening Figma...');
          openFigma();
          // Give Figma a moment to launch
          await new Promise((r) => setTimeout(r, 3000));
        }

        if (!wasSetUp) {
          // First-time setup
          console.log('');
          info('First-time setup — import the desh plugin in Figma:');
          console.log('');
          console.log('  1. In Figma → Plugins → Development → Import plugin from manifest...');
          console.log(`  2. Select: ${pluginDir}/manifest.json`);
          console.log('  3. Then run it: Plugins → Development → desh');
          console.log('');
          info('This is a one-time step.');
          console.log('');
        } else {
          // Plugin files exist but plugin isn't running
          console.log('');
          info('Run the desh plugin in your Figma file:');
          console.log('  Plugins → Development → desh');
          console.log('');
        }

        // 5. Wait for plugin to connect
        if (await waitForPlugin()) {
          const client = createBridgeClient();
          const pageInfo = (await client.evaluate(`(function() {
            return { name: figma.currentPage.name, id: figma.currentPage.id };
          })()`)) as { name: string; id: string } | undefined;
          success(pageInfo ? `Connected to "${pageInfo.name}"` : 'Connected to Figma');
        } else {
          warn('Timed out waiting for plugin connection (2 min).');
          info('Make sure the desh plugin is running in Figma, then try again.');
        }
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
