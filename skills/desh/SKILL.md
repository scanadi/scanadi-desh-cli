---
name: desh
description: |
  Use this skill whenever the user wants to work with Figma — creating designs, syncing tokens, rendering components, managing variables, exporting assets, or controlling Figma Desktop in any way. desh (Design Shell) is a CLI that controls Figma Desktop directly via Chrome DevTools Protocol, requiring no API key. Use this skill when: user mentions Figma, design systems, creating UI components, syncing design tokens, managing Figma variables, exporting from Figma, accessibility audits on designs, rendering JSX to Figma, or any design-to-code / code-to-design workflow. Even if the user doesn't say "desh" explicitly — if they want anything done in Figma, this is the skill to use.
---

# desh — Design Shell

CLI that controls Figma Desktop directly via CDP. No API key needed.

## The One Rule

**Never hand-draw a component that exists in code or a Figma library.**

If a component exists as a `.tsx` file in the codebase — push it to Figma with `desh components push`, then instance it. If it exists in a connected Figma library — instance it directly. The only time you create raw frames and text is for **custom page layouts** where no component exists anywhere.

This is the #1 mistake: writing a 500-line script to recreate a Button, Badge, Card, or Combobox out of raw frames when the real component is right there in the codebase. That approach produces something that looks like the component but isn't one — it can't be updated, doesn't track the code, and wastes time.

---

## Mandatory Workflow

Every task follows this sequence. You cannot skip ahead.

### Step 1: Discover (always)

```bash
desh connect

# What's in Figma already?
desh pages list
desh canvas info
desh lib list
desh lib collections
desh lib components --all-pages

# What's in the codebase?
desh components list               # scans code, shows what can be pushed
cat desh.config.json               # if it exists
```

After this step you should know:
- What Figma library components are available
- What local variables/collections exist
- What code components exist but aren't in Figma yet

### Step 2: Decide how to create (always)

For **every** UI element you're about to create, walk this decision tree:

```
Does it exist as a Figma library component?
  YES -> desh lib instance "component-key"     DONE.
  NO  -> Does it exist as a .tsx component in the codebase?
    YES -> desh components push (or desh sync)   -> then instance it.    DONE.
    NO  -> Is it a sub-part of something that exists? (e.g., a Button inside a Combobox)
      YES -> Instance the sub-part from the library/registry.    DONE.
      NO  -> NOW you may use desh render for a custom layout frame.
             Read references/render-and-scripts.md for syntax.
```

If you reach "desh render" — you're building a **layout container** (a page frame, a section wrapper, a grid), not a component. Components come from code or libraries. Layouts are the glue between them.

### Step 3: Build

**If using library components:**
```bash
desh lib search "Button" --file "LIBRARY_FILE_KEY"
desh lib instance "component-key-hash"
```

**If pushing code components first:**
```bash
desh components push                 # pushes all discovered components
cat .desh-registry.json              # verify registry was created
# Now render with component names — they auto-instance from registry:
desh render '<Frame name="Page" w={1440} flex="col">
  <Button variant="destructive">Delete</Button>
  <Card><CardHeader><Text>Title</Text></CardHeader></Card>
</Frame>'
```

**If creating layout-only frames (no component exists anywhere):**
Use `desh render` with JSX. Read `references/render-and-scripts.md` for syntax.

**CRITICAL: Always use `desh render` for creation.** Never use `eval` or `run` to create layouts, frames, or visual elements. The `render` command handles font loading, smart positioning, variable binding, and auto-layout sizing automatically — raw eval skips all of this and produces fragile, overlapping results. `eval` is ONLY for post-creation modifications (e.g., setting reactions, tweaking properties on existing nodes by ID).

### Step 4: Verify (always)

```bash
desh verify "NODE_ID"                # screenshot for visual check
```

Always verify after creating or modifying visual elements.

---

## Connection & Setup

```bash
desh connect                         # Patch Figma, verify CDP
desh init                            # Scan project, generate desh.config.json
desh sync                            # Push tokens + components to Figma
```

If permission error on macOS: System Settings -> Privacy & Security -> Full Disk Access -> add Terminal -> restart.
If Figma was updated: quit Figma, run `desh connect` again.

`desh.config.json`:
```json
{
  "tokens": ["packages/ui/globals.css"],
  "primitives": "packages/ui/src/components",
  "components": ["apps/web/src/components"],
  "libraryFileKey": "YOUR_FIGMA_LIBRARY_FILE_KEY"
}
```

Store the library file key here so you don't repeat it. Set `FIGMA_API_TOKEN` in `.env.local` for REST API features (search, import-all).

---

## Token & Variable Management

```bash
desh tokens sync                     # Push CSS tokens to Figma variables
desh var list [-t COLOR]             # List local variables
desh var create "name" -t COLOR -v "#fff"
desh var create-batch '<json>'
desh var set-batch '<json>'
desh bind fill "primary"             # Bind node fill to variable
desh bind stroke "border"
desh lib vars "Theme"                # List library variables by collection
desh lib import-vars "collection"    # Import library variables locally
```

