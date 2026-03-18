# Known Issues & Figma API Limitations

## Library Components Cannot Be Listed or Instanced by Name

**Status:** Figma API limitation — no workaround in the Plugin API

`figma.teamLibrary` only exposes:
- `getAvailableLibraryVariableCollectionsAsync()` — variable collections
- `getVariablesInLibraryCollectionAsync(key)` — variables in a collection

There is NO:
- `getAvailableLibraryComponentsAsync()` — doesn't exist
- `getAvailableLibraryComponentSetsAsync()` — doesn't exist

To use a library component, you need its `key` (a hash string), which is only discoverable by:
1. Opening the library file directly and reading component keys
2. Finding an existing instance in the current file and reading `instance.mainComponent.key`
3. Using the Figma REST API (requires API key, separate from CDP)

**Workaround:** Find existing instances of library components in the file:
```javascript
// Find a Button instance anywhere in the file
const instances = figma.currentPage.findAll(n =>
  n.type === 'INSTANCE' && n.name.includes('Button')
);
if (instances.length > 0) {
  const mainComp = await instances[0].getMainComponentAsync();
  // Now we can create new instances from mainComp
  const newButton = mainComp.createInstance();
}
```

**Risk:** `findAll` on large pages freezes Figma. Must be scoped to specific frames.

## Heavy Evals Freeze Figma and Kill CDP

When `Runtime.evaluate` runs a long operation (deep tree walk, large findAll), Figma's UI thread blocks. This causes:
1. The eval itself to timeout
2. All subsequent CDP calls to fail with "Connection timeout"
3. CDP port to become unresponsive even for new connections

**Recovery:** User must quit and reopen Figma. `desh connect` will reconnect.

**Prevention:** All recursive walks should have:
- Depth limit (max 6-8 levels)
- Skip INSTANCE children (they duplicate component internals)
- Early exit after N results (max 200)
- Never use `figma.root.findAll()` — scope to `figma.currentPage` at most
