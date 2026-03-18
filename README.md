# desh — Design Shell

<p align="center">
  <img src="https://img.shields.io/badge/Figma-Desktop-purple" alt="Figma Desktop">
  <img src="https://img.shields.io/badge/No_API_Key-Required-green" alt="No API Key">
  <img src="https://img.shields.io/badge/TypeScript-Modular-3178c6" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-AGPL--3.0-blue" alt="License">
</p>

<p align="center">
  <b>CLI that bridges your React/Tailwind codebase to Figma Desktop.</b><br>
  Sync tokens, push components, render layouts. No API key needed.
</p>

---

## What is desh?

desh connects directly to Figma Desktop via Chrome DevTools Protocol and gives you full read/write access to your design files — from the command line.

- **Codebase-Aware** — reads your Tailwind v4 tokens, shadcn components, and icons from source
- **Pure CLI** — no daemon, no background process. Each command connects, executes, disconnects
- **Design Tokens** — syncs `@theme`, `:root`, `.dark` CSS variables to Figma variables with Light/Dark modes
- **Component Registry** — scans `.tsx` files, pushes components to Figma, instances them in layouts
- **Library Integration** — search and import components from Figma team libraries via REST API
- **JSX Rendering** — create complex Figma layouts from JSX-like syntax with variable binding
- **Analysis** — lint designs, check accessibility (WCAG contrast, touch targets), analyze color/typography usage
- **Export** — PNG, SVG, JSX, CSS variables, Storybook stories

---

## Installation