Always use `var:` binding in render JSX (`bg="var:card"`, `color="var:foreground"`) when variables exist. Never hardcode hex values if a variable is available.

---

## Library Operations

```bash
desh lib list                        # Connected libraries
desh lib collections                 # Collection names + keys
desh lib vars "key-or-name"          # Variables in a collection
desh lib components                  # Instances on current page
desh lib components --all-pages      # Instances across entire file
desh lib search "Button" --file "KEY"  # Search library for component
desh lib search "check" --file "KEY" --include-icons  # Search including icons
desh lib instance "component-key"    # Create instance
desh lib import-all "KEY" [--dry-run]  # Import all from library
desh lib swap "1:234" "NewComp"      # Swap instance
desh lib styles                      # List styles
desh lib apply-style "style"         # Apply style
```

---

## Command Reference

### Discovery & Navigation
```bash
desh connect                         desh pages list
desh pages switch "name"             desh canvas info
desh find "Button"                   desh node tree ["id"] [-d depth]
desh files                           desh components list
```

### Create & Modify
```bash
desh render '<JSX>'                  desh render-batch '[...]'
desh create rect/ellipse/text/line/autolayout/icon/image/frame/component/group
desh set fill/stroke/radius/size/pos/opacity/autolayout/name
desh sizing hug|fill|fixed           desh padding/gap/align
desh eval "expression"               desh run script.js
```

### Canvas & Node Operations
```bash
desh canvas info                     desh canvas next
desh arrange [-g gap] [-c cols]      desh duplicate|dup
desh delete|remove                   desh select "1:234"
desh get ["1:234"]
desh node tree                       desh node bindings
desh node to-component "1:234"       desh node delete "1:234"
desh slot create/list/preferred/reset/add/convert
```

### Export & Analysis
```bash
desh export node "1:234" -s 2 -f png [-o file]
desh export css                      desh export tailwind
desh export-jsx "1:234"              desh export-storybook "1:234"
desh verify ["1:234"]
desh lint [--fix] [--rule name]
desh a11y audit|contrast|vision|touch|text
desh analyze colors|typography|spacing|clusters
```

### Other
```bash
desh blocks list                     desh blocks create dashboard-01
desh combos [--gap 60]               desh sizes --base small
desh raw query "//FRAME"             desh raw select/export
desh fj list/sticky/shape/connect/nodes/delete/eval
desh remove-bg                       desh sync [--force]
```

---

## Rules

1. **Instance over render, always.** If a component exists in a Figma library or can be pushed from code, instance it. Only use `desh render` for layout frames that aren't components.
2. **Push before hand-drawing.** If a codebase component isn't in Figma, run `desh components push` first, then instance it from the registry.
3. **Compose from library primitives.** If a component internally uses other library components (e.g., Combobox trigger IS a Button), instance those sub-parts from the library rather than recreating them with raw frames.
4. **Explore before creating.** Run the discovery commands in Step 1 before any render/eval/run.
5. **Use var: binding.** When variables exist, bind to them. Never hardcode colors.
6. **Export specific nodes.** Never export full pages. Use `desh export node "ID"` or `desh verify "ID"`.
7. **Verify after every change.** `desh verify "ID"` after creating or modifying.
8. **Never delete user nodes** without explicit permission.
9. **Never use eval/run to create layouts or visual elements.** `desh render` (JSX) is the ONLY creation tool. It handles font loading, smart positioning, variable binding, and auto-layout automatically. `eval` and `run` are for post-creation modifications only (e.g., setting prototype reactions, adjusting properties on existing nodes by ID). If your JSX is getting large, compose it with nested `<Frame>` elements — don't escape to eval.
10. **No emojis.** Use `<Icon name="lucide:...">` instead.
11. **One frame, one render.** Each `desh render` creates a new top-level frame. For multi-section layouts, nest everything in one root `<Frame>`.
12. **appendChild before FILL.** In eval/run scripts, append a node to an auto-layout parent before setting `layoutSizingHorizontal = 'FILL'`.
13. **Scripts stay small.** Keep `desh run` scripts under 200 lines. Break into phases.
14. **Don't freeze Figma.** Never `findAll` on root, never walk INSTANCE children.
15. **Shadows fail gracefully.** If shadow prop errors, use stroke + bg instead.
16. **Never use text characters as icons.** Never use "✓", "✕", "▾", "▴", or any Unicode character as a substitute for an icon. Always use library icon instances (`desh lib search "check" --file KEY --include-icons`) or `<Icon name="lucide:...">` in JSX render. Figma design system libraries typically contain the full Lucide icon set — search with `--include-icons` flag since icons are hidden by default. In `desh run` scripts, use `figma.importComponentByKeyAsync(key)` then `.createInstance()` to place library icons programmatically.

---

## Render & Script Reference

For JSX render syntax, script patterns, prototyping, and common gotchas, read `references/render-and-scripts.md`. Only consult this after confirming no component exists to instance (Step 2 of the workflow).
