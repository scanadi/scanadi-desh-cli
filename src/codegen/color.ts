import { parse, converter } from 'culori';

const toSrgb = converter('rgb');

export interface RgbColor {
  r: number;  // 0..1
  g: number;
  b: number;
  a?: number; // 0..1, undefined = fully opaque
}

export function cssColorToRgb(value: string): RgbColor | null {
  try {
    const parsed = parse(value);
    if (!parsed) return null;

    const rgb = toSrgb(parsed);
    if (!rgb) return null;

    const result: RgbColor = {
      r: clamp(rgb.r),
      g: clamp(rgb.g),
      b: clamp(rgb.b),
    };

    // Preserve alpha if present and not fully opaque
    const alpha = (parsed as Record<string, unknown>).alpha;
    if (typeof alpha === 'number' && alpha < 1) {
      result.a = clamp(alpha);
    }

    return result;
  } catch {
    return null;
  }
}

function clamp(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
