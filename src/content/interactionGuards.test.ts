import { blockPageEventWhenEditModeActive, stopPageEventWhenEditModeActive } from "./interactionGuards";

describe("interaction guards", () => {
  test("blocks page events while edit mode is active", () => {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    blockPageEventWhenEditModeActive(event, true);

    expect(event.defaultPrevented).toBe(true);
  });

  test("leaves page events alone while edit mode is inactive", () => {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    blockPageEventWhenEditModeActive(event, false);

    expect(event.defaultPrevented).toBe(false);
  });

  test("does not try to prevent default on non-cancelable events", () => {
    const event = new Event("touchend", { bubbles: true, cancelable: false });
    const preventDefault = vi.spyOn(event, "preventDefault");

    blockPageEventWhenEditModeActive(event, true);

    expect(preventDefault).not.toHaveBeenCalled();
  });

  test("can stop propagation without preventing default", () => {
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 2 });

    stopPageEventWhenEditModeActive(event, true);

    expect(event.defaultPrevented).toBe(false);
  });
});
