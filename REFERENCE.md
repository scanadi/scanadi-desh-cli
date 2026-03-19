# desh Command Reference

Full command reference for the Design Shell CLI. For quick start, see CLAUDE.md.

## Setup & Connection

```bash
desh init                          # Scan project, generate desh.config.json
desh connect                       # Patch Figma once + verify CDP
desh sync                          # Full sync: tokens + components + icons + fonts
desh files                         # List open Figma files
```

## Design Tokens & Variables

### Sync Tokens from Project

```bash
desh tokens sync                   # Extract from globals.css → Figma variables
```

### Manage Variables

```bash
desh var list                      # Show all variables
desh var list -t COLOR             # Filter by type
desh var visualize                 # Show colors on canvas
desh var create "name" -c "ColId" -t COLOR -v "#3b82f6"
desh var delete-all                # Delete all variables
desh var delete-all -c "primitives" # Delete specific collection
```

### Batch Variable Operations

```bash
desh var create-batch '<json>'     # Create up to 100 variables
desh var delete-batch '<nodeIds>'  # Delete multiple variables
desh var bind-batch '<json>'       # Bind multiple variables to nodes
desh var set-batch '<json>'        # Set values across modes
desh var rename-batch '<json>'     # Rename multiple variables
```

### Collections

```bash
desh var collections list          # List all collections
desh var collections create "name" # Create new collection
```

### Bind Variables

```bash
desh bind fill "primary/500"
desh bind stroke "border/default"
desh bind radius "radius/md"
desh bind gap "spacing/md"
desh bind padding "spacing/lg"
desh bind list                     # List available variables
```

## Components

```bash
desh components sync               # Read project .tsx → push to Figma
desh components list               # Show discovered components + variants + source
```

### Component Linking (code ↔ Figma)

```bash
desh components link               # Auto-match code↔Figma by name (3-pass matching)
desh components link "Button"      # Link single component
desh components link "Button" "key"  # Manual link to specific Figma component key
desh components link --dry-run     # Preview matches without writing
desh components linked             # Show linked components + variant counts
desh components linked --json      # JSON output
desh components unlink "Button"    # Remove a link
desh components diff               # Diff all linked component variants
desh components diff "Button"      # Diff single component
desh components diff --json        # JSON output
desh components push               # Push missing code variants → Figma
desh components push "Button"      # Push single component
desh components push --dry-run     # Preview without modifying Figma
desh components pull               # Pull missing Figma variants → code
desh components pull "Button"      # Pull single component
desh components pull --dry-run     # Preview without modifying files
```

Requires `FIGMA_API_TOKEN` and `library` in `desh.config.json`. Mappings stored in `.desh-component-map.json`.

## Create Elements

### Quick Primitives

```bash
desh create rect "Card" -w 320 -h 200 --fill "#fff" --radius 12
desh create circle "Avatar" -w 48 --fill "#3b82f6"
desh create text "Hello" -s 24 -c "#000" -w bold
desh create line -l 200 -c "#e4e4e7"
desh create autolayout "Card" -d col -g 16 -p 24 --fill "#fff"
desh create icon lucide:star -s 24 -c "#f59e0b"
desh create image "https://example.com/photo.png" -w 200
desh create group "Header"
desh create component "Button"
```

### Create with Variable Binding (Fast)

Use `var:name` syntax to bind variables at creation time:

```bash
desh create rect "Card" --fill "var:card" --stroke "var:border"
desh create circle "Avatar" --fill "var:primary"
desh create text "Hello" -c "var:foreground"
desh create line -c "var:border"
desh create frame "Section" --fill "var:background"
desh create autolayout "Container" --fill "var:muted"
desh create icon lucide:star -c "var:primary"
```

### Render with JSX

```bash
desh render '<Frame name="Card" w={320} h={180} bg="#fff" rounded={16} flex="col" gap={8} p={24}>
  <Text size={20} weight="bold" color="#111">Title</Text>
  <Text size={14} color="#666" w="fill">Description</Text>
</Frame>'
```

### Render with Variable Binding (Fast)

```bash
desh render '<Frame name="Card" w={320} h={180} bg="var:card" stroke="var:border" rounded={16} flex="col" gap={8} p={24}>
  <Text size={20} weight="bold" color="var:foreground">Title</Text>
  <Text size={14} color="var:muted-foreground" w="fill">Description</Text>
  <Frame bg="var:primary" px={16} py={8} rounded={8}>
    <Text color="var:primary-foreground">Button</Text>
  </Frame>
</Frame>'
```

