import type { ResizeCorner } from "./resize";

export type BorderRadiusInput = {
  corner: ResizeCorner;
  deltaX: number;
  deltaY: number;
  maxRadius: number;
  startRadius: number;
};

export function calculateBorderRadius(input: BorderRadiusInput): number {
  const inwardX = input.corner.endsWith("e") ? -input.deltaX : input.deltaX;
  const inwardY = input.corner.startsWith("s") ? -input.deltaY : input.deltaY;
  const dominantInwardDelta = Math.abs(inwardX) >= Math.abs(inwardY) ? inwardX : inwardY;
  return clamp(input.startRadius + dominantInwardDelta, 0, input.maxRadius);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
