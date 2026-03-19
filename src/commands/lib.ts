import type { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { runFigmaCode } from '../utils/figma-eval.js';
import { success, error, info, status, progressDone, warn } from '../utils/output.js';
import { getFileComponents, getFileComponentSets, getFileInfo } from '../api/figma-rest.js';
import { loadRegistry, saveRegistry } from '../registry.js';
import { loadConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerLibCommands(program: Command): void {
  const lib = program
    .command('lib')
    .description('Team library operations (list, import, styles, instances)');

  // ---- lib list -----------------------------------------------------------
  lib
    .command('list')
    .description('List enabled team libraries and their variable collections')
    .action(async () => {
      try {
        status('Loading libraries...');
        const raw = await runFigmaCode<string>(`(async () => {
  try {
    const libs = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    return JSON.stringify(libs.map(l => ({
      key: l.key, name: l.name, libraryName: l.libraryName
    })));
  } catch (e) {
    const cols = await figma.variables.getLocalVariableCollectionsAsync();
    return JSON.stringify(cols.map(c => ({
      id: c.id, name: c.name, variableCount: c.variableIds.length,
      modes: c.modes.map(m => m.name), local: true
    })));
  }
})()`);
        progressDone();
        const items = JSON.parse(raw) as Array<Record<string, unknown>>;
        if (items.length === 0) { info('No libraries found.'); return; }

        for (const item of items) {
          if (item.local) {
            console.log(`  ${item.name}  (local, ${item.variableCount} vars, modes: ${(item.modes as string[]).join('/')})`);
          } else {
            console.log(`  ${item.name}  (${item.libraryName})  key: ${item.key}`);
          }
        }
        success(`${items.length} collection(s)`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- lib collections ----------------------------------------------------
  lib
    .command('collections')
    .description('List library variable collections with keys')
    .action(async () => {
      try {
        status('Loading collections...');
        const raw = await runFigmaCode<string>(`(async () => {
  try {
    const libs = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    return JSON.stringify(libs.map(l => ({
      key: l.key, name: l.name, libraryName: l.libraryName
    })));
  } catch (e) {
    const cols = await figma.variables.getLocalVariableCollectionsAsync();
    return JSON.stringify(cols.map(c => ({
      key: c.id, name: c.name, variableCount: c.variableIds.length
    })));
  }
})()`);
        const items = JSON.parse(raw) as Array<Record<string, unknown>>;
        if (items.length === 0) { info('No collections found.'); return; }

        for (const col of items) {
          console.log(`  ${col.name}  key: ${col.key}${col.libraryName ? `  (${col.libraryName})` : ''}`);
        }
        success(`${items.length} collection(s)`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- lib vars <collectionKey> -------------------------------------------
  // THE MISSING COMMAND: list variables inside a library collection
  lib
    .command('vars <collectionKey>')
    .description('List variables inside a library collection (pass key from `lib collections`)')
    .option('--json', 'Output raw JSON')
    .action(async (collectionKey: string, opts: { json?: boolean }) => {
      try {
        status('Loading variables...');
        const raw = await runFigmaCode<string>(`(async () => {
  const key = ${JSON.stringify(collectionKey)};
  let collectionKey = null;

  // Step 1: Resolve the key — find the actual collection key
  const libs = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();

  // Try exact key match
  const byKey = libs.find(l => l.key === key);
  if (byKey) collectionKey = byKey.key;

  // Try name match (case-insensitive)
  if (!collectionKey) {
    const byName = libs.find(l => l.name === key || l.name.toLowerCase() === key.toLowerCase());
    if (byName) collectionKey = byName.key;
  }

  // Try partial name match
  if (!collectionKey) {
    const byPartial = libs.find(l => l.name.toLowerCase().includes(key.toLowerCase()));
    if (byPartial) collectionKey = byPartial.key;
  }

  // Step 2: Fetch variables from the resolved key
  if (collectionKey) {
    try {
      const vars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(collectionKey);
      if (vars && vars.length > 0) {
        return JSON.stringify(vars.map(v => ({
          key: v.key, name: v.name, resolvedType: v.resolvedType
        })));
      }
    } catch (e) {
      // Library API failed — fall through to local check
    }
  }

  // Step 3: Try as local collection
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const localMatch = cols.find(c => c.id === key || c.name === key || c.name.toLowerCase() === key.toLowerCase());
  if (localMatch) {
    const vars = [];
    for (const vid of localMatch.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(vid);
      if (v) vars.push({ key: v.id, name: v.name, resolvedType: v.resolvedType });
    }
    return JSON.stringify(vars);
  }

  // Nothing found — return helpful error with available names
  const available = libs.map(l => l.name).join(', ');
  throw new Error('Collection not found: ' + key + '. Available: ' + available);
})()`, 90_000);

        progressDone();
        const vars = JSON.parse(raw) as Array<{ key: string; name: string; resolvedType: string }>;

        if (opts.json) {
          console.log(JSON.stringify(vars, null, 2));
          return;
        }

        if (vars.length === 0) { info('No variables in this collection.'); return; }

        for (const v of vars) {
          console.log(`  ${v.name}  (${v.resolvedType})  key: ${v.key}`);
        }
        success(`${vars.length} variable(s)`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- lib import-vars <collection> ---------------------------------------
  lib
    .command('import-vars <collection>')
    .description('Import variables from a library collection (name or key)')
    .action(async (collection: string) => {
      try {
        status('Importing variables...');
        const raw = await runFigmaCode<string>(`(async () => {
  const target = ${JSON.stringify(collection)};

  // Find the collection — try key first, then name match
  const libs = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
  let match = libs.find(l => l.key === target);
  if (!match) match = libs.find(l => l.name === target || l.name.toLowerCase() === target.toLowerCase());
  if (!match) throw new Error('Collection not found: ' + target + '. Use desh lib collections to see available keys.');

  const variables = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(match.key);
  const imported = [];
  for (const v of variables) {
    const localVar = await figma.variables.importVariableByKeyAsync(v.key);
    imported.push({ name: localVar.name, id: localVar.id });
  }
  return JSON.stringify({ collection: match.name, imported: imported.length });
})()`, 120_000);

        const result = JSON.parse(raw) as { collection: string; imported: number };
        success(`Imported ${result.imported} variable(s) from "${result.collection}"`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- lib components — discover library components used in this file ------
  lib
    .command('components')
    .description('List library components used in this file (finds instances on current page)')
    .option('--all-pages', 'Search all pages (slow on large files)')
    .option('--json', 'Output as JSON')
    .action(async (opts: { allPages?: boolean; json?: boolean }) => {
      try {
        status('Scanning for library component instances...');
        const scope = opts.allPages ? 'figma.root' : 'figma.currentPage';
        const raw = await runFigmaCode<string>(`(async () => {
  const found = new Map();
  const MAX = 500;
  const MAX_DEPTH = 5;
  let scanned = 0;

  function walk(n, depth) {
    if (scanned >= MAX || depth > MAX_DEPTH) return;
    scanned++;
    if (n.type === 'INSTANCE') {
      try {
        const main = n.mainComponent;
        if (main && main.remote) {
          const key = main.key;
          if (!found.has(key)) {
            found.set(key, {
              name: main.name,
              key: key,
              id: main.id,
              parent: main.parent?.name || '',
            });
          }
        }
      } catch(e) {}
    }
    if ('children' in n && n.type !== 'INSTANCE') {
      for (const c of n.children) walk(c, depth + 1);
    }
  }

  for (const child of ${scope}.children) {
    if (child.type === 'PAGE') {
      for (const c of child.children) walk(c, 0);
    } else {
      walk(child, 0);
    }
  }

  const result = Array.from(found.values()).sort((a, b) => a.name.localeCompare(b.name));
  return JSON.stringify(result);
})()`, 60_000);

        progressDone();
        const components = JSON.parse(raw) as Array<{ name: string; key: string; id: string; parent: string }>;

        if (components.length === 0) {
          info('No library component instances found on this page.');
          info('Try --all-pages to search the entire file, or switch to a page with designs.');
          return;
        }

        if (opts.json) {
          console.log(JSON.stringify(components, null, 2));
          return;
        }

        for (const c of components) {
          const parentStr = c.parent ? ` (${c.parent})` : '';
          console.log(`  ${c.name}${parentStr}  key: ${c.key}`);
        }
        success(`${components.length} library component(s) found`);
        info('Use `desh lib instance "<key>"` to create a new instance');
      } catch (err) {
        progressDone();
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- lib import-components <lib> ----------------------------------------
  lib
    .command('import-components <lib>')
    .description('Import components from a library')
    .action(async () => {
      info('Use `desh lib components` to discover library components used in this file.');
      info('Then `desh lib instance "<key>"` to create instances.');
    });

  // ---- lib instance <component> -------------------------------------------
  lib
    .command('instance <component>')
    .description('Create instance of a library component by key, name, or partial name')
    .option('-x <number>', 'X position')
    .option('-y <number>', 'Y position')
    .action(async (component: string, opts: { x?: string; y?: string }) => {
      try {
        // Detect if input looks like a component key hash (hex string, 20-40 chars)
        const isKeyHash = /^[a-f0-9]{20,}$/i.test(component);

        status('Creating instance...');
        const raw = await runFigmaCode<string>(`(async () => {
  // Smart positioning
  let x = ${opts.x ? parseInt(opts.x, 10) : 'undefined'};
  let y = ${opts.y ? parseInt(opts.y, 10) : 'undefined'};
  if (x === undefined || y === undefined) {
    let maxRight = 0;
    for (const n of figma.currentPage.children) {
      const right = n.x + n.width;
      if (right > maxRight) maxRight = right;
    }
    if (x === undefined) x = maxRight > 0 ? maxRight + 100 : 100;
    if (y === undefined) y = 100;
  }

  const name = ${JSON.stringify(component)};
  const isKeyHash = ${isKeyHash};

  // 1. Try as component key (hash) — importComponentByKeyAsync
  try {
    await __deshYield(1);
    const comp = await figma.importComponentByKeyAsync(name);
    if (comp) {
      await __deshYield(1);
      const inst = comp.createInstance();
      inst.x = x; inst.y = y;
      figma.currentPage.selection = [inst];
      return JSON.stringify({ name: inst.name, id: inst.id, source: 'library-key' });
    }
  } catch (e) {
    // If input was a key hash and import failed, don't fall through to expensive searches
    if (isKeyHash) return JSON.stringify(null);
  }

  // 2. Find existing instance on CURRENT PAGE ONLY (depth-limited, with yields)
  // Skip this entirely for key hashes — they should only use importComponentByKeyAsync
  let mainComp = null;
  const MAX_DEPTH = 3;
  let searched = 0;

  function findInstance(node, depth) {
    if (depth > MAX_DEPTH || mainComp || searched > 500) return;
    searched++;
    if (node.type === 'INSTANCE') {
      try {
        const mc = node.mainComponent;
        if (mc && (mc.name === name || mc.name.toLowerCase().includes(name.toLowerCase()))) {
          mainComp = mc;
          return;
        }
      } catch(e) {}
    }
    if ('children' in node && node.type !== 'INSTANCE') {
      for (const c of node.children) {
        findInstance(c, depth + 1);
        if (mainComp) return;
      }
    }
  }

  for (const child of figma.currentPage.children) {
    findInstance(child, 0);
    if (mainComp) break;
    // Yield every 50 nodes to keep Figma responsive
    if (searched % 50 === 0) await __deshYield(1);
  }

  if (mainComp) {
    await __deshYield(1);
    const inst = mainComp.createInstance();
    inst.x = x; inst.y = y;
    figma.currentPage.selection = [inst];
    return JSON.stringify({ name: inst.name, id: inst.id, source: 'library-instance', componentKey: mainComp.key });
  }

  // Return null — REST API fallback happens on Node.js side (no more expensive page searches)
  return JSON.stringify(null);
})()`, 30_000);

        progressDone();
        const result = raw !== 'null' ? JSON.parse(raw) as { name: string; id: string; source: string; componentKey?: string } | null : null;

        if (result) {
          success(`Created instance of "${result.name}" (${result.source}) — ID: ${result.id}`);
          if (result.componentKey) {
            info(`Component key: ${result.componentKey} — use this key for faster instancing next time`);
          }
          return;
        }

        // 4. REST API fallback: search library by name if libraryFileKey is available
        const config = loadConfig();
        const libKey = config?.libraryFileKey;
        if (libKey) {
          try {
            status('Searching library via REST API...');
            const components = await getFileComponents(libKey);
            progressDone();

            const lowerName = component.toLowerCase();
            // Prefer exact match, then partial match
            const match =
              components.find((c) => c.name.toLowerCase() === lowerName) ||
              components.find((c) => c.name.toLowerCase().includes(lowerName));

            if (match) {
              status(`Found "${match.name}" — importing...`);
              const importRaw = await runFigmaCode<string>(`(async () => {
  // Smart positioning
  let x = ${opts.x ? parseInt(opts.x, 10) : 'undefined'};
  let y = ${opts.y ? parseInt(opts.y, 10) : 'undefined'};
  if (x === undefined || y === undefined) {
    let maxRight = 0;
    for (const n of figma.currentPage.children) {
      const right = n.x + n.width;
      if (right > maxRight) maxRight = right;
    }
    if (x === undefined) x = maxRight > 0 ? maxRight + 100 : 100;
    if (y === undefined) y = 100;
  }

  const comp = await figma.importComponentByKeyAsync(${JSON.stringify(match.key)});
  if (!comp) throw new Error('Failed to import component by key');
  const inst = comp.createInstance();
  inst.x = x; inst.y = y;
  figma.currentPage.selection = [inst];
  figma.viewport.scrollAndZoomIntoView([inst]);
  return JSON.stringify({ name: inst.name, id: inst.id, source: 'rest-api', componentKey: ${JSON.stringify(match.key)} });
})()`, 30_000);
              progressDone();
              const importResult = JSON.parse(importRaw) as { name: string; id: string; source: string; componentKey: string };
              success(`Created instance of "${importResult.name}" (${importResult.source}) — ID: ${importResult.id}`);
              info(`Component key: ${importResult.componentKey} — use this key for faster instancing next time`);
              return;
            }
          } catch {
            // REST API search failed — fall through to error
          }
        }

        error(`Component not found: ${component}. Use \`desh lib components\` to see available library components.`);
        if (!libKey) {
          info('Tip: run `desh lib set-library <fileKey>` to enable REST API name search');
        }
        process.exit(1);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- lib instance-batch --------------------------------------------------
  lib
    .command('instance-batch <keys...>')
    .description('Create instances of multiple library components in a single call (safe batching)')
    .option('-x <number>', 'Starting X position')
    .option('-y <number>', 'Y position')
    .option('--gap <number>', 'Horizontal gap between instances (default: 100)', '100')
    .action(async (keys: string[], opts: { x?: string; y?: string; gap?: string }) => {
      try {
        const gap = parseInt(opts.gap || '100', 10);
        status(`Creating ${keys.length} instance(s)...`);
        const raw = await runFigmaCode<string>(`(async () => {
  const keys = ${JSON.stringify(keys)};
  const gap = ${gap};

  // Smart positioning: find rightmost edge of existing content
  let x = ${opts.x ? parseInt(opts.x, 10) : 'undefined'};
  let y = ${opts.y ? parseInt(opts.y, 10) : 'undefined'};
  if (x === undefined || y === undefined) {
    let maxRight = 0;
    for (const n of figma.currentPage.children) {
      const right = n.x + n.width;
      if (right > maxRight) maxRight = right;
    }
    if (x === undefined) x = maxRight > 0 ? maxRight + 100 : 100;
    if (y === undefined) y = 100;
  }

  const results = [];
  for (let i = 0; i < keys.length; i++) {
    try {
      // Yield between imports to prevent UI freeze
      if (i > 0) await new Promise(r => setTimeout(r, 0));
      const comp = await figma.importComponentByKeyAsync(keys[i]);
      if (comp) {
        const inst = comp.createInstance();
        inst.x = x; inst.y = y;
        x += inst.width + gap;
        results.push({ key: keys[i], name: inst.name, id: inst.id, ok: true });
      } else {
        results.push({ key: keys[i], ok: false, error: 'null result' });
      }
    } catch (e) {
      results.push({ key: keys[i], ok: false, error: String(e) });
    }
  }

  // Select all created instances
  const created = results.filter(r => r.ok).map(r => figma.getNodeById(r.id)).filter(Boolean);
  if (created.length > 0) {
    figma.currentPage.selection = created;
    figma.viewport.scrollAndZoomIntoView(created);
  }

  return JSON.stringify(results);
})()`, 60_000 + keys.length * 5_000); // Scale timeout with batch size

        progressDone();
        const results = JSON.parse(raw) as Array<{ key: string; name?: string; id?: string; ok: boolean; error?: string }>;
        const succeeded = results.filter(r => r.ok);
        const failed = results.filter(r => !r.ok);

        for (const r of succeeded) {
          success(`Created "${r.name}" — ID: ${r.id}`);
        }
        for (const r of failed) {
          error(`Failed to instance ${r.key}: ${r.error}`);
        }

        if (succeeded.length > 0) {
          info(`${succeeded.length}/${keys.length} instance(s) created`);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- lib swap -----------------------------------------------------------
  lib
    .command('swap <nodeId> <newComponent>')
    .description('Swap instance to a different component')
    .action(async (nodeId: string, newComponent: string) => {
      try {
        const raw = await runFigmaCode<string>(`(async () => {
  const inst = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
  if (!inst) throw new Error('Node not found: ' + ${JSON.stringify(nodeId)});
  if (inst.type !== 'INSTANCE') throw new Error('Node is not an instance');

  try {
    const newComp = await figma.importComponentByKeyAsync(${JSON.stringify(newComponent)});
    if (newComp) { inst.swapComponent(newComp); return JSON.stringify({ name: inst.name, id: inst.id }); }
  } catch (e) {}

  const found = figma.currentPage.findOne(n => n.type === 'COMPONENT' && n.name === ${JSON.stringify(newComponent)});
  if (found && found.type === 'COMPONENT') {
    inst.swapComponent(found);
    return JSON.stringify({ name: inst.name, id: inst.id });
  }

  throw new Error('Component not found: ' + ${JSON.stringify(newComponent)});
})()`, 30_000);

        const result = JSON.parse(raw) as { name: string; id: string };
        success(`Swapped instance "${result.name}" (ID: ${result.id})`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- lib styles ---------------------------------------------------------
  lib
    .command('styles')
    .description('List library styles (paint, text, effect)')
    .action(async () => {
      try {
        const raw = await runFigmaCode<string>(`(async () => {
  const paint = figma.getLocalPaintStyles().map(s => ({ type: 'paint', name: s.name, id: s.id }));
  const text = figma.getLocalTextStyles().map(s => ({ type: 'text', name: s.name, id: s.id }));
  const effect = figma.getLocalEffectStyles().map(s => ({ type: 'effect', name: s.name, id: s.id }));
  return JSON.stringify({ paint, text, effect });
})()`);
        const result = JSON.parse(raw) as { paint: Array<{name: string; id: string}>; text: Array<{name: string; id: string}>; effect: Array<{name: string; id: string}> };
        const total = result.paint.length + result.text.length + result.effect.length;

        if (total === 0) { info('No local styles found.'); return; }

        if (result.paint.length > 0) {
          console.log(`\n  Paint Styles (${result.paint.length}):`);
          for (const s of result.paint) console.log(`    ${s.name}  ${s.id}`);
        }
        if (result.text.length > 0) {
          console.log(`\n  Text Styles (${result.text.length}):`);
          for (const s of result.text) console.log(`    ${s.name}  ${s.id}`);
        }
        if (result.effect.length > 0) {
          console.log(`\n  Effect Styles (${result.effect.length}):`);
          for (const s of result.effect) console.log(`    ${s.name}  ${s.id}`);
        }
        console.log('');
        success(`${total} style(s)`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- lib apply-style ----------------------------------------------------
  lib
    .command('apply-style <style>')
    .description('Apply a library style to the current selection')
    .option('--type <type>', 'Style type: paint, text, effect', 'paint')
    .action(async (style: string, opts: { type: string }) => {
      try {
        const raw = await runFigmaCode<string>(`(async () => {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) throw new Error('No selection');

  const styleName = ${JSON.stringify(style)};
  const styleType = ${JSON.stringify(opts.type.toLowerCase())};

  let foundStyle;
  if (styleType === 'paint') foundStyle = figma.getLocalPaintStyles().find(s => s.name === styleName || s.id === styleName);
  else if (styleType === 'text') foundStyle = figma.getLocalTextStyles().find(s => s.name === styleName || s.id === styleName);
  else if (styleType === 'effect') foundStyle = figma.getLocalEffectStyles().find(s => s.name === styleName || s.id === styleName);

  if (!foundStyle) throw new Error(styleType + ' style not found: ' + styleName);

  let applied = 0;
  for (const node of sel) {
    try {
      if (styleType === 'paint' && 'fillStyleId' in node) { node.fillStyleId = foundStyle.id; applied++; }
      else if (styleType === 'text' && node.type === 'TEXT') { node.textStyleId = foundStyle.id; applied++; }
      else if (styleType === 'effect' && 'effectStyleId' in node) { node.effectStyleId = foundStyle.id; applied++; }
    } catch (e) {}
  }
  return JSON.stringify({ style: foundStyle.name, applied });
})()`);
        const result = JSON.parse(raw) as { style: string; applied: number };
        success(`Applied style "${result.style}" to ${result.applied} node(s)`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- lib import-all <fileKey> -------------------------------------------
  lib
    .command('import-all <fileKey>')
    .description('Import all published components from a Figma library file via REST API')
    .option('--dry-run', 'List components without importing')
    .option('--json', 'Output as JSON')
    .action(async (fileKey: string, opts: { dryRun?: boolean; json?: boolean }) => {
      try {
        // 1. Fetch file info + components via REST API
        status('Fetching components from Figma REST API...');
        const [fileInfo, components, componentSets] = await Promise.all([
          getFileInfo(fileKey),
          getFileComponents(fileKey),
          getFileComponentSets(fileKey),
        ]);
        progressDone();

        if (components.length === 0) {
          info(`File "${fileInfo.name}" has no published components.`);
          return;
        }

        console.log(`\n  File: ${fileInfo.name}`);
        console.log(`  Components: ${components.length}`);
        console.log(`  Component sets: ${componentSets.length}\n`);

        if (opts.json) {
          console.log(JSON.stringify({ file: fileInfo, components, componentSets }, null, 2));
          return;
        }

        // Show component list
        for (const c of components) {
          const setStr = c.componentSetName ? ` (${c.componentSetName})` : '';
          console.log(`  ${c.name}${setStr}  key: ${c.key}`);
        }
        console.log('');

        if (opts.dryRun) {
          info(`Dry run — ${components.length} component(s) would be imported.`);
          return;
        }

        // 2. Import via CDP in batches of 10
        const BATCH_SIZE = 10;
        let imported = 0;
        let failed = 0;

        for (let i = 0; i < components.length; i += BATCH_SIZE) {
          const batch = components.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          const totalBatches = Math.ceil(components.length / BATCH_SIZE);
          status(`Importing batch ${batchNum}/${totalBatches} (${batch.length} components)...`);

          const keys = batch.map((c) => c.key);
          const raw = await runFigmaCode<string>(`(async () => {
  const keys = ${JSON.stringify(keys)};
  const results = [];
  for (const key of keys) {
    try {
      const comp = await figma.importComponentByKeyAsync(key);
      if (comp) {
        results.push({ key, name: comp.name, id: comp.id, ok: true });
      } else {
        results.push({ key, ok: false, error: 'null result' });
      }
    } catch (e) {
      results.push({ key, ok: false, error: String(e) });
    }
  }
  return JSON.stringify(results);
})()`, 60_000);

          const results = JSON.parse(raw) as Array<{ key: string; name?: string; id?: string; ok: boolean; error?: string }>;
          for (const r of results) {
            if (r.ok) imported++;
            else failed++;
          }
        }
        progressDone();

        // 3. Save keys to registry
        const registry = loadRegistry(process.cwd());
        registry.figmaFileKey = registry.figmaFileKey || fileKey;
        for (const c of components) {
          registry.components[c.name] = {
            nodeId: c.key,
            type: c.componentSetName ? 'COMPONENT' : 'COMPONENT',
          };
        }
        registry.pushedAt = new Date().toISOString();
        saveRegistry(process.cwd(), registry);

        success(`Imported ${imported} component(s) from "${fileInfo.name}"`);
        if (failed > 0) {
          info(`${failed} component(s) failed to import (may require library access).`);
        }
        info('Keys saved to .desh-registry.json');
      } catch (err) {
        progressDone();
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- lib set-library <fileKey> ------------------------------------------
  lib
    .command('set-library <fileKey>')
    .description('Save a default library file key to desh.config.json')
    .action(async (fileKey: string) => {
      try {
        // Find existing config file or create at cwd
        let configPath: string | null = null;
        let dir = process.cwd();
        while (true) {
          const candidate = join(dir, 'desh.config.json');
          if (existsSync(candidate)) {
            configPath = candidate;
            break;
          }
          const parent = join(dir, '..');
          if (parent === dir) break;
          dir = parent;
        }

        if (!configPath) {
          configPath = join(process.cwd(), 'desh.config.json');
          warn('No desh.config.json found — creating one at ' + configPath);
        }

        // Read existing config or start fresh
        let raw: Record<string, unknown> = {};
        if (existsSync(configPath)) {
          try {
            raw = JSON.parse(readFileSync(configPath, 'utf8'));
          } catch {
            raw = {};
          }
        }

        raw.libraryFileKey = fileKey;
        writeFileSync(configPath, JSON.stringify(raw, null, 2) + '\n');
        success(`Saved libraryFileKey "${fileKey}" to ${configPath}`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- lib search <query> -------------------------------------------------
  lib
    .command('search <query>')
    .description('Search components in a Figma library file by name')
    .option('--file <fileKey>', 'Figma file key to search (defaults to libraryFileKey in config)')
    .option('--include-icons', 'Include icon components (Icon / prefix) in results')
    .option('--json', 'Output as JSON')
    .action(async (query: string, opts: { file?: string; includeIcons?: boolean; json?: boolean }) => {
      try {
        // Resolve file key: flag > config > error
        let fileKey = opts.file;
        if (!fileKey) {
          const config = loadConfig();
          if (config?.libraryFileKey) {
            fileKey = config.libraryFileKey;
          } else {
            error('No file key provided. Use --file <key> or run `desh lib set-library <key>` to save a default.');
            process.exit(1);
          }
        }

        status('Searching components...');
        const components = await getFileComponents(fileKey);
        progressDone();

        const lowerQuery = query.toLowerCase();
        const allMatches = components.filter(
          (c) =>
            c.name.toLowerCase().includes(lowerQuery) ||
            (c.componentSetName && c.componentSetName.toLowerCase().includes(lowerQuery)) ||
            c.description.toLowerCase().includes(lowerQuery),
        );

        // Filter icons unless --include-icons
        let matches = allMatches;
        let iconCount = 0;
        if (!opts.includeIcons) {
          const filtered = allMatches.filter((c) => !c.name.startsWith('Icon /'));
          iconCount = allMatches.length - filtered.length;
          matches = filtered;
        }

        if (matches.length === 0 && iconCount === 0) {
          info(`No components matching "${query}" in file ${fileKey}.`);
          info(`Total components in file: ${components.length}`);
          return;
        }

        if (opts.json) {
          console.log(JSON.stringify(matches, null, 2));
          if (iconCount > 0) {
            info(`${iconCount} icon(s) hidden, use --include-icons to show`);
          }
          return;
        }

        for (const c of matches) {
          const setStr = c.componentSetName ? ` (${c.componentSetName})` : '';
          const descStr = c.description ? `  — ${c.description}` : '';
          console.log(`  ${c.name}${setStr}  key: ${c.key}${descStr}`);
        }

        const iconStr = iconCount > 0 ? ` (${iconCount} icons hidden, use --include-icons to show)` : '';
        success(`${matches.length} match(es) found${iconStr}`);
        info('Use `desh lib instance "<key>"` to create an instance');
      } catch (err) {
        progressDone();
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
