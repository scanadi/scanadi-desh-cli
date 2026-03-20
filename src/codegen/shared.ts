// ---------------------------------------------------------------------------
// Shared codegen patterns used across command files
// ---------------------------------------------------------------------------

/**
 * Wrap `body` in an async IIFE and return the full expression string.
 * Duplicated in set.ts, var.ts — now centralized here.
 */
export function wrapAsyncIife(body: string): string {
  return `(async () => {\n${body}\n})()`;
}

/**
 * Convert hex color string to Figma {r,g,b} values (0-1 range).
 * Handles both #rgb and #rrggbb formats.
 */
export function hexToFigmaRgb(hex: string): { r: number; g: number; b: number } {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const n = parseInt(hex, 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

/**
 * Convert hex color string to a Figma-compatible {r:N,g:N,b:N} code string
 * suitable for embedding in generated JS code.
 */
export function hexToFigmaRgbCode(hex: string): string {
  if (!hex.startsWith('#')) return '{r:0.5,g:0.5,b:0.5}';
  const { r, g, b } = hexToFigmaRgb(hex);
  return `{r:${r},g:${g},b:${b}}`;
}

/**
 * Check if a string value is a variable reference (e.g. "var:primary").
 */
export function isVarRef(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith('var:');
}

/**
 * Extract the variable name from a "var:name" reference string.
 */
export function getVarName(value: string): string {
  return value.slice(4);
}

/**
 * Generate JS code that computes `smartX` — the next free X position
 * on the current page, offset by `gap` pixels.
 */
export function generateSmartPositioningCode(gap = 100): string {
  return `
const _children = figma.currentPage.children;
let smartX = 0;
if (_children.length > 0) {
  _children.forEach(n => { smartX = Math.max(smartX, n.x + (n.width || 0)); });
  smartX += ${gap};
}`;
}

/**
 * Generate JS that resolves a variable by name across ALL local
 * collections, then makes it available as `variable` in scope.
 */
export function generateVarLookupCode(varName: string): string {
  return `
  const _cols = await figma.variables.getLocalVariableCollectionsAsync();
  let variable = null;
  outer: for (const _col of _cols) {
    for (const _id of _col.variableIds) {
      const _v = await figma.variables.getVariableByIdAsync(_id);
      if (_v && _v.name === ${JSON.stringify(varName)}) { variable = _v; break outer; }
    }
  }
  if (!variable) return 'Variable not found: ' + ${JSON.stringify(varName)};
  const boundFill = (v) => figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }, 'color', v);
`.trimStart();
}

/**
 * Generate JS that loads all local variables into `vars` and
 * defines `boundFill`. Must be used inside an async IIFE.
 */
export function generateVarLoadingCode(): string {
  return `
const allVars = await figma.variables.getLocalVariablesAsync();
const vars = {};
for (const v of allVars) {
  vars[v.name] = v;
  const slash = v.name.lastIndexOf('/');
  if (slash >= 0) {
    const short = v.name.slice(slash + 1);
    if (!vars[short]) vars[short] = v;
  }
}
const boundFill = (variable) => figma.variables.setBoundVariableForPaint(
  { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }, 'color', variable
);
`;
}

/**
 * Generate JS that populates `nodes` — either from a node ID or the current selection.
 */
export function generateNodeSelector(nodeId: string | undefined): string {
  return nodeId
    ? `const _n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)}); const nodes = _n ? [_n] : [];`
    : `const nodes = figma.currentPage.selection.slice();`;
}
