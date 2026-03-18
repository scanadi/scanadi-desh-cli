# desh — Design Shell Rewrite

**Date:** 2026-03-17
**Status:** Approved
**Scope:** Clean TypeScript rewrite of figma-ds-cli as a pure CLI tool

---

## 1. Vision

Replace the current Node.js CLI with a clean, modular TypeScript codebase that:

- Is a **pure CLI** — no daemon, no background process, no MCP-like middleware
- Is **codebase-aware** — reads the project's actual Tailwind v4 tokens, components, and icon library instead of hardcoded presets
- Connects directly to Figma Desktop via CDP per command — connect, execute, disconnect
- Preserves all existing commands (minus daemon/safe mode)
- Ships as a single npm package with zero-config install

The binary is the bridge between a React/Tailwind/shadcn codebase and Figma.

---

## 2. What Is Dropped

| Dropped | Reason |
|---------|--------|
| Daemon (start/stop/status/restart/diagnose) | Pure CLI — per-command CDP connection |
| Safe Mode (plugin bridge) | CDP-only; plugin bridge adds complexity |
| `connect --safe` flag | Gone with safe mode |
| Session token / `.daemon-token` file | No daemon, no auth needed |
| `fig-start` shell script | Just run `desh` |
| `setup-alias` | npm global install |
| Hardcoded shadcn component presets (`shadcn.js`) | Reads actual project components |
| Hardcoded token presets (`tokens preset shadcn/tailwind`) | Reads actual project CSS |
| Tailwind v3 support | v4 only — `@theme` in CSS is the source of truth |
| `figma-use` dependency references | Custom CDP client throughout |

## 3. What Is Added

| Feature | What |
|---------|------|
| `desh init` | Project scanner, generates desh.config.json |
| `desh sync` | Full sync: tokens + components + icons + fonts |
| Project scanner | Monorepo detection, workspace awareness |
| cva() parser | Reads real variant maps from .tsx files (ts-morph) |
| Tailwind class resolver | Maps utility classes to Figma properties via @theme |
| OKLCH color conversion | Native CSS color format support (culori) |
| Icon library detection | Reads package.json, maps to Iconify prefixes |
| Font detection | From @theme, next/font, CSS imports |
| `desh lib` commands | Team library management |
| `desh a11y` commands | Accessibility auditing |
| `desh raw` commands | XPath queries on Figma tree |
| Cache system | .desh-cache.json, mtime-based invalidation |
| TypeScript | Full type safety, modular architecture |

---

## 3. Architecture

```
desh <command> [args]
      │
      ▼
┌─────────────────────────┐
│      CLI Layer          │  commander — argument parsing, help
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│    Project Scanner      │  reads desh.config.json → locates token files,
│  (project-aware cmds)   │  primitive paths, component paths
└────────────┬────────────┘
             │
     ┌───────┴───────┐
     │               │
     ▼               ▼
┌──────────┐  ┌─────────────────────┐
│  Token   │  │  Component Registry │
│ Extractor│  │                     │
│          │  │  primitives layer   │
│ @theme   │  │  + components layer │
│ :root    │  │  cva() parser       │
│ .dark    │  │  Tailwind resolver  │
└────┬─────┘  └──────────┬──────────┘
     │                   │
     └─────────┬─────────┘
               │
               ▼
┌─────────────────────────┐
│    Code Generator       │  TS → JS string
│                         │  JSX parser, codegen per command
└────────────┬────────────┘
             │  JS string
             ▼
┌─────────────────────────┐
│      CDP Client         │  connect → Runtime.evaluate → disconnect
│                         │  ws library, per-command connection
│                         │  ~50ms overhead per command
└────────────┬────────────┘
             │  WebSocket
             ▼
        Figma Desktop
        localhost:9222
```

**Two categories of commands:**

- **Project-aware:** `sync`, `tokens sync`, `components sync`, `render` (with project components) — these read `desh.config.json` and scan the codebase
- **Standalone:** `eval`, `connect`, `create`, `find`, `canvas`, `export`, `verify`, `set`, `select`, `get`, `node`, `arrange`, `delete`, `duplicate` — pure Figma operations, no config needed

---

## 4. Project Configuration

### desh.config.json

Lives at project or monorepo root. Created by `desh init`.

