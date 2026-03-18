# desh (Design Shell) Memory

## Project
- Clean TypeScript rewrite of figma-ds-cli as `desh`
- Pure CLI — no daemon, no background process
- Codebase-aware — reads actual project tokens/components
- Design spec: `docs/plans/2026-03-17-desh-rewrite-design.md`
- Implementation plan: `docs/superpowers/plans/2026-03-17-desh-implementation.md`

## Reference
- `.reference/` (gitignored) contains old JS codebase for porting logic
- `figma-plugin-api.md` — Figma Plugin API gotchas (keep — still relevant)
- `bugs-and-fixes.md` — historical bugs to avoid repeating (keep — still relevant)

## Key Architecture Decisions
- Per-command CDP connection (connect → eval → disconnect)
- desh.config.json for project scanning
- postcss for CSS token parsing (@theme, :root, .dark)
- ts-morph for cva() variant parsing from .tsx
- culori for OKLCH → sRGB color conversion
- Tailwind v4 only (no v3 support)
- No hardcoded shadcn presets — reads actual project files
