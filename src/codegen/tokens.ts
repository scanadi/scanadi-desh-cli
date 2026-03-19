import type { TokenMap } from '../scanner/tokens.js';
import { cssColorToRgb, type RgbColor } from './color.js';

interface ColorVar {
  name: string;
  light: RgbColor;
  dark: RgbColor | null;
  lightCss: string;
  darkCss: string | null;
}

interface FloatVar {
  name: string;
  value: number;
}

/** Standard browser root font size — used for rem→px conversion */
const REM_BASE = 16;

/**
 * Parse a CSS value (rem, px, or bare number) into a numeric pixel value.
 * Returns null for non-numeric values (font stacks, colors, etc.).
 */
export function parseCssNumeric(value: string): number | null {
  const trimmed = value.trim();

  // Match rem values: "0.25rem"
  const remMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*rem$/);
  if (remMatch) {
    const num = parseFloat(remMatch[1]);
    return Number.isFinite(num) ? num * REM_BASE : null;
  }

  // Match px values: "4px"
  const pxMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*px$/);
  if (pxMatch) {
    const num = parseFloat(pxMatch[1]);
    return Number.isFinite(num) ? num : null;
  }

  // Match bare numbers: "0.5", "16"
  const bareMatch = trimmed.match(/^-?\d+(?:\.\d+)?$/);
  if (bareMatch) {
    const num = parseFloat(trimmed);
    return Number.isFinite(num) ? num : null;
  }

  return null;
}

export function generateTokenSyncJs(tokens: TokenMap): string {
  // Collect semantic color variables from :root and .dark
  const colorVars: ColorVar[] = [];

  for (const [prop, value] of Object.entries(tokens.light)) {
    const lightRgb = cssColorToRgb(value);
    if (!lightRgb) continue;

    const darkValue = tokens.dark[prop];
    const darkRgb = darkValue ? cssColorToRgb(darkValue) : null;

    colorVars.push({
      name: prop.replace(/^--/, ''),
      light: lightRgb,
      dark: darkRgb,
      lightCss: value,
      darkCss: darkValue ?? null,
    });
  }

  // Collect float variables from @theme (radius, spacing, etc.)
  const floatVars: FloatVar[] = [];

  for (const [prop, value] of Object.entries(tokens.theme)) {
    const numeric = parseCssNumeric(value);
    if (numeric === null) continue;

    floatVars.push({
      name: prop.replace(/^--/, ''),
      value: numeric,
    });
  }

  // Generate the JS that creates Figma variables
  return `(async () => {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();

    // --- "semantic" collection — colors with Light/Dark modes ---
    let semanticCol = collections.find(c => c.name === 'semantic');
    if (!semanticCol) {
      semanticCol = figma.variables.createVariableCollection('semantic');
      semanticCol.renameMode(semanticCol.modes[0].modeId, 'Light');
      semanticCol.addMode('Dark');
    }

    // Ensure modes are named correctly (handles pre-existing collections with default names)
    if (semanticCol.modes.length >= 1 && semanticCol.modes[0].name !== 'Light') {
      try { semanticCol.renameMode(semanticCol.modes[0].modeId, 'Light'); } catch (e) {}
    }
    if (semanticCol.modes.length >= 2 && semanticCol.modes[1].name !== 'Dark') {
      try { semanticCol.renameMode(semanticCol.modes[1].modeId, 'Dark'); } catch (e) {}
    }
    if (semanticCol.modes.length < 2) {
      try { semanticCol.addMode('Dark'); } catch (e) {}
    }

    const lightModeId = semanticCol.modes.find(m => m.name === 'Light')?.modeId || semanticCol.modes[0].modeId;
    const darkModeId = semanticCol.modes.find(m => m.name === 'Dark')?.modeId;

    const colorVarDefs = ${JSON.stringify(colorVars)};

    let created = 0;
    const alphaWarnings = [];
    const existingColors = await figma.variables.getLocalVariablesAsync('COLOR');

    for (const v of colorVarDefs) {
      try {
        let figVar = existingColors.find(fv => fv.name === v.name && fv.variableCollectionId === semanticCol.id);
        if (!figVar) {
          figVar = figma.variables.createVariable(v.name, semanticCol, 'COLOR');
        }
        // Store original CSS values in description for lossless export roundtrip
        const desc = v.darkCss ? 'desh:' + v.lightCss + '|' + v.darkCss : 'desh:' + v.lightCss;
        figVar.description = desc;
        figVar.setValueForMode(lightModeId, { r: v.light.r, g: v.light.g, b: v.light.b });
        if (v.light.a !== undefined && v.light.a < 1) {
          alphaWarnings.push(v.name + ' (light: alpha=' + v.light.a + ')');
        }
        if (darkModeId && v.dark) {
          figVar.setValueForMode(darkModeId, { r: v.dark.r, g: v.dark.g, b: v.dark.b });
          if (v.dark.a !== undefined && v.dark.a < 1) {
            alphaWarnings.push(v.name + ' (dark: alpha=' + v.dark.a + ')');
          }
        }
        created++;
      } catch (e) {}
    }

    // --- "primitives" collection — floats (radius, spacing, etc.) ---
    const floatVarDefs = ${JSON.stringify(floatVars)};
    let floatCreated = 0;

    if (floatVarDefs.length > 0) {
      let primitivesCol = collections.find(c => c.name === 'primitives');
      if (!primitivesCol) {
        primitivesCol = figma.variables.createVariableCollection('primitives');
      }

      const existingFloats = await figma.variables.getLocalVariablesAsync('FLOAT');

      for (const fv of floatVarDefs) {
        try {
          let figVar = existingFloats.find(ev => ev.name === fv.name && ev.variableCollectionId === primitivesCol.id);
          if (!figVar) {
            figVar = figma.variables.createVariable(fv.name, primitivesCol, 'FLOAT');
          }
          figVar.setValueForMode(primitivesCol.defaultModeId, fv.value);
          floatCreated++;
        } catch (e) {}
      }
    }

    return { created, floatCreated, alphaWarnings, collection: 'semantic' + (floatVarDefs.length > 0 ? ' + primitives' : '') };
  })()`;
}
