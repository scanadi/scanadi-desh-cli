# Component Linking & Bidirectional Sync

## Problem

The current `desh components push` recreates every component from scratch by parsing cva() classes and generating Figma frames. This produces broken, low-fidelity approximations that don't match the real design system. The project already has a professional Figma library with properly designed shadcn/ui components — the tool should link to it, not replace it.

## Goals

1. Auto-discover linked Figma library during `desh init`
2. Link code components to existing Figma library components by name
3. Diff variant metadata between code and Figma
4. Sync structural changes per-component in either direction (code→Figma, Figma→code)
5. Never recreate components from scratch — preserve the professional Figma designs

## Non-Goals

- Converting Tailwind classes to Figma visual styles (tokens sync handles colors/spacing)
- Recreating component visuals in Figma
- Syncing hover states, animations, or pseudo-selectors
- Replacing the existing bulk push (it stays for projects without a library)

---

## 1. Library Discovery & Config

### During `desh init`

After scanning for tokens and components, discover linked Figma libraries:

1. Run `figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync()` to find linked libraries
2. Scan pages for remote component instances to identify library file keys via `mainComponent.remote` and `mainComponent.key`
3. Use REST API `getFileInfo(fileKey)` to get the library file name
4. Store in `desh.config.json`:

```json
{
  "tokens": ["packages/ui/styles/tailwind.css"],
  "primitives": "packages/ui/components",
  "components": ["apps/web/components"],
  "library": {
    "fileKey": "abc123...",
    "name": "LevelUp Design System"
  }
}
```

### Fallback

If no library auto-detected (plugin not connected, no instances on canvas):
- `desh init` skips library detection with a warning
- User can manually set: `desh lib set-library <fileKey>`

### Implementation

Modify `scanProject()` in `src/scanner/project.ts` to return library info. Add a new `discoverLibrary()` function that runs Figma plugin code to find remote component sources. The init command calls this after the file scan when the plugin is connected.

---

## 2. Component Linking

### Map File: `.desh-component-map.json`

```json
{
  "version": 1,
  "linkedAt": "2026-03-19T...",
  "libraryFileKey": "abc123...",
  "components": {
    "Button": {
      "codeFile": "packages/ui/components/button.tsx",
      "figmaKey": "abc123def456",
      "figmaName": "Button",
      "figmaType": "COMPONENT_SET",
      "codeVariants": {
        "variant": ["default", "destructive", "outline", "secondary", "ghost", "link", "success", "info", "subtle"],
        "size": ["default", "xs", "sm", "lg", "icon", "icon-sm", "icon-lg"]
      },
      "figmaVariants": {
        "variant": ["default", "destructive", "outline", "secondary", "ghost", "link"],
        "size": ["default", "sm", "lg", "icon"]
      }
    }
  }
}
```

### Auto-Linking Algorithm

1. Scan code components using existing `scanComponentFile()` — get names and variants
2. Fetch Figma library components via REST API `getFileComponents(fileKey)` + `getFileComponentSets(fileKey)`
3. Match by name:
   - Exact match (case-insensitive): `Button` → `Button`
   - PascalCase to spaced: `RadioGroup` → `Radio Group`
   - Strip common prefixes: `UI/Button` → `Button`
4. For matched COMPONENT_SET types, extract Figma variant axes from `componentPropertyDefinitions`
5. Store mapping in `.desh-component-map.json`

### Commands

```bash
desh components link              # Auto-link all by name matching
desh components link --dry-run    # Show what would be linked without writing
desh components link Button       # Link specific component (prompts if ambiguous)
desh components link Button <key> # Link with explicit Figma component key
desh components unlink Button     # Remove link for a component
desh components linked            # Show all linked components
```

### Implementation

New files:
- `src/commands/component-link.ts` — link/unlink commands
- `src/linker/component-map.ts` — load/save/query the map file
- `src/linker/match.ts` — name matching algorithm

---

## 3. Diff / Compare

### Command

```bash
desh components diff              # Diff all linked components
desh components diff Button       # Diff specific component
desh components diff --json       # Machine-readable output
```

