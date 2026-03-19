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

/** Pick the shortest-named entry (most specific match). */
function shortest(entries: FigmaComponentEntry[]): FigmaComponentEntry {
  return entries.reduce((a, b) => a.name.length <= b.name.length ? a : b);
}

/**
 * Find the best matching Figma component for a code component name.
 * Tries: exact (case-insensitive), normalized, PascalCase→spaced.
 * When multiple match in a pass, prefers the shortest name.
 */
export function findBestMatch(
  codeName: string,
  figmaComponents: FigmaComponentEntry[],
): FigmaComponentEntry | null {
  const codeNorm = normalizeComponentName(codeName);
  const codeSpaced = pascalToSpaced(codeName).replace(/\s+/g, '');

  // Pass 1: exact name match (case-insensitive)
  const exact = figmaComponents.filter(fc => fc.name.toLowerCase() === codeName.toLowerCase());
  if (exact.length > 0) return shortest(exact);

  // Pass 2: normalized match (strips prefixes, spaces) — prefer shortest name
  const normalized = figmaComponents.filter(fc => normalizeComponentName(fc.name) === codeNorm);
  if (normalized.length > 0) return shortest(normalized);

  // Pass 3: PascalCase code name → spaced Figma name
  const spaced = figmaComponents.filter(fc => {
    const figmaNorm = fc.name.toLowerCase().replace(/\s+/g, '');
    return figmaNorm === codeSpaced;
  });
  if (spaced.length > 0) return shortest(spaced);

  return null;
}
