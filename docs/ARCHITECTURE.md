# Architecture

## How desh Works

```
┌─────────────────┐      Chrome DevTools      ┌─────────────────┐
│      desh       │ ◄────── Protocol ───────► │  Figma Desktop  │
│    (pure CLI)   │      (localhost:9222)     │                 │
└─────────────────┘                           └─────────────────┘
```

### Technology Stack

1. **Chrome DevTools Protocol (CDP)**: Figma Desktop is an Electron app with a Chromium runtime. We connect via CDP on port 9222.

2. **Custom CDP Client**: A lightweight WebSocket client that handles connection, evaluation, and disconnection per command.

3. **Figma Plugin API**: We execute JavaScript against the global `figma` object, which provides full access to the Figma Plugin API.

### Connection Flow

1. User runs `desh connect`
2. CLI patches Figma to enable remote debugging (adds `--remote-debugging-port=9222` flag)
3. Figma restarts with debugging enabled
4. Each command connects via WebSocket, executes, and disconnects

### Project Scanning

When `desh.config.json` exists, the CLI reads the project's actual:
- **Tokens** — CSS variables from `@theme`, `:root`, `.dark` blocks (Tailwind v4)
- **Components** — cva() variant maps from `.tsx` files (ts-morph)
- **Icons** — detected from `package.json` dependencies
- **Fonts** — from `@theme`, `next/font`, CSS imports

### Key Structure

```
desh/
├── src/
│   ├── cli.ts               # Entry point, commander setup
│   ├── config.ts            # desh.config.json read/write + cache
│   ├── cdp/                 # CDP WebSocket client
│   ├── scanner/             # Project scanning (tokens, components, icons, fonts)
│   ├── codegen/             # Code generation (JSX, Tailwind, colors, tokens)
│   ├── commands/            # All command implementations
│   ├── patch/               # Figma binary patching
│   └── utils/               # HTTP client, terminal output
├── package.json
└── tsconfig.json
```

### No API Key Required

Unlike the Figma REST API which requires authentication, we use the Plugin API directly through the desktop app. This means:

- Full read/write access to everything
- No rate limits
- Access to features not available in REST API (like variable modes)
- Works with the user's existing Figma session

### Limitations

- macOS and Windows only
- Requires Figma Desktop (not web)
- One Figma instance at a time
