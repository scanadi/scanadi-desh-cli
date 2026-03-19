import type { Command } from 'commander';
import { join, relative } from 'path';
import { loadConfig, requireConfig } from '../config.js';
import { loadComponentMap, saveComponentMap, type ComponentMap } from '../linker/component-map.js';
import { findBestMatch } from '../linker/match.js';
import { scanComponentFile } from '../scanner/components.js';
import { getFileComponents, getFileComponentSets } from '../api/figma-rest.js';
import { success, error, info, warn, status, progressDone } from '../utils/output.js';
import { readdirSync, statSync } from 'fs';

function collectTsxFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        if (statSync(full).isDirectory()) {
          if (!['node_modules', '.git', 'dist'].includes(entry)) {
            files.push(...collectTsxFiles(full));
          }
        } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
          files.push(full);
        }
      } catch {}
    }
  } catch {}
  return files;
}

export function registerComponentLinkCommands(parent: Command): void {
  // --- components link ---
  parent
    .command('link [name] [figmaKey]')
    .description('Link code components to Figma library components by name')
    .option('--dry-run', 'Show matches without writing')
    .action(async (name?: string, figmaKey?: string, opts?: { dryRun?: boolean }) => {
      try {
        const config = requireConfig();
        const fileKey = config.library?.fileKey || config.libraryFileKey;
        if (!fileKey) {
          error('No library configured. Run `desh lib set-library <fileKey>` first.');
          process.exit(1);
        }

        // 1. Scan code components
        status('Scanning code components...');
        const primDir = config.primitives ? join(config.configDir, config.primitives) : null;
        const codeComponents: Array<{ name: string; file: string; variants: Record<string, string[]>; subComponents: string[] }> = [];

        if (primDir) {
          for (const file of collectTsxFiles(primDir)) {
            const def = scanComponentFile(file, 'primitives');
            if (def && def.exports.length > 0) {
              codeComponents.push({
                name: def.exports[0],
                file: file,
                variants: def.variants,
                subComponents: def.subComponents,
              });
            }
          }
        }
        progressDone();

        // 2. Fetch Figma library components
        status('Fetching Figma library components...');
        const [components, componentSets] = await Promise.all([
          getFileComponents(fileKey),
          getFileComponentSets(fileKey),
        ]);
        progressDone();

        // Build a list of top-level Figma components (sets + standalone)
        // Filter out deeply nested components (e.g. "DropdownMenu / Item / Label")
        // — these are sub-components, not top-level design system components
        const figmaEntries = [
          ...componentSets
            .filter(cs => (cs.name.match(/\//g) || []).length <= 1)
            .map(cs => ({ name: cs.name, key: cs.key, type: 'COMPONENT_SET' as const, nodeId: cs.nodeId })),
          ...components
            .filter(c => !c.componentSetName && (c.name.match(/\//g) || []).length <= 1)
            .map(c => ({ name: c.name, key: c.key, type: 'COMPONENT' as const, nodeId: undefined })),
        ];

        // 3. Match
        const map = loadComponentMap(config.configDir);
        map.libraryFileKey = fileKey;
        map.linkedAt = new Date().toISOString();

        const toLink = name
          ? codeComponents.filter(c => c.name.toLowerCase() === name.toLowerCase())
          : codeComponents;

        if (name && toLink.length === 0) {
          error(`Component "${name}" not found in code. Available: ${codeComponents.map(c => c.name).join(', ')}`);
          process.exit(1);
        }

        let linked = 0;
        let skipped = 0;

        for (const cc of toLink) {
          // If explicit figmaKey provided, use it directly
          if (figmaKey && name) {
            const figmaEntry = figmaEntries.find(f => f.key === figmaKey) ||
              components.find(c => c.key === figmaKey);
            if (!figmaEntry) {
              warn(`Figma key "${figmaKey}" not found in library`);
              skipped++;
              continue;
            }
            map.components[cc.name] = {
              codeFile: relative(config.configDir, cc.file),
              figmaKey: figmaEntry.key,
              figmaName: figmaEntry.name,
              figmaType: 'type' in figmaEntry ? figmaEntry.type : 'COMPONENT',
              figmaNodeId: 'nodeId' in figmaEntry ? figmaEntry.nodeId : undefined,
              codeVariants: cc.variants,
              figmaVariants: {}, // Will be populated on first diff
              subComponents: cc.subComponents.length > 0 ? cc.subComponents : undefined,
            };
            linked++;
            continue;
          }

          // Auto-match by name
          const match = findBestMatch(cc.name, figmaEntries);
          if (match) {
            const figmaEntry = figmaEntries.find(f => f.key === match.key);
            const figmaType = figmaEntry?.type || 'COMPONENT';
            if (opts?.dryRun) {
              console.log(`  ${cc.name} → ${match.name} (${figmaType})`);
            } else {
              map.components[cc.name] = {
                codeFile: relative(config.configDir, cc.file),
                figmaKey: match.key,
                figmaName: match.name,
                figmaType: figmaType,
                figmaNodeId: figmaEntry?.nodeId,
                codeVariants: cc.variants,
                figmaVariants: {},
                subComponents: cc.subComponents.length > 0 ? cc.subComponents : undefined,
              };
            }
            linked++;
          } else {
            if (opts?.dryRun) {
              console.log(`  ${cc.name} → (no match)`);
            }
            skipped++;
          }
        }

        if (!opts?.dryRun) {
          saveComponentMap(config.configDir, map);
        }

        success(`${linked} component(s) linked, ${skipped} unmatched`);
        if (skipped > 0) {
          info('Use `desh components link <name> <figmaKey>` to manually link unmatched components');
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // --- components linked ---
  parent
    .command('linked')
    .description('Show all linked components')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      try {
        const config = requireConfig();
        const map = loadComponentMap(config.configDir);
        const entries = Object.entries(map.components);

        if (entries.length === 0) {
          info('No linked components. Run `desh components link` first.');
          return;
        }

        if (opts.json) {
          console.log(JSON.stringify(map, null, 2));
          return;
        }

        for (const [name, comp] of entries) {
          const variantStr = Object.keys(comp.codeVariants).length > 0
            ? ` (${Object.keys(comp.codeVariants).join(', ')})`
            : '';
          console.log(`  ${name} → ${comp.figmaName} [${comp.figmaType}]${variantStr}`);
        }
        success(`${entries.length} linked component(s)`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // --- components unlink ---
  parent
    .command('unlink <name>')
    .description('Remove link for a component')
    .action(async (name: string) => {
      try {
        const config = requireConfig();
        const map = loadComponentMap(config.configDir);
        if (!map.components[name]) {
          error(`Component "${name}" is not linked`);
          process.exit(1);
        }
        delete map.components[name];
        saveComponentMap(config.configDir, map);
        success(`Unlinked "${name}"`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
