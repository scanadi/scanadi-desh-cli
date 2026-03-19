import type { Command } from 'commander';
import { join } from 'path';
import { requireConfig } from '../config.js';
import { loadComponentMap } from '../linker/component-map.js';
import { diffComponent } from '../linker/diff.js';
import { addVariantToFile } from '../linker/pull.js';
import { scanComponentFile } from '../scanner/components.js';
import { getFileComponents } from '../api/figma-rest.js';
import { success, error, info, warn, status, progressDone } from '../utils/output.js';

export function registerComponentPullCommand(parent: Command): void {
  parent
    .command('pull [name]')
    .description('Pull missing variant values from Figma to code')
    .option('--dry-run', 'Show what would change without modifying files')
    .action(async (name?: string, opts?: { dryRun?: boolean }) => {
      try {
        const config = requireConfig();
        const fileKey = config.library?.fileKey || config.libraryFileKey;
        if (!fileKey) {
          error('No library configured. Run `desh lib set-library <fileKey>` first.');
          process.exit(1);
        }

        const map = loadComponentMap(config.configDir);
        const entries = name
          ? [[name, map.components[name]] as const].filter(([, v]) => v)
          : Object.entries(map.components);

        if (entries.length === 0) {
          info(name ? `Component "${name}" is not linked.` : 'No linked components.');
          return;
        }

        // Refresh code variants
        for (const [, comp] of entries) {
          const def = scanComponentFile(join(config.configDir, comp.codeFile), 'primitives');
          if (def) comp.codeVariants = def.variants;
        }

        // Fetch Figma state
        status('Fetching Figma component data...');
        const components = await getFileComponents(fileKey);
        progressDone();

        // Build Figma variant map
        const figmaVariantsBySetName = new Map<string, Record<string, Set<string>>>();
        for (const comp of components) {
          if (!comp.componentSetName) continue;
          if (!figmaVariantsBySetName.has(comp.componentSetName)) {
            figmaVariantsBySetName.set(comp.componentSetName, {});
          }
          const axisMap = figmaVariantsBySetName.get(comp.componentSetName)!;
          for (const part of comp.name.split(',').map(s => s.trim())) {
            const [axis, value] = part.split('=').map(s => s.trim());
            if (axis && value) {
              if (!axisMap[axis]) axisMap[axis] = new Set();
              axisMap[axis].add(value);
            }
          }
        }

        let totalPulled = 0;

        for (const [compName, comp] of entries) {
          if (comp.figmaType !== 'COMPONENT_SET') {
            info(`${compName}: structural component — pull not applicable`);
            continue;
          }

          const figmaAxes = figmaVariantsBySetName.get(comp.figmaName);
          const figmaVariants: Record<string, string[]> = {};
          if (figmaAxes) {
            for (const [axis, values] of Object.entries(figmaAxes)) {
              figmaVariants[axis] = Array.from(values);
            }
          }

          const diff = diffComponent({ codeVariants: comp.codeVariants, figmaVariants });

          // Collect Figma-only values
          const toPull: Array<{ axis: string; value: string }> = [];
          for (const [axis, axisDiff] of Object.entries(diff.axes)) {
            for (const value of axisDiff.figmaOnly) {
              toPull.push({ axis, value });
            }
          }

          if (toPull.length === 0) {
            info(`${compName}: already in sync`);
            continue;
          }

          const filePath = join(config.configDir, comp.codeFile);

          for (const { axis, value } of toPull) {
            if (opts?.dryRun) {
              console.log(`  ${compName}: would add ${axis}="${value}" to ${comp.codeFile}`);
              totalPulled++;
              continue;
            }

            const added = addVariantToFile(filePath, axis, value);
            if (added) {
              console.log(`  ${compName}: added ${axis}="${value}" to ${comp.codeFile}`);
              totalPulled++;
            } else {
              warn(`  ${compName}: could not add ${axis}="${value}" — manual edit needed`);
            }
          }
        }

        if (opts?.dryRun) {
          success(`Dry run: ${totalPulled} variant(s) would be added to code`);
        } else {
          success(`${totalPulled} variant(s) pulled from Figma to code`);
          if (totalPulled > 0) {
            info('New variants have empty class strings — add Tailwind classes to style them');
          }
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
