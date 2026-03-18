export interface FigmaProperty {
  property: string;
  value?: number | string | boolean;
  variable?: string;
}

const SPACING: Record<string, number> = {
  '0': 0, '0.5': 2, '1': 4, '1.5': 6, '2': 8, '2.5': 10,
  '3': 12, '3.5': 14, '4': 16, '5': 20, '6': 24, '7': 28,
  '8': 32, '9': 36, '10': 40, '11': 44, '12': 48, '14': 56, '16': 64, '20': 80, '24': 96,
};

const FONT_SIZE: Record<string, number> = {
  'xs': 12, 'sm': 14, 'base': 16, 'lg': 18, 'xl': 20,
  '2xl': 24, '3xl': 30, '4xl': 36, '5xl': 48,
};

const FONT_WEIGHT: Record<string, number> = {
  'thin': 100, 'extralight': 200, 'light': 300, 'normal': 400,
  'medium': 500, 'semibold': 600, 'bold': 700, 'extrabold': 800,
};

export function tailwindToFigma(cls: string): FigmaProperty | null {
  if (cls.includes(':')) return null; // skip hover/focus/responsive

  // bg-{color}
  if (cls.startsWith('bg-') && !cls.includes('/')) {
    return { property: 'fills', variable: `--${cls.slice(3)}` };
  }

  // text-{size} vs text-{color}
  if (cls.startsWith('text-')) {
    const val = cls.slice(5);
    if (FONT_SIZE[val] !== undefined) return { property: 'fontSize', value: FONT_SIZE[val] };
    return { property: 'color', variable: `--${val}` };
  }

  // h-{n}, w-{n}
  if (cls.startsWith('h-') && SPACING[cls.slice(2)] !== undefined) return { property: 'height', value: SPACING[cls.slice(2)] };
  if (cls.startsWith('w-') && SPACING[cls.slice(2)] !== undefined) return { property: 'width', value: SPACING[cls.slice(2)] };
  if (cls === 'w-full') return { property: 'layoutSizingHorizontal', value: 'FILL' };

  // padding
  if (cls.startsWith('px-') && SPACING[cls.slice(3)] !== undefined) return { property: 'paddingH', value: SPACING[cls.slice(3)] };
  if (cls.startsWith('py-') && SPACING[cls.slice(3)] !== undefined) return { property: 'paddingV', value: SPACING[cls.slice(3)] };
  if (cls.startsWith('p-') && SPACING[cls.slice(2)] !== undefined) return { property: 'padding', value: SPACING[cls.slice(2)] };

  // gap
  if (cls.startsWith('gap-') && SPACING[cls.slice(4)] !== undefined) return { property: 'itemSpacing', value: SPACING[cls.slice(4)] };

  // rounded
  if (cls === 'rounded') return { property: 'cornerRadius', variable: '--radius' };
  if (cls.startsWith('rounded-')) return { property: 'cornerRadius', variable: `--radius-${cls.slice(8)}` };

  // font weight
  if (cls.startsWith('font-') && FONT_WEIGHT[cls.slice(5)] !== undefined) return { property: 'fontWeight', value: FONT_WEIGHT[cls.slice(5)] };

  // layout
  if (cls === 'inline-flex' || cls === 'flex' || cls === 'flex-row') return { property: 'layoutMode', value: 'HORIZONTAL' };
  if (cls === 'flex-col') return { property: 'layoutMode', value: 'VERTICAL' };
  if (cls === 'items-center') return { property: 'counterAxisAlignItems', value: 'CENTER' };
  if (cls === 'justify-center') return { property: 'primaryAxisAlignItems', value: 'CENTER' };
  if (cls === 'justify-between') return { property: 'primaryAxisAlignItems', value: 'SPACE_BETWEEN' };

  // border
  if (cls === 'border') return { property: 'strokeWeight', value: 1 };

  // opacity
  if (cls.startsWith('opacity-')) {
    const val = parseInt(cls.slice(8), 10);
    if (!isNaN(val)) return { property: 'opacity', value: val / 100 };
  }

  if (cls === 'hidden') return { property: 'visible', value: false };

  return null;
}
