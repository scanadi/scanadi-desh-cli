import { describe, it, expect } from 'vitest';
import { diffComponent, type ComponentDiffResult } from '../../src/linker/diff.js';

describe('diffComponent', () => {
  it('reports matching variants as synced', () => {
    const result = diffComponent({
      codeVariants: { variant: ['default', 'destructive'] },
      figmaVariants: { variant: ['default', 'destructive'] },
    });
    expect(result.axes.variant.matched).toEqual(['default', 'destructive']);
    expect(result.axes.variant.codeOnly).toEqual([]);
    expect(result.axes.variant.figmaOnly).toEqual([]);
    expect(result.inSync).toBe(true);
  });

  it('reports code-only variants', () => {
    const result = diffComponent({
      codeVariants: { variant: ['default', 'destructive', 'success'] },
      figmaVariants: { variant: ['default', 'destructive'] },
    });
    expect(result.axes.variant.codeOnly).toEqual(['success']);
    expect(result.inSync).toBe(false);
  });

  it('reports figma-only variants', () => {
    const result = diffComponent({
      codeVariants: { variant: ['default'] },
      figmaVariants: { variant: ['default', 'outline'] },
    });
    expect(result.axes.variant.figmaOnly).toEqual(['outline']);
    expect(result.inSync).toBe(false);
  });

  it('reports missing axes', () => {
    const result = diffComponent({
      codeVariants: { variant: ['default'], size: ['sm', 'lg'] },
      figmaVariants: { variant: ['default'] },
    });
    expect(result.axesCodeOnly).toContain('size');
    expect(result.inSync).toBe(false);
  });

  it('reports axes only in Figma', () => {
    const result = diffComponent({
      codeVariants: { variant: ['default'] },
      figmaVariants: { variant: ['default'], state: ['hover', 'pressed'] },
    });
    expect(result.axesFigmaOnly).toContain('state');
  });

  it('handles empty variants (structural component)', () => {
    const result = diffComponent({
      codeVariants: {},
      figmaVariants: {},
    });
    expect(result.inSync).toBe(true);
    expect(Object.keys(result.axes)).toHaveLength(0);
  });

  it('handles multiple axes simultaneously', () => {
    const result = diffComponent({
      codeVariants: { variant: ['default', 'destructive', 'success'], size: ['sm', 'default', 'lg'] },
      figmaVariants: { variant: ['default', 'destructive'], size: ['sm', 'default', 'lg', 'xl'] },
    });
    expect(result.axes.variant.codeOnly).toEqual(['success']);
    expect(result.axes.size.figmaOnly).toEqual(['xl']);
    expect(result.inSync).toBe(false);
  });
});
