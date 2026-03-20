import { describe, it, expect } from 'vitest';
import { generateVarLoadingCode } from '../../src/codegen/shared.js';

describe('generateVarLoadingCode', () => {
  it('loads all local variables instead of filtering to shadcn collections', () => {
    const code = generateVarLoadingCode();

    expect(code).toContain('getLocalVariablesAsync()');
    expect(code).not.toContain("startsWith('shadcn')");
  });

  it('adds short-name aliases for slash-prefixed variable names', () => {
    const code = generateVarLoadingCode();

    expect(code).toContain("const slash = v.name.lastIndexOf('/')");
    expect(code).toContain('const short = v.name.slice(slash + 1);');
  });
});
