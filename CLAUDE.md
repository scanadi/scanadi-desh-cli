# desh — Design Shell

CLI that controls Figma Desktop directly. No API key needed.

## Quick Reference

| User says | Command |
|-----------|---------|
| "set up project" | `desh init` |
| "connect to figma" | `desh connect` |
| "sync design system" | `desh sync` |
| "sync tokens only" | `desh tokens sync` |
| "sync components" | `desh components sync` |
| "show components" | `desh components list` |
| "show colors on canvas" | `desh var visualize` |
| "create dashboard" | `desh blocks create dashboard-01` |
| "list blocks" | `desh blocks list` |
| "create a button" | `desh render '<Button variant="default">Label</Button>'` |
| "create a card" | `desh render '<Card><CardHeader>...</CardHeader></Card>'` |
| "create a rectangle/frame" | `desh render '<Frame>...'` |
| "convert to component" | `desh node to-component "ID"` |
| "list variables" | `desh var list` |
| "find nodes named X" | `desh find "X"` |
| "what's on canvas" | `desh canvas info` |
| "export as PNG/SVG" | `desh export screenshot -f png` |
| "export node" | `desh export node "1:234" -s 2 -f png` |
| "check accessibility" | `desh a11y audit` |
| "check contrast" | `desh a11y contrast` |
| "lint design" | `desh lint` |
| "analyze colors" | `desh analyze colors` |
| "show all variants" | `desh combos` |
| "create size variants" | `desh sizes --base small` |
| "create a slot" | `desh slot create "Name"` |
| "list slots" | `desh slot list` |
| "reset slot" | `desh slot reset` |
| "verify creation" | `desh verify` |
| "export CSS variables" | `desh export css` |
| "import library" | `desh lib import components "lib-name"` |
| "remove background" | `desh remove-bg` |

**Full command reference:** See REFERENCE.md

---

## AI Verification (Internal)

After creating any component, run `verify` to get a small screenshot for validation:

```bash
desh verify              # Screenshot of selection
desh verify "123:456"    # Screenshot of specific node
```

Returns JSON with base64 image (max 2000px, auto-scaled to stay under API limits).

**Always verify after:**
- `render` or `render-batch`
- `node to-component`
- Any visual creation

This is for internal AI checks, not shown to users.

---

## Project Setup

### desh init

Scans your project for tokens, components, and generates `desh.config.json`:

```bash
desh init
```

Detects monorepo structure, finds globals.css files, locates component directories.

### desh.config.json

```json
{
  "tokens": ["packages/ui/globals.css", "apps/web/globals.css"],
  "primitives": "packages/ui/src/components",
  "components": ["apps/web/src/components"]
}
```

### desh sync

Full sync: reads your project's CSS tokens + components → pushes to Figma:

```bash
desh sync                # Full sync
desh tokens sync         # Tokens only
desh components sync     # Components only
```

---

## Connection

Uses a Figma plugin bridge. No binary patching, no special permissions needed.

```bash
desh connect
```

1. Starts a local bridge server (auto-managed, exits after 5min idle)
2. Checks if the desh plugin is running in Figma
3. If not: prompts to open Figma → Plugins → desh → Run

Each command auto-starts the bridge server if needed. The plugin must be running in Figma.

To stop the bridge server: `desh disconnect`

---

## Blocks (Pre-built UI Layouts)

**ALWAYS use `blocks create` for dashboards and page layouts.** Never build them manually with render/eval.

```bash
desh blocks list                    # Show available blocks
desh blocks create dashboard-01     # Create dashboard in Figma
```

**dashboard-01**: Full analytics dashboard with:
- Sidebar with real Lucide icons
- Stats cards (Revenue, Customers, Accounts, Growth)
- Area chart with two datasets
- Data table with pagination
- All colors bound to project variables (supports Light/Dark mode)

---

## Design Tokens

Tokens are read from your project's actual CSS files (Tailwind v4 `@theme`, `:root`, `.dark`):

```bash
desh tokens sync                    # Extract from globals.css → Figma variables
```

"Delete all variables":
```bash
desh var delete-all                    # All collections
desh var delete-all -c "primitives"    # Only specific collection
```

