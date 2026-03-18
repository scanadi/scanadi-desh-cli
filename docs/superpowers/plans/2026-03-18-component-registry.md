# Component Registry & Instance Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `desh components push` create real Figma Components/ComponentSets that can be instanced by the JSX renderer, mirroring how React imports work.

**Architecture:** Push creates Figma Components, saves a registry mapping `name → nodeId + properties`. The JSX renderer checks the registry before creating frames — if a tag name matches a registered component, it creates an instance instead. Variant properties are set via Figma's `setProperties()` API using the `name#id` keys stored in the registry.

**Tech Stack:** TypeScript, Figma Plugin API (createComponentFromNode, combineAsVariants, createInstance, setProperties), existing desh infrastructure (CDP client, JSX renderer, Tailwind translator)

**Spec:** `docs/plans/2026-03-18-component-registry-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/registry.ts` | **New.** Load/save/validate `.desh-registry.json`. Registry types. |
| `src/codegen/components.ts` | **Rewrite.** Generate JS that creates real Figma Components + ComponentSets. Return node IDs + property mappings. |
| `src/commands/components.ts` | **Modify.** `push` saves registry after creation. |
| `src/codegen/jsx.ts` | **Modify.** Check registry before creating frames. Instance creation path. |
| `tests/registry.test.ts` | **New.** Registry load/save/validate tests. |
| `tests/codegen/components.test.ts` | **New.** Component JS generation tests. |
| `.gitignore` | **Modify.** Add `.desh-registry.json`. |

---

## Task 1: Registry module

**Files:**
- Create: `src/registry.ts`
- Create: `tests/registry.test.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/registry.test.ts
import { describe, it, expect } from 'vitest';
import { parseRegistry, serializeRegistry, validateEntry, type ComponentRegistry } from '../src/registry.js';

describe('registry', () => {
  it('parses valid registry JSON', () => {
    const raw = {
      version: 1,
      pushedAt: '2026-03-18T12:00:00Z',
      figmaFileKey: 'abc123',
      pageId: '1:2',
      components: {
        Button: {
          nodeId: '1:234',
          type: 'COMPONENT_SET',
          properties: { variant: 'variant#1:0', size: 'size#1:1' },
          defaultVariant: { variant: 'default', size: 'default' },
        },
        Card: {
          nodeId: '1:300',
          type: 'COMPONENT',
          children: ['CardHeader', 'CardContent'],
        },
      },
    };
    const reg = parseRegistry(JSON.stringify(raw));
    expect(reg.components.Button.nodeId).toBe('1:234');
    expect(reg.components.Button.type).toBe('COMPONENT_SET');
    expect(reg.components.Card.children).toContain('CardHeader');
  });

  it('serializes registry to JSON', () => {
    const reg: ComponentRegistry = {
      version: 1,
      pushedAt: '2026-03-18T12:00:00Z',
      figmaFileKey: 'abc',
      pageId: '1:2',
      components: {},
    };
    const json = serializeRegistry(reg);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
  });

  it('validates entry has required fields', () => {
    expect(validateEntry({ nodeId: '1:1', type: 'COMPONENT' })).toBe(true);
    expect(validateEntry({ nodeId: '', type: 'COMPONENT' })).toBe(false);
    expect(validateEntry({})).toBe(false);
  });

  it('returns empty registry for invalid JSON', () => {
    const reg = parseRegistry('not json');
    expect(reg.components).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/registry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement registry module**

```typescript
// src/registry.ts
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface RegistryEntry {
  nodeId: string;
  type: 'COMPONENT' | 'COMPONENT_SET';
  properties?: Record<string, string>;    // clean name → "name#uniqueId"
  defaultVariant?: Record<string, string>; // clean name → default value
  children?: string[];                     // sub-component names
}

export interface ComponentRegistry {
  version: number;
  pushedAt: string;
  figmaFileKey: string;
  pageId: string;
  components: Record<string, RegistryEntry>;
}

export function parseRegistry(json: string): ComponentRegistry {
  try {
    const raw = JSON.parse(json);
    if (!raw || raw.version !== 1) throw new Error('Invalid version');
    return raw as ComponentRegistry;
  } catch {
    return { version: 1, pushedAt: '', figmaFileKey: '', pageId: '', components: {} };
  }
}

export function serializeRegistry(reg: ComponentRegistry): string {
  return JSON.stringify(reg, null, 2);
}

export function validateEntry(entry: Record<string, unknown>): boolean {
  return typeof entry.nodeId === 'string' && entry.nodeId.length > 0 &&
         typeof entry.type === 'string' && (entry.type === 'COMPONENT' || entry.type === 'COMPONENT_SET');
}

