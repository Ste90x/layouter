export type HistoryShortcut = "undo" | "redo";

export function getHistoryShortcut(event: KeyboardEvent): HistoryShortcut | null {
  if (!event.metaKey || event.key.toLowerCase() !== "z") return null;
  return event.shiftKey ? "redo" : "undo";
}
