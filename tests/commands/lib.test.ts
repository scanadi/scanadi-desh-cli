import { describe, it, expect } from 'vitest';
import { buildRegistryEntriesFromImportedComponents } from '../../src/commands/lib.js';

describe('buildRegistryEntriesFromImportedComponents', () => {
  it('stores imported component node IDs instead of library keys', () => {
    const entries = buildRegistryEntriesFromImportedComponents([
      { name: 'Button', id: '1:234' },
      { name: 'Card', id: '1:235' },
    ]);

    expect(entries.Button).toEqual({ nodeId: '1:234', type: 'COMPONENT' });
    expect(entries.Card).toEqual({ nodeId: '1:235', type: 'COMPONENT' });
  });
});