### Render Batch (Multiple Frames)

```bash
desh render-batch '[
  "<Frame name=\"Card 1\" w={300} h={200} bg=\"#fff\"><Text>Card 1</Text></Frame>",
  "<Frame name=\"Card 2\" w={300} h={200} bg=\"#fff\"><Text>Card 2</Text></Frame>"
]' -d row -g 40
```

Options: `-d row|col` (direction), `-g <n>` (gap)

## Modify Elements

```bash
desh set fill "#3b82f6"            # Change fill (hex)
desh set fill "var:primary"        # Bind fill to variable (fast)
desh set fill "#3b82f6" -n "1:234" # On specific node
desh set stroke "#e4e4e7" -w 1     # Add stroke (hex)
desh set stroke "var:border"       # Bind stroke to variable
desh set radius 12                 # Corner radius
desh set size 320 200              # Resize
desh set pos 100 100               # Move
desh set opacity 0.5               # Opacity
desh set autolayout row -g 8 -p 16 # Apply auto-layout
desh set name "Header"             # Rename
```

## Layout & Sizing

```bash
desh sizing hug                    # Hug contents
desh sizing fill                   # Fill container
desh sizing fixed 320 200          # Fixed size
desh padding 16                    # All sides
desh padding 16 24                 # Vertical, horizontal
desh gap 16                        # Set gap
desh align center                  # Align items
```

## Find & Select

```bash
desh find "Button"                 # Find by name
desh find "Card" -t FRAME          # Filter by type
desh select "1:234"                # Select node
desh get                           # Get selection props
desh get "1:234"                   # Get specific node
```

## Canvas Operations

```bash
desh canvas info                   # What's on canvas
desh canvas next                   # Next free position
desh arrange -g 100                # Arrange frames
desh arrange -g 100 -c 3          # 3 columns
```

## Duplicate & Delete

```bash
desh duplicate                     # Duplicate selection
desh dup "1:234" --offset 50       # With offset
desh delete                        # Delete selection
desh delete "1:234"                # Delete by ID
```

## Node Operations

```bash
desh node tree                     # Show tree structure
desh node tree "1:234" -d 5        # Deeper depth
desh node bindings                 # Show variable bindings
desh node to-component "1:234"     # Convert to component
desh node delete "1:234"           # Delete by ID
```

## Slots

```bash
desh slot create "Content"         # Create slot on component
desh slot create "Actions" --flex row --gap 8 --padding 16
desh slot list                     # List slots in component
desh slot list "1:234"             # List by component ID
desh slot preferred "Slot#1:2" "comp-id-1" "comp-id-2"  # Set preferred
desh slot reset                    # Reset slot to defaults
desh slot add "slot-id" --component "comp-id"  # Add to slot
desh slot add "slot-id" --frame    # Add empty frame
desh slot add "slot-id" --text "Hello"  # Add text
desh slot convert --name "Actions" # Convert frame to slot
```

## Export

```bash
desh export css                    # Variables as CSS
desh export tailwind               # Tailwind config
desh export screenshot -o out.png  # Screenshot (selection or page)
desh export screenshot -s 2 -f png # 2x scale PNG
desh export screenshot -f svg      # SVG format
desh export node "1:234" -o card.png          # Export node by ID
desh export node "1:234" -s 2 -f png          # 2x scale PNG
desh export node "1:234" -f svg -o card.svg   # SVG export
desh export-jsx "1:234"            # Export as JSX
desh export-jsx "1:234" -o Card.jsx --pretty
desh export-storybook "1:234"      # Storybook stories
```

## Analysis & Linting

```bash
desh lint                          # Check all rules
desh lint --fix                    # Auto-fix
desh lint --rule color-contrast    # Specific rule
desh lint --preset accessibility   # Use preset
desh analyze colors                # Color usage
desh analyze typography            # Typography
desh analyze spacing               # Spacing
desh analyze clusters              # Find patterns
```

Lint rules: `no-default-names`, `no-deeply-nested`, `no-empty-frames`, `prefer-auto-layout`, `no-hardcoded-colors`, `color-contrast`, `touch-target-size`, `min-text-size`

Presets: `recommended`, `strict`, `accessibility`, `design-system`

## Accessibility

