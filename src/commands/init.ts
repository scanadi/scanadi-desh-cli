import type { Command } from 'commander';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { scanProject } from '../scanner/project.js';
import { success, error, info, warn } from '../utils/output.js';
import { isSkillInstalled } from '../utils/skill-setup.js';
import { runSkillSetup } from './setup.js';
import { runFigmaCode } from '../utils/figma-eval.js';
import { getComponentFileKey, getFileInfo } from '../api/figma-rest.js';
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

        // Try to discover linked library (requires plugin + API token)
        let library: { fileKey: string; name: string } | undefined;
        try {
          // Step 1: Find a remote component instance via the plugin
          const raw = await runFigmaCode<string>(`(async () => {
  let componentKey = null;
  for (const page of figma.root.children) {
    if (componentKey) break;
    try {
      await page.loadAsync();
    } catch(e) { continue; }
    function walk(n, depth) {
      if (depth > 4 || componentKey) return;
      if (n.type === 'INSTANCE') {
        try {
          const mc = n.mainComponent;
          if (mc && mc.remote) { componentKey = mc.key; return; }
        } catch(e) {}
      }
      if ('children' in n && n.type !== 'INSTANCE') {
        for (const c of n.children) { walk(c, depth + 1); if (componentKey) return; }
      }
    }
    for (const child of page.children) { walk(child, 0); if (componentKey) break; }
  }
  return JSON.stringify(componentKey);
})()`, 20_000);

          const componentKey = raw ? JSON.parse(raw) : null;
          if (componentKey) {
            // Step 2: Resolve component key → file key via REST API
            const resolved = await getComponentFileKey(componentKey);
            if (resolved) {
              // Step 3: Get the file name
              const fileInfo = await getFileInfo(resolved.fileKey);
              library = { fileKey: resolved.fileKey, name: fileInfo.name };
              info(`Detected linked library: ${fileInfo.name}`);
            }
          }
        } catch {
          // Plugin not connected, no API token, or discovery failed — skip silently
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