### What It Compares

For variant components (COMPONENT_SET):
- Variant axes present in code vs Figma
- Variant values per axis: which exist on each side, which are missing
- Default variant values

For structural components (COMPONENT):
- Sub-component names (CardHeader, CardContent, etc.)
- Exported names from code vs child components in Figma

### Output Format

```
Button:
  ✓ variant: default, destructive, outline, secondary, ghost, link — match
  + variant: success, info, subtle — in code, missing in Figma
  ✓ size: default, sm, lg, icon — match
  + size: xs, icon-sm, icon-lg — in code, missing in Figma

Card:
  ✓ CardHeader, CardContent, CardFooter — match
  = No differences

Summary: 2 components with differences, 1 in sync
```

### Implementation

- `src/commands/component-diff.ts` — diff command
- `src/linker/diff.ts` — pure diff logic (code variants vs figma variants)

The diff reads the component map, re-scans code components for current variants, fetches Figma component properties via REST API, and compares.

---

## 4. Bidirectional Sync

### Code → Figma Push

```bash
desh components push Button       # Push Button changes to Figma library
desh components push              # Push all diffs
desh components push --dry-run    # Show what would change
```

**What it does:**
- For variant components: adds missing variant entries to the existing Figma ComponentSet
- Duplicates the default variant component, renames it with the new variant value
- Does NOT set visual styles — the designer fills those in

**Requires:** Plugin running in the library file. Desh detects which file the plugin is connected to and prompts if it's the wrong file.

**Flow:**
1. Run diff to find what's missing in Figma
2. For each missing variant value, generate Figma plugin code that:
   - Finds the ComponentSet by key
   - Duplicates the default variant component
   - Sets the variant property value on the duplicate
   - Adds it to the set
3. Update the component map with new Figma state

### Figma → Code Pull

```bash
desh components pull Button       # Pull Button changes to code
desh components pull              # Pull all diffs
desh components pull --dry-run    # Show what would change
```

**What it does:**
- For variant components: adds missing variant values to the cva() config
- New variants get empty/placeholder Tailwind classes with a TODO comment
- For removed variants in Figma: warns but does NOT auto-delete from code

**Flow:**
1. Run diff to find what's missing in code
2. For each missing variant value:
   - Parse the component TSX file using ts-morph
   - Find the cva() call
   - Add the new variant value with placeholder: `"newVariant": "/* TODO: add styles */"`
3. Update the component map

### Implementation

- `src/commands/component-push.ts` — push command
- `src/commands/component-pull.ts` — pull command
- `src/linker/push.ts` — Figma codegen for adding variants to existing ComponentSets
- `src/linker/pull.ts` — TSX modification logic for adding variant values to cva()

---

## 5. File Context Switching

The plugin can only control one Figma file at a time. For operations that need the library file:

1. **Read operations** (diff, list): Use REST API — no plugin needed in library file
2. **Write operations** (push to Figma): Require plugin in library file

When push is invoked and plugin is connected to the wrong file:
```
⚠ Plugin is connected to "LevelUp App" but push targets "LevelUp Design System"
  Open the library file in Figma and run the plugin, then retry.
```

Future enhancement: auto-switch support if Figma allows multi-file plugin connections.

---

## 6. Command Summary

| Command | Description | Needs Plugin? |
|---------|-------------|---------------|
| `desh components link` | Auto-link code ↔ Figma by name | No (REST API) |
| `desh components linked` | Show linked components | No (reads map file) |
| `desh components unlink <name>` | Remove a link | No |
| `desh components diff` | Compare code vs Figma variants | No (REST API) |
| `desh components push [name]` | Push missing variants to Figma | Yes (library file) |
| `desh components pull [name]` | Pull missing variants to code | No (REST API) |

---

## 7. Migration

The existing `desh components sync` (bulk push) stays as-is for projects that don't have a Figma library. The new linking system is opt-in — activated when `library` is present in `desh.config.json`.

The `Component Push from code` page in the current Figma file can be deleted manually by the user once linking is set up.
