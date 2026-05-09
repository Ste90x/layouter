import { getHistoryShortcut } from "./historyShortcuts";

describe("history shortcuts", () => {
  test("maps Cmd+Z to undo", () => {
    expect(getHistoryShortcut(new KeyboardEvent("keydown", { key: "z", metaKey: true }))).toBe("undo");
  });

  test("maps Cmd+Shift+Z to redo", () => {
    expect(getHistoryShortcut(new KeyboardEvent("keydown", { key: "z", metaKey: true, shiftKey: true }))).toBe("redo");
  });

  test("ignores key events without Cmd", () => {
    expect(getHistoryShortcut(new KeyboardEvent("keydown", { key: "z" }))).toBeNull();
  });

  test("ignores non-z shortcuts", () => {
    expect(getHistoryShortcut(new KeyboardEvent("keydown", { key: "x", metaKey: true }))).toBeNull();
  });
});
