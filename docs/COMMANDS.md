# Commands Reference

## Setup & Connection

```bash
# Scan project and generate config
desh init

# Connect to running Figma (patches once)
desh connect

# Full sync: tokens + components + icons + fonts
desh sync
```

## FigJam Commands

```bash
# List open FigJam pages
desh fj list

# Show page info
desh fj info

# List elements on page
desh fj nodes
desh fj nodes --limit 50

# Create sticky note
desh fj sticky "Hello World!" -x 100 -y 100
desh fj sticky "Yellow Note" -x 200 -y 100 --color "#FEF08A"

# Create shape with text
desh fj shape "Box Label" -x 100 -y 200 -w 200 -h 100
desh fj shape "Diamond" -x 300 -y 200 --type DIAMOND

# Create text
desh fj text "Plain text" -x 100 -y 400 --size 24

# Connect two nodes
desh fj connect "2:30" "2:34"

# Move a node
desh fj move "2:30" 500 500

# Update text content
desh fj update "2:30" "New text content"

# Delete a node
desh fj delete "2:30"

# Execute JavaScript in FigJam
desh fj eval "figma.currentPage.children.length"
```

### Shape Types

- `ROUNDED_RECTANGLE` (default)
- `RECTANGLE`
- `ELLIPSE`
- `DIAMOND`
- `TRIANGLE_UP`
- `TRIANGLE_DOWN`
- `PARALLELOGRAM_RIGHT`
- `PARALLELOGRAM_LEFT`

### Page Selection

All FigJam commands support `-p` or `--page` to target a specific page:

```bash
desh fj sticky "Note" -p "My Board" -x 100 -y 100
```

---

## Design Tokens

```bash
# Sync tokens from project CSS → Figma variables
desh tokens sync

# List all variables
desh var list

# Create a variable
desh var create "primary/500" -c "CollectionId" -t COLOR -v "#3b82f6"

# Find variables by pattern
desh var find "primary/*"
```

## Collections

```bash
# List collections
desh var collections list

# Create collection
desh var collections create "Color - Semantic"
```

## Components

```bash
# Sync project components to Figma
desh components sync

# List discovered components with variants
desh components list
```

## Create Elements

```bash
# Create a frame
desh create frame "Card" -w 320 -h 200 --fill "#ffffff" --radius 12

# Create an icon (Iconify, 150k+ icons)
desh create icon lucide:star -s 24 -c "#f59e0b"
desh create icon mdi:home -s 32 -c "#3b82f6"
```

## JSX Rendering

```bash
# Create complex UI from JSX
desh render '<Frame w={320} h={200} bg="#fff" rounded={12} p={24} flex="col" gap={16}>
  <Text size={18} weight="bold" color="#111">Card Title</Text>
  <Text size={14} color="#666">Description</Text>
</Frame>'
```

## Export

```bash
# Screenshot current view
desh export screenshot -o screenshot.png

# Export variables as CSS custom properties
desh export css

# Export as Tailwind config
desh export tailwind
```

## Raw Commands

```bash
# Execute arbitrary JavaScript
desh eval "figma.currentPage.name"

# XPath queries
desh raw query "//COMPONENT"
desh raw select "1:234"
desh raw export "1:234" --scale 2
```

## Query Syntax

The query command uses XPath-like syntax:

```bash
# All frames
desh raw query "//FRAME"

# Frames with specific name
desh raw query "//FRAME[@name='Card']"

# All components
desh raw query "//COMPONENT"

# Name contains
desh raw query "//*[contains(@name, 'Button')]"
```

## Selection

```bash
# Select by ID
desh raw select "1:234"

# Select multiple
desh raw select "1:234,1:235,1:236"

# Clear selection
desh eval "figma.currentPage.selection = []"
```

## Export Nodes

```bash
# Export at 2x scale
desh raw export "1:234" --scale 2

# Export with suffix
desh raw export "1:234" --scale 2 --suffix "_dark"
```
