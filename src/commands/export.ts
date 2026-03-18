import { writeFileSync } from 'fs';
import type { Command } from 'commander';
import { runFigmaCode } from '../utils/figma-eval.js';
import { error, success } from '../utils/output.js';

export function registerExportCommands(program: Command): void {
  // ============ export subcommand group ============
  const exp = program.command('export').description('Export from Figma');

  // export css — export all local variables as CSS custom properties
  exp
    .command('css')
    .description('Export Figma variables as CSS custom properties')
    .option('-o, --output <file>', 'Write to file instead of stdout')
    .action(async (opts: { output?: string }) => {
      const code = `(async () => {
const vars = await figma.variables.getLocalVariablesAsync();
const lines = vars.map(v => {
  const val = Object.values(v.valuesByMode)[0];
  if (v.resolvedType === 'COLOR') {
    const hex = '#' + [val.r, val.g, val.b].map(n => Math.round(n * 255).toString(16).padStart(2, '0')).join('');
    return '  --' + v.name.replace(/\\//g, '-') + ': ' + hex + ';';
  }
  return '  --' + v.name.replace(/\\//g, '-') + ': ' + val + (v.resolvedType === 'FLOAT' ? 'px' : '') + ';';
}).join('\\n');
return ':root {\\n' + lines + '\\n}';
})()`;

      try {
        const result = await runFigmaCode<string | undefined>(code, 60_000);

        const output = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        if (opts.output) {
          writeFileSync(opts.output, output);
          success(`CSS variables written to ${opts.output}`);
        } else {
          console.log(output);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // export tailwind — export color variables as Tailwind config
  exp
    .command('tailwind')
    .description('Export color variables as Tailwind config format')
    .option('-o, --output <file>', 'Write to file instead of stdout')
    .action(async (opts: { output?: string }) => {
      const code = `(async () => {
const vars = await figma.variables.getLocalVariablesAsync();
const colorVars = vars.filter(v => v.resolvedType === 'COLOR');
const colors = {};
colorVars.forEach(v => {
  const val = Object.values(v.valuesByMode)[0];
  const hex = '#' + [val.r, val.g, val.b].map(n => Math.round(n * 255).toString(16).padStart(2, '0')).join('');
  const parts = v.name.split('/');
  if (parts.length === 2) {
    if (!colors[parts[0]]) colors[parts[0]] = {};
    colors[parts[0]][parts[1]] = hex;
  } else {
    colors[v.name.replace(/\\//g, '-')] = hex;
  }
});
return JSON.stringify({ theme: { extend: { colors } } }, null, 2);
})()`;

      try {
        const result = await runFigmaCode<string | undefined>(code, 60_000);

        const output = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        if (opts.output) {
          writeFileSync(opts.output, output);
          success(`Tailwind config written to ${opts.output}`);
        } else {
          console.log(output);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // export screenshot — screenshot of current selection or page
  exp
    .command('screenshot')
    .description('Screenshot current selection or page')
    .option('-o, --output <file>', 'Output file', 'screenshot.png')
    .option('-s, --scale <number>', 'Export scale (1-4)', '2')
    .option('-f, --format <format>', 'Format: png, jpg, svg, pdf', 'png')
    .action(async (opts: { output: string; scale: string; format: string }) => {
      const format = opts.format.toUpperCase();
      const scale = parseFloat(opts.scale);
      const code = `(async () => {
const sel = figma.currentPage.selection;
let node;
if (sel.length > 0) {
  node = sel[0];
} else {
  // No selection — find the first top-level frame instead of exporting entire page
  const frames = figma.currentPage.children.filter(n => n.type === 'FRAME' || n.type === 'SECTION' || n.type === 'COMPONENT' || n.type === 'COMPONENT_SET');
  if (frames.length === 1) {
    node = frames[0];
  } else if (frames.length > 1) {
    // Multiple frames — export the first one but warn
    node = frames[0];
  } else {
    node = figma.currentPage;
  }
}
if (!node) return { error: 'No page or selection' };
if (!('exportAsync' in node)) return { error: 'Node cannot be exported' };

// Cap scale for very large nodes to prevent Figma freeze
const maxDim = Math.max(node.width || 0, node.height || 0);
let effectiveScale = ${scale};
if (maxDim * effectiveScale > 4096) {
  effectiveScale = Math.max(1, Math.floor(4096 / maxDim));
}

const bytes = await node.exportAsync({ format: '${format}', constraint: { type: 'SCALE', value: effectiveScale } });
return {
  name: node.name,
  id: node.id,
  width: Math.round(node.width * effectiveScale),
  height: Math.round(node.height * effectiveScale),
  bytes: Array.from(bytes),
  wasAutoSelected: sel.length === 0,
  frameCount: figma.currentPage.children.filter(n => n.type === 'FRAME' || n.type === 'SECTION').length,
  scaleAdjusted: effectiveScale !== ${scale},
};
})()`;

      try {
        const result = await runFigmaCode<{
          error?: string; name: string; id: string; width: number; height: number; bytes: number[]
        } | undefined>(code, 60_000);

        if (!result || result.error) {
          error(result?.error ?? 'Export failed');
          process.exit(1);
        }
        const r = result as typeof result & { wasAutoSelected?: boolean; frameCount?: number; scaleAdjusted?: boolean };
        const buffer = Buffer.from(r.bytes);
        const outputFile =
          opts.output === 'screenshot.png' && format !== 'PNG'
            ? `screenshot.${format.toLowerCase()}`
            : opts.output;
        writeFileSync(outputFile, buffer);
        success(`Screenshot: ${r.name} (${r.width}x${r.height}) → ${outputFile}`);
        if (r.scaleAdjusted) {
          console.log(`  ⚠ Scale reduced to fit 4096px max — use \`desh export node "ID" -s ${opts.scale}\` for specific nodes`);
        }
        if (r.wasAutoSelected && r.frameCount && r.frameCount > 1) {
          console.log(`  ℹ No selection — exported first frame. Page has ${r.frameCount} frames. Use \`desh export node "ID"\` for specific nodes.`);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // export node <nodeId> — export a specific node by ID
  exp
    .command('node <nodeId>')
    .description('Export a node by ID')
    .option('-o, --output <file>', 'Output file', 'node-export.png')
    .option('-s, --scale <number>', 'Export scale', '2')
    .option('-f, --format <format>', 'Format: png, svg, pdf, jpg', 'png')
    .action(async (nodeId: string, opts: { output: string; scale: string; format: string }) => {
      const format = opts.format.toUpperCase();
      const scale = parseFloat(opts.scale);
      const code = `(async () => {
const node = await figma.getNodeByIdAsync('${nodeId}');
if (!node) return { error: 'Node not found: ${nodeId}' };
if (!('exportAsync' in node)) return { error: 'Node cannot be exported' };
const bytes = await node.exportAsync({ format: '${format}', constraint: { type: 'SCALE', value: ${scale} } });
return {
  name: node.name,
  id: node.id,
  width: node.width,
  height: node.height,
  bytes: Array.from(bytes)
};
})()`;

      try {
        const result = await runFigmaCode<{
          error?: string; name: string; id: string; width: number; height: number; bytes: number[]
        } | undefined>(code, 60_000);

        if (!result || result.error) {
          error(result?.error ?? 'Export failed');
          process.exit(1);
        }
        const buffer = Buffer.from(result.bytes);
        const outputFile =
          opts.output === 'node-export.png' && format !== 'PNG'
            ? `node-export.${format.toLowerCase()}`
            : opts.output;
        writeFileSync(outputFile, buffer);
        success(`Exported ${result.name} (${result.width}x${result.height}) → ${outputFile}`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ============ top-level export-jsx ============
  program
    .command('export-jsx [nodeId]')
    .description('Export node as JSX/React code')
    .option('-o, --output <file>', 'Output file (otherwise stdout)')
    .option('--pretty', 'Format output')
    .action(async (nodeId: string | undefined, opts: { output?: string; pretty?: boolean }) => {
      const code = `(async () => {
const targetId = ${nodeId ? `"${nodeId}"` : 'null'};
const nodes = targetId
  ? [await figma.getNodeByIdAsync(targetId)]
  : figma.currentPage.selection;

if (!nodes.length || !nodes[0]) return 'No node selected';

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

function nodeToJsx(node, indent) {
  indent = indent || 0;
  const prefix = '  '.repeat(indent);
  const props = [];

  if (node.name && !node.name.startsWith('Frame') && !node.name.startsWith('Rectangle')) {
    props.push('name="' + node.name.replace(/"/g, '\\\\"') + '"');
  }

  if (node.width) props.push('w={' + Math.round(node.width) + '}');
  if (node.height) props.push('h={' + Math.round(node.height) + '}');

  if (node.fills && node.fills.length > 0 && node.fills[0].type === 'SOLID') {
    const c = node.fills[0].color;
    props.push('bg="' + rgbToHex(c.r, c.g, c.b) + '"');
  }

  if (node.cornerRadius && node.cornerRadius > 0) {
    props.push('rounded={' + Math.round(node.cornerRadius) + '}');
  }

  if (node.layoutMode === 'HORIZONTAL') props.push('flex="row"');
  if (node.layoutMode === 'VERTICAL') props.push('flex="col"');
  if (node.itemSpacing) props.push('gap={' + Math.round(node.itemSpacing) + '}');
  if (node.paddingTop) props.push('p={' + Math.round(node.paddingTop) + '}');

  if (node.type === 'TEXT') {
    const textProps = [];
    if (node.fontSize) textProps.push('size={' + Math.round(node.fontSize) + '}');
    if (node.fills && node.fills[0] && node.fills[0].color) {
      const c = node.fills[0].color;
      textProps.push('color="' + rgbToHex(c.r, c.g, c.b) + '"');
    }
    return prefix + '<Text ' + textProps.join(' ') + '>' + (node.characters || '') + '</Text>';
  }

  if ('children' in node && node.children.length > 0) {
    const childJsx = node.children.map(c => nodeToJsx(c, indent + 1)).join('\\n');
    return prefix + '<Frame ' + props.join(' ') + '>\\n' + childJsx + '\\n' + prefix + '</Frame>';
  }

  return prefix + '<Frame ' + props.join(' ') + ' />';
}

return nodeToJsx(nodes[0], 0);
})()`;

      try {
        const result = await runFigmaCode<string | undefined>(code, 60_000);

        const output = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        if (opts.output) {
          writeFileSync(opts.output, output);
          success(`Exported to ${opts.output}`);
        } else {
          console.log(output);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ============ top-level export-storybook ============
  program
    .command('export-storybook [nodeId]')
    .description('Export components on current page as Storybook stories')
    .option('-o, --output <file>', 'Output file (otherwise stdout)')
    .action(async (nodeId: string | undefined, opts: { output?: string }) => {
      const code = `(async () => {
const components = [];
function findComponents(node) {
  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    components.push({
      id: node.id,
      name: node.name,
      type: node.type,
      width: Math.round(node.width),
      height: Math.round(node.height)
    });
  }
  if ('children' in node) node.children.forEach(c => findComponents(c));
}
${nodeId
  ? `const target = await figma.getNodeByIdAsync('${nodeId}');
if (target) findComponents(target);`
  : `figma.currentPage.children.forEach(c => findComponents(c));`}
return components;
})()`;

      try {
        const components = await runFigmaCode<Array<{
          id: string; name: string; type: string; width: number; height: number
        }> | undefined>(code, 60_000);

        if (!components || !components.length) {
          console.log('No components found on current page');
          return;
        }

        let storyOutput = '// Storybook stories generated from Figma\n';
        storyOutput += 'import React from "react";\n\n';
        storyOutput += 'export default { title: "Figma Components" };\n\n';

        components.forEach(c => {
          const safeName = c.name.replace(/[^a-zA-Z0-9]/g, '');
          storyOutput += `export const ${safeName} = () => (\n`;
          storyOutput += `  <div style={{ width: ${c.width}, height: ${c.height} }}>\n`;
          storyOutput += `    {/* ${c.name} - ID: ${c.id} */}\n`;
          storyOutput += `  </div>\n`;
          storyOutput += `);\n\n`;
        });

        if (opts.output) {
          writeFileSync(opts.output, storyOutput);
          success(`Exported ${components.length} components to ${opts.output}`);
        } else {
          console.log(storyOutput);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
