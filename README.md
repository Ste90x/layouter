# Layouter

Chrome extension for quick layout prototyping by temporarily moving visible DOM elements in the current page.

## Usage

1. Run `bun install`.
2. Run `bun run build`.
3. Open `chrome://extensions`.
4. Enable Developer Mode.
5. Load unpacked extension from `dist`.
6. Open a regular `http(s)` page.
7. Click the small triangle in the top-left corner to enable Edit Mode.
   - Click it again to turn Edit Mode off without resetting current layout changes.
8. Hover an element, then click it to select.
9. Use the selected element's icon handle:
   - Click the handle to choose `Move in DOM` or `Free position`.
   - Choose `Change text`, or just start typing, to edit the selected element's text inline; press `Enter` or confirm.
   - Choose `Remove wrapper` to remove a single selected wrapper while preserving its children.
   - Press `Tab` to switch between `DOM` and `Free`.
   - Drag the handle to move the selected element.
   - In `Free position`, hold `Shift` while dragging for Y-axis-only movement, or `Control` for X-axis-only movement.
10. Hold `Shift` and drag across multiple elements to select a group.
    - Layouter prefers the smallest useful layout boxes touched by the selection rectangle.
    - Tiny boxes, SVG internals, and broad wrapper ancestors are skipped.
    - If the rectangle covers most of a useful parent, Layouter selects that parent instead.
    - `Shift` + click adds or removes one item from the group.
    - Group moves are undone as one action.
11. Drag a blue corner handle to resize a single selected element.
    - Hold `Shift` while resizing to preserve aspect ratio.
    - Choose `Use radius handles` from the icon handle menu to make the corner handles edit `border-radius` instead.
    - In radius mode, drag any corner handle inward toward the element center to round all corners.
12. Press `Delete` to remove the selected element or group from the DOM.
    - On compact Mac keyboards, use `Fn+Backspace` to emit `Delete`.
13. Press `Cmd+Z` to undo and `Cmd+Shift+Z` to redo completed layout changes.
14. Press `Escape` to unlock the selection.

Changes are temporary and disappear on page reload.
While Edit Mode is enabled, Layouter blocks normal page pointer, click, keyboard, touch, drag, and wheel interactions so the target app does not handle them.

## Scripts

- `bun run dev` starts Vite.
- `bun run build` type-checks and builds the extension into `dist`.
- `bun run test` runs unit tests.