export function loadRegistry(projectDir: string): ComponentRegistry {
  const path = join(projectDir, '.desh-registry.json');
  if (!existsSync(path)) {
    return { version: 1, pushedAt: '', figmaFileKey: '', pageId: '', components: {} };
  }
  return parseRegistry(readFileSync(path, 'utf8'));
}

export function saveRegistry(projectDir: string, reg: ComponentRegistry): void {
  const path = join(projectDir, '.desh-registry.json');
  writeFileSync(path, serializeRegistry(reg) + '\n');
}

export function getRegistryEntry(reg: ComponentRegistry, name: string): RegistryEntry | null {
  // Try exact match first
  if (reg.components[name]) return reg.components[name];

  // Try PascalCase conversion (button → Button)
  const pascal = name.charAt(0).toUpperCase() + name.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  if (reg.components[pascal]) return reg.components[pascal];

  // Try as sub-component (CardHeader → look inside Card's children)
  for (const [, entry] of Object.entries(reg.components)) {
    if (entry.children?.includes(name)) return entry;
  }

  return null;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/registry.test.ts
```

Expected: PASS

- [ ] **Step 5: Add `.desh-registry.json` to .gitignore**

Append `.desh-registry.json` to `/Users/stevicacanadi/projects/figma-cli/.gitignore`.

- [ ] **Step 6: Commit**

```bash
git add src/registry.ts tests/registry.test.ts .gitignore
git commit -m "feat: add component registry module"
```

---

## Task 2: Rewrite component codegen for real Figma Components

**Files:**
- Rewrite: `src/codegen/components.ts`

This is the core task. The codegen must produce JS that:
1. Creates styled frames from Tailwind classes
2. Converts them to Figma Components
3. For cva components: combines into ComponentSets
4. Returns node IDs and property mappings for the registry

- [ ] **Step 1: Implement cva component codegen**

Generate JS for a single cva component that:
- Creates one frame per variant value (primary axis only — e.g., `variant: [default, destructive, outline, ghost]`)
- Names them `ComponentName/variantValue` (Figma derives variant properties from `/` naming)
- Applies Tailwind classes via the existing translator for fills, padding, radius, layout
- Binds to Figma variables where possible (`bg-primary` → `var:primary`)
- Adds a text label inside each variant frame
- Converts each frame to Component via `createComponentFromNode()`
- Combines via `combineAsVariants()`
- Reads `componentPropertyDefinitions` to extract `name#id` mappings
- Returns `{ nodeId, type: 'COMPONENT_SET', properties: {...}, defaultVariant: {...} }`

The generated JS must:
- Load fonts first (`Inter` Regular, Medium, Semi Bold, Bold)
- Load variables for `var:` binding
- Position using smart positioning (right of existing content)
- Create frames at page level (NOT inside other frames — `createComponentFromNode` constraint)
- Use `try/catch` around `combineAsVariants` (fails if only 1 variant)

- [ ] **Step 2: Implement structural component codegen**

Generate JS for a single structural component that:
- Creates outer frame with `cn()` classes applied (border, radius, bg, shadow)
- Creates child frames for each sub-component (CardHeader, CardContent, etc.)
- Each child gets placeholder styling (muted bg, label text)
- Converts to Component via `createComponentFromNode()`
- Returns `{ nodeId, type: 'COMPONENT', children: [...] }`

- [ ] **Step 3: Export functions**

The module should export:
- `generateComponentPushJs(comp: ComponentDef): string` — returns JS for one component
- `generatePreambleJs(): string` — load fonts, init variables, smart positioning

Each function returns a self-contained async IIFE that returns a JSON string with the result.

- [ ] **Step 4: Build and verify**

```bash
bun run build
```

- [ ] **Step 5: Commit**

```bash
git add src/codegen/components.ts
git commit -m "feat: component codegen creates real Figma Components and ComponentSets"
```

---

## Task 3: Update push command to save registry

**Files:**
- Modify: `src/commands/components.ts`

- [ ] **Step 1: Update push command**

After pushing each component to Figma:
1. Parse the returned JSON (nodeId, type, properties)
2. Build a `RegistryEntry`
3. After all components are pushed, call `saveRegistry()`

The push flow becomes:
```
for each component:
  js = generateComponentPushJs(comp)
  result = await runFigmaCode(js)  // returns { nodeId, type, properties, ... }
  registry.components[name] = result
saveRegistry(configDir, registry)
```

Before pushing, get the Figma file key and page ID:
```javascript
const fileInfo = await runFigmaCode('JSON.stringify({ fileKey: figma.fileKey, pageId: figma.currentPage.id })');
```

- [ ] **Step 2: Add registry info to push output**

After push completes, show:
```
✓ Pushed 52 components (6 sets, 46 components)
✓ Registry saved to .desh-registry.json
```

- [ ] **Step 3: Build and manual test**

```bash
bun run build
cd /path/to/project && desh components push
cat .desh-registry.json  # verify registry was created
```

- [ ] **Step 4: Commit**

```bash
git add src/commands/components.ts
git commit -m "feat: components push saves registry with Figma node IDs"
```

---

## Task 4: JSX renderer reads registry for instancing

**Files:**
- Modify: `src/codegen/jsx.ts`

This is the key integration point. When the JSX renderer encounters a tag name that matches the registry, it creates an instance instead of a frame.

- [ ] **Step 1: Add registry loading to JSX codegen**

At the top of `generateJsFromJsx()`:
1. Try to load `.desh-registry.json` from cwd
2. If it exists and has entries, embed it as a lookup table in the generated JS
3. The generated JS checks each element name against the registry

- [ ] **Step 2: Add instance creation path in generated JS**

In the generated JS, before creating a frame for a child element:
```javascript
// Check registry
const regEntry = __registry['Button'];
if (regEntry) {
  const compNode = await figma.getNodeByIdAsync(regEntry.nodeId);
  if (compNode) {
    // Create instance
    let instance;
    if (compNode.type === 'COMPONENT_SET') {
      instance = compNode.defaultVariant.createInstance();
      // Set variant properties from JSX props
      const propsToSet = {};
      for (const [propName, figmaKey] of Object.entries(regEntry.properties || {})) {
        if (elementProps[propName]) {
          propsToSet[figmaKey] = elementProps[propName];
        }
      }
      if (Object.keys(propsToSet).length > 0) {
        instance.setProperties(propsToSet);
      }
    } else if (compNode.type === 'COMPONENT') {
      instance = compNode.createInstance();
    }

    // Set text content if present
    if (textContent && instance) {
      const textNode = instance.findOne(n => n.type === 'TEXT');
      if (textNode) {
        await figma.loadFontAsync(textNode.fontName);
        textNode.characters = textContent;
      }
    }

    // Position and append
    parent.appendChild(instance);
    instance.layoutSizingHorizontal = 'FILL'; // or as specified
  }
}
```

- [ ] **Step 3: Handle stale registry gracefully**

If `getNodeByIdAsync` returns null:
- Log a warning (not an error)
- Fall back to creating a frame (current behavior)
- The component still renders, just not as an instance

- [ ] **Step 4: Build and test**

```bash
bun run build
# Push components first
cd /path/to/project && desh components push
# Then render using component names
desh render '<Button variant="destructive">Delete</Button>'
# Verify it created an instance, not a frame
desh eval "figma.currentPage.selection[0]?.type"  # should be "INSTANCE"
```

- [ ] **Step 5: Commit**

```bash
git add src/codegen/jsx.ts
git commit -m "feat: JSX renderer creates instances from registry instead of frames"
```

---

## Task 5: Update sync command

**Files:**
- Modify: `src/commands/sync.ts`

- [ ] **Step 1: Update sync to use new push + registry**

The `desh sync` command should:
1. Push tokens (existing)
2. Push components using the new registry-aware push
3. Save registry
4. Report results

- [ ] **Step 2: Build and test end-to-end**

```bash
bun run build
cd /path/to/project
desh sync
# Verify: tokens synced, components pushed, registry saved
cat .desh-registry.json
# Verify: render uses instances
desh render '<Card><CardHeader><Text>Test</Text></CardHeader></Card>'
desh eval "figma.currentPage.children[figma.currentPage.children.length-1].type"  # should be INSTANCE or contain instances
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/sync.ts
git commit -m "feat: sync command uses registry-aware component push"
```

---

## Task 6: Update skill + docs

**Files:**
- Modify: `skills/desh/SKILL.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update desh skill**

Add to the skill:
- Document the registry concept
- Update the "Phase 2: Bridge the Gaps" section
- Add `desh components push` → creates real Figma Components
- Add that `desh render '<Button>...'` auto-instances if registry exists

- [ ] **Step 2: Update CLAUDE.md**

Add component push + registry workflow to quick reference.

- [ ] **Step 3: Commit**

```bash
git add skills/desh/SKILL.md CLAUDE.md
git commit -m "docs: update skill and CLAUDE.md with component registry workflow"
```
