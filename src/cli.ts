import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';

// Auto-load .env.local then .env from cwd
function loadEnvFile(filename: string): void {
  const envPath = resolve(process.cwd(), filename);
  if (!existsSync(envPath)) return;
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const eqIdx = trimmed.indexOf('=');
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Don't overwrite existing env vars, skip encrypted values
      if (!process.env[key] && !val.startsWith('encrypted:')) {
        process.env[key] = val;
      }
    }
  } catch {}
}
loadEnvFile('.env.local'); // personal overrides (gitignored)
loadEnvFile('.env');       // project defaults
import { registerConnectCommand } from './commands/connect.js';
import { registerEvalCommand } from './commands/eval.js';
import { registerTokenCommands } from './commands/tokens.js';
import { registerInitCommand } from './commands/init.js';
import { registerComponentCommands } from './commands/components.js';
import { registerRenderCommand } from './commands/render.js';
import { registerCreateCommands } from './commands/create.js';
import { registerSetCommands } from './commands/set.js';
import { registerFindCommands } from './commands/find.js';
import { registerCanvasCommands } from './commands/canvas.js';
import { registerNodeCommands } from './commands/node.js';
import { registerFilesCommand } from './commands/files.js';
import { registerVerifyCommand } from './commands/verify.js';
import { registerSlotCommands } from './commands/slot.js';
import { registerExportCommands } from './commands/export.js';
import { registerLintCommands } from './commands/lint.js';
import { registerA11yCommands } from './commands/a11y.js';
import { registerBlockCommands } from './commands/blocks.js';
import { registerLibCommands } from './commands/lib.js';
import { registerRawCommands } from './commands/raw.js';
import { registerFigJamCommands } from './commands/figjam.js';
import { registerRecreateCommands } from './commands/recreate.js';
import { registerSyncCommand } from './commands/sync.js';
import { registerVarCommands, registerBindCommands } from './commands/var.js';
import { registerRemoveBgCommand } from './commands/removebg.js';
import { registerPagesCommands } from './commands/pages.js';
import { registerShortcutCommands } from './commands/shortcuts.js';
import { registerSetupCommand } from './commands/setup.js';

const program = new Command();

program
  .name('desh')
  .description('Design Shell — control Figma Desktop from the command line')
  .version(JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8')).version);

// Connection & setup
registerSetupCommand(program);
registerConnectCommand(program);
registerInitCommand(program);

// Core execution
registerEvalCommand(program);
registerRenderCommand(program);

// Project-aware
registerTokenCommands(program);
registerComponentCommands(program);

// Element creation & modification
registerCreateCommands(program);
registerSetCommands(program);

// Query & selection
registerFindCommands(program);

// Canvas operations
registerCanvasCommands(program);

// Node operations
registerNodeCommands(program);

// Slot operations
registerSlotCommands(program);

// Block & variant operations
registerBlockCommands(program);

// Library operations
registerLibCommands(program);

// Raw tree operations
registerRawCommands(program);

// FigJam operations
registerFigJamCommands(program);

// URL recreation
registerRecreateCommands(program);

// Sync
registerSyncCommand(program);

// Export
registerExportCommands(program);

// Design quality
registerLintCommands(program);
registerA11yCommands(program);

// Variable management & bindings
registerVarCommands(program);
registerBindCommands(program);

// Image utilities
registerRemoveBgCommand(program);

// Pages
registerPagesCommands(program);

// Shortcuts (text set/get, resize, rename)
registerShortcutCommands(program);

// Utilities
registerFilesCommand(program);
registerVerifyCommand(program);

program.parse();