```json
{
  "tokens": [
    "packages/ui/globals.css",
    "apps/web/globals.css"
  ],
  "primitives": "packages/ui/src/components",
  "components": [
    "apps/web/src/components",
    "apps/dashboard/src/components"
  ]
}
```

- `tokens` — one path or array. Parsed in order; later files override earlier ones.
- `primitives` — path to shared UI package (shadcn primitives)
- `components` — array of paths to app-level components

Single-app projects:

```json
{
  "tokens": "src/app/globals.css",
  "primitives": "src/components/ui",
  "components": ["src/components"]
}
```

### desh init

Interactive setup that detects monorepo structure:

1. Check for monorepo markers (pnpm-workspace.yaml, turbo.json, nx.json)
2. If monorepo → scan workspace packages for `globals.css`, find `/ui/` package as primitives candidate
3. If single app → look for `src/components/ui`, `src/components`, `src/app/globals.css`
4. Present findings interactively, user confirms or edits
5. Write `desh.config.json`

User can also write the config manually and skip `desh init`.

### Cache

`.desh-cache.json` at config root. Stores parsed tokens + component registry. Invalidated by mtime checks on source files. `desh sync --force` forces full rescan.

---

## 5. Design Token Pipeline

### Source Format (Tailwind v4 — CSS only)

```css
/* globals.css */
@import "tailwindcss";

@theme {
  --color-primary: oklch(0.205 0 0);
  --font-sans: "Inter", sans-serif;
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.05);
}

:root {
  --background:         oklch(1 0 0);
  --foreground:         oklch(0.145 0 0);
  --primary:            oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  /* ... */
}

.dark {
  --background:   oklch(0.145 0 0);
  --foreground:   oklch(0.985 0 0);
  /* ... */
}
```

No `tailwind.config.ts` — Tailwind v4 uses `@theme` in CSS as the single source of truth.

### Extraction Pipeline

```
globals.css
  │
  ├── Parse @theme blocks      → spacing, fonts, radius, shadows, color scale
  ├── Parse :root {}           → semantic color vars (light mode)
  └── Parse .dark {}           → semantic color vars (dark mode)
          │
          ▼
  OKLCH → RGB conversion (culori)
    oklch(0.577 0.245 27.325)
      → { r: 0.86, g: 0.15, b: 0.15 }
          │
          ▼
  Figma Variables (via CDP)
    Collection "semantic"
      Light mode: --primary → rgb(...)
      Dark mode:  --primary → rgb(...)
    Collection "primitives"
      spacing-1 → 4, spacing-4 → 16
      radius-sm → 4, radius-lg → 8
      font-sans → "Inter"
```

Multiple `tokens` files are merged in declared order.

---

## 6. Component Registry

### Two-Layer Structure

```
Layer 1: primitives (packages/ui/src/components/)
  Button, Card, Input, Badge, Switch, Tabs...
  Source: the project's actual shadcn/ui install

Layer 2: components (apps/web/src/components/, ...)
  LoginForm, DashboardHeader, PricingCard...
  Import from primitives + local files
```

Layer 2 takes priority on name collision.

**No fallback to embedded presets.** If no config exists, commands that need components tell you to run `desh init`.

### Component Parsing (ts-morph)

The parser reads `.tsx` files and extracts:

1. **cva() variant maps** — base classes + all variant combinations
2. **Imported icons** — which lucide-react / heroicons icons are used
3. **Composition** — sub-components used inside (CardHeader inside Card)
4. **Props interface** — TypeScript prop types

Parsed result:

```
Button
  variants:
    variant: [default, destructive, outline, ghost]
    size: [sm, default, lg, icon]
  base: inline-flex, items-center, rounded-md, text-sm, font-medium
  variant[default]:     fill=var(primary), color=var(primary-foreground)
  variant[destructive]: fill=var(destructive), color=var(destructive-foreground)
  size[sm]:      h=36, px=12
  size[default]: h=40, px=16, py=8
  size[lg]:      h=44, px=32
  size[icon]:    h=40, w=40
```

### Tailwind Class → Figma Translator

Maps utility classes to Figma properties by looking up values in the parsed `@theme` tokens:

