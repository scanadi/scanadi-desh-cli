# desh — Design Shell

<p align="center">
  <img src="https://img.shields.io/badge/Figma-Desktop-purple" alt="Figma Desktop">
  <img src="https://img.shields.io/badge/No_API_Key-Required-green" alt="No API Key">
  <img src="https://img.shields.io/badge/Claude_Code-Ready-blue" alt="Claude Code">
  <img src="https://img.shields.io/badge/TypeScript-Modular-3178c6" alt="TypeScript">
</p>

<p align="center">
  <b>Control Figma Desktop from the command line.</b><br>
  Reads your project's actual components and tokens. No API key required.<br>
  Works with Claude Code out of the box.
</p>

## What is This?

A CLI that connects directly to Figma Desktop and gives you complete control:

- **Codebase-Aware** — Reads your project's actual Tailwind v4 tokens, shadcn components, and icons
- **Pure CLI** — No daemon, no background process, each command connects and disconnects
- **Design Tokens** — Syncs CSS variables (`@theme`, `:root`, `.dark`) to Figma variables
- **Component Registry** — Parses cva() variants from your `.tsx` files, pushes to Figma
- **Create Anything** — Frames, text, shapes, icons (150k+ from Iconify), components
- **Slots** — Create and manage Figma's Slots feature for flexible component content
- **Team Libraries** — Import and use components, styles, variables from any library
- **Analyze & Lint** — Colors, typography, spacing, accessibility, contrast
- **Export** — PNG, SVG, JSX, Storybook stories, CSS variables
- **Batch Operations** — Rename layers, find/replace text, create 100 variables at once
- **Works with Claude Code** — Just ask in natural language, Claude knows all commands

---

## Quick Start

```bash
npm install -g desh

# 1. Set up your project
desh init

# 2. Connect to Figma Desktop
desh connect

# 3. Sync your design system
desh sync
```

That's it. Your project's tokens and components are now in Figma.

---

## Project Setup

`desh init` scans your project and generates `desh.config.json`:

```json
{
  "tokens": ["packages/ui/globals.css", "apps/web/globals.css"],
  "primitives": "packages/ui/src/components",
  "components": ["apps/web/src/components"]
}
```

- **tokens** — CSS files with `@theme`, `:root`, `.dark` blocks (Tailwind v4)
- **primitives** — Your shadcn/ui component directory
- **components** — App-level composed components

Works with monorepos (pnpm, turborepo, nx) and single-app projects.

---

## Design Tokens

desh reads your actual `globals.css` — no hardcoded presets:

```css
@theme {
  --color-primary: oklch(0.205 0 0);
  --radius-md: 0.375rem;
}

:root {
  --background: oklch(1 0 0);
  --primary: oklch(0.205 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --primary: oklch(0.985 0 0);
}
```

```bash
desh tokens sync    # → Figma variables with Light/Dark modes
```

---

## Components

desh reads your project's actual `.tsx` files, parses cva() variants, and renders them in Figma:

```bash
desh components list    # Show discovered components + variants
desh components sync    # Push to Figma as component sets

# Render a component using your project's actual variant definitions
desh render '<Button variant="destructive">Delete</Button>'
```

---

## JSX Rendering

```bash
desh render '<Frame name="Card" w={320} bg="#18181b" rounded={12} flex="col" p={24} gap={12}>
  <Text size={18} weight="bold" color="#fff" w="fill">Title</Text>
  <Text size={14} color="#a1a1aa" w="fill">Description</Text>
  <Frame bg="#3b82f6" px={16} py={8} rounded={6} flex="row" justify="center">
    <Text color="#fff">Button</Text>
  </Frame>
</Frame>'
```

Icons are real SVG vectors from Iconify:
```jsx
<Icon name="lucide:home" size={20} color="#fff" />
<Icon name="lucide:settings" size={20} color="var:foreground" />
```

Variable binding with `var:` syntax:
```jsx
<Frame bg="var:card" stroke="var:border">
  <Text color="var:foreground">Bound to project tokens</Text>
</Frame>
```

---

## Connection

Patches Figma once to enable CDP, then each command connects directly:

```
┌─────────────┐      WebSocket (CDP)      ┌─────────────┐
│    desh     │ <------------------------> │   Figma     │
│  (pure CLI) │      localhost:9222       │  Desktop    │
└─────────────┘                           └─────────────┘
```

```bash
desh connect     # Patch + verify (one-time)
```

No daemon, no background process, no session tokens.

---

## What You Need

- **Node.js 18+** — `brew install node`
- **Figma Desktop** (free account works)
- **macOS or Windows**
- **macOS Full Disk Access** for Terminal (one-time, for patching)

---

## All Features

### Design Tokens & Variables
- Sync tokens from project CSS (Tailwind v4 `@theme`, `:root`, `.dark`)
- OKLCH → sRGB color conversion
- Variable collections with Light/Dark modes
- Batch create/update/bind/rename variables
- Export as CSS custom properties

### Component Registry
- Parse cva() variants from `.tsx` files
- Two-layer system: primitives + app-level components
- Tailwind class → Figma property translation
- Icon library auto-detection (Lucide, Heroicons, Radix, react-icons)
- Font detection from CSS / next/font

### Create Elements
- Frames, rectangles, circles, text, lines
- Icons (150k+ from Iconify)
- Auto-layout with JSX syntax
- Components and component sets
- Slots for flexible content areas

### Modify & Layout
- Fill, stroke, radius, size, opacity
- Auto-layout (row/col, gap, padding)
- Sizing modes (hug/fill/fixed)
- Variable binding with `var:` syntax

### Analysis & Linting
- Color, typography, spacing analysis
- WCAG contrast checker (AA/AAA)
- Color blindness simulation
- Touch target size check
- Design lint rules with auto-fix

### Export
- PNG, SVG with scale factor
- JSX (React code)
- Storybook stories
- CSS variables
- Screenshots

### Team Libraries
- Import variables and components from libraries
- Create instances of library components
- Apply library styles
- Swap component instances

### FigJam
- Create sticky notes, shapes, text
- Connect elements with arrows
- Run JavaScript in FigJam context

---

## Full Command Reference

See [REFERENCE.md](REFERENCE.md) for all commands.

---

## How It Works

Connects to Figma Desktop via Chrome DevTools Protocol (CDP). No API key needed — uses your existing Figma session.

The CLI patches Figma's `app.asar` once to enable the debug port, then each command:
1. Connects via WebSocket to `localhost:9222`
2. Executes JavaScript via `Runtime.evaluate`
3. Disconnects

---

## Troubleshooting

### Permission Error When Patching (macOS)

1. **System Settings → Privacy & Security → Full Disk Access**
2. Add your Terminal app
3. Restart Terminal
4. Make sure Figma is closed
5. Run `desh connect`

### Windows

Run Command Prompt or PowerShell as Administrator, then `desh connect`.

### Figma Not Connecting

1. Figma Desktop must be running (not web)
2. Open a design file (not the home screen)
3. Run `desh connect`

---

## License

MIT
