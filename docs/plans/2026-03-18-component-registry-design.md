# Component Registry & Instance Pipeline

**Date:** 2026-03-18
**Status:** Approved
**Scope:** Make `desh components push` create real Figma Components that can be instanced

---

## Problem

`desh components push` creates flat, disconnected frames. When an agent later builds a Dashboard, it recreates everything from scratch instead of instancing the pushed primitives. This defeats the purpose of having a component system.

## Vision

Mirror how React frontend development works, but in Figma:

```
React:                                    Figma:
import { Button } from "ui/button"   →   Button instance (from pushed Component)
import { Card } from "ui/card"       →   Card instance (from pushed Component)
<Card><Button>Save</Button></Card>   →   Card instance containing Button instance
```

---

## Architecture

```
desh components push
        │
        ├── 1. Scan .tsx files → ComponentDef[]
        │
        ├── 2. For each primitive:
        │       ├── Generate styled frames from Tailwind classes
        │       ├── Convert to Figma Component (or ComponentSet for cva)
        │       └── Record { name → id, properties } in registry
        │
        └── 3. Save .desh-registry.json

desh render '<Dashboard><Button variant="destructive">Delete</Button></Dashboard>'
        │
        ├── 1. Parse JSX
        ├── 2. For each tag: check registry
        │       ├── Found → createInstance() + setProperties()
        │       └── Not found → create frame (current behavior)
        └── 3. Render to Figma
```

---

## Registry File

`.desh-registry.json` at project root (gitignored):

```json
{
  "version": 1,
  "pushedAt": "2026-03-18T12:00:00Z",
  "figmaFileKey": "abc123",
  "pageId": "1:2",
  "components": {
    "Button": {
      "nodeId": "1:234",
      "type": "COMPONENT_SET",
      "properties": {
        "variant": "variant#1:0",
        "size": "size#1:1"
      },
      "defaultVariant": {
        "variant": "default",
        "size": "default"
      }
    },
    "Card": {
      "nodeId": "1:300",
      "type": "COMPONENT",
      "children": ["CardHeader", "CardTitle", "CardDescription", "CardContent", "CardFooter"]
    },
    "Input": {
      "nodeId": "1:350",
      "type": "COMPONENT"
    }
  }
}
```

Fields:
- `figmaFileKey` — validates registry matches the open file
- `pageId` — which page the components were pushed to
- `properties` — maps clean prop names to Figma's `name#uniqueId` format
- `defaultVariant` — default variant values for instancing
- `children` — sub-component names (for structural components)

---

## Phase 1: Push Primitives as Real Figma Components

### cva Components (Button, Badge, Toggle, Alert, Sidebar)

For each variant combination:
1. Create a frame with Tailwind classes → Figma properties (existing translator)
2. Add text label with variant value
3. Bind fills/strokes to Figma variables via `var:` syntax

Then:
4. Convert each variant frame to a Component via `createComponentFromNode()`
5. Combine all variants via `combineAsVariants(components, page)` → ComponentSet
6. Read back `componentPropertyDefinitions` to get the `name#id` mappings
7. Store in registry

Example — Button with `variant: [default, destructive, outline, ghost]` and `size: [sm, default, lg]`:
- Creates 4 Component frames (one per primary variant — not full matrix to avoid explosion)
- Named `Button/default`, `Button/destructive`, `Button/outline`, `Button/ghost`
- Combined into a ComponentSet named "Button"
- Figma automatically creates a `variant` property

### Structural Components (Card, Dialog, Sheet, Input, Select)

1. Create outer frame with `cn()` classes applied (border, radius, bg, shadow)
2. Create child frames for each sub-component (CardHeader, CardContent, etc.)
3. Each child frame gets basic styling from its `cn()` classes
4. Convert to a single Component via `createComponentFromNode()`
5. Store in registry with children list

### Technical Constraints

