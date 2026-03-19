import { readFileSync, writeFileSync } from 'fs';

/**
 * Add a variant value to a cva() source string.
 * Returns the modified source, or the original if the axis wasn't found or value already exists.
 */
export function addVariantToSource(source: string, axis: string, value: string): string {
  // Find the axis block inside variants: { axis: { ... } }
  const axisPattern = new RegExp(
    `(${axis}:\\s*\\{)([^}]*)(\\})`,
    's'
  );

  const match = source.match(axisPattern);
  if (!match) return source;

  const opening = match[1];
  const body = match[2];
  const closing = match[3];

  // Check if value already exists
  const valuePattern = new RegExp(`\\b${value}\\s*:`);
  if (valuePattern.test(body)) return source;

  // Find indentation from existing entries
  const indentMatch = body.match(/\n(\s+)\w+/);
  const indent = indentMatch ? indentMatch[1] : '        ';

  // Add the new variant value at the end of the block
  const newEntry = `${indent}${value}: "",\n`;
  const updatedBody = body.trimEnd() + '\n' + newEntry + indent.slice(2);

  return source.replace(axisPattern, `${opening}${updatedBody}${closing}`);
}

/**
 * Add a variant value to a cva() call in a TSX file.
 * Returns true if the file was modified.
 */
export function addVariantToFile(filePath: string, axis: string, value: string): boolean {
  const content = readFileSync(filePath, 'utf8');
  const updated = addVariantToSource(content, axis, value);
  if (updated === content) return false;
  writeFileSync(filePath, updated);
  return true;
}
