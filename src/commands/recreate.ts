import type { Command } from 'commander';
import { info } from '../utils/output.js';

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerRecreateCommands(program: Command): void {
  // ---- recreate-url ---------------------------------------------------------
  program
    .command('recreate-url <url>')
    .description('Recreate a webpage as a Figma frame (requires screenshot-url first)')
    .option('-n, --name <name>', 'Frame name', 'Recreated Page')
    .option('--width <number>', 'Page width', '1440')
    .action((url: string, opts: { name: string; width: string }) => {
      info(`recreate-url: ${url}`);
      console.log('');
      console.log('  \x1b[33mNote:\x1b[0m This command requires a headless browser to capture page structure.');
      console.log('  Recommended workflow:');
      console.log('');
      console.log(`  1. First take a screenshot:`);
      console.log(`     \x1b[90mdesh screenshot-url "${url}"\x1b[0m`);
      console.log('');
      console.log('  2. Then analyze the URL structure:');
      console.log(`     \x1b[90mdesh analyze-url "${url}"\x1b[0m`);
      console.log('');
      console.log('  3. Use the analysis + render to build the frame:');
      console.log(`     \x1b[90mdesh render \'<Frame name="${opts.name}" w={${opts.width}} flex="col">...</Frame>\'\x1b[0m`);
      console.log('');
      console.log('  \x1b[90mFull headless browser integration requires additional setup.\x1b[0m');
      console.log('  \x1b[90mSee: https://github.com/your-org/figma-cli/blob/main/docs/recreate.md\x1b[0m');
      console.log('');
    });

  // ---- screenshot-url -------------------------------------------------------
  program
    .command('screenshot-url <url>')
    .description('Take a screenshot of a URL (requires headless browser)')
    .option('-o, --output <file>', 'Output file', 'screenshot.png')
    .option('-w, --width <number>', 'Viewport width', '1440')
    .option('-h, --height <number>', 'Viewport height', '900')
    .option('--full-page', 'Capture full page height')
    .action((url: string, opts: { output: string; width: string; height: string; fullPage?: boolean }) => {
      info(`screenshot-url: ${url}`);
      console.log('');
      console.log('  \x1b[33mNote:\x1b[0m This command requires a headless browser (Puppeteer or Playwright).');
      console.log('  To enable screenshot support, install one of:');
      console.log('');
      console.log('    \x1b[90mnpm install puppeteer\x1b[0m');
      console.log('    \x1b[90mnpm install playwright\x1b[0m');
      console.log('');
      console.log('  Configuration:');
      console.log(`    URL:     ${url}`);
      console.log(`    Output:  ${opts.output}`);
      console.log(`    Size:    ${opts.width}x${opts.height}`);
      console.log(`    Mode:    ${opts.fullPage ? 'full page' : 'viewport'}`);
      console.log('');
      console.log('  \x1b[90mAlternative: Take a manual screenshot and use `desh render` to recreate it.\x1b[0m');
      console.log('');
    });

  // ---- analyze-url ----------------------------------------------------------
  program
    .command('analyze-url <url>')
    .description('Analyze URL structure for Figma recreation (placeholder)')
    .option('--depth <number>', 'DOM depth to analyze', '3')
    .option('--json', 'Output as JSON')
    .action((url: string, opts: { depth: string; json?: boolean }) => {
      info(`analyze-url: ${url}`);
      console.log('');

      const placeholder = {
        url,
        status: 'placeholder',
        message: 'URL analysis requires a headless browser or HTTP fetch + HTML parser.',
        suggestions: [
          'Install puppeteer or playwright for full DOM analysis',
          'Use fetch + cheerio for basic structure extraction',
          'Manually inspect the page and use desh render to recreate',
        ],
        hint: 'For simple pages, the recreate-url command will guide you through the workflow.',
      };

      if (opts.json) {
        console.log(JSON.stringify(placeholder, null, 2));
      } else {
        console.log(`  Status: \x1b[33m${placeholder.status}\x1b[0m`);
        console.log(`  Message: ${placeholder.message}`);
        console.log('');
        console.log('  Suggestions:');
        for (const s of placeholder.suggestions) {
          console.log(`    • ${s}`);
        }
        console.log('');
        console.log(`  \x1b[90mHint: ${placeholder.hint}\x1b[0m`);
        console.log('');
      }
    });
}
