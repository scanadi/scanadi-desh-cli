import { describe, it, expect } from 'vitest';
import { extractTokens } from '../../src/scanner/tokens.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../fixtures/globals.css');

describe('extractTokens', () => {
  it('extracts @theme variables', async () => {
    const result = await extractTokens([FIXTURE]);
    expect(result.theme['--color-primary']).toBe('oklch(0.205 0 0)');
    expect(result.theme['--font-sans']).toBe('"Inter", sans-serif');
    expect(result.theme['--radius-sm']).toBe('0.25rem');
  });

  it('extracts :root variables', async () => {
    const result = await extractTokens([FIXTURE]);
    expect(result.light['--background']).toBe('oklch(1 0 0)');
    expect(result.light['--primary']).toBe('oklch(0.205 0 0)');
  });

  it('extracts .dark variables', async () => {
    const result = await extractTokens([FIXTURE]);
    expect(result.dark['--background']).toBe('oklch(0.145 0 0)');
    expect(result.dark['--primary']).toBe('oklch(0.985 0 0)');
  });

  it('merges multiple files in order', async () => {
    const result = await extractTokens([FIXTURE, FIXTURE]);
    expect(result.light['--primary']).toBe('oklch(0.205 0 0)');
  });
});
