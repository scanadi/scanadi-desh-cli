import type { Command } from 'commander';
import { runFigmaCode } from '../utils/figma-eval.js';
import { success, error } from '../utils/output.js';
import {
  hexToFigmaRgb,
  isVarRef,
  getVarName,
  generateVarLoadingCode,
  generateSmartPositioningCode,
} from '../codegen/shared.js';

// ── helpers ──────────────────────────────────────────────────────────────────

const hexToRgb = hexToFigmaRgb;
const varLoadingCode = generateVarLoadingCode;
const smartPosCode = generateSmartPositioningCode;

/**
 * Returns the JS fragment that sets `fills` on `nodeVar`.
 * Handles both hex colours and `var:name` references.
 */
function fillCode(color: string, nodeVar: string): string {
  if (isVarRef(color)) {
    const varName = getVarName(color);
    return `${nodeVar}.fills = [boundFill(vars['${varName}'])];`;
  }
  const { r, g, b } = hexToRgb(color);
  return `${nodeVar}.fills = [{ type: 'SOLID', color: { r: ${r}, g: ${g}, b: ${b} } }];`;
}

/**
 * Returns the JS fragment that sets `strokes` and `strokeWeight` on `nodeVar`.
 */
function strokeCode(color: string, nodeVar: string, weight: number | string = 1): string {
  if (isVarRef(color)) {
    const varName = getVarName(color);
    return `${nodeVar}.strokes = [boundFill(vars['${varName}'])]; ${nodeVar}.strokeWeight = ${weight};`;
  }
  const { r, g, b } = hexToRgb(color);
  return `${nodeVar}.strokes = [{ type: 'SOLID', color: { r: ${r}, g: ${g}, b: ${b} } }]; ${nodeVar}.strokeWeight = ${weight};`;
}

/**
 * Run a JS expression in Figma via CDP and print the result.
 */
async function runInFigma(code: string): Promise<void> {
  const result = await runFigmaCode(code, 60_000);
  if (result !== undefined) {
    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
  }
}

// ── command registration ──────────────────────────────────────────────────────