| Tailwind class | Figma property |
|----------------|---------------|
| `bg-primary` | fill: var(--primary) |
| `text-primary-foreground` | color: var(--primary-foreground) |
| `h-10` | height: 40 |
| `px-4 py-2` | paddingH: 16, paddingV: 8 |
| `rounded-md` | cornerRadius: var(--radius) |
| `border border-input` | stroke: var(--border), strokeWidth: 1 |
| `inline-flex` | layoutMode: HORIZONTAL |
| `flex-col` | layoutMode: VERTICAL |
| `items-center` | counterAxisAlignItems: CENTER |
| `justify-between` | primaryAxisAlignItems: SPACE_BETWEEN |
| `gap-2` | itemSpacing: 8 |
| `text-sm` | fontSize: 14 |
| `font-medium` | fontWeight: 500 |
| `w-full` | layoutSizingHorizontal: FILL |
| `shadow-sm` | effects: [dropShadow(...)] |

No Tailwind JS runtime needed — pure string mapping against @theme values.

---

## 7. Icon + Font Detection

### Icon Library Detection

Reads `package.json` to detect which icon library the project uses:

| Package | Detection | Iconify prefix |
|---------|-----------|----------------|
| `lucide-react` | `dependencies.lucide-react` | `lucide:` |
| `@heroicons/react` | `dependencies.@heroicons/react` | `heroicons:` |
| `@radix-ui/react-icons` | `dependencies.@radix-ui/react-icons` | `radix-icons:` |
| `react-icons` | `dependencies.react-icons` | scan import paths for sub-package |

Icons are fetched as SVGs from Iconify API (free, no key needed).

### Font Detection

Extracted from:
1. `@theme { --font-sans: "Inter", sans-serif; }` in globals.css
2. `next/font` imports in `layout.tsx` / `_app.tsx`
3. `@import url(...)` Google Fonts in CSS

---

## 8. Command Reference

### Connection & Setup
```bash
desh init                          # scan project, generate desh.config.json
desh connect                       # patch Figma once + verify CDP responds
desh sync                          # full sync: tokens + components + icons + fonts
desh files                         # list open Figma files
desh verify [node-id]              # screenshot for AI verification
```

### Token & Variable Commands
```bash
desh tokens sync                   # extract from globals.css → Figma variables
desh var list                      # show all variables
desh var list -t COLOR             # filter by type
desh var visualize                 # show color swatches on canvas
desh var create "name" ...         # create single variable
desh var delete-all                # delete all variables
desh var delete-all -c "..."       # delete specific collection
desh var collections list          # list all collections
desh var collections create "name" # create new collection
desh var create-batch '<json>'     # create up to 100 variables at once
desh var delete-batch '<nodeIds>'  # delete multiple variables
desh var bind-batch '<json>'       # bind multiple variables to nodes
desh var set-batch '<json>'        # set values across modes in batch
desh var rename-batch '<json>'     # rename multiple variables
desh bind fill "primary"           # bind fill to variable
desh bind stroke "border"
desh bind radius "radius-md"
desh bind gap "spacing-md"
desh bind padding "spacing-lg"
```

### Component Commands
```bash
desh components sync               # read project .tsx → push to Figma
desh components list               # show discovered components + variants + source
```

### Render & Create
```bash
desh render '<Button variant="destructive">Delete</Button>'
desh render '<Card><CardHeader>...</CardHeader></Card>'
desh render-batch '[...]' -d row -g 40
desh eval "figma.currentPage.name"
desh run /path/to/script.js

desh create rect "Card" -w 320 -h 200 --fill "#fff" --radius 12
desh create ellipse "Avatar" -w 48 -h 48 --fill "var:primary"
desh create text "Hello" -s 24 -c "#000"
desh create line -l 200
desh create autolayout "Card" -d col -g 16 -p 24
desh create icon lucide:star -s 24
desh create image "https://..." -w 200
desh create group / component / frame
```

### Modify Elements
```bash
desh set fill "#3b82f6"
desh set fill "var:primary"
desh set stroke "#e4e4e7" -w 1
desh set stroke "var:border"
desh set radius 12
desh set size 320 200
desh set pos 100 100
desh set opacity 0.5
desh set autolayout row -g 8 -p 16
desh set name "Header"
desh sizing hug|fill|fixed
desh padding 16
desh gap 16
desh align center
```

### Find & Select
```bash
desh find "Button"
desh find "Card" -t FRAME
desh select "1:234"
desh get
desh get "1:234"
```

