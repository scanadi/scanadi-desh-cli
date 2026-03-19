export interface AxisDiff {
  matched: string[];
  codeOnly: string[];
  figmaOnly: string[];
}

export interface ComponentDiffResult {
  axes: Record<string, AxisDiff>;
  axesCodeOnly: string[];
  axesFigmaOnly: string[];
  inSync: boolean;
}

interface DiffInput {
  codeVariants: Record<string, string[]>;
  figmaVariants: Record<string, string[]>;
}

export function diffComponent(input: DiffInput): ComponentDiffResult {
  const { codeVariants, figmaVariants } = input;
  const allAxes = new Set([...Object.keys(codeVariants), ...Object.keys(figmaVariants)]);

  const axes: Record<string, AxisDiff> = {};
  const axesCodeOnly: string[] = [];
  const axesFigmaOnly: string[] = [];
  let inSync = true;

  for (const axis of allAxes) {
    const codeValues = codeVariants[axis];
    const figmaValues = figmaVariants[axis];

    if (!figmaValues) {
      axesCodeOnly.push(axis);
      inSync = false;
      continue;
    }
    if (!codeValues) {
      axesFigmaOnly.push(axis);
      inSync = false;
      continue;
    }

    const codeSet = new Set(codeValues);
    const figmaSet = new Set(figmaValues);

    const matched = codeValues.filter(v => figmaSet.has(v));
    const codeOnly = codeValues.filter(v => !figmaSet.has(v));
    const figmaOnly = figmaValues.filter(v => !codeSet.has(v));

    axes[axis] = { matched, codeOnly, figmaOnly };

    if (codeOnly.length > 0 || figmaOnly.length > 0) {
      inSync = false;
    }
  }

  return { axes, axesCodeOnly, axesFigmaOnly, inSync };
}
