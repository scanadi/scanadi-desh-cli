/**
 * Component codegen — generates JS code that creates real Figma Components
 * and ComponentSets from ComponentDef metadata.
 *
 * Two flavors:
 * - cva components (Button, Badge, Toggle) → ComponentSet with variant Components
 * - structural components (Card, Dialog, Input) → single Component with child frames
 *
 * Each generated JS string is a self-contained async IIFE that returns JSON.
 * State is shared across calls via globalThis.__deshPush.
 */

import type { ComponentDef } from '../scanner/components.js';

// ---------------------------------------------------------------------------
// Tailwind → Figma mapping tables (embedded in generated JS as inline objects)
// ---------------------------------------------------------------------------

/** Semantic color names that map to Figma variables */
const SEMANTIC_FILLS: Record<string, string> = {
  'bg-primary': 'primary',
  'bg-secondary': 'secondary',
  'bg-destructive': 'destructive',
  'bg-background': 'background',
  'bg-card': 'card',
  'bg-muted': 'muted',
  'bg-accent': 'accent',
  'bg-popover': 'popover',
};

/** Text color names that map to Figma variables */
const SEMANTIC_TEXT_COLORS: Record<string, string> = {
  'text-primary-foreground': 'primary-foreground',
  'text-secondary-foreground': 'secondary-foreground',
  'text-destructive-foreground': 'destructive-foreground',
  'text-muted-foreground': 'muted-foreground',
  'text-accent-foreground': 'accent-foreground',
  'text-card-foreground': 'card-foreground',
  'text-popover-foreground': 'popover-foreground',
  'text-foreground': 'foreground',
};

/** Height classes → pixel values */
const HEIGHT_MAP: Record<string, number> = {
  'h-8': 32, 'h-9': 36, 'h-10': 40, 'h-11': 44, 'h-12': 48,
};

/** Padding classes → pixel values */
const PADDING_MAP: Record<string, number> = {
  'px-2': 8, 'px-3': 12, 'px-4': 16, 'px-5': 20, 'px-6': 24, 'px-8': 32,
  'py-1': 4, 'py-2': 8, 'py-3': 12, 'py-4': 16, 'py-6': 24,
  'p-2': 8, 'p-3': 12, 'p-4': 16, 'p-6': 24,
};

/** Radius classes → pixel values */
const RADIUS_MAP: Record<string, number> = {
  'rounded': 6, 'rounded-sm': 4, 'rounded-md': 6, 'rounded-lg': 8,
  'rounded-xl': 12, 'rounded-2xl': 16, 'rounded-3xl': 24, 'rounded-full': 9999,
};

/** Font weight names → Inter style names */
const FONT_STYLE_MAP: Record<string, string> = {
  'font-normal': 'Regular',
  'font-medium': 'Medium',
  'font-semibold': 'Semi Bold',
  'font-bold': 'Bold',
};

/** Font size classes → pixel values */
const FONT_SIZE_MAP: Record<string, number> = {
  'text-xs': 12, 'text-sm': 14, 'text-base': 16, 'text-lg': 18, 'text-xl': 20,
};

// ---------------------------------------------------------------------------
// Internal helpers — parse Tailwind classes into a structured style object
// ---------------------------------------------------------------------------

interface ParsedStyle {
  fillVar: string | null;
  textColorVar: string | null;
  height: number | null;
  paddingH: number | null;
  paddingV: number | null;
  paddingAll: number | null;
  radius: number | null;
  layoutMode: 'HORIZONTAL' | 'VERTICAL' | null;
  alignItems: 'CENTER' | 'MIN' | 'MAX' | null;
  justifyItems: 'CENTER' | 'MIN' | 'MAX' | 'SPACE_BETWEEN' | null;
  fontSize: number | null;
  fontStyle: string | null;
  hasBorder: boolean;
  hasShadow: boolean;
  gap: number | null;
  width: number | null;
}

