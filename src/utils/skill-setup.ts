import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const SKILL_NAME = 'desh';

/** Where Claude Code looks for global skills */
function globalSkillDir(): string {
  return join(homedir(), '.claude', 'skills', SKILL_NAME);
}

/** Where Claude Code looks for project-level skills */
function projectSkillDir(): string {
  return join(process.cwd(), '.claude', 'skills', SKILL_NAME);
}

/** Get the path to the skill source directory shipped with this package */
function getPackageSkillDir(): string {
  // tsup bundles into dist/cli.js → one level up to package root → skills/desh/
  const thisFile = fileURLToPath(import.meta.url);
  return join(dirname(thisFile), '..', 'skills', SKILL_NAME);
}

/** Recursively copy a directory */
function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      // Copy if missing or content differs
      if (!existsSync(destPath) || readFileSync(srcPath, 'utf8') !== readFileSync(destPath, 'utf8')) {
        copyFileSync(srcPath, destPath);
      }
    }
  }
}

export type SkillLocation = 'global' | 'project';

/** Install the desh skill to the chosen location */
export function installSkill(location: SkillLocation): string {
  const sourceDir = getPackageSkillDir();
  if (!existsSync(sourceDir)) {
    throw new Error(`Skill source not found at ${sourceDir}`);
  }

  const destDir = location === 'global' ? globalSkillDir() : projectSkillDir();
  copyDirRecursive(sourceDir, destDir);
  return destDir;
}

/** Check if the skill is installed at either location */
export function isSkillInstalled(): SkillLocation | null {
  const projectDir = projectSkillDir();
  if (existsSync(join(projectDir, 'SKILL.md'))) return 'project';

  const globalDir = globalSkillDir();
  if (existsSync(join(globalDir, 'SKILL.md'))) return 'global';

  return null;
}
