---
name: desh
description: |
  Use this skill whenever the user wants to work with Figma — creating designs, syncing tokens, rendering components, managing variables, exporting assets, or controlling Figma Desktop in any way. desh (Design Shell) is a CLI that controls Figma Desktop directly via Chrome DevTools Protocol, requiring no API key. Use this skill when: user mentions Figma, design systems, creating UI components, syncing design tokens, managing Figma variables, exporting from Figma, accessibility audits on designs, rendering JSX to Figma, or any design-to-code / code-to-design workflow. Even if the user doesn't say "desh" explicitly — if they want anything done in Figma, this is the skill to use.
---

# desh — Design Shell

CLI that controls Figma Desktop directly via CDP. No API key needed. Each command connects, executes, disconnects.

## THE GOLDEN RULE: Explore First, Then Act

Before creating ANYTHING in Figma, you must understand what already exists — both in the codebase AND in Figma. The biggest mistake is building from scratch when components, tokens, and layouts already exist.

**Every task starts with discovery. No exceptions.**

---

## Phase 1: Discover What Exists

### In the Codebase

```bash
# What tokens does the project define?
cat packages/ui/styles/globals.css   # or wherever the CSS lives
# Look for @theme {}, :root {}, .dark {} blocks

# What components exist?
ls packages/ui/src/components/       # shadcn primitives
ls apps/web/src/components/          # app-level components

# What's the project structure?
desh init                            # auto-detects and shows findings
cat desh.config.json                 # if it exists already
```

### In Figma

```bash
desh connect                         # ensure connection

# What pages exist in this file?
desh pages list

# What's on the current page?
desh canvas info

# What libraries are connected?
desh lib list
desh lib collections                 # shows collection names + keys

# What variables exist in each library collection?
desh lib vars "Theme"                # by name
desh lib vars "f29e774..."           # or by key from collections output

# What local variables exist?
desh var list

# What's the node structure?
desh node tree                       # current page top-level
desh node tree "1:234" -d 3          # specific node, 3 levels deep

# Switch to another page to explore
desh pages switch "Portfolio"
desh canvas info
```

### Build the Mental Model

After discovery, you should know:
1. **Token source of truth** — does the project have CSS tokens (@theme/:root/.dark)? Does the Figma file have library variables? Both?
2. **Component source of truth** — are components defined in code (cva/tsx)? In a Figma library? Both?
3. **What's already in Figma** — existing pages, layouts, component instances, variable collections
4. **What's missing** — gaps between code and Figma that need bridging

---

## Phase 2: Bridge the Gaps

Based on what you discovered, choose the right approach:

### Scenario A: Figma has a design system library, code has tokens
The library is the component source of truth. Code tokens may need syncing.

```bash
# Check if library variables match code tokens
desh lib vars "Theme"                # what Figma has
desh tokens sync                     # what code has → creates "semantic" collection

# Use library components, not JSX rendering
desh lib instance "Button"           # instantiate from library
desh lib instance "DataTable"        # use existing components
```

### Scenario B: Code has components, Figma is empty
Code is the source of truth. Push everything to Figma.

```bash
desh init                            # generate desh.config.json
desh sync                            # push tokens + components to Figma
desh components list                 # verify what was discovered
cat .desh-registry.json              # verify registry was saved
```

After `desh sync` or `desh components push`:
- **cva components** (Button, Badge, Toggle) become **Figma ComponentSets** with variant properties
- **Structural components** (Card, Dialog, Input) become **Figma Components** with sub-component children
- A **registry** (`.desh-registry.json`) maps component names → Figma node IDs

Now when you `desh render`, component names auto-instance from the registry:
```bash
# These create INSTANCES of the pushed components, not new frames:
desh render '<Frame name="Page" w={1440} flex="col">
  <Button variant="destructive">Delete</Button>
  <Card>
    <CardHeader><Text>Title</Text></CardHeader>
  </Card>
</Frame>'
```

### Scenario C: Both have partial overlap
Most common case. Explore both, identify gaps, bridge them.

```bash
# Sync tokens from code (won't overwrite library variables)
desh tokens sync

# Push code components (creates Figma Components + registry)
desh components push

# For layouts: render with component names → auto-instances from registry
# Unknown tags fall back to frames (existing behavior)
```

---

## Phase 3: Create or Modify

Now — and only now — create new things. Choose the right tool:

