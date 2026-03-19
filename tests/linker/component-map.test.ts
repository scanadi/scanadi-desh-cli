import { describe, it, expect } from 'vitest';
import { parseComponentMap, serializeComponentMap, type ComponentMap, type LinkedComponent } from '../../src/linker/component-map.js';

describe('ComponentMap', () => {
  it('parses valid map JSON', () => {
    const raw = {
      version: 1,
      linkedAt: '2026-03-19T12:00:00Z',
      libraryFileKey: 'abc123',
      components: {
        Button: {
          codeFile: 'packages/ui/components/button.tsx',
          figmaKey: 'key123',
          figmaName: 'Button',
          figmaType: 'COMPONENT_SET',
          codeVariants: { variant: ['default', 'destructive'], size: ['sm', 'lg'] },
          figmaVariants: { variant: ['default', 'destructive'], size: ['sm', 'lg'] },
        },
      },
    };
    const map = parseComponentMap(JSON.stringify(raw));
    expect(map.components.Button.figmaKey).toBe('key123');
    expect(map.components.Button.codeVariants.variant).toEqual(['default', 'destructive']);
  });

  it('returns empty map for invalid JSON', () => {
    const map = parseComponentMap('not json');
    expect(map.components).toEqual({});
    expect(map.version).toBe(1);
  });

  it('serializes map to formatted JSON', () => {
    const map: ComponentMap = {
      version: 1,
      linkedAt: '2026-03-19T12:00:00Z',
      libraryFileKey: 'abc123',
      components: {},
    };
    const json = serializeComponentMap(map);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.libraryFileKey).toBe('abc123');
  });

  it('handles components without variants (structural)', () => {
    const raw = {
      version: 1, linkedAt: '', libraryFileKey: 'abc',
      components: {
        Card: {
          codeFile: 'card.tsx', figmaKey: 'k1', figmaName: 'Card',
          figmaType: 'COMPONENT',
          codeVariants: {}, figmaVariants: {},
          subComponents: ['CardHeader', 'CardContent'],
        },
      },
    };
    const map = parseComponentMap(JSON.stringify(raw));
    expect(map.components.Card.subComponents).toContain('CardHeader');
  });
});
