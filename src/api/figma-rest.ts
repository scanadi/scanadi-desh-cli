/**
 * Figma REST API client.
 *
 * Uses native fetch() to call api.figma.com endpoints.
 * Authentication: reads FIGMA_API_TOKEN from env or figmaApiToken from desh.config.json.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const BASE_URL = 'https://api.figma.com/v1';

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

function findConfigFile(startDir = process.cwd()): string | null {
  let dir = startDir;
  while (true) {
    const configPath = join(dir, 'desh.config.json');
    if (existsSync(configPath)) return configPath;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function getToken(): string {
  // 1. Environment variable (includes .env loaded by shell)
  const envToken = process.env.FIGMA_API_TOKEN;
  if (envToken) return envToken;

  // 2. figmaApiToken in desh.config.json
  try {
    const configPath = findConfigFile();
    if (configPath) {
      const raw = JSON.parse(readFileSync(configPath, 'utf8'));
      if (raw && typeof raw.figmaApiToken === 'string' && raw.figmaApiToken) {
        return raw.figmaApiToken;
      }
    }
  } catch {
    // ignore parse errors — fall through to error
  }

  throw new Error(
    'Figma API token not found. Set FIGMA_API_TOKEN in your .env or add figmaApiToken to desh.config.json',
  );
}

// ---------------------------------------------------------------------------
// Generic request helpers
// ---------------------------------------------------------------------------

async function figmaGet<T>(path: string): Promise<T> {
  const token = getToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Figma-Token': token },
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Invalid or expired Figma API token');
    }
    if (response.status === 404) {
      throw new Error(`Figma file not found — check the file key`);
    }
    throw new Error(`Figma API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FigmaComponent {
  key: string;
  name: string;
  description: string;
  componentSetName?: string;
  containingFrameNodeId?: string;
}

export interface FigmaComponentSet {
  key: string;
  name: string;
  description: string;
  nodeId?: string;
}

export interface FigmaStyle {
  key: string;
  name: string;
  styleType: string;
  description: string;
}

/** Get all published components from a file. */
export async function getFileComponents(fileKey: string): Promise<FigmaComponent[]> {
  const data = await figmaGet<{
    meta: {
      components: Array<{
        key: string;
        name: string;
        description: string;
        containing_frame?: { name: string; nodeId?: string };
        component_set_id?: string;
      }>;
    };
  }>(`/files/${fileKey}/components`);

  return data.meta.components.map((c) => ({
    key: c.key,
    name: c.name,
    description: c.description || '',
    componentSetName: c.containing_frame?.name,
    containingFrameNodeId: c.containing_frame?.nodeId,
  }));
}

/** Get all published component sets from a file. */
export async function getFileComponentSets(fileKey: string): Promise<FigmaComponentSet[]> {
  const data = await figmaGet<{
    meta: {
      component_sets: Array<{
        key: string;
        name: string;
        description: string;
        node_id?: string;
      }>;
    };
  }>(`/files/${fileKey}/component_sets`);

  return data.meta.component_sets.map((s) => ({
    key: s.key,
    name: s.name,
    description: s.description || '',
    nodeId: s.node_id,
  }));
}

/** Get file metadata (name, last modified). */
export async function getFileInfo(fileKey: string): Promise<{ name: string; lastModified: string }> {
  const data = await figmaGet<{ name: string; lastModified: string }>(`/files/${fileKey}?depth=1`);
  return { name: data.name, lastModified: data.lastModified };
}

/** Get children of specific nodes (depth=1). Used to read component set variants. */
export async function getNodeChildren(fileKey: string, nodeIds: string[]): Promise<Record<string, Array<{ name: string; type: string }>>> {
  const ids = nodeIds.join(',');
  const data = await figmaGet<{
    nodes: Record<string, { document: { name: string; type: string; children?: Array<{ name: string; type: string }> } }>;
  }>(`/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}&depth=1`);

  const result: Record<string, Array<{ name: string; type: string }>> = {};
  for (const [id, node] of Object.entries(data.nodes)) {
    result[id] = node.document.children?.filter(c => c.type === 'COMPONENT') || [];
  }
  return result;
}

/** Resolve a component key to its source file key and name. */
export async function getComponentFileKey(componentKey: string): Promise<{ fileKey: string; name: string } | null> {
  try {
    const data = await figmaGet<{
      meta: {
        file_key: string;
        containing_frame?: { name: string };
        name: string;
      };
    }>(`/components/${componentKey}`);
    return { fileKey: data.meta.file_key, name: data.meta.name };
  } catch {
    return null;
  }
}

/** Get all published styles from a file. */
export async function getFileStyles(fileKey: string): Promise<FigmaStyle[]> {
  const data = await figmaGet<{
    meta: {
      styles: Array<{
        key: string;
        name: string;
        style_type: string;
        description: string;
      }>;
    };
  }>(`/files/${fileKey}/styles`);

  return data.meta.styles.map((s) => ({
    key: s.key,
    name: s.name,
    styleType: s.style_type,
    description: s.description || '',
  }));
}
