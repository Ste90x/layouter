export type LayouterCommand =
  | { type: "GET_STATUS" }
  | { type: "SET_EDIT_MODE"; enabled: boolean }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET" };

export type LayouterStatus = {
  editModeEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  moveCount: number;
};

export type LayouterResponse =
  | { ok: true; status: LayouterStatus }
  | { ok: false; error: string };
