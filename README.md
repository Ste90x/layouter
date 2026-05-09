# Layouter

Chrome extension for quick layout prototyping by temporarily moving visible DOM elements in the current page.

## Usage

1. Run `bun install`.
2. Run `bun run build`.
3. Open `chrome://extensions`.
4. Enable Developer Mode.
5. Load unpacked extension from `dist`.
6. Open a regular `http(s)` page.
7. Open the Layouter popup and enable Edit Mode.
8. Hover an element, then click it to select.
9. Use the selected element's icon handle:
   - Click the handle to choose `Move in DOM` or `Free position`.
   - Press `Tab` to switch between `DOM` and `Free`.
   - Drag the handle to move the selected element.
10. Hold `Shift` and drag across multiple elements to select a group.
    - Layouter prefers the smallest useful layout boxes touched by the selection rectangle.
    - Tiny boxes, SVG internals, and broad wrapper ancestors are skipped.
    - If the rectangle covers most of a useful parent, Layouter selects that parent instead.
    - `Shift` + click adds or removes one item from the group.
    - Group moves are undone as one action.
11. Drag a blue corner handle to resize a single selected element.
    - Hold `Shift` while resizing to preserve aspect ratio.
12. Press `Cmd+Z` to undo and `Cmd+Shift+Z` to redo completed layout changes.
13. Press `Escape` to unlock the selection.

Changes are temporary and disappear on page reload.
While Edit Mode is enabled, Layouter blocks normal page pointer, click, keyboard, touch, drag, and wheel interactions so the target app does not handle them.

## Scripts

- `bun run dev` starts Vite.
- `bun run build` type-checks and builds the extension into `dist`.
- `bun run test` runs unit tests.
