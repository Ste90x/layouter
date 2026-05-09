export type EditActionMode = "dom" | "free";

export function toggleEditActionMode(mode: EditActionMode): EditActionMode {
  return mode === "dom" ? "free" : "dom";
}

export function getSelectionModeClass(mode: EditActionMode): string {
  return mode === "dom" ? "layouter-selected-mode-dom" : "layouter-selected-mode-free";
}