### Decision Tree: How to Create

```
Need to create a layout?
├── Does a library component exist? (checked in Phase 1)
│   ├── YES → desh lib instance "ComponentName"
│   └── NO → Were components pushed? (check .desh-registry.json)
│       ├── YES → desh render '<ComponentName variant="..." />'  (auto-instances!)
│       └── NO → desh components push first, then render
│           └── Still no? → desh render '<Frame ...>custom JSX</Frame>'
│
Need to modify existing nodes?
├── desh set fill/stroke/radius/size/opacity
├── desh bind fill "variable-name"
│
Need to create variables?
├── From code → desh tokens sync
├── Manual → desh var create "name" -t COLOR -v "#fff"
├── Batch → desh var create-batch '[...]'
```

### Using Library Components (ALWAYS FIRST CHOICE)

Before creating ANY UI element, search the library. This is not optional — hand-building components that exist in the library is the #1 mistake.

```bash
# Step 1: Find the library file key (from the library file URL or via eval)
desh eval "figma.fileKey"            # if library file is open

# Step 2: Search for the component you need
desh lib search "Button" --file "AHtWZ4s34EqfhXcql7Scsu"
desh lib search "Badge" --file "AHtWZ4s34EqfhXcql7Scsu"
desh lib search "Sidebar" --file "AHtWZ4s34EqfhXcql7Scsu"

# Step 3: Instance by key
desh lib instance "a55737eabe750668dd06f889038154ca893b9abb"

# Or import everything for a smaller library
desh lib import-all "AHtWZ4s34EqfhXcql7Scsu" --dry-run  # preview
desh lib import-all "AHtWZ4s34EqfhXcql7Scsu"             # import all

# Or find components from existing instances in the file
desh lib components                  # scans current page
desh lib components --all-pages      # scans entire file
```

**API Token:** Set `FIGMA_API_TOKEN` in `.env.local` for REST API features (search, import-all). Get token at https://www.figma.com/developers/api#access-tokens

**Store the library file key** in `desh.config.json` so you don't repeat it:
```json
{
  "libraryFileKey": "AHtWZ4s34EqfhXcql7Scsu"
}
```

### Using JSX Render (When No Library Component Exists)

Only use `desh render` for custom compositions that don't exist as library components:

```bash
desh render '<Frame name="CustomPanel" w={400} flex="col" bg="var:card" p={24} gap={16}>
  <Text size={18} weight="bold" color="var:foreground" w="fill">Title</Text>
  <Text size={14} color="var:muted-foreground" w="fill">Description</Text>
</Frame>'
```

### Composing Layouts

For full page layouts, combine library components with custom framing:

```bash
# Create the page frame
desh render '<Frame name="Dashboard" w={1440} h={900} flex="row" bg="var:background">
  <Frame name="Sidebar-Container" w={256} h="fill" />
  <Frame name="Main" grow={1} flex="col">
    <Frame name="Header" w="fill" h={56} />
    <Frame name="Content" w="fill" grow={1} />
  </Frame>
</Frame>'

# Then populate with library component instances inside each container
desh lib instance "Sidebar"
# Move it into the Sidebar-Container frame, etc.
```

---

## Connection & Setup

```bash
desh connect                         # Patch Figma once, verify CDP
```

If permission error on macOS: System Settings → Privacy & Security → Full Disk Access → add Terminal → restart terminal.

If Figma was updated: quit Figma, run `desh connect` again (re-patches automatically).

If Figma is running but CDP fails: `desh connect` detects this and restarts Figma with the debug port.

### Project Setup (for codebase-aware features)

```bash
desh init                            # Scans project, generates desh.config.json
desh sync                            # Syncs tokens + components to Figma
```

`desh.config.json`:
```json
{
  "tokens": ["packages/ui/globals.css"],
  "primitives": "packages/ui/src/components",
  "components": ["apps/web/src/components"]
}
```

You can write this manually if `desh init` doesn't detect your files. Any CSS file path works — the name doesn't have to be `globals.css`.

---

## Page Navigation

```bash
desh pages list                      # All pages with node counts, ◄ = current
desh pages switch "Portfolio"        # Switch by name (partial match)
```

---

## JSX Render Reference

### Tags
`<Frame>`, `<Text>`, `<Icon>`, `<Slot>`, `<Rectangle>`, `<Ellipse>`, `<Line>`, `<Image>`

