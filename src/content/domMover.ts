export type DropPosition = "before" | "after" | "inside";

export type SessionStatus = {
  editModeEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  moveCount: number;
};

type ElementLocation = {
  parent: Node;
  nextSibling: Node | null;
};

type DomMoveRecord = {
  kind: "dom";
  element: Element;
  from: ElementLocation;
  to: ElementLocation;
};

type TransformRecord = {
  kind: "transform";
  element: HTMLElement;
  from: string;
  to: string;
};

type TransformGroupRecord = {
  kind: "transformGroup";
  changes: Array<{
    element: HTMLElement;
    from: string;
    to: string;
  }>;
};

type DomGroupRecord = {
  kind: "domGroup";
  elements: Element[];
  from: ElementLocation[];
  position: DropPosition;
  target: Element;
};

type ResizeDimensions = {
  height: string;
  width: string;
};

type ResizeRecord = {
  kind: "resize";
  element: HTMLElement;
  from: ResizeDimensions;
  to: ResizeDimensions;
};

type MoveRecord = DomMoveRecord | DomGroupRecord | TransformRecord | TransformGroupRecord | ResizeRecord;

export type TransformChange = {
  element: Element;
  transform: string;
};

export type DomMoveSession = {
  setEditMode(enabled: boolean): void;
  status(): SessionStatus;
  move(element: Element, target: Element, position: DropPosition): boolean;
  moveGroup(elements: Element[], target: Element, position: DropPosition): boolean;
  resize(element: Element, dimensions: ResizeDimensions): boolean;
  transform(element: Element, transform: string): boolean;
  transformGroup(changes: TransformChange[]): boolean;
  undo(): boolean;
  redo(): boolean;
  reset(): void;
};

const CRITICAL_TAGS = new Set(["HTML", "HEAD", "BODY", "SCRIPT", "STYLE", "META", "LINK", "TITLE"]);

export function isCriticalElement(element: Element): boolean {
  return CRITICAL_TAGS.has(element.tagName);
}

export function isVisibleElement(element: Element): boolean {
  const computed = window.getComputedStyle(element);
  return computed.display !== "none" && computed.visibility !== "hidden" && element.getClientRects().length > 0;
}

export function isAllowedMove(element: Element, target: Element): boolean {
  if (element === target) return false;
  if (isCriticalElement(element) || isCriticalElement(target)) return false;
  if (!isVisibleElement(element) || !isVisibleElement(target)) return false;
  if (element.contains(target)) return false;
  if (element.closest("[data-layouter-extension-root]") || target.closest("[data-layouter-extension-root]")) return false;
  return true;
}

export function isAllowedGroupMove(elements: Element[], target: Element): boolean {
  if (elements.length === 0) return false;
  if (isCriticalElement(target) || !isVisibleElement(target) || target.closest("[data-layouter-extension-root]")) return false;
  return elements.every((element) => isAllowedMove(element, target));
}

export function createDomMoveSession(): DomMoveSession {
  let editModeEnabled = false;
  const undoStack: MoveRecord[] = [];
  const redoStack: MoveRecord[] = [];

  function status(): SessionStatus {
    return {
      editModeEnabled,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      moveCount: undoStack.length
    };
  }

  function place(element: Element, target: Element, position: DropPosition): void {
    if (position === "before") {
      target.parentNode?.insertBefore(element, target);
      return;
    }

    if (position === "after") {
      target.parentNode?.insertBefore(element, target.nextSibling);
      return;
    }

    target.appendChild(element);
  }

  function placeGroup(elements: Element[], target: Element, position: DropPosition): void {
    const fragment = document.createDocumentFragment();
    for (const element of elements) {
      fragment.appendChild(element);
    }

    if (position === "before") {
      target.parentNode?.insertBefore(fragment, target);
      return;
    }

    if (position === "after") {
      target.parentNode?.insertBefore(fragment, target.nextSibling);
      return;
    }

    target.appendChild(fragment);
  }

  function restore(element: Element, location: ElementLocation): void {
    location.parent.insertBefore(element, location.nextSibling);
  }

  function restoreGroup(elements: Element[], locations: ElementLocation[]): void {
    for (let index = elements.length - 1; index >= 0; index -= 1) {
      restore(elements[index], locations[index]);
    }
  }

  function applyRecord(record: MoveRecord, direction: "from" | "to"): void {
    if (record.kind === "dom") {
      restore(record.element, record[direction]);
      return;
    }

    if (record.kind === "domGroup") {
      if (direction === "from") {
        restoreGroup(record.elements, record.from);
      } else {
        placeGroup(record.elements, record.target, record.position);
      }
      return;
    }

    if (record.kind === "transform") {
      record.element.style.transform = record[direction];
      return;
    }

    if (record.kind === "transformGroup") {
      for (const change of record.changes) {
        change.element.style.transform = change[direction];
      }
      return;
    }

    record.element.style.width = record[direction].width;
    record.element.style.height = record[direction].height;
  }

  return {
    setEditMode(enabled) {
      editModeEnabled = enabled;
    },

    status,

    move(element, target, position) {
      if (!isAllowedMove(element, target)) return false;

      const from: ElementLocation = {
        parent: element.parentNode!,
        nextSibling: element.nextSibling
      };

      place(element, target, position);

      undoStack.push({
        kind: "dom",
        element,
        from,
        to: {
          parent: element.parentNode!,
          nextSibling: element.nextSibling
        }
      });
      redoStack.length = 0;
      return true;
    },

    moveGroup(elements, target, position) {
      if (!isAllowedGroupMove(elements, target)) return false;

      const from = elements.map((element) => ({
        parent: element.parentNode!,
        nextSibling: element.nextSibling
      }));

      placeGroup(elements, target, position);

      undoStack.push({
        kind: "domGroup",
        elements: [...elements],
        from,
        position,
        target
      });
      redoStack.length = 0;
      return true;
    },

    resize(element, dimensions) {
      if (!(element instanceof HTMLElement)) return false;

      const from = {
        height: element.style.height,
        width: element.style.width
      };

      element.style.width = dimensions.width;
      element.style.height = dimensions.height;

      undoStack.push({
        kind: "resize",
        element,
        from,
        to: dimensions
      });
      redoStack.length = 0;
      return true;
    },

    transform(element, transform) {
      if (!(element instanceof HTMLElement)) return false;

      const from = element.style.transform;
      element.style.transform = transform;

      undoStack.push({
        kind: "transform",
        element,
        from,
        to: transform
      });
      redoStack.length = 0;
      return true;
    },

    transformGroup(changes) {
      const htmlChanges = changes.flatMap((change) => {
        if (!(change.element instanceof HTMLElement)) return [];
        return [{
          element: change.element,
          from: change.element.style.transform,
          to: change.transform
        }];
      });
      if (htmlChanges.length === 0 || htmlChanges.length !== changes.length) return false;

      for (const change of htmlChanges) {
        change.element.style.transform = change.to;
      }

      undoStack.push({
        kind: "transformGroup",
        changes: htmlChanges
      });
      redoStack.length = 0;
      return true;
    },

    undo() {
      const record = undoStack.pop();
      if (!record) return false;
      applyRecord(record, "from");
      redoStack.push(record);
      return true;
    },

    redo() {
      const record = redoStack.pop();
      if (!record) return false;
      applyRecord(record, "to");
      undoStack.push(record);
      return true;
    },

    reset() {
      while (undoStack.length > 0) {
        const record = undoStack.pop()!;
        applyRecord(record, "from");
      }
      redoStack.length = 0;
    }
  };
}
