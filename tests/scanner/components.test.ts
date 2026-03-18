import { describe, it, expect } from 'vitest';
import { scanComponentFile } from '../../src/scanner/components.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUTTON_FIXTURE = join(__dirname, '../fixtures/button.tsx');
const CARD_FIXTURE = join(__dirname, '../fixtures/card.tsx');

describe('scanComponentFile', () => {
  // --- cva-based components (Button) ---
  it('extracts cva variant names', () => {
    const result = scanComponentFile(BUTTON_FIXTURE);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('button');
    expect(result!.variants.variant).toEqual(['default', 'destructive', 'outline', 'ghost']);
    expect(result!.variants.size).toEqual(['sm', 'default', 'lg', 'icon']);
    expect(result!.hasVariants).toBe(true);
  });

  it('extracts base classes', () => {
    const result = scanComponentFile(BUTTON_FIXTURE);
    expect(result!.baseClasses).toContain('inline-flex');
    expect(result!.baseClasses).toContain('rounded-md');
  });

  it('extracts icon imports', () => {
    const result = scanComponentFile(BUTTON_FIXTURE);
    expect(result!.icons).toContain('Check');
  });

  // --- non-cva components (Card with forwardRef) ---
  it('finds forwardRef components without cva', () => {
    const result = scanComponentFile(CARD_FIXTURE);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('card');
    expect(result!.hasVariants).toBe(false);
    expect(result!.exports).toContain('Card');
  });

  it('finds sub-components in same file', () => {
    const result = scanComponentFile(CARD_FIXTURE);
    expect(result!.exports).toContain('CardHeader');
    expect(result!.exports).toContain('CardTitle');
    expect(result!.exports).toContain('CardContent');
    expect(result!.subComponents).toContain('CardHeader');
    expect(result!.subComponents).toContain('CardTitle');
    expect(result!.subComponents).toContain('CardContent');
  });

  it('extracts Tailwind classes from cn() for non-cva components', () => {
    const result = scanComponentFile(CARD_FIXTURE);
    expect(result!.baseClasses.length).toBeGreaterThan(0);
    expect(result!.baseClasses).toContain('rounded-xl');
  });

  // --- non-component files ---
  it('returns null for non-component files', () => {
    const cliPath = join(__dirname, '../../src/cli.ts');
    const result = scanComponentFile(cliPath);
    expect(result).toBeNull();
  });
});
