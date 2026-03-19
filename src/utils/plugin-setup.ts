import { existsSync, mkdirSync, copyFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const PLUGIN_DIR = join(homedir(), '.desh', 'plugin');
const PLUGIN_FILES = ['manifest.json', 'code.js', 'ui.html'];

/**
 * Get the path to the plugin source directory shipped with this package.
 */
function getPackagePluginDir(): string {
  // tsup bundles into dist/cli.js → one level up to package root → plugin/
  const thisFile = fileURLToPath(import.meta.url);
  return join(dirname(thisFile), '..', 'plugin');
}

/**
 * Ensure plugin files exist at ~/.desh/plugin/.
 * Copies from the package's plugin/ dir if missing or outdated.
 * Returns the path to the plugin directory.
 */
export function ensurePluginFiles(): string {
  const sourceDir = getPackagePluginDir();

  if (!existsSync(sourceDir)) {
    throw new Error(`Plugin source not found at ${sourceDir}`);
  }

  mkdirSync(PLUGIN_DIR, { recursive: true });

  for (const file of PLUGIN_FILES) {
    const src = join(sourceDir, file);
    const dest = join(PLUGIN_DIR, file);

    if (!existsSync(src)) continue;

    // Copy if missing or content differs (handles updates)
    if (!existsSync(dest) || readFileSync(src, 'utf8') !== readFileSync(dest, 'utf8')) {
      copyFileSync(src, dest);
    }
  }

  return PLUGIN_DIR;
}

/**
 * Get the plugin directory path (without ensuring files exist).
 */
export function getPluginDir(): string {
  return PLUGIN_DIR;
}

/**
 * Check if plugin files have been set up at ~/.desh/plugin/.
 */
export function isPluginSetUp(): boolean {
  return PLUGIN_FILES.every((f) => existsSync(join(PLUGIN_DIR, f)));
}
