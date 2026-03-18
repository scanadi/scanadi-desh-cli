import { readFileSync } from 'fs';
import postcss from 'postcss';

export interface TokenMap {
  theme: Record<string, string>;
  light: Record<string, string>;
  dark: Record<string, string>;
}

function extractVarsFromBlock(node: postcss.Container): Record<string, string> {
  const vars: Record<string, string> = {};
  node.walkDecls((decl) => {
    if (decl.prop.startsWith('--')) {
      vars[decl.prop] = decl.value;
    }
  });
  return vars;
}

function parseCSS(css: string): TokenMap {
  const root = postcss.parse(css);
  const result: TokenMap = { theme: {}, light: {}, dark: {} };

  root.walkAtRules('theme', (rule) => {
    Object.assign(result.theme, extractVarsFromBlock(rule));
  });

  root.walkRules(':root', (rule) => {
    Object.assign(result.light, extractVarsFromBlock(rule));
  });

  root.walkRules('.dark', (rule) => {
    Object.assign(result.dark, extractVarsFromBlock(rule));
  });

  return result;
}

export async function extractTokens(cssFiles: string[]): Promise<TokenMap> {
  const merged: TokenMap = { theme: {}, light: {}, dark: {} };

  for (const file of cssFiles) {
    const css = readFileSync(file, 'utf8');
    const tokens = parseCSS(css);
    Object.assign(merged.theme, tokens.theme);
    Object.assign(merged.light, tokens.light);
    Object.assign(merged.dark, tokens.dark);
  }

  return merged;
}
