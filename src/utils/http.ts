/**
 * Simple HTTP utility for Iconify API and other external requests.
 */

/**
 * Fetch an SVG icon from the Iconify API.
 *
 * @param name - Icon name in "prefix:icon" format (e.g. "lucide:star")
 * @returns SVG string or null if not found / request failed
 *
 * @example
 * const svg = await fetchIconSvg('lucide:star');
 * if (svg) { ... }
 */
export async function fetchIconSvg(name: string): Promise<string | null> {
  const colonIndex = name.indexOf(':');
  if (colonIndex === -1) return null;

  const prefix = name.slice(0, colonIndex);
  const icon = name.slice(colonIndex + 1);

  if (!prefix || !icon) return null;

  try {
    const response = await fetch(`https://api.iconify.design/${prefix}/${icon}.svg`);
    if (!response.ok) return null;
    return response.text();
  } catch {
    return null;
  }
}

/**
 * Fetch JSON from a URL with optional headers.
 */
export async function fetchJson<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T | null> {
  try {
    const response = await fetch(url, options);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Fetch text content from a URL.
 */
export async function fetchText(
  url: string,
  options?: RequestInit,
): Promise<string | null> {
  try {
    const response = await fetch(url, options);
    if (!response.ok) return null;
    return response.text();
  } catch {
    return null;
  }
}
