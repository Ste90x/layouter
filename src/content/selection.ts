export type ClickSelectionState = {
  isShiftKey?: boolean;
  selectionCount: number;
  isExtensionTarget: boolean;
};

export function canSelectByClick(state: ClickSelectionState): boolean {
  if (state.isExtensionTarget) return false;
  if (state.isShiftKey) return true;
  return state.selectionCount === 0;
}

export type RectLike = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export function rectsIntersect(a: RectLike, b: RectLike): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

export const MIN_LAYOUT_BOX_EDGE = 24;
export const PARENT_PROMOTION_COVERAGE = 0.7;

export function innermostElements(elements: Element[]): Element[] {
  return elements.filter((element) => !elements.some((candidate) => candidate !== element && element.contains(candidate)));
}

export function selectHierarchyCandidates(elements: Element[], selectionRect: RectLike): Element[] {
  const candidates = [...new Set(elements)]
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter((candidate) => rectsIntersect(selectionRect, candidate.rect) && isLayoutBox(candidate.element, candidate.rect));

  const promotedParents = new Set(
    candidates
      .filter((candidate) =>
        rectCoverage(selectionRect, candidate.rect) >= PARENT_PROMOTION_COVERAGE &&
        candidates.some((descendant) => descendant.element !== candidate.element && candidate.element.contains(descendant.element))
      )
      .map((candidate) => candidate.element)
  );

  const withoutPromotedDescendants = candidates.filter((candidate) =>
    !candidates.some((ancestor) =>
      ancestor.element !== candidate.element &&
      promotedParents.has(ancestor.element) &&
      ancestor.element.contains(candidate.element)
    )
  );

  return sortElementsInDocumentOrder(withoutPromotedDescendants
    .filter((candidate) =>
      promotedParents.has(candidate.element) ||
      !withoutPromotedDescendants.some((descendant) =>
        descendant.element !== candidate.element &&
        candidate.element.contains(descendant.element)
      )
    )
    .map((candidate) => candidate.element));
}

export function sortElementsInDocumentOrder(elements: Element[]): Element[] {
  return [...elements].sort((a, b) => {
    if (a === b) return 0;
    const position = a.compareDocumentPosition(b);
    return position & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
  });
}

function isLayoutBox(element: Element, rect: RectLike): boolean {
  return !(element instanceof SVGElement) && rect.right - rect.left >= MIN_LAYOUT_BOX_EDGE && rect.bottom - rect.top >= MIN_LAYOUT_BOX_EDGE;
}

function rectCoverage(selectionRect: RectLike, elementRect: RectLike): number {
  const elementArea = rectArea(elementRect);
  if (elementArea === 0) return 0;
  return intersectionArea(selectionRect, elementRect) / elementArea;
}

function intersectionArea(a: RectLike, b: RectLike): number {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function rectArea(rect: RectLike): number {
  return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
}
