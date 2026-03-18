# Bugs and Fixes History

## Variable Binding Gray Fallback (f8d519b)
**Symptom**: All components rendered with gray `rgb(128,128,128)` fills
**Cause**: Variable loader searched for `c.name === 'shadcn'` but collections are named `shadcn/primitives` and `shadcn/semantic`
**Fix**: Changed to `c.name.startsWith('shadcn')` and iterate all matching collections
**Location**: Two places in figma-client.js (render-batch ~line 357, single render ~line 1090)

## Content Overflow / Fixed Height (f8d519b)
**Symptom**: Settings Panel content overflows frame, gets clipped
**Cause**: Without explicit `h`, root frame defaults to `h=200` with FIXED sizing
**Fix**: When no explicit height, use `primaryAxisSizingMode = 'AUTO'` (HUG) instead of FIXED. Axis depends on layout direction (VERTICAL: primary=height, HORIZONTAL: primary=width)
**Location**: Two code paths - render-batch and single render with var:

## Self-Closing Frame Parser (3353bbd)
**Symptom**: Floating gray rectangles appearing as siblings instead of nested children
**Cause**: `frameOpenRegex` (`/<Frame...>/`) matched self-closing `<Frame ... />` because `>` at end of `/>` matched
**Fix**:
1. Parse open/close Frame tags FIRST, then self-closing ones outside consumed ranges
2. Skip self-closing in frameOpenRegex: `if (match[0].endsWith('/>')) continue`
3. Non-greedy regex in extractContent: `[^>]*?` instead of `[^>]*`

## FILL Before appendChild (c69d448)
**Symptom**: "FILL can only be set on children of auto-layout frames" error
**Cause**: `layoutSizingHorizontal = 'FILL'` set before `appendChild()`
**Fix**: Move FILL sizing assignment after appendChild call

## Default Padding on Nested Frames (c69d448)
**Symptom**: Components look broken with unexpected spacing
**Cause**: Default padding 16/10 applied to ALL nested frames (intended only for buttons)
**Fix**: Changed defaults to 0/0: `fPx = item.px !== undefined ? item.px : (fP !== null ? fP : 0)`

## grow={1} Using Deprecated API (c69d448)
**Symptom**: grow not working correctly, vertical overflow
**Cause**: Used deprecated `layoutGrow` instead of `layoutSizingHorizontal/Vertical = 'FILL'`
**Fix**: Map grow based on parent flex direction using new API

## Old vs New Figma API Conflict (c69d448)
**Symptom**: Sizing conflicts between old and new API
**Cause**: Mixed use of `primaryAxisSizingMode`/`counterAxisSizingMode` (old) and `layoutSizingHorizontal`/`layoutSizingVertical` (new)
**Fix**: Use `layoutSizingHorizontal`/`layoutSizingVertical` for children, keep `primaryAxisSizingMode`/`counterAxisSizingMode` for root frame self-sizing only