function parseClasses(classes: string[]): ParsedStyle {
  const style: ParsedStyle = {
    fillVar: null,
    textColorVar: null,
    height: null,
    paddingH: null,
    paddingV: null,
    paddingAll: null,
    radius: null,
    layoutMode: null,
    alignItems: null,
    justifyItems: null,
    fontSize: null,
    fontStyle: null,
    hasBorder: false,
    hasShadow: false,
    gap: null,
    width: null,
  };

  for (const cls of classes) {
    // Skip modifiers (hover:, focus:, etc.)
    if (cls.includes(':')) continue;
    // Skip opacity variants (bg-primary/90)
    if (cls.includes('/')) continue;

    // Fill
    if (SEMANTIC_FILLS[cls]) {
      style.fillVar = SEMANTIC_FILLS[cls];
      continue;
    }

    // Text color
    if (SEMANTIC_TEXT_COLORS[cls]) {
      style.textColorVar = SEMANTIC_TEXT_COLORS[cls];
      continue;
    }

    // Height
    if (HEIGHT_MAP[cls]) {
      style.height = HEIGHT_MAP[cls];
      continue;
    }

    // Width (numeric)
    const wMatch = cls.match(/^w-(\d+)$/);
    if (wMatch) {
      style.width = parseInt(wMatch[1], 10) * 4;
      continue;
    }

    // Padding
    if (PADDING_MAP[cls]) {
      if (cls.startsWith('px-')) style.paddingH = PADDING_MAP[cls];
      else if (cls.startsWith('py-')) style.paddingV = PADDING_MAP[cls];
      else if (cls.startsWith('p-')) style.paddingAll = PADDING_MAP[cls];
      continue;
    }

    // Radius
    if (RADIUS_MAP[cls] !== undefined) {
      style.radius = RADIUS_MAP[cls];
      continue;
    }
    const rMatch = cls.match(/^rounded-\[(\d+)px\]$/);
    if (rMatch) {
      style.radius = parseInt(rMatch[1], 10);
      continue;
    }

    // Layout
    if (cls === 'inline-flex' || cls === 'flex' || cls === 'flex-row') {
      style.layoutMode = 'HORIZONTAL';
      continue;
    }
    if (cls === 'flex-col') {
      style.layoutMode = 'VERTICAL';
      continue;
    }

    // Alignment
    if (cls === 'items-center') { style.alignItems = 'CENTER'; continue; }
    if (cls === 'items-start') { style.alignItems = 'MIN'; continue; }
    if (cls === 'items-end') { style.alignItems = 'MAX'; continue; }
    if (cls === 'justify-center') { style.justifyItems = 'CENTER'; continue; }
    if (cls === 'justify-between') { style.justifyItems = 'SPACE_BETWEEN'; continue; }
    if (cls === 'justify-start') { style.justifyItems = 'MIN'; continue; }
    if (cls === 'justify-end') { style.justifyItems = 'MAX'; continue; }

    // Font size
    if (FONT_SIZE_MAP[cls]) {
      style.fontSize = FONT_SIZE_MAP[cls];
      continue;
    }

    // Font weight
    if (FONT_STYLE_MAP[cls]) {
      style.fontStyle = FONT_STYLE_MAP[cls];
      continue;
    }

    // Border
    if (cls === 'border') { style.hasBorder = true; continue; }

    // Shadow
    if (cls === 'shadow' || cls === 'shadow-sm' || cls === 'shadow-md' || cls === 'shadow-lg') {
      style.hasShadow = true;
      continue;
    }

    // Gap
    const gapMatch = cls.match(/^gap-(\d+(?:\.\d+)?)$/);
    if (gapMatch) {
      style.gap = parseFloat(gapMatch[1]) * 4;
      continue;
    }
    const spaceYMatch = cls.match(/^space-y-(\d+(?:\.\d+)?)$/);
    if (spaceYMatch) {
      style.gap = parseFloat(spaceYMatch[1]) * 4;
      continue;
    }
  }

  return style;
}

// ---------------------------------------------------------------------------
// JS code generation helpers
// ---------------------------------------------------------------------------

/** Generate JS to apply fills — either variable-bound or fallback gray */
function genFillCode(nodeVar: string, varName: string | null): string {
  if (!varName) return '';
  return `  bindFill(${nodeVar}, ${JSON.stringify(varName)});\n`;
}

/** Generate JS to apply text fills — variable-bound */
function genTextFillCode(nodeVar: string, varName: string | null): string {
  if (!varName) return '';
  return `  bindFill(${nodeVar}, ${JSON.stringify(varName)});\n`;
}

/** Generate JS to apply stroke with variable binding */
function genStrokeCode(nodeVar: string): string {
  return `  bindStroke(${nodeVar}, 'border');\n  ${nodeVar}.strokeWeight = 1;\n`;
}

