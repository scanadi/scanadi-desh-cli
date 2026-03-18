import { describe, it, expect } from 'vitest';
import { parseCssNumeric, generateTokenSyncJs } from '../../src/codegen/tokens.js';

describe('parseCssNumeric', () => {
  it('parses rem values (multiplied by 16)', () => {
    expect(parseCssNumeric('0.25rem')).toBe(4);
    expect(parseCssNumeric('0.375rem')).toBe(6);
    expect(parseCssNumeric('1rem')).toBe(16);
    expect(parseCssNumeric('2.5rem')).toBe(40);
  });

  it('parses px values', () => {
    expect(parseCssNumeric('4px')).toBe(4);
    expect(parseCssNumeric('16px')).toBe(16);
    expect(parseCssNumeric('0.5px')).toBe(0.5);
  });

  it('parses bare numbers', () => {
    expect(parseCssNumeric('0.5')).toBe(0.5);
    expect(parseCssNumeric('16')).toBe(16);
    expect(parseCssNumeric('0')).toBe(0);
  });

  it('returns null for non-numeric values', () => {
    expect(parseCssNumeric('"Inter", sans-serif')).toBeNull();
    expect(parseCssNumeric('oklch(0.205 0 0)')).toBeNull();
    expect(parseCssNumeric('auto')).toBeNull();
    expect(parseCssNumeric('100%')).toBeNull();
  });

  it('handles whitespace', () => {
    expect(parseCssNumeric('  0.25rem  ')).toBe(4);
    expect(parseCssNumeric('  4px  ')).toBe(4);
  });
});

describe('generateTokenSyncJs', () => {
  it('generates code that creates both semantic and primitives collections', () => {
    const tokens = {
      theme: {
        '--radius-sm': '0.25rem',
        '--radius-md': '0.375rem',
        '--font-sans': '"Inter", sans-serif',
      },
      light: {
        '--background': 'oklch(1 0 0)',
      },
      dark: {
        '--background': 'oklch(0.145 0 0)',
      },
    };

    const js = generateTokenSyncJs(tokens);

    // Should contain semantic collection setup
    expect(js).toContain("'semantic'");
    expect(js).toContain("'Light'");
    expect(js).toContain("'Dark'");

    // Should contain primitives collection setup for float vars
    expect(js).toContain("'primitives'");
    expect(js).toContain("'FLOAT'");

    // Should contain the float variable values (rem * 16)
    expect(js).toContain('"radius-sm"');
    expect(js).toContain('"radius-md"');

    // Should NOT contain font-sans (non-numeric)
    expect(js).not.toContain('"font-sans"');

    // Should contain color variable
    expect(js).toContain('"background"');
  });

  it('skips primitives collection when no numeric theme tokens', () => {
    const tokens = {
      theme: {
        '--font-sans': '"Inter", sans-serif',
      },
      light: {
        '--primary': 'oklch(0.205 0 0)',
      },
      dark: {},
    };

    const js = generateTokenSyncJs(tokens);
    expect(js).toContain("'semantic'");
    // primitives block is gated on floatVarDefs.length > 0
    expect(js).toContain('floatVarDefs.length > 0');
  });

  it('includes alpha warning logic for colors with alpha', () => {
    const tokens = {
      theme: {},
      light: {
        '--overlay': 'oklch(0 0 0 / 0.5)',
      },
      dark: {},
    };

    const js = generateTokenSyncJs(tokens);
    // The generated JS should include the alpha tracking logic
    expect(js).toContain('alphaWarnings');
    // The serialized color data should include the alpha value
    expect(js).toContain('"a"');
  });
});
