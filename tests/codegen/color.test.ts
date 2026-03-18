import { describe, it, expect } from 'vitest';
import { cssColorToRgb } from '../../src/codegen/color.js';

describe('cssColorToRgb', () => {
  it('converts oklch to rgb', () => {
    const rgb = cssColorToRgb('oklch(0.577 0.215 27.325)');
    expect(rgb).not.toBeNull();
    expect(rgb!.r).toBeCloseTo(0.86, 1);
    expect(rgb!.g).toBeCloseTo(0.15, 1);
    expect(rgb!.b).toBeCloseTo(0.15, 1);
  });

  it('converts hex to rgb', () => {
    const rgb = cssColorToRgb('#3b82f6');
    expect(rgb).not.toBeNull();
    expect(rgb!.r).toBeCloseTo(0.231, 2);
    expect(rgb!.g).toBeCloseTo(0.510, 2);
    expect(rgb!.b).toBeCloseTo(0.965, 2);
  });

  it('converts oklch(1 0 0) to white', () => {
    const rgb = cssColorToRgb('oklch(1 0 0)');
    expect(rgb).not.toBeNull();
    expect(rgb!.r).toBeCloseTo(1, 1);
    expect(rgb!.g).toBeCloseTo(1, 1);
    expect(rgb!.b).toBeCloseTo(1, 1);
  });

  it('converts oklch(0 0 0) to black', () => {
    const rgb = cssColorToRgb('oklch(0 0 0)');
    expect(rgb).not.toBeNull();
    expect(rgb!.r).toBeCloseTo(0, 1);
    expect(rgb!.g).toBeCloseTo(0, 1);
    expect(rgb!.b).toBeCloseTo(0, 1);
  });

  it('returns null for non-color values', () => {
    expect(cssColorToRgb('"Inter", sans-serif')).toBeNull();
    expect(cssColorToRgb('0.25rem')).toBeNull();
  });
});
