import { readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Command } from 'commander';
import { runFigmaCode } from '../utils/figma-eval.js';
import { success, error, info } from '../utils/output.js';

// ---------------------------------------------------------------------------
// remove-bg command
// Uses remove.bg API to strip the background from the selected image node.
// API key is read from REMOVEBG_API_KEY environment variable.
// ---------------------------------------------------------------------------

export function registerRemoveBgCommand(program: Command): void {
  program
    .command('remove-bg')
    .description('Remove background from selected image node using remove.bg API (needs REMOVEBG_API_KEY)')
    .option('-o, --output <file>', 'Save result PNG to file instead of re-importing into Figma')
    .option('-k, --key <apiKey>', 'remove.bg API key (overrides REMOVEBG_API_KEY env var)')
    .action(async (opts: { output?: string; key?: string }) => {
      const apiKey = opts.key ?? process.env['REMOVEBG_API_KEY'];
      if (!apiKey) {
        error('No API key found. Set REMOVEBG_API_KEY or pass --key <apiKey>');
        process.exit(1);
        return;
      }

      // Step 1: Export selected image node as PNG bytes from Figma
      const exportCode = `(async () => {
const sel = figma.currentPage.selection;
if (sel.length === 0) return { error: 'No selection' };
const node = sel[0];
if (!('exportAsync' in node)) return { error: 'Selected node cannot be exported' };
const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
return {
  id: node.id,
  name: node.name,
  width: Math.round(node.width),
  height: Math.round(node.height),
  bytes: Array.from(bytes)
};
})()`;

      let nodeInfo: {
        id: string;
        name: string;
        width: number;
        height: number;
        bytes: number[];
        error?: string;
      };

      try {
        info('Exporting selected node as PNG...');
        nodeInfo = await runFigmaCode<typeof nodeInfo>(exportCode, 60_000);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
        return;
      }

      if (!nodeInfo || nodeInfo.error) {
        error(nodeInfo?.error ?? 'Export failed');
        process.exit(1);
        return;
      }

      // Step 2: Write PNG to temp file, then send to remove.bg
      const tmpPng = join(tmpdir(), `figma-removebg-${Date.now()}.png`);
      writeFileSync(tmpPng, Buffer.from(nodeInfo.bytes));

      info('Sending to remove.bg API...');

      let resultBytes: Buffer;
      try {
        // Use FormData to post image_file
        const { FormData, Blob } = await import('node:buffer').catch(
          () => import('buffer'),
        ) as unknown as { FormData: typeof globalThis.FormData; Blob: typeof globalThis.Blob };

        const imageBlob = new Blob([readFileSync(tmpPng)], { type: 'image/png' });
        const form = new FormData();
        form.append('image_file', imageBlob, `${nodeInfo.name}.png`);
        form.append('size', 'auto');

        const response = await fetch('https://api.remove.bg/v1.0/removebg', {
          method: 'POST',
          headers: { 'X-Api-Key': apiKey },
          body: form,
        });

        if (!response.ok) {
          const text = await response.text();
          error(`remove.bg API error ${response.status}: ${text}`);
          process.exit(1);
          return;
        }

        resultBytes = Buffer.from(await response.arrayBuffer());
      } catch (fetchErr) {
        error(`remove.bg request failed: ${String((fetchErr as Error).message)}`);
        process.exit(1);
        return;
      }

      // Step 3: Either save to file or reimport into Figma
      if (opts.output) {
        writeFileSync(opts.output, resultBytes);
        success(`Background removed. Saved to ${opts.output}`);
        return;
      }

      // Re-import into Figma: create a new image fill on the same node
      const base64 = resultBytes.toString('base64');
      const reimportCode = `(async () => {
const nodeId = ${JSON.stringify(nodeInfo.id)};
const base64 = ${JSON.stringify(base64)};
const node = await figma.getNodeByIdAsync(nodeId);
if (!node) return { error: 'Node not found: ' + nodeId };
if (!('fills' in node)) return { error: 'Node does not support fills' };

// Decode base64 → Uint8Array
const raw = atob(base64);
const bytes = new Uint8Array(raw.length);
for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

const image = figma.createImage(bytes);
const paint = {
  type: 'IMAGE',
  scaleMode: 'FILL',
  imageHash: image.hash
};
node.fills = [paint];
return 'Background removed and image updated on: ' + node.name;
})()`;

      try {
        info('Reimporting result into Figma...');
        const reimportResult = await runFigmaCode(reimportCode, 60_000);
        if (typeof reimportResult === 'string') {
          success(reimportResult);
        } else {
          const r = reimportResult as { error?: string };
          if (r?.error) {
            error(r.error);
            process.exit(1);
          } else {
            success('Background removed');
          }
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
