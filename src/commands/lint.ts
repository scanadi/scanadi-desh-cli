import type { Command } from 'commander';
import { runFigmaCode } from '../utils/figma-eval.js';
import { error } from '../utils/output.js';

// ---------------------------------------------------------------------------
// Lint rules
// ---------------------------------------------------------------------------

// Each rule returns a string fragment of JS that appends to `issues` array.
// The fragment has access to `node` and `depth`.

const RULES: Record<string, string> = {
  'no-default-names': `
    if (node.name.startsWith('Frame') || node.name.startsWith('Rectangle') ||
        node.name.startsWith('Group') || node.name.startsWith('Ellipse') ||
        node.name.startsWith('Line') || node.name.startsWith('Polygon') ||
        node.name.startsWith('Star') || node.name.startsWith('Vector')) {
      issues.push({ rule: 'no-default-names', severity: 'warning', id: node.id, name: node.name, message: 'Generic default name — consider renaming' });
    }`,

  'no-deeply-nested': `
    if (depth > 8) {
      issues.push({ rule: 'no-deeply-nested', severity: 'warning', id: node.id, name: node.name, message: 'Node nested ' + depth + ' levels deep (max recommended: 8)' });
    }`,

  'no-empty-frames': `
    if ((node.type === 'FRAME' || node.type === 'GROUP') && (!node.children || node.children.length === 0)) {
      issues.push({ rule: 'no-empty-frames', severity: 'info', id: node.id, name: node.name, message: 'Empty frame or group' });
    }`,

  'prefer-auto-layout': `
    if (node.type === 'FRAME' && (!node.layoutMode || node.layoutMode === 'NONE') && node.children && node.children.length > 1) {
      issues.push({ rule: 'prefer-auto-layout', severity: 'info', id: node.id, name: node.name, message: 'Frame with multiple children but no auto-layout' });
    }`,

  'no-hardcoded-colors': `
    if (node.fills && Array.isArray(node.fills)) {
      const hasFillBinding = node.boundVariables && node.boundVariables.fills;
      if (!hasFillBinding && node.fills.some(f => f.type === 'SOLID')) {
        issues.push({ rule: 'no-hardcoded-colors', severity: 'info', id: node.id, name: node.name, message: 'Hardcoded fill color — consider binding to a variable' });
      }
    }`,

  'color-contrast': `
    if (node.type === 'TEXT' && node.visible !== false) {
      function _luminance(r, g, b) {
        const [rs, gs, bs] = [r, g, b].map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }
      function _getSolid(n) {
        if (n.fills && Array.isArray(n.fills)) {
          for (const f of n.fills) { if (f.type === 'SOLID' && f.visible !== false) return { r: f.color.r, g: f.color.g, b: f.color.b, a: f.opacity !== undefined ? f.opacity : 1 }; }
        }
        return null;
      }
      function _getBg(n) {
        let cur = n.parent;
        while (cur) { const c = _getSolid(cur); if (c && c.a > 0.01) return c; cur = cur.parent; }
        return { r: 1, g: 1, b: 1, a: 1 };
      }
      const fg = _getSolid(node);
      if (fg) {
        const bg = _getBg(node);
        const l1 = _luminance(fg.r * fg.a + (1 - fg.a), fg.g * fg.a + (1 - fg.a), fg.b * fg.a + (1 - fg.a));
        const l2 = _luminance(bg.r, bg.g, bg.b);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const fs = typeof node.fontSize === 'number' ? node.fontSize : 16;
        const fw = node.fontWeight || 400;
        const isLarge = fs >= 18 || (fs >= 14 && fw >= 700);
        const req = isLarge ? 3 : 4.5;
        if (ratio < req) {
          issues.push({ rule: 'color-contrast', severity: ratio < (isLarge ? 3 : 4.5) ? 'error' : 'warning', id: node.id, name: node.name, message: 'Contrast ' + ratio.toFixed(2) + ':1 — need ' + req + ':1 (WCAG AA)' });
        }
      }
    }`,

  'touch-target-size': `
    const _itp = /button|btn|link|tab|toggle|switch|checkbox|radio|input|select|dropdown|menu|icon-btn|close|nav|click|tap|cta/i;
    const _isInteractive = (node.type === 'INSTANCE' || node.type === 'COMPONENT' || _itp.test(node.name) || (node.reactions && node.reactions.length > 0));
    if (_isInteractive) {
      const w = Math.round(node.width); const h = Math.round(node.height);
      if (w < 44 || h < 44) {
        issues.push({ rule: 'touch-target-size', severity: w < 24 || h < 24 ? 'error' : 'warning', id: node.id, name: node.name, message: 'Touch target ' + w + 'x' + h + 'px (recommended 44x44)' });
      }
    }`,

  'min-text-size': `
    if (node.type === 'TEXT') {
      const fs = typeof node.fontSize === 'number' ? node.fontSize : null;
      if (fs && fs < 12) {
        issues.push({ rule: 'min-text-size', severity: 'error', id: node.id, name: node.name, message: 'Font size ' + fs + 'px < 12px minimum' });
      } else if (fs && fs < 14) {
        issues.push({ rule: 'min-text-size', severity: 'warning', id: node.id, name: node.name, message: 'Font size ' + fs + 'px may be too small for body text' });
      }
    }`,
};

