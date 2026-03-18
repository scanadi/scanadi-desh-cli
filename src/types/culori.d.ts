declare module 'culori' {
  export function parse(input: string): Record<string, number> | undefined;
  export function converter(mode: string): (color: Record<string, number>) => { r: number; g: number; b: number } | undefined;
}
