import type { Command } from 'commander';
import { getCdpPort } from '../patch/figma.js';
import { error } from '../utils/output.js';

interface CdpTab {
  title: string;
  url: string;
  id?: string;
  type?: string;
}

export function registerFilesCommand(program: Command): void {
  program
    .command('files')
    .description('List open Figma design files')
    .action(async () => {
      try {
        const port = getCdpPort();
        const response = await fetch(`http://localhost:${port}/json`);
        if (!response.ok) {
          throw new Error(`CDP server returned ${response.status}`);
        }
        const tabs = (await response.json()) as CdpTab[];
        const designFiles = tabs.filter(
          (t) => t.url && (t.url.includes('figma.com/design/') || t.url.includes('figma.com/file/')),
        );

        if (designFiles.length === 0) {
          console.log('No Figma design files open');
          return;
        }

        for (const file of designFiles) {
          console.log(`${file.title}  ${file.url}`);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
