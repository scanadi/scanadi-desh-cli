import { describe, it, expect } from 'vitest';
import { addVariantToSource } from '../../src/linker/pull.js';

describe('addVariantToSource', () => {
  it('adds a variant value to an existing axis', () => {
    const source = `const buttonVariants = cva("base", {
    variants: {
      variant: {
        default: "bg-primary",
        destructive: "bg-destructive",
      },
    },
  });`;
    const result = addVariantToSource(source, 'variant', 'success');
    expect(result).toContain('success: ""');
    expect(result).toContain('destructive: "bg-destructive"');
  });

  it('does not duplicate existing variant', () => {
    const source = `const x = cva("", { variants: { variant: { default: "a", destructive: "b" } } });`;
    const result = addVariantToSource(source, 'variant', 'default');
    expect(result).toBe(source);
  });

  it('returns source unchanged when axis not found', () => {
    const source = `const x = cva("", { variants: { size: { sm: "a" } } });`;
    const result = addVariantToSource(source, 'variant', 'new');
    expect(result).toBe(source);
  });

  it('handles multi-line variant values', () => {
    const source = `const x = cva("base", {
    variants: {
      variant: {
        default:
          "bg-primary text-white hover:bg-primary/90",
        destructive:
          "bg-destructive text-white",
      },
    },
  });`;
    const result = addVariantToSource(source, 'variant', 'outline');
    expect(result).toContain('outline: ""');
  });
});
