# desh (Design Shell) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a modular TypeScript CLI (`desh`) that controls Figma Desktop via CDP, reads project tokens/components from source, and replaces the old Node.js monolith.

**Architecture:** Pure CLI with per-command CDP connections. Project scanner reads `desh.config.json` to locate CSS token files and TSX component files. Code generators produce Figma Plugin API JavaScript strings that are sent to Figma via `Runtime.evaluate` over WebSocket.

**Tech Stack:** TypeScript, commander, ws, postcss, ts-morph, culori, chalk, tsup, vitest

**Spec:** `docs/plans/2026-03-17-desh-rewrite-design.md`
**Reference code:** `.reference/` (gitignored — old JS codebase for porting logic)

---

## Phase Overview

| Phase | What | Produces |
|-------|------|----------|
| 1 | Project scaffold + CDP client + connect | `desh connect` works, can eval JS in Figma |
| 2 | Config + token pipeline | `desh init`, `desh tokens sync`, `desh var list` |
| 3 | Component registry + render | `desh components list`, `desh render` |
| 4 | Core commands (create, set, find, canvas, node) | All standalone commands |
| 5 | Advanced commands (export, lint, a11y, slots, blocks, lib, fj) | Full command surface |

Each phase is independently committable and testable.

---

## Phase 1: Scaffold + CDP Client + Connect

### Task 1.1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `src/cli.ts`

- [ ] **Step 1: Initialize package.json**

```bash
cd /Users/stevicacanadi/projects/figma-cli
npm init -y
```

Then edit `package.json`:

```json
{
  "name": "desh",
  "version": "0.1.0",
  "description": "Design Shell — control Figma Desktop from the command line",
  "type": "module",
  "bin": {
    "desh": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit",
    "start": "node dist/cli.js"
  },
  "engines": {
    "node": ">=18"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Install core dependencies**

```bash
npm install commander ws chalk culori
npm install -D typescript tsup vitest @types/node @types/ws
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", ".reference"]
}
```

- [ ] **Step 4: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
```

- [ ] **Step 5: Create minimal src/cli.ts**

```typescript
import { Command } from 'commander';

const program = new Command();

program
  .name('desh')
  .description('Design Shell — control Figma Desktop from the command line')
  .version('0.1.0');

program.parse();
```

- [ ] **Step 6: Build and verify**

```bash
npm run build && node dist/cli.js --help
```

Expected: Shows help output with `desh` name and version.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json tsup.config.ts src/cli.ts .gitignore
git commit -m "feat: scaffold desh TypeScript project"
```

---

### Task 1.2: Platform helpers

**Files:**
- Create: `src/patch/platform.ts`
- Create: `tests/patch/platform.test.ts`

Port `.reference/platform.js` to TypeScript. Only path detection + Figma launch/kill. Use `execFileSync` instead of `execSync` where possible to avoid shell injection.

- [ ] **Step 1: Write tests**

```typescript
// tests/patch/platform.test.ts
import { describe, it, expect } from 'vitest';
import { getAsarPath, getFigmaBinaryPath, getFigmaCommand } from '../../src/patch/platform.js';

