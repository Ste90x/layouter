export type ResizeCorner = "nw" | "ne" | "sw" | "se";

export type ResizeInput = {
  corner: ResizeCorner;
  deltaX: number;
  deltaY: number;
  preserveAspectRatio: boolean;
  startHeight: number;
  startWidth: number;
};

export type ResizeDimensions = {
  height: number;
  width: number;
};

export function calculateResize(input: ResizeInput): ResizeDimensions {
  const horizontalSign = input.corner.endsWith("e") ? 1 : -1;
  const verticalSign = input.corner.startsWith("s") ? 1 : -1;
  let width = input.startWidth + input.deltaX * horizontalSign;
  let height = input.startHeight + input.deltaY * verticalSign;

  if (input.preserveAspectRatio && input.startHeight !== 0) {
    const ratio = input.startWidth / input.startHeight;
    height = width / ratio;
  }

  return { height, width };
}
