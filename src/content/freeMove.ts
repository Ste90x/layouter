export type FreeMoveModifiers = {
  controlKey: boolean;
  shiftKey: boolean;
};

export type FreeMoveDelta = {
  dx: number;
  dy: number;
};

export function applyFreeMoveAxisLock(delta: FreeMoveDelta, modifiers: FreeMoveModifiers): FreeMoveDelta {
  if (modifiers.shiftKey) return { dx: 0, dy: delta.dy };
  if (modifiers.controlKey) return { dx: delta.dx, dy: 0 };
  return delta;
}
