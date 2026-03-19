# desh Render & Script Reference

Only use this reference after confirming no component exists in the Figma library OR the codebase. These tools create raw frames and text — they are for **custom layouts only**, not for recreating components that exist in code.

---

## JSX Render

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

## Composing Layouts

**Always use `desh render` for creation.** Never use `eval` or `run` to create frames, text, or visual elements. `render` handles font loading, smart positioning, variable binding, and auto-layout automatically — eval skips all of this.

Each `desh render` call creates a NEW top-level frame. For multi-section layouts, compose everything inside a single render call with one root `<Frame>`.

```bash
# WRONG — creates 3 scattered frames:
desh render '<Frame name="Section 1" ...>...</Frame>'
desh render '<Frame name="Section 2" ...>...</Frame>'

# RIGHT — one render, sections nested:
desh render '<Frame name="Page" w={1800} flex="col" bg="var:background" p={64} gap={80}>
  <Frame name="Section 1" w="fill" flex="col" gap={16}>...</Frame>
  <Frame name="Section 2" w="fill" flex="col" gap={16}>...</Frame>
</Frame>'
```

### Layout Size Strategy

| Complexity | Approach |
|---|---|
| Simple (< 10 nodes) | Single `desh render` |
| Medium (10-50 nodes) | Single `desh render` with nested JSX |
| Complex (50+ nodes) | Single `desh render` with deeply nested JSX |
| Very complex (100+ nodes) | Multiple `desh render` calls, each creating a section, then arrange |

For large layouts, compose the full JSX tree — don't escape to eval:
```bash
desh render '<Frame name="Page" w={1800} flex="col" bg="var:background" gap={64}>
  <Frame name="Hero" w="fill" flex="col" items="center" gap={24} p={80}>
    <Text size={48} weight="bold" color="var:foreground" w="fill" align="center">Headline</Text>
    <Text size={18} color="var:muted-foreground" w="fill" align="center">Subtitle text here</Text>
  </Frame>
  <Frame name="Features" w="fill" flex="row" gap={32} px={64}>
    <Frame flex="col" gap={12} grow={1}>
      <Icon name="lucide:zap" size={24} color="var:primary" />
      <Text size={20} weight="bold" color="var:foreground" w="fill">Feature 1</Text>
      <Text size={14} color="var:muted-foreground" w="fill">Description</Text>
    </Frame>
    <Frame flex="col" gap={12} grow={1}>
      <Icon name="lucide:shield" size={24} color="var:primary" />
      <Text size={20} weight="bold" color="var:foreground" w="fill">Feature 2</Text>
      <Text size={14} color="var:muted-foreground" w="fill">Description</Text>
    </Frame>
  </Frame>
</Frame>'
```

**When is eval appropriate?** Only for post-creation modifications that JSX cannot express:
- Setting prototype reactions/navigation on existing nodes
- Tweaking computed properties on nodes by ID after render
- Reading node data for analysis

---

## Critical Gotchas

### Text Cut-Off (MOST COMMON BUG)
Every `<Text>` that could wrap needs `w="fill"`. Every parent needs `w="fill"` or a fixed width.

### Wrong Prop Names (Silently Ignored)
```
WRONG              ->  RIGHT
fill="#fff"        ->  bg="#fff"
padding={24}       ->  p={24}
cornerRadius={12}  ->  rounded={12}
fontSize={18}      ->  size={18}
```

### Buttons Need flex
```jsx
<Frame bg="#3b82f6" px={16} py={10} rounded={10} flex="row" justify="center" items="center">
  <Text color="#fff">Button</Text>
</Frame>
```

### No Emojis
Use `<Icon name="lucide:...">` instead.

### Shadows May Fail
If `shadow` prop throws validation errors, use `stroke="var:border" strokeWidth={1}` instead. Or use eval with full Figma effects API:
```javascript
node.effects = [{
  type: 'DROP_SHADOW',
  color: { r: 0, g: 0, b: 0, a: 0.15 },
  offset: { x: 0, y: 4 },
  radius: 12,
  spread: 0,
  visible: true,
  blendMode: 'NORMAL'
}];
```

### Auto-Layout Sizing
```javascript
// FILL can ONLY be set on children of auto-layout frames.
// Always: parent.layoutMode -> parent.appendChild(child) -> child sizing
parent.layoutMode = 'VERTICAL';
parent.appendChild(child);
child.layoutSizingHorizontal = 'FILL';  // NOW safe

// Fixed-size elements (avatars, icons):
node.resize(44, 44);
node.layoutSizingHorizontal = 'FIXED';
node.layoutSizingVertical = 'FIXED';
```

---

## Script Rules (`desh run` / `desh eval`)

**These are for post-creation modifications only.** Use `desh render` (JSX) to create all visual elements first, then use eval/run to modify existing nodes if needed.

When you DO need eval/run for modifications:
1. **Reference nodes by ID.** Get IDs from `desh find` or `desh get` after rendering.
2. **Never set FILL before appendChild.** #1 cause of script failures.
3. **Keep scripts under 200 lines.** Break into phases if larger.
4. **Test incrementally.** Write 30 lines, run, verify. Don't write 1000 lines and debug.
5. **Use helper functions** for repetitive patterns.

---

## Prototyping (via eval)

```javascript
// Navigate on click
node.reactions = [{
  trigger: { type: 'ON_CLICK' },
  actions: [{
    type: 'NODE', destinationId: 'targetFrameId',
    navigation: 'NAVIGATE',
    transition: { type: 'DISSOLVE', duration: 0.3, easing: { type: 'EASE_OUT' } }
  }]
}];

// Open overlay
overlayFrame.overlayPositionType = 'CENTER';
node.reactions = [{
  trigger: { type: 'ON_CLICK' },
  actions: [{
    type: 'NODE', destinationId: overlayFrame.id,
    navigation: 'OVERLAY',
    transition: { type: 'MOVE_IN', direction: 'RIGHT', duration: 0.3, easing: { type: 'EASE_OUT' } }
  }]
}];

// Close overlay — NO transition property allowed
closeButton.reactions = [{
  trigger: { type: 'ON_CLICK' },
  actions: [{ type: 'BACK' }]
}];
```

- Set `overlayPositionType` on overlay frame BEFORE creating the reaction
- `BACK` action does NOT support `transition`
- Use `OVERLAY` for dialogs/sheets, `NAVIGATE` for page transitions
