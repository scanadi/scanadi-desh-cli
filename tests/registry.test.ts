import { describe, it, expect } from 'vitest';
import { parseRegistry, serializeRegistry, validateEntry, type ComponentRegistry } from '../src/registry.js';

describe('registry', () => {
  it('parses valid registry JSON', () => {
    const raw = {
      version: 1, pushedAt: '2026-03-18T12:00:00Z', figmaFileKey: 'abc123', pageId: '1:2',
      components: {
        Button: { nodeId: '1:234', type: 'COMPONENT_SET', properties: { variant: 'variant#1:0' }, defaultVariant: { variant: 'default' } },
        Card: { nodeId: '1:300', type: 'COMPONENT', children: ['CardHeader', 'CardContent'] },
      },
    };
    const reg = parseRegistry(JSON.stringify(raw));
    expect(reg.components.Button.nodeId).toBe('1:234');
    expect(reg.components.Button.type).toBe('COMPONENT_SET');
    expect(reg.components.Card.children).toContain('CardHeader');
  });

  it('serializes registry to JSON', () => {
    const reg: ComponentRegistry = { version: 1, pushedAt: '2026-03-18T12:00:00Z', figmaFileKey: 'abc', pageId: '1:2', components: {} };
    const json = serializeRegistry(reg);
    expect(JSON.parse(json).version).toBe(1);
  });

  it('validates entry has required fields', () => {
    expect(validateEntry({ nodeId: '1:1', type: 'COMPONENT' })).toBe(true);
    expect(validateEntry({ nodeId: '', type: 'COMPONENT' })).toBe(false);
    expect(validateEntry({})).toBe(false);
  });

  it('returns empty registry for invalid JSON', () => {
    const reg = parseRegistry('not json');
    expect(reg.components).toEqual({});
  });
});
