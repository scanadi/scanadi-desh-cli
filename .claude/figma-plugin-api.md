# Figma Plugin API Reference

## Node Types

### FrameNode
- `type: 'FRAME'`
- Create: `figma.createFrame()`
- Layout: `layoutMode` ('NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID')
- Padding: `paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom`
- Sizing: `primaryAxisSizingMode`, `counterAxisSizingMode` ('FIXED' | 'AUTO')
- Child sizing: `layoutSizingHorizontal`, `layoutSizingVertical` ('FIXED' | 'HUG' | 'FILL')
- Alignment: `primaryAxisAlignItems` ('MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN')
- Cross alignment: `counterAxisAlignItems` ('MIN' | 'CENTER' | 'MAX' | 'BASELINE')
- Spacing: `itemSpacing`, `counterAxisSpacing`
- Wrap: `layoutWrap` ('NO_WRAP' | 'WRAP')
- `clipsContent`: boolean - clips overflow
- Corner: `cornerRadius`, `cornerSmoothing`, individual corners (`topLeftRadius`, etc.)
- Styling: `fills`, `strokes`, `effects`, `opacity`, `blendMode`
- Geometry: `x`, `y`, `width`, `height` (readonly), `resize()`, `resizeWithoutConstraints()`
- Children: `children` (readonly), `appendChild()`, `insertChild()`, `findAll()`, `findOne()`
- Variables: `boundVariables`, `setBoundVariable()`

### TextNode
- `type: 'TEXT'`
- Create: `figma.createText()`
- **CRITICAL**: Must load font before setting `characters`: `await figma.loadFontAsync({family:'Inter',style:'Regular'})`
- `characters`: raw text content
- `fontSize`: number (min 1)
- `fontName`: `{family: string, style: string}`
- `fontWeight`: number (readonly, changes via fontName)
- `textAlignHorizontal`: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'
- `textAlignVertical`: 'TOP' | 'CENTER' | 'BOTTOM'
- `textAutoResize`: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE'
- `textTruncation`: 'DISABLED' | 'ENDING'
- `maxLines`: number | null
- `letterSpacing`, `lineHeight`, `paragraphSpacing`, `paragraphIndent`
- `textDecoration`, `textCase`
- `hasMissingFont`: boolean (readonly)
- Range methods: `setRangeFontSize()`, `setRangeFontName()`, `setRangeFills()`, etc.
- `autoRename`: boolean - auto-derive name from characters
- `hyperlink`: HyperlinkTarget | null

### ComponentNode
- `type: 'COMPONENT'`
- Inherits all FrameNode properties
- `createInstance()`: creates InstanceNode
- `getInstancesAsync()`: all instances in document
- `componentPropertyDefinitions`: readonly, all properties with defaults
- `addComponentProperty(name, type, defaultValue, options?)`: returns name with ID suffix
- `editComponentProperty(name, newValue)`: modify existing property
- `deleteComponentProperty(name)`: remove property
- Property types: 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP' | 'VARIANT'
- `key`: string (readonly) - for `figma.importComponentByKeyAsync()`
- `remote`: boolean - from team library
- `description`, `descriptionMarkdown`
- Create from frame: `figma.createComponentFromNode(frame)`

### ComponentSetNode
- `type: 'COMPONENT_SET'`
- Container for variant components
- All children are ComponentNodes
- `defaultVariant`: top-left-most variant (readonly)
- `componentPropertyDefinitions`: all variant properties
- Create: `figma.combineAsVariants(components, parent)`

