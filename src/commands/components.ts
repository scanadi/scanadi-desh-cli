import type { Command } from 'commander';
import { requireConfig } from '../config.js';
import type { ComponentDef } from '../scanner/components.js';
import { success, error, info, warn, progress, progressDone, progressBar } from '../utils/output.js';
import { generateComponentPushJs, generatePreambleJs, generateSummaryJs } from '../codegen/components.js';
import { runFigmaCode } from '../utils/figma-eval.js';
import { loadRegistry, saveRegistry, type ComponentRegistry } from '../registry.js';
import { join } from 'path';
import { readdirSync, statSync } from 'fs';
import { registerComponentLinkCommands } from './component-link.js';
import { registerComponentDiffCommand } from './component-diff.js';
import { registerComponentPushCommand } from './component-push.js';

function collectFiles(dir: string, files: string[] = []): string[] {
  try {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isFile() && (entry.endsWith('.tsx') || entry.endsWith('.ts'))) {
          files.push(full);
        } else if (stat.isDirectory()) {
          collectFiles(full, files);
        }
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
    const file = files[i];
    const name = file.split('/').pop() ?? file;
    progress(i + 1, files.length, `Scanning ${source}: ${name}`);
    try {
      const def = scanComponentFile(file, source);
      if (def) results.push(def);
    } catch {}
  }
  if (files.length > 0) progressDone();
  return results;
}

export function registerComponentCommands(program: Command): void {
  const comp = program.command('components').description('Component commands');

  comp
    .command('list')
    .description('Show discovered components with exports and variants')
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Show all details including props and classes')
    .action(async (opts: { json?: boolean; verbose?: boolean }) => {
      try {
        const config = requireConfig();
        const components: ComponentDef[] = [];

        if (config.primitives) {
          const primDir = join(config.configDir, config.primitives);
          components.push(...await scanDirectory(primDir, 'primitives'));
        }

        for (const compPath of config.components) {
          const compDir = join(config.configDir, compPath);
          components.push(...await scanDirectory(compDir, 'components'));
        }

        if (components.length === 0) {
          info('No components found. Check paths in desh.config.json');
          return;
        }

        if (opts.json) {
          console.log(JSON.stringify(components, null, 2));
          return;
        }

        // Summary counts
        const withVariants = components.filter(c => c.hasVariants).length;
        const totalExports = components.reduce((sum, c) => sum + c.exports.length, 0);

        for (const c of components) {
          const tag = c.hasVariants ? '●' : '○';
          const exportsStr = c.exports.length > 1
            ? ` → ${c.exports.join(', ')}`
            : '';
          const variantStr = Object.entries(c.variants)
            .map(([k, v]) => `${k}: ${v.join('|')}`)
            .join(', ');

          console.log(`  ${tag} ${c.name} [${c.source}]${exportsStr}`);
          if (variantStr) console.log(`    variants: ${variantStr}`);
          if (c.subComponents.length > 0) console.log(`    sub-components: ${c.subComponents.join(', ')}`);
          if (opts.verbose) {
            if (c.icons.length > 0) console.log(`    icons: ${c.icons.join(', ')}`);
            if (Object.keys(c.props).length > 0) console.log(`    props: ${Object.keys(c.props).join(', ')}`);
            if (c.baseClasses.length > 0) console.log(`    classes: ${c.baseClasses.slice(0, 10).join(' ')}${c.baseClasses.length > 10 ? ' ...' : ''}`);
          }
        }

        console.log('');
        console.log(`  ● = has cva() variants    ○ = structural component`);
        success(`${components.length} files, ${totalExports} exports (${withVariants} with variants)`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  comp
    .command('push-all')
    .alias('sync')
    .description('Push project components to Figma as component sets')
    .action(async () => {
      try {
        const config = requireConfig();
        const components: ComponentDef[] = [];

        if (config.primitives) {
          const primDir = join(config.configDir, config.primitives);
          components.push(...await scanDirectory(primDir, 'primitives'));
        }

        for (const compPath of config.components) {
          const compDir = join(config.configDir, compPath);
          components.push(...await scanDirectory(compDir, 'components'));
        }

        if (components.length === 0) {
          info('No components found to push. Check paths in desh.config.json');
          return;
        }

        info(`Pushing ${components.length} component(s) to Figma...\n`);

        // Get Figma file info for registry
        const fileInfoRaw = await runFigmaCode<string>(
          'JSON.stringify({ fileKey: figma.fileKey || "", pageId: figma.currentPage.id })'
        );
        const fileInfo = typeof fileInfoRaw === 'string' ? JSON.parse(fileInfoRaw) : fileInfoRaw as { fileKey: string; pageId: string };

        // Run preamble: load fonts, variables, init state
        progressBar(0, components.length, 'Pushing', 'Loading fonts & variables...');
        await runFigmaCode(generatePreambleJs(), 30_000);

        // Load existing registry to merge into
        const registry: ComponentRegistry = loadRegistry(config.configDir);

        // Push each component directly (creates real Figma Components/ComponentSets)
        let pushed = 0;
        let errors = 0;
        for (let i = 0; i < components.length; i++) {
          const comp = components[i];
          progressBar(i + 1, components.length, 'Pushing', comp.name);
          try {
            const js = generateComponentPushJs(comp);
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
          } catch {
            errors++;
          }
        }

        progressDone();

        // Summary
        const summaryRaw = await runFigmaCode<string>(generateSummaryJs(), 10_000);
        const summary = typeof summaryRaw === 'string' ? JSON.parse(summaryRaw) : summaryRaw as { created: number; components: Array<{ name: string; id: string; type: string }> };

        console.log('');
        if (summary?.components && summary.components.length > 0) {
          for (const c of summary.components.slice(0, 30)) {
            console.log(`  \u2713 ${c.name}  ${c.type === 'COMPONENT_SET' ? '(variants)' : '(component)'}  ID: ${c.id}`);
          }
          if (summary.components.length > 30) {
            console.log(`  ... and ${summary.components.length - 30} more`);
          }
        }

        // Save registry
        registry.pushedAt = new Date().toISOString();
        registry.figmaFileKey = fileInfo?.fileKey || '';
        registry.pageId = fileInfo?.pageId || '';
        saveRegistry(config.configDir, registry);

        console.log('');
        if (errors > 0) {
          warn(`Pushed ${pushed} component(s), ${errors} failed`);
        } else {
          success(`Pushed ${pushed} component(s) to Figma`);
        }
        success('Registry saved to .desh-registry.json');
      } catch (err) {
        progressDone();
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  registerComponentLinkCommands(comp);
  registerComponentDiffCommand(comp);
  registerComponentPushCommand(comp);
}
