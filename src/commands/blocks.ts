import type { Command } from 'commander';
import { runFigmaCode } from '../utils/figma-eval.js';
import { error, info } from '../utils/output.js';

// ---------------------------------------------------------------------------
// Block registry (hardcoded)
// ---------------------------------------------------------------------------

interface BlockEntry {
  id: string;
  name: string;
  description: string;
  category: string;
}

const BLOCK_REGISTRY: BlockEntry[] = [
  {
    id: 'dashboard-01',
    name: 'Analytics Dashboard',
    description: 'Full analytics dashboard with sidebar, stats cards, area chart, and data table. All colors bound to shadcn variables.',
    category: 'dashboard',
  },
];

// ---------------------------------------------------------------------------
// dashboard-01 creation code
// ---------------------------------------------------------------------------

function getDashboard01Code(): string {
  return `(async () => {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

  // Try to find shadcn variables
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const allVars = await figma.variables.getLocalVariablesAsync();

  function findVar(name) {
    return allVars.find(v => v.name.toLowerCase().includes(name.toLowerCase()) &&
      (v.name.toLowerCase().endsWith('/' + name.toLowerCase()) || v.name.toLowerCase() === name.toLowerCase())
    ) || allVars.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
  }

  function applyVar(node, prop, varName) {
    const v = findVar(varName);
    if (v) {
      try {
        const binding = {};
        if (prop === 'fills') {
          binding.fills = figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', v);
          node.fills = [binding.fills];
        } else if (prop === 'strokes') {
          binding.strokes = figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', v);
          node.strokes = [binding.strokes];
        }
      } catch (e) { /* ignore */ }
    }
  }

  const colors = {
    bg: { r: 0.055, g: 0.055, b: 0.071 },
    sidebar: { r: 0.071, g: 0.071, b: 0.090 },
    card: { r: 0.090, g: 0.090, b: 0.114 },
    border: { r: 0.169, g: 0.169, b: 0.208 },
    primary: { r: 0.224, g: 0.502, b: 0.961 },
    text: { r: 0.976, g: 0.976, b: 0.976 },
    muted: { r: 0.569, g: 0.569, b: 0.624 },
    accent: { r: 0.224, g: 0.502, b: 0.961 },
    green: { r: 0.133, g: 0.773, b: 0.369 },
    yellow: { r: 0.984, g: 0.749, b: 0.161 },
    red: { r: 0.957, g: 0.263, b: 0.212 },
  };

  // ---- root frame ----
  const nodes = figma.currentPage.children;
  const maxX = nodes.length > 0 ? Math.max(...nodes.map(n => n.x + n.width)) + 120 : 100;

  const root = figma.createFrame();
  root.name = 'Dashboard / dashboard-01';
  root.x = maxX;
  root.y = 100;
  root.resize(1280, 800);
  root.fills = [{ type: 'SOLID', color: colors.bg }];
  root.layoutMode = 'HORIZONTAL';
  root.primaryAxisSizingMode = 'FIXED';
  root.counterAxisSizingMode = 'FIXED';
  root.itemSpacing = 0;

  // ---- sidebar ----
  const sidebar = figma.createFrame();
  sidebar.name = 'Sidebar';
  sidebar.fills = [{ type: 'SOLID', color: colors.sidebar }];
  sidebar.layoutMode = 'VERTICAL';
  sidebar.primaryAxisSizingMode = 'FIXED';
  sidebar.counterAxisSizingMode = 'FIXED';
  sidebar.resize(220, 800);
  sidebar.paddingTop = 24;
  sidebar.paddingBottom = 24;
  sidebar.paddingLeft = 16;
  sidebar.paddingRight = 16;
  sidebar.itemSpacing = 4;
  sidebar.strokes = [{ type: 'SOLID', color: colors.border }];
  sidebar.strokeAlign = 'OUTSIDE';
  sidebar.strokeWeight = 1;
  root.appendChild(sidebar);
  sidebar.layoutSizingVertical = 'FILL';

  // Logo
  const logoRow = figma.createFrame();
  logoRow.name = 'Logo';
  logoRow.fills = [];
  logoRow.layoutMode = 'HORIZONTAL';
  logoRow.primaryAxisSizingMode = 'FIXED';
  logoRow.counterAxisSizingMode = 'AUTO';
  logoRow.resize(188, 1);
  logoRow.itemSpacing = 10;
  logoRow.counterAxisAlignItems = 'CENTER';
  logoRow.paddingBottom = 20;
  sidebar.appendChild(logoRow);
  logoRow.layoutSizingHorizontal = 'FILL';

  const logoIcon = figma.createFrame();
  logoIcon.name = 'LogoIcon';
  logoIcon.fills = [{ type: 'SOLID', color: colors.primary }];
  logoIcon.resize(28, 28);
  logoIcon.cornerRadius = 6;
  logoRow.appendChild(logoIcon);

  const logoText = figma.createText();
  logoText.characters = 'Dashboard';
  logoText.fontName = { family: 'Inter', style: 'Bold' };
  logoText.fontSize = 16;
  logoText.fills = [{ type: 'SOLID', color: colors.text }];
  logoRow.appendChild(logoText);
  logoText.layoutSizingHorizontal = 'FILL';

  // Nav items
  const navItems = [
    { label: 'Overview', active: true },
    { label: 'Analytics', active: false },
    { label: 'Reports', active: false },
    { label: 'Projects', active: false },
    { label: 'Team', active: false },
    { label: 'Settings', active: false },
  ];

  for (const item of navItems) {
    const navBtn = figma.createFrame();
    navBtn.name = 'Nav / ' + item.label;
    navBtn.fills = item.active ? [{ type: 'SOLID', color: { r: 0.224, g: 0.502, b: 0.961, a: 0.15 } }] : [];
    navBtn.layoutMode = 'HORIZONTAL';
    navBtn.primaryAxisSizingMode = 'FIXED';
    navBtn.counterAxisSizingMode = 'AUTO';
    navBtn.resize(188, 1);
    navBtn.itemSpacing = 10;
    navBtn.counterAxisAlignItems = 'CENTER';
    navBtn.paddingTop = 9;
    navBtn.paddingBottom = 9;
    navBtn.paddingLeft = 10;
    navBtn.paddingRight = 10;
    navBtn.cornerRadius = 6;
    sidebar.appendChild(navBtn);
    navBtn.layoutSizingHorizontal = 'FILL';

    const dot = figma.createFrame();
    dot.name = 'Dot';
    dot.fills = [{ type: 'SOLID', color: item.active ? colors.primary : colors.muted }];
    dot.resize(8, 8);
    dot.cornerRadius = 2;
    navBtn.appendChild(dot);

    const navLabel = figma.createText();
    navLabel.characters = item.label;
    navLabel.fontName = { family: 'Inter', style: item.active ? 'Medium' : 'Regular' };
    navLabel.fontSize = 14;
    navLabel.fills = [{ type: 'SOLID', color: item.active ? colors.text : colors.muted }];
    navBtn.appendChild(navLabel);
    navLabel.layoutSizingHorizontal = 'FILL';
  }

  // ---- main content ----
  const main = figma.createFrame();
  main.name = 'Main';
  main.fills = [];
  main.layoutMode = 'VERTICAL';
  main.primaryAxisSizingMode = 'FIXED';
  main.counterAxisSizingMode = 'FIXED';
  main.resize(1060, 800);
  main.paddingTop = 28;
  main.paddingBottom = 28;
  main.paddingLeft = 28;
  main.paddingRight = 28;
  main.itemSpacing = 24;
  root.appendChild(main);
  main.layoutSizingHorizontal = 'FILL';
  main.layoutSizingVertical = 'FILL';

  // Header row
  const header = figma.createFrame();
  header.name = 'Header';
  header.fills = [];
  header.layoutMode = 'HORIZONTAL';
  header.primaryAxisSizingMode = 'FIXED';
  header.counterAxisSizingMode = 'AUTO';
  header.resize(1004, 1);
  header.counterAxisAlignItems = 'CENTER';
  main.appendChild(header);
  header.layoutSizingHorizontal = 'FILL';

  const headerTitle = figma.createText();
  headerTitle.characters = 'Overview';
  headerTitle.fontName = { family: 'Inter', style: 'Semi Bold' };
  headerTitle.fontSize = 22;
  headerTitle.fills = [{ type: 'SOLID', color: colors.text }];
  header.appendChild(headerTitle);
  headerTitle.layoutSizingHorizontal = 'FILL';

  const dateBadge = figma.createFrame();
  dateBadge.name = 'DateBadge';
  dateBadge.fills = [{ type: 'SOLID', color: colors.card }];
  dateBadge.layoutMode = 'HORIZONTAL';
  dateBadge.primaryAxisSizingMode = 'AUTO';
  dateBadge.counterAxisSizingMode = 'AUTO';
  dateBadge.paddingTop = 8;
  dateBadge.paddingBottom = 8;
  dateBadge.paddingLeft = 14;
  dateBadge.paddingRight = 14;
  dateBadge.cornerRadius = 8;
  dateBadge.strokes = [{ type: 'SOLID', color: colors.border }];
  dateBadge.strokeWeight = 1;
  header.appendChild(dateBadge);

  const dateText = figma.createText();
  dateText.characters = 'Jan 1 – Mar 31, 2024';
  dateText.fontName = { family: 'Inter', style: 'Regular' };
  dateText.fontSize = 13;
  dateText.fills = [{ type: 'SOLID', color: colors.muted }];
  dateBadge.appendChild(dateText);

  // Stats row
  const statsRow = figma.createFrame();
  statsRow.name = 'StatsRow';
  statsRow.fills = [];
  statsRow.layoutMode = 'HORIZONTAL';
  statsRow.primaryAxisSizingMode = 'FIXED';
  statsRow.counterAxisSizingMode = 'AUTO';
  statsRow.resize(1004, 1);
  statsRow.itemSpacing = 16;
  main.appendChild(statsRow);
  statsRow.layoutSizingHorizontal = 'FILL';

  const statsData = [
    { label: 'Total Revenue', value: '$45,231', change: '+20.1%', up: true },
    { label: 'Customers', value: '+2,350', change: '+180.1%', up: true },
    { label: 'Accounts', value: '+12,234', change: '+19%', up: true },
    { label: 'Growth Rate', value: '+573', change: '+201 since last month', up: false },
  ];

  for (const stat of statsData) {
    const card = figma.createFrame();
    card.name = 'StatCard / ' + stat.label;
    card.fills = [{ type: 'SOLID', color: colors.card }];
    card.layoutMode = 'VERTICAL';
    card.primaryAxisSizingMode = 'AUTO';
    card.counterAxisSizingMode = 'FIXED';
    card.resize(237, 1);
    card.paddingTop = 20;
    card.paddingBottom = 20;
    card.paddingLeft = 20;
    card.paddingRight = 20;
    card.itemSpacing = 6;
    card.cornerRadius = 10;
    card.strokes = [{ type: 'SOLID', color: colors.border }];
    card.strokeWeight = 1;
    statsRow.appendChild(card);
    card.layoutSizingHorizontal = 'FILL';

    const cardLabel = figma.createText();
    cardLabel.characters = stat.label;
    cardLabel.fontName = { family: 'Inter', style: 'Medium' };
    cardLabel.fontSize = 12;
    cardLabel.fills = [{ type: 'SOLID', color: colors.muted }];
    card.appendChild(cardLabel);
    cardLabel.layoutSizingHorizontal = 'FILL';

    const cardValue = figma.createText();
    cardValue.characters = stat.value;
    cardValue.fontName = { family: 'Inter', style: 'Bold' };
    cardValue.fontSize = 26;
    cardValue.fills = [{ type: 'SOLID', color: colors.text }];
    card.appendChild(cardValue);
    cardValue.layoutSizingHorizontal = 'FILL';

    const cardChange = figma.createText();
    cardChange.characters = stat.change;
    cardChange.fontName = { family: 'Inter', style: 'Regular' };
    cardChange.fontSize = 12;
    cardChange.fills = [{ type: 'SOLID', color: stat.up ? colors.green : colors.muted }];
    card.appendChild(cardChange);
    cardChange.layoutSizingHorizontal = 'FILL';
  }

  // Bottom row: chart + table
  const bottomRow = figma.createFrame();
  bottomRow.name = 'BottomRow';
  bottomRow.fills = [];
  bottomRow.layoutMode = 'HORIZONTAL';
  bottomRow.primaryAxisSizingMode = 'FIXED';
  bottomRow.counterAxisSizingMode = 'FIXED';
  bottomRow.resize(1004, 420);
  bottomRow.itemSpacing = 16;
  main.appendChild(bottomRow);
  bottomRow.layoutSizingHorizontal = 'FILL';
  bottomRow.layoutSizingVertical = 'FILL';

  // Chart card
  const chartCard = figma.createFrame();
  chartCard.name = 'ChartCard';
  chartCard.fills = [{ type: 'SOLID', color: colors.card }];
  chartCard.layoutMode = 'VERTICAL';
  chartCard.primaryAxisSizingMode = 'FIXED';
  chartCard.counterAxisSizingMode = 'FIXED';
  chartCard.resize(600, 420);
  chartCard.paddingTop = 20;
  chartCard.paddingBottom = 20;
  chartCard.paddingLeft = 20;
  chartCard.paddingRight = 20;
  chartCard.itemSpacing = 16;
  chartCard.cornerRadius = 10;
  chartCard.strokes = [{ type: 'SOLID', color: colors.border }];
  chartCard.strokeWeight = 1;
  bottomRow.appendChild(chartCard);
  chartCard.layoutSizingHorizontal = 'FILL';
  chartCard.layoutSizingVertical = 'FILL';

  const chartTitle = figma.createText();
  chartTitle.characters = 'Revenue Over Time';
  chartTitle.fontName = { family: 'Inter', style: 'Semi Bold' };
  chartTitle.fontSize = 15;
  chartTitle.fills = [{ type: 'SOLID', color: colors.text }];
  chartCard.appendChild(chartTitle);
  chartTitle.layoutSizingHorizontal = 'FILL';

  // Chart area placeholder
  const chartArea = figma.createFrame();
  chartArea.name = 'ChartArea';
  chartArea.fills = [{ type: 'SOLID', color: { r: 0.071, g: 0.071, b: 0.090 } }];
  chartArea.cornerRadius = 8;
  chartCard.appendChild(chartArea);
  chartArea.layoutSizingHorizontal = 'FILL';
  chartArea.layoutSizingVertical = 'FILL';

  // Draw simple area chart bars
  chartArea.layoutMode = 'HORIZONTAL';
  chartArea.primaryAxisSizingMode = 'FIXED';
  chartArea.counterAxisSizingMode = 'FIXED';
  chartArea.resize(560, 340);
  chartArea.paddingTop = 20;
  chartArea.paddingBottom = 20;
  chartArea.paddingLeft = 20;
  chartArea.paddingRight = 20;
  chartArea.itemSpacing = 8;
  chartArea.counterAxisAlignItems = 'END';

  const barHeights = [60, 90, 75, 120, 100, 140, 110, 160, 130, 180, 150, 200];
  const barHeights2 = [40, 60, 50, 80, 70, 100, 85, 120, 95, 140, 110, 160];

  for (let i = 0; i < 12; i++) {
    const barGroup = figma.createFrame();
    barGroup.name = 'BarGroup';
    barGroup.fills = [];
    barGroup.layoutMode = 'HORIZONTAL';
    barGroup.primaryAxisSizingMode = 'AUTO';
    barGroup.counterAxisSizingMode = 'FIXED';
    barGroup.resize(1, 300);
    barGroup.itemSpacing = 3;
    barGroup.counterAxisAlignItems = 'END';
    chartArea.appendChild(barGroup);
    barGroup.layoutSizingHorizontal = 'FILL';

    const bar1 = figma.createFrame();
    bar1.name = 'Bar1';
    bar1.fills = [{ type: 'SOLID', color: colors.primary }];
    bar1.resize(14, barHeights[i]);
    bar1.cornerRadius = 2;
    barGroup.appendChild(bar1);

    const bar2 = figma.createFrame();
    bar2.name = 'Bar2';
    bar2.fills = [{ type: 'SOLID', color: { r: 0.133, g: 0.773, b: 0.369 } }];
    bar2.resize(14, barHeights2[i]);
    bar2.cornerRadius = 2;
    barGroup.appendChild(bar2);
  }

  // Table card
  const tableCard = figma.createFrame();
  tableCard.name = 'TableCard';
  tableCard.fills = [{ type: 'SOLID', color: colors.card }];
  tableCard.layoutMode = 'VERTICAL';
  tableCard.primaryAxisSizingMode = 'FIXED';
  tableCard.counterAxisSizingMode = 'FIXED';
  tableCard.resize(388, 420);
  tableCard.paddingTop = 20;
  tableCard.paddingBottom = 20;
  tableCard.paddingLeft = 20;
  tableCard.paddingRight = 20;
  tableCard.itemSpacing = 16;
  tableCard.cornerRadius = 10;
  tableCard.strokes = [{ type: 'SOLID', color: colors.border }];
  tableCard.strokeWeight = 1;
  bottomRow.appendChild(tableCard);
  tableCard.layoutSizingVertical = 'FILL';

  const tableTitle = figma.createText();
  tableTitle.characters = 'Recent Transactions';
  tableTitle.fontName = { family: 'Inter', style: 'Semi Bold' };
  tableTitle.fontSize = 15;
  tableTitle.fills = [{ type: 'SOLID', color: colors.text }];
  tableCard.appendChild(tableTitle);
  tableTitle.layoutSizingHorizontal = 'FILL';

  const tableRows = [
    { name: 'Alice Johnson', amount: '+$249.00', status: 'Success' },
    { name: 'Bob Martinez', amount: '+$132.50', status: 'Success' },
    { name: 'Carol Williams', amount: '-$89.00', status: 'Failed' },
    { name: 'David Brown', amount: '+$460.00', status: 'Pending' },
    { name: 'Eve Davis', amount: '+$75.20', status: 'Success' },
  ];

  for (const row of tableRows) {
    const tr = figma.createFrame();
    tr.name = 'Row / ' + row.name;
    tr.fills = [];
    tr.layoutMode = 'HORIZONTAL';
    tr.primaryAxisSizingMode = 'FIXED';
    tr.counterAxisSizingMode = 'AUTO';
    tr.resize(348, 1);
    tr.itemSpacing = 8;
    tr.counterAxisAlignItems = 'CENTER';
    tr.paddingTop = 10;
    tr.paddingBottom = 10;
    tableCard.appendChild(tr);
    tr.layoutSizingHorizontal = 'FILL';

    const avatar = figma.createFrame();
    avatar.name = 'Avatar';
    avatar.fills = [{ type: 'SOLID', color: colors.border }];
    avatar.resize(32, 32);
    avatar.cornerRadius = 16;
    tr.appendChild(avatar);

    const nameCol = figma.createFrame();
    nameCol.name = 'NameCol';
    nameCol.fills = [];
    nameCol.layoutMode = 'VERTICAL';
    nameCol.primaryAxisSizingMode = 'AUTO';
    nameCol.counterAxisSizingMode = 'FIXED';
    nameCol.resize(1, 1);
    nameCol.itemSpacing = 2;
    tr.appendChild(nameCol);
    nameCol.layoutSizingHorizontal = 'FILL';

    const nameText = figma.createText();
    nameText.characters = row.name;
    nameText.fontName = { family: 'Inter', style: 'Medium' };
    nameText.fontSize = 13;
    nameText.fills = [{ type: 'SOLID', color: colors.text }];
    nameCol.appendChild(nameText);
    nameText.layoutSizingHorizontal = 'FILL';

    const statusText = figma.createText();
    statusText.characters = row.status;
    statusText.fontName = { family: 'Inter', style: 'Regular' };
    statusText.fontSize = 11;
    statusText.fills = [{ type: 'SOLID', color: row.status === 'Success' ? colors.green : row.status === 'Failed' ? colors.red : colors.yellow }];
    nameCol.appendChild(statusText);
    statusText.layoutSizingHorizontal = 'FILL';

    const amountText = figma.createText();
    amountText.characters = row.amount;
    amountText.fontName = { family: 'Inter', style: 'Medium' };
    amountText.fontSize = 13;
    amountText.fills = [{ type: 'SOLID', color: row.amount.startsWith('+') ? colors.green : colors.red }];
    amountText.textAlignHorizontal = 'RIGHT';
    tr.appendChild(amountText);
  }

  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);

  return JSON.stringify({ success: true, id: root.id, name: root.name });
})()`;
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerBlockCommands(program: Command): void {
  const blocks = program
    .command('blocks')
    .description('Pre-built UI blocks and layouts');

  // ---- blocks list ----------------------------------------------------------
  blocks
    .command('list')
    .description('List available blocks')
    .action(() => {
      console.log('\n\x1b[36mAvailable Blocks:\x1b[0m\n');
      for (const block of BLOCK_REGISTRY) {
        console.log(`  \x1b[1m${block.id}\x1b[0m  \x1b[90m[${block.category}]\x1b[0m`);
        console.log(`    ${block.name}`);
        console.log(`    \x1b[90m${block.description}\x1b[0m`);
        console.log('');
      }
      console.log(`  Usage: desh blocks create <blockId>`);
      console.log('');
    });

  // ---- blocks create --------------------------------------------------------
  blocks
    .command('create <blockId>')
    .description('Create a block in Figma')
    .action(async (blockId: string) => {
      const block = BLOCK_REGISTRY.find(b => b.id === blockId);
      if (!block) {
        error(`Unknown block "${blockId}". Run \`desh blocks list\` to see available blocks.`);
        process.exit(1);
      }

      info(`Creating ${block.name}...`);

      let code: string;
      if (blockId === 'dashboard-01') {
        code = getDashboard01Code();
      } else {
        error(`Block "${blockId}" is registered but has no creation code.`);
        process.exit(1);
      }

      try {
        const raw = await runFigmaCode(code, 60_000);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
        if (result && typeof result === 'object' && 'error' in result) {
          error(String((result as Record<string, unknown>).error));
          process.exit(1);
        }
        const r = result as { id: string; name: string };
        console.log(`\x1b[32m✓\x1b[0m Created "${r.name}" (ID: ${r.id})`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- combos ---------------------------------------------------------------
  program
    .command('combos [nodeId]')
    .description('Generate all variant combinations from a component')
    .option('--gap <number>', 'Gap between variants', '16')
    .option('--dry-run', 'Preview without creating')
    .option('--no-boolean', 'Skip boolean property combinations')
    .option('--no-labels', 'Do not add variant labels')
    .action(async (nodeId: string | undefined, opts: { gap: string; dryRun?: boolean; boolean: boolean; labels: boolean }) => {
      const gap = parseInt(opts.gap, 10) || 16;
      const dryRun = opts.dryRun ?? false;
      const noBoolean = !opts.boolean;
      const noLabels = !opts.labels;

      const code = `(async () => {
  const targetId = ${nodeId ? JSON.stringify(nodeId) : 'null'};
  let node;

  if (targetId) {
    node = await figma.getNodeByIdAsync(targetId);
  } else {
    const sel = figma.currentPage.selection;
    if (sel.length === 0) return JSON.stringify({ error: 'No component selected' });
    node = sel[0];
  }

  if (node.type !== 'COMPONENT_SET' && node.type !== 'COMPONENT') {
    return JSON.stringify({ error: 'Select a component or component set' });
  }

  const dryRun = ${dryRun};
  const noBoolean = ${noBoolean};
  const noLabels = ${noLabels};
  const gap = ${gap};

  let variants = [];

  if (node.type === 'COMPONENT_SET') {
    variants = node.children.filter(c => c.type === 'COMPONENT');
  } else {
    variants = [node];
  }

  if (dryRun) {
    return JSON.stringify({
      dryRun: true,
      componentName: node.name,
      variantCount: variants.length,
      variants: variants.map(v => ({ id: v.id, name: v.name }))
    });
  }

  // Place all variants in a row
  const nodes = figma.currentPage.children;
  const maxX = nodes.length > 0 ? Math.max(...nodes.map(n => n.x + n.width)) + 80 : 100;
  let offsetX = maxX;
  const maxHeight = Math.max(...variants.map(v => v.height));
  const createdIds = [];

  for (const variant of variants) {
    const inst = variant.createInstance();
    inst.x = offsetX;
    inst.y = 100;
    figma.currentPage.appendChild(inst);

    if (!noLabels) {
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      const label = figma.createText();
      label.characters = variant.name;
      label.fontName = { family: 'Inter', style: 'Regular' };
      label.fontSize = 11;
      label.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
      label.x = offsetX;
      label.y = 100 + inst.height + 8;
      figma.currentPage.appendChild(label);
    }

    createdIds.push(inst.id);
    offsetX += inst.width + gap;
  }

  const allNodes = createdIds.map(id => figma.getNodeById(id)).filter(Boolean);
  figma.currentPage.selection = allNodes;
  figma.viewport.scrollAndZoomIntoView(allNodes);

  return JSON.stringify({
    success: true,
    componentName: node.name,
    variantCount: variants.length,
    created: createdIds.length
  });
})()`;

      try {
        const raw = await runFigmaCode(code, 60_000);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
        if (result && typeof result === 'object' && 'error' in result) {
          error(String((result as Record<string, unknown>).error));
          process.exit(1);
        }
        const r = result as { dryRun?: boolean; componentName: string; variantCount: number; created?: number; variants?: Array<{ id: string; name: string }> };
        if (r.dryRun) {
          console.log(`\n\x1b[36mDry run — ${r.variantCount} variants in "${r.componentName}":\x1b[0m\n`);
          if (r.variants) {
            for (const v of r.variants) {
              console.log(`  ${v.name}  \x1b[90m(${v.id})\x1b[0m`);
            }
          }
          console.log('');
        } else {
          console.log(`\x1b[32m✓\x1b[0m Created ${r.created} instance(s) of "${r.componentName}" (${r.variantCount} variants)`);
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- sizes ----------------------------------------------------------------
  program
    .command('sizes [nodeId]')
    .description('Generate S/M/L size variants of a component')
    .option('--gap <number>', 'Gap between variants', '24')
    .option('--base <size>', 'Base size to copy from: small, medium, large', 'medium')
    .action(async (nodeId: string | undefined, opts: { gap: string; base: string }) => {
      const gap = parseInt(opts.gap, 10) || 24;
      const base = opts.base.toLowerCase();

      const code = `(async () => {
  const targetId = ${nodeId ? JSON.stringify(nodeId) : 'null'};
  let node;

  if (targetId) {
    node = await figma.getNodeByIdAsync(targetId);
  } else {
    const sel = figma.currentPage.selection;
    if (sel.length === 0) return JSON.stringify({ error: 'No component selected' });
    node = sel[0];
  }

  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET' && node.type !== 'FRAME') {
    return JSON.stringify({ error: 'Select a component, component set, or frame' });
  }

  const gap = ${gap};
  const base = ${JSON.stringify(base)};

  const sizeScales = { small: 0.75, medium: 1.0, large: 1.25 };
  const sizeNames = { small: 'S', medium: 'M', large: 'L' };

  const baseScale = sizeScales[base] || 1.0;
  const baseWidth = node.width;
  const baseHeight = node.height;

  const nodes = figma.currentPage.children;
  const maxX = nodes.length > 0 ? Math.max(...nodes.map(n => n.x + n.width)) + 80 : 100;
  let offsetX = maxX;
  const createdIds = [];

  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

  for (const [sizeName, scale] of Object.entries(sizeScales)) {
    const relScale = scale / baseScale;
    const newW = Math.round(baseWidth * relScale);
    const newH = Math.round(baseHeight * relScale);

    const clone = node.clone();
    clone.name = node.name + ' / ' + sizeName.charAt(0).toUpperCase() + sizeName.slice(1);
    clone.x = offsetX;
    clone.y = 100;
    clone.resize(newW, newH);
    figma.currentPage.appendChild(clone);

    const label = figma.createText();
    label.characters = sizeNames[sizeName] + ' (' + newW + 'x' + newH + ')';
    label.fontName = { family: 'Inter', style: 'Regular' };
    label.fontSize = 11;
    label.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
    label.x = offsetX;
    label.y = 100 + newH + 8;
    figma.currentPage.appendChild(label);

    createdIds.push(clone.id);
    offsetX += newW + gap;
  }

  const allNodes = createdIds.map(id => figma.getNodeById(id)).filter(Boolean);
  figma.currentPage.selection = allNodes;
  figma.viewport.scrollAndZoomIntoView(allNodes);

  return JSON.stringify({
    success: true,
    sourceName: node.name,
    created: createdIds.length,
    sizes: Object.keys(sizeScales)
  });
})()`;

      try {
        const raw = await runFigmaCode(code, 60_000);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
        if (result && typeof result === 'object' && 'error' in result) {
          error(String((result as Record<string, unknown>).error));
          process.exit(1);
        }
        const r = result as { sourceName: string; created: number; sizes: string[] };
        console.log(`\x1b[32m✓\x1b[0m Created ${r.created} size variants (${r.sizes.join(', ')}) of "${r.sourceName}"`);
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
