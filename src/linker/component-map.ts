import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface LinkedComponent {
  codeFile: string;
  figmaKey: string;
  figmaName: string;
  figmaType: 'COMPONENT' | 'COMPONENT_SET';
  figmaNodeId?: string;
  codeVariants: Record<string, string[]>;
  figmaVariants: Record<string, string[]>;
  subComponents?: string[];
}

export interface ComponentMap {
  version: number;
  linkedAt: string;
  libraryFileKey: string;
  components: Record<string, LinkedComponent>;
}

const MAP_FILE = '.desh-component-map.json';

function emptyMap(): ComponentMap {
  return { version: 1, linkedAt: '', libraryFileKey: '', components: {} };
}

export function parseComponentMap(raw: string): ComponentMap {
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return emptyMap();
    return {
      version: data.version ?? 1,
      linkedAt: data.linkedAt ?? '',
      libraryFileKey: data.libraryFileKey ?? '',
      components: data.components ?? {},
    };
  } catch {
    return emptyMap();
  }
}

export function serializeComponentMap(map: ComponentMap): string {
  return JSON.stringify(map, null, 2);
}

export function loadComponentMap(projectDir: string): ComponentMap {
  const filePath = join(projectDir, MAP_FILE);
  if (!existsSync(filePath)) return emptyMap();
  return parseComponentMap(readFileSync(filePath, 'utf8'));
}

export function saveComponentMap(projectDir: string, map: ComponentMap): void {
  const filePath = join(projectDir, MAP_FILE);
  writeFileSync(filePath, serializeComponentMap(map) + '\n');
}
