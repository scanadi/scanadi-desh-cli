import type { Command } from 'commander';
import * as readline from 'readline';
import { installSkill, isSkillInstalled, type SkillLocation } from '../utils/skill-setup.js';
import { ensurePluginFiles } from '../utils/plugin-setup.js';
import { success, error, info } from '../utils/output.js';

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}

/**
 * Run the interactive skill setup prompt.
 * Returns the location where the skill was installed, or null if skipped.
 */
export async function runSkillSetup(opts?: { yes?: boolean }): Promise<SkillLocation | null> {
  const existing = isSkillInstalled();
  if (existing) {
    info(`Claude Code skill already installed (${existing})`);
    return existing;
  }

  console.log('');
  info('Claude Code skill setup');
  console.log('');
  console.log('  desh includes an AI skill that teaches Claude Code how to use Figma.');
  console.log('  Without it, Claude won\'t know desh commands.');
  console.log('');
  console.log('  Where should the skill be installed?');
  console.log('');
  console.log('  1. Project  — .claude/skills/desh/ (this project only, commit to git)');
  console.log('  2. Global   — ~/.claude/skills/desh/ (all projects on this machine)');
  console.log('');

  let choice: string;
  if (opts?.yes) {
    choice = '1';
    info('Defaulting to project-level install (-y flag)');
  } else {
    choice = await ask('  Choose [1/2]: ');
  }

  let location: SkillLocation;
  if (choice === '2') {
    location = 'global';
  } else if (choice === '1' || choice === '') {
    location = 'project';
  } else {
    error(`Invalid choice: ${choice}`);
    return null;
  }

  const destDir = installSkill(location);
  success(`Skill installed → ${destDir}`);
  return location;
}

export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description('Install the desh skill for Claude Code and set up the Figma plugin')
    .option('-y, --yes', 'Skip prompts, accept defaults')
    .action(async (opts: { yes?: boolean }) => {
      try {
        // 1. Skill setup
        await runSkillSetup(opts);

        // 2. Plugin setup
        console.log('');
        const pluginDir = ensurePluginFiles();
        success(`Figma plugin ready → ${pluginDir}`);

        console.log('');
        info('Setup complete. Next steps:');
        console.log('  1. Run `desh init` to scan your project');
        console.log('  2. Run `desh connect` to link Figma');
        console.log('');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
