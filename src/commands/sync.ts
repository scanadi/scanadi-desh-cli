import type { Command } from 'commander';
import { join } from 'path';
import { readdirSync, statSync } from 'fs';
import { loadConfig } from '../config.js';
import { extractTokens } from '../scanner/tokens.js';
import { generateTokenSyncJs } from '../codegen/tokens.js';
import type { ComponentDef } from '../scanner/components.js';
import { generateComponentPushJs, generatePreambleJs, generateSummaryJs } from '../codegen/components.js';
import { runFigmaCode } from '../utils/figma-eval.js';
import { loadRegistry, saveRegistry, type ComponentRegistry } from '../registry.js';
import { error, info, success, warn, progress, progressDone, progressBar } from '../utils/output.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectFiles(dir: string, files: string[] = []): string[] {
  try {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'index.ts' || entry === 'index.tsx') continue;
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isFile() && (entry.endsWith('.tsx') || entry.endsWith('.ts'))) files.push(full);
        else if (stat.isDirectory()) collectFiles(full, files);
      } catch {}
    }
  } catch {}
  return files;
}

async function scanDirectory(dir: string, source: 'primitives' | 'components'): Promise<ComponentDef[]> {
  const { scanComponentFile } = await import('../scanner/components.js');
  const files = collectFiles(dir);
  const results: ComponentDef[] = [];
  for (let i = 0; i < files.length; i++) {
    const name = files[i].split('/').pop() ?? files[i];
    progress(i + 1, files.length, `Scanning ${source}: ${name}`);
    try {
      const def = scanComponentFile(files[i], source);
      if (def) results.push(def);
    } catch {}
  }
  if (files.length > 0) progressDone();
  return results;
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .description('Push tokens + components from codebase → Figma')
    .option('--force', 'Skip cache')
    .option('--json', 'Output as JSON')
    .action(async (opts: { force?: boolean; json?: boolean }) => {
      const config = loadConfig();
      if (!config) {
        error('No desh.config.json found. Run `desh init` to set up your project.');
        process.exit(1);
      }

      if (!opts.json) {
        info('Syncing codebase → Figma\n');
      }

      const results: {
        tokens?: { created: number; collection: string };
        components?: { created: number };
        errors: string[];
      } = { errors: [] };

      // --- 1. Tokens ---
      if (config.tokens.length > 0) {
        try {
          if (!opts.json) process.stdout.write('  Tokens         ');
          const cssFiles = config.tokens.map(f => join(config.configDir, f));
          const tokenMap = await extractTokens(cssFiles);
          const lightCount = Object.keys(tokenMap.light).length;

          if (lightCount === 0) {
            if (!opts.json) console.log(`\x1b[33m⚠\x1b[0m  No CSS variables found`);
          } else {
            const js = generateTokenSyncJs(tokenMap);
            const result = await runFigmaCode<{ created: number; collection: string }>(js, 60_000);
            results.tokens = result;
            if (!opts.json) console.log(`\x1b[32m✓\x1b[0m  ${result.created} variables → "${result.collection}"`);
          }
        } catch (e) {
          results.errors.push(`tokens: ${(e as Error).message}`);
          if (!opts.json) console.log(`\x1b[31m✗\x1b[0m  ${(e as Error).message}`);
        }
      }

      // --- 2. Components ---
      try {
        if (!opts.json) console.log('');

        const allComponents: ComponentDef[] = [];
        if (config.primitives) {
          allComponents.push(...await scanDirectory(join(config.configDir, config.primitives), 'primitives'));
        }
        for (const compPath of config.components) {
          allComponents.push(...await scanDirectory(join(config.configDir, compPath), 'components'));
        }

        if (allComponents.length === 0) {
          if (!opts.json) console.log('  Components     \x1b[90mno components found\x1b[0m');
        } else {
          // Get Figma file info for registry
          const fileInfo = await runFigmaCode<{ fileKey: string; pageId: string }>(
            'JSON.stringify({ fileKey: figma.fileKey || "", pageId: figma.currentPage.id })'
          );

          // Preamble: load fonts, variables, init state
          progressBar(0, allComponents.length, 'Components', 'Loading fonts & variables...');
          await runFigmaCode(generatePreambleJs(), 30_000);

          // Load existing registry to merge into
          const registry: ComponentRegistry = loadRegistry(config.configDir);

          // Push each component directly (creates real Figma Components/ComponentSets)
          let pushed = 0;
          for (let i = 0; i < allComponents.length; i++) {
            progressBar(i + 1, allComponents.length, 'Components', allComponents[i].name);
            try {
              const js = generateComponentPushJs(allComponents[i]);
              const result = await runFigmaCode<string>(js, 30_000);
              const parsed = typeof result === 'string' ? JSON.parse(result) : result;
              if (parsed?.nodeId) {
                registry.components[parsed.name] = {
                  nodeId: parsed.nodeId,
                  type: parsed.type,
                  properties: parsed.properties,
                  defaultVariant: parsed.defaultVariant,
                  children: parsed.children,
                };
                pushed++;
              }
            } catch {}
          }
          progressDone();

          // Save registry
          registry.pushedAt = new Date().toISOString();
          registry.figmaFileKey = fileInfo?.fileKey || '';
          registry.pageId = fileInfo?.pageId || '';
          saveRegistry(config.configDir, registry);

          results.components = { created: pushed };
          if (!opts.json) {
            console.log(`  Components     \x1b[32m✓\x1b[0m  ${pushed} pushed to Figma`);
            console.log(`  Registry       \x1b[32m✓\x1b[0m  Saved to .desh-registry.json`);
          }
        }
      } catch (e) {
        progressDone();
        results.errors.push(`components: ${(e as Error).message}`);
        if (!opts.json) console.log(`  Components     \x1b[31m✗\x1b[0m  ${(e as Error).message}`);
      }

      // --- Summary ---
      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      console.log('');
      if (results.errors.length === 0) {
        success('Sync complete');
      } else {
        warn(`Sync completed with ${results.errors.length} error(s)`);
        for (const e of results.errors) console.log(`  \x1b[31m•\x1b[0m ${e}`);
      }
    });
}
