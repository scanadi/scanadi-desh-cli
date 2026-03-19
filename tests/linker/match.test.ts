import { describe, it, expect } from 'vitest';
import { findBestMatch, normalizeComponentName } from '../../src/linker/match.js';

describe('normalizeComponentName', () => {
  it('lowercases', () => {
    expect(normalizeComponentName('Button')).toBe('button');
  });

  it('splits PascalCase to spaced lowercase', () => {
    expect(normalizeComponentName('RadioGroup')).toBe('radiogroup');
  });

  it('strips common prefixes', () => {
    expect(normalizeComponentName('UI/Button')).toBe('button');
    expect(normalizeComponentName('Components/Card')).toBe('card');
  });

  it('handles nested paths', () => {
    expect(normalizeComponentName('Design System/UI/Badge')).toBe('badge');
  });
});

describe('findBestMatch', () => {
  const figmaComponents = [
    { name: 'Button', key: 'k1' },
    { name: 'Badge', key: 'k2' },
    { name: 'Radio Group', key: 'k3' },
    { name: 'UI/Card', key: 'k4' },
    { name: 'Alert Dialog', key: 'k5' },
    { name: 'Toggle', key: 'k6' },
  ];

  it('matches exact name (case-insensitive)', () => {
    const match = findBestMatch('Button', figmaComponents);
    expect(match?.key).toBe('k1');
  });

  it('matches PascalCase to spaced Figma name', () => {
    const match = findBestMatch('RadioGroup', figmaComponents);
    expect(match?.key).toBe('k3');
  });

  it('matches despite Figma prefix', () => {
    const match = findBestMatch('Card', figmaComponents);
    expect(match?.key).toBe('k4');
  });

  it('matches AlertDialog to Alert Dialog', () => {
    const match = findBestMatch('AlertDialog', figmaComponents);
    expect(match?.key).toBe('k5');
  });

  it('returns null for no match', () => {
    const match = findBestMatch('NonExistent', figmaComponents);
    expect(match).toBeNull();
  });
});