"Show colors on canvas":
```bash
desh var visualize              # All collections
desh var visualize "primitives" # Filter
```

---

## Fast Variable Binding (var: syntax)

Use `var:name` syntax to bind variables directly at creation time:

### Create Commands with var:
```bash
desh create rect "Card" --fill "var:card" --stroke "var:border"
desh create circle "Avatar" --fill "var:primary"
desh create text "Hello" -c "var:foreground"
desh create line -c "var:border"
desh create frame "Section" --fill "var:background"
desh create autolayout "Container" --fill "var:muted"
desh create icon lucide:star -c "var:primary"
```

### JSX render with var:
```bash
desh render '<Frame bg="var:card" stroke="var:border" rounded={12} p={24}>
  <Text color="var:foreground" size={18}>Title</Text>
</Frame>'
```

### Set commands with var:
```bash
desh set fill "var:primary"
desh set stroke "var:border"
```

**Variables:** `background`, `foreground`, `card`, `primary`, `secondary`, `muted`, `accent`, `border`, and their `-foreground` variants.

---

## Components

desh reads your project's actual `.tsx` components (cva() variants, Tailwind classes, icons) and can render them in Figma:

```bash
desh components list               # Show discovered components + variants
desh components sync               # Push components to Figma as component sets
desh render '<Button variant="destructive">Delete</Button>'
```

---

## Creating Components via eval

For complex multi-element components, use `eval` with native Figma API:

```javascript
desh eval "(async () => {
  // 1. Load fonts FIRST
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

  // 2. Create frame with FIXED width
  const card = figma.createFrame();
  card.name = 'Card';
  card.x = 100; card.y = 100;
  card.resize(340, 1);
  card.layoutMode = 'HORIZONTAL';
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'AUTO';
  card.paddingTop = card.paddingBottom = card.paddingLeft = card.paddingRight = 20;
  card.itemSpacing = 16;
  card.cornerRadius = 12;
  card.fills = [{ type: 'SOLID', color: { r: 0.094, g: 0.094, b: 0.106 } }];

  // 3. Content frame must FILL remaining space
  const content = figma.createFrame();
  content.fills = [];
  content.layoutMode = 'VERTICAL';
  content.itemSpacing = 4;
  card.appendChild(content);
  content.layoutSizingHorizontal = 'FILL';

  // 4. Text must FILL to wrap
  const title = figma.createText();
  title.fontName = { family: 'Inter', style: 'Bold' };
  title.characters = 'Title here';
  title.fontSize = 14;
  title.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  content.appendChild(title);
  title.layoutSizingHorizontal = 'FILL';

  // 5. Convert to component
  const comp = figma.createComponentFromNode(card);
  return { id: comp.id, name: comp.name };
})()"
```

**Auto-Layout Rules (Text Cut-Off Prevention):**
1. Parent frame needs `resize(WIDTH, 1)` + `primaryAxisSizingMode = 'FIXED'`
2. Child content frames need `layoutSizingHorizontal = 'FILL'` AFTER appendChild
3. ALL text nodes need `layoutSizingHorizontal = 'FILL'` AFTER appendChild
4. Order matters: appendChild first, then set layoutSizingHorizontal

**Before Creating - Check Positions:**
```javascript
const nodes = figma.currentPage.children.map(n => ({
  name: n.name, x: n.x, width: n.width
}));
const maxX = Math.max(0, ...nodes.map(n => n.x + n.width)) + 100;
```

**NEVER delete existing nodes** - users may have components they want to keep!

**After Creating - Always Verify:**
```bash
desh verify "NODE_ID"
```

---

## Complex Components (Pricing Cards, etc.)

### Pattern
1. **Check for variables first** - don't assume any collection exists
2. **Use fallback colors** when no variables present
3. **Single eval** - create everything in one API call
4. **Data-driven** - define content in array, loop to create
5. **Equal height** - use `layoutAlign: "STRETCH"` and `layoutGrow: 1`

