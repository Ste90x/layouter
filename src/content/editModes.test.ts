import { getSelectionModeClass, toggleEditActionMode } from "./editModes";

describe("edit modes", () => {
  test("toggles between DOM and free-position modes", () => {
    expect(toggleEditActionMode("dom")).toBe("free");
    expect(toggleEditActionMode("free")).toBe("dom");
  });

  test("maps modes to distinct selection classes", () => {
    expect(getSelectionModeClass("dom")).toBe("layouter-selected-mode-dom");
    expect(getSelectionModeClass("free")).toBe("layouter-selected-mode-free");
  });
});