```bash
desh a11y contrast                 # WCAG AA/AAA contrast checker
desh a11y vision                   # Color blindness simulation
desh a11y touch                    # Touch target size check (44x44)
desh a11y text                     # Minimum text size check
desh a11y audit                    # Full accessibility audit
```

## XPath Queries

```bash
desh raw query "//FRAME"
desh raw query "//COMPONENT"
desh raw query "//*[contains(@name, 'Button')]"
desh raw select "1:234"
desh raw export "1:234" --scale 2
```

## Team Libraries

```bash
desh lib list                      # List all enabled libraries
desh lib collections               # List library variable collections
desh lib import vars "collection"  # Import variables from library
desh lib import components "lib"   # Import components from library
desh lib instance "component"      # Create instance of library component
desh lib swap "1:234" "new-comp"   # Swap instance to different component
desh lib styles                    # List library styles
desh lib apply-style "style"       # Apply library style to selection
```

## Website Recreation

```bash
desh recreate-url "https://example.com" --name "My Page"
desh recreate-url "https://example.com" -w 375 -h 812  # Mobile
desh analyze-url "https://example.com" --screenshot
desh screenshot-url "https://example.com" --full
```

## Images

```bash
desh create image "https://example.com/photo.png"
desh screenshot-url "https://example.com"
desh remove-bg                     # Remove background (needs API key)
```

## FigJam

```bash
desh fj list                       # List pages
desh fj sticky "Text" -x 100 -y 100 --color "#FEF08A"
desh fj shape "Label" -x 200 -y 100 -w 200 -h 100
desh fj connect "ID1" "ID2"        # Connect elements
desh fj nodes                      # Show elements
desh fj delete "ID"
desh fj eval "figma.currentPage.children.length"
```

Shape types: `ROUNDED_RECTANGLE`, `RECTANGLE`, `ELLIPSE`, `DIAMOND`, `TRIANGLE_UP`, `TRIANGLE_DOWN`, `PARALLELOGRAM_RIGHT`, `PARALLELOGRAM_LEFT`

## Component Combinations (combos)

Generate all variant combinations as individual components:

```bash
desh combos                        # Use selection
desh combos "1:234"                # By node ID
desh combos --dry-run              # Preview without creating
desh combos --gap 60               # Custom gap between components
desh combos --no-boolean           # Exclude boolean properties
```

## Size Variants (sizes)

Generate Small/Medium/Large variants from a single component:

```bash
desh sizes                         # Use selection
desh sizes "1:234"                 # By node ID
desh sizes --base small            # Source is Small size
desh sizes --base large            # Source is Large size
desh sizes --gap 60                # Custom gap
```

## Blocks

```bash
desh blocks list                   # List available blocks
desh blocks create dashboard-01    # Create dashboard in Figma
```

## JavaScript Eval

```bash
desh eval "figma.currentPage.name"
desh eval --file /tmp/script.js
desh run /tmp/script.js
```

## Verify (AI)

```bash
desh verify                        # Screenshot of selection
desh verify "123:456"              # Screenshot of specific node
```

## Render JSX Syntax

**Elements:** `<Frame>`, `<Rectangle>`, `<Ellipse>`, `<Text>`, `<Line>`, `<Image>`, `<SVG>`, `<Icon>`, `<Slot>`

**Size:** `w={320} h={200}`, `w="fill"`, `minW={100} maxW={500}`

**Layout:** `flex="row|col"`, `gap={16}`, `wrap={true}`, `justify="start|center|end|between"`, `items="start|center|end"`

**Padding:** `p={24}`, `px={16} py={8}`, `pt={8} pr={16} pb={8} pl={16}`

**Appearance:** `bg="#fff"`, `stroke="#000"`, `strokeWidth={1}`, `opacity={0.5}`

**Corners:** `rounded={16}`, `roundedTL={8}`, `overflow="hidden"`

**Effects:** `shadow="0 4 12 #0001"`, `blur={10}`, `rotate={45}`

**Text:** `<Text size={18} weight="bold" color="#000" font="Inter">Hello</Text>`

**Icons:** `<Icon name="lucide:star" size={24} color="#fff" />`

**WRONG vs RIGHT:**
```
layout="horizontal"  →  flex="row"
padding={24}         →  p={24}
fill="#fff"          →  bg="#fff"
cornerRadius={12}    →  rounded={12}
```
