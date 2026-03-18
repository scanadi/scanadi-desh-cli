import type { Command } from 'commander';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { scanProject } from '../scanner/project.js';
import { success, error, info, warn } from '../utils/output.js';
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

        const config: Record<string, unknown> = {};
        if (project.suggestedTokens.length === 1) {
          config.tokens = project.suggestedTokens[0];
        } else if (project.suggestedTokens.length > 1) {
          config.tokens = project.suggestedTokens;
        }
        if (project.suggestedPrimitives) config.primitives = project.suggestedPrimitives;
        if (project.suggestedComponents.length > 0) config.components = project.suggestedComponents;

        writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
        success('Wrote desh.config.json');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