### Canvas & Layout
```bash
desh canvas info
desh canvas next
desh arrange -g 100
desh arrange -g 100 -c 3
desh duplicate
desh dup "1:234" --offset 50
desh delete
desh delete "1:234"
```

### Node Operations
```bash
desh node tree
desh node tree "1:234" -d 5
desh node bindings
desh node to-component "1:234"
desh node delete "1:234"
```

### Slots
```bash
desh slot create "Content"
desh slot create "Actions" --flex row --gap 8
desh slot list
desh slot list "1:234"
desh slot preferred "Slot#1:2" "comp-id-1"
desh slot reset
desh slot add "slot-id" --component "comp-id"
desh slot add "slot-id" --frame
desh slot add "slot-id" --text "Hello"
desh slot convert --name "Actions"
```

### Export
```bash
desh export css
desh export tailwind
desh export screenshot -f png -o out.png
desh export screenshot -f png -s 2
desh export screenshot -f svg -o out.svg
desh export node "1:234" -s 2 -f png
desh export node "1:234" -f svg
desh export-jsx "1:234"
desh export-storybook "1:234"
```

### Analysis & Linting
```bash
desh lint
desh lint --fix
desh lint --rule color-contrast
desh lint --preset accessibility
desh analyze colors
desh analyze typography
desh analyze spacing
desh analyze clusters
```

### Accessibility
```bash
desh a11y contrast
desh a11y vision
desh a11y touch
desh a11y text
desh a11y audit
```

### XPath & Raw Queries
```bash
desh raw query "//FRAME"
desh raw query "//*[contains(@name, 'Button')]"
desh raw select "1:234"
desh raw export "1:234" --scale 2
```

### Team Libraries
```bash
desh lib list
desh lib collections
desh lib import vars "collection-name"
desh lib import components "lib-name"
desh lib instance "component-name"
desh lib swap "1:234" "new-component-name"
desh lib styles
desh lib apply-style "style-name"
```

### Website Recreation
```bash
desh recreate-url "https://example.com" --name "Page"
desh screenshot-url "https://example.com"
desh analyze-url "https://example.com"
```

### FigJam
```bash
desh fj list
desh fj sticky "Text" -x 100 -y 100
desh fj shape "Label" -x 200 -y 100
desh fj connect "ID1" "ID2"
desh fj nodes
desh fj delete "ID"
desh fj eval "..."
```

### Blocks & Utilities
```bash
desh blocks list
desh blocks create dashboard-01
desh combos
desh combos "1:234" --gap 60
desh sizes --base small
desh remove-bg
desh verify
```

---

## 9. Module Structure

```
desh/
  package.json
  tsconfig.json
  tsup.config.ts
  src/
    cli.ts                     # entry point, commander setup, command registration
    config.ts                  # desh.config.json read/write + cache
    cdp/
      client.ts                # WebSocket CDP client (ws)
      protocol.ts              # CDP message types
    scanner/
      project.ts               # detect monorepo, find config files
      tokens.ts                # parse @theme, :root, .dark from CSS (postcss)
      components.ts            # scan .tsx files, parse cva() (ts-morph)
      icons.ts                 # detect icon library from package.json
      fonts.ts                 # detect fonts from CSS + next/font
    codegen/
      jsx.ts                   # JSX string → Figma API JS code
      tailwind.ts              # Tailwind class → Figma property map
      color.ts                 # OKLCH → sRGB conversion (culori)
      tokens.ts                # token values → Figma variable creation JS
      components.ts            # component registry → Figma component set JS
    commands/
      init.ts                  # desh init
      connect.ts               # desh connect (patch + verify)
      sync.ts                  # desh sync (orchestrates tokens + components)
      tokens.ts                # desh tokens / var / bind
      components.ts            # desh components
      render.ts                # desh render / render-batch
      eval.ts                  # desh eval / run
      create.ts                # desh create
      set.ts                   # desh set / sizing / padding / gap / align
      find.ts                  # desh find / select / get
      canvas.ts                # desh canvas / arrange
      node.ts                  # desh node
      slot.ts                  # desh slot
      export.ts                # desh export / export-jsx / export-storybook
      lint.ts                  # desh lint / analyze
      a11y.ts                  # desh a11y
      lib.ts                   # desh lib (team libraries)
      raw.ts                   # desh raw (XPath)
      recreate.ts              # desh recreate-url / screenshot-url
      figjam.ts                # desh fj
      blocks.ts                # desh blocks / combos / sizes
      verify.ts                # desh verify
      files.ts                 # desh files
    patch/
      figma.ts                 # Figma binary patching (app.asar)
    utils/
      http.ts                  # HTTP client — Iconify, Unsplash
      output.ts                # terminal formatting (chalk)
    assets/
      blocks/
        dashboard-01.js        # embedded block templates
```

