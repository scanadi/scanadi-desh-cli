import { describe, it, expect } from 'vitest';

describe('figma patcher', () => {
  const BLOCK = Buffer.from('removeSwitch("remote-debugging-port")');
  const PATCH = Buffer.from('removeSwitch("remote-debugXing-port")');

  it('BLOCK and PATCH strings are same length', () => {
    expect(BLOCK.length).toBe(PATCH.length);
  });

  it('detects unpatched content', () => {
    const content = Buffer.concat([Buffer.from('prefix'), BLOCK, Buffer.from('suffix')]);
    expect(content.includes(BLOCK)).toBe(true);
    expect(content.includes(PATCH)).toBe(false);
  });

  it('detects patched content', () => {
    const content = Buffer.concat([Buffer.from('prefix'), PATCH, Buffer.from('suffix')]);
    expect(content.includes(BLOCK)).toBe(false);
    expect(content.includes(PATCH)).toBe(true);
  });
});