describe('platform', () => {
  it('getAsarPath returns a string on supported platforms', () => {
    const path = getAsarPath();
    if (process.platform === 'darwin') {
      expect(path).toBe('/Applications/Figma.app/Contents/Resources/app.asar');
    } else if (process.platform === 'win32') {
      expect(typeof path === 'string' || path === null).toBe(true);
    }
  });

  it('getFigmaBinaryPath returns a string', () => {
    const path = getFigmaBinaryPath();
    expect(typeof path === 'string' || path === null).toBe(true);
  });

  it('getFigmaCommand includes the port', () => {
    const cmd = getFigmaCommand(9222);
    if (cmd) {
      expect(cmd).toContain('9222');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/patch/platform.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement platform.ts**

```typescript
// src/patch/platform.ts
import { execFileSync, spawn } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

const PLATFORM = process.platform;

const ASAR_PATHS: Record<string, string> = {
  darwin: '/Applications/Figma.app/Contents/Resources/app.asar',
  linux: '/opt/figma/resources/app.asar',
};

function findWindowsAsarPath(): string | null {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;
  const figmaBase = join(localAppData, 'Figma');
  if (!existsSync(figmaBase)) return null;
  try {
    const entries = readdirSync(figmaBase);
    const appFolders = entries.filter(e => e.startsWith('app-')).sort().reverse();
    for (const folder of appFolders) {
      const asarPath = join(figmaBase, folder, 'resources', 'app.asar');
      if (existsSync(asarPath)) return asarPath;
    }
  } catch {}
  return null;
}

function findWindowsFigmaExe(): string | null {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;
  const figmaBase = join(localAppData, 'Figma');
  const mainExe = join(figmaBase, 'Figma.exe');
  if (existsSync(mainExe)) return mainExe;
  try {
    const entries = readdirSync(figmaBase);
    const appFolders = entries.filter(e => e.startsWith('app-')).sort().reverse();
    for (const folder of appFolders) {
      const exePath = join(figmaBase, folder, 'Figma.exe');
      if (existsSync(exePath)) return exePath;
    }
  } catch {}
  return null;
}

export function getAsarPath(): string | null {
  if (PLATFORM === 'win32') return findWindowsAsarPath();
  return ASAR_PATHS[PLATFORM] ?? null;
}

export function getFigmaBinaryPath(): string | null {
  switch (PLATFORM) {
    case 'darwin': return '/Applications/Figma.app/Contents/MacOS/Figma';
    case 'win32': return findWindowsFigmaExe() ?? `${process.env.LOCALAPPDATA}\\Figma\\Figma.exe`;
    case 'linux': return '/usr/bin/figma';
    default: return null;
  }
}

export function getFigmaCommand(port = 9222): string | null {
  switch (PLATFORM) {
    case 'darwin': return `open -a Figma --args --remote-debugging-port=${port}`;
    case 'win32': {
      const exe = findWindowsFigmaExe();
      return exe ? `"${exe}" --remote-debugging-port=${port}` : null;
    }
    case 'linux': return `figma --remote-debugging-port=${port}`;
    default: return null;
  }
}

export function startFigmaApp(port: number): void {
  if (PLATFORM === 'darwin') {
    execFileSync('open', ['-a', 'Figma', '--args', `--remote-debugging-port=${port}`], { stdio: 'pipe' });
  } else {
    const figmaPath = getFigmaBinaryPath();
    if (figmaPath) {
      spawn(figmaPath, [`--remote-debugging-port=${port}`], { detached: true, stdio: 'ignore' }).unref();
    }
  }
}

export function killFigmaApp(): void {
  try {
    if (PLATFORM === 'darwin') {
      execFileSync('pkill', ['-x', 'Figma'], { stdio: 'pipe' });
    } else if (PLATFORM === 'win32') {
      execFileSync('taskkill', ['/IM', 'Figma.exe', '/F'], { stdio: 'pipe' });
    } else {
      execFileSync('pkill', ['-x', 'figma'], { stdio: 'pipe' });
    }
  } catch {}
}

export function isFigmaRunning(): boolean {
  try {
    if (PLATFORM === 'darwin' || PLATFORM === 'linux') {
      const result = execFileSync('pgrep', ['-x', 'Figma'], { encoding: 'utf8', stdio: 'pipe' });
      return result.trim().length > 0;
    } else if (PLATFORM === 'win32') {
      const result = execFileSync('tasklist', ['/FI', 'IMAGENAME eq Figma.exe'], { encoding: 'utf8', stdio: 'pipe' });
      return result.includes('Figma.exe');
    }
  } catch {}
  return false;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/patch/platform.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/patch/platform.ts tests/patch/platform.test.ts
git commit -m "feat: add platform detection helpers"
```

---

### Task 1.3: Figma binary patcher

**Files:**
- Create: `src/patch/figma.ts`
- Create: `tests/patch/figma.test.ts`

Port `.reference/figma-patch.js` to TypeScript.

- [ ] **Step 1: Write tests**

```typescript
// tests/patch/figma.test.ts
import { describe, it, expect } from 'vitest';

describe('figma patcher', () => {
  const BLOCK = Buffer.from('removeSwitch("remote-debugging-port")');
  const PATCH = Buffer.from('removeSwitch("remote-debugXing-port")');

  it('BLOCK and PATCH strings are same length', () => {
    expect(BLOCK.length).toBe(PATCH.length);
  });

  it('detects unpatched content', () => {
    const content = Buffer.concat([Buffer.from('prefix'), BLOCK, Buffer.from('suffix')]);
    expect(content.includes(BLOCK)).toBe(true);
    expect(content.includes(PATCH)).toBe(false);
  });

  it('detects patched content', () => {
    const content = Buffer.concat([Buffer.from('prefix'), PATCH, Buffer.from('suffix')]);
    expect(content.includes(BLOCK)).toBe(false);
    expect(content.includes(PATCH)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement figma.ts**

```typescript
// src/patch/figma.ts
import { readFileSync, writeFileSync, accessSync, constants } from 'fs';
import { execFileSync } from 'child_process';
import { getAsarPath } from './platform.js';

const BLOCK_STRING = Buffer.from('removeSwitch("remote-debugging-port")');
const PATCH_STRING = Buffer.from('removeSwitch("remote-debugXing-port")');
const CDP_PORT = 9222;

export function getCdpPort(): number {
  return CDP_PORT;
}

export function isPatched(): boolean | null {
  const asarPath = getAsarPath();
  if (!asarPath) return null;
  try {
    const content = readFileSync(asarPath);
    if (content.includes(PATCH_STRING)) return true;
    if (content.includes(BLOCK_STRING)) return false;
    return null;
  } catch { return null; }
}

export function canPatchFigma(): boolean {
  const asarPath = getAsarPath();
  if (!asarPath) return false;
  try { accessSync(asarPath, constants.W_OK); return true; } catch { return false; }
}

export function patchFigma(): boolean {
  const asarPath = getAsarPath();
  if (!asarPath) throw new Error('Cannot detect Figma installation path');
  if (!canPatchFigma()) {
    throw new Error(
      process.platform === 'darwin'
        ? 'No write access to Figma. Grant Terminal "Full Disk Access" in System Settings → Privacy & Security'
        : 'No write access to Figma. Try running as administrator.'
    );
  }

  const content = readFileSync(asarPath);
  const blockIndex = content.indexOf(BLOCK_STRING);
  if (blockIndex < 0) {
    if (content.includes(PATCH_STRING)) return true;
    throw new Error('Could not find the string to patch. Figma version may be incompatible.');
  }

  PATCH_STRING.copy(content, blockIndex);
  writeFileSync(asarPath, content);

  if (process.platform === 'darwin') {
    try { execFileSync('codesign', ['--force', '--deep', '--sign', '-', '/Applications/Figma.app'], { stdio: 'ignore' }); } catch {}
  }
  return true;
}

export function unpatchFigma(): boolean {
  const asarPath = getAsarPath();
  if (!asarPath) throw new Error('Cannot detect Figma installation path');

  const content = readFileSync(asarPath);
  const patchIndex = content.indexOf(PATCH_STRING);
  if (patchIndex < 0) {
    if (content.includes(BLOCK_STRING)) return true;
    throw new Error('Figma may not have been patched by this tool.');
  }

  BLOCK_STRING.copy(content, patchIndex);
  writeFileSync(asarPath, content);

  if (process.platform === 'darwin') {
    try { execFileSync('codesign', ['--force', '--deep', '--sign', '-', '/Applications/Figma.app'], { stdio: 'ignore' }); } catch {}
  }
  return true;
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/patch/figma.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/patch/figma.ts tests/patch/figma.test.ts
git commit -m "feat: add Figma binary patcher"
```

---

### Task 1.4: CDP client

**Files:**
- Create: `src/cdp/protocol.ts`
- Create: `src/cdp/client.ts`
- Create: `tests/cdp/client.test.ts`

- [ ] **Step 1: Create CDP protocol types**

```typescript
// src/cdp/protocol.ts
export interface CdpTab {
  id: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
  type: string;
}

export interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: {
    result?: { type?: string; value?: unknown; description?: string };
    exceptionDetails?: {
      text?: string;
      exception?: { value?: unknown; description?: string };
    };
  };
}

export interface EvalOptions {
  timeout?: number;
  awaitPromise?: boolean;
}
```

- [ ] **Step 2: Write CDP client tests**

```typescript
// tests/cdp/client.test.ts
import { describe, it, expect } from 'vitest';
import { findDesignTab } from '../../src/cdp/client.js';
import type { CdpTab } from '../../src/cdp/protocol.js';

describe('findDesignTab', () => {
  const tabs: CdpTab[] = [
    { id: '1', title: 'Home', url: 'https://www.figma.com/files/recents', webSocketDebuggerUrl: 'ws://1', type: 'page' },
    { id: '2', title: 'My Design', url: 'https://www.figma.com/design/abc123/My-Design', webSocketDebuggerUrl: 'ws://2', type: 'page' },
    { id: '3', title: 'Other', url: 'https://www.figma.com/file/def456/Other', webSocketDebuggerUrl: 'ws://3', type: 'page' },
  ];

  it('prefers design tab over file tab', () => {
    expect(findDesignTab(tabs)?.id).toBe('2');
  });

  it('falls back to file tab', () => {
    const filtered = tabs.filter(t => t.id !== '2');
    expect(findDesignTab(filtered)?.id).toBe('3');
  });

  it('returns null when no design tabs', () => {
    expect(findDesignTab([tabs[0]])).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/cdp/client.test.ts
```

- [ ] **Step 4: Implement CDP client**

Create `src/cdp/client.ts` — port from `.reference/figma-client.js`. Key changes from reference:
- Per-command connection (no persistent `ws` state)
- Exported `findDesignTab` for unit testing
- `createCdpClient()` returns `{ eval, disconnect }` interface
- Uses `execFileSync` for port scanning, not shell commands
- Searches execution contexts for Figma v39+ sandboxed context

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/cdp/client.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/cdp/protocol.ts src/cdp/client.ts tests/cdp/client.test.ts
git commit -m "feat: add CDP client with per-command connection"
```

---

### Task 1.5: Connect + eval commands

**Files:**
- Create: `src/commands/connect.ts`
- Create: `src/commands/eval.ts`
- Create: `src/utils/output.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Create output utility** — `src/utils/output.ts` with `success()`, `error()`, `info()`, `warn()` using chalk.

- [ ] **Step 2: Create connect command** — `src/commands/connect.ts` — checks patch status, applies if needed, restarts Figma, verifies CDP works.

- [ ] **Step 3: Create eval command** — `src/commands/eval.ts` — `desh eval <expression>` sends raw JS to Figma.

- [ ] **Step 4: Wire into cli.ts**

```typescript
import { registerConnectCommand } from './commands/connect.js';
import { registerEvalCommand } from './commands/eval.js';
registerConnectCommand(program);
registerEvalCommand(program);
```

- [ ] **Step 5: Build and verify**

```bash
npm run build && node dist/cli.js --help
```

- [ ] **Step 6: Commit**

```bash
git add src/commands/connect.ts src/commands/eval.ts src/utils/output.ts src/cli.ts
git commit -m "feat: add connect and eval commands"
```

---

## Phase 2: Config + Token Pipeline

### Task 2.1: Config reader

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write tests** — `parseConfig` normalizes string tokens to arrays, handles monorepo and single-app configs.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement** — `loadConfig()` walks up from cwd looking for `desh.config.json`. `requireConfig()` throws if not found. `parseConfig()` normalizes the raw JSON.

- [ ] **Step 4: Run tests** — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add config reader with monorepo support"
```

---

### Task 2.2: CSS token parser

**Files:**
- Create: `src/scanner/tokens.ts`
- Create: `tests/scanner/tokens.test.ts`
- Create: `tests/fixtures/globals.css`

- [ ] **Step 1: Install postcss**

```bash
npm install postcss
```

- [ ] **Step 2: Create CSS test fixture** with `@theme`, `:root`, and `.dark` blocks.

- [ ] **Step 3: Write tests** — extracts @theme vars, :root vars, .dark vars, merges multiple files.

- [ ] **Step 4: Run test to verify it fails**

- [ ] **Step 5: Implement** — uses `postcss.parse()` to walk `@theme` AtRules and `:root`/`.dark` Rules, extracting `--` declarations.

- [ ] **Step 6: Run tests** — Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/scanner/tokens.ts tests/scanner/tokens.test.ts tests/fixtures/globals.css
git commit -m "feat: add CSS token parser for @theme/:root/.dark"
```

---

### Task 2.3: OKLCH color conversion

**Files:**
- Create: `src/codegen/color.ts`
- Create: `tests/codegen/color.test.ts`

- [ ] **Step 1: Write tests** — oklch to rgb, hex to rgb, white/black edge cases, non-color values return null.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement** — uses `culori` `parse()` + `converter('rgb')` to handle OKLCH, hex, hsl, etc.

- [ ] **Step 4: Run tests** — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/codegen/color.ts tests/codegen/color.test.ts
git commit -m "feat: add OKLCH/hex/hsl to RGB color conversion"
```

---

### Task 2.4: Token sync codegen + commands

**Files:**
- Create: `src/codegen/tokens.ts`
- Create: `src/commands/tokens.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Create token codegen** — `generateTokenSyncJs()` takes a `TokenMap`, converts colors via `cssColorToRgb()`, returns a JS string that creates Figma variable collections with Light/Dark modes.

- [ ] **Step 2: Create tokens command** — `desh tokens sync` reads config, parses CSS, generates JS, sends via CDP.

- [ ] **Step 3: Wire into cli.ts**

- [ ] **Step 4: Build and verify**

```bash
npm run build && node dist/cli.js tokens sync --help
```

- [ ] **Step 5: Commit**

```bash
git add src/codegen/tokens.ts src/commands/tokens.ts src/cli.ts
git commit -m "feat: add token sync from project CSS to Figma variables"
```

---

### Task 2.5: Init command

**Files:**
- Create: `src/scanner/project.ts`
- Create: `src/commands/init.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Implement project scanner** — detects monorepo markers, finds `globals.css` files, finds `components` directories, suggests primitives path.

- [ ] **Step 2: Implement init command** — interactive prompts, writes `desh.config.json`.

- [ ] **Step 3: Wire into cli.ts**

- [ ] **Step 4: Build and verify**

```bash
npm run build && node dist/cli.js init --help
```

- [ ] **Step 5: Commit**

```bash
git add src/scanner/project.ts src/commands/init.ts src/cli.ts
git commit -m "feat: add project scanner and init command"
```

---

## Phase 3: Component Registry + Render

### Task 3.1: cva() parser

**Files:**
- Create: `src/scanner/components.ts`
- Create: `tests/scanner/components.test.ts`
- Create: `tests/fixtures/button.tsx`

- [ ] **Step 1: Install ts-morph**

```bash
npm install ts-morph
```

- [ ] **Step 2: Create button.tsx fixture** with cva() call, lucide-react import, and ButtonProps interface.

- [ ] **Step 3: Write tests** — extracts variant names, base classes, icon imports.

- [ ] **Step 4: Run test to verify it fails**

- [ ] **Step 5: Implement** — uses `ts-morph` Project to parse TSX, walks AST for `cva()` CallExpressions, extracts variant ObjectLiterals, reads named imports from icon libraries.

- [ ] **Step 6: Run tests** — Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/scanner/components.ts tests/scanner/components.test.ts tests/fixtures/button.tsx
git commit -m "feat: add cva() parser for component scanning"
```

---

### Task 3.2: Tailwind class → Figma property translator

**Files:**
- Create: `src/codegen/tailwind.ts`
- Create: `tests/codegen/tailwind.test.ts`

- [ ] **Step 1: Write tests** — `bg-primary` → fill variable, `h-10` → height 40, `px-4` → paddingH 16, `rounded-md` → radius variable, `text-sm` → fontSize 14, `inline-flex` → horizontal layout, hover modifiers → null.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement** — pure string mapping using spacing scale, font size, font weight, and layout lookup tables. Skips classes with `:` modifiers.

- [ ] **Step 4: Run tests** — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/codegen/tailwind.ts tests/codegen/tailwind.test.ts
git commit -m "feat: add Tailwind class to Figma property translator"
```

---

### Task 3.3: Components list + render commands

**Files:**
- Create: `src/commands/components.ts`
- Create: `src/commands/render.ts`
- Create: `src/codegen/jsx.ts`
- Create: `src/codegen/components.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Create components command** — `desh components list` scans config paths, displays table of components with variants and source. `desh components sync` generates Figma component sets.

- [ ] **Step 2: Create JSX codegen** — port JSX → Figma API JS from `.reference/index.js`. This is the largest single piece — handles `<Frame>`, `<Text>`, `<Icon>`, `<Slot>` and all props.

- [ ] **Step 3: Create render command** — `desh render '<JSX>'` parses JSX string, generates JS, sends via CDP. Also `desh render-batch`.

- [ ] **Step 4: Wire into cli.ts**

- [ ] **Step 5: Build and verify**

```bash
npm run build
node dist/cli.js components list --help
node dist/cli.js render --help
```

- [ ] **Step 6: Commit**

```bash
git add src/commands/components.ts src/commands/render.ts src/codegen/jsx.ts src/codegen/components.ts src/cli.ts
git commit -m "feat: add components list and render commands"
```

---

## Phase 4: Core Standalone Commands

Each task follows the pattern: create command file, register in cli.ts, build, test, commit.

### Task 4.1: Create commands — `src/commands/create.ts`
Port: `create rect`, `ellipse`, `text`, `line`, `autolayout`, `icon`, `image`, `frame`, `component`, `group`

### Task 4.2: Set commands — `src/commands/set.ts`
Port: `set fill`, `stroke`, `radius`, `size`, `pos`, `opacity`, `autolayout`, `name`, `sizing`, `padding`, `gap`, `align`

### Task 4.3: Find commands — `src/commands/find.ts`
Port: `find`, `select`, `get`

### Task 4.4: Canvas commands — `src/commands/canvas.ts`
Port: `canvas info`, `canvas next`, `arrange`, `duplicate`, `delete`

### Task 4.5: Node commands — `src/commands/node.ts`
Port: `node tree`, `node bindings`, `node to-component`, `node delete`

### Task 4.6: Files + verify — `src/commands/files.ts`, `src/commands/verify.ts`
Port: `files`, `verify`

> **For each task:** Create file → register in cli.ts → build → manual test → commit.

---

## Phase 5: Advanced Commands

### Task 5.1: Slot commands — `src/commands/slot.ts`
### Task 5.2: Export commands — `src/commands/export.ts`
### Task 5.3: Lint + analyze — `src/commands/lint.ts`
### Task 5.4: Accessibility — `src/commands/a11y.ts`
### Task 5.5: Blocks + combos + sizes — `src/commands/blocks.ts`
### Task 5.6: Team libraries — `src/commands/lib.ts`
### Task 5.7: Raw/XPath — `src/commands/raw.ts`
### Task 5.8: FigJam — `src/commands/figjam.ts`
### Task 5.9: Website recreation — `src/commands/recreate.ts`
### Task 5.10: Icon detection — `src/scanner/icons.ts`
### Task 5.11: Font detection — `src/scanner/fonts.ts`
### Task 5.12: HTTP utilities — `src/utils/http.ts`
### Task 5.13: Sync orchestrator — `src/commands/sync.ts`

> Prioritize by user value: slots, export, lint → blocks, lib → FigJam, recreation.

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/cli.ts` | Entry point, commander setup |
| `src/config.ts` | desh.config.json reader |
| `src/cdp/protocol.ts` | CDP type definitions |
| `src/cdp/client.ts` | Per-command WebSocket CDP client |
| `src/patch/platform.ts` | OS-specific Figma paths |
| `src/patch/figma.ts` | Binary patching |
| `src/scanner/project.ts` | Monorepo detection, file discovery |
| `src/scanner/tokens.ts` | CSS token parser (postcss) |
| `src/scanner/components.ts` | cva() parser (ts-morph) |
| `src/scanner/icons.ts` | Icon library detection |
| `src/scanner/fonts.ts` | Font detection |
| `src/codegen/color.ts` | OKLCH → sRGB (culori) |
| `src/codegen/tailwind.ts` | Tailwind class → Figma property |
| `src/codegen/tokens.ts` | Token → Figma variable JS |
| `src/codegen/components.ts` | Component → Figma component set JS |
| `src/codegen/jsx.ts` | JSX → Figma API JS |
| `src/commands/*.ts` | One file per command group |
| `src/utils/output.ts` | Terminal formatting |
| `src/utils/http.ts` | HTTP client (Iconify, etc.) |
