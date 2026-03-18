import { describe, it, expect } from 'vitest';
import { getAsarPath, getFigmaBinaryPath, getFigmaCommand } from '../../src/patch/platform.js';

describe('platform', () => {
  it('getAsarPath returns a string on supported platforms', () => {
    const path = getAsarPath();
    if (process.platform === 'darwin') {
      expect(path).toBe('/Applications/Figma.app/Contents/Resources/app.asar');
    } else if (process.platform === 'win32') {
      expect(typeof path === 'string' || path === null).toBe(true);
    }
  });

  it('getFigmaBinaryPath returns a string', () => {
    const path = getFigmaBinaryPath();
    expect(typeof path === 'string' || path === null).toBe(true);
  });

  it('getFigmaCommand includes the port', () => {
    const cmd = getFigmaCommand(9222);
    if (cmd) {
      expect(cmd).toContain('9222');
    }
  });
});
