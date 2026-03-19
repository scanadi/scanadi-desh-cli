import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

export interface ProjectInfo {
  isMonorepo: boolean;
  root: string;
  suggestedTokens: string[];
  suggestedPrimitives: string | null;
  suggestedComponents: string[];
}

const MONOREPO_MARKERS = ['pnpm-workspace.yaml', 'turbo.json', 'nx.json', 'lerna.json'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.nuxt', 'build', 'out', '.reference']);

const TOKEN_PATTERN = /@theme\b|:root\s*\{[^}]*--[a-z]|\.dark\s*\{[^}]*--[a-z]/s;

function hasTokenContent(filePath: string): boolean {
  try {
    const head = readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).slice(0, 1024);
    return TOKEN_PATTERN.test(head);
  } catch {
    return false;
  }
}

function findGlobalsCSS(dir: string, maxDepth = 4, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      try {
        if (statSync(full).isDirectory()) {
          results.push(...findGlobalsCSS(full, maxDepth, depth + 1));
        } else if (entry.endsWith('.css') && hasTokenContent(full)) {
          results.push(full);
        }
      } catch {}
    }
  } catch {}
  return results;
}

function findComponentDirs(dir: string, maxDepth = 4, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      try {
        if (!statSync(full).isDirectory()) continue;
        if (entry === 'components') {
          results.push(full);
        } else {
          results.push(...findComponentDirs(full, maxDepth, depth + 1));
        }
      } catch {}
    }
  } catch {}
  return results;
}

export function scanProject(root: string): ProjectInfo {
  const isMonorepo = MONOREPO_MARKERS.some(m => existsSync(join(root, m)));
  const globalsCSSFiles = findGlobalsCSS(root).map(f => relative(root, f));
  const componentDirs = findComponentDirs(root).map(f => relative(root, f));

  // Heuristic: dir containing /ui/ or ending with /ui is primitives
  const primitivesDir = componentDirs.find(d => d.includes('/ui/') || d.includes('/ui'));
  const appComponentDirs = componentDirs.filter(d => d !== primitivesDir);

  return {
    isMonorepo,
    root,
    suggestedTokens: globalsCSSFiles,
    suggestedPrimitives: primitivesDir ?? null,
    suggestedComponents: appComponentDirs,
  };
}
