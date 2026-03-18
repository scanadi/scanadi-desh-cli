# Figma REST API Integration

**Date:** 2026-03-18
**Status:** Approved
**Scope:** Add Figma REST API support for library component discovery and import

---

## Problem

Figma's Plugin API (via CDP) cannot list library components — only variables. When a library is connected but no instances exist in the file, there's no way to discover or import components.

## Solution

Use the Figma REST API (`api.figma.com`) alongside CDP. The REST API can list all components in any file, including library files. This enables:

```bash
desh lib import-all "library-file-key"    # Import every component from a library
desh lib search "Button"                   # Search components across libraries
```

## Architecture

```
desh lib import-all "file-key"
  │
  ├── 1. GET /v1/files/:file_key/components  (REST API)
  │       Returns: [{ key, name, description, ... }]
  │
  ├── 2. For each component:
  │       figma.importComponentByKeyAsync(key)  (CDP/Plugin API)
  │       component.createInstance()
  │
  └── 3. Store keys in .desh-registry.json for future use
```

## API Token

Figma REST API requires a personal access token. Storage priority:
1. `FIGMA_API_TOKEN` environment variable (recommended — add to `.env`)
2. `figmaApiToken` in `desh.config.json`

Get your token at: https://www.figma.com/developers/api#access-tokens

## New Commands

### `desh lib import-all <fileKey>`
Import all components from a Figma library file.

```bash
# Get the file key from the library file URL:
# https://www.figma.com/design/ABC123/My-Library → file key is "ABC123"
desh lib import-all "ABC123"
```

1. Calls `GET /v1/files/ABC123/components`
2. Lists all components with names
3. For each: `figma.importComponentByKeyAsync(key)` → creates local reference
4. Saves all keys to `.desh-registry.json`

### `desh lib search <query>`
Search for components in connected libraries.

```bash
desh lib search "Button"
# Returns:
#   Button (default/destructive/outline/ghost/secondary/subtle)  key: abc123
#   IconButton  key: def456
```

### `desh auth`
Set up Figma API token.

```bash
desh auth                    # Interactive: prompts for token, saves to ~/.desh/config.json
desh auth --token "figd_..."  # Non-interactive
desh auth --status           # Check if token is configured
```

## REST API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/files/:key/components` | List all components in a file |
| `GET /v1/files/:key/component_sets` | List all component sets |
| `GET /v1/files/:key/styles` | List all styles |
| `GET /v1/files/:key` | Get file metadata (name, pages) |

All require header: `X-Figma-Token: <token>`

## File Changes

| File | Change |
|------|--------|
| `src/api/figma-rest.ts` | **New.** REST API client |
| `src/api/auth.ts` | **New.** Token storage/retrieval |
| `src/commands/auth.ts` | **New.** `desh auth` command |
| `src/commands/lib.ts` | **Modify.** Add `import-all`, `search` |
| `src/registry.ts` | **Modify.** Store component keys from REST API |
| `.gitignore` | Add `~/.desh/` config path |

## Security

- Token stored in `~/.desh/config.json` with 0600 permissions (owner-only read)
- Never logged or included in error messages
- `desh auth --status` shows "configured" / "not configured", never the token value
