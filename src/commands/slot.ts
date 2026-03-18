import type { Command } from 'commander';
import chalk from 'chalk';
import { runFigmaCode } from '../utils/figma-eval.js';
import { error } from '../utils/output.js';

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerSlotCommands(program: Command): void {
  const slot = program
    .command('slot')
    .description('Slot operations (create, list, preferred, reset, add, convert)');

  // ---- slot create ----------------------------------------------------------
  slot
    .command('create <name>')
    .description('Create a slot on selected component')
    .option('-f, --flex <direction>', 'Layout direction: row or col', 'col')
    .option('-g, --gap <value>', 'Gap between items', '0')
    .option('-p, --padding <value>', 'Padding')
    .action(async (name: string, opts: { flex: string; gap: string; padding?: string }) => {
      const flex = opts.flex === 'row' ? 'HORIZONTAL' : 'VERTICAL';
      const gap = parseInt(opts.gap, 10) || 0;
      const padding = opts.padding ? parseInt(opts.padding, 10) : 0;

      const code = `(async () => {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return JSON.stringify({ error: 'No component selected' });

  const comp = selection[0];
  if (comp.type !== 'COMPONENT' && comp.type !== 'COMPONENT_SET') {
    return JSON.stringify({ error: 'Selected node is not a component. Select a component first.' });
  }

  const slot = comp.createSlot(${JSON.stringify(name)});
  slot.layoutMode = ${JSON.stringify(flex)};
  slot.itemSpacing = ${gap};
  slot.paddingTop = ${padding};
  slot.paddingBottom = ${padding};
  slot.paddingLeft = ${padding};
  slot.paddingRight = ${padding};

  return JSON.stringify({
    success: true,
    slotId: slot.id,
    slotName: slot.name,
    componentName: comp.name
  });
})()`;

      try {
        const raw = await runFigmaCode(code);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
        if (result.error) {
          error(String(result.error));
          process.exit(1);
        } else {
          console.log(chalk.green(`✓ Created slot "${result.slotName}" in component "${result.componentName}"`));
          console.log(chalk.gray(`  ID: ${result.slotId}`));
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- slot list ------------------------------------------------------------
  slot
    .command('list [nodeId]')
    .description('List slots in a component')
    .action(async (nodeId: string | undefined) => {
      const code = `(async () => {
  const targetId = ${nodeId ? JSON.stringify(nodeId) : 'null'};
  let comp;

  if (targetId) {
    comp = await figma.getNodeByIdAsync(targetId);
  } else {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) return JSON.stringify({ error: 'No component selected' });
    comp = selection[0];
  }

  if (comp.type !== 'COMPONENT' && comp.type !== 'COMPONENT_SET') {
    return JSON.stringify({ error: 'Node is not a component' });
  }

  const propDefs = comp.componentPropertyDefinitions;
  const slots = [];

  for (const [key, def] of Object.entries(propDefs)) {
    if (def.type === 'SLOT') {
      slots.push({
        key,
        description: def.description,
        preferredCount: def.preferredValues ? def.preferredValues.length : 0
      });
    }
  }

  // Also find SLOT nodes in children
  const slotNodes = [];
  function findSlots(node) {
    if (node.type === 'SLOT') {
      slotNodes.push({ id: node.id, name: node.name });
    }
    if ('children' in node) {
      node.children.forEach(findSlots);
    }
  }
  findSlots(comp);

  return JSON.stringify({
    componentName: comp.name,
    componentId: comp.id,
    properties: slots,
    slotNodes
  });
})()`;

      try {
        const raw = await runFigmaCode(code);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
        if (result.error) {
          error(String(result.error));
          process.exit(1);
        } else {
          console.log(chalk.cyan(`\nSlots in "${result.componentName}" (${result.componentId}):`));

          const properties = result.properties as Array<{ key: string; description?: string; preferredCount: number }>;
          if (properties.length === 0) {
            console.log(chalk.gray('  No slot properties found'));
          } else {
            console.log(chalk.white('\nSlot Properties:'));
            properties.forEach(s => {
              console.log(`  ${chalk.green(s.key)}`);
              if (s.description) console.log(chalk.gray(`    Description: ${s.description}`));
              console.log(chalk.gray(`    Preferred values: ${s.preferredCount}`));
            });
          }

          const slotNodes = result.slotNodes as Array<{ id: string; name: string }>;
          if (slotNodes.length > 0) {
            console.log(chalk.white('\nSlot Nodes:'));
            slotNodes.forEach(s => {
              console.log(`  ${chalk.yellow(s.name)} (${s.id})`);
            });
          }
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- slot preferred -------------------------------------------------------
  slot
    .command('preferred <slotKey> <componentIds...>')
    .description('Set preferred components for a slot')
    .option('-n, --node <nodeId>', 'Component ID to modify (otherwise uses selection)')
    .action(async (slotKey: string, componentIds: string[], opts: { node?: string }) => {
      const code = `(async () => {
  const targetId = ${opts.node ? JSON.stringify(opts.node) : 'null'};
  let comp;

  if (targetId) {
    comp = await figma.getNodeByIdAsync(targetId);
  } else {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) return JSON.stringify({ error: 'No component selected' });
    comp = selection[0];
  }

  if (comp.type !== 'COMPONENT' && comp.type !== 'COMPONENT_SET') {
    return JSON.stringify({ error: 'Node is not a component' });
  }

  const propDefs = comp.componentPropertyDefinitions;
  const slotKey = ${JSON.stringify(slotKey)};

  // Find the slot property (might need to match partially)
  let slotPropKey = null;
  for (const key of Object.keys(propDefs)) {
    if (key === slotKey || key.startsWith(slotKey + '#')) {
      slotPropKey = key;
      break;
    }
  }

  if (!slotPropKey) {
    return JSON.stringify({ error: 'Slot property not found: ' + slotKey });
  }

  // Get component keys for preferred values
  const preferredValues = [];
  const compIds = ${JSON.stringify(componentIds)};

  for (const id of compIds) {
    const node = await figma.getNodeByIdAsync(id);
    if (node && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET')) {
      preferredValues.push({ type: 'COMPONENT', key: node.key });
    }
  }

  if (preferredValues.length === 0) {
    return JSON.stringify({ error: 'No valid components found' });
  }

  comp.editComponentProperty(slotPropKey, { preferredValues });

  return JSON.stringify({
    success: true,
    slotKey: slotPropKey,
    preferredCount: preferredValues.length
  });
})()`;

      try {
        const raw = await runFigmaCode(code);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
        if (result.error) {
          error(String(result.error));
          process.exit(1);
        } else {
          console.log(chalk.green(`✓ Set ${result.preferredCount} preferred component(s) for slot "${result.slotKey}"`));
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- slot reset -----------------------------------------------------------
  slot
    .command('reset [nodeId]')
    .description('Reset slot in instance to defaults')
    .action(async (nodeId: string | undefined) => {
      const code = `(async () => {
  const targetId = ${nodeId ? JSON.stringify(nodeId) : 'null'};
  let node;

  if (targetId) {
    node = await figma.getNodeByIdAsync(targetId);
  } else {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) return JSON.stringify({ error: 'No slot selected' });
    node = selection[0];
  }

  if (node.type !== 'SLOT') {
    // Try to find slot in instance
    if (node.type === 'INSTANCE') {
      const slots = node.children.filter(c => c.type === 'SLOT');
      if (slots.length === 0) return JSON.stringify({ error: 'No slots found in instance' });
      if (slots.length === 1) {
        node = slots[0];
      } else {
        return JSON.stringify({ error: 'Multiple slots found. Select a specific slot or provide its ID.' });
      }
    } else {
      return JSON.stringify({ error: 'Node is not a slot. Select a slot node or instance.' });
    }
  }

  const beforeCount = node.children.length;
  node.resetSlot();
  const afterCount = node.children.length;

  return JSON.stringify({
    success: true,
    slotName: node.name,
    beforeCount,
    afterCount
  });
})()`;

      try {
        const raw = await runFigmaCode(code);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
        if (result.error) {
          error(String(result.error));
          process.exit(1);
        } else {
          console.log(chalk.green(`✓ Reset slot "${result.slotName}"`));
          console.log(chalk.gray(`  Children: ${result.beforeCount} → ${result.afterCount}`));
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- slot add -------------------------------------------------------------
  slot
    .command('add <nodeId>')
    .description('Add content to a slot in an instance')
    .option('-c, --component <componentId>', 'Component to instantiate')
    .option('-f, --frame', 'Add empty frame')
    .option('-t, --text <content>', 'Add text')
    .action(async (nodeId: string, opts: { component?: string; frame?: boolean; text?: string }) => {
      if (!opts.component && !opts.frame && !opts.text) {
        error('Specify --component, --frame, or --text');
        process.exit(1);
      }

      let addCode = '';
      if (opts.component) {
        addCode = `
    const comp = await figma.getNodeByIdAsync(${JSON.stringify(opts.component)});
    if (comp && comp.type === 'COMPONENT') {
      const inst = comp.createInstance();
      slot.appendChild(inst);
      added = { type: 'instance', name: inst.name };
    } else {
      return JSON.stringify({ error: 'Component not found' });
    }`;
      } else if (opts.frame) {
        addCode = `
    const newFrame = figma.createFrame();
    newFrame.name = 'Content';
    newFrame.resize(100, 50);
    slot.appendChild(newFrame);
    added = { type: 'frame', name: newFrame.name };`;
      } else if (opts.text) {
        addCode = `
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    const newText = figma.createText();
    newText.characters = ${JSON.stringify(opts.text)};
    slot.appendChild(newText);
    added = { type: 'text', content: ${JSON.stringify(opts.text)} };`;
      }

      const code = `(async () => {
  const slot = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
  if (!slot) return JSON.stringify({ error: 'Node not found' });
  if (slot.type !== 'SLOT') return JSON.stringify({ error: 'Node is not a slot' });

  let added = null;
  ${addCode}

  return JSON.stringify({
    success: true,
    slotName: slot.name,
    added,
    childCount: slot.children.length
  });
})()`;

      try {
        const raw = await runFigmaCode(code);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
        if (result.error) {
          error(String(result.error));
          process.exit(1);
        } else {
          const added = result.added as { type: string };
          console.log(chalk.green(`✓ Added ${added.type} to slot "${result.slotName}"`));
          console.log(chalk.gray(`  Children: ${result.childCount}`));
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });

  // ---- slot convert ---------------------------------------------------------
  // CRITICAL: isSlot = true does NOT work in eval!
  // Must use component.createSlot() via the Figma Plugin API.
  slot
    .command('convert [nodeId]')
    .description('Convert a frame to a slot (must be inside a component)')
    .option('-n, --name <name>', 'Slot name', 'Slot')
    .action(async (nodeId: string | undefined, opts: { name: string }) => {
      const slotName = opts.name;

      const code = `(async () => {
  const targetId = ${nodeId ? JSON.stringify(nodeId) : 'null'};
  let frame;

  if (targetId) {
    frame = await figma.getNodeByIdAsync(targetId);
  } else {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) return JSON.stringify({ error: 'No frame selected' });
    frame = selection[0];
  }

  if (frame.type !== 'FRAME') {
    return JSON.stringify({ error: 'Node is not a frame' });
  }

  // Find parent component
  let parent = frame.parent;
  let component = null;
  while (parent) {
    if (parent.type === 'COMPONENT' || parent.type === 'COMPONENT_SET') {
      component = parent;
      break;
    }
    parent = parent.parent;
  }

  if (!component) {
    return JSON.stringify({ error: 'Frame is not inside a component' });
  }

  // Store frame properties
  const frameProps = {
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    layoutMode: frame.layoutMode,
    itemSpacing: frame.itemSpacing,
    paddingTop: frame.paddingTop,
    paddingBottom: frame.paddingBottom,
    paddingLeft: frame.paddingLeft,
    paddingRight: frame.paddingRight,
    fills: frame.fills,
    children: [...frame.children]
  };

  // Create slot via component.createSlot() — isSlot = true does NOT work in eval
  const slot = component.createSlot(${JSON.stringify(slotName)});

  // Apply frame properties to slot
  slot.layoutMode = frameProps.layoutMode;
  slot.itemSpacing = frameProps.itemSpacing;
  slot.paddingTop = frameProps.paddingTop;
  slot.paddingBottom = frameProps.paddingBottom;
  slot.paddingLeft = frameProps.paddingLeft;
  slot.paddingRight = frameProps.paddingRight;
  slot.fills = frameProps.fills;
  slot.resize(frameProps.width, frameProps.height);
  slot.x = frameProps.x;
  slot.y = frameProps.y;

  // Move children to slot
  frameProps.children.forEach(child => {
    slot.appendChild(child);
  });

  // Remove original frame
  frame.remove();

  return JSON.stringify({
    success: true,
    slotId: slot.id,
    slotName: slot.name,
    componentName: component.name
  });
})()`;

      try {
        const raw = await runFigmaCode(code);
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
        if (result.error) {
          error(String(result.error));
          process.exit(1);
        } else {
          console.log(chalk.green(`✓ Converted frame to slot "${result.slotName}" in "${result.componentName}"`));
          console.log(chalk.gray(`  Slot ID: ${result.slotId}`));
        }
      } catch (err) {
        error(String((err as Error).message));
        process.exit(1);
      }
    });
}