/** Generate JS to apply drop shadow effect */
function genShadowCode(nodeVar: string): string {
  return `  ${nodeVar}.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.15 }, offset: { x: 0, y: 4 }, radius: 12, spread: 0, visible: true }];\n`;
}

/**
 * Generate JS that styles a frame node based on parsed Tailwind classes.
 * The frame variable name in the generated JS is `nodeVar`.
 */
function genFrameStyleCode(nodeVar: string, style: ParsedStyle): string {
  const lines: string[] = [];

  // Layout mode
  if (style.layoutMode) {
    lines.push(`${nodeVar}.layoutMode = '${style.layoutMode}';`);
  }

  // Sizing: hug content by default
  lines.push(`${nodeVar}.primaryAxisSizingMode = 'AUTO';`);
  lines.push(`${nodeVar}.counterAxisSizingMode = 'AUTO';`);

  // Explicit dimensions
  if (style.height !== null && style.width !== null) {
    lines.push(`${nodeVar}.resize(${style.width}, ${style.height});`);
    lines.push(`${nodeVar}.primaryAxisSizingMode = 'FIXED';`);
    lines.push(`${nodeVar}.counterAxisSizingMode = 'FIXED';`);
  } else if (style.height !== null) {
    lines.push(`${nodeVar}.resize(${nodeVar}.width, ${style.height});`);
    // For horizontal layout, height is counter axis
    if (style.layoutMode === 'HORIZONTAL') {
      lines.push(`${nodeVar}.counterAxisSizingMode = 'FIXED';`);
    } else {
      lines.push(`${nodeVar}.primaryAxisSizingMode = 'FIXED';`);
    }
  } else if (style.width !== null) {
    lines.push(`${nodeVar}.resize(${style.width}, ${nodeVar}.height);`);
    if (style.layoutMode === 'HORIZONTAL') {
      lines.push(`${nodeVar}.primaryAxisSizingMode = 'FIXED';`);
    } else {
      lines.push(`${nodeVar}.counterAxisSizingMode = 'FIXED';`);
    }
  }

  // Padding
  if (style.paddingAll !== null) {
    lines.push(`${nodeVar}.paddingTop = ${nodeVar}.paddingBottom = ${nodeVar}.paddingLeft = ${nodeVar}.paddingRight = ${style.paddingAll};`);
  } else {
    if (style.paddingH !== null) {
      lines.push(`${nodeVar}.paddingLeft = ${nodeVar}.paddingRight = ${style.paddingH};`);
    }
    if (style.paddingV !== null) {
      lines.push(`${nodeVar}.paddingTop = ${nodeVar}.paddingBottom = ${style.paddingV};`);
    }
  }

  // Gap
  if (style.gap !== null) {
    lines.push(`${nodeVar}.itemSpacing = ${style.gap};`);
  }

  // Alignment
  if (style.alignItems) {
    lines.push(`${nodeVar}.counterAxisAlignItems = '${style.alignItems}';`);
  }
  if (style.justifyItems) {
    lines.push(`${nodeVar}.primaryAxisAlignItems = '${style.justifyItems}';`);
  }

  // Corner radius
  if (style.radius !== null) {
    lines.push(`${nodeVar}.cornerRadius = ${style.radius};`);
  }

  // Fills (variable-bound)
  if (style.fillVar) {
    lines.push(`bindFill(${nodeVar}, ${JSON.stringify(style.fillVar)});`);
  }

  // Border
  if (style.hasBorder) {
    lines.push(`bindStroke(${nodeVar}, 'border');`);
    lines.push(`${nodeVar}.strokeWeight = 1;`);
  }

  // Shadow
  if (style.hasShadow) {
    lines.push(`${nodeVar}.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.15 }, offset: { x: 0, y: 4 }, radius: 12, spread: 0, visible: true }];`);
  }

  return lines.map(l => `  ${l}`).join('\n');
}

/**
 * Generate JS that creates a text node with optional variable-bound color.
 * Returns the generated code. The text node variable is `textVar`.
 */
