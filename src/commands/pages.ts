import type { Command } from 'commander';
import { runFigmaCode } from '../utils/figma-eval.js';
import { success, error } from '../utils/output.js';

export function registerPagesCommands(program: Command): void {
  const pages = program
    .command('pages')
    .description('Page navigation');

  pages
    .command('list')
    .description('List all pages in the file')
    .action(async () => {
      try {
        const result = await runFigmaCode<Array<{ id: string; name: string; childCount: number; isCurrent: boolean }>>(`(function() {
  const currentId = figma.currentPage.id;
  return figma.root.children.map(p => ({
    id: p.id, name: p.name, childCount: p.children.length, isCurrent: p.id === currentId
  }));
})()`);
        if (!Array.isArray(result) || result.length === 0) {
          console.log('No pages found.');
          return;
        }
        for (const p of result) {
          const marker = p.isCurrent ? ' ◄' : '';
          console.log(`  ${p.name}  (${p.childCount} nodes)  ${p.id}${marker}`);
        }
        success(`${result.length} page(s)`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  pages
    .command('switch <name>')
    .description('Switch to a page by name (partial match)')
    .action(async (name: string) => {
      try {
        const result = await runFigmaCode<{ id: string; name: string } | null>(`(function() {
  const target = ${JSON.stringify(name)};
  const page = figma.root.children.find(p =>
    p.name === target ||
    p.name.toLowerCase().includes(target.toLowerCase())
  );
  if (!page) return null;
  figma.currentPage = page;
  return { id: page.id, name: page.name };
})()`);
        if (!result) {
          error(`Page not found: "${name}"`);
          process.exit(1);
        }
        success(`Switched to "${result.name}"`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