### Props
```
flex="row" | "col"          gap={16}             wrap={true}
p={24}  px={16}  py={8}    pt={8} pr={16} pb={8} pl={16}
justify="center" | "end" | "between"
items="center" | "end"
grow={1}                    stretch={true}

w={320}  h={200}            w="fill"  h="fill"
minW={100}  maxW={500}      minH={50}  maxH={300}

bg="#fff"                   bg="var:card"
stroke="#000"               stroke="var:border"
strokeWidth={2}             strokeAlign="inside"
opacity={0.8}               rounded={16}
roundedTL={8}               cornerSmoothing={0.6}
shadow="4px 4px 12px rgba(0,0,0,0.25)"
blur={8}                    overflow="hidden"
rotate={45}                 blendMode="multiply"
position="absolute" x={12} y={12}
```

### Text
```jsx
<Text size={18} weight="bold" color="#fff" font="Inter" w="fill">Hello</Text>
<Text color="var:foreground" align="center">Centered</Text>
```

### Icons
```jsx
<Icon name="lucide:star" size={24} color="#fff" />
```

### Variable Binding (var: syntax)
```jsx
<Frame bg="var:card" stroke="var:border">
  <Text color="var:foreground">Bound to Figma variables</Text>
</Frame>
```

---

## Critical Gotchas

### Text Cut-Off (MOST COMMON BUG)
Every `<Text>` that could wrap needs `w="fill"`. Every parent needs `w="fill"` or a fixed width.
```jsx
// GOOD
<Frame flex="col" gap={8} w="fill">
  <Text color="#fff" w="fill">This wraps properly</Text>
</Frame>
```

### Wrong Prop Names (Silently Ignored)
```
WRONG              →  RIGHT
fill="#fff"        →  bg="#fff"
padding={24}       →  p={24}
cornerRadius={12}  →  rounded={12}
fontSize={18}      →  size={18}
```

### Buttons Need flex
```jsx
<Frame bg="#3b82f6" px={16} py={10} rounded={10} flex="row" justify="center" items="center">
  <Text color="#fff">Button</Text>
</Frame>
```

### No Emojis — Use Icons
```jsx
<Icon name="lucide:home" size={20} color="#fff" />
```

### Auto-Layout Sizing (Common Source of Visual Bugs)

When using `desh eval` to modify nodes:

```javascript
// Avatars/circles become egg-shaped? → Set FIXED sizing
node.resize(44, 44);
node.layoutSizingHorizontal = 'FIXED';
node.layoutSizingVertical = 'FIXED';

// Badge/count expanding vertically? → Set counterAxisSizingMode to AUTO
node.counterAxisSizingMode = 'AUTO';  // hug content height
node.primaryAxisSizingMode = 'AUTO';  // hug content width

// Child stretching unexpectedly? → Check parent layout mode
// FILL can only be set on children of auto-layout frames
// Must set AFTER appendChild()
parent.appendChild(child);
child.layoutSizingHorizontal = 'FILL';  // AFTER appendChild!
```

### Exporting/Screenshots
```bash
# Export specific node (preferred — always use node ID)
desh export node "1:234" -s 2 -f png -o output.png

# Screenshot auto-selects first frame if nothing is selected
# For large pages, ALWAYS export specific nodes instead
desh verify "1:234"                  # quick screenshot for AI verification
```

Never export entire pages or sections — they're massive and blurry. Always target specific frames by ID.

### raw query Can Freeze Figma
Deep recursive queries on large files can lock Figma. Queries are depth-limited to 8 levels and skip INSTANCE children. Use `desh find "name"` for targeted searches instead.

---

## Command Reference

### Discovery
```bash
desh connect                         desh pages list
desh pages switch "name"             desh canvas info
desh find "Button"                   desh node tree ["id"] [-d depth]
desh lib list                        desh lib collections
desh lib vars "key-or-name"          desh var list [-t COLOR]
desh files                           desh components list
```

### Token & Variable Management
```bash
desh tokens sync                     desh var visualize
desh var create "name" -t COLOR -v "#fff"
desh var delete-all [-c "collection"] [--force]
desh var collections list            desh var collections create "name"
desh var create-batch '<json>'       desh var set-batch '<json>'
desh bind fill "primary"             desh bind stroke "border"
desh bind radius "radius-md"         desh bind gap "spacing-md"
```

