import type { Command } from 'commander';
import { runFigmaCode } from '../utils/figma-eval.js';
import { success, error } from '../utils/output.js';
import {
  hexToFigmaRgbCode,
  generateNodeSelector,
  generateVarLookupCode,
  wrapAsyncIife,
} from '../codegen/shared.js';

// ---------------------------------------------------------------------------
// Code-generation helpers (thin wrappers around shared utilities)
// ---------------------------------------------------------------------------

const hexToRgbCode = hexToFigmaRgbCode;
const nodeSelector = generateNodeSelector;
const varBindingPreamble = generateVarLookupCode;
const asyncIife = wrapAsyncIife;

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerSetCommands(program: Command): void {
  // ---- set (parent) --------------------------------------------------------
  const set = program
    .command('set')
    .description('Set properties on the current selection or a specific node');

  // ---- set fill ------------------------------------------------------------
  set
    .command('fill <color>')
    .description('Set fill color (hex or var:name)')
    .option('-n, --node <id>', 'Node ID (uses selection if omitted)')
    .action(async (color: string, opts: { node?: string }) => {
      try {
        const sel = nodeSelector(opts.node);
        let body: string;

        if (color.startsWith('var:')) {
          const varName = color.slice(4);
          body = `
  ${sel}
  if (nodes.length === 0) return 'No node found';
  ${varBindingPreamble(varName)}
  nodes.forEach(n => { if ('fills' in n) n.fills = [boundFill(variable)]; });
  return 'Bound ' + variable.name + ' to fill on ' + nodes.length + ' element(s)';
`.trimStart();
        } else {
          const rgb = hexToRgbCode(color);
          body = `
  ${sel}
  if (nodes.length === 0) return 'No node found';
  nodes.forEach(n => { if ('fills' in n) n.fills = [{ type: 'SOLID', color: ${rgb} }]; });
  return 'Fill set on ' + nodes.length + ' element(s)';
`.trimStart();
        }

        { const result = await runFigmaCode(asyncIife(body)); success(typeof result === 'string' ? result : 'Done'); }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- set stroke ----------------------------------------------------------
  set
    .command('stroke <color>')
    .description('Set stroke color (hex or var:name)')
    .option('-n, --node <id>', 'Node ID')
    .option('-w, --weight <n>', 'Stroke weight', '1')
    .action(async (color: string, opts: { node?: string; weight: string }) => {
      try {
        const sel = nodeSelector(opts.node);
        const weight = parseFloat(opts.weight) || 1;
        let body: string;

        if (color.startsWith('var:')) {
          const varName = color.slice(4);
          body = `
  ${sel}
  if (nodes.length === 0) return 'No node found';
  ${varBindingPreamble(varName)}
  nodes.forEach(n => { if ('strokes' in n) { n.strokes = [boundFill(variable)]; n.strokeWeight = ${weight}; } });
  return 'Bound ' + variable.name + ' to stroke on ' + nodes.length + ' element(s)';
`.trimStart();
        } else {
          const rgb = hexToRgbCode(color);
          body = `
  ${sel}
  if (nodes.length === 0) return 'No node found';
  nodes.forEach(n => { if ('strokes' in n) { n.strokes = [{ type: 'SOLID', color: ${rgb} }]; n.strokeWeight = ${weight}; } });
  return 'Stroke set on ' + nodes.length + ' element(s)';
`.trimStart();
        }

        { const result = await runFigmaCode(asyncIife(body)); success(typeof result === 'string' ? result : 'Done'); }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- set radius ----------------------------------------------------------
  set
    .command('radius <value>')
    .description('Set corner radius')
    .option('-n, --node <id>', 'Node ID')
    .action(async (value: string, opts: { node?: string }) => {
      try {
        const sel = nodeSelector(opts.node);
        const r = parseFloat(value);
        const body = `
  ${sel}
  if (nodes.length === 0) return 'No node found';
  nodes.forEach(n => { if ('cornerRadius' in n) n.cornerRadius = ${r}; });
  return 'Radius set on ' + nodes.length + ' element(s)';
`.trimStart();
        { const result = await runFigmaCode(asyncIife(body)); success(typeof result === 'string' ? result : 'Done'); }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- set size ------------------------------------------------------------
  set
    .command('size <width> <height>')
    .description('Set size')
    .option('-n, --node <id>', 'Node ID')
    .action(async (width: string, height: string, opts: { node?: string }) => {
      try {
        const sel = nodeSelector(opts.node);
        const w = parseFloat(width);
        const h = parseFloat(height);
        const body = `
  ${sel}
  if (nodes.length === 0) return 'No node found';
  nodes.forEach(n => { if ('resize' in n) n.resize(${w}, ${h}); });
  return 'Size set to ${w}x${h} on ' + nodes.length + ' element(s)';
`.trimStart();
        { const result = await runFigmaCode(asyncIife(body)); success(typeof result === 'string' ? result : 'Done'); }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- set pos -------------------------------------------------------------
  set
    .command('pos <x> <y>')
    .alias('position')
    .description('Set position')
    .option('-n, --node <id>', 'Node ID')
    .action(async (x: string, y: string, opts: { node?: string }) => {
      try {
        const sel = nodeSelector(opts.node);
        const px = parseFloat(x);
        const py = parseFloat(y);
        const body = `
  ${sel}
  if (nodes.length === 0) return 'No node found';
  nodes.forEach(n => { n.x = ${px}; n.y = ${py}; });
  return 'Position set to (${px}, ${py}) on ' + nodes.length + ' element(s)';
`.trimStart();
        { const result = await runFigmaCode(asyncIife(body)); success(typeof result === 'string' ? result : 'Done'); }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- set opacity ---------------------------------------------------------
  set
    .command('opacity <value>')
    .description('Set opacity (0–1)')
    .option('-n, --node <id>', 'Node ID')
    .action(async (value: string, opts: { node?: string }) => {
      try {
        const sel = nodeSelector(opts.node);
        const op = parseFloat(value);
        const body = `
  ${sel}
  if (nodes.length === 0) return 'No node found';
  nodes.forEach(n => { if ('opacity' in n) n.opacity = ${op}; });
  return 'Opacity set to ${op} on ' + nodes.length + ' element(s)';
`.trimStart();
        { const result = await runFigmaCode(asyncIife(body)); success(typeof result === 'string' ? result : 'Done'); }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- set name ------------------------------------------------------------
  set
    .command('name <name>')
    .description('Rename node(s)')
    .option('-n, --node <id>', 'Node ID')
    .action(async (name: string, opts: { node?: string }) => {
      try {
        const sel = nodeSelector(opts.node);
        const safeName = JSON.stringify(name);
        const body = `
  ${sel}
  if (nodes.length === 0) return 'No node found';
  nodes.forEach(n => { n.name = ${safeName}; });
  return 'Renamed ' + nodes.length + ' element(s) to ' + ${safeName};
`.trimStart();
        { const result = await runFigmaCode(asyncIife(body)); success(typeof result === 'string' ? result : 'Done'); }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- set autolayout ------------------------------------------------------
  set
    .command('autolayout <direction>')
    .alias('al')
    .description('Apply auto-layout to selection (row / col)')
    .option('-g, --gap <n>', 'Gap between items', '8')
    .option('-p, --padding <n>', 'Uniform padding')
    .action(async (direction: string, opts: { gap: string; padding?: string }) => {
      try {
        const layoutMode =
          direction === 'col' || direction === 'vertical' ? 'VERTICAL' : 'HORIZONTAL';
        const gap = parseFloat(opts.gap) || 8;
        const paddingLine = opts.padding
          ? `const _p = ${parseFloat(opts.padding)}; n.paddingTop = n.paddingRight = n.paddingBottom = n.paddingLeft = _p;`
          : '';
        const body = `
  const nodes = figma.currentPage.selection.slice();
  if (nodes.length === 0) return 'No selection';
  nodes.forEach(n => {
    if (n.type === 'FRAME' || n.type === 'COMPONENT') {
      n.layoutMode = '${layoutMode}';
      n.primaryAxisSizingMode = 'AUTO';
      n.counterAxisSizingMode = 'AUTO';
      n.itemSpacing = ${gap};
      ${paddingLine}
    }
  });
  return 'Auto-layout (${layoutMode}) applied to ' + nodes.length + ' frame(s)';
`.trimStart();
        { const result = await runFigmaCode(asyncIife(body)); success(typeof result === 'string' ? result : 'Done'); }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- sizing (top-level) --------------------------------------------------
  const sizing = program
    .command('sizing')
    .description('Control auto-layout sizing mode of the selection');

  sizing
    .command('hug')
    .description('Set sizing to hug contents')
    .option('-a, --axis <axis>', 'Axis: both | h | v', 'both')
    .action(async (opts: { axis: string }) => {
      try {
        const hLine =
          opts.axis === 'h' || opts.axis === 'both'
            ? `if ('layoutSizingHorizontal' in n) n.layoutSizingHorizontal = 'HUG';`
            : '';
        const vLine =
          opts.axis === 'v' || opts.axis === 'both'
            ? `if ('layoutSizingVertical' in n) n.layoutSizingVertical = 'HUG';`
            : '';
        const body = `
  const nodes = figma.currentPage.selection.slice();
  if (nodes.length === 0) return 'No selection';
  nodes.forEach(n => {
    ${hLine}
    ${vLine}
    if (n.layoutMode) { n.primaryAxisSizingMode = 'AUTO'; n.counterAxisSizingMode = 'AUTO'; }
  });
  return 'Set hug on ' + nodes.length + ' element(s)';
`.trimStart();
        { const result = await runFigmaCode(asyncIife(body)); success(typeof result === 'string' ? result : 'Done'); }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  sizing
    .command('fill')
    .description('Set sizing to fill container')
    .option('-a, --axis <axis>', 'Axis: both | h | v', 'both')
    .action(async (opts: { axis: string }) => {
      try {
        const hLine =
          opts.axis === 'h' || opts.axis === 'both'
            ? `if ('layoutSizingHorizontal' in n) n.layoutSizingHorizontal = 'FILL';`
            : '';
        const vLine =
          opts.axis === 'v' || opts.axis === 'both'
            ? `if ('layoutSizingVertical' in n) n.layoutSizingVertical = 'FILL';`
            : '';
        const body = `
  const nodes = figma.currentPage.selection.slice();
  if (nodes.length === 0) return 'No selection';
  nodes.forEach(n => {
    ${hLine}
    ${vLine}
  });
  return 'Set fill on ' + nodes.length + ' element(s)';
`.trimStart();
        { const result = await runFigmaCode(asyncIife(body)); success(typeof result === 'string' ? result : 'Done'); }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  sizing
    .command('fixed <width> [height]')
    .description('Set sizing to fixed dimensions')
    .action(async (width: string, height: string | undefined) => {
      try {
        const w = parseFloat(width);
        const h = parseFloat(height ?? width);
        const body = `
  const nodes = figma.currentPage.selection.slice();
  if (nodes.length === 0) return 'No selection';
  nodes.forEach(n => {
    if ('layoutSizingHorizontal' in n) n.layoutSizingHorizontal = 'FIXED';
    if ('layoutSizingVertical' in n) n.layoutSizingVertical = 'FIXED';
    if ('resize' in n) n.resize(${w}, ${h});
  });
  return 'Set fixed ${w}x${h} on ' + nodes.length + ' element(s)';
`.trimStart();
        { const result = await runFigmaCode(asyncIife(body)); success(typeof result === 'string' ? result : 'Done'); }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- padding (top-level) -------------------------------------------------
  program
    .command('padding <value> [r] [b] [l]')
    .alias('pad')
    .description('Set padding — CSS-style (1–4 values)')
    .action(async (value: string, r?: string, b?: string, l?: string) => {
      try {
        // CSS shorthand logic (mirrors the reference implementation)
        const top = parseFloat(value);
        let right: number, bottom: number, left: number;
        if (!r) {
          right = top; bottom = top; left = top;
        } else if (!b) {
          right = parseFloat(r); bottom = top; left = parseFloat(r);
        } else if (!l) {
          right = parseFloat(r); bottom = parseFloat(b); left = parseFloat(r);
        } else {
          right = parseFloat(r); bottom = parseFloat(b); left = parseFloat(l);
        }
        const body = `
  const nodes = figma.currentPage.selection.slice();
  if (nodes.length === 0) return 'No selection';
  nodes.forEach(n => {
    if ('paddingTop' in n) {
      n.paddingTop = ${top}; n.paddingRight = ${right};
      n.paddingBottom = ${bottom}; n.paddingLeft = ${left};
    }
  });
  return 'Padding set on ' + nodes.length + ' element(s)';
`.trimStart();
        { const result = await runFigmaCode(asyncIife(body)); success(typeof result === 'string' ? result : 'Done'); }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- gap (top-level) -----------------------------------------------------
  program
    .command('gap <value>')
    .description('Set auto-layout gap (itemSpacing)')
    .action(async (value: string) => {
      try {
        const g = parseFloat(value);
        const body = `
  const nodes = figma.currentPage.selection.slice();
  if (nodes.length === 0) return 'No selection';
  nodes.forEach(n => { if ('itemSpacing' in n) n.itemSpacing = ${g}; });
  return 'Gap set to ${g} on ' + nodes.length + ' element(s)';
`.trimStart();
        { const result = await runFigmaCode(asyncIife(body)); success(typeof result === 'string' ? result : 'Done'); }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- align (top-level) ---------------------------------------------------
  program
    .command('align <alignment>')
    .description('Align auto-layout children: start | center | end | stretch')
    .action(async (alignment: string) => {
      try {
        const alignMap: Record<string, string> = {
          start: 'MIN',
          center: 'CENTER',
          end: 'MAX',
          stretch: 'STRETCH',
          left: 'MIN',
          right: 'MAX',
          top: 'MIN',
          bottom: 'MAX',
        };
        const val = alignMap[alignment.toLowerCase()] ?? 'CENTER';
        const body = `
  const nodes = figma.currentPage.selection.slice();
  if (nodes.length === 0) return 'No selection';
  nodes.forEach(n => {
    if ('primaryAxisAlignItems' in n) n.primaryAxisAlignItems = '${val}';
    if ('counterAxisAlignItems' in n) n.counterAxisAlignItems = '${val}';
  });
  return 'Aligned ' + nodes.length + ' element(s) to ${val}';
`.trimStart();
        { const result = await runFigmaCode(asyncIife(body)); success(typeof result === 'string' ? result : 'Done'); }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
