import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface RegistryEntry {
  nodeId: string;
  type: 'COMPONENT' | 'COMPONENT_SET';
  properties?: Record<string, string>;    // clean name → "name#uniqueId"
  defaultVariant?: Record<string, string>; // clean name → default value
  children?: string[];                     // sub-component names
}

export interface ComponentRegistry {
  version: number;
  pushedAt: string;
  figmaFileKey: string;
  pageId: string;
  components: Record<string, RegistryEntry>;
}

export function parseRegistry(json: string): ComponentRegistry {
  try {
    const raw = JSON.parse(json);
    if (!raw || raw.version !== 1) throw new Error('Invalid version');
    return raw as ComponentRegistry;
  } catch {
    return { version: 1, pushedAt: '', figmaFileKey: '', pageId: '', components: {} };
  }
}

export function serializeRegistry(reg: ComponentRegistry): string {
  return JSON.stringify(reg, null, 2);
}

export function validateEntry(entry: Record<string, unknown>): boolean {
  return typeof entry.nodeId === 'string' && entry.nodeId.length > 0 &&
         typeof entry.type === 'string' && (entry.type === 'COMPONENT' || entry.type === 'COMPONENT_SET');
}

export function loadRegistry(projectDir: string): ComponentRegistry {
  const path = join(projectDir, '.desh-registry.json');
  if (!existsSync(path)) {
    return { version: 1, pushedAt: '', figmaFileKey: '', pageId: '', components: {} };
  }
  return parseRegistry(readFileSync(path, 'utf8'));
}

export function saveRegistry(projectDir: string, reg: ComponentRegistry): void {
  const path = join(projectDir, '.desh-registry.json');
  writeFileSync(path, serializeRegistry(reg) + '\n');
}

export function getRegistryEntry(reg: ComponentRegistry, name: string): RegistryEntry | null {
  if (reg.components[name]) return reg.components[name];
  const pascal = name.charAt(0).toUpperCase() + name.slice(1).replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase());
  if (reg.components[pascal]) return reg.components[pascal];
  for (const [, entry] of Object.entries(reg.components)) {
    if (entry.children?.includes(name)) return entry;
  }
  return null;
}
