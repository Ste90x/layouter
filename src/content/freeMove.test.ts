import { applyFreeMoveAxisLock } from "./freeMove";

describe("free move axis lock", () => {
  test("keeps both axes when no modifier is held", () => {
    expect(applyFreeMoveAxisLock({ dx: 12, dy: 18 }, { controlKey: false, shiftKey: false })).toEqual({
      dx: 12,
      dy: 18
    });
  });

  test("limits movement to the Y axis while shift is held", () => {
    expect(applyFreeMoveAxisLock({ dx: 12, dy: 18 }, { controlKey: false, shiftKey: true })).toEqual({
      dx: 0,
      dy: 18
    });
  });

  test("limits movement to the X axis while control is held", () => {
    expect(applyFreeMoveAxisLock({ dx: 12, dy: 18 }, { controlKey: true, shiftKey: false })).toEqual({
      dx: 12,
      dy: 0
    });
  });

  test("prefers shift when shift and control are both held", () => {
    expect(applyFreeMoveAxisLock({ dx: 12, dy: 18 }, { controlKey: true, shiftKey: true })).toEqual({
      dx: 0,
      dy: 18
    });
  });
});