function genTextNodeCode(
  textVar: string,
  parentVar: string,
  text: string,
  opts: {
    colorVar?: string | null;
    fontSize?: number;
    fontStyle?: string;
    fillParent?: boolean;
  } = {},
): string {
  const fontSize = opts.fontSize ?? 14;
  const fontStyle = opts.fontStyle ?? 'Medium';
  const colorVar = opts.colorVar ?? 'foreground';
  const lines: string[] = [];

  lines.push(`const ${textVar} = figma.createText();`);
  lines.push(`${textVar}.fontName = { family: 'Inter', style: '${fontStyle}' };`);
  lines.push(`${textVar}.fontSize = ${fontSize};`);
  lines.push(`${textVar}.characters = ${JSON.stringify(text)};`);
  if (colorVar) {
    lines.push(`bindFill(${textVar}, ${JSON.stringify(colorVar)});`);
  }
  lines.push(`${parentVar}.appendChild(${textVar});`);
  if (opts.fillParent !== false) {
    lines.push(`${textVar}.layoutSizingHorizontal = 'FILL';`);
  }

  return lines.map(l => `  ${l}`).join('\n');
}

// ---------------------------------------------------------------------------
// PascalCase helper
// ---------------------------------------------------------------------------

function toPascalCase(name: string): string {
  return name.charAt(0).toUpperCase() +
    name.slice(1).replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate JS preamble — load fonts, load variables into lookup,
 * define helper functions, init positioning state.
 *
 * Must be run once before any generateComponentPushJs calls.
 */
export function generatePreambleJs(): string {
  return `(async () => {
  // Load Inter fonts
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

  // Load all variables into a lookup
  const allVars = await figma.variables.getLocalVariablesAsync();
  const varsByName = {};
  for (const v of allVars) {
    varsByName[v.name] = v;
    // Also store without collection prefix (e.g. "primary" for "shadcn/primary")
    const slash = v.name.lastIndexOf('/');
    if (slash >= 0) {
      const short = v.name.slice(slash + 1);
      if (!varsByName[short]) varsByName[short] = v;
    }
  }

  // Helper: bind fill to a variable by name
  function bindFill(node, varName) {
    const v = varsByName[varName];
    if (v) {
      node.fills = [figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }, 'color', v
      )];
    } else {
      // Fallback: gray fill
      node.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
    }
  }

  // Helper: bind stroke to a variable by name
  function bindStroke(node, varName) {
    const v = varsByName[varName];
    if (v) {
      node.strokes = [figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }, 'color', v
      )];
    } else {
      node.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
    }
  }

  // Compute starting X position (right of existing content)
  const _children = figma.currentPage.children;
  let smartX = 0;
  if (_children.length > 0) {
    _children.forEach(n => { smartX = Math.max(smartX, n.x + (n.width || 0)); });
    smartX += 100;
  }

  // Init shared state
  globalThis.__deshPush = {
    varsByName,
    bindFill,
    bindStroke,
    nextX: smartX,
    nextY: 0,
    created: [],
  };

  return JSON.stringify({ status: 'ready', variablesLoaded: Object.keys(varsByName).length });
})()`;
}

/**
 * Generate JS to push a single component to Figma.
 * Returns a self-contained async IIFE string.
 *
 * For cva components: creates one Component per variant value on the primary axis,
 * then combines into a ComponentSet.
 *
 * For structural components: creates a styled frame with sub-component children,
 * then converts to a single Component.
 */
export function generateComponentPushJs(comp: ComponentDef): string {
  if (comp.hasVariants) {
    return generateVariantComponentJs(comp);
  }
  return generateStructuralComponentJs(comp);
}

/**
 * Generate JS to get the summary of all pushed components.
 */
export function generateSummaryJs(): string {
  return `(function() {
  const state = globalThis.__deshPush || { created: [] };
  return JSON.stringify({ created: state.created.length, components: state.created });
})()`;
}

// ---------------------------------------------------------------------------
// cva component → ComponentSet with variant Components
// ---------------------------------------------------------------------------

function generateVariantComponentJs(comp: ComponentDef): string {
  const name = toPascalCase(comp.name);
  const variantKeys = Object.keys(comp.variants);
  const primaryKey = variantKeys.includes('variant') ? 'variant' : variantKeys[0];
  if (!primaryKey) {
    // No variants found; fall back to structural
    return generateStructuralComponentJs(comp);
  }

  const values = comp.variants[primaryKey];
  const baseStyle = parseClasses(comp.baseClasses);

  // Build JS code for each variant frame
  const variantBlocks: string[] = [];

  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    const varId = `f${i}`;

    // Merge base + variant-specific classes
    const varClasses = comp.variantClasses[primaryKey]?.[val];
    const mergedClasses = [...comp.baseClasses];
    if (varClasses) mergedClasses.push(...varClasses.split(/\s+/).filter(Boolean));
    const style = parseClasses(mergedClasses);

    // Apply defaults from base style where variant doesn't override
    const effectiveStyle = { ...style };
    if (!effectiveStyle.layoutMode) effectiveStyle.layoutMode = baseStyle.layoutMode ?? 'HORIZONTAL';
    if (!effectiveStyle.alignItems) effectiveStyle.alignItems = baseStyle.alignItems ?? 'CENTER';
    if (!effectiveStyle.justifyItems) effectiveStyle.justifyItems = baseStyle.justifyItems ?? 'CENTER';
    if (effectiveStyle.height === null) effectiveStyle.height = baseStyle.height ?? 40;
    if (effectiveStyle.paddingH === null && effectiveStyle.paddingAll === null) {
      effectiveStyle.paddingH = baseStyle.paddingH ?? 16;
    }
    if (effectiveStyle.paddingV === null && effectiveStyle.paddingAll === null) {
      effectiveStyle.paddingV = baseStyle.paddingV ?? 8;
    }
    if (effectiveStyle.radius === null) effectiveStyle.radius = baseStyle.radius ?? 6;
    if (!effectiveStyle.fillVar) effectiveStyle.fillVar = baseStyle.fillVar ?? 'primary';
    if (!effectiveStyle.fontStyle) effectiveStyle.fontStyle = baseStyle.fontStyle ?? 'Medium';
    if (!effectiveStyle.fontSize) effectiveStyle.fontSize = baseStyle.fontSize ?? 14;

    const textColorVar = effectiveStyle.textColorVar ?? baseStyle.textColorVar ?? 'primary-foreground';

    const block = `
  // --- Variant: ${val} ---
  const ${varId} = figma.createFrame();
  ${varId}.name = '${name}/${val}';
${genFrameStyleCode(varId, effectiveStyle)}

${genTextNodeCode(`t${i}`, varId, val, {
    colorVar: textColorVar,
    fontSize: effectiveStyle.fontSize ?? 14,
    fontStyle: effectiveStyle.fontStyle ?? 'Medium',
    fillParent: true,
  })}

  const c${i} = figma.createComponentFromNode(${varId});
  components.push(c${i});`;

    variantBlocks.push(block);
  }

  // Build the complete IIFE
  return `(async () => {
  const state = globalThis.__deshPush;
  if (!state) return JSON.stringify({ error: 'Preamble not run. Call generatePreambleJs first.' });

  const { varsByName, bindFill, bindStroke } = state;
  const components = [];
${variantBlocks.join('\n')}

  // Combine all variant components into a ComponentSet
  const componentSet = figma.combineAsVariants(components, figma.currentPage);
  componentSet.name = ${JSON.stringify(name)};

  // Position the component set
  componentSet.x = state.nextX;
  componentSet.y = state.nextY;
  state.nextY += componentSet.height + 60;

  // Read back property definitions to get the name#id keys
  const propDefs = componentSet.componentPropertyDefinitions;
  const properties = {};
  for (const [key, def] of Object.entries(propDefs)) {
    if (def.type === 'VARIANT') {
      properties[key.split('#')[0]] = key;
    }
  }

  const result = {
    nodeId: componentSet.id,
    name: ${JSON.stringify(name)},
    type: 'COMPONENT_SET',
    properties,
    defaultVariant: { ${JSON.stringify(primaryKey)}: ${JSON.stringify(values[0])} },
    variantCount: components.length,
  };

  state.created.push({ name: ${JSON.stringify(name)}, id: componentSet.id, type: 'COMPONENT_SET' });

  return JSON.stringify(result);
})()`;
}