### Fallback Colors (Dark Theme)
```javascript
const colors = {
  bg: { r: 0.09, g: 0.09, b: 0.11 },
  card: { r: 0.11, g: 0.11, b: 0.13 },
  border: { r: 0.2, g: 0.2, b: 0.22 },
  primary: { r: 0.23, g: 0.51, b: 0.97 },
  text: { r: 0.98, g: 0.98, b: 0.98 },
  muted: { r: 0.6, g: 0.6, b: 0.65 },
  white: { r: 1, g: 1, b: 1 }
};
```

### Variable Detection
```javascript
const collections = await figma.variables.getLocalVariableCollectionsAsync();
if (collections.length > 0) {
  // Use project variables
} else {
  // Use fallback colors
}
```

### Equal Height Cards
```javascript
for (const card of container.children) {
  card.layoutAlign = 'STRETCH';
  card.primaryAxisSizingMode = 'FIXED';
  for (const child of card.children) {
    if (child.name === 'Features') {
      child.layoutGrow = 1;
    }
  }
}
```

---

## Creating Webpages

Create ONE parent frame with vertical auto-layout containing all sections:

```bash
desh render '<Frame name="Landing Page" w={1440} flex="col" bg="#0a0a0f">
  <Frame name="Hero" w="fill" h={800} flex="col" justify="center" items="center" gap={24} p={80}>
    <Text size={64} weight="bold" color="#fff">Headline</Text>
    <Frame bg="#3b82f6" px={32} py={16} rounded={8}><Text color="#fff">CTA</Text></Frame>
  </Frame>
  <Frame name="Features" w="fill" flex="row" gap={40} p={80} bg="#111">
    <Frame flex="col" gap={12} grow={1}><Text size={24} weight="bold" color="#fff">Feature 1</Text></Frame>
  </Frame>
</Frame>'
```

---

## Slots

Figma's native slots feature allows flexible content areas in components.

### Slot Commands

```bash
desh slot create "Content" --flex col --gap 8 --padding 16
desh slot list
desh slot list "component-id"
desh slot preferred "Slot#1:2" "component-id-1" "component-id-2"
desh slot reset
desh slot convert --name "Actions"
desh slot add "slot-id" --component "component-id"
desh slot add "slot-id" --frame
desh slot add "slot-id" --text "Hello"
```

### JSX Slot Syntax

```jsx
<Frame name="Card" w={300} h={200} bg="#18181b" rounded={12} flex="col" p={16} gap={12}>
  <Text size={18} weight="bold" color="#fff">Card Title</Text>
  <Slot name="Content" flex="col" gap={8} w="fill">
    <Text size={14} color="#a1a1aa">Default slot content</Text>
  </Slot>
</Frame>
```

**Slot props:** `name`, `flex`, `gap`, `p`/`px`/`py`, `w`/`h`, `bg`

**Self-closing slot:** `<Slot name="Actions" flex="row" gap={8} />`

### Slot Workflow

1. **Create component with slot:**
```bash
desh render '<Frame name="Card" ...>
  <Slot name="Content" flex="col" w="fill" />
</Frame>'
desh node to-component "frame-id"
```

2. **Or add slot to existing component:**
```bash
desh slot create "Content" --flex col --gap 8
```

3. **Set preferred components:**
```bash
desh slot preferred "Slot#1:2" "button-comp-id" "icon-comp-id"
```

**CRITICAL: `isSlot = true` does NOT work in eval!**
You MUST use: `desh slot convert "frame-id" --name "SlotName"`

---

## JSX Syntax (render command)

```jsx
// Layout
flex="row"              // or "col"
gap={16}                // spacing between items
p={24}                  // padding all sides
px={16} py={8}          // padding x/y
pt={8} pr={16} pb={8} pl={16}  // individual padding

// Alignment
justify="center"        // main axis: start, center, end, between
items="center"          // cross axis: start, center, end

// Size
w={320} h={200}         // fixed size
w="fill" h="fill"       // fill parent
minW={100} maxW={500}   // constraints
minH={50} maxH={300}

// Appearance
bg="#fff"               // fill color
bg="var:card"           // bind to variable
stroke="#000"           // stroke color
stroke="var:border"     // bind stroke to variable
strokeWidth={2}         // stroke thickness
strokeAlign="inside"    // inside, outside, center
opacity={0.8}           // 0..1
blendMode="multiply"    // multiply, overlay, etc.

// Corners
rounded={16}            // all corners
roundedTL={8} roundedTR={8} roundedBL={0} roundedBR={0}  // individual
cornerSmoothing={0.6}   // iOS squircle (0..1)

// Effects
shadow="4px 4px 12px rgba(0,0,0,0.25)"  // drop shadow
blur={8}                // layer blur
overflow="hidden"       // clip content
rotate={45}             // rotation degrees

// Text
<Text size={18} weight="bold" color="#000" font="Inter">Hello</Text>
<Text color="var:foreground">Text with variable color</Text>

// Icons (via Iconify API - real SVG nodes)
<Icon name="lucide:chevron-left" size={16} color="#fff" />
<Icon name="lucide:check" size={14} color="var:primary-foreground" />
```

