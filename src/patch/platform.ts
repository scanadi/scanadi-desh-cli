/**
 * Platform-specific helpers.
 * Only defines functions for the current platform — no Windows code loaded on Mac, etc.
 */

import { execFileSync, spawn } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

const PLATFORM = process.platform;

// --- Null device ---
export const nullDevice = PLATFORM === 'win32' ? 'NUL' : '/dev/null';

// --- Platform name ---
export const platformName: string =
  ({ darwin: 'macOS', win32: 'Windows', linux: 'Linux' } as Record<string, string>)[PLATFORM] ??
  PLATFORM;

// --- Windows-only helpers (only used on win32) ---

function findWindowsFigmaPath(): string | null {
  const localAppData = process.env['LOCALAPPDATA'];
  if (!localAppData) return null;

  const figmaBase = join(localAppData, 'Figma');
  if (!existsSync(figmaBase)) return null;

  try {
    const entries = readdirSync(figmaBase);
    const appFolders = entries
      .filter((e) => e.startsWith('app-'))
      .sort()
      .reverse();

    for (const folder of appFolders) {
      const asarPath = join(figmaBase, folder, 'resources', 'app.asar');
      if (existsSync(asarPath)) return asarPath;
    }

    const oldPath = join(figmaBase, 'resources', 'app.asar');
    if (existsSync(oldPath)) return oldPath;
  } catch {}

  return null;
}

function findWindowsFigmaExe(): string | null {
  const localAppData = process.env['LOCALAPPDATA'];
  if (!localAppData) return null;

  const figmaBase = join(localAppData, 'Figma');

  const mainExe = join(figmaBase, 'Figma.exe');
  if (existsSync(mainExe)) return mainExe;

  try {
    const entries = readdirSync(figmaBase);
    const appFolders = entries
      .filter((e) => e.startsWith('app-'))
      .sort()
      .reverse();

    for (const folder of appFolders) {
      const exePath = join(figmaBase, folder, 'Figma.exe');
      if (existsSync(exePath)) return exePath;
    }
  } catch {}

  return null;
}

// --- Figma paths ---

const ASAR_PATHS: Record<string, string> = {
  darwin: '/Applications/Figma.app/Contents/Resources/app.asar',
  linux: '/opt/figma/resources/app.asar',
};

export function getAsarPath(): string | null {
  if (PLATFORM === 'win32') return findWindowsFigmaPath();
  return ASAR_PATHS[PLATFORM] ?? null;
}

export function getFigmaBinaryPath(): string | null {
  switch (PLATFORM) {
    case 'darwin':
      return '/Applications/Figma.app/Contents/MacOS/Figma';
    case 'win32':
      return (
        findWindowsFigmaExe() ??
        `${process.env['LOCALAPPDATA']}\\Figma\\Figma.exe`
      );
    case 'linux':
      return '/usr/bin/figma';
    default:
      return null;
  }
}

export function getFigmaCommand(port: number = 9222): string | null {
  switch (PLATFORM) {
    case 'darwin':
      return `open -a Figma --args --remote-debugging-port=${port}`;
    case 'win32': {
      const exePath = findWindowsFigmaExe();
      if (exePath) return `"${exePath}" --remote-debugging-port=${port}`;
      return `"%LOCALAPPDATA%\\Figma\\Figma.exe" --remote-debugging-port=${port}`;
    }
    case 'linux':
      return `figma --remote-debugging-port=${port}`;
    default:
      return null;
  }
}

// --- Start Figma ---
export function startFigmaApp(port: number): void {
  if (PLATFORM === 'darwin') {
    execFileSync('open', ['-a', 'Figma', '--args', `--remote-debugging-port=${port}`]);
  } else {
    const figmaPath = getFigmaBinaryPath();
    if (!figmaPath) throw new Error('Figma binary not found');
    spawn(figmaPath, [`--remote-debugging-port=${port}`], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  }
}

// --- Kill Figma ---
export function killFigmaApp(): void {
  try {
    if (PLATFORM === 'darwin') {
      execFileSync('pkill', ['-x', 'Figma']);
    } else if (PLATFORM === 'win32') {
      execFileSync('taskkill', ['/IM', 'Figma.exe', '/F']);
    } else {
      execFileSync('pkill', ['-x', 'figma']);
    }
  } catch {}
}

// --- Is Figma running ---
export function isFigmaRunning(): boolean {
  try {
    if (PLATFORM === 'darwin' || PLATFORM === 'linux') {
      const result = execFileSync('pgrep', ['-f', 'Figma'], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return result.trim().length > 0;
    } else if (PLATFORM === 'win32') {
      const result = execFileSync(
        'tasklist',
        ['/FI', 'IMAGENAME eq Figma.exe'],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
      );
      return result.includes('Figma.exe');
    }
  } catch {}
  return false;
}

// --- Port helpers ---

export function killPort(port: number): void {
  if (PLATFORM === 'win32') {
    _killPortWindows(port);
  } else {
    _killPortUnix(port);
  }
}

function _killPortUnix(port: number): void {
  try {
    const result = execFileSync('lsof', [`-ti:${port}`], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (result) {
      const pids = result.split('\n').filter(Boolean);
      for (const pid of pids) {
        try {
          execFileSync('kill', ['-9', pid]);
        } catch {}
      }
      // brief pause to let the port free
      try {
        execFileSync('sleep', ['0.3']);
      } catch {}
    }
  } catch {}
}

function _killPortWindows(port: number): void {
  try {
    const result = execFileSync('netstat', ['-ano'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = result.split('\n').filter((l) => l.includes(`:${port}`) && l.includes('LISTENING'));
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) {
        try {
          execFileSync('taskkill', ['/PID', pid, '/F']);
        } catch {}
      }
    }
  } catch {}
}

export function getPortPid(port: number): string | null {
  if (PLATFORM === 'win32') {
    return _getPortPidWindows(port);
  }
  return _getPortPidUnix(port);
}

function _getPortPidUnix(port: number): string | null {
  try {
    const result = execFileSync('lsof', [`-ti:${port}`], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

function _getPortPidWindows(port: number): string | null {
  try {
    const result = execFileSync('netstat', ['-ano'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const line = result.split('\n').find((l) => l.includes(`:${port}`) && l.includes('LISTENING'));
    if (line) {
      const parts = line.trim().split(/\s+/);
      return parts[parts.length - 1] ?? null;
    }
  } catch {}
  return null;
}

// --- Figma version ---
export function getFigmaVersion(): string {
  try {
    if (PLATFORM === 'darwin') {
      return execFileSync(
        'defaults',
        ['read', '/Applications/Figma.app/Contents/Info.plist', 'CFBundleShortVersionString'],
        { encoding: 'utf8' },
      ).trim();
    } else if (PLATFORM === 'win32') {
      return execFileSync(
        'powershell',
        [
          '-command',
          `(Get-Item "$env:LOCALAPPDATA\\Figma\\Figma.exe").VersionInfo.ProductVersion`,
        ],
        { encoding: 'utf8' },
      ).trim() || 'unknown';
    }
  } catch {}
  return 'unknown';
}