### Library Operations
```bash
desh lib list                        desh lib collections
desh lib vars "key-or-name"          desh lib components
desh lib search "Button" --file "KEY"  desh lib import-all "KEY" [--dry-run]
desh lib instance "component-key"    desh lib swap "1:234" "NewComp"
desh lib import-vars "collection"    desh lib styles
desh lib apply-style "style"
```

### Create & Modify
```bash
desh render '<JSX>'                  desh render-batch '[...]'
desh create rect/ellipse/text/line/autolayout/icon/image/frame/component/group
desh set fill/stroke/radius/size/pos/opacity/autolayout/name
desh sizing hug|fill|fixed           desh padding/gap/align
desh eval "expression"               desh run script.js
```

### Canvas Operations
```bash
desh canvas info                     desh canvas next
desh arrange [-g gap] [-c cols]      desh duplicate|dup
desh delete|remove                   desh select "1:234"
desh get ["1:234"]
```

### Node Operations
```bash
desh node tree                       desh node bindings
desh node to-component "1:234"       desh node delete "1:234"
desh slot create/list/preferred/reset/add/convert
```

### Export
```bash
desh export screenshot -f png [-s 2] [-o file]
desh export node "1:234" -s 2 -f png
desh export css                      desh export tailwind
desh export-jsx "1:234"              desh export-storybook "1:234"
```

### Analysis
```bash
desh lint [--fix] [--rule name] [--preset accessibility]
desh a11y audit|contrast|vision|touch|text
desh analyze colors|typography|spacing|clusters
```

### Verification
```bash
desh verify ["1:234"]                # Screenshot for visual check
```

Always verify after creating or modifying visual elements.

### Other
```bash
desh blocks list                     desh blocks create dashboard-01
desh combos [--gap 60]               desh sizes --base small
desh raw query "//FRAME"             desh raw select/export
desh fj list/sticky/shape/connect/nodes/delete/eval
desh remove-bg                       desh sync [--force]
```

---

## Prototyping (via eval)

Wire up interactive flows using Figma's reactions API:

```javascript
// Navigate to another frame on click
node.reactions = [{
  trigger: { type: 'ON_CLICK' },
  actions: [{
    type: 'NODE',
    destinationId: 'targetFrameId',
    navigation: 'NAVIGATE',
    transition: { type: 'DISSOLVE', duration: 0.3, easing: { type: 'EASE_OUT' } }
  }]
}];

// Open overlay (dialog/sheet)
overlayFrame.overlayPositionType = 'CENTER';  // or 'MANUAL'
node.reactions = [{
  trigger: { type: 'ON_CLICK' },
  actions: [{
    type: 'NODE',
    destinationId: overlayFrame.id,
    navigation: 'OVERLAY',
    transition: { type: 'MOVE_IN', direction: 'RIGHT', duration: 0.3, easing: { type: 'EASE_OUT' } }
  }]
}];

// Close overlay (back action) — NO transition property allowed
closeButton.reactions = [{
  trigger: { type: 'ON_CLICK' },
  actions: [{ type: 'BACK' }]
}];
```

Key rules:
- Set `overlayPositionType` on the overlay frame BEFORE creating the reaction
- `BACK` action does NOT support `transition` — omit it or Figma throws
- Use `OVERLAY` navigation for dialogs/sheets, `NAVIGATE` for page transitions

---

## Rules

1. **Search library FIRST** — before creating ANY component, search with `desh lib search`. Hand-building what exists in the library is the #1 mistake
2. **Explore first** — discover what exists in Figma AND the codebase before creating
3. **Use library instances** — `desh lib instance "key"` over `desh render` or `desh eval` for components
4. **Use var: binding** — when variables exist, bind to them instead of hardcoding colors
5. **Export specific nodes** — never export full pages or sections. Use `desh export node "ID"` or `desh verify "ID"`
6. **Verify after every change** — `desh verify "ID"` after creating or modifying anything visual
7. **Never delete** user's existing nodes without explicit permission
8. **Never use eval to create layouts** — use `render` (smart positioning) or library instances
9. **No emojis** — use `<Icon name="lucide:...">` instead
10. **Check sizing after eval** — auto-layout sizing bugs (egg shapes, expanding badges) are the most common eval issue. Always verify dimensions
11. **Don't freeze Figma** — never run `findAll` on root, never walk INSTANCE children, always limit depth