### Auto-Layout

```jsx
wrap={true}             // items flow to next row
rowGap={12}             // gap between rows
grow={1}                // expand to fill remaining space
stretch={true}          // fill cross-axis
position="absolute" x={12} y={12}  // absolute positioning
```

**Common mistakes (silently ignored, no error!):**
```
WRONG                    RIGHT
layout="horizontal"   →  flex="row"
padding={24}          →  p={24}
fill="#fff"           →  bg="#fff"
cornerRadius={12}     →  rounded={12}
fontSize={18}         →  size={18}
fontWeight="bold"     →  weight="bold"
```

### Layout Patterns

**Push items to edges (navbar):**
```jsx
<Frame flex="row" items="center">
  <Frame>Logo</Frame>
  <Frame grow={1} justify="center">Nav Links</Frame>
  <Frame>Buttons</Frame>
</Frame>
```

**Input at bottom (chat):**
```jsx
<Frame flex="col" h={400}>
  <Frame>Message 1</Frame>
  <Frame grow={1} />
  <Frame>Input field</Frame>
</Frame>
```

### Common Pitfalls

**1. Text gets cut off (CRITICAL):**
```jsx
// BAD: Text without w="fill" clips
<Frame flex="col" gap={8}>
  <Text size={16} color="#fff">Title cut off</Text>
</Frame>

// GOOD: w="fill" on parent AND all text
<Frame flex="col" gap={8} w="fill">
  <Text size={16} color="#fff" w="fill">Title wraps</Text>
  <Text size={14} color="#a1a1aa" w="fill">Description wraps</Text>
</Frame>
```

**2. Toggle switches — use flex, not absolute:**
```jsx
// ON state (knob right)
<Frame w={52} h={28} bg="#3b82f6" rounded={14} flex="row" items="center" p={2} justify="end">
  <Frame w={24} h={24} bg="#fff" rounded={12} />
</Frame>
```

**3. Buttons need flex for centered text:**
```jsx
<Frame bg="#3b82f6" px={16} py={10} rounded={10} flex="row" justify="center" items="center">
  <Text color="#fff">Button</Text>
</Frame>
```

**4. No emojis — use real icons or shapes:**
```jsx
<Icon name="lucide:home" size={20} color="#fff" />
<Icon name="lucide:settings" size={20} color="var:foreground" />
```

**5. Three-dot menu:**
```jsx
<Frame flex="row" gap={3} justify="center" items="center">
  <Frame w={4} h={4} bg="#52525b" rounded={2} />
  <Frame w={4} h={4} bg="#52525b" rounded={2} />
  <Frame w={4} h={4} bg="#52525b" rounded={2} />
</Frame>
```

---

## Key Rules

1. **Always use `render` for frames** — has smart positioning
2. **Never use `eval` to create** — no positioning, overlaps at (0,0)
3. **For multiple frames:** Use `render-batch`
4. **Convert to components:** `node to-component` after creation

---

## Onboarding

**Never show terminal commands to users.** Run silently, give friendly feedback.

1. Run `desh init` to scan project
2. Run `desh connect` to start bridge server
3. If plugin not connected: prompt user to open Figma → Plugins → desh → Run
4. Run `desh sync` to push tokens + components
5. When connected, say: "Connected! What would you like to create?"

---

## Website Recreation

```bash
desh recreate-url "https://example.com" --name "Page"
desh screenshot-url "https://example.com"
```