// ---------------------------------------------------------------------------
// Structural component → single Component
// ---------------------------------------------------------------------------

function generateStructuralComponentJs(comp: ComponentDef): string {
  const name = toPascalCase(comp.name);
  const style = parseClasses(comp.baseClasses);

  // Defaults for structural components
  const effectiveStyle = { ...style };
  if (!effectiveStyle.layoutMode) effectiveStyle.layoutMode = 'VERTICAL';
  if (effectiveStyle.radius === null) effectiveStyle.radius = 12;
  if (effectiveStyle.paddingAll === null && effectiveStyle.paddingH === null && effectiveStyle.paddingV === null) {
    effectiveStyle.paddingAll = 16;
  }
  if (effectiveStyle.gap === null) effectiveStyle.gap = 8;
  if (!effectiveStyle.fillVar) effectiveStyle.fillVar = 'card';

  // Build sub-component child frames
  const subBlocks: string[] = [];
  const subs = comp.subComponents.length > 0 ? comp.subComponents.slice(0, 8) : [];

  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i];
    const subId = `sub${i}`;
    subBlocks.push(`
  // Sub-component: ${sub}
  const ${subId} = figma.createFrame();
  ${subId}.name = ${JSON.stringify(sub)};
  ${subId}.layoutMode = 'HORIZONTAL';
  ${subId}.primaryAxisSizingMode = 'AUTO';
  ${subId}.counterAxisSizingMode = 'AUTO';
  ${subId}.paddingLeft = ${subId}.paddingRight = 12;
  ${subId}.paddingTop = ${subId}.paddingBottom = 8;
  ${subId}.cornerRadius = 6;
  ${subId}.itemSpacing = 8;
  ${subId}.counterAxisAlignItems = 'CENTER';
  bindFill(${subId}, 'muted');

${genTextNodeCode(`st${i}`, subId, sub, {
    colorVar: 'muted-foreground',
    fontSize: 11,
    fontStyle: 'Regular',
    fillParent: true,
  })}

  root.appendChild(${subId});
  ${subId}.layoutSizingHorizontal = 'FILL';`);
  }

  // If no sub-components, create a placeholder content area
  if (subs.length === 0) {
    subBlocks.push(`
  // Content area placeholder
  const placeholder = figma.createFrame();
  placeholder.name = 'Content';
  placeholder.layoutMode = 'HORIZONTAL';
  placeholder.primaryAxisSizingMode = 'AUTO';
  placeholder.counterAxisSizingMode = 'AUTO';
  placeholder.paddingLeft = placeholder.paddingRight = 12;
  placeholder.paddingTop = placeholder.paddingBottom = 16;
  placeholder.cornerRadius = 6;
  placeholder.primaryAxisAlignItems = 'CENTER';
  placeholder.counterAxisAlignItems = 'CENTER';
  bindFill(placeholder, 'muted');

${genTextNodeCode('pt0', 'placeholder', 'Content area', {
    colorVar: 'muted-foreground',
    fontSize: 11,
    fontStyle: 'Regular',
    fillParent: false,
  })}

  root.appendChild(placeholder);
  placeholder.layoutSizingHorizontal = 'FILL';`);
  }

  const childNames = subs.length > 0 ? subs : ['Content'];

  return `(async () => {
  const state = globalThis.__deshPush;
  if (!state) return JSON.stringify({ error: 'Preamble not run. Call generatePreambleJs first.' });

  const { varsByName, bindFill, bindStroke } = state;

  // Create outer frame
  const root = figma.createFrame();
  root.name = ${JSON.stringify(name)};
  root.resize(320, 1);
${genFrameStyleCode('root', effectiveStyle)}

  // Title label
${genTextNodeCode('titleText', 'root', name, {
    colorVar: effectiveStyle.textColorVar ?? 'foreground',
    fontSize: 14,
    fontStyle: 'Semi Bold',
    fillParent: true,
  })}
${subBlocks.join('\n')}

  // Convert to Component (must be at page level, not inside another component)
  const component = figma.createComponentFromNode(root);

  // Position
  component.x = state.nextX;
  component.y = state.nextY;
  state.nextY += component.height + 60;

  const result = {
    nodeId: component.id,
    name: ${JSON.stringify(name)},
    type: 'COMPONENT',
    children: ${JSON.stringify(childNames)},
  };

  state.created.push({ name: ${JSON.stringify(name)}, id: component.id, type: 'COMPONENT' });

  return JSON.stringify(result);
})()`;
}

// ---------------------------------------------------------------------------
// Legacy export — kept for backward compatibility with existing call sites
// that use the JSX pipeline. Maps to the old API signature.
// ---------------------------------------------------------------------------

/**
 * @deprecated Use generateComponentPushJs instead.
 * Kept for backward compatibility with sync.ts and components.ts call sites.
 */
export function componentToJsx(comp: ComponentDef): string[] {
  // Return the JS code wrapped in a marker so callers know it's direct JS
  // The call sites will need updating to use generateComponentPushJs directly
  return [generateComponentPushJs(comp)];
}
