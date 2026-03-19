# Component Linking & Bidirectional Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link code components (shadcn/ui TSX) to existing Figma library components, diff variant metadata, and sync changes per-component in either direction.

**Architecture:** New `src/linker/` module handles component map persistence, name matching, and diffing. New commands wire into the existing `components` subcommand group. Library discovery is added to `desh init`. All read operations use the REST API (no plugin required); write operations to Figma use the plugin bridge.

**Tech Stack:** TypeScript, Commander.js (CLI), vitest (tests), Figma REST API, Figma Plugin API (via bridge), ts-morph (AST parsing for pull)

**Design doc:** `docs/plans/2026-03-19-component-linking-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/linker/component-map.ts` | Load/save/query `.desh-component-map.json` — types and persistence |
| `src/linker/match.ts` | Name matching algorithm: exact, PascalCase→spaced, prefix stripping |
| `src/linker/diff.ts` | Pure diff logic: compare code variants vs Figma variants, return structured diff |
| `src/commands/component-link.ts` | `link`, `unlink`, `linked` subcommands |
| `src/commands/component-diff.ts` | `diff` subcommand |
| `src/commands/component-push.ts` | `push` subcommand (code→Figma, adds missing variants) |
| `src/commands/component-pull.ts` | `pull` subcommand (Figma→code, adds missing cva variant values) |
| `tests/linker/component-map.test.ts` | Tests for map persistence |
| `tests/linker/match.test.ts` | Tests for name matching |
| `tests/linker/diff.test.ts` | Tests for diff logic |
| `tests/linker/pull.test.ts` | Tests for addVariantToFile cva modification |
| `src/linker/pull.ts` | TSX modification logic — addVariantToFile extracted for testability |

### Modified Files

| File | Change |
|------|--------|
| `src/config.ts` | Add `library?: { fileKey: string; name: string }` to DeshConfig |
| `src/commands/init.ts` | Add library discovery step after project scan |
| `src/commands/components.ts` | Register new subcommands from link/diff/push/pull modules |
| `src/cli.ts` | No change needed — components already registered |

---

### Task 1: Component Map Module (`src/linker/component-map.ts`)

**Files:**
- Create: `src/linker/component-map.ts`
- Create: `tests/linker/component-map.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/linker/component-map.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseComponentMap, serializeComponentMap, type ComponentMap, type LinkedComponent } from '../../src/linker/component-map.js';

describe('ComponentMap', () => {
  it('parses valid map JSON', () => {
    const raw = {
      version: 1,
      linkedAt: '2026-03-19T12:00:00Z',
      libraryFileKey: 'abc123',
      components: {
        Button: {
          codeFile: 'packages/ui/components/button.tsx',
          figmaKey: 'key123',
          figmaName: 'Button',
          figmaType: 'COMPONENT_SET',
          codeVariants: { variant: ['default', 'destructive'], size: ['sm', 'lg'] },
          figmaVariants: { variant: ['default', 'destructive'], size: ['sm', 'lg'] },
        },
      },
    };
    const map = parseComponentMap(JSON.stringify(raw));
    expect(map.components.Button.figmaKey).toBe('key123');
    expect(map.components.Button.codeVariants.variant).toEqual(['default', 'destructive']);
  });

  it('returns empty map for invalid JSON', () => {
    const map = parseComponentMap('not json');
    expect(map.components).toEqual({});
    expect(map.version).toBe(1);
  });

  it('serializes map to formatted JSON', () => {
    const map: ComponentMap = {
      version: 1,
      linkedAt: '2026-03-19T12:00:00Z',
      libraryFileKey: 'abc123',
      components: {},
    };
    const json = serializeComponentMap(map);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.libraryFileKey).toBe('abc123');
  });

  it('handles components without variants (structural)', () => {
    const raw = {
      version: 1, linkedAt: '', libraryFileKey: 'abc',
      components: {
        Card: {
          codeFile: 'card.tsx', figmaKey: 'k1', figmaName: 'Card',
          figmaType: 'COMPONENT',
          codeVariants: {}, figmaVariants: {},
          subComponents: ['CardHeader', 'CardContent'],
        },
      },
    };
    const map = parseComponentMap(JSON.stringify(raw));
    expect(map.components.Card.subComponents).toContain('CardHeader');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/linker/component-map.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the component map module**

Create `src/linker/component-map.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface LinkedComponent {
  codeFile: string;
  figmaKey: string;
  figmaName: string;
  figmaType: 'COMPONENT' | 'COMPONENT_SET';
  codeVariants: Record<string, string[]>;
  figmaVariants: Record<string, string[]>;
  subComponents?: string[];
}

export interface ComponentMap {
  version: number;
  linkedAt: string;
  libraryFileKey: string;
  components: Record<string, LinkedComponent>;
}

const MAP_FILE = '.desh-component-map.json';

function emptyMap(): ComponentMap {
  return { version: 1, linkedAt: '', libraryFileKey: '', components: {} };
}

export function parseComponentMap(raw: string): ComponentMap {
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return emptyMap();
    return {
      version: data.version ?? 1,
      linkedAt: data.linkedAt ?? '',
      libraryFileKey: data.libraryFileKey ?? '',
      components: data.components ?? {},
    };
  } catch {
    return emptyMap();
  }
}

export function serializeComponentMap(map: ComponentMap): string {
  return JSON.stringify(map, null, 2);
}

export function loadComponentMap(projectDir: string): ComponentMap {
  const filePath = join(projectDir, MAP_FILE);
  if (!existsSync(filePath)) return emptyMap();
  return parseComponentMap(readFileSync(filePath, 'utf8'));
}

