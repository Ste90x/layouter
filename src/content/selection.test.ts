import { canSelectByClick, innermostElements, rectsIntersect, selectHierarchyCandidates, sortElementsInDocumentOrder } from "./selection";

function setRect(element: Element, left: number, top: number, width: number, height: number): void {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(left, top, width, height));
}

describe("selection", () => {
  test("allows plain click selection only when the selection is empty", () => {
    expect(canSelectByClick({ selectionCount: 0, isExtensionTarget: false })).toBe(true);
    expect(canSelectByClick({ selectionCount: 1, isExtensionTarget: false })).toBe(false);
    expect(canSelectByClick({ selectionCount: 0, isExtensionTarget: true })).toBe(false);
  });

  test("allows shift-click to edit a selection group", () => {
    expect(canSelectByClick({ selectionCount: 2, isExtensionTarget: false, isShiftKey: true })).toBe(true);
    expect(canSelectByClick({ selectionCount: 2, isExtensionTarget: true, isShiftKey: true })).toBe(false);
  });

  test("detects intersecting rectangles", () => {
    expect(rectsIntersect(
      { top: 0, right: 20, bottom: 20, left: 0 },
      { top: 10, right: 30, bottom: 30, left: 10 }
    )).toBe(true);
    expect(rectsIntersect(
      { top: 0, right: 20, bottom: 20, left: 0 },
      { top: 21, right: 30, bottom: 30, left: 21 }
    )).toBe(false);
  });

  test("keeps innermost elements and document order", () => {
    document.body.innerHTML = `
      <main>
        <section id="a"><button id="child"></button></section>
        <section id="b"></section>
      </main>
    `;

    const a = document.getElementById("a")!;
    const child = document.getElementById("child")!;
    const b = document.getElementById("b")!;

    expect(innermostElements([child, b, a])).toEqual([child, b]);
    expect(sortElementsInDocumentOrder([b, a])).toEqual([a, b]);
  });

  test("selects deepest qualifying layout boxes instead of broad parents", () => {
    document.body.innerHTML = `
      <main id="main">
        <section id="card">
          <button id="button">Buy</button>
          <div id="meta"></div>
        </section>
      </main>
    `;
    const main = document.getElementById("main")!;
    const card = document.getElementById("card")!;
    const button = document.getElementById("button")!;
    const meta = document.getElementById("meta")!;
    setRect(main, 0, 0, 500, 500);
    setRect(card, 20, 20, 200, 160);
    setRect(button, 40, 40, 80, 36);
    setRect(meta, 40, 92, 120, 32);

    expect(selectHierarchyCandidates([main, card, button, meta], new DOMRect(35, 35, 130, 95))).toEqual([button, meta]);
  });

  test("skips tiny descendants and selects the smallest useful layout box", () => {
    document.body.innerHTML = `
      <button id="button">
        <span id="icon"></span>
      </button>
    `;
    const button = document.getElementById("button")!;
    const icon = document.getElementById("icon")!;
    setRect(button, 10, 10, 90, 40);
    setRect(icon, 16, 16, 12, 12);

    expect(selectHierarchyCandidates([button, icon], new DOMRect(12, 12, 20, 20))).toEqual([button]);
  });

  test("skips svg internals in favor of a useful layout box", () => {
    document.body.innerHTML = `
      <button id="button">
        <svg id="icon" viewBox="0 0 32 32"><path id="path" d="M0 0h32v32H0z" /></svg>
      </button>
    `;
    const button = document.getElementById("button")!;
    const icon = document.getElementById("icon")!;
    const path = document.getElementById("path")!;
    setRect(button, 10, 10, 80, 40);
    setRect(icon, 14, 14, 32, 32);
    setRect(path, 14, 14, 32, 32);

    expect(selectHierarchyCandidates([button, icon, path], new DOMRect(12, 12, 36, 36))).toEqual([button]);
  });

  test("promotes a parent when the marquee covers at least seventy percent", () => {
    document.body.innerHTML = `
      <section id="card">
        <button id="button"></button>
        <div id="meta"></div>
      </section>
    `;
    const card = document.getElementById("card")!;
    const button = document.getElementById("button")!;
    const meta = document.getElementById("meta")!;
    setRect(card, 10, 10, 100, 100);
    setRect(button, 20, 20, 60, 30);
    setRect(meta, 20, 60, 60, 30);

    expect(selectHierarchyCandidates([card, button, meta], new DOMRect(10, 10, 84, 84))).toEqual([card]);
  });

  test("does not promote a parent below seventy percent coverage", () => {
    document.body.innerHTML = `
      <section id="card">
        <button id="button"></button>
        <div id="meta"></div>
      </section>
    `;
    const card = document.getElementById("card")!;
    const button = document.getElementById("button")!;
    const meta = document.getElementById("meta")!;
    setRect(card, 10, 10, 100, 100);
    setRect(button, 20, 20, 60, 30);
    setRect(meta, 20, 60, 60, 30);

    expect(selectHierarchyCandidates([card, button, meta], new DOMRect(10, 10, 80, 80))).toEqual([button, meta]);
  });
});