**Prerequisites:** [Bun](https://bun.sh) or Node.js 18+, Figma Desktop (macOS or Windows)

```bash
# Clone the repo
git clone https://github.com/scanadi/scanadi-desh-cli.git
cd scanadi-desh-cli

# Install dependencies
bun install

# Build
bun run build

# Link globally (makes `desh` available everywhere)
bun link
```

After `bun link`, the `desh` command is available in any terminal. After making changes, just run `bun run build` — the link updates automatically.

---

## Quick Start

```bash
# 1. Connect to Figma Desktop (patches once, verifies connection)
desh connect

# 2. Set up your project (optional — scans codebase, generates config)
desh init

# 3. Sync tokens + components from code to Figma
desh sync

# 4. Create something
desh render '<Frame name="Card" w={320} bg="var:card" rounded={12} flex="col" p={24} gap={12}>
  <Text size={18} weight="bold" color="var:foreground" w="fill">Hello desh</Text>
</Frame>'
```

### First-Time Setup (macOS)

`desh connect` patches Figma to enable the debug port. This requires Full Disk Access:

1. **System Settings → Privacy & Security → Full Disk Access**
2. Add your Terminal app (Terminal, iTerm, Warp, VS Code, etc.)
3. **Restart Terminal**
4. Make sure Figma is **fully closed**
5. Run `desh connect`

This is a one-time setup. After patching, `desh connect` just verifies the connection.

If Figma updates, the patch is removed — just run `desh connect` again.

---

## How It Works

```mermaid
graph LR
    A[desh CLI] -->|WebSocket CDP| B[Figma Desktop]
    A -->|REST API| C[Figma API]
    D[Your Codebase] -->|tokens & components| A
    B -->|localhost:9222| A
```

desh patches Figma's `app.asar` to enable Chrome DevTools Protocol on port 9222. Each command:

1. Connects via WebSocket
2. Executes JavaScript in Figma's plugin context (`figma.*` API)
3. Returns the result
4. Disconnects

For library operations, desh also uses the Figma REST API (requires a personal access token).

No daemon, no background process.

---

## Project Configuration

`desh init` scans your project and generates `desh.config.json`:

```json
{
  "tokens": ["packages/ui/globals.css"],
  "primitives": "packages/ui/src/components",
  "components": ["apps/web/src/components"],
  "libraryFileKey": "AHtWZ4s34EqfhXcql7Scsu"
}
```

| Field | Purpose |
|-------|---------|
| `tokens` | CSS files with `@theme`, `:root`, `.dark` blocks (Tailwind v4) |
| `primitives` | Shared UI components directory (shadcn/ui) |
| `components` | App-level component directories |
| `libraryFileKey` | Figma library file key for component search/import (optional) |

Works with monorepos (pnpm, turborepo, nx) and single-app projects. You can also write the config manually.

---

## Design Tokens

desh reads your actual CSS — no hardcoded presets:

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
desh tokens push    # Creates Figma variables with Light/Dark modes
```

- **Color variables** → "semantic" collection (Light + Dark modes)
- **Float variables** → "primitives" collection (radius, spacing in px)
- **OKLCH, hex, HSL** — all CSS color formats supported

---

## Components

desh scans your `.tsx` files and discovers all exported React components:

```bash
desh components list              # Show all components with variants
desh components push              # Push to Figma as real Components/ComponentSets
```

- **cva() components** (Button, Badge, Toggle) → Figma ComponentSets with variant properties
- **Structural components** (Card, Dialog, Input) → Figma Components with sub-component slots
- **Component registry** (`.desh-registry.json`) → maps component names to Figma node IDs

After pushing, `desh render '<Button variant="destructive">Delete</Button>'` auto-instances from the registry.

---

## Team Libraries

Search and import components from connected Figma libraries via the REST API:

```bash
# Set your Figma API token (add to .env.local)
# FIGMA_API_TOKEN=figd_your_token_here

# Store the library file key
desh lib set-library "AHtWZ4s34EqfhXcql7Scsu"

# Search for components
desh lib search "Button"

# Import all components from a library
desh lib import-all "AHtWZ4s34EqfhXcql7Scsu" --dry-run

# Create an instance by key or name
desh lib instance "Button"
```

Get your API token at https://www.figma.com/developers/api#access-tokens

---

## JSX Rendering

Create complex Figma layouts from JSX-like syntax:

```bash
desh render '<Frame name="Card" w={340} bg="var:card" stroke="var:border" rounded={12} flex="col" p={20} gap={12}>
  <Text size={16} weight="semibold" color="var:foreground" w="fill">Title</Text>
  <Text size={14} color="var:muted-foreground" w="fill">Description text</Text>
  <Frame bg="var:primary" px={16} py={8} rounded={8} flex="row" justify="center">
    <Text color="var:primary-foreground">Button</Text>
  </Frame>
</Frame>'
```

**Tags:** `<Frame>`, `<Text>`, `<Icon>`, `<Slot>`, `<Rectangle>`, `<Ellipse>`, `<Line>`, `<Image>`

**Variable binding:** Any color prop accepts `var:name` to bind to a Figma variable:
```jsx
<Frame bg="var:card" stroke="var:border">
  <Text color="var:foreground">Bound to project tokens</Text>
</Frame>
```

**Icons:** Real SVG vectors from Iconify (150k+ icons):
```jsx
<Icon name="lucide:home" size={20} color="var:foreground" />
```

See [REFERENCE.md](REFERENCE.md) for the full prop reference.

---

## Key Commands

| Command | What it does |
|---------|-------------|
| `desh connect` | Patch Figma and verify CDP connection |
| `desh init` | Scan project, generate config |
| `desh sync` | Push tokens + components to Figma |
| `desh tokens push` | Sync CSS variables to Figma |
| `desh components list` | Show discovered components |
| `desh components push` | Push components as Figma Components |
| `desh render '<JSX>'` | Create Figma nodes from JSX |
| `desh eval "expression"` | Run JavaScript in Figma |
| `desh pages list` | List all pages |
| `desh pages switch "name"` | Navigate to a page |
| `desh find "name"` | Find nodes by name |
| `desh node tree` | Show node hierarchy |
| `desh var list` | List Figma variables |
| `desh lib search "query"` | Search library components |
| `desh lib instance "key"` | Create library component instance |
| `desh export node "id" -f png` | Export a node |
| `desh verify "id"` | Screenshot for verification |
| `desh lint` | Lint current page |
| `desh a11y audit` | Full accessibility audit |
| `desh analyze colors` | Analyze color usage |
| `desh text set "id" "content"` | Set text on a node |
| `desh resize "id" 44 44` | Resize a node |

See [REFERENCE.md](REFERENCE.md) for the complete command reference.

---

## Built for AI Agents

desh is designed to be controlled by AI coding agents like **Claude Code**, **Cursor**, and similar tools. Instead of clicking through Figma's UI, tell your AI agent what you want and it drives desh to make it happen.

**Included skill file** — [`skills/desh/SKILL.md`](skills/desh/SKILL.md) teaches any AI agent the full desh workflow:

```mermaid
graph TD
    A[User: Create a dashboard] --> B[AI Agent reads desh skill]
    B --> C{What exists?}
    C -->|Check library| D[desh lib search]
    C -->|Check tokens| E[desh var list]
    C -->|Check codebase| F[desh components list]
    D --> G[Instance existing components]
    E --> H[Bind to variables]
    F --> I[Push missing components]
    G --> J[Render layout in Figma]
    H --> J
    I --> J
```

The skill teaches a **discovery-first workflow** — explore what exists, bridge the gaps, then create. This prevents the common AI mistake of rebuilding components from scratch when they already exist in your design system.

**To use with Claude Code:** Add the skill to your project or point Claude at the `skills/desh/SKILL.md` file. Claude will automatically use desh for any Figma-related task.

---

## Development

```bash
bun install          # Install dependencies
bun run build        # Build (output: dist/cli.js)
bun run dev          # Watch mode — rebuild on changes
bun test             # Run tests
bun run lint         # Type check
```

After `bun link`, any `bun run build` automatically updates the global `desh` command.

---

## Troubleshooting

### Permission Error When Patching (macOS)

System Settings → Privacy & Security → Full Disk Access → add Terminal → restart Terminal → close Figma → `desh connect`

### Figma Not Connecting

1. Figma Desktop must be running (not the web version)
2. Open a design file (not the home screen)
3. Run `desh connect`

If Figma was updated, the patch was removed — `desh connect` detects this and re-patches automatically.

### Connection Timeout After Heavy Operation

If a large query freezes Figma, quit and reopen Figma. `desh connect` will reconnect.

### Windows

Run Command Prompt or PowerShell as Administrator, then `desh connect`.

---

## Author

**[Stevica Canadi](https://github.com/scanadi)**

## License

AGPL-3.0 — see [LICENSE](LICENSE) for details. Attribution required for all derivative works.
