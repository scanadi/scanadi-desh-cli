import type { Command } from 'commander';
import { runFigmaCode } from '../utils/figma-eval.js';
import { error } from '../utils/output.js';

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerA11yCommands(program: Command): void {
  const a11y = program
    .command('a11y')
    .description('Accessibility checks (WCAG contrast, vision simulation, touch targets, text, audit)');

  // ---- a11y contrast --------------------------------------------------------
  a11y
    .command('contrast [nodeId]')
    .description('Check WCAG AA/AAA contrast ratios for all text nodes')
    .option('--level <level>', 'WCAG level: AA or AAA', 'AA')
    .option('--json', 'Output as JSON')
    .action(async (nodeId: string | undefined, opts: { level: string; json?: boolean }) => {
      const level = opts.level.toUpperCase();
      const code = `(async () => {
  const targetId = ${nodeId ? JSON.stringify(nodeId) : 'null'};
  const root = targetId ? await figma.getNodeByIdAsync(targetId) : figma.currentPage;
  if (!root) return { error: 'Node not found' };

  function luminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }
  function contrastRatio(l1, l2) {
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function getSolidColor(node) {
    if (node.fills && Array.isArray(node.fills)) {
      for (const f of node.fills) {
        if (f.type === 'SOLID' && f.visible !== false) {
          return { r: f.color.r, g: f.color.g, b: f.color.b, a: f.opacity !== undefined ? f.opacity : 1 };
        }
      }
    }
    return null;
  }
  function getBgColor(node) {
    let cur = node.parent;
    while (cur) { const c = getSolidColor(cur); if (c && c.a > 0.01) return c; cur = cur.parent; }
    return { r: 1, g: 1, b: 1, a: 1 };
  }
  function blendOnWhite(fg, bg) {
    return { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
  }
  function toHex(c) {
    return '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  }

  const results = [];
  const level = ${JSON.stringify(level)};

  function traverse(node) {
    if (node.type === 'TEXT' && node.visible !== false) {
      const textColor = getSolidColor(node);
      if (textColor) {
        const bgColor = getBgColor(node);
        const fg = blendOnWhite(textColor, { r: 1, g: 1, b: 1 });
        const bg = blendOnWhite(bgColor, { r: 1, g: 1, b: 1 });
        const l1 = luminance(fg.r, fg.g, fg.b);
        const l2 = luminance(bg.r, bg.g, bg.b);
        const ratio = contrastRatio(l1, l2);
        const fontSize = typeof node.fontSize === 'number' ? node.fontSize : 16;
        const fontWeight = node.fontWeight || 400;
        const isLarge = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);
        const aaPass = isLarge ? ratio >= 3 : ratio >= 4.5;
        const aaaPass = isLarge ? ratio >= 4.5 : ratio >= 7;
        results.push({
          id: node.id,
          name: node.name,
          text: node.characters ? node.characters.substring(0, 50) : '',
          fontSize,
          isLarge,
          fgColor: toHex(fg),
          bgColor: toHex(bg),
          ratio: Math.round(ratio * 100) / 100,
          aa: aaPass,
          aaa: aaaPass
        });
      }
    }
    if ('children' in node) {
      for (const child of node.children) { if (child.visible !== false) traverse(child); }
    }
  }

  if ('children' in root) { for (const child of root.children) traverse(child); } else { traverse(root); }

  const passing = results.filter(r => level === 'AAA' ? r.aaa : r.aa);
  const failing = results.filter(r => level === 'AAA' ? !r.aaa : !r.aa);
  return { level, total: results.length, passing: passing.length, failing: failing.length, issues: failing, all: results };
})()`;

      try {
        const result = await runFigmaCode(code) as { error?: string; level: string; total: number; passing: number; failing: number; issues: Array<{ id: string; name: string; text: string; fontSize: number; isLarge: boolean; fgColor: string; bgColor: string; ratio: number; aa: boolean; aaa: boolean }> };

        if (result.error) { error(result.error); process.exit(1); }

        if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }

        console.log(`\n\x1b[36m  Contrast Check (WCAG ${result.level})\x1b[0m\n`);
        console.log(`  \x1b[32m✓ Pass:\x1b[0m ${result.passing}/${result.total}   \x1b[31m✗ Fail:\x1b[0m ${result.failing}/${result.total}\n`);

        if (result.issues.length > 0) {
          console.log('\x1b[31m  Failing elements:\x1b[0m\n');
          for (const issue of result.issues) {
            const ratioStr = issue.ratio.toFixed(2) + ':1';
            const needed = issue.isLarge
              ? (result.level === 'AAA' ? '4.5:1' : '3:1')
              : (result.level === 'AAA' ? '7:1' : '4.5:1');
            console.log(`  \x1b[31m✗\x1b[0m \x1b[1m${issue.name}\x1b[0m \x1b[90m— "${issue.text}"\x1b[0m`);
            console.log(`    \x1b[90mRatio:\x1b[0m \x1b[33m${ratioStr}\x1b[0m \x1b[90m(need ${needed})  FG:\x1b[0m ${issue.fgColor}  \x1b[90mBG:\x1b[0m ${issue.bgColor}  \x1b[90mSize:\x1b[0m ${issue.fontSize}px${issue.isLarge ? ' (large)' : ''}`);
            console.log(`    \x1b[90mID: ${issue.id}\x1b[0m\n`);
          }
        } else {
          console.log(`\x1b[32m  All text passes WCAG ${result.level}! ✓\x1b[0m\n`);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- a11y vision ----------------------------------------------------------
  a11y
    .command('vision [nodeId]')
    .description('Color blindness simulation (protanopia, deuteranopia, tritanopia, achromatopsia)')
    .option('--type <type>', 'Simulation type: protanopia | deuteranopia | tritanopia | achromatopsia | all', 'all')
    .option('--json', 'Output as JSON')
    .action(async (nodeId: string | undefined, opts: { type: string; json?: boolean }) => {
      const simType = opts.type.toLowerCase();
      const code = `(async () => {
  const targetId = ${nodeId ? JSON.stringify(nodeId) : 'null'};
  const root = targetId ? await figma.getNodeByIdAsync(targetId) : figma.currentPage.selection[0];
  if (!root) return { error: 'Select a frame or provide a node ID' };

  const matrices = {
    protanopia:    [0.152286,1.052583,-0.204868, 0.114503,0.786281,0.099216, -0.003882,-0.048116,1.051998],
    deuteranopia:  [0.367322,0.860646,-0.227968, 0.280085,0.672501,0.047413, -0.011820,0.042940,0.968881],
    tritanopia:    [1.255528,-0.076749,-0.178779, -0.078411,0.930809,0.147602, 0.004733,0.691367,0.303900],
    achromatopsia: [0.2126,0.7152,0.0722, 0.2126,0.7152,0.0722, 0.2126,0.7152,0.0722]
  };
  function applyMatrix(r, g, b, m) {
    return {
      r: Math.max(0, Math.min(1, m[0]*r + m[1]*g + m[2]*b)),
      g: Math.max(0, Math.min(1, m[3]*r + m[4]*g + m[5]*b)),
      b: Math.max(0, Math.min(1, m[6]*r + m[7]*g + m[8]*b))
    };
  }
  function toHex(c) {
    return '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  }

  const simType = ${JSON.stringify(simType)};
  const types = simType === 'all' ? Object.keys(matrices) : [simType];
  if (!types.every(t => matrices[t])) return { error: 'Unknown type. Use: protanopia, deuteranopia, tritanopia, achromatopsia, all' };

  const colorMap = new Map();
  function collectColors(node) {
    if (node.fills && Array.isArray(node.fills)) {
      for (const f of node.fills) { if (f.type === 'SOLID' && f.visible !== false) { const hex = toHex(f.color); if (!colorMap.has(hex)) colorMap.set(hex, { ...f.color }); } }
    }
    if (node.strokes && Array.isArray(node.strokes)) {
      for (const s of node.strokes) { if (s.type === 'SOLID' && s.visible !== false) { const hex = toHex(s.color); if (!colorMap.has(hex)) colorMap.set(hex, { ...s.color }); } }
    }
    if ('children' in node) { for (const child of node.children) collectColors(child); }
  }
  collectColors(root);

  const simulations = {};
  for (const type of types) {
    const matrix = matrices[type];
    const colors = [];
    for (const [hex, color] of colorMap) {
      const sim = applyMatrix(color.r, color.g, color.b, matrix);
      colors.push({ original: hex, simulated: toHex(sim) });
    }
    const confusable = [];
    const entries = Array.from(colorMap.entries());
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [hex1, c1] = entries[i];
        const [hex2, c2] = entries[j];
        const s1 = applyMatrix(c1.r, c1.g, c1.b, matrix);
        const s2 = applyMatrix(c2.r, c2.g, c2.b, matrix);
        const diff = Math.sqrt((s1.r-s2.r)**2 + (s1.g-s2.g)**2 + (s1.b-s2.b)**2);
        const origDiff = Math.sqrt((c1.r-c2.r)**2 + (c1.g-c2.g)**2 + (c1.b-c2.b)**2);
        if (diff < 0.05 && origDiff > 0.1) {
          confusable.push({ color1: hex1, color2: hex2, simulated1: toHex(s1), simulated2: toHex(s2) });
        }
      }
    }
    simulations[type] = { colors, confusable };
  }

  const clones = [];
  const rootX = root.x;
  const rootWidth = root.width;
  let offsetX = rootX + rootWidth + 100;

  for (const type of types) {
    const clone = root.clone();
    clone.name = root.name + ' (' + type.charAt(0).toUpperCase() + type.slice(1) + ')';
    clone.x = offsetX;
    clone.y = root.y;
    const matrix = matrices[type];
    function transformColors(node) {
      if (node.fills && Array.isArray(node.fills)) {
        node.fills = node.fills.map(f => {
          if (f.type === 'SOLID' && f.visible !== false) {
            const s = applyMatrix(f.color.r, f.color.g, f.color.b, matrix);
            return { ...f, color: { r: s.r, g: s.g, b: s.b } };
          }
          return f;
        });
      }
      if (node.strokes && Array.isArray(node.strokes)) {
        node.strokes = node.strokes.map(s => {
          if (s.type === 'SOLID' && s.visible !== false) {
            const sim = applyMatrix(s.color.r, s.color.g, s.color.b, matrix);
            return { ...s, color: { r: sim.r, g: sim.g, b: sim.b } };
          }
          return s;
        });
      }
      if ('children' in node) { for (const child of node.children) transformColors(child); }
    }
    transformColors(clone);
    clones.push({ id: clone.id, name: clone.name, type });
    offsetX += rootWidth + 60;
  }

  return { original: root.name, totalColors: colorMap.size, types, simulations, clones };
})()`;

      try {
        const result = await runFigmaCode(code) as { error?: string; original: string; totalColors: number; types: string[]; simulations: Record<string, { colors: Array<{ original: string; simulated: string }>; confusable: Array<{ color1: string; color2: string; simulated1: string; simulated2: string }> }>; clones: Array<{ id: string; name: string; type: string }> };

        if (result.error) { error(result.error); process.exit(1); }

        if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }

        console.log('\n\x1b[36m  Color Blindness Simulation\x1b[0m\n');
        console.log(`  Source: \x1b[1m${result.original}\x1b[0m (${result.totalColors} unique colors)\n`);
        console.log('  Created simulation copies:\n');

        for (const clone of result.clones) {
          const sim = result.simulations[clone.type];
          const issues = sim.confusable.length;
          const icon = issues > 0 ? '\x1b[33m⚠\x1b[0m' : '\x1b[32m✓\x1b[0m';
          console.log(`  ${icon} \x1b[1m${clone.name}\x1b[0m`);
          if (issues > 0) {
            console.log(`    \x1b[33m${issues} confusable color pair(s):\x1b[0m`);
            for (const pair of sim.confusable) {
              console.log(`    ${pair.color1} ↔ ${pair.color2} → both appear as ~${pair.simulated1}`);
            }
          } else {
            console.log(`    \x1b[32mNo confusable colors\x1b[0m`);
          }
          console.log(`    \x1b[90mID: ${clone.id}\x1b[0m\n`);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- a11y touch -----------------------------------------------------------
  a11y
    .command('touch [nodeId]')
    .description('Check touch target sizes (WCAG 2.5.8: min 24x24, recommended 44x44)')
    .option('--min <size>', 'Minimum size threshold in px', '44')
    .option('--json', 'Output as JSON')
    .action(async (nodeId: string | undefined, opts: { min: string; json?: boolean }) => {
      const minSize = parseInt(opts.min, 10) || 44;
      const code = `(async () => {
  const targetId = ${nodeId ? JSON.stringify(nodeId) : 'null'};
  const root = targetId ? await figma.getNodeByIdAsync(targetId) : figma.currentPage;
  if (!root) return { error: 'Node not found' };

  const minSize = ${minSize};
  const interactivePatterns = /button|btn|link|tab|toggle|switch|checkbox|radio|input|select|dropdown|menu|icon-btn|close|nav|click|tap|cta/i;
  const results = [];

  function traverse(node) {
    if (node.visible === false) return;
    const isInteractive = (
      node.type === 'INSTANCE' ||
      node.type === 'COMPONENT' ||
      interactivePatterns.test(node.name) ||
      (node.reactions && node.reactions.length > 0)
    );
    if (isInteractive) {
      const w = Math.round(node.width);
      const h = Math.round(node.height);
      const pass = w >= minSize && h >= minSize;
      const wcag248 = w >= 24 && h >= 24;
      results.push({ id: node.id, name: node.name, type: node.type, width: w, height: h, pass, wcag248,
        issue: !pass ? (w < minSize && h < minSize ? 'both' : w < minSize ? 'width' : 'height') : null
      });
    }
    if ('children' in node) { for (const child of node.children) traverse(child); }
  }

  if ('children' in root) { for (const child of root.children) traverse(child); }

  const passing = results.filter(r => r.pass);
  const failing = results.filter(r => !r.pass);
  const critical = results.filter(r => !r.wcag248);
  return { minSize, total: results.length, passing: passing.length, failing: failing.length, critical: critical.length, issues: failing };
})()`;

      try {
        const result = await runFigmaCode(code) as { error?: string; minSize: number; total: number; passing: number; failing: number; critical: number; issues: Array<{ id: string; name: string; type: string; width: number; height: number; pass: boolean; wcag248: boolean; issue: string | null }> };

        if (result.error) { error(result.error); process.exit(1); }

        if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }

        console.log(`\n\x1b[36m  Touch Target Check (min ${result.minSize}x${result.minSize}px)\x1b[0m\n`);
        console.log(`  \x1b[32m✓ Pass:\x1b[0m ${result.passing}/${result.total}   \x1b[31m✗ Fail:\x1b[0m ${result.failing}/${result.total}   \x1b[31m⚠ Critical (<24px):\x1b[0m ${result.critical}\n`);

        if (result.issues.length > 0) {
          console.log('\x1b[31m  Undersized targets:\x1b[0m\n');
          for (const issue of result.issues) {
            const icon = !issue.wcag248 ? '\x1b[31m⚠\x1b[0m' : '\x1b[33m✗\x1b[0m';
            console.log(`  ${icon} \x1b[1m${issue.name}\x1b[0m \x1b[90m(${issue.type})\x1b[0m  \x1b[33m${issue.width}x${issue.height}px\x1b[0m  \x1b[90mID: ${issue.id}\x1b[0m`);
          }
          console.log('');
        } else {
          console.log('\x1b[32m  All interactive elements meet minimum size! ✓\x1b[0m\n');
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- a11y text ------------------------------------------------------------
  a11y
    .command('text [nodeId]')
    .description('Check text accessibility: minimum size (12px), line height, paragraph spacing, letter spacing')
    .option('--json', 'Output as JSON')
    .action(async (nodeId: string | undefined, opts: { json?: boolean }) => {
      const code = `(async () => {
  const targetId = ${nodeId ? JSON.stringify(nodeId) : 'null'};
  const root = targetId ? await figma.getNodeByIdAsync(targetId) : figma.currentPage;
  if (!root) return { error: 'Node not found' };

  const results = [];

  function traverse(node) {
    if (node.visible === false) return;
    if (node.type === 'TEXT') {
      const fontSize = typeof node.fontSize === 'number' ? node.fontSize : null;
      const lineHeight = node.lineHeight;
      let lineHeightRatio = null;
      let lineHeightValue = null;
      if (lineHeight) {
        if (lineHeight.unit === 'PIXELS' && fontSize) { lineHeightValue = lineHeight.value; lineHeightRatio = lineHeight.value / fontSize; }
        else if (lineHeight.unit === 'PERCENT') { lineHeightRatio = lineHeight.value / 100; if (fontSize) lineHeightValue = fontSize * lineHeightRatio; }
      }
      const issues = [];
      if (fontSize && fontSize < 12) {
        issues.push({ rule: 'min-size', message: 'Font size < 12px (hard to read)', severity: 'error' });
      } else if (fontSize && fontSize < 14) {
        issues.push({ rule: 'min-size', message: 'Font size < 14px (consider increasing for body text)', severity: 'warning' });
      }
      if (fontSize && fontSize <= 18 && lineHeightRatio && lineHeightRatio < 1.5) {
        issues.push({ rule: 'line-height', message: 'Line height ' + lineHeightRatio.toFixed(2) + 'x < 1.5x for body text (WCAG 1.4.12)', severity: 'warning' });
      }
      if (node.paragraphSpacing !== undefined && fontSize && node.paragraphSpacing > 0 && node.paragraphSpacing < fontSize * 2) {
        issues.push({ rule: 'paragraph-spacing', message: 'Paragraph spacing < 2x font size (WCAG 1.4.12)', severity: 'warning' });
      }
      if (node.letterSpacing && node.letterSpacing.unit === 'PIXELS' && fontSize && node.letterSpacing.value < fontSize * 0.12 && node.letterSpacing.value !== 0) {
        issues.push({ rule: 'letter-spacing', message: 'Letter spacing < 0.12x font size (WCAG 1.4.12)', severity: 'warning' });
      }
      if (node.textCase === 'UPPER' && node.characters && node.characters.length > 20) {
        issues.push({ rule: 'all-caps', message: 'Long ALL CAPS text (> 20 chars) reduces readability', severity: 'warning' });
      }
      results.push({
        id: node.id, name: node.name,
        text: node.characters ? node.characters.substring(0, 40) : '',
        fontSize, lineHeight: lineHeightValue ? Math.round(lineHeightValue * 10) / 10 : null,
        lineHeightRatio: lineHeightRatio ? Math.round(lineHeightRatio * 100) / 100 : null,
        issues
      });
    }
    if ('children' in node) { for (const child of node.children) traverse(child); }
  }

  if ('children' in root) { for (const child of root.children) traverse(child); }

  const withIssues = results.filter(r => r.issues.length > 0);
  const errors = withIssues.filter(r => r.issues.some(i => i.severity === 'error'));
  const warnings = withIssues.filter(r => r.issues.some(i => i.severity === 'warning') && !r.issues.some(i => i.severity === 'error'));
  return { total: results.length, errors: errors.length, warnings: warnings.length, passing: results.length - withIssues.length, issues: withIssues };
})()`;

      try {
        const result = await runFigmaCode(code) as { error?: string; total: number; errors: number; warnings: number; passing: number; issues: Array<{ id: string; name: string; text: string; fontSize: number | null; lineHeight: number | null; lineHeightRatio: number | null; issues: Array<{ rule: string; message: string; severity: string }> }> };

        if (result.error) { error(result.error); process.exit(1); }

        if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }

        console.log('\n\x1b[36m  Text Accessibility Check\x1b[0m\n');
        console.log(`  \x1b[32m✓ Pass:\x1b[0m ${result.passing}/${result.total}   \x1b[31m✗ Errors:\x1b[0m ${result.errors}   \x1b[33m⚠ Warnings:\x1b[0m ${result.warnings}\n`);

        if (result.issues.length > 0) {
          for (const item of result.issues) {
            const icon = item.issues.some(i => i.severity === 'error') ? '\x1b[31m✗\x1b[0m' : '\x1b[33m⚠\x1b[0m';
            const lhStr = item.lineHeightRatio ? ` / ${item.lineHeightRatio}x` : '';
            console.log(`  ${icon} \x1b[1m${item.name}\x1b[0m \x1b[90m— "${item.text}"\x1b[0m  \x1b[90m${item.fontSize}px${lhStr}\x1b[0m`);
            for (const issue of item.issues) {
              const col = issue.severity === 'error' ? '\x1b[31m' : '\x1b[33m';
              console.log(`    ${col}${issue.message}\x1b[0m`);
            }
            console.log(`    \x1b[90mID: ${item.id}\x1b[0m\n`);
          }
        } else {
          console.log('\x1b[32m  All text passes accessibility checks! ✓\x1b[0m\n');
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- a11y audit -----------------------------------------------------------
  a11y
    .command('audit [nodeId]')
    .description('Full accessibility audit — contrast + touch targets + text (WCAG AA/AAA)')
    .option('--level <level>', 'WCAG level: AA or AAA', 'AA')
    .option('--json', 'Output as JSON')
    .action(async (nodeId: string | undefined, opts: { level: string; json?: boolean }) => {
      const level = opts.level.toUpperCase();
      const code = `(async () => {
  const targetId = ${nodeId ? JSON.stringify(nodeId) : 'null'};
  const root = targetId ? await figma.getNodeByIdAsync(targetId) : figma.currentPage;
  if (!root) return { error: 'Node not found' };

  function luminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }
  function contrastRatio(l1, l2) { return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
  function getSolidColor(node) {
    if (node.fills && Array.isArray(node.fills)) {
      for (const f of node.fills) { if (f.type === 'SOLID' && f.visible !== false) return { r: f.color.r, g: f.color.g, b: f.color.b, a: f.opacity !== undefined ? f.opacity : 1 }; }
    }
    return null;
  }
  function getBgColor(node) {
    let cur = node.parent;
    while (cur) { const c = getSolidColor(cur); if (c && c.a > 0.01) return c; cur = cur.parent; }
    return { r: 1, g: 1, b: 1, a: 1 };
  }
  function toHex(c) { return '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''); }

  const interactivePatterns = /button|btn|link|tab|toggle|switch|checkbox|radio|input|select|dropdown|menu|icon-btn|close|nav|click|tap|cta/i;
  const level = ${JSON.stringify(level)};
  const issues = [];
  let textCount = 0, interactiveCount = 0;

  function traverse(node) {
    if (node.visible === false) return;

    if (node.type === 'TEXT') {
      textCount++;
      const textColor = getSolidColor(node);
      if (textColor) {
        const bgColor = getBgColor(node);
        const l1 = luminance(textColor.r * textColor.a + (1 - textColor.a), textColor.g * textColor.a + (1 - textColor.a), textColor.b * textColor.a + (1 - textColor.a));
        const l2 = luminance(bgColor.r, bgColor.g, bgColor.b);
        const ratio = contrastRatio(l1, l2);
        const fontSize = typeof node.fontSize === 'number' ? node.fontSize : 16;
        const fontWeight = node.fontWeight || 400;
        const isLarge = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);
        const aaReq = isLarge ? 3 : 4.5;
        const aaaReq = isLarge ? 4.5 : 7;
        const req = level === 'AAA' ? aaaReq : aaReq;
        if (ratio < req) {
          issues.push({ category: 'contrast', severity: ratio < (isLarge ? 3 : 4.5) ? 'error' : 'warning',
            id: node.id, name: node.name, message: 'Contrast ' + ratio.toFixed(2) + ':1 (need ' + req + ':1)',
            details: { ratio: Math.round(ratio * 100) / 100, required: req, fg: toHex(textColor), bg: toHex(bgColor), fontSize }
          });
        }
      }
      const fontSize = typeof node.fontSize === 'number' ? node.fontSize : null;
      if (fontSize && fontSize < 12) {
        issues.push({ category: 'text', severity: 'error', id: node.id, name: node.name, message: 'Font size ' + fontSize + 'px < 12px minimum' });
      }
      if (fontSize && fontSize <= 18 && node.lineHeight) {
        let lhRatio = null;
        if (node.lineHeight.unit === 'PIXELS') lhRatio = node.lineHeight.value / fontSize;
        else if (node.lineHeight.unit === 'PERCENT') lhRatio = node.lineHeight.value / 100;
        if (lhRatio && lhRatio < 1.5) {
          issues.push({ category: 'text', severity: 'warning', id: node.id, name: node.name, message: 'Line height ' + lhRatio.toFixed(2) + 'x < 1.5x (WCAG 1.4.12)' });
        }
      }
      if (node.textCase === 'UPPER' && node.characters && node.characters.length > 20) {
        issues.push({ category: 'text', severity: 'warning', id: node.id, name: node.name, message: 'Long ALL CAPS text reduces readability' });
      }
    }

    const isInteractive = (
      node.type === 'INSTANCE' || node.type === 'COMPONENT' ||
      interactivePatterns.test(node.name) || (node.reactions && node.reactions.length > 0)
    );
    if (isInteractive) {
      interactiveCount++;
      const w = Math.round(node.width); const h = Math.round(node.height);
      if (w < 24 || h < 24) {
        issues.push({ category: 'touch', severity: 'error', id: node.id, name: node.name, message: 'Touch target ' + w + 'x' + h + 'px < 24x24 minimum (WCAG 2.5.8)' });
      } else if (w < 44 || h < 44) {
        issues.push({ category: 'touch', severity: 'warning', id: node.id, name: node.name, message: 'Touch target ' + w + 'x' + h + 'px < 44x44 recommended' });
      }
    }

    if ('children' in node) { for (const child of node.children) traverse(child); }
  }

  if ('children' in root) { for (const child of root.children) traverse(child); }

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const contrastIssues = issues.filter(i => i.category === 'contrast');
  const textIssues = issues.filter(i => i.category === 'text');
  const touchIssues = issues.filter(i => i.category === 'touch');
  const score = issues.length === 0 ? 'A+' : errors.length === 0 ? 'B' : errors.length <= 3 ? 'C' : 'D';

  return {
    score, level,
    summary: { textNodes: textCount, interactiveElements: interactiveCount, errors: errors.length, warnings: warnings.length },
    breakdown: {
      contrast: { issues: contrastIssues.length, errors: contrastIssues.filter(i => i.severity === 'error').length },
      text: { issues: textIssues.length, errors: textIssues.filter(i => i.severity === 'error').length },
      touch: { issues: touchIssues.length, errors: touchIssues.filter(i => i.severity === 'error').length }
    },
    issues
  };
})()`;

      try {
        type AuditResult = {
          error?: string;
          score: string;
          level: string;
          summary: { textNodes: number; interactiveElements: number; errors: number; warnings: number };
          breakdown: {
            contrast: { issues: number; errors: number };
            text: { issues: number; errors: number };
            touch: { issues: number; errors: number };
          };
          issues: Array<{ category: string; severity: string; id: string; name: string; message: string }>;
        };

        const result = await runFigmaCode(code) as AuditResult;

        if (result.error) { error(result.error); process.exit(1); }

        if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }

        const scoreColor = result.score === 'A+' ? '\x1b[32m' : result.score === 'B' ? '\x1b[33m' : '\x1b[31m';

        console.log(`\n\x1b[36m  Accessibility Audit (WCAG ${result.level})\x1b[0m\n`);
        console.log(`  Score: ${scoreColor}${result.score}\x1b[0m   \x1b[90m(${result.summary.textNodes} text nodes, ${result.summary.interactiveElements} interactive elements)\x1b[0m\n`);

        const bd = result.breakdown;
        const catIcon = (c: { errors: number; issues: number }) =>
          c.errors > 0 ? '\x1b[31m✗\x1b[0m' : c.issues > 0 ? '\x1b[33m⚠\x1b[0m' : '\x1b[32m✓\x1b[0m';
        const catStatus = (c: { errors: number; issues: number }) =>
          c.issues === 0
            ? '\x1b[32mPass\x1b[0m'
            : `\x1b[31m${c.errors} error(s)\x1b[0m${c.issues - c.errors > 0 ? `, \x1b[33m${c.issues - c.errors} warning(s)\x1b[0m` : ''}`;

        console.log(`  ${catIcon(bd.contrast)} Contrast      ${catStatus(bd.contrast)}`);
        console.log(`  ${catIcon(bd.text)} Text          ${catStatus(bd.text)}`);
        console.log(`  ${catIcon(bd.touch)} Touch Target  ${catStatus(bd.touch)}`);

        if (result.issues.length > 0) {
          console.log('\n\x1b[31m  Issues:\x1b[0m\n');
          const cats: Array<{ key: string; label: string }> = [
            { key: 'contrast', label: 'Contrast' },
            { key: 'text', label: 'Text' },
            { key: 'touch', label: 'Touch Targets' },
          ];
          for (const { key, label } of cats) {
            const catIssues = result.issues.filter(i => i.category === key);
            if (catIssues.length === 0) continue;
            console.log(`  \x1b[1m${label}:\x1b[0m\n`);
            for (const issue of catIssues) {
              const icon = issue.severity === 'error' ? '\x1b[31m✗\x1b[0m' : '\x1b[33m⚠\x1b[0m';
              console.log(`  ${icon} \x1b[1m${issue.name}\x1b[0m — ${issue.message}  \x1b[90mID: ${issue.id}\x1b[0m`);
            }
            console.log('');
          }
        } else {
          console.log('\n\x1b[32m  Perfect score! No accessibility issues found. ✓\x1b[0m\n');
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