---

## 10. CDP Connection

No daemon. Each command:

1. Check `~/.desh/config.json` for last known CDP port (default 9222)
2. `GET http://localhost:{port}/json` → list open tabs
3. Find design/file tab (regex: `/figma.com\/(design|file)\//`)
4. WebSocket connect to tab's `webSocketDebuggerUrl`
5. `Runtime.evaluate({ expression: jsCode, awaitPromise: true, timeout: 30000 })`
6. Parse result, disconnect

**Port:** Fixed at 9222 (set during Figma patching). On miss, scan 9222-9322 in case user changed it. Cache working port.

**Timeouts:**
- Default: 30s
- Render with icons: 90s
- Batch render: 60s

---

## 11. Binary Patching

Port of existing `figma-patch.js` logic to TypeScript.

- **macOS:** patch `/Applications/Figma.app/Contents/Resources/app.asar`
- **Windows:** patch `%LOCALAPPDATA%\Figma\*\resources\app.asar`
- Find byte sequence: `removeSwitch("remote-debugging-port")`
- Replace with: `removeSwitch("remote-debugXing-port")`
- Re-sign macOS: `codesign --force --deep --sign - /Applications/Figma.app`
- One-time operation; `desh connect` checks if already patched

---

## 12. External API Keys

Read in priority order:
1. Environment variable
2. `desh.config.json` field
3. Prompted interactively, saved to `~/.desh/config.json`

| Service | Env var | Config key | Required for |
|---------|---------|------------|--------------|
| Unsplash | `UNSPLASH_ACCESS_KEY` | `unsplashKey` | `create image` keyword search |
| remove.bg | `REMOVEBG_API_KEY` | `removeBgKey` | `remove-bg` command |

Iconify is free, no key needed.

---

## 13. Tech Stack

| Purpose | Library | Why |
|---------|---------|-----|
| CLI parsing | `commander` | Proven, good DX |
| WebSocket (CDP) | `ws` | Lightweight, battle-tested |
| CSS parsing | `postcss` | Industry standard for @theme/:root/.dark |
| TSX/cva() parsing | `ts-morph` | Full TypeScript AST — cva() extraction, props, imports |
| Color conversion | `culori` | OKLCH → sRGB, all CSS color formats, tiny |
| Terminal output | `chalk` | Standard |
| HTTP (Iconify) | Built-in `fetch` | Node 18+ native, no extra deps |
| Bundler | `tsup` | Bundles TS → single JS, esbuild under the hood |
| Test runner | `vitest` | Fast, TS-native |

**Runtime:** Node 18+

---

## 14. Testing Strategy

### Unit Tests (no Figma needed)
- OKLCH → sRGB conversion: round-trip accuracy against reference values
- Tailwind class → Figma property mapping: table-driven tests
- CSS parser: `@theme`, `:root`, `.dark` extraction from fixture CSS files
- cva() parser: extract variant maps from fixture `.tsx` files
- JSX parser: input JSX → expected JS output (snapshot tests)

### Integration Tests (mocked CDP)
- CDP client: mock WebSocket server that echoes `Runtime.evaluate` payloads
- Command handlers: verify correct JS is generated for each command

### Acceptance Tests (real Figma, opt-in)
- Gated behind `FIGMA_ACCEPTANCE_TESTS=1` env var
- Run against a live Figma file
- Not run in CI

---

## 15. Distribution

```bash
npm install -g desh
```

Or use npx:
```bash
npx desh init
npx desh connect
npx desh sync
```

Binary name: `desh`
npm package: `desh` (or `@scope/desh`)

---

## 16. Out of Scope

- Figma REST API features (comments, version history, team management)
- Tailwind v3 support
- Daemon / background process
- Plugin bridge (safe mode)
- Hardcoded component presets