- `createComponentFromNode()` — node must NOT be inside another Component/ComponentSet/Instance. Create at page level first.
- `combineAsVariants()` — all children must already be Components. Convert individually first, then combine.
- `layoutSizingHorizontal = 'FILL'` — must be set AFTER `appendChild()`.
- Variant naming: use `ComponentName/variantValue` format. Figma derives property names from the `/` convention.

---

## Phase 2: Instance Pipeline

### Registry Lookup in JSX Renderer

When `generateJsFromJsx()` encounters a tag like `<Button>`:

1. Load `.desh-registry.json`
2. Check if "Button" exists in `components`
3. If yes:
   - Read `nodeId` → `figma.getNodeByIdAsync(nodeId)`
   - Validate it still exists (stale check)
   - Call `component.createInstance()`
   - Map JSX props to Figma variant properties using `properties` mapping
   - For text content: find TEXT child via `instance.findOne(n => n.type === 'TEXT')`
4. If no (or stale): fall back to current behavior (create frame)

### Setting Variant Properties

```javascript
// Read property definitions to get the #id suffix
const defs = componentSet.componentPropertyDefinitions;
// defs = { "variant#1:0": { type: "VARIANT", ... }, "size#1:1": { type: "VARIANT", ... } }

// Create instance from the default variant
const instance = componentSet.defaultVariant.createInstance();

// Set properties using the #id keys from registry
instance.setProperties({ "variant#1:0": "destructive" });
```

### Setting Text Inside Instances

```javascript
// Find the text node inside the instance
const textNode = instance.findOne(n => n.type === 'TEXT');
if (textNode) {
  await figma.loadFontAsync(textNode.fontName);
  textNode.characters = 'Delete';
}
```

---

## Phase 3: Agent Workflow

After `desh sync` (which pushes tokens + components):

```bash
# Agent creates a dashboard using pushed components
desh render '<Frame name="Dashboard" w={1440} h={900} flex="row" bg="var:background">
  <Sidebar />
  <Frame name="Main" flex="col" grow={1} gap={24} p={24}>
    <Frame flex="row" gap={16}>
      <Card w={300}>
        <CardHeader><Text>Revenue</Text></CardHeader>
        <CardContent><Text size={32} weight="bold">$45,231</Text></CardContent>
      </Card>
      <Card w={300}>
        <CardHeader><Text>Users</Text></CardHeader>
        <CardContent><Text size={32} weight="bold">2,350</Text></CardContent>
      </Card>
    </Frame>
    <Frame flex="row" gap={8}>
      <Button variant="default">Export</Button>
      <Button variant="outline">Filter</Button>
      <Button variant="destructive">Delete</Button>
    </Frame>
  </Frame>
</Frame>'
```

The renderer:
- `<Sidebar>` → looks up registry → creates Sidebar instance
- `<Card>` → creates Card instance → populates CardHeader/CardContent children
- `<Button variant="default">Export</Button>` → creates Button instance → sets variant property → sets text to "Export"
- Unknown tags → falls back to creating frames (current behavior)

---

## Stale Registry Handling

The registry can become stale when:
- Components are deleted in Figma
- The Figma file changes
- The page changes

Mitigation:
1. On every use, validate `figmaFileKey` matches the open file
2. On instance creation, validate `getNodeByIdAsync(nodeId)` returns non-null
3. If stale: warn "Component registry is stale. Run `desh components push` to rebuild."
4. Fall back to frame creation (current behavior)

---

## File Changes

| File | Change |
|------|--------|
| `src/codegen/components.ts` | Rewrite: generate real Figma Component/ComponentSet creation code |
| `src/commands/components.ts` | Update push to save registry after creation |
| `src/codegen/jsx.ts` | Add registry lookup before creating frames |
| `src/config.ts` | Add `loadRegistry()` / `saveRegistry()` |
| `.gitignore` | Add `.desh-registry.json` |

---

## Out of Scope

- Syncing changes back from Figma → code
- Nested instance composition beyond 1 level (instances inside instances)
- Auto-layout overrides on instances
- Icon components (handled separately via Iconify)
