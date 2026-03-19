import type { Command } from 'commander';
import { join } from 'path';
import { requireConfig } from '../config.js';
import { loadComponentMap, saveComponentMap } from '../linker/component-map.js';
import { diffComponent } from '../linker/diff.js';
import { scanComponentFile } from '../scanner/components.js';
import { getFileComponents } from '../api/figma-rest.js';
import { runFigmaCode } from '../utils/figma-eval.js';
import { success, error, info, warn, status, progressDone } from '../utils/output.js';

export function registerComponentPushCommand(parent: Command): void {
  parent
    .command('push [name]')
    .description('Push missing variant values from code to Figma library')
    .option('--dry-run', 'Show what would change without modifying Figma')
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

        // Fetch current Figma state
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

        // Pre-flight: check plugin is connected to the library file
        if (!opts?.dryRun) {
          try {
            const currentFile = await runFigmaCode<string>(`figma.fileKey || figma.root.name`, 5_000);
            // If we can detect the file key and it doesn't match, warn
            if (currentFile && fileKey && !currentFile.includes(fileKey)) {
              warn('Plugin may be connected to the wrong file.');
              warn(`Expected library file (key: ${fileKey}). Open the library file in Figma and run the plugin.`);
            }
          } catch {
            warn('Could not verify plugin connection — make sure the plugin is running in the library file');
          }
        }

        // Find what needs pushing
        let totalPushed = 0;

        for (const [compName, comp] of entries) {
          if (comp.figmaType !== 'COMPONENT_SET') {
            info(`${compName}: structural component — push not applicable`);
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

          // Collect values to add (code-only)
          const toAdd: Array<{ axis: string; value: string }> = [];
          for (const [axis, axisDiff] of Object.entries(diff.axes)) {
            for (const value of axisDiff.codeOnly) {
              toAdd.push({ axis, value });
            }
          }

          if (toAdd.length === 0) {
            info(`${compName}: already in sync`);
            continue;
          }

          if (opts?.dryRun) {
            for (const { axis, value } of toAdd) {
              console.log(`  ${compName}: would add ${axis}=${value}`);
            }
            totalPushed += toAdd.length;
            continue;
          }

          // Push each missing variant to Figma
          status(`Pushing ${toAdd.length} variant(s) for ${compName}...`);
          const code = `(async () => {
  const componentKey = ${JSON.stringify(comp.figmaKey)};
  const comp = await figma.importComponentSetByKeyAsync(componentKey);
  if (!comp) throw new Error('ComponentSet not found: ' + componentKey);

  const children = comp.children.filter(c => c.type === 'COMPONENT');
  if (children.length === 0) throw new Error('No variants in ComponentSet');

  // Use first variant as template
  const template = children[0];
  const added = [];

  const toAdd = ${JSON.stringify(toAdd)};
  for (const item of toAdd) {
    try {
      const clone = template.clone();
      // Set the variant property
      clone.setProperties({ [item.axis]: item.value });
      comp.appendChild(clone);
      added.push(item.axis + '=' + item.value);
    } catch(e) {
      // Property might not exist yet on the set — skip
    }
  }

  return JSON.stringify({ name: comp.name, added });
})()`;

          try {
            const result = JSON.parse(await runFigmaCode<string>(code, 30_000));
            progressDone();
            for (const a of result.added) {
              console.log(`  ${compName}: added ${a}`);
            }
            totalPushed += result.added.length;
          } catch (err) {
            progressDone();
            warn(`${compName}: push failed — ${(err as Error).message}`);
            warn('Make sure the plugin is running in the library file');
          }
        }

        if (opts?.dryRun) {
          success(`Dry run: ${totalPushed} variant(s) would be added`);
        } else {
          success(`${totalPushed} variant(s) pushed to Figma`);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
