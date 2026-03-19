import type { Command } from 'commander';
import { join } from 'path';
import { requireConfig } from '../config.js';
import { loadComponentMap, saveComponentMap } from '../linker/component-map.js';
import { diffComponent, type ComponentDiffResult } from '../linker/diff.js';
import { scanComponentFile } from '../scanner/components.js';
import { getNodeChildren } from '../api/figma-rest.js';
import { success, error, info, status, progressDone } from '../utils/output.js';

function formatDiff(name: string, diff: ComponentDiffResult): string {
  const lines: string[] = [`${name}:`];

  if (diff.inSync) {
    lines.push('  = In sync');
    return lines.join('\n');
  }

  for (const [axis, axisDiff] of Object.entries(diff.axes)) {
    if (axisDiff.matched.length > 0 && axisDiff.codeOnly.length === 0 && axisDiff.figmaOnly.length === 0) {
      lines.push(`  ✓ ${axis}: ${axisDiff.matched.join(', ')} — match`);
    } else {
      if (axisDiff.matched.length > 0) {
        lines.push(`  ✓ ${axis}: ${axisDiff.matched.join(', ')} — match`);
      }
      if (axisDiff.codeOnly.length > 0) {
        lines.push(`  + ${axis}: ${axisDiff.codeOnly.join(', ')} — in code, missing in Figma`);
      }
      if (axisDiff.figmaOnly.length > 0) {
        lines.push(`  - ${axis}: ${axisDiff.figmaOnly.join(', ')} — in Figma, missing in code`);
      }
    }
  }

  for (const axis of diff.axesCodeOnly) {
    lines.push(`  + ${axis}: (entire axis) — in code only`);
  }
  for (const axis of diff.axesFigmaOnly) {
    lines.push(`  - ${axis}: (entire axis) — in Figma only`);
  }

  return lines.join('\n');
}

export function registerComponentDiffCommand(parent: Command): void {
  parent
    .command('diff [name]')
    .description('Compare linked component variants between code and Figma')
    .option('--json', 'Output as JSON')
    .action(async (name?: string, opts?: { json?: boolean }) => {
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
          info(name ? `Component "${name}" is not linked.` : 'No linked components. Run `desh components link` first.');
          return;
        }

        // Refresh code variants from source files
        status('Scanning code components...');
        for (const [compName, comp] of entries) {
          const def = scanComponentFile(join(config.configDir, comp.codeFile), 'primitives');
          if (def) {
            comp.codeVariants = def.variants;
          }
        }
        progressDone();

        // Fetch Figma variant info by querying component set nodes directly
        const nodeIds = entries
          .filter(([, comp]) => comp.figmaNodeId && comp.figmaType === 'COMPONENT_SET')
          .map(([, comp]) => comp.figmaNodeId!);

        status('Fetching Figma component data...');
        const nodeChildren = nodeIds.length > 0 ? await getNodeChildren(fileKey, nodeIds) : {};
        progressDone();

        // Parse variant axes from node children names
        function parseVariantAxes(children: Array<{ name: string }>): Record<string, string[]> {
          const axes: Record<string, Set<string>> = {};
          for (const child of children) {
            for (const part of child.name.split(',').map(s => s.trim())) {
              const [rawAxis, value] = part.split('=').map(s => s.trim());
              const axis = rawAxis?.toLowerCase();
              if (axis && value) {
                if (!axes[axis]) axes[axis] = new Set();
                axes[axis].add(value);
              }
            }
          }
          const result: Record<string, string[]> = {};
          for (const [axis, values] of Object.entries(axes)) {
            result[axis] = Array.from(values);
          }
          return result;
        }

        // Run diffs
        const results: Array<{ name: string; diff: ComponentDiffResult }> = [];
        let inSyncCount = 0;
        let diffCount = 0;

        for (const [compName, comp] of entries) {
          // Get Figma variants from the node children query
          const children = comp.figmaNodeId ? nodeChildren[comp.figmaNodeId] : undefined;
          const figmaVariants = children ? parseVariantAxes(children) : {};

          // Update stored Figma variants
          comp.figmaVariants = figmaVariants;

          const diff = diffComponent({
            codeVariants: comp.codeVariants,
            figmaVariants,
          });

          results.push({ name: compName, diff });
          if (diff.inSync) inSyncCount++;
          else diffCount++;
        }

        // Save updated map with fresh variant data
        saveComponentMap(config.configDir, map);

        if (opts?.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        for (const { name: n, diff } of results) {
          console.log(formatDiff(n, diff));
          console.log('');
        }

        success(`${diffCount} component(s) with differences, ${inSyncCount} in sync`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
