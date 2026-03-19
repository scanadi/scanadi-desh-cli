export interface FigmaComponentEntry {
  name: string;
  key: string;
}

/**
 * Normalize a component name for comparison:
 * - Strip path prefixes (UI/Button → Button)
 * - Lowercase
 */
export function normalizeComponentName(name: string): string {
  const lastSlash = name.lastIndexOf('/');
  const base = lastSlash >= 0 ? name.slice(lastSlash + 1) : name;
  return base.toLowerCase().replace(/\s+/g, '');
}

/**
 * Convert PascalCase to spaced lowercase: "RadioGroup" → "radio group"
 */
function pascalToSpaced(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/**
 * Find the best matching Figma component for a code component name.
 * Tries: exact (case-insensitive), normalized, PascalCase→spaced.
 */
export function findBestMatch(
  codeName: string,
  figmaComponents: FigmaComponentEntry[],
): FigmaComponentEntry | null {
  const codeNorm = normalizeComponentName(codeName);
  const codeSpaced = pascalToSpaced(codeName).replace(/\s+/g, '');

  // Pass 1: exact name match (case-insensitive)
  for (const fc of figmaComponents) {
    if (fc.name.toLowerCase() === codeName.toLowerCase()) return fc;
  }

  // Pass 2: normalized match (strips prefixes, spaces)
  for (const fc of figmaComponents) {
    if (normalizeComponentName(fc.name) === codeNorm) return fc;
  }

  // Pass 3: PascalCase code name → spaced Figma name
  for (const fc of figmaComponents) {
    const figmaNorm = fc.name.toLowerCase().replace(/\s+/g, '');
    if (figmaNorm === codeSpaced) return fc;
  }

  return null;
}
