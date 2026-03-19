import type { Command } from 'commander';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { scanProject } from '../scanner/project.js';
import { success, error, info, warn } from '../utils/output.js';
import { isSkillInstalled } from '../utils/skill-setup.js';
import { runSkillSetup } from './setup.js';
import { runFigmaCode } from '../utils/figma-eval.js';
import * as readline from 'readline';

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Scan project and generate desh.config.json')
    .option('-y, --yes', 'Skip prompts, accept defaults')
    .action(async (opts: { yes?: boolean }) => {
      try {
        // Mandatory: ensure Claude Code skill is installed
        if (!isSkillInstalled()) {
          await runSkillSetup(opts);
          console.log('');
        }

        const configPath = join(process.cwd(), 'desh.config.json');
        if (existsSync(configPath) && !opts.yes) {
          warn('desh.config.json already exists');
          const overwrite = await ask('Overwrite? [y/N] ');
          if (overwrite.toLowerCase() !== 'y') return;
        }

        info('Scanning project...');
        const project = scanProject(process.cwd());

        if (project.isMonorepo) info('Detected monorepo');
        if (project.suggestedTokens.length > 0) {
          info(`Found token files: ${project.suggestedTokens.join(', ')}`);
        } else {
          warn('No globals.css files found');
        }
        if (project.suggestedPrimitives) {
          info(`Found primitives: ${project.suggestedPrimitives}`);
        }
        if (project.suggestedComponents.length > 0) {
          info(`Found components: ${project.suggestedComponents.join(', ')}`);
        }

        // Try to discover linked library (requires plugin connection)
        let library: { fileKey: string; name: string } | undefined;
        try {
          const raw = await runFigmaCode<string>(`(async () => {
  const found = new Map();
  for (const child of figma.currentPage.children) {
    if (found.size > 0) break;
    function walk(n, depth) {
      if (depth > 3 || found.size > 0) return;
      if (n.type === 'INSTANCE') {
        try {
          const mc = n.mainComponent;
          if (mc && mc.remote) {
            found.set('key', mc.key);
            found.set('remote', true);
          }
        } catch(e) {}
      }
      if ('children' in n && n.type !== 'INSTANCE') {
        for (const c of n.children) walk(c, depth + 1);
      }
    }
    walk(child, 0);
  }
  try {
    const libs = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    if (libs.length > 0) {
      return JSON.stringify({ libraryName: libs[0].libraryName, collections: libs.map(l => l.libraryName) });
    }
  } catch(e) {}
  return JSON.stringify(null);
})()`, 15_000);

          const result = raw ? JSON.parse(raw) : null;
          if (result && result.libraryName) {
            info(`Detected linked library: ${result.libraryName}`);
            info('Run \`desh lib set-library <fileKey>\` to enable component linking');
          }
        } catch {
          // Plugin not connected or discovery failed — skip silently
        }

        const config: Record<string, unknown> = {};
        if (project.suggestedTokens.length === 1) {
          config.tokens = project.suggestedTokens[0];
        } else if (project.suggestedTokens.length > 1) {
          config.tokens = project.suggestedTokens;
        }
        if (project.suggestedPrimitives) config.primitives = project.suggestedPrimitives;
        if (project.suggestedComponents.length > 0) config.components = project.suggestedComponents;
        if (library) config.library = library;

        writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
        success('Wrote desh.config.json');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