// Presets group rules by theme
const PRESETS: Record<string, string[]> = {
  accessibility: ['color-contrast', 'touch-target-size', 'min-text-size'],
  naming: ['no-default-names'],
  structure: ['no-deeply-nested', 'no-empty-frames', 'prefer-auto-layout'],
  tokens: ['no-hardcoded-colors'],
  all: Object.keys(RULES),
};

function buildLintCode(ruleKeys: string[]): string {
  const ruleFragments = ruleKeys.map(k => RULES[k] || '').join('\n');
  return `(function() {
  const issues = [];
  function checkNode(node, depth) {
    depth = depth || 0;
    ${ruleFragments}
    if ('children' in node) {
      node.children.forEach(function(c) { checkNode(c, depth + 1); });
    }
  }
  figma.currentPage.children.forEach(function(c) { checkNode(c, 0); });
  return { total: issues.length, issues: issues.slice(0, 100) };
})()`;
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerLintCommands(program: Command): void {
  // ---- lint ----------------------------------------------------------------
  program
    .command('lint')
    .description('Lint the current page for design issues')
    .option('--fix', 'Auto-fix issues where possible (renames generic nodes)')
    .option('--rule <rule>', 'Run a specific rule: ' + Object.keys(RULES).join(', '))
    .option('--preset <preset>', 'Run a preset group: ' + Object.keys(PRESETS).join(', '))
    .option('--json', 'Output as JSON')
    .action(async (opts: { fix?: boolean; rule?: string; preset?: string; json?: boolean }) => {
      // Determine which rules to run
      let ruleKeys: string[];
      if (opts.rule) {
        if (!RULES[opts.rule]) {
          error(`Unknown rule "${opts.rule}". Available: ${Object.keys(RULES).join(', ')}`);
          process.exit(1);
        }
        ruleKeys = [opts.rule];
      } else if (opts.preset) {
        if (!PRESETS[opts.preset]) {
          error(`Unknown preset "${opts.preset}". Available: ${Object.keys(PRESETS).join(', ')}`);
          process.exit(1);
        }
        ruleKeys = PRESETS[opts.preset];
      } else {
        ruleKeys = Object.keys(RULES);
      }

      const code = buildLintCode(ruleKeys);

      try {
        const result = await runFigmaCode(code, 60_000) as { total: number; issues: Array<{ rule: string; severity: string; id: string; name: string; message: string }> };

        if (opts.fix) {
          // Auto-fix: rename nodes with generic names
          const fixCode = `(async () => {
  const genericPrefixes = ['Frame', 'Rectangle', 'Group', 'Ellipse', 'Line', 'Polygon', 'Star', 'Vector'];
  let fixed = 0;
  function fixNode(node, depth) { depth = depth || 0;
    if (genericPrefixes.some(p => node.name.startsWith(p))) {
      node.name = node.type.charAt(0).toUpperCase() + node.type.slice(1).toLowerCase() + '_' + node.id.replace(':', '_');
      fixed++;
    }
    if ('children' in node && node.type !== 'INSTANCE' && depth < 6) node.children.forEach(function(c) { fixNode(c, depth + 1); });
  }
  figma.currentPage.children.forEach(function(c) { fixNode(c, 0); });
  return { fixed };
})()`;
          const fixResult = await runFigmaCode(fixCode, 60_000) as { fixed: number };
          console.log(`Auto-fixed ${fixResult.fixed} node(s)`);
        }

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        const severityColor = (s: string) => {
          if (s === 'error') return '\x1b[31m';
          if (s === 'warning') return '\x1b[33m';
          return '\x1b[90m';
        };
        const reset = '\x1b[0m';
        const cyan = '\x1b[36m';

        console.log(`\n${cyan}Lint results — ${result.total} issue(s)${reset}\n`);

        if (result.total === 0) {
          console.log('\x1b[32m  No issues found! ✓\x1b[0m\n');
          return;
        }

        // Group by rule
        const byRule = new Map<string, typeof result.issues>();
        for (const issue of result.issues) {
          if (!byRule.has(issue.rule)) byRule.set(issue.rule, []);
          byRule.get(issue.rule)!.push(issue);
        }

        for (const [rule, ruleIssues] of byRule) {
          console.log(`  \x1b[1m${rule}\x1b[0m (${ruleIssues.length})`);
          for (const i of ruleIssues) {
            const col = severityColor(i.severity);
            console.log(`  ${col}[${i.severity}]${reset} ${i.name}: ${i.message}`);
            console.log(`    \x1b[90mID: ${i.id}\x1b[0m`);
          }
          console.log('');
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- analyze (parent) ----------------------------------------------------
  const analyze = program
    .command('analyze')
    .description('Analyze design usage (colors, typography, spacing, clusters)');

  // ---- analyze colors -------------------------------------------------------
  analyze
    .command('colors')
    .description('Analyze color usage across the current page')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const code = `(function() {
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }
  const colors = new Map();
  function checkNode(node, depth) { depth = depth || 0;
    if (node.fills && Array.isArray(node.fills)) {
      node.fills.forEach(function(f) {
        if (f.type === 'SOLID' && f.color) {
          const hex = rgbToHex(f.color.r, f.color.g, f.color.b);
          colors.set(hex, (colors.get(hex) || 0) + 1);
        }
      });
    }
    if ('children' in node && node.type !== 'INSTANCE' && depth < 6) node.children.forEach(function(c) { checkNode(c, depth + 1); });
  }
  figma.currentPage.children.forEach(function(c) { checkNode(c, 0); });
  return Array.from(colors.entries())
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 20)
    .map(function(entry) { return { hex: entry[0], count: entry[1] }; });
})()`;

      try {
        const result = await runFigmaCode(code, 60_000) as Array<{ hex: string; count: number }>;

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log('\n\x1b[36mTop colors used:\x1b[0m\n');
        if (result.length === 0) {
          console.log('  No solid fill colors found.\n');
          return;
        }
        for (const c of result) {
          console.log(`  ${c.hex}  (${c.count}x)`);
        }
        console.log('');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- analyze typography ---------------------------------------------------
  analyze
    .command('typography')
    .alias('type')
    .description('Analyze typography usage across the current page')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const code = `(function() {
  const styles = new Map();
  function checkNode(node, depth) { depth = depth || 0;
    if (node.type === 'TEXT') {
      const family = node.fontName ? node.fontName.family : 'Unknown';
      const style = node.fontName ? node.fontName.style : 'Regular';
      const size = node.fontSize || 0;
      const key = family + '/' + size + '/' + style;
      styles.set(key, (styles.get(key) || 0) + 1);
    }
    if ('children' in node && node.type !== 'INSTANCE' && depth < 6) node.children.forEach(function(c) { checkNode(c, depth + 1); });
  }
  figma.currentPage.children.forEach(function(c) { checkNode(c, 0); });
  return Array.from(styles.entries())
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 20)
    .map(function(entry) {
      const parts = entry[0].split('/');
      return { family: parts[0], size: parseInt(parts[1], 10), style: parts[2], count: entry[1] };
    });
})()`;

      try {
        const result = await runFigmaCode(code, 60_000) as Array<{ family: string; size: number; style: string; count: number }>;

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log('\n\x1b[36mTypography usage:\x1b[0m\n');
        if (result.length === 0) {
          console.log('  No text nodes found.\n');
          return;
        }
        for (const t of result) {
          console.log(`  ${t.family} ${t.size}px ${t.style}  (${t.count}x)`);
        }
        console.log('');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- analyze spacing ------------------------------------------------------
  analyze
    .command('spacing')
    .description('Analyze gap and padding values across the current page')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const code = `(function() {
  const gaps = new Map();
  const paddings = new Map();
  function checkNode(node, depth) { depth = depth || 0;
    if (node.layoutMode && node.layoutMode !== 'NONE') {
      if (node.itemSpacing !== undefined) {
        gaps.set(node.itemSpacing, (gaps.get(node.itemSpacing) || 0) + 1);
      }
      [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft]
        .filter(function(x) { return x > 0; })
        .forEach(function(v) { paddings.set(v, (paddings.get(v) || 0) + 1); });
    }
    if ('children' in node && node.type !== 'INSTANCE' && depth < 6) node.children.forEach(function(c) { checkNode(c, depth + 1); });
  }
  figma.currentPage.children.forEach(function(c) { checkNode(c, 0); });
  return {
    gaps: Array.from(gaps.entries()).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10).map(function(e) { return { value: e[0], count: e[1] }; }),
    paddings: Array.from(paddings.entries()).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10).map(function(e) { return { value: e[0], count: e[1] }; })
  };
})()`;

      try {
        const result = await runFigmaCode(code, 60_000) as { gaps: Array<{ value: number; count: number }>; paddings: Array<{ value: number; count: number }> };

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log('\n\x1b[36mGap values:\x1b[0m\n');
        if (result.gaps.length === 0) {
          console.log('  No auto-layout gaps found.\n');
        } else {
          for (const g of result.gaps) console.log(`  ${g.value}px  (${g.count}x)`);
        }

        console.log('\n\x1b[36mPadding values:\x1b[0m\n');
        if (result.paddings.length === 0) {
          console.log('  No auto-layout padding found.\n');
        } else {
          for (const p of result.paddings) console.log(`  ${p.value}px  (${p.count}x)`);
        }
        console.log('');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- analyze clusters -----------------------------------------------------
  analyze
    .command('clusters')
    .description('Find repeated structural patterns (potential component candidates)')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const code = `(function() {
  const patterns = new Map();
  function getSignature(node) {
    if (node.type === 'FRAME' || node.type === 'GROUP') {
      const childTypes = ('children' in node) ? node.children.map(function(c) { return c.type; }).sort().join(',') : '';
      return node.type + ':' + childTypes;
    }
    return node.type;
  }
  function checkNode(node, depth) { depth = depth || 0;
    if (node.type === 'FRAME' || node.type === 'GROUP') {
      const sig = getSignature(node);
      if (!patterns.has(sig)) patterns.set(sig, []);
      patterns.get(sig).push({ id: node.id, name: node.name });
    }
    if ('children' in node && node.type !== 'INSTANCE' && depth < 6) node.children.forEach(function(c) { checkNode(c, depth + 1); });
  }
  figma.currentPage.children.forEach(function(c) { checkNode(c, 0); });
  return Array.from(patterns.entries())
    .filter(function(e) { return e[1].length >= 2; })
    .sort(function(a, b) { return b[1].length - a[1].length; })
    .slice(0, 10)
    .map(function(e) { return { pattern: e[0], count: e[1].length, examples: e[1].slice(0, 3) }; });
})()`;

      try {
        const result = await runFigmaCode(code, 60_000) as Array<{ pattern: string; count: number; examples: Array<{ id: string; name: string }> }>;

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log('\n\x1b[36mRepeated patterns (potential components):\x1b[0m\n');
        if (result.length === 0) {
          console.log('  No repeated patterns found.\n');
          return;
        }
        for (const p of result) {
          console.log(`  ${p.count}x  ${p.pattern}`);
          console.log(`    Examples: ${p.examples.map(e => e.name).join(', ')}`);
        }
        console.log('');
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
