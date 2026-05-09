import { calculateBorderRadius } from "./borderRadius";

describe("border radius helpers", () => {
  test("increases radius when dragging a corner inward", () => {
    expect(calculateBorderRadius({
      corner: "se",
      deltaX: -12,
      deltaY: -8,
      maxRadius: 50,
      startRadius: 4
    })).toBe(16);
  });

  test("decreases radius when dragging a corner outward", () => {
    expect(calculateBorderRadius({
      corner: "nw",
      deltaX: -6,
      deltaY: -10,
      maxRadius: 50,
      startRadius: 20
    })).toBe(10);
  });

  test("clamps radius to zero", () => {
    expect(calculateBorderRadius({
      corner: "ne",
      deltaX: 30,
      deltaY: -4,
      maxRadius: 50,
      startRadius: 12
    })).toBe(0);
  });

  test("clamps radius to the maximum radius", () => {
    expect(calculateBorderRadius({
      corner: "sw",
      deltaX: 6,
      deltaY: -80,
      maxRadius: 24,
      startRadius: 10
    })).toBe(24);
  });
});
