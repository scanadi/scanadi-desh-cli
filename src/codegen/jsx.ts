/**
 * JSX -> Figma Plugin API JavaScript code generator.
 *
 * Takes JSX strings like:
 *   <Frame name="Card" w={320} bg="#18181b" rounded={12} flex="col" p={24} gap={12}>
 *     <Text size={18} weight="bold" color="#fff">Title</Text>
 *   </Frame>
 *
 * And generates a self-contained async IIFE of Figma Plugin API calls that
 * creates the corresponding node tree.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedProps {
  [key: string]: string;
}

/**
 * Parsed JSX element. All JSX attribute values are stored as strings via the
 * ParsedProps index signature. The special fields (_type, _index, _children,
 * content) are typed explicitly; everything else is accessed via `s()`.
 */
interface ParsedElement extends ParsedProps {
  _type: string;      // will be one of: frame, text, rect, image, icon, slot, instance
  _index: string;     // numeric string, stringified for storage in ParsedProps
  _tagName?: string;  // original tag name for instance elements (e.g. "Button", "Card")
}

/**
 * We store children in a separate WeakMap to avoid polluting ParsedProps
 * (which only allows string values).
 */
const childrenMap = new WeakMap<ParsedElement, ParsedElement[]>();

function setChildren(el: ParsedElement, children: ParsedElement[]): void {
  childrenMap.set(el, children);
}

function getChildren(el: ParsedElement): ParsedElement[] | undefined {
  return childrenMap.get(el);
}

/** Shorthand: read a string prop with a default. */
function s(el: ParsedElement, key: string): string | undefined {
  const v = el[key];
  return v;
}

function sd(el: ParsedElement, key: string, def: string): string {
  return el[key] ?? def;
}

function getIndex(el: ParsedElement): number {
  return Number(el._index);
}

// ---------------------------------------------------------------------------
// Hex helpers (delegated to shared module)
// ---------------------------------------------------------------------------

import {
  hexToFigmaRgbCode as hexToRgbCode,
  isVarRef,
  getVarName,
} from './shared.js';

import { loadRegistry, type ComponentRegistry } from '../registry.js';

// ---------------------------------------------------------------------------
// Fill / stroke code generation (handles var: binding)
// ---------------------------------------------------------------------------

function generateFillCode(value: string, elementVar: string, property = 'fills'): { code: string; usesVars: boolean } {
  if (isVarRef(value)) {
    const varName = getVarName(value);
    return {
      code: `${elementVar}.${property} = [boundFill(vars[${JSON.stringify(varName)}])];`,
      usesVars: true,
    };
  }
  return {
    code: `${elementVar}.${property} = [{type:'SOLID',color:${hexToRgbCode(value)}}];`,
    usesVars: false,
  };
}

function generateStrokeCode(
  value: string,
  elementVar: string,
  strokeWidth: string = '1',
  strokeAlign: string | null = null,
): { code: string; usesVars: boolean } {
  const alignCode = strokeAlign ? ` ${elementVar}.strokeAlign = '${strokeAlign.toUpperCase()}';` : '';
  if (isVarRef(value)) {
    const varName = getVarName(value);
    return {
      code: `${elementVar}.strokes = [boundFill(vars[${JSON.stringify(varName)}])]; ${elementVar}.strokeWeight = ${strokeWidth};${alignCode}`,
      usesVars: true,
    };
  }
  return {
    code: `${elementVar}.strokes = [{type:'SOLID',color:${hexToRgbCode(value)}}]; ${elementVar}.strokeWeight = ${strokeWidth};${alignCode}`,
    usesVars: false,
  };
}

// ---------------------------------------------------------------------------
// Prop parser
// ---------------------------------------------------------------------------

export function parseProps(propsStr: string): ParsedProps {
  const props: ParsedProps = {};
  const regex = /(\w+)=(?:"([^"]*)"|{([^}]*)}|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(propsStr)) !== null) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    props[key] = value;
  }
  return props;
}

// ---------------------------------------------------------------------------
// Content extraction (matching open/close tags)
// ---------------------------------------------------------------------------

export function extractContent(input: string, tagName: string): string {
  let depth = 1;
  let i = 0;
  const closeTag = `</${tagName}>`;

  while (i < input.length && depth > 0) {
    const remaining = input.slice(i);

    if (remaining.startsWith(closeTag)) {
      depth--;
      if (depth === 0) {
        return input.slice(0, i);
      }
      i += closeTag.length;
    } else if (remaining.startsWith(`<${tagName} `) || remaining.startsWith(`<${tagName}>`)) {
      const selfCloseCheck = remaining.match(new RegExp(`^<${tagName}(?:\\s[^>]*?)?\\s*\\/>`));
      if (selfCloseCheck) {
        i += selfCloseCheck[0].length;
      } else {
        depth++;
        i++;
      }
    } else {
      i++;
    }
  }

  return input;
}

// ---------------------------------------------------------------------------
// Children parser
// ---------------------------------------------------------------------------

