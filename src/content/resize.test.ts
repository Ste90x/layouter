import { calculateResize, type ResizeCorner } from "./resize";

describe("resize helpers", () => {
  test("resizes from southeast corner without preserving aspect ratio", () => {
    expect(calculateResize({
      corner: "se",
      deltaX: 20,
      deltaY: 10,
      preserveAspectRatio: false,
      startHeight: 50,
      startWidth: 100
    })).toEqual({ height: 60, width: 120 });
  });

  test("resizes from northwest corner by shrinking from opposite corner", () => {
    expect(calculateResize({
      corner: "nw",
      deltaX: 20,
      deltaY: 10,
      preserveAspectRatio: false,
      startHeight: 50,
      startWidth: 100
    })).toEqual({ height: 40, width: 80 });
  });

  test("preserves aspect ratio when requested", () => {
    expect(calculateResize({
      corner: "se" satisfies ResizeCorner,
      deltaX: 20,
      deltaY: 80,
      preserveAspectRatio: true,
      startHeight: 50,
      startWidth: 100
    })).toEqual({ height: 60, width: 120 });
  });
});
