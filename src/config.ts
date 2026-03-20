import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

export interface DeshConfig {
  tokens: string[];
  primitives?: string;
  components: string[];
  libraryFileKey?: string;
  library?: { fileKey: string; name: string };
  configDir: string;
}

interface RawConfig {
  tokens?: string | string[];
  primitives?: string;
  components?: string | string[];
  libraryFileKey?: string;
  library?: { fileKey: string; name: string };
}

type LibraryConfigLike =
  | Pick<DeshConfig, 'libraryFileKey' | 'library'>
  | Pick<RawConfig, 'libraryFileKey' | 'library'>
  | null
  | undefined;

export function parseConfig(raw: RawConfig, configDir = '.'): DeshConfig {
  const tokens = raw.tokens
    ? Array.isArray(raw.tokens) ? raw.tokens : [raw.tokens]
    : [];
  const components = raw.components
    ? Array.isArray(raw.components) ? raw.components : [raw.components]
    : [];
  return { tokens, primitives: raw.primitives, components, libraryFileKey: raw.libraryFileKey, library: raw.library, configDir };
}

export function getLibraryFileKey(config: LibraryConfigLike): string | undefined {
  return config?.library?.fileKey || config?.libraryFileKey;
}

export function loadConfig(startDir = process.cwd()): DeshConfig | null {
  let dir = startDir;
  while (true) {
    const configPath = join(dir, 'desh.config.json');
    if (existsSync(configPath)) {
      let raw: RawConfig;
      try {
        raw = JSON.parse(readFileSync(configPath, 'utf8')) as RawConfig;
      } catch {
        throw new Error(`Invalid desh.config.json at ${configPath}: not valid JSON`);
      }
      return parseConfig(raw, dir);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function requireConfig(startDir = process.cwd()): DeshConfig {
  const config = loadConfig(startDir);
  if (!config) {
    throw new Error('No desh.config.json found. Run `desh init` to set up your project.');
  }
  return config;
}
