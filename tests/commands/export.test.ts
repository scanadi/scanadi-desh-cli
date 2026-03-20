import { describe, it, expect } from 'vitest';
import { formatCssVariableExport, type ExportedVariable } from '../../src/commands/export.js';

describe('formatCssVariableExport', () => {
  it('emits both :root and .dark blocks when desh metadata includes dark values', () => {
    const vars: ExportedVariable[] = [
      {
        name: 'background',
        type: 'COLOR',
        val: { r: 1, g: 1, b: 1 },
        desc: 'desh:oklch(1 0 0)|oklch(0.145 0 0)',
      },
    ];

    const output = formatCssVariableExport(vars);

    expect(output).toContain(':root {');
    expect(output).toContain('--background: oklch(1 0 0);');
    expect(output).toContain('.dark {');
    expect(output).toContain('--background: oklch(0.145 0 0);');
  });

  it('adds px suffixes for float variables and leaves non-desh colors in :root', () => {
    const vars: ExportedVariable[] = [
      { name: 'radius-md', type: 'FLOAT', val: 6, desc: '' },
      { name: 'primary', type: 'COLOR', val: { r: 0, g: 0, b: 0 }, desc: '' },
    ];

    const output = formatCssVariableExport(vars);

    expect(output).toContain('--radius-md: 6px;');
    expect(output).toContain('--primary: oklch(');
    expect(output).not.toContain('.dark {');
  });
});