export function registerCreateCommands(program: Command): void {
  const create = program.command('create').description('Create Figma elements');

  // ── rect ──────────────────────────────────────────────────────────────────
  create
    .command('rect [name]')
    .alias('rectangle')
    .description('Create a rectangle (auto-positions to avoid overlap)')
    .option('-w, --width <n>', 'Width', '100')
    .option('-h, --height <n>', 'Height', '100')
    .option('-x <n>', 'X position (auto if not set)')
    .option('-y <n>', 'Y position', '0')
    .option('--fill <color>', 'Fill color (hex or var:name)', '#D9D9D9')
    .option('--stroke <color>', 'Stroke color (hex or var:name)')
    .option('--radius <n>', 'Corner radius')
    .option('--opacity <n>', 'Opacity 0-1')
    .action(
      async (
        name: string | undefined,
        opts: {
          width: string;
          height: string;
          x?: string;
          y: string;
          fill: string;
          stroke?: string;
          radius?: string;
          opacity?: string;
        },
      ) => {
        try {
          const rectName = name ?? 'Rectangle';
          const useSmartPos = opts.x === undefined;
          const usesVars =
            isVarRef(opts.fill) || (opts.stroke !== undefined && isVarRef(opts.stroke));

          const code = `
(async () => {
${usesVars ? varLoadingCode() : ''}
${useSmartPos ? smartPosCode(100) : `const smartX = ${opts.x};`}
const rect = figma.createRectangle();
rect.name = ${JSON.stringify(rectName)};
rect.x = smartX;
rect.y = ${opts.y};
rect.resize(${opts.width}, ${opts.height});
${fillCode(opts.fill, 'rect')}
${opts.radius ? `rect.cornerRadius = ${opts.radius};` : ''}
${opts.opacity ? `rect.opacity = ${opts.opacity};` : ''}
${opts.stroke ? strokeCode(opts.stroke, 'rect') : ''}
figma.currentPage.selection = [rect];
return ${JSON.stringify(rectName)} + ' created at (' + smartX + ', ${opts.y})';
})()
`;
          await runInFigma(code);
          success(`Created rect "${rectName}"`);
        } catch (err) {
          error(String((err as Error).message));
          process.exit(1);
        }
      },
    );

  // ── ellipse / circle ──────────────────────────────────────────────────────
  create
    .command('ellipse [name]')
    .alias('circle')
    .description('Create an ellipse (auto-positions to avoid overlap)')
    .option('-w, --width <n>', 'Width (diameter for circles)', '100')
    .option('-h, --height <n>', 'Height (defaults to width for circle)')
    .option('-x <n>', 'X position (auto if not set)')
    .option('-y <n>', 'Y position', '0')
    .option('--fill <color>', 'Fill color (hex or var:name)', '#D9D9D9')
    .option('--stroke <color>', 'Stroke color (hex or var:name)')
    .action(
      async (
        name: string | undefined,
        opts: {
          width: string;
          height?: string;
          x?: string;
          y: string;
          fill: string;
          stroke?: string;
        },
      ) => {
        try {
          const ellipseName = name ?? 'Ellipse';
          const h = opts.height ?? opts.width;
          const useSmartPos = opts.x === undefined;
          const usesVars =
            isVarRef(opts.fill) || (opts.stroke !== undefined && isVarRef(opts.stroke));

          const code = `
(async () => {
${usesVars ? varLoadingCode() : ''}
${useSmartPos ? smartPosCode(100) : `const smartX = ${opts.x};`}
const ellipse = figma.createEllipse();
ellipse.name = ${JSON.stringify(ellipseName)};
ellipse.x = smartX;
ellipse.y = ${opts.y};
ellipse.resize(${opts.width}, ${h});
${fillCode(opts.fill, 'ellipse')}
${opts.stroke ? strokeCode(opts.stroke, 'ellipse') : ''}
figma.currentPage.selection = [ellipse];
return ${JSON.stringify(ellipseName)} + ' created at (' + smartX + ', ${opts.y})';
})()
`;
          await runInFigma(code);
          success(`Created ellipse "${ellipseName}"`);
        } catch (err) {
          error(String((err as Error).message));
          process.exit(1);
        }
      },
    );

  // ── text ──────────────────────────────────────────────────────────────────
  create
    .command('text <content>')
    .description('Create a text layer (auto-positions to avoid overlap)')
    .option('-x <n>', 'X position (auto if not set)')
    .option('-y <n>', 'Y position', '0')
    .option('-s, --size <n>', 'Font size', '16')
    .option('-c, --color <color>', 'Text color (hex or var:name)', '#000000')
    .option('-w, --weight <weight>', 'Font weight: regular, medium, semibold, bold', 'regular')
    .option('--font <family>', 'Font family', 'Inter')
    .option('--width <n>', 'Text box fixed width (auto-width if not set)')
    .option('--spacing <n>', 'Gap from existing elements', '100')
    .action(
      async (
        content: string,
        opts: {
          x?: string;
          y: string;
          size: string;
          color: string;
          weight: string;
          font: string;
          width?: string;
          spacing: string;
        },
      ) => {
        try {
          const weightMap: Record<string, string> = {
            regular: 'Regular',
            medium: 'Medium',
            semibold: 'Semi Bold',
            bold: 'Bold',
          };
          const fontStyle = weightMap[opts.weight.toLowerCase()] ?? 'Regular';
          const useSmartPos = opts.x === undefined;
          const usesVars = isVarRef(opts.color);
          const gap = opts.spacing ?? '100';

          const code = `
(async () => {
${usesVars ? varLoadingCode() : ''}
${useSmartPos ? smartPosCode(Number(gap)) : `const smartX = ${opts.x};`}
await figma.loadFontAsync({ family: ${JSON.stringify(opts.font)}, style: ${JSON.stringify(fontStyle)} });
const text = figma.createText();
text.fontName = { family: ${JSON.stringify(opts.font)}, style: ${JSON.stringify(fontStyle)} };
text.characters = ${JSON.stringify(content)};
text.fontSize = ${opts.size};
${fillCode(opts.color, 'text')}
text.x = smartX;
text.y = ${opts.y};
${opts.width ? `text.resize(${opts.width}, text.height); text.textAutoResize = 'HEIGHT';` : ''}
figma.currentPage.selection = [text];
return 'Text created at (' + smartX + ', ${opts.y})';
})()
`;
          await runInFigma(code);
          success('Created text layer');
        } catch (err) {
          error(String((err as Error).message));
          process.exit(1);
        }
      },
    );

  // ── line ──────────────────────────────────────────────────────────────────
  create
    .command('line')
    .description('Create a line (auto-positions to avoid overlap)')
    .option('--x1 <n>', 'Start X (auto if not set)')
    .option('--y1 <n>', 'Start Y', '0')
    .option('-l, --length <n>', 'Line length', '100')
    .option('-c, --color <color>', 'Line color (hex or var:name)', '#000000')
    .option('--weight <n>', 'Stroke weight', '1')
    .option('--spacing <n>', 'Gap from existing elements', '100')
    .action(
      async (opts: {
        x1?: string;
        y1: string;
        length: string;
        color: string;
        weight: string;
        spacing: string;
      }) => {
        try {
          const useSmartPos = opts.x1 === undefined;
          const usesVars = isVarRef(opts.color);
          const gap = opts.spacing ?? '100';

          const code = `
(async () => {
${usesVars ? varLoadingCode() : ''}
${useSmartPos ? smartPosCode(Number(gap)) : `const smartX = ${opts.x1};`}
const line = figma.createLine();
line.x = smartX;
line.y = ${opts.y1};
line.resize(${opts.length}, 0);
${strokeCode(opts.color, 'line', opts.weight)}
figma.currentPage.selection = [line];
return 'Line created at (' + smartX + ', ${opts.y1}) with length ${opts.length}';
})()
`;
          await runInFigma(code);
          success('Created line');
        } catch (err) {
          error(String((err as Error).message));
          process.exit(1);
        }
      },
    );

  // ── frame ─────────────────────────────────────────────────────────────────
  create
    .command('frame [name]')
    .description('Create a frame (auto-positions to avoid overlap)')
    .option('-w, --width <n>', 'Width', '100')
    .option('-h, --height <n>', 'Height', '100')
    .option('-x <n>', 'X position (auto if not set)')
    .option('-y <n>', 'Y position', '0')
    .option('--fill <color>', 'Fill color (hex or var:name)')
    .option('--stroke <color>', 'Stroke color (hex or var:name)')
    .option('--radius <n>', 'Corner radius')
    .option('--gap <n>', 'Gap from existing elements', '100')
    .action(
      async (
        name: string | undefined,
        opts: {
          width: string;
          height: string;
          x?: string;
          y: string;
          fill?: string;
          stroke?: string;
          radius?: string;
          gap: string;
        },
      ) => {
        try {
          const frameName = name ?? 'Frame';
          const useSmartPos = opts.x === undefined;
          const usesVars =
            (opts.fill !== undefined && isVarRef(opts.fill)) ||
            (opts.stroke !== undefined && isVarRef(opts.stroke));

          const code = `
(async () => {
${usesVars ? varLoadingCode() : ''}
${useSmartPos ? smartPosCode(Number(opts.gap)) : `const smartX = ${opts.x};`}
const frame = figma.createFrame();
frame.name = ${JSON.stringify(frameName)};
frame.x = smartX;
frame.y = ${opts.y};
frame.resize(${opts.width}, ${opts.height});
${opts.fill ? fillCode(opts.fill, 'frame') : ''}
${opts.radius ? `frame.cornerRadius = ${opts.radius};` : ''}
${opts.stroke ? strokeCode(opts.stroke, 'frame') : ''}
figma.currentPage.selection = [frame];
return ${JSON.stringify(frameName)} + ' created at (' + smartX + ', ${opts.y})';
})()
`;
          await runInFigma(code);
          success(`Created frame "${frameName}"`);
        } catch (err) {
          error(String((err as Error).message));
          process.exit(1);
        }
      },
    );

  // ── autolayout ────────────────────────────────────────────────────────────
  create
    .command('autolayout [name]')
    .alias('al')
    .description('Create an auto-layout frame (auto-positions to avoid overlap)')
    .option('-d, --direction <dir>', 'Direction: row | col', 'row')
    .option('-g, --gap <n>', 'Gap between items', '8')
    .option('-p, --padding <n>', 'Padding on all sides', '16')
    .option('-x <n>', 'X position (auto if not set)')
    .option('-y <n>', 'Y position', '0')
    .option('--fill <color>', 'Fill color (hex or var:name)')
    .option('--stroke <color>', 'Stroke color (hex or var:name)')
    .option('--radius <n>', 'Corner radius')
    .option('--spacing <n>', 'Gap from existing elements', '100')
    .action(
      async (
        name: string | undefined,
        opts: {
          direction: string;
          gap: string;
          padding: string;
          x?: string;
          y: string;
          fill?: string;
          stroke?: string;
          radius?: string;
          spacing: string;
        },
      ) => {
        try {
          const frameName = name ?? 'Auto Layout';
          const layoutMode = opts.direction === 'col' ? 'VERTICAL' : 'HORIZONTAL';
          const useSmartPos = opts.x === undefined;
          const usesVars =
            (opts.fill !== undefined && isVarRef(opts.fill)) ||
            (opts.stroke !== undefined && isVarRef(opts.stroke));

          const code = `
(async () => {
${usesVars ? varLoadingCode() : ''}
${useSmartPos ? smartPosCode(Number(opts.spacing)) : `const smartX = ${opts.x};`}
const frame = figma.createFrame();
frame.name = ${JSON.stringify(frameName)};
frame.x = smartX;
frame.y = ${opts.y};
frame.layoutMode = '${layoutMode}';
frame.primaryAxisSizingMode = 'AUTO';
frame.counterAxisSizingMode = 'AUTO';
frame.itemSpacing = ${opts.gap};
frame.paddingTop = ${opts.padding};
frame.paddingRight = ${opts.padding};
frame.paddingBottom = ${opts.padding};
frame.paddingLeft = ${opts.padding};
${opts.fill ? fillCode(opts.fill, 'frame') : 'frame.fills = [];'}
${opts.radius ? `frame.cornerRadius = ${opts.radius};` : ''}
${opts.stroke ? strokeCode(opts.stroke, 'frame') : ''}
figma.currentPage.selection = [frame];
return ${JSON.stringify(frameName)} + ' created at (' + smartX + ', ${opts.y})';
})()
`;
          await runInFigma(code);
          success(`Created auto-layout frame "${frameName}"`);
        } catch (err) {
          error(String((err as Error).message));
          process.exit(1);
        }
      },
    );

  // ── icon ──────────────────────────────────────────────────────────────────
  create
    .command('icon <name>')
    .description('Create an icon placeholder rectangle (e.g., lucide:star)')
    .option('-s, --size <n>', 'Size', '24')
    .option('-c, --color <color>', 'Color (hex or var:name)', '#000000')
    .option('-x <n>', 'X position (auto if not set)')
    .option('-y <n>', 'Y position', '0')
    .option('--spacing <n>', 'Gap from existing elements', '100')
    .action(
      async (
        iconName: string,
        opts: {
          size: string;
          color: string;
          x?: string;
          y: string;
          spacing: string;
        },
      ) => {
        try {
          const useSmartPos = opts.x === undefined;
          const usesVars = isVarRef(opts.color);
          const gap = opts.spacing ?? '100';
          const size = opts.size ?? '24';

          const code = `
(async () => {
${usesVars ? varLoadingCode() : ''}
${useSmartPos ? smartPosCode(Number(gap)) : `const smartX = ${opts.x};`}
const rect = figma.createRectangle();
rect.name = ${JSON.stringify(iconName)};
rect.x = smartX;
rect.y = ${opts.y};
rect.resize(${size}, ${size});
${fillCode(opts.color, 'rect')}
figma.currentPage.selection = [rect];
return { id: rect.id, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
})()
`;
          await runInFigma(code);
          success(`Created icon placeholder "${iconName}"`);
        } catch (err) {
          error(String((err as Error).message));
          process.exit(1);
        }
      },
    );

  // ── image ─────────────────────────────────────────────────────────────────
  create
    .command('image <url>')
    .description('Create an image from a URL (PNG, JPG, GIF, WebP)')
    .option('-w, --width <n>', 'Width (keeps aspect ratio if only width given)')
    .option('-h, --height <n>', 'Height (keeps aspect ratio if only height given)')
    .option('-x <n>', 'X position (auto if not set)')
    .option('-y <n>', 'Y position', '0')
    .option('-n, --name <name>', 'Node name', 'Image')
    .option('--spacing <n>', 'Gap from existing elements', '100')
    .action(
      async (
        url: string,
        opts: {
          width?: string;
          height?: string;
          x?: string;
          y: string;
          name: string;
          spacing: string;
        },
      ) => {
        try {
          const useSmartPos = opts.x === undefined;
          const gap = opts.spacing ?? '100';

          const code = `
(async () => {
  ${useSmartPos ? smartPosCode(Number(gap)) : `const smartX = ${opts.x};`}
  const image = await figma.createImageAsync(${JSON.stringify(url)});
  const { width, height } = await image.getSizeAsync();
  let w = ${opts.width ?? 'null'};
  let h = ${opts.height ?? 'null'};
  if (w && !h) h = Math.round(height * (w / width));
  if (h && !w) w = Math.round(width * (h / height));
  if (!w && !h) { w = width; h = height; }
  const rect = figma.createRectangle();
  rect.name = ${JSON.stringify(opts.name)};
  rect.resize(w, h);
  rect.x = smartX;
  rect.y = ${opts.y};
  rect.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
  figma.currentPage.selection = [rect];
  figma.viewport.scrollAndZoomIntoView([rect]);
  return 'Image created: ' + w + 'x' + h + ' at (' + smartX + ', ${opts.y})';
})()
`;
          await runInFigma(code);
          success(`Created image from ${url}`);
        } catch (err) {
          error(String((err as Error).message));
          process.exit(1);
        }
      },
    );

  // ── component ─────────────────────────────────────────────────────────────
  create
    .command('component [name]')
    .description('Convert the current selection to a component')
    .action(async (name: string | undefined) => {
      try {
        const compName = name ?? 'Component';
        const code = `
(function() {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) return 'No selection -- select one or more nodes first';
  if (sel.length === 1) {
    const comp = figma.createComponentFromNode(sel[0]);
    comp.name = ${JSON.stringify(compName)};
    figma.currentPage.selection = [comp];
    return 'Component created: ' + comp.name + ' (id: ' + comp.id + ')';
  }
  const group = figma.group(sel, figma.currentPage);
  const comp = figma.createComponentFromNode(group);
  comp.name = ${JSON.stringify(compName)};
  figma.currentPage.selection = [comp];
  return 'Component created from ' + sel.length + ' elements: ' + comp.name + ' (id: ' + comp.id + ')';
})()
`;
        await runInFigma(code);
        success(`Created component "${compName}"`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ── group ─────────────────────────────────────────────────────────────────
  create
    .command('group [name]')
    .description('Group the current selection')
    .action(async (name: string | undefined) => {
      try {
        const groupName = name ?? 'Group';
        const code = `
(function() {
  const sel = figma.currentPage.selection;
  if (sel.length < 2) return 'Select 2 or more elements to group';
  const group = figma.group(sel, figma.currentPage);
  group.name = ${JSON.stringify(groupName)};
  figma.currentPage.selection = [group];
  return 'Grouped ' + sel.length + ' elements into "' + group.name + '"';
})()
`;
        await runInFigma(code);
        success(`Grouped selection as "${groupName}"`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
