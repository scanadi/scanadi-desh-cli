/**
 * Figma binary patcher.
 *
 * Patches Figma Desktop to enable remote debugging via CDP.
 * Newer Figma versions block --remote-debugging-port by default;
 * we neutralise that by changing one character in app.asar.
 */

import { readFileSync, writeFileSync, accessSync, constants } from 'fs';
import { execFileSync } from 'child_process';
import { getAsarPath } from './platform.js';

// Fixed CDP port (figma-use has 9222 hardcoded)
const CDP_PORT = 9222;

// The string that blocks remote debugging
const BLOCK_STRING = Buffer.from('removeSwitch("remote-debugging-port")');
// The patched string (same length — changes "debugging" to "debugXing")
const PATCH_STRING = Buffer.from('removeSwitch("remote-debugXing-port")');

/**
 * Get the CDP port (always 9222 for figma-use compatibility).
 */
export function getCdpPort(): number {
  return CDP_PORT;
}

/**
 * Check if Figma is patched.
 * @returns true = patched, false = not patched, null = can't determine
 */
export function isPatched(): boolean | null {
  const asarPath = getAsarPath();
  if (!asarPath) return null;

  try {
    const content = readFileSync(asarPath);

    if (content.includes(PATCH_STRING)) return true;
    if (content.includes(BLOCK_STRING)) return false;

    return null; // Old Figma version or unrecognised layout
  } catch {
    return null;
  }
}

/**
 * Check whether we have write access to Figma's app.asar.
 */
export function canPatchFigma(): boolean {
  const asarPath = getAsarPath();
  if (!asarPath) return false;

  try {
    accessSync(asarPath, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Patch Figma to enable remote debugging.
 * @returns true if the patch was applied (or was already applied)
 * @throws if the asar path is unknown, access is denied, or the target string is missing
 */
export function patchFigma(): boolean {
  const asarPath = getAsarPath();
  if (!asarPath) {
    throw new Error('Cannot detect Figma installation path for this platform');
  }

  if (!canPatchFigma()) {
    if (process.platform === 'darwin') {
      throw new Error(
        'No write access to Figma. Grant Terminal "Full Disk Access" in System Settings → Privacy & Security',
      );
    } else {
      throw new Error('No write access to Figma. Try running as administrator.');
    }
  }

  const content = readFileSync(asarPath);
  const blockIndex = content.indexOf(BLOCK_STRING);

  if (blockIndex < 0) {
    if (content.includes(PATCH_STRING)) return true; // Already patched
    throw new Error('Could not find the string to patch. Figma version may be incompatible.');
  }

  PATCH_STRING.copy(content, blockIndex);
  writeFileSync(asarPath, content);

  if (process.platform === 'darwin') {
    try {
      execFileSync('codesign', ['--force', '--deep', '--sign', '-', '/Applications/Figma.app'], {
        stdio: 'ignore',
      });
    } catch {
      // Re-signing might fail (e.g. SIP) but the patch itself may still work
    }
  }

  return true;
}

/**
 * Unpatch Figma to restore the original state (re-enables the remote-debugging block).
 * @returns true if restored (or was already in original state)
 * @throws if the asar path is unknown or the patched string is not found
 */
export function unpatchFigma(): boolean {
  const asarPath = getAsarPath();
  if (!asarPath) {
    throw new Error('Cannot detect Figma installation path for this platform');
  }

  if (!canPatchFigma()) {
    if (process.platform === 'darwin') {
      throw new Error(
        'No write access to Figma. Grant Terminal "Full Disk Access" in System Settings → Privacy & Security',
      );
    }
    throw new Error('No write access to Figma. Try running as administrator.');
  }

  const content = readFileSync(asarPath);
  const patchIndex = content.indexOf(PATCH_STRING);

  if (patchIndex < 0) {
    if (content.includes(BLOCK_STRING)) return true; // Already in original state
    throw new Error(
      'Could not find the patched string. Figma may not have been patched by this tool.',
    );
  }

  BLOCK_STRING.copy(content, patchIndex);
  writeFileSync(asarPath, content);

  if (process.platform === 'darwin') {
    try {
      execFileSync('codesign', ['--force', '--deep', '--sign', '-', '/Applications/Figma.app'], {
        stdio: 'ignore',
      });
    } catch {
      // Re-signing might fail but unpatch itself may still work
    }
  }

  return true;
}

export default { getCdpPort, isPatched, canPatchFigma, patchFigma, unpatchFigma };
