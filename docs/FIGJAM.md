# FigJam Support

## Overview

`desh` includes full FigJam support via CLI commands and a programmatic client, connecting directly via Chrome DevTools Protocol (CDP).

## CLI Commands

```bash
# List open FigJam pages
desh fj list

# Show page info
desh fj info

# List elements on page
desh fj nodes

# Create sticky note
desh fj sticky "Hello World!" -x 100 -y 100

# Create shape with text
desh fj shape "Box Label" -x 100 -y 200 -w 200 -h 100

# Create text
desh fj text "Plain text" -x 100 -y 400 --size 24

# Connect two nodes
desh fj connect "2:30" "2:34"

# Move, update, delete
desh fj move "2:30" 500 500
desh fj update "2:30" "New text"
desh fj delete "2:30"

# Execute JavaScript
desh fj eval "figma.currentPage.children.length"
```

### All Options

| Command | Options |
|---------|---------|
| `sticky <text>` | `-x`, `-y`, `-c/--color`, `-p/--page` |
| `shape <text>` | `-x`, `-y`, `-w/--width`, `-h/--height`, `-t/--type`, `-p/--page` |
| `text <content>` | `-x`, `-y`, `-s/--size`, `-p/--page` |
| `connect <start> <end>` | `-p/--page` |
| `move <id> <x> <y>` | `-p/--page` |
| `update <id> <text>` | `-p/--page` |
| `delete <id>` | `-p/--page` |
| `eval <code>` | `-p/--page` |
| `nodes` | `-l/--limit`, `-p/--page` |

## Architecture

```
┌─────────────────┐      WebSocket (CDP)     ┌─────────────────┐
│   desh fj       │ ◄──────────────────────► │  FigJam Tab     │
│                 │      Runtime.evaluate     │  (in Figma)     │
└─────────────────┘                          └─────────────────┘
```

1. Fetch available pages from `http://localhost:9222/json`
2. Connect to FigJam page's WebSocket debugger URL
3. Enable `Runtime` domain
4. Find execution context with `figma` global
5. Execute JS via `Runtime.evaluate`

## Shape Types

For shape commands, valid shape types:
- `ROUNDED_RECTANGLE` (default)
- `RECTANGLE`
- `ELLIPSE`
- `DIAMOND`
- `TRIANGLE_UP`
- `TRIANGLE_DOWN`
- `PARALLELOGRAM_RIGHT`
- `PARALLELOGRAM_LEFT`

## Known Issues

### Font Loading

All text operations require font loading first. The client handles this automatically with:
```javascript
await figma.loadFontAsync({ family: "Inter", style: "Medium" });
```

## Differences from Figma Design

| Feature | Figma Design | FigJam |
|---------|--------------|--------|
| `figma.editorType` | `"figma"` | `"figjam"` |
| Sticky notes | Not available | `figma.createSticky()` |
| Connectors | Not available | `figma.createConnector()` |
| Shape with text | Not available | `figma.createShapeWithText()` |
| Components | Available | Limited |
| Variables | Full support | Limited |
| Auto Layout | Full support | Not available |
