import { describe, it, expect, afterEach } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { collectCodeComponentsForLinking } from '../../src/commands/component-link.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CARD_FIXTURE = join(__dirname, '../fixtures/card.tsx');

const tempDirs: string[] = [];

function makeTempProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'desh-component-link-'));
  tempDirs.push(root);
  mkdirSync(join(root, 'src', 'components', 'ui'), { recursive: true });
  mkdirSync(join(root, 'src', 'components', 'app'), { recursive: true });
  writeFileSync(
    join(root, 'src', 'components', 'ui', 'button.tsx'),
    `import { cva } from "class-variance-authority";

const buttonVariants = cva("inline-flex rounded-md", {
  variants: {
    variant: {
      default: "bg-primary",
      destructive: "bg-destructive",
    },
  },
});

export function Button() {
  return null;
}
`,
  );
  copyFileSync(CARD_FIXTURE, join(root, 'src', 'components', 'app', 'card.tsx'));
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('collectCodeComponentsForLinking', () => {
  it('scans both primitives and configured component directories', () => {
    const root = makeTempProject();
    const components = collectCodeComponentsForLinking({
      configDir: root,
      primitives: 'src/components/ui',
      components: ['src/components/app'],
    });

    expect(components.some((component) => component.name === 'Button')).toBe(true);
    expect(components.some((component) => component.name === 'Card')).toBe(true);
  });

  it('expands all exported components from a file', () => {
    const root = makeTempProject();
    const components = collectCodeComponentsForLinking({
      configDir: root,
      primitives: 'src/components/ui',
      components: ['src/components/app'],
    });

    expect(components.some((component) => component.name === 'CardHeader')).toBe(true);
    expect(components.some((component) => component.name === 'CardContent')).toBe(true);
    expect(components.find((component) => component.name === 'CardHeader')?.variants).toEqual({});
  });

  it('keeps variant metadata on the primary export only', () => {
    const root = makeTempProject();
    const components = collectCodeComponentsForLinking({
      configDir: root,
      primitives: 'src/components/ui',
      components: ['src/components/app'],
    });

    const button = components.find((component) => component.name === 'Button');
    expect(button?.variants.variant).toContain('default');
  });
});