export function saveComponentMap(projectDir: string, map: ComponentMap): void {
  const filePath = join(projectDir, MAP_FILE);
  writeFileSync(filePath, serializeComponentMap(map) + '\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/linker/component-map.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/linker/component-map.ts tests/linker/component-map.test.ts
git commit -m "feat: add component map module for linking code ↔ Figma components"
```

---

### Task 2: Name Matching Module (`src/linker/match.ts`)

**Files:**
- Create: `src/linker/match.ts`
- Create: `tests/linker/match.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/linker/match.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { findBestMatch, normalizeComponentName } from '../../src/linker/match.js';

describe('normalizeComponentName', () => {
  it('lowercases', () => {
    expect(normalizeComponentName('Button')).toBe('button');
  });

  it('splits PascalCase to spaced lowercase', () => {
    expect(normalizeComponentName('RadioGroup')).toBe('radiogroup');
  });

  it('strips common prefixes', () => {
    expect(normalizeComponentName('UI/Button')).toBe('button');
    expect(normalizeComponentName('Components/Card')).toBe('card');
  });

  it('handles nested paths', () => {
    expect(normalizeComponentName('Design System/UI/Badge')).toBe('badge');
  });
});

describe('findBestMatch', () => {
  const figmaComponents = [
    { name: 'Button', key: 'k1' },
    { name: 'Badge', key: 'k2' },
    { name: 'Radio Group', key: 'k3' },
    { name: 'UI/Card', key: 'k4' },
    { name: 'Alert Dialog', key: 'k5' },
    { name: 'Toggle', key: 'k6' },
  ];

  it('matches exact name (case-insensitive)', () => {
    const match = findBestMatch('Button', figmaComponents);
    expect(match?.key).toBe('k1');
  });

  it('matches PascalCase to spaced Figma name', () => {
    const match = findBestMatch('RadioGroup', figmaComponents);
    expect(match?.key).toBe('k3');
  });

  it('matches despite Figma prefix', () => {
    const match = findBestMatch('Card', figmaComponents);
    expect(match?.key).toBe('k4');
  });

  it('matches AlertDialog to Alert Dialog', () => {
    const match = findBestMatch('AlertDialog', figmaComponents);
    expect(match?.key).toBe('k5');
  });

  it('returns null for no match', () => {
    const match = findBestMatch('NonExistent', figmaComponents);
    expect(match).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/linker/match.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the matching module**

Create `src/linker/match.ts`:

```typescript
export interface FigmaComponentEntry {
  name: string;
  key: string;
}

/**
 * Normalize a component name for comparison:
 * - Strip path prefixes (UI/Button → Button)
 * - Lowercase
 */
export function normalizeComponentName(name: string): string {
  // Strip path prefixes: "Design System/UI/Button" → "Button"
  const lastSlash = name.lastIndexOf('/');
  const base = lastSlash >= 0 ? name.slice(lastSlash + 1) : name;
  return base.toLowerCase().replace(/\s+/g, '');
}

/**
 * Convert PascalCase to spaced lowercase: "RadioGroup" → "radio group"
 */
function pascalToSpaced(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/**
 * Find the best matching Figma component for a code component name.
 * Tries: exact (case-insensitive), normalized, PascalCase→spaced.
 */
export function findBestMatch(
  codeName: string,
  figmaComponents: FigmaComponentEntry[],
): FigmaComponentEntry | null {
  const codeNorm = normalizeComponentName(codeName);
  const codeSpaced = pascalToSpaced(codeName).replace(/\s+/g, '');

  // Pass 1: exact name match (case-insensitive)
  for (const fc of figmaComponents) {
    if (fc.name.toLowerCase() === codeName.toLowerCase()) return fc;
  }

  // Pass 2: normalized match (strips prefixes, spaces)
  for (const fc of figmaComponents) {
    if (normalizeComponentName(fc.name) === codeNorm) return fc;
  }

  // Pass 3: PascalCase code name → spaced Figma name
  // "AlertDialog" → "alertdialog" matches "Alert Dialog" → "alertdialog"
  for (const fc of figmaComponents) {
    const figmaNorm = fc.name.toLowerCase().replace(/\s+/g, '');
    if (figmaNorm === codeSpaced) return fc;
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/linker/match.test.ts`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/linker/match.ts tests/linker/match.test.ts
git commit -m "feat: add name matching for code ↔ Figma component linking"
```

---

### Task 3: Diff Module (`src/linker/diff.ts`)

**Files:**
- Create: `src/linker/diff.ts`
- Create: `tests/linker/diff.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/linker/diff.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { diffComponent, type ComponentDiffResult } from '../../src/linker/diff.js';

describe('diffComponent', () => {
  it('reports matching variants as synced', () => {
    const result = diffComponent({
      codeVariants: { variant: ['default', 'destructive'] },
      figmaVariants: { variant: ['default', 'destructive'] },
    });
    expect(result.axes.variant.matched).toEqual(['default', 'destructive']);
    expect(result.axes.variant.codeOnly).toEqual([]);
    expect(result.axes.variant.figmaOnly).toEqual([]);
    expect(result.inSync).toBe(true);
  });

  it('reports code-only variants', () => {
    const result = diffComponent({
      codeVariants: { variant: ['default', 'destructive', 'success'] },
      figmaVariants: { variant: ['default', 'destructive'] },
    });
    expect(result.axes.variant.codeOnly).toEqual(['success']);
    expect(result.inSync).toBe(false);
  });

  it('reports figma-only variants', () => {
    const result = diffComponent({
      codeVariants: { variant: ['default'] },
      figmaVariants: { variant: ['default', 'outline'] },
    });
    expect(result.axes.variant.figmaOnly).toEqual(['outline']);
    expect(result.inSync).toBe(false);
  });

  it('reports missing axes', () => {
    const result = diffComponent({
      codeVariants: { variant: ['default'], size: ['sm', 'lg'] },
      figmaVariants: { variant: ['default'] },
    });
    expect(result.axesCodeOnly).toContain('size');
    expect(result.inSync).toBe(false);
  });

  it('reports axes only in Figma', () => {
    const result = diffComponent({
      codeVariants: { variant: ['default'] },
      figmaVariants: { variant: ['default'], state: ['hover', 'pressed'] },
    });
    expect(result.axesFigmaOnly).toContain('state');
  });

  it('handles empty variants (structural component)', () => {
    const result = diffComponent({
      codeVariants: {},
      figmaVariants: {},
    });
    expect(result.inSync).toBe(true);
    expect(Object.keys(result.axes)).toHaveLength(0);
  });

  it('handles multiple axes simultaneously', () => {
    const result = diffComponent({
      codeVariants: { variant: ['default', 'destructive', 'success'], size: ['sm', 'default', 'lg'] },
      figmaVariants: { variant: ['default', 'destructive'], size: ['sm', 'default', 'lg', 'xl'] },
    });
    expect(result.axes.variant.codeOnly).toEqual(['success']);
    expect(result.axes.size.figmaOnly).toEqual(['xl']);
    expect(result.inSync).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/linker/diff.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the diff module**

Create `src/linker/diff.ts`:

```typescript
export interface AxisDiff {
  matched: string[];
  codeOnly: string[];
  figmaOnly: string[];
}

export interface ComponentDiffResult {
  axes: Record<string, AxisDiff>;
  axesCodeOnly: string[];
  axesFigmaOnly: string[];
  inSync: boolean;
}

interface DiffInput {
  codeVariants: Record<string, string[]>;
  figmaVariants: Record<string, string[]>;
}

export function diffComponent(input: DiffInput): ComponentDiffResult {
  const { codeVariants, figmaVariants } = input;
  const allAxes = new Set([...Object.keys(codeVariants), ...Object.keys(figmaVariants)]);

  const axes: Record<string, AxisDiff> = {};
  const axesCodeOnly: string[] = [];
  const axesFigmaOnly: string[] = [];
  let inSync = true;

  for (const axis of allAxes) {
    const codeValues = codeVariants[axis];
    const figmaValues = figmaVariants[axis];

    if (!figmaValues) {
      axesCodeOnly.push(axis);
      inSync = false;
      continue;
    }
    if (!codeValues) {
      axesFigmaOnly.push(axis);
      inSync = false;
      continue;
    }

    const codeSet = new Set(codeValues);
    const figmaSet = new Set(figmaValues);

    const matched = codeValues.filter(v => figmaSet.has(v));
    const codeOnly = codeValues.filter(v => !figmaSet.has(v));
    const figmaOnly = figmaValues.filter(v => !codeSet.has(v));

    axes[axis] = { matched, codeOnly, figmaOnly };

    if (codeOnly.length > 0 || figmaOnly.length > 0) {
      inSync = false;
    }
  }

  return { axes, axesCodeOnly, axesFigmaOnly, inSync };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/linker/diff.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/linker/diff.ts tests/linker/diff.test.ts
git commit -m "feat: add variant diff logic for code ↔ Figma comparison"
```

---

### Task 4: Config Extension for Library

**Files:**
- Modify: `src/config.ts:4-17` (interfaces)
- Modify: `src/config.ts:19-27` (parseConfig)

- [ ] **Step 1: Update the DeshConfig interface**

In `src/config.ts`, add the `library` field to `DeshConfig` and `RawConfig`:

```typescript
// Add to DeshConfig interface (after libraryFileKey):
export interface DeshConfig {
  tokens: string[];
  primitives?: string;
  components: string[];
  libraryFileKey?: string;
  library?: { fileKey: string; name: string };
  configDir: string;
}

// Add to RawConfig interface:
interface RawConfig {
  tokens?: string | string[];
  primitives?: string;
  components?: string | string[];
  libraryFileKey?: string;
  library?: { fileKey: string; name: string };
}
```

Update `parseConfig` to pass through the library field:

```typescript
export function parseConfig(raw: RawConfig, configDir = '.'): DeshConfig {
  const tokens = raw.tokens
    ? Array.isArray(raw.tokens) ? raw.tokens : [raw.tokens]
    : [];
  const components = raw.components
    ? Array.isArray(raw.components) ? raw.components : [raw.components]
    : [];
  return { tokens, primitives: raw.primitives, components, libraryFileKey: raw.libraryFileKey, library: raw.library, configDir };
}
```

- [ ] **Step 2: Run existing config tests to ensure no regression**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS (all existing tests still pass)

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: add library field to DeshConfig for linked design system"
```

---

### Task 5: Library Discovery in Init

**Files:**
- Modify: `src/commands/init.ts`

- [ ] **Step 1: Add library discovery to init**

In `src/commands/init.ts`, after the project scan block and before writing the config, add library discovery. This attempts to find linked libraries via the plugin if connected, falling back gracefully:

```typescript
// Add imports at top:
import { runFigmaCode } from '../utils/figma-eval.js';

// After the existing project scan output (after line 49), add:

        // Try to discover linked library (requires plugin connection)
        let library: { fileKey: string; name: string } | undefined;
        try {
          const raw = await runFigmaCode<string>(`(async () => {
  const found = new Map();
  // Scan current page for remote component instances
  for (const child of figma.currentPage.children) {
    if (found.size > 0) break;
    function walk(n, depth) {
      if (depth > 3 || found.size > 0) return;
      if (n.type === 'INSTANCE') {
        try {
          const mc = n.mainComponent;
          if (mc && mc.remote) {
            // Extract file key from the component key
            found.set('key', mc.key);
            found.set('remote', true);
          }
        } catch(e) {}
      }
      if ('children' in n && n.type !== 'INSTANCE') {
        for (const c of n.children) walk(c, depth + 1);
      }
    }
    walk(child, 0);
  }
  // Also check team library collections
  try {
    const libs = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    if (libs.length > 0) {
      return JSON.stringify({ libraryName: libs[0].libraryName, collections: libs.map(l => l.libraryName) });
    }
  } catch(e) {}
  return JSON.stringify(null);
})()`, 15_000);

          const result = raw ? JSON.parse(raw) : null;
          if (result && result.libraryName) {
            info(`Detected linked library: ${result.libraryName}`);
            info('Run `desh lib set-library <fileKey>` to enable component linking');
          }
        } catch {
          // Plugin not connected or discovery failed — skip silently
        }
```

Update the config write block to include library if discovered:

```typescript
        // In the config object creation, add:
        if (library) config.library = library;
```

- [ ] **Step 2: Build to verify no compile errors**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/commands/init.ts
git commit -m "feat: add library discovery to desh init"
```

---

### Task 6: Link Command (`src/commands/component-link.ts`)

**Files:**
- Create: `src/commands/component-link.ts`
- Modify: `src/commands/components.ts` (register new subcommands)

- [ ] **Step 1: Implement the link command**

Create `src/commands/component-link.ts`:

```typescript
import type { Command } from 'commander';
import { join } from 'path';
import { loadConfig, requireConfig } from '../config.js';
import { loadComponentMap, saveComponentMap, type ComponentMap } from '../linker/component-map.js';
import { findBestMatch } from '../linker/match.js';
import { scanComponentFile } from '../scanner/components.js';
import { getFileComponents, getFileComponentSets } from '../api/figma-rest.js';
import { success, error, info, warn, status, progressDone } from '../utils/output.js';
import { readdirSync, statSync } from 'fs';

function collectTsxFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        if (statSync(full).isDirectory()) {
          if (!['node_modules', '.git', 'dist'].includes(entry)) {
            files.push(...collectTsxFiles(full));
          }
        } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
          files.push(full);
        }
      } catch {}
    }
  } catch {}
  return files;
}

export function registerComponentLinkCommands(parent: Command): void {
  // --- components link ---
  parent
    .command('link [name] [figmaKey]')
    .description('Link code components to Figma library components by name')
    .option('--dry-run', 'Show matches without writing')
    .action(async (name?: string, figmaKey?: string, opts?: { dryRun?: boolean }) => {
      try {
        const config = requireConfig();
        const fileKey = config.library?.fileKey || config.libraryFileKey;
        if (!fileKey) {
          error('No library configured. Run `desh lib set-library <fileKey>` first.');
          process.exit(1);
        }

        // 1. Scan code components
        status('Scanning code components...');
        const primDir = config.primitives ? join(config.configDir, config.primitives) : null;
        const codeComponents: Array<{ name: string; file: string; variants: Record<string, string[]>; subComponents: string[] }> = [];

        if (primDir) {
          for (const file of collectTsxFiles(primDir)) {
            const def = scanComponentFile(file, 'primitives');
            if (def && def.exports.length > 0) {
              codeComponents.push({
                name: def.exports[0],
                file: file,
                variants: def.variants,
                subComponents: def.subComponents,
              });
            }
          }
        }
        progressDone();

        // 2. Fetch Figma library components
        status('Fetching Figma library components...');
        const [components, componentSets] = await Promise.all([
          getFileComponents(fileKey),
          getFileComponentSets(fileKey),
        ]);
        progressDone();

        // Build a list of top-level Figma components (sets + standalone)
        const figmaEntries = [
          ...componentSets.map(cs => ({ name: cs.name, key: cs.key, type: 'COMPONENT_SET' as const })),
          ...components
            .filter(c => !c.componentSetName) // exclude variants inside sets
            .map(c => ({ name: c.name, key: c.key, type: 'COMPONENT' as const })),
        ];

        // 3. Match
        const map = loadComponentMap(config.configDir);
        map.libraryFileKey = fileKey;
        map.linkedAt = new Date().toISOString();

        const toLink = name
          ? codeComponents.filter(c => c.name.toLowerCase() === name.toLowerCase())
          : codeComponents;

        if (name && toLink.length === 0) {
          error(`Component "${name}" not found in code. Available: ${codeComponents.map(c => c.name).join(', ')}`);
          process.exit(1);
        }

        let linked = 0;
        let skipped = 0;

        for (const cc of toLink) {
          // If explicit figmaKey provided, use it directly
          if (figmaKey && name) {
            const figmaEntry = figmaEntries.find(f => f.key === figmaKey) ||
              components.find(c => c.key === figmaKey);
            if (!figmaEntry) {
              warn(`Figma key "${figmaKey}" not found in library`);
              skipped++;
              continue;
            }
            map.components[cc.name] = {
              codeFile: cc.file,
              figmaKey: figmaEntry.key,
              figmaName: figmaEntry.name,
              figmaType: 'type' in figmaEntry ? figmaEntry.type : 'COMPONENT',
              codeVariants: cc.variants,
              figmaVariants: {}, // Will be populated on first diff
              subComponents: cc.subComponents.length > 0 ? cc.subComponents : undefined,
            };
            linked++;
            continue;
          }

          // Auto-match by name
          const match = findBestMatch(cc.name, figmaEntries);
          if (match) {
            const figmaType = figmaEntries.find(f => f.key === match.key)?.type || 'COMPONENT';
            if (opts?.dryRun) {
              console.log(`  ${cc.name} → ${match.name} (${figmaType})`);
            } else {
              map.components[cc.name] = {
                codeFile: cc.file,
                figmaKey: match.key,
                figmaName: match.name,
                figmaType: figmaType,
                codeVariants: cc.variants,
                figmaVariants: {},
                subComponents: cc.subComponents.length > 0 ? cc.subComponents : undefined,
              };
            }
            linked++;
          } else {
            if (opts?.dryRun) {
              console.log(`  ${cc.name} → (no match)`);
            }
            skipped++;
          }
        }

        if (!opts?.dryRun) {
          saveComponentMap(config.configDir, map);
        }

        success(`${linked} component(s) linked, ${skipped} unmatched`);
        if (skipped > 0) {
          info('Use `desh components link <name> <figmaKey>` to manually link unmatched components');
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // --- components linked ---
  parent
    .command('linked')
    .description('Show all linked components')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      try {
        const config = requireConfig();
        const map = loadComponentMap(config.configDir);
        const entries = Object.entries(map.components);

        if (entries.length === 0) {
          info('No linked components. Run `desh components link` first.');
          return;
        }

        if (opts.json) {
          console.log(JSON.stringify(map, null, 2));
          return;
        }

        for (const [name, comp] of entries) {
          const variantStr = Object.keys(comp.codeVariants).length > 0
            ? ` (${Object.keys(comp.codeVariants).join(', ')})`
            : '';
          console.log(`  ${name} → ${comp.figmaName} [${comp.figmaType}]${variantStr}`);
        }
        success(`${entries.length} linked component(s)`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // --- components unlink ---
  parent
    .command('unlink <name>')
    .description('Remove link for a component')
    .action(async (name: string) => {
      try {
        const config = requireConfig();
        const map = loadComponentMap(config.configDir);
        if (!map.components[name]) {
          error(`Component "${name}" is not linked`);
          process.exit(1);
        }
        delete map.components[name];
        saveComponentMap(config.configDir, map);
        success(`Unlinked "${name}"`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
```

- [ ] **Step 2: Register the new subcommands and rename existing push**

In `src/commands/components.ts`:

1. Add import at top:
```typescript
import { registerComponentLinkCommands } from './component-link.js';
```

2. Rename the existing `push` command to `push-all` (keep `sync` as alias) to avoid collision with the new per-component `push`. Find the line:
```typescript
comp.command('push').alias('sync')
```
Change to:
```typescript
comp.command('push-all').alias('sync')
```

3. Inside `registerComponentCommands`, after existing subcommands, add:
```typescript
  registerComponentLinkCommands(comp);
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/commands/component-link.ts src/commands/components.ts
git commit -m "feat: add components link/linked/unlink commands"
```

---

### Task 7: Diff Command (`src/commands/component-diff.ts`)

**Files:**
- Create: `src/commands/component-diff.ts`
- Modify: `src/commands/components.ts` (register)

- [ ] **Step 1: Implement the diff command**

Create `src/commands/component-diff.ts`:

```typescript
import type { Command } from 'commander';
import { join } from 'path';
import { requireConfig } from '../config.js';
import { loadComponentMap, saveComponentMap } from '../linker/component-map.js';
import { diffComponent, type ComponentDiffResult } from '../linker/diff.js';
import { scanComponentFile } from '../scanner/components.js';
import { getFileComponents, getFileComponentSets } from '../api/figma-rest.js';
import { success, error, info, status, progressDone } from '../utils/output.js';

function formatDiff(name: string, diff: ComponentDiffResult): string {
  const lines: string[] = [`${name}:`];

  if (diff.inSync) {
    lines.push('  = In sync');
    return lines.join('\n');
  }

  for (const [axis, axisDiff] of Object.entries(diff.axes)) {
    if (axisDiff.matched.length > 0 && axisDiff.codeOnly.length === 0 && axisDiff.figmaOnly.length === 0) {
      lines.push(`  ✓ ${axis}: ${axisDiff.matched.join(', ')} — match`);
    } else {
      if (axisDiff.matched.length > 0) {
        lines.push(`  ✓ ${axis}: ${axisDiff.matched.join(', ')} — match`);
      }
      if (axisDiff.codeOnly.length > 0) {
        lines.push(`  + ${axis}: ${axisDiff.codeOnly.join(', ')} — in code, missing in Figma`);
      }
      if (axisDiff.figmaOnly.length > 0) {
        lines.push(`  - ${axis}: ${axisDiff.figmaOnly.join(', ')} — in Figma, missing in code`);
      }
    }
  }

  for (const axis of diff.axesCodeOnly) {
    lines.push(`  + ${axis}: (entire axis) — in code only`);
  }
  for (const axis of diff.axesFigmaOnly) {
    lines.push(`  - ${axis}: (entire axis) — in Figma only`);
  }

  return lines.join('\n');
}

export function registerComponentDiffCommand(parent: Command): void {
  parent
    .command('diff [name]')
    .description('Compare linked component variants between code and Figma')
    .option('--json', 'Output as JSON')
    .action(async (name?: string, opts?: { json?: boolean }) => {
      try {
        const config = requireConfig();
        const fileKey = config.library?.fileKey || config.libraryFileKey;
        if (!fileKey) {
          error('No library configured. Run `desh lib set-library <fileKey>` first.');
          process.exit(1);
        }

        const map = loadComponentMap(config.configDir);
        const entries = name
          ? [[name, map.components[name]] as const].filter(([, v]) => v)
          : Object.entries(map.components);

        if (entries.length === 0) {
          info(name ? `Component "${name}" is not linked.` : 'No linked components. Run `desh components link` first.');
          return;
        }

        // Refresh code variants from source files
        status('Scanning code components...');
        for (const [compName, comp] of entries) {
          const def = scanComponentFile(join(config.configDir, comp.codeFile), 'primitives');
          if (def) {
            comp.codeVariants = def.variants;
          }
        }
        progressDone();

        // Fetch Figma variant info from REST API
        status('Fetching Figma component data...');
        const [components] = await Promise.all([
          getFileComponents(fileKey),
        ]);
        progressDone();

        // Build Figma variant map: for each component set, extract variant values
        // Components in a set are named like "variant=default, size=sm"
        const figmaVariantsBySetName = new Map<string, Record<string, Set<string>>>();
        for (const comp of components) {
          if (!comp.componentSetName) continue;
          if (!figmaVariantsBySetName.has(comp.componentSetName)) {
            figmaVariantsBySetName.set(comp.componentSetName, {});
          }
          const axisMap = figmaVariantsBySetName.get(comp.componentSetName)!;
          // Parse "variant=default, size=sm" format
          for (const part of comp.name.split(',').map(s => s.trim())) {
            const [axis, value] = part.split('=').map(s => s.trim());
            if (axis && value) {
              if (!axisMap[axis]) axisMap[axis] = new Set();
              axisMap[axis].add(value);
            }
          }
        }

        // Run diffs
        const results: Array<{ name: string; diff: ComponentDiffResult }> = [];
        let inSyncCount = 0;
        let diffCount = 0;

        for (const [compName, comp] of entries) {
          // Find Figma variants for this component
          const figmaAxes = figmaVariantsBySetName.get(comp.figmaName);
          const figmaVariants: Record<string, string[]> = {};
          if (figmaAxes) {
            for (const [axis, values] of Object.entries(figmaAxes)) {
              figmaVariants[axis] = Array.from(values);
            }
          }

          // Update stored Figma variants
          comp.figmaVariants = figmaVariants;

          const diff = diffComponent({
            codeVariants: comp.codeVariants,
            figmaVariants,
          });

          results.push({ name: compName, diff });
          if (diff.inSync) inSyncCount++;
          else diffCount++;
        }

        // Save updated map with fresh variant data
        saveComponentMap(config.configDir, map);

        if (opts?.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        for (const { name: n, diff } of results) {
          console.log(formatDiff(n, diff));
          console.log('');
        }

        success(`${diffCount} component(s) with differences, ${inSyncCount} in sync`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
```

- [ ] **Step 2: Register in components.ts**

Add to `src/commands/components.ts`:

```typescript
import { registerComponentDiffCommand } from './component-diff.js';
```

And inside `registerComponentCommands`, add:

```typescript
  registerComponentDiffCommand(comp);
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/commands/component-diff.ts src/commands/components.ts
git commit -m "feat: add components diff command for code ↔ Figma comparison"
```

---

### Task 8: Push Command (`src/commands/component-push.ts`)

**Files:**
- Create: `src/commands/component-push.ts`
- Modify: `src/commands/components.ts` (register)

- [ ] **Step 1: Implement the push command**

Create `src/commands/component-push.ts`:

```typescript
import type { Command } from 'commander';
import { join } from 'path';
import { requireConfig } from '../config.js';
import { loadComponentMap, saveComponentMap } from '../linker/component-map.js';
import { diffComponent } from '../linker/diff.js';
import { scanComponentFile } from '../scanner/components.js';
import { getFileComponents } from '../api/figma-rest.js';
import { runFigmaCode } from '../utils/figma-eval.js';
import { success, error, info, warn, status, progressDone } from '../utils/output.js';

export function registerComponentPushCommand(parent: Command): void {
  parent
    .command('push [name]')
    .description('Push missing variant values from code to Figma library')
    .option('--dry-run', 'Show what would change without modifying Figma')
    .action(async (name?: string, opts?: { dryRun?: boolean }) => {
      try {
        const config = requireConfig();
        const fileKey = config.library?.fileKey || config.libraryFileKey;
        if (!fileKey) {
          error('No library configured. Run `desh lib set-library <fileKey>` first.');
          process.exit(1);
        }

        const map = loadComponentMap(config.configDir);
        const entries = name
          ? [[name, map.components[name]] as const].filter(([, v]) => v)
          : Object.entries(map.components);

        if (entries.length === 0) {
          info(name ? `Component "${name}" is not linked.` : 'No linked components.');
          return;
        }

        // Refresh code variants
        for (const [, comp] of entries) {
          const def = scanComponentFile(join(config.configDir, comp.codeFile), 'primitives');
          if (def) comp.codeVariants = def.variants;
        }

        // Fetch current Figma state
        status('Fetching Figma component data...');
        const components = await getFileComponents(fileKey);
        progressDone();

        // Build Figma variant map
        const figmaVariantsBySetName = new Map<string, Record<string, Set<string>>>();
        for (const comp of components) {
          if (!comp.componentSetName) continue;
          if (!figmaVariantsBySetName.has(comp.componentSetName)) {
            figmaVariantsBySetName.set(comp.componentSetName, {});
          }
          const axisMap = figmaVariantsBySetName.get(comp.componentSetName)!;
          for (const part of comp.name.split(',').map(s => s.trim())) {
            const [axis, value] = part.split('=').map(s => s.trim());
            if (axis && value) {
              if (!axisMap[axis]) axisMap[axis] = new Set();
              axisMap[axis].add(value);
            }
          }
        }

        // Pre-flight: check plugin is connected to the library file
        if (!opts?.dryRun) {
          try {
            const currentFile = await runFigmaCode<string>(`figma.fileKey || figma.root.name`, 5_000);
            // If we can detect the file key and it doesn't match, warn
            if (currentFile && fileKey && !currentFile.includes(fileKey)) {
              warn('Plugin may be connected to the wrong file.');
              warn(`Expected library file (key: ${fileKey}). Open the library file in Figma and run the plugin.`);
            }
          } catch {
            warn('Could not verify plugin connection — make sure the plugin is running in the library file');
          }
        }

        // Find what needs pushing
        let totalPushed = 0;

        for (const [compName, comp] of entries) {
          if (comp.figmaType !== 'COMPONENT_SET') {
            info(`${compName}: structural component — push not applicable`);
            continue;
          }

          const figmaAxes = figmaVariantsBySetName.get(comp.figmaName);
          const figmaVariants: Record<string, string[]> = {};
          if (figmaAxes) {
            for (const [axis, values] of Object.entries(figmaAxes)) {
              figmaVariants[axis] = Array.from(values);
            }
          }

          const diff = diffComponent({ codeVariants: comp.codeVariants, figmaVariants });

          // Collect values to add (code-only)
          const toAdd: Array<{ axis: string; value: string }> = [];
          for (const [axis, axisDiff] of Object.entries(diff.axes)) {
            for (const value of axisDiff.codeOnly) {
              toAdd.push({ axis, value });
            }
          }

          if (toAdd.length === 0) {
            info(`${compName}: already in sync`);
            continue;
          }

          if (opts?.dryRun) {
            for (const { axis, value } of toAdd) {
              console.log(`  ${compName}: would add ${axis}=${value}`);
            }
            totalPushed += toAdd.length;
            continue;
          }

          // Push each missing variant to Figma
          status(`Pushing ${toAdd.length} variant(s) for ${compName}...`);
          const code = `(async () => {
  const componentKey = ${JSON.stringify(comp.figmaKey)};
  const comp = await figma.importComponentSetByKeyAsync(componentKey);
  if (!comp) throw new Error('ComponentSet not found: ' + componentKey);

  const children = comp.children.filter(c => c.type === 'COMPONENT');
  if (children.length === 0) throw new Error('No variants in ComponentSet');

  // Use first variant as template
  const template = children[0];
  const added = [];

  const toAdd = ${JSON.stringify(toAdd)};
  for (const item of toAdd) {
    try {
      const clone = template.clone();
      // Set the variant property
      clone.setProperties({ [item.axis]: item.value });
      comp.appendChild(clone);
      added.push(item.axis + '=' + item.value);
    } catch(e) {
      // Property might not exist yet on the set — skip
    }
  }

  return JSON.stringify({ name: comp.name, added });
})()`;

          try {
            const result = JSON.parse(await runFigmaCode<string>(code, 30_000));
            progressDone();
            for (const a of result.added) {
              console.log(`  ${compName}: added ${a}`);
            }
            totalPushed += result.added.length;
          } catch (err) {
            progressDone();
            warn(`${compName}: push failed — ${(err as Error).message}`);
            warn('Make sure the plugin is running in the library file');
          }
        }

        if (opts?.dryRun) {
          success(`Dry run: ${totalPushed} variant(s) would be added`);
        } else {
          success(`${totalPushed} variant(s) pushed to Figma`);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
```

- [ ] **Step 2: Register in components.ts**

Add import and registration (same pattern as Tasks 6-7).

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/commands/component-push.ts src/commands/components.ts
git commit -m "feat: add components push command for code→Figma variant sync"
```

---

### Task 9: Pull Logic Module and Tests (`src/linker/pull.ts`)

**Files:**
- Create: `src/linker/pull.ts`
- Create: `tests/linker/pull.test.ts`

- [ ] **Step 1: Write failing tests for addVariantToFile**

Create `tests/linker/pull.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { addVariantToSource } from '../../src/linker/pull.js';

describe('addVariantToSource', () => {
  it('adds a variant value to an existing axis', () => {
    const source = `const buttonVariants = cva("base", {
    variants: {
      variant: {
        default: "bg-primary",
        destructive: "bg-destructive",
      },
    },
  });`;
    const result = addVariantToSource(source, 'variant', 'success');
    expect(result).toContain('success: ""');
    expect(result).toContain('destructive: "bg-destructive"');
  });

  it('does not duplicate existing variant', () => {
    const source = `const x = cva("", { variants: { variant: { default: "a", destructive: "b" } } });`;
    const result = addVariantToSource(source, 'variant', 'default');
    expect(result).toBe(source); // unchanged
  });

  it('returns source unchanged when axis not found', () => {
    const source = `const x = cva("", { variants: { size: { sm: "a" } } });`;
    const result = addVariantToSource(source, 'variant', 'new');
    expect(result).toBe(source);
  });

  it('handles multi-line variant values', () => {
    const source = `const x = cva("base", {
    variants: {
      variant: {
        default:
          "bg-primary text-white hover:bg-primary/90",
        destructive:
          "bg-destructive text-white",
      },
    },
  });`;
    const result = addVariantToSource(source, 'variant', 'outline');
    expect(result).toContain('outline: ""');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/linker/pull.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the pull module**

Create `src/linker/pull.ts`:

```typescript
import { readFileSync, writeFileSync } from 'fs';

/**
 * Add a variant value to a cva() source string.
 * Returns the modified source, or the original if the axis wasn't found or value already exists.
 */
export function addVariantToSource(source: string, axis: string, value: string): string {
  // Find the axis block inside variants: { axis: { ... } }
  // Match: axis: { ... existing entries ... }
  const axisPattern = new RegExp(
    `(${axis}:\\s*\\{)([^}]*)(\\})`,
    's'
  );

  const match = source.match(axisPattern);
  if (!match) return source;

  const opening = match[1];
  const body = match[2];
  const closing = match[3];

  // Check if value already exists
  const valuePattern = new RegExp(`\\b${value}\\s*:`);
  if (valuePattern.test(body)) return source;

  // Find indentation from existing entries
  const indentMatch = body.match(/\n(\s+)\w+/);
  const indent = indentMatch ? indentMatch[1] : '        ';

  // Add the new variant value at the end of the block
  const newEntry = `${indent}${value}: "",\n`;
  const updatedBody = body.trimEnd() + '\n' + newEntry + indent.slice(2);

  return source.replace(axisPattern, `${opening}${updatedBody}${closing}`);
}

/**
 * Add a variant value to a cva() call in a TSX file.
 * Returns true if the file was modified.
 */
export function addVariantToFile(filePath: string, axis: string, value: string): boolean {
  const content = readFileSync(filePath, 'utf8');
  const updated = addVariantToSource(content, axis, value);
  if (updated === content) return false;
  writeFileSync(filePath, updated);
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/linker/pull.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/linker/pull.ts tests/linker/pull.test.ts
git commit -m "feat: add pull module with cva variant insertion logic"
```

---

### Task 10: Pull Command (`src/commands/component-pull.ts`)

**Files:**
- Create: `src/commands/component-pull.ts`
- Modify: `src/commands/components.ts` (register)

- [ ] **Step 1: Implement the pull command**

Create `src/commands/component-pull.ts`:

```typescript
import type { Command } from 'commander';
import { join } from 'path';
import { requireConfig } from '../config.js';
import { loadComponentMap } from '../linker/component-map.js';
import { diffComponent } from '../linker/diff.js';
import { addVariantToFile } from '../linker/pull.js';
import { scanComponentFile } from '../scanner/components.js';
import { getFileComponents } from '../api/figma-rest.js';
import { success, error, info, warn, status, progressDone } from '../utils/output.js';

export function registerComponentPullCommand(parent: Command): void {
  parent
    .command('pull [name]')
    .description('Pull missing variant values from Figma to code')
    .option('--dry-run', 'Show what would change without modifying files')
    .action(async (name?: string, opts?: { dryRun?: boolean }) => {
      try {
        const config = requireConfig();
        const fileKey = config.library?.fileKey || config.libraryFileKey;
        if (!fileKey) {
          error('No library configured. Run `desh lib set-library <fileKey>` first.');
          process.exit(1);
        }

        const map = loadComponentMap(config.configDir);
        const entries = name
          ? [[name, map.components[name]] as const].filter(([, v]) => v)
          : Object.entries(map.components);

        if (entries.length === 0) {
          info(name ? `Component "${name}" is not linked.` : 'No linked components.');
          return;
        }

        // Refresh code variants
        for (const [, comp] of entries) {
          const def = scanComponentFile(join(config.configDir, comp.codeFile), 'primitives');
          if (def) comp.codeVariants = def.variants;
        }

        // Fetch Figma state
        status('Fetching Figma component data...');
        const components = await getFileComponents(fileKey);
        progressDone();

        // Build Figma variant map
        const figmaVariantsBySetName = new Map<string, Record<string, Set<string>>>();
        for (const comp of components) {
          if (!comp.componentSetName) continue;
          if (!figmaVariantsBySetName.has(comp.componentSetName)) {
            figmaVariantsBySetName.set(comp.componentSetName, {});
          }
          const axisMap = figmaVariantsBySetName.get(comp.componentSetName)!;
          for (const part of comp.name.split(',').map(s => s.trim())) {
            const [axis, value] = part.split('=').map(s => s.trim());
            if (axis && value) {
              if (!axisMap[axis]) axisMap[axis] = new Set();
              axisMap[axis].add(value);
            }
          }
        }

        let totalPulled = 0;

        for (const [compName, comp] of entries) {
          if (comp.figmaType !== 'COMPONENT_SET') {
            info(`${compName}: structural component — pull not applicable`);
            continue;
          }

          const figmaAxes = figmaVariantsBySetName.get(comp.figmaName);
          const figmaVariants: Record<string, string[]> = {};
          if (figmaAxes) {
            for (const [axis, values] of Object.entries(figmaAxes)) {
              figmaVariants[axis] = Array.from(values);
            }
          }

          const diff = diffComponent({ codeVariants: comp.codeVariants, figmaVariants });

          // Collect Figma-only values
          const toPull: Array<{ axis: string; value: string }> = [];
          for (const [axis, axisDiff] of Object.entries(diff.axes)) {
            for (const value of axisDiff.figmaOnly) {
              toPull.push({ axis, value });
            }
          }

          if (toPull.length === 0) {
            info(`${compName}: already in sync`);
            continue;
          }

          const filePath = join(config.configDir, comp.codeFile);

          for (const { axis, value } of toPull) {
            if (opts?.dryRun) {
              console.log(`  ${compName}: would add ${axis}="${value}" to ${comp.codeFile}`);
              totalPulled++;
              continue;
            }

            const added = addVariantToFile(filePath, axis, value);
            if (added) {
              console.log(`  ${compName}: added ${axis}="${value}" to ${comp.codeFile}`);
              totalPulled++;
            } else {
              warn(`  ${compName}: could not add ${axis}="${value}" — manual edit needed`);
            }
          }
        }

        if (opts?.dryRun) {
          success(`Dry run: ${totalPulled} variant(s) would be added to code`);
        } else {
          success(`${totalPulled} variant(s) pulled from Figma to code`);
          if (totalPulled > 0) {
            info('New variants have empty class strings — add Tailwind classes to style them');
          }
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
```

- [ ] **Step 2: Register in components.ts**

Add import and registration (same pattern).

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/commands/component-pull.ts src/commands/components.ts
git commit -m "feat: add components pull command for Figma→code variant sync"
```

---

### Task 11: Integration Test & Build Verification

**Files:**
- All new files from Tasks 1-9

- [ ] **Step 1: Run all unit tests**

Run: `npx vitest run`
Expected: All tests pass (existing + new linker tests)

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Verify CLI help output**

Run: `node dist/cli.js components --help`
Expected: Shows `link`, `linked`, `unlink`, `diff`, `push`, `pull` alongside existing `list` and `sync`

- [ ] **Step 4: Final commit with all registrations**

```bash
git add -A
git commit -m "feat: complete component linking system — link, diff, push, pull"
```