export function parseChildren(childrenStr: string, registryNames?: Set<string>): ParsedElement[] {
  const children: ParsedElement[] = [];
  const consumedRanges: Array<{ start: number; end: number }> = [];

  function isInsideConsumed(idx: number): boolean {
    return consumedRanges.some(r => idx >= r.start && idx < r.end);
  }

  let match: RegExpExecArray | null;

  // 0. Registry component elements (open/close and self-closing)
  // Must run before Frame/Text/etc so registry components take priority
  if (registryNames && registryNames.size > 0) {
    // Build alternation pattern from registry names
    const namesPattern = Array.from(registryNames).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

    // 0a. Open/close registry component elements with text content
    // e.g. <Button variant="destructive">Delete</Button>
    const regOpenRegex = new RegExp(`<(${namesPattern})(?:\\s+([^>]*?))?>([\\s\\S]*?)<\\/\\1>`, 'g');
    while ((match = regOpenRegex.exec(childrenStr)) !== null) {
      if (isInsideConsumed(match.index)) continue;
      const tagName = match[1];
      const instEl = parseProps(match[2] || '') as ParsedElement;
      instEl._type = 'instance';
      instEl._tagName = tagName;
      instEl._index = String(match.index);
      instEl.content = match[3].trim();
      children.push(instEl);
      consumedRanges.push({ start: match.index, end: match.index + match[0].length });
    }

    // 0b. Self-closing registry component elements
    // e.g. <Button variant="destructive" />
    const regSelfCloseRegex = new RegExp(`<(${namesPattern})(?:\\s+([^>]*?))?\\s*\\/>`, 'g');
    while ((match = regSelfCloseRegex.exec(childrenStr)) !== null) {
      if (isInsideConsumed(match.index)) continue;
      const tagName = match[1];
      const instEl = parseProps(match[2] || '') as ParsedElement;
      instEl._type = 'instance';
      instEl._tagName = tagName;
      instEl._index = String(match.index);
      children.push(instEl);
      consumedRanges.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  // 1. Open/close Frame elements
  const frameOpenRegex = /<Frame(?:\s+([^>]*?))?>/g;
  while ((match = frameOpenRegex.exec(childrenStr)) !== null) {
    if (match[0].endsWith('/>')) continue;
    if (isInsideConsumed(match.index)) continue;
    const frameEl = parseProps(match[1] || '') as ParsedElement;
    frameEl._type = 'frame';
    frameEl._index = String(match.index);

    const afterOpen = childrenStr.slice(match.index + match[0].length);
    const innerContent = extractContent(afterOpen, 'Frame');
    const fullLength = match[0].length + innerContent.length + '</Frame>'.length;

    setChildren(frameEl, parseChildren(innerContent, registryNames));
    children.push(frameEl);
    consumedRanges.push({ start: match.index, end: match.index + fullLength });
    frameOpenRegex.lastIndex = match.index + fullLength;
  }

  // 2. Self-closing Frame elements
  const frameSelfCloseRegex = /<Frame(?:\s+([^>]*?))?\s*\/>/g;
  while ((match = frameSelfCloseRegex.exec(childrenStr)) !== null) {
    if (isInsideConsumed(match.index)) continue;
    const frameEl = parseProps(match[1] || '') as ParsedElement;
    frameEl._type = 'frame';
    frameEl._index = String(match.index);
    setChildren(frameEl, []);
    children.push(frameEl);
    consumedRanges.push({ start: match.index, end: match.index + match[0].length });
  }

  // 3. Open/close Slot elements
  const slotOpenRegex = /<Slot(?:\s+([^>]*?))?>/g;
  while ((match = slotOpenRegex.exec(childrenStr)) !== null) {
    if (isInsideConsumed(match.index)) continue;
    const slotEl = parseProps(match[1] || '') as ParsedElement;
    slotEl._type = 'slot';
    slotEl._index = String(match.index);

    const afterOpen = childrenStr.slice(match.index + match[0].length);
    const innerContent = extractContent(afterOpen, 'Slot');
    const fullLength = match[0].length + innerContent.length + '</Slot>'.length;

    setChildren(slotEl, parseChildren(innerContent, registryNames));
    children.push(slotEl);
    consumedRanges.push({ start: match.index, end: match.index + fullLength });
    slotOpenRegex.lastIndex = match.index + fullLength;
  }

  // 4. Self-closing Slot elements
  const slotSelfCloseRegex = /<Slot(?:\s+([^/]*?))?\s*\/>/g;
  while ((match = slotSelfCloseRegex.exec(childrenStr)) !== null) {
    if (isInsideConsumed(match.index)) continue;
    const slotEl = parseProps(match[1] || '') as ParsedElement;
    slotEl._type = 'slot';
    slotEl._index = String(match.index);
    setChildren(slotEl, []);
    children.push(slotEl);
    consumedRanges.push({ start: match.index, end: match.index + match[0].length });
  }

  // 5. Text elements
  const textRegex = /<Text(?:\s+([^>]*?))?>([^<]*)<\/Text>/g;
  while ((match = textRegex.exec(childrenStr)) !== null) {
    if (isInsideConsumed(match.index)) continue;
    const textEl = parseProps(match[1] || '') as ParsedElement;
    textEl._type = 'text';
    textEl.content = match[2];
    textEl._index = String(match.index);
    children.push(textEl);
  }

  // 6. Rectangle / Rect (self-closing)
  const rectRegex = /<(?:Rectangle|Rect)(?:\s+([^/]*?))?\s*\/>/g;
  while ((match = rectRegex.exec(childrenStr)) !== null) {
    if (isInsideConsumed(match.index)) continue;
    const rectEl = parseProps(match[1] || '') as ParsedElement;
    rectEl._type = 'rect';
    rectEl._index = String(match.index);
    children.push(rectEl);
  }

  // 7. Image (self-closing)
  const imageRegex = /<Image(?:\s+([^/]*?))?\s*\/>/g;
  while ((match = imageRegex.exec(childrenStr)) !== null) {
    if (isInsideConsumed(match.index)) continue;
    const imgEl = parseProps(match[1] || '') as ParsedElement;
    imgEl._type = 'image';
    imgEl._index = String(match.index);
    children.push(imgEl);
  }

  // 8. Icon (self-closing)
  const iconRegex = /<Icon(?:\s+([^/]*?))?\s*\/>/g;
  while ((match = iconRegex.exec(childrenStr)) !== null) {
    if (isInsideConsumed(match.index)) continue;
    const iconEl = parseProps(match[1] || '') as ParsedElement;
    iconEl._type = 'icon';
    iconEl._index = String(match.index);
    children.push(iconEl);
  }

  children.sort((a, b) => getIndex(a) - getIndex(b));
  return children;
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

function generateCode(props: ParsedProps, children: ParsedElement[], registry?: ComponentRegistry): string {
  const name = props.name || 'Frame';
  const rawWidth = props.w ?? props.width;
  const rawHeight = props.h ?? props.height;
  const hasExplicitWidth = props.w !== undefined || props.width !== undefined;
  const hasExplicitHeight = props.h !== undefined || props.height !== undefined;
  const fillWidth = rawWidth === 'fill';
  const fillHeight = rawHeight === 'fill';
  const width = fillWidth ? 100 : (rawWidth || 320);
  const height = fillHeight ? 100 : (rawHeight || 200);
  const bg = props.bg ?? props.fill ?? '#ffffff';
  const stroke = props.stroke ?? null;
  const strokeWidth = props.strokeWidth ?? '1';
  const strokeAlignProp = props.strokeAlign ?? null;
  const rounded = props.rounded ?? props.radius ?? '0';
  const flex = props.flex ?? 'col';
  const gap = props.gap ?? '0';
  const p = props.p ?? props.padding;
  const px = props.px ?? p ?? '0';
  const py = props.py ?? p ?? '0';
  const pt = props.pt ?? py;
  const pr = props.pr ?? px;
  const pb = props.pb ?? py;
  const pl = props.pl ?? px;
  const align = props.items ?? props.align ?? 'start';
  const justify = props.justify ?? 'start';
  const useSmartPos = props.x === undefined;
  const explicitX = props.x ?? '0';
  const y = props.y ?? '0';
  const clip = props.clip === 'true' || props.overflow === 'hidden';
  const wrap = props.wrap === 'true';
  const wrapGap = Number(props.wrapGap ?? props.counterAxisSpacing ?? 0);
  const opacity = props.opacity;
  const rotate = props.rotate;
  const shadow = props.shadow;
  const blurVal = props.blur;
  const cornerSmoothing = props.cornerSmoothing;
  const roundedTL = props.roundedTL;
  const roundedTR = props.roundedTR;
  const roundedBL = props.roundedBL;
  const roundedBR = props.roundedBR;
  const hugWidth = props.hug === 'both' || props.hug === 'w' || props.hug === 'width';
  const hugHeight = props.hug === 'both' || props.hug === 'h' || props.hug === 'height';
  const minW = props.minW;
  const maxW = props.maxW;
  const minH = props.minH;
  const maxH = props.maxH;

  // Track variable usage
  let usesVars = false;
  const checkVar = (value: string | undefined | null) => {
    if (value && isVarRef(value)) usesVars = true;
  };

  checkVar(bg);
  checkVar(stroke);

  // Collect fonts + check var usage recursively
  const fonts = new Set<string>();
  const collectFontsAndVars = (items: ParsedElement[]) => {
    for (const item of items) {
      if (item._type === 'text') {
        fonts.add(fontStyle(sd(item, 'weight', 'regular')));
        checkVar(s(item, 'color'));
      } else if (item._type === 'frame' || item._type === 'slot') {
        checkVar(s(item, 'bg') ?? s(item, 'fill'));
        checkVar(s(item, 'stroke'));
        const ch = getChildren(item);
        if (ch) collectFontsAndVars(ch);
      } else {
        checkVar(s(item, 'bg') ?? s(item, 'fill') ?? s(item, 'color') ?? s(item, 'c'));
      }
    }
  };
  collectFontsAndVars(children);

  const fontStylesList = Array.from(fonts);

  // ------ Child code generator ------
  let childCounter = 0;

  const genChild = (items: ParsedElement[], parentVar: string, parentFlex: string): string => {
    return items.map(item => {
      const idx = childCounter++;
      switch (item._type) {
        case 'text': return genText(item, idx, parentVar);
        case 'frame': return genFrame(item, idx, parentVar, parentFlex);
        case 'rect': return genRect(item, idx, parentVar);
        case 'image': return genImage(item, idx, parentVar);
        case 'icon': return genIcon(item, idx, parentVar);
        case 'slot': return genSlot(item, idx, parentVar);
        case 'instance': return genInstance(item, idx, parentVar, parentFlex);
        default: return '';
      }
    }).join('\n');
  };

  function genText(el: ParsedElement, idx: number, parentVar: string): string {
    const weight = sd(el, 'weight', 'regular');
    const style = fontStyle(weight);
    const size = sd(el, 'size', '14');
    const color = sd(el, 'color', '#000000');
    const textFill = generateFillCode(color, `el${idx}`);
    const isFill = el.w === 'fill';
    const textAlign = s(el, 'align');
    const fontFamily = sd(el, 'font', 'Inter');
    const content = el.content ?? '';

    return `
        __currentNode = 'Text: ${content.substring(0, 30).replace(/'/g, "\\'")}';
        const el${idx} = figma.createText();
        el${idx}.fontName = {family:${JSON.stringify(fontFamily)},style:'${style}'};
        el${idx}.fontSize = ${size};
        el${idx}.characters = ${JSON.stringify(content)};
        ${textFill.code}
        ${parentVar}.appendChild(el${idx});
        ${isFill ? `el${idx}.layoutSizingHorizontal = 'FILL'; el${idx}.textAutoResize = 'HEIGHT';` : ''}
        ${textAlign ? `el${idx}.textAlignHorizontal = '${textAlign.toUpperCase()}';` : ''}`;
  }

  function genFrame(el: ParsedElement, idx: number, parentVar: string, parentFlex: string): string {
    const fName = sd(el, 'name', 'Nested Frame');
    const fBg = s(el, 'bg') ?? s(el, 'fill') ?? null;
    const fStroke = s(el, 'stroke') ?? null;
    const fStrokeWidth = sd(el, 'strokeWidth', '1');
    const fStrokeAlign = s(el, 'strokeAlign') ?? null;
    const fRounded = s(el, 'rounded') ?? sd(el, 'radius', '0');
    const fFlex = sd(el, 'flex', 'row');
    const fGap = sd(el, 'gap', '0');
    const fP = s(el, 'p') ?? s(el, 'padding');
    const fPx = s(el, 'px') ?? fP ?? '0';
    const fPy = s(el, 'py') ?? fP ?? '0';
    const fPt = s(el, 'pt') !== undefined ? Number(s(el, 'pt')) : Number(fPy);
    const fPr = s(el, 'pr') !== undefined ? Number(s(el, 'pr')) : Number(fPx);
    const fPb = s(el, 'pb') !== undefined ? Number(s(el, 'pb')) : Number(fPy);
    const fPl = s(el, 'pl') !== undefined ? Number(s(el, 'pl')) : Number(fPx);
    const fAlign = s(el, 'items') ?? sd(el, 'align', 'center');
    const fJustify = sd(el, 'justify', 'center');
    const fClip = el.clip === 'true' || el.overflow === 'hidden';
    const fWrap = el.wrap === 'true';
    const fWrapGap = Number(s(el, 'wrapGap') ?? s(el, 'counterAxisSpacing') ?? '0');
    const fGrow = s(el, 'grow') !== undefined ? Number(s(el, 'grow')) : null;
    const fPosition = sd(el, 'position', 'auto');
    const fAbsoluteX = s(el, 'x') !== undefined ? Number(s(el, 'x')) : 0;
    const fAbsoluteY = s(el, 'y') !== undefined ? Number(s(el, 'y')) : 0;

    const isFillW = el.w === 'fill';
    const isFillH = el.h === 'fill';
    const hasWidth = (s(el, 'w') !== undefined || s(el, 'width') !== undefined) && !isFillW;
    const hasHeight = (s(el, 'h') !== undefined || s(el, 'height') !== undefined) && !isFillH;
    const fWidth = isFillW ? 100 : (s(el, 'w') ?? sd(el, 'width', '100'));
    const fHeight = isFillH ? 100 : (s(el, 'h') ?? sd(el, 'height', '40'));

    const aMap: Record<string, string> = { start: 'MIN', center: 'CENTER', end: 'MAX', stretch: 'STRETCH' };
    const fAlignVal = aMap[fAlign] || 'CENTER';
    const fJustifyVal = aMap[fJustify] || 'CENTER';

    const ch = getChildren(el);
    const nestedCode = ch ? genChild(ch, `el${idx}`, fFlex) : '';
    const frameFillCode = fBg ? generateFillCode(fBg, `el${idx}`) : { code: `el${idx}.fills = [];` };
    const frameStrokeCode = fStroke ? generateStrokeCode(fStroke, `el${idx}`, fStrokeWidth, fStrokeAlign) : { code: '' };

    const wantFillH = isFillW || (fGrow !== null && parentFlex === 'row');
    const wantFillV = isFillH || (fGrow !== null && parentFlex === 'col');
    const hSizing = wantFillH ? 'FILL' : (hasWidth ? 'FIXED' : 'HUG');
    const vSizing = wantFillV ? 'FILL' : (hasHeight ? 'FIXED' : 'HUG');

    const fRoundedTL = s(el, 'roundedTL');
    const fRoundedTR = s(el, 'roundedTR');
    const fRoundedBL = s(el, 'roundedBL');
    const fRoundedBR = s(el, 'roundedBR');
    const hasIndividualCorners = fRoundedTL || fRoundedTR || fRoundedBL || fRoundedBR;

    const fOpacity = s(el, 'opacity');
    const fShadow = s(el, 'shadow');
    const fBlur = s(el, 'blur');
    const fRotate = s(el, 'rotate');
    const fStretch = el.stretch === 'true';
    const fCornerSmoothing = s(el, 'cornerSmoothing');

    return `
        __currentNode = 'Frame: ${fName.replace(/'/g, "\\'")}';
        const el${idx} = figma.createFrame();
        el${idx}.name = ${JSON.stringify(fName)};
        el${idx}.layoutMode = '${fFlex === 'row' ? 'HORIZONTAL' : 'VERTICAL'}';
        ${fWrap && fFlex === 'row' ? `el${idx}.layoutWrap = 'WRAP';` : ''}
        ${hasWidth || hasHeight ? `el${idx}.resize(${hasWidth ? fWidth : 100}, ${hasHeight ? fHeight : 100});` : ''}
        el${idx}.itemSpacing = ${fGap};
        el${idx}.paddingTop = ${fPt};
        el${idx}.paddingBottom = ${fPb};
        el${idx}.paddingLeft = ${fPl};
        el${idx}.paddingRight = ${fPr};
        ${hasIndividualCorners
          ? `el${idx}.topLeftRadius = ${fRoundedTL ?? fRounded}; el${idx}.topRightRadius = ${fRoundedTR ?? fRounded}; el${idx}.bottomLeftRadius = ${fRoundedBL ?? fRounded}; el${idx}.bottomRightRadius = ${fRoundedBR ?? fRounded};`
          : `el${idx}.cornerRadius = ${fRounded};`}
        ${frameFillCode.code}
        ${frameStrokeCode.code}
        el${idx}.primaryAxisAlignItems = '${fJustifyVal}';
        el${idx}.counterAxisAlignItems = '${fAlignVal}';
        el${idx}.clipsContent = ${fClip};
        ${parentVar}.appendChild(el${idx});
        el${idx}.layoutSizingHorizontal = '${hSizing}';
        el${idx}.layoutSizingVertical = '${vSizing}';
        ${fStretch ? `el${idx}.layoutAlign = 'STRETCH';` : ''}
        ${fGrow !== null ? `el${idx}.layoutGrow = ${fGrow};` : ''}
        ${fOpacity ? `el${idx}.opacity = ${fOpacity};` : ''}
        ${fRotate ? `el${idx}.rotation = ${fRotate};` : ''}
        ${fCornerSmoothing ? `el${idx}.cornerSmoothing = ${fCornerSmoothing};` : ''}
        ${fShadow ? `el${idx}.effects = [${parseShadow(fShadow)}];` : ''}
        ${fBlur ? `el${idx}.effects = [{type:'LAYER_BLUR',radius:${fBlur},visible:true}];` : ''}
        ${nestedCode}
        ${fWrap && fFlex === 'row' && fWrapGap > 0 ? `el${idx}.counterAxisSpacing = ${fWrapGap};` : ''}
        ${fPosition === 'absolute' ? `el${idx}.layoutPositioning = 'ABSOLUTE'; el${idx}.x = ${fAbsoluteX}; el${idx}.y = ${fAbsoluteY};` : ''}`;
  }

  function genRect(el: ParsedElement, idx: number, parentVar: string): string {
    const rWidth = s(el, 'w') ?? sd(el, 'width', '100');
    const rHeight = s(el, 'h') ?? sd(el, 'height', '100');
    const rBg = s(el, 'bg') ?? sd(el, 'fill', '#e4e4e7');
    const rRounded = s(el, 'rounded') ?? sd(el, 'radius', '0');
    const rName = sd(el, 'name', 'Rectangle');
    const rectFill = generateFillCode(rBg, `el${idx}`);
    return `
        const el${idx} = figma.createRectangle();
        el${idx}.name = ${JSON.stringify(rName)};
        el${idx}.resize(${rWidth}, ${rHeight});
        el${idx}.cornerRadius = ${rRounded};
        ${rectFill.code}
        ${parentVar}.appendChild(el${idx});`;
  }

  function genImage(el: ParsedElement, idx: number, parentVar: string): string {
    const iWidth = s(el, 'w') ?? sd(el, 'width', '200');
    const iHeight = s(el, 'h') ?? sd(el, 'height', '150');
    const iBg = sd(el, 'bg', '#f4f4f5');
    const iRounded = s(el, 'rounded') ?? sd(el, 'radius', '8');
    const iName = sd(el, 'name', 'Image');
    const imgFill = generateFillCode(iBg, `el${idx}`);
    return `
        const el${idx} = figma.createRectangle();
        el${idx}.name = ${JSON.stringify(iName)};
        el${idx}.resize(${iWidth}, ${iHeight});
        el${idx}.cornerRadius = ${iRounded};
        ${imgFill.code}
        ${parentVar}.appendChild(el${idx});`;
  }

  function genIcon(el: ParsedElement, idx: number, parentVar: string): string {
    // TODO: full Iconify SVG fetch. For now, placeholder rectangle.
    const icSize = s(el, 'size') ?? sd(el, 's', '24');
    const icBg = s(el, 'color') ?? sd(el, 'c', '#71717a');
    const icName = sd(el, 'name', 'Icon');
    const iconFill = generateFillCode(icBg, `el${idx}`);
    return `
        const el${idx} = figma.createRectangle();
        el${idx}.name = ${JSON.stringify(icName)};
        el${idx}.resize(${icSize}, ${icSize});
        el${idx}.cornerRadius = ${Math.round(Number(icSize) / 4)};
        ${iconFill.code}
        ${parentVar}.appendChild(el${idx});`;
  }

  function genSlot(el: ParsedElement, idx: number, parentVar: string): string {
    const slotName = sd(el, 'name', 'Slot');
    const slotFlex = sd(el, 'flex', 'col');
    const slotGap = sd(el, 'gap', '0');
    const slotP = s(el, 'p') ?? s(el, 'padding');
    const slotPx = s(el, 'px') ?? slotP ?? '0';
    const slotPy = s(el, 'py') ?? slotP ?? '0';
    const slotBg = s(el, 'bg') ?? s(el, 'fill') ?? null;
    const slotWidth = s(el, 'w') ?? s(el, 'width');
    const slotHeight = s(el, 'h') ?? s(el, 'height');
    const isFillW = el.w === 'fill';
    const isFillH = el.h === 'fill';

    const ch = getChildren(el);
    const nestedCode = ch ? genChild(ch, `slot${idx}`, slotFlex) : '';
    const slotFillCode = slotBg ? generateFillCode(slotBg, `slot${idx}`) : { code: '' };

    return `
        // Create slot (only works if parent is a component)
        let slot${idx} = null;
        if (${parentVar}.type === 'COMPONENT' || ${parentVar}.type === 'COMPONENT_SET') {
          slot${idx} = ${parentVar}.createSlot(${JSON.stringify(slotName)});
        } else {
          slot${idx} = figma.createFrame();
          slot${idx}.name = ${JSON.stringify(slotName)};
          ${parentVar}.appendChild(slot${idx});
        }
        slot${idx}.layoutMode = '${slotFlex === 'row' ? 'HORIZONTAL' : 'VERTICAL'}';
        slot${idx}.itemSpacing = ${slotGap};
        slot${idx}.paddingTop = ${slotPy};
        slot${idx}.paddingBottom = ${slotPy};
        slot${idx}.paddingLeft = ${slotPx};
        slot${idx}.paddingRight = ${slotPx};
        ${slotWidth && !isFillW ? `slot${idx}.resize(${slotWidth}, ${slotHeight ?? 100});` : ''}
        ${isFillW ? `slot${idx}.layoutSizingHorizontal = 'FILL';` : ''}
        ${isFillH ? `slot${idx}.layoutSizingVertical = 'FILL';` : ''}
        ${slotFillCode.code}
        ${nestedCode}`;
  }

  function genInstance(el: ParsedElement, idx: number, parentVar: string, parentFlex: string): string {
    const tagName = el._tagName ?? 'Unknown';
    const textContent = el.content ?? '';
    const isFillW = el.w === 'fill';
    const isFillH = el.h === 'fill';

    // Collect JSX props that might map to variant properties
    // Exclude internal/layout props — pass through component-relevant ones
    const skipProps = new Set([
      '_type', '_index', '_tagName', 'content',
      'w', 'width', 'h', 'height', 'grow', 'stretch', 'position', 'x', 'y',
    ]);
    const variantProps: Record<string, string> = {};
    for (const [key, val] of Object.entries(el)) {
      if (!key.startsWith('_') && !skipProps.has(key) && typeof val === 'string') {
        variantProps[key] = val;
      }
    }

    return `
        __currentNode = 'Instance: ${tagName.replace(/'/g, "\\'")}';
        let el${idx} = await __tryCreateInstance(${JSON.stringify(tagName)}, ${JSON.stringify(variantProps)}, ${JSON.stringify(textContent)});
        if (el${idx}) {
          ${parentVar}.appendChild(el${idx});
          ${isFillW ? `el${idx}.layoutSizingHorizontal = 'FILL';` : ''}
          ${isFillH ? `el${idx}.layoutSizingVertical = 'FILL';` : ''}
        } else {
          // Fallback: create a placeholder frame when registry entry is stale
          el${idx} = figma.createFrame();
          el${idx}.name = ${JSON.stringify(tagName)};
          el${idx}.resize(200, 40);
          el${idx}.fills = [{type:'SOLID',color:{r:0.95,g:0.95,b:0.95}}];
          ${parentVar}.appendChild(el${idx});
          ${isFillW ? `el${idx}.layoutSizingHorizontal = 'FILL';` : ''}
          ${isFillH ? `el${idx}.layoutSizingVertical = 'FILL';` : ''}
        }`;
  }

  // ------ Generate code for all children ------
  const childCode = genChild(children, 'frame', flex);

  // Map align/justify to Figma values for root frame
  const alignMap: Record<string, string> = { start: 'MIN', center: 'CENTER', end: 'MAX', stretch: 'STRETCH', between: 'SPACE_BETWEEN' };
  const alignVal = alignMap[align] || 'MIN';
  const justifyVal = alignMap[justify] || 'MIN';

  // Smart positioning code
  const smartPosCode = useSmartPos ? `
        let smartX = 0;
        const pageChildren = figma.currentPage.children;
        if (pageChildren.length > 0) {
          let maxRight = 0;
          pageChildren.forEach(n => {
            const right = n.x + (n.width || 0);
            if (right > maxRight) maxRight = right;
          });
          smartX = Math.round(maxRight + 100);
        }
    ` : `const smartX = ${explicitX};`;

  // Root fill/stroke
  const rootFillCode = generateFillCode(bg, 'frame');
  const rootStrokeCode = stroke ? generateStrokeCode(stroke, 'frame', strokeWidth, strokeAlignProp) : { code: '' };

  // Variable loading code (only if vars are used)
  const varLoadCode = usesVars ? `
        // Load all variables (cached for 30s)
        if (!globalThis.__varsCache || Date.now() - (globalThis.__varsCacheTime || 0) > 30000) {
          const collections = await figma.variables.getLocalVariableCollectionsAsync();
          globalThis.__varsCache = {};
          for (const col of collections) {
            for (const id of col.variableIds) {
              const v = await figma.variables.getVariableByIdAsync(id);
              if (v) globalThis.__varsCache[v.name] = v;
            }
          }
          globalThis.__varsCacheTime = Date.now();
        }
        const vars = globalThis.__varsCache;
        const boundFill = (variable) => figma.variables.setBoundVariableForPaint(
          { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }, 'color', variable
        );
    ` : '';

  // Font loading with caching
  const fontLoadCode = fontStylesList.length > 0
    ? `
        if (!globalThis.__loadedFonts) globalThis.__loadedFonts = new Set();
        const fontsToLoad = ${JSON.stringify(fontStylesList)}.filter(s => !globalThis.__loadedFonts.has(s));
        if (fontsToLoad.length > 0) {
          await Promise.all(fontsToLoad.map(s => figma.loadFontAsync({family:'Inter',style:s})));
          fontsToLoad.forEach(s => globalThis.__loadedFonts.add(s));
        }
      `
    : `
        if (!globalThis.__loadedFonts) globalThis.__loadedFonts = new Set();
        if (!globalThis.__loadedFonts.has('Regular')) {
          await figma.loadFontAsync({family:'Inter',style:'Regular'});
          globalThis.__loadedFonts.add('Regular');
        }
      `;

  // Registry instance helper (only if registry has entries and instance elements exist)
  const hasInstanceElements = (function checkInstances(items: ParsedElement[]): boolean {
    for (const item of items) {
      if (item._type === 'instance') return true;
      const ch = getChildren(item);
      if (ch && checkInstances(ch)) return true;
    }
    return false;
  })(children);

  const registryCode = (hasInstanceElements && registry && Object.keys(registry.components).length > 0) ? `
        const __registry = ${JSON.stringify(registry.components)};
        async function __tryCreateInstance(tagName, props, textContent) {
          const entry = __registry[tagName];
          if (!entry) return null;
          try {
            const node = await figma.getNodeByIdAsync(entry.nodeId);
            if (!node) return null;
            let instance;
            if (node.type === 'COMPONENT_SET') {
              instance = node.defaultVariant.createInstance();
              // Map JSX props to variant properties via registry property map
              if (entry.properties && props) {
                const toSet = {};
                for (const [cleanName, figmaKey] of Object.entries(entry.properties)) {
                  if (props[cleanName] !== undefined) toSet[figmaKey] = props[cleanName];
                }
                if (Object.keys(toSet).length > 0) instance.setProperties(toSet);
              }
            } else if (node.type === 'COMPONENT') {
              instance = node.createInstance();
            }
            if (!instance) return null;
            // Set text content if provided
            if (textContent) {
              const tn = instance.findOne(n => n.type === 'TEXT');
              if (tn) {
                await figma.loadFontAsync(tn.fontName);
                tn.characters = textContent;
              }
            }
            return instance;
          } catch(e) {
            return null; // stale registry entry, fall back to placeholder
          }
        }
    ` : `
        async function __tryCreateInstance() { return null; }
    `;

  // Primary/counter axis sizing for root frame
  const primarySizing = flex === 'col'
    ? (hugHeight || fillHeight || !hasExplicitHeight ? 'AUTO' : 'FIXED')
    : (hugWidth || fillWidth || !hasExplicitWidth ? 'AUTO' : 'FIXED');
  const counterSizing = flex === 'col'
    ? (hugWidth || fillWidth || !hasExplicitWidth ? 'AUTO' : 'FIXED')
    : (hugHeight || fillHeight || !hasExplicitHeight ? 'AUTO' : 'FIXED');

  // Individual corner radii for root
  const hasIndividualCorners = roundedTL || roundedTR || roundedBL || roundedBR;

  return `
      (async function() {
        ${fontLoadCode}
        ${varLoadCode}
        ${registryCode}
        ${smartPosCode}

        let __currentNode = 'root';
        try {
        const frame = figma.createFrame();
        __currentNode = ${JSON.stringify(name)};
        frame.name = ${JSON.stringify(name)};
        frame.resize(${width}, ${height});
        frame.x = smartX;
        frame.y = ${y};
        ${hasIndividualCorners
          ? `frame.topLeftRadius = ${roundedTL ?? rounded}; frame.topRightRadius = ${roundedTR ?? rounded}; frame.bottomLeftRadius = ${roundedBL ?? rounded}; frame.bottomRightRadius = ${roundedBR ?? rounded};`
          : `frame.cornerRadius = ${rounded};`}
        ${rootFillCode.code}
        ${rootStrokeCode.code}
        frame.layoutMode = '${flex === 'row' ? 'HORIZONTAL' : 'VERTICAL'}';
        ${wrap && flex === 'row' ? `frame.layoutWrap = 'WRAP';` : ''}
        frame.itemSpacing = ${gap};
        frame.paddingTop = ${pt};
        frame.paddingBottom = ${pb};
        frame.paddingLeft = ${pl};
        frame.paddingRight = ${pr};
        frame.primaryAxisAlignItems = '${justifyVal}';
        frame.counterAxisAlignItems = '${alignVal}';
        frame.primaryAxisSizingMode = '${primarySizing}';
        frame.counterAxisSizingMode = '${counterSizing}';
        ${fillWidth ? `frame.layoutSizingHorizontal = 'FILL';` : ''}
        ${fillHeight ? `frame.layoutSizingVertical = 'FILL';` : ''}
        ${wrap && flex === 'row' && wrapGap > 0 ? `frame.counterAxisSpacing = ${wrapGap};` : ''}
        frame.clipsContent = ${clip};
        ${opacity ? `frame.opacity = ${opacity};` : ''}
        ${rotate ? `frame.rotation = ${rotate};` : ''}
        ${cornerSmoothing ? `frame.cornerSmoothing = ${cornerSmoothing};` : ''}
        ${shadow ? `frame.effects = [${parseShadow(shadow)}];` : ''}
        ${blurVal ? `frame.effects = [{type:'LAYER_BLUR',radius:${blurVal},visible:true}];` : ''}
        ${minW ? `frame.minWidth = ${minW};` : ''}
        ${maxW ? `frame.maxWidth = ${maxW};` : ''}
        ${minH ? `frame.minHeight = ${minH};` : ''}
        ${maxH ? `frame.maxHeight = ${maxH};` : ''}

        ${childCode}

        return { id: frame.id, name: frame.name };
        } catch(e) {
          throw new Error('[Node: ' + __currentNode + '] ' + e.message);
        }
      })()
    `;
}

// ---------------------------------------------------------------------------
// Shadow parser
// ---------------------------------------------------------------------------

function parseShadow(shadow: string): string {
  const match = shadow.match(
    /(-?\d+)px\s+(-?\d+)px\s+(-?\d+)px\s+(?:(-?\d+)px\s+)?rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/,
  );
  if (!match) return '';
  const [, x, y, blur, spread, r, g, b, a] = match;
  return `{type:'DROP_SHADOW',color:{r:${Number(r) / 255},g:${Number(g) / 255},b:${Number(b) / 255},a:${a ?? 1}},offset:{x:${x},y:${y}},radius:${blur},spread:${spread ?? 0},visible:true}`;
}

// ---------------------------------------------------------------------------
// Font style mapping
// ---------------------------------------------------------------------------

function fontStyle(weight: string): string {
  switch (weight.toLowerCase()) {
    case 'bold': return 'Bold';
    case 'semibold': return 'Semi Bold';
    case 'medium': return 'Medium';
    case 'light': return 'Light';
    default: return 'Regular';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a JSX string to Figma Plugin API JavaScript code.
 *
 * Returns a self-contained async IIFE string that, when evaluated in a Figma
 * plugin context, creates the described node tree and returns `{ id, name }`.
 */
export async function generateJsFromJsx(jsx: string): Promise<string> {
  // Load registry (returns empty registry if no .desh-registry.json exists)
  const registry = loadRegistry(process.cwd());
  const registryNames = new Set(Object.keys(registry.components));

  // Find opening Frame tag
  const openMatch = jsx.match(/<Frame\s+([^>]*)>/);
  if (!openMatch) {
    throw new Error('Invalid JSX: must start with <Frame ...>');
  }

  const propsStr = openMatch[1];
  const startIdx = openMatch.index! + openMatch[0].length;

  // Find matching closing tag
  const inner = extractContent(jsx.slice(startIdx), 'Frame');

  // Parse props and children (pass registry names so component tags are recognized)
  const props = parseProps(propsStr);
  const childElements = parseChildren(inner, registryNames.size > 0 ? registryNames : undefined);

  return generateCode(props, childElements, registry);
}