### InstanceNode
- `type: 'INSTANCE'`
- `mainComponent`: the source component (setting swaps + clears overrides)
- `getMainComponentAsync()`: async version
- `componentProperties`: current values (readonly)
- `setProperties({...})`: update properties (TEXT/BOOLEAN/INSTANCE_SWAP need #ID suffix)
- `overrides`: directly overridden fields (readonly)
- `removeOverrides()`: clear all overrides
- `swapComponent(comp)`: swap preserving overrides
- `detachInstance()`: convert to frame
- `exposedInstances`: nested exposed instances (readonly)
- `scaleFactor`: instance scale
- **PERF WARNING**: Avoid alternating writes to ComponentNode then reads from InstanceNode

## Variables API (`figma.variables`)

### Methods
```
getVariableByIdAsync(id: string): Promise<Variable | null>
getVariableCollectionByIdAsync(id: string): Promise<VariableCollection | null>
getLocalVariablesAsync(type?: VariableResolvedDataType): Promise<Variable[]>
getLocalVariableCollectionsAsync(): Promise<VariableCollection[]>
createVariable(name, collection, resolvedType): Variable
createVariableCollection(name): VariableCollection
createVariableAlias(variable): VariableAlias
setBoundVariableForPaint(paint, field, variable | null): SolidPaint
setBoundVariableForEffect(effect, field, variable | null): Effect
importVariableByKeyAsync(key): Promise<Variable>
```

### Variable Object
- `id`, `name`, `description`: string
- `remote`: boolean (readonly)
- `resolvedType`: VariableResolvedDataType ('BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR')
- `valuesByMode`: {[modeId]: value} (readonly, doesn't resolve aliases)
- `setValueForMode(modeId, newValue)`: set value for mode
- `variableCollectionId`: string (readonly)
- `key`: string (readonly) - for import
- `scopes`: VariableScope[] - UI visibility
- `codeSyntax`: {WEB?, ANDROID?, iOS?} (readonly)
- `hiddenFromPublishing`: boolean
- `resolveForConsumer(node)`: get resolved value
- `remove()`: delete variable

### VariableCollection Object
- `id`, `name`: string
- `modes`: [{modeId, name}] (readonly)
- `defaultModeId`: string (readonly)
- `variableIds`: string[] (readonly)
- `remote`, `hiddenFromPublishing`: boolean
- `addMode(name)`: returns modeId (limited by pricing tier)
- `removeMode(modeId)`, `renameMode(modeId, name)`
- `remove()`: delete collection + all variables

### Binding Variables to Fills
```javascript
// Create bound paint
const paint = figma.variables.setBoundVariableForPaint(
  { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } },
  'color',
  variable
);
node.fills = [paint];
```

### Binding Variables to Node Properties
```javascript
node.setBoundVariable('fills', 0, variable);  // bind fill at index
node.setBoundVariable('itemSpacing', variable);
node.setBoundVariable('paddingLeft', variable);
// etc. for: visible, opacity, cornerRadius, strokeWeight, ...
```

## boundVariables (REST API)
Properties that can have variables bound:
- `size.x`, `size.y`
- `itemSpacing`, `counterAxisSpacing`
- `paddingLeft/Right/Top/Bottom`
- `visible`, `opacity`
- `topLeftRadius`, `topRightRadius`, `bottomLeftRadius`, `bottomRightRadius`
- `minWidth`, `maxWidth`, `minHeight`, `maxHeight`
- `fills[]`, `strokes[]`, `effects[]`
- `characters`
- `fontSize[]`, `fontFamily[]`, `fontWeight[]`
- `letterSpacing[]`, `lineHeight[]`
- `paragraphSpacing[]`, `paragraphIndent[]`

## Auto-Layout Rules

### Axis Mapping
| Layout Mode | Primary Axis | Counter Axis |
|-------------|-------------|--------------|
| VERTICAL    | Height (Y)  | Width (X)    |
| HORIZONTAL  | Width (X)   | Height (Y)   |

### Sizing Modes
- `primaryAxisSizingMode`: 'FIXED' (explicit size) | 'AUTO' (hug content)
- `counterAxisSizingMode`: 'FIXED' | 'AUTO'
- These are for the frame ITSELF

### Child Sizing (set AFTER appendChild!)
- `layoutSizingHorizontal`: 'FIXED' | 'HUG' | 'FILL'
- `layoutSizingVertical`: 'FIXED' | 'HUG' | 'FILL'
- FILL = stretch to fill parent (only in auto-layout parent)
- HUG = shrink to fit content
- FIXED = explicit width/height via resize()

### Common Patterns
```javascript
// Frame that hugs content vertically, fixed width
frame.layoutMode = 'VERTICAL';
frame.primaryAxisSizingMode = 'AUTO';  // height hugs
frame.counterAxisSizingMode = 'FIXED'; // width fixed
frame.resize(300, 1);

// Child that fills parent width
parent.appendChild(child);
child.layoutSizingHorizontal = 'FILL'; // MUST be after appendChild

// Grow pattern (spacer)
spacer.layoutSizingHorizontal = 'FILL'; // in horizontal parent
spacer.layoutSizingVertical = 'FILL';   // in vertical parent
```

## Global figma Methods
- `figma.createFrame()`, `figma.createText()`, `figma.createRectangle()`
- `figma.createComponentFromNode(node)`: convert frame to component
- `figma.combineAsVariants(components[], parent)`: create variant set
- `figma.loadFontAsync({family, style})`: required before text ops
- `figma.getNodeByIdAsync(id)`: find node
- `figma.currentPage`: active page
- `figma.root`: document root
- `figma.variables`: VariablesAPI namespace

## Important Gotchas

### layoutWrap only on HORIZONTAL
- `layoutWrap = 'WRAP'` throws error on VERTICAL frames
- `counterAxisSpacing` and `counterAxisAlignContent` only work with WRAP

### STRETCH + AUTO conflict
- Child with `layoutAlign = 'STRETCH'` that is itself auto-layout: MUST set corresponding sizing to FIXED
- A frame cannot simultaneously stretch-to-fill AND hug-children
- Same applies to `layoutGrow = 1` on auto-layout child frames

### SPACE_BETWEEN works
- `primaryAxisAlignItems = 'SPACE_BETWEEN'` does work in the API
- The CLAUDE.md note about it being unreliable may be a JSX mapping issue

### Fills/Strokes are Immutable Arrays
- Must clone, modify, reassign: `const fills = [...node.fills]; fills[0] = ...; node.fills = fills;`
- Pattern fills require `setFillsAsync()`, not direct assignment

### createComponentFromNode Constraints
- Node cannot already be a Component or ComponentSet
- Node cannot be inside a Component, ComponentSet, or Instance
- Violating these throws error

### counterAxisSpacing
- Set to `null` to sync with `itemSpacing`
- Once set to a number, never returns null again

### width/height are Readonly
- Use `resize()`, `resizeWithoutConstraints()`, or layoutSizing properties
- `resize()` respects child constraints, `resizeWithoutConstraints()` ignores them

### Setting layoutMode to NONE is Destructive
- Reverting from auto-layout to NONE does NOT restore original child positions

## Deprecated API (avoid)
- `getVariableById()` -> use `getVariableByIdAsync()`
- `getLocalVariables()` -> use `getLocalVariablesAsync()`
- `getLocalVariableCollections()` -> use `getLocalVariableCollectionsAsync()`
- `layoutGrow` -> use `layoutSizingHorizontal/Vertical = 'FILL'`
- `layoutAlign` -> use `layoutSizingHorizontal/Vertical`
- `primaryAxisSizingMode`/`counterAxisSizingMode` for children -> use `layoutSizingHorizontal/Vertical`
