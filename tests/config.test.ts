import { describe, it, expect } from 'vitest';
import { parseConfig } from '../src/config.js';

describe('parseConfig', () => {
  it('parses single-app config', () => {
    const config = parseConfig({
      tokens: 'src/app/globals.css',
      primitives: 'src/components/ui',
      components: ['src/components'],
    });
    expect(config.tokens).toEqual(['src/app/globals.css']);
    expect(config.primitives).toBe('src/components/ui');
    expect(config.components).toEqual(['src/components']);
  });

  it('parses monorepo config with array tokens', () => {
    const config = parseConfig({
      tokens: ['packages/ui/globals.css', 'apps/web/globals.css'],
      primitives: 'packages/ui/src/components',
      components: ['apps/web/src/components'],
    });
    expect(config.tokens).toEqual(['packages/ui/globals.css', 'apps/web/globals.css']);
  });

  it('normalizes string tokens to array', () => {
    const config = parseConfig({ tokens: 'one.css' });
    expect(config.tokens).toEqual(['one.css']);
  });

  it('handles empty config', () => {
    const config = parseConfig({});
    expect(config.tokens).toEqual([]);
    expect(config.components).toEqual([]);
    expect(config.primitives).toBeUndefined();
  });
});
