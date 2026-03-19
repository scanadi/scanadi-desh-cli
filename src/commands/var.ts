import type { Command } from 'commander';
import { runFigmaCode } from '../utils/figma-eval.js';
import { success, error, info } from '../utils/output.js';
import { createInterface } from 'readline';
import { wrapAsyncIife, generateVarLookupCode } from '../codegen/shared.js';

const asyncIife = wrapAsyncIife;

/** Prompt user for confirmation. Returns true if confirmed. */
async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ---------------------------------------------------------------------------
// Preamble that resolves a variable by name across all local collections
// ---------------------------------------------------------------------------

const varLookupPreamble = generateVarLookupCode;

// ---------------------------------------------------------------------------
// Register var commands
// ---------------------------------------------------------------------------

export function registerVarCommands(program: Command): void {
  const varCmd = program
    .command('var')
    .description('Variable management');

  // ---- var list -------------------------------------------------------------
  varCmd
    .command('list')
    .description('List all local variables')
    .option('-t, --type <type>', 'Filter by type: COLOR, FLOAT, STRING, BOOLEAN')
    .action(async (opts: { type?: string }) => {
      const typeFilter = opts.type ? JSON.stringify(opts.type.toUpperCase()) : 'undefined';
      const code = asyncIife(`
  const vars = await figma.variables.getLocalVariablesAsync(${typeFilter});
  if (vars.length === 0) return 'No variables found';
  const lines = vars.map(v => {
    const firstMode = Object.keys(v.valuesByMode)[0];
    const val = firstMode ? v.valuesByMode[firstMode] : undefined;
    let display = '';
    if (v.resolvedType === 'COLOR' && val && typeof val === 'object' && 'r' in val) {
      const hex = '#' + [val.r, val.g, val.b].map(n => Math.round(n * 255).toString(16).padStart(2, '0')).join('');
      display = hex;
    } else if (val !== undefined) {
      display = String(val);
    }
    return v.id + '  ' + v.resolvedType + '  ' + v.name + (display ? '  ' + display : '');
  });
  return lines.join('\\n');
`);
      try {
        const result = await runFigmaCode(code, 30_000);
        console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- var visualize [collection] ------------------------------------------
  varCmd
    .command('visualize [collection]')
    .description('Create color swatches on canvas bound to variables')
    .action(async (collection?: string) => {
      const collFilter = collection ? JSON.stringify(collection) : 'null';
      const code = asyncIife(`
  const filterName = ${collFilter};
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const filtered = filterName ? collections.filter(c => c.name === filterName) : collections;
  if (filtered.length === 0) return 'No collections found' + (filterName ? ': ' + filterName : '');

  let x = 0;
  let created = 0;

  for (const col of filtered) {
    const colFrame = figma.createFrame();
    colFrame.name = col.name;
    colFrame.layoutMode = 'VERTICAL';
    colFrame.primaryAxisSizingMode = 'AUTO';
    colFrame.counterAxisSizingMode = 'AUTO';
    colFrame.itemSpacing = 4;
    colFrame.paddingTop = colFrame.paddingBottom = colFrame.paddingLeft = colFrame.paddingRight = 12;
    colFrame.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
    colFrame.cornerRadius = 8;
    colFrame.x = x;
    colFrame.y = 0;

    const labelText = figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
    labelText.fontName = { family: 'Inter', style: 'Bold' };
    labelText.characters = col.name;
    labelText.fontSize = 14;
    labelText.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
    colFrame.appendChild(labelText);

    for (const varId of col.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(varId);
      if (!v || v.resolvedType !== 'COLOR') continue;

      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

      const row = figma.createFrame();
      row.name = v.name;
      row.layoutMode = 'HORIZONTAL';
      row.primaryAxisSizingMode = 'AUTO';
      row.counterAxisSizingMode = 'AUTO';
      row.counterAxisAlignItems = 'CENTER';
      row.itemSpacing = 8;
      row.fills = [];
      colFrame.appendChild(row);

      const swatch = figma.createRectangle();
      swatch.resize(32, 32);
      swatch.cornerRadius = 6;
      const paint = { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } };
      swatch.fills = [figma.variables.setBoundVariableForPaint(paint, 'color', v)];
      row.appendChild(swatch);

      const nameLabel = figma.createText();
      nameLabel.fontName = { family: 'Inter', style: 'Regular' };
      nameLabel.characters = v.name;
      nameLabel.fontSize = 12;
      nameLabel.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
      row.appendChild(nameLabel);
      created++;
      await __deshYield(3);
    }

    x += colFrame.width + 24;
  }

  return 'Created ' + created + ' color swatches';
`);
      try {
        info('Creating color swatches...');
        const result = await runFigmaCode(code, 120_000);
        success(typeof result === 'string' ? result : 'Done');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- var create ----------------------------------------------------------
  varCmd
    .command('create <name>')
    .description('Create a single variable')
    .option('-c, --collection <id>', 'Collection ID (uses first collection if omitted)')
    .option('-t, --type <type>', 'Variable type: COLOR, FLOAT, STRING, BOOLEAN', 'COLOR')
    .option('-v, --value <value>', 'Initial value (hex color or string/number)')
    .action(async (name: string, opts: { collection?: string; type: string; value?: string }) => {
      const varType = opts.type.toUpperCase();
      const safeName = JSON.stringify(name);
      const safeCollection = opts.collection ? JSON.stringify(opts.collection) : 'null';

      let valueCode = 'undefined';
      if (opts.value !== undefined) {
        if (varType === 'COLOR') {
          // Parse hex to RGB
          const hex = opts.value.replace('#', '');
          if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16) / 255;
            const g = parseInt(hex[1] + hex[1], 16) / 255;
            const b = parseInt(hex[2] + hex[2], 16) / 255;
            valueCode = `{ r: ${r}, g: ${g}, b: ${b} }`;
          } else if (hex.length === 6) {
            const r = parseInt(hex.slice(0, 2), 16) / 255;
            const g = parseInt(hex.slice(2, 4), 16) / 255;
            const b = parseInt(hex.slice(4, 6), 16) / 255;
            valueCode = `{ r: ${r}, g: ${g}, b: ${b} }`;
          }
        } else if (varType === 'FLOAT') {
          valueCode = String(parseFloat(opts.value));
        } else if (varType === 'BOOLEAN') {
          valueCode = opts.value === 'true' ? 'true' : 'false';
        } else {
          valueCode = JSON.stringify(opts.value);
        }
      }

      const code = asyncIife(`
  const colId = ${safeCollection};
  let collection;
  if (colId) {
    collection = await figma.variables.getVariableCollectionByIdAsync(colId);
    if (!collection) return 'Collection not found: ' + colId;
  } else {
    const cols = await figma.variables.getLocalVariableCollectionsAsync();
    if (cols.length === 0) return 'No variable collections found. Create one first.';
    collection = cols[0];
  }

  const existing = await figma.variables.getLocalVariablesAsync();
  if (existing.find(v => v.name === ${safeName} && v.variableCollectionId === collection.id)) {
    return 'Variable already exists: ' + ${safeName};
  }

  const variable = figma.variables.createVariable(${safeName}, collection, '${varType}');
  const modeId = collection.modes[0].modeId;
  const val = ${valueCode};
  if (val !== undefined) {
    variable.setValueForMode(modeId, val);
  }
  return 'Created variable: ' + variable.id + '  ' + variable.name;
`);
      try {
        const result = await runFigmaCode(code, 30_000);
        success(typeof result === 'string' ? result : 'Done');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- var delete-all -------------------------------------------------------
  varCmd
    .command('delete-all')
    .description('Delete all local variables')
    .option('-c, --collection <name>', 'Only delete variables in this collection')
    .option('--force', 'Skip confirmation prompt')
    .action(async (opts: { collection?: string; force?: boolean }) => {
      if (!opts.force) {
        const msg = opts.collection
          ? `Delete all variables in collection "${opts.collection}"?`
          : 'Delete ALL local variables?';
        const confirmed = await confirm(msg);
        if (!confirmed) {
          info('Cancelled');
          return;
        }
      }

      const filterName = opts.collection ? JSON.stringify(opts.collection) : 'null';
      const code = asyncIife(`
  const filterName = ${filterName};
  let vars = await figma.variables.getLocalVariablesAsync();
  if (filterName) {
    const cols = await figma.variables.getLocalVariableCollectionsAsync();
    const col = cols.find(c => c.name === filterName);
    if (!col) return 'Collection not found: ' + filterName;
    vars = vars.filter(v => v.variableCollectionId === col.id);
  }
  const count = vars.length;
  vars.forEach(v => v.remove());
  return 'Deleted ' + count + ' variable(s)';
`);
      try {
        const result = await runFigmaCode(code, 60_000);
        success(typeof result === 'string' ? result : 'Done');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- var collections (sub-group) -----------------------------------------
  const colCmd = varCmd
    .command('collections')
    .description('Manage variable collections');

  colCmd
    .command('list')
    .description('List all variable collections')
    .action(async () => {
      const code = asyncIife(`
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  if (cols.length === 0) return 'No collections found';
  const lines = cols.map(c => {
    const modes = c.modes.map(m => m.name).join(', ');
    return c.id + '  ' + c.name + '  [' + modes + ']  ' + c.variableIds.length + ' var(s)';
  });
  return lines.join('\\n');
`);
      try {
        const result = await runFigmaCode(code, 30_000);
        console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  colCmd
    .command('create <name>')
    .description('Create a new variable collection')
    .action(async (name: string) => {
      const code = asyncIife(`
  const col = figma.variables.createVariableCollection(${JSON.stringify(name)});
  return 'Created collection: ' + col.id + '  ' + col.name;
`);
      try {
        const result = await runFigmaCode(code, 30_000);
        success(typeof result === 'string' ? result : 'Done');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- var create-batch ----------------------------------------------------
  varCmd
    .command('create-batch <json>')
    .description('Create up to 100 variables at once. JSON: [{name,type,collectionId?,value}]')
    .action(async (json: string) => {
      let items: Array<{ name: string; type: string; collectionId?: string; value?: unknown }>;
      try {
        items = JSON.parse(json) as typeof items;
      } catch {
        error('Invalid JSON input');
        process.exit(1);
        return;
      }

      const safeItems = JSON.stringify(items);
      const code = asyncIife(`
  const items = ${safeItems};
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  if (cols.length === 0) return 'No collections found. Create one first.';
  const defaultCol = cols[0];
  let created = 0;
  const results = [];

  for (const item of items) {
    const col = item.collectionId
      ? await figma.variables.getVariableCollectionByIdAsync(item.collectionId)
      : defaultCol;
    if (!col) { results.push('Collection not found: ' + item.collectionId); continue; }

    const variable = figma.variables.createVariable(item.name, col, (item.type || 'COLOR').toUpperCase());
    const modeId = col.modes[0].modeId;
    if (item.value !== undefined) {
      variable.setValueForMode(modeId, item.value);
    }
    results.push('Created: ' + variable.id + '  ' + variable.name);
    created++;
  }

  return 'Created ' + created + ' variable(s)\\n' + results.join('\\n');
`);
      try {
        info(`Creating ${items.length} variable(s)...`);
        const result = await runFigmaCode(code, 60_000);
        success(typeof result === 'string' ? result : 'Done');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- var delete-batch ----------------------------------------------------
  varCmd
    .command('delete-batch <nodeIds>')
    .description('Delete multiple variables by ID. JSON array of variable IDs.')
    .action(async (nodeIds: string) => {
      let ids: string[];
      try {
        ids = JSON.parse(nodeIds) as string[];
      } catch {
        error('Invalid JSON input. Expected array of variable IDs.');
        process.exit(1);
        return;
      }

      const safeIds = JSON.stringify(ids);
      const code = asyncIife(`
  const ids = ${safeIds};
  let deleted = 0;
  const results = [];
  for (const id of ids) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (!v) { results.push('Not found: ' + id); continue; }
    v.remove();
    results.push('Deleted: ' + id);
    deleted++;
  }
  return 'Deleted ' + deleted + ' variable(s)\\n' + results.join('\\n');
`);
      try {
        const result = await runFigmaCode(code, 60_000);
        success(typeof result === 'string' ? result : 'Done');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- var bind-batch -------------------------------------------------------
  varCmd
    .command('bind-batch <json>')
    .description('Bind variables to nodes in batch. JSON: [{nodeId, property, variableId}]')
    .action(async (json: string) => {
      let items: Array<{ nodeId: string; property: string; variableId: string }>;
      try {
        items = JSON.parse(json) as typeof items;
      } catch {
        error('Invalid JSON input');
        process.exit(1);
        return;
      }

      const safeItems = JSON.stringify(items);
      const code = asyncIife(`
  const items = ${safeItems};
  let bound = 0;
  const results = [];
  for (const item of items) {
    const node = await figma.getNodeByIdAsync(item.nodeId);
    if (!node) { results.push('Node not found: ' + item.nodeId); continue; }
    const variable = await figma.variables.getVariableByIdAsync(item.variableId);
    if (!variable) { results.push('Variable not found: ' + item.variableId); continue; }

    try {
      if (item.property === 'fill' || item.property === 'fills') {
        if ('fills' in node) {
          const paint = { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } };
          node.fills = [figma.variables.setBoundVariableForPaint(paint, 'color', variable)];
        }
      } else if (item.property === 'stroke' || item.property === 'strokes') {
        if ('strokes' in node) {
          const paint = { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } };
          node.strokes = [figma.variables.setBoundVariableForPaint(paint, 'color', variable)];
        }
      } else {
        node.setBoundVariable(item.property, variable);
      }
      results.push('Bound ' + item.variableId + ' to ' + item.property + ' on ' + item.nodeId);
      bound++;
    } catch (e) {
      results.push('Error binding ' + item.nodeId + ': ' + e.message);
    }
  }
  return 'Bound ' + bound + ' variable(s)\\n' + results.join('\\n');
`);
      try {
        const result = await runFigmaCode(code, 60_000);
        success(typeof result === 'string' ? result : 'Done');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- var set-batch -------------------------------------------------------
  varCmd
    .command('set-batch <json>')
    .description('Set variable values across modes in batch. JSON: [{variableId, modeId, value}]')
    .action(async (json: string) => {
      let items: Array<{ variableId: string; modeId: string; value: unknown }>;
      try {
        items = JSON.parse(json) as typeof items;
      } catch {
        error('Invalid JSON input');
        process.exit(1);
        return;
      }

      const safeItems = JSON.stringify(items);
      const code = asyncIife(`
  const items = ${safeItems};
  let updated = 0;
  const results = [];
  for (const item of items) {
    const variable = await figma.variables.getVariableByIdAsync(item.variableId);
    if (!variable) { results.push('Variable not found: ' + item.variableId); continue; }
    try {
      variable.setValueForMode(item.modeId, item.value);
      results.push('Set ' + item.variableId + ' in mode ' + item.modeId);
      updated++;
    } catch (e) {
      results.push('Error: ' + e.message);
    }
  }
  return 'Updated ' + updated + ' value(s)\\n' + results.join('\\n');
`);
      try {
        const result = await runFigmaCode(code, 60_000);
        success(typeof result === 'string' ? result : 'Done');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- var rename-batch ----------------------------------------------------
  varCmd
    .command('rename-batch <json>')
    .description('Rename multiple variables. JSON: [{id, name}]')
    .action(async (json: string) => {
      let items: Array<{ id: string; name: string }>;
      try {
        items = JSON.parse(json) as typeof items;
      } catch {
        error('Invalid JSON input');
        process.exit(1);
        return;
      }

      const safeItems = JSON.stringify(items);
      const code = asyncIife(`
  const items = ${safeItems};
  let renamed = 0;
  const results = [];
  for (const item of items) {
    const variable = await figma.variables.getVariableByIdAsync(item.id);
    if (!variable) { results.push('Variable not found: ' + item.id); continue; }
    const oldName = variable.name;
    variable.name = item.name;
    results.push('Renamed: ' + oldName + ' → ' + item.name);
    renamed++;
  }
  return 'Renamed ' + renamed + ' variable(s)\\n' + results.join('\\n');
`);
      try {
        const result = await runFigmaCode(code, 30_000);
        success(typeof result === 'string' ? result : 'Done');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}

// ---------------------------------------------------------------------------
// Register bind commands (top-level)
// ---------------------------------------------------------------------------

export function registerBindCommands(program: Command): void {
  const bind = program
    .command('bind')
    .description('Bind a variable to a property on the current selection');

  // shared helper: find variable by name and run the binding body
  function makeBindAction(
    property: 'fill' | 'stroke' | 'radius' | 'gap' | 'padding',
  ) {
    return async (varName: string) => {
      const safeName = JSON.stringify(varName);

      let bindBody: string;
      switch (property) {
        case 'fill':
          bindBody = `
  const nodes = figma.currentPage.selection.slice();
  if (nodes.length === 0) return 'No selection';
  nodes.forEach(n => {
    if ('fills' in n) {
      const paint = { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } };
      n.fills = [figma.variables.setBoundVariableForPaint(paint, 'color', variable)];
    }
  });
  return 'Bound ' + variable.name + ' to fill on ' + nodes.length + ' element(s)';
`.trimStart();
          break;
        case 'stroke':
          bindBody = `
  const nodes = figma.currentPage.selection.slice();
  if (nodes.length === 0) return 'No selection';
  nodes.forEach(n => {
    if ('strokes' in n) {
      const paint = { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } };
      n.strokes = [figma.variables.setBoundVariableForPaint(paint, 'color', variable)];
    }
  });
  return 'Bound ' + variable.name + ' to stroke on ' + nodes.length + ' element(s)';
`.trimStart();
          break;
        case 'radius':
          bindBody = `
  const nodes = figma.currentPage.selection.slice();
  if (nodes.length === 0) return 'No selection';
  nodes.forEach(n => {
    if ('cornerRadius' in n) n.setBoundVariable('cornerRadius', variable);
  });
  return 'Bound ' + variable.name + ' to cornerRadius on ' + nodes.length + ' element(s)';
`.trimStart();
          break;
        case 'gap':
          bindBody = `
  const nodes = figma.currentPage.selection.slice();
  if (nodes.length === 0) return 'No selection';
  nodes.forEach(n => {
    if ('itemSpacing' in n) n.setBoundVariable('itemSpacing', variable);
  });
  return 'Bound ' + variable.name + ' to itemSpacing on ' + nodes.length + ' element(s)';
`.trimStart();
          break;
        case 'padding':
          bindBody = `
  const nodes = figma.currentPage.selection.slice();
  if (nodes.length === 0) return 'No selection';
  nodes.forEach(n => {
    ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(prop => {
      if (prop in n) n.setBoundVariable(prop, variable);
    });
  });
  return 'Bound ' + variable.name + ' to padding on ' + nodes.length + ' element(s)';
`.trimStart();
          break;
      }

      const code = asyncIife(`
  ${varLookupPreamble(varName)}
  ${bindBody}
`);
      try {
        const result = await runFigmaCode(code, 30_000);
        success(typeof result === 'string' ? result : 'Done');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    };
  }

  bind
    .command('fill <variable>')
    .description('Bind fill to a variable by name')
    .action(makeBindAction('fill'));

  bind
    .command('stroke <variable>')
    .description('Bind stroke to a variable by name')
    .action(makeBindAction('stroke'));

  bind
    .command('radius <variable>')
    .description('Bind corner radius to a variable by name')
    .action(makeBindAction('radius'));

  bind
    .command('gap <variable>')
    .description('Bind gap (itemSpacing) to a variable by name')
    .action(makeBindAction('gap'));

  bind
    .command('padding <variable>')
    .description('Bind padding (all sides) to a variable by name')
    .action(makeBindAction('padding'));
}
