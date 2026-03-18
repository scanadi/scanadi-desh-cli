import { describe, it, expect } from 'vitest';
import { tailwindToFigma } from '../../src/codegen/tailwind.js';

describe('tailwindToFigma', () => {
  it('maps bg-primary to fill variable', () => {
    const result = tailwindToFigma('bg-primary');
    expect(result).toEqual({ property: 'fills', variable: '--primary' });
  });

  it('maps h-10 to height 40', () => {
    const result = tailwindToFigma('h-10');
    expect(result).toEqual({ property: 'height', value: 40 });
  });

  it('maps px-4 to horizontal padding 16', () => {
    const result = tailwindToFigma('px-4');
    expect(result).toEqual({ property: 'paddingH', value: 16 });
  });

  it('maps rounded-md to corner radius variable', () => {
    const result = tailwindToFigma('rounded-md');
    expect(result).toEqual({ property: 'cornerRadius', variable: '--radius-md' });
  });

  it('maps text-sm to fontSize 14', () => {
    const result = tailwindToFigma('text-sm');
    expect(result).toEqual({ property: 'fontSize', value: 14 });
  });

  it('maps inline-flex to horizontal layout', () => {
    const result = tailwindToFigma('inline-flex');
    expect(result).toEqual({ property: 'layoutMode', value: 'HORIZONTAL' });
  });

  it('returns null for hover/focus modifiers', () => {
    expect(tailwindToFigma('hover:bg-primary/90')).toBeNull();
  });

  it('maps font-medium to fontWeight 500', () => {
    const result = tailwindToFigma('font-medium');
    expect(result).toEqual({ property: 'fontWeight', value: 500 });
  });

  it('maps w-full to fill sizing', () => {
    const result = tailwindToFigma('w-full');
    expect(result).toEqual({ property: 'layoutSizingHorizontal', value: 'FILL' });
  });

  it('maps border to strokeWeight 1', () => {
    const result = tailwindToFigma('border');
    expect(result).toEqual({ property: 'strokeWeight', value: 1 });
  });
});
