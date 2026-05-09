import {
  createDomMoveSession,
  isCriticalElement,
  isVisibleElement
} from "./domMover";

function markVisible(element: Element): void {
  vi.spyOn(element, "getClientRects").mockReturnValue({ length: 1 } as DOMRectList);
}

describe("dom move session", () => {
  test("tracks edit-mode status", () => {
    const session = createDomMoveSession();

    expect(session.status()).toMatchObject({ editModeEnabled: false });

    session.setEditMode(true);
    expect(session.status()).toMatchObject({ editModeEnabled: true });
  });

  test("moves an element before, after, and inside a target", () => {
    document.body.innerHTML = `
      <main>
        <section id="a"></section>
        <section id="b"><p id="child"></p></section>
        <section id="c"></section>
      </main>
    `;
    const session = createDomMoveSession();
    const a = document.getElementById("a")!;
    const b = document.getElementById("b")!;
    const c = document.getElementById("c")!;
    [a, b, c].forEach(markVisible);

    expect(session.move(a, b, "after")).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["b", "a", "c"]);

    expect(session.move(c, b, "before")).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["c", "b", "a"]);

    expect(session.move(a, b, "inside")).toBe(true);
    expect([...b.children].map((node) => node.id)).toEqual(["child", "a"]);
  });

  test("undoes, redoes, and resets moves", () => {
    document.body.innerHTML = `
      <main>
        <section id="a"></section>
        <section id="b"></section>
        <section id="c"></section>
      </main>
    `;
    const session = createDomMoveSession();
    const a = document.getElementById("a")!;
    const c = document.getElementById("c")!;
    [a, c].forEach(markVisible);

    session.move(a, c, "after");
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["b", "c", "a"]);

    expect(session.undo()).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "b", "c"]);

    expect(session.redo()).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["b", "c", "a"]);

    session.reset();
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "b", "c"]);
    expect(session.status()).toMatchObject({ canUndo: false, canRedo: false, moveCount: 0 });
  });

  test("undoes, redoes, and resets free-position transforms in the same history", () => {
    document.body.innerHTML = `<main><section id="a"></section><section id="b"></section></main>`;
    const session = createDomMoveSession();
    const a = document.getElementById("a")!;
    const b = document.getElementById("b")!;
    [a, b].forEach(markVisible);

    session.move(a, b, "after");
    session.transform(a, "translate(12px, 18px)");

    expect(a.style.transform).toBe("translate(12px, 18px)");
    expect(session.status()).toMatchObject({ canUndo: true, moveCount: 2 });

    expect(session.undo()).toBe(true);
    expect(a.style.transform).toBe("");
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["b", "a"]);

    expect(session.undo()).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "b"]);

    expect(session.redo()).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["b", "a"]);

    expect(session.redo()).toBe(true);
    expect(a.style.transform).toBe("translate(12px, 18px)");

    session.reset();
    expect(a.style.transform).toBe("");
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "b"]);
  });

  test("moves a group as one ordered DOM operation", () => {
    document.body.innerHTML = `
      <main>
        <section id="a"></section>
        <section id="b"></section>
        <section id="c"></section>
        <section id="d"></section>
        <section id="e"></section>
      </main>
    `;
    const session = createDomMoveSession();
    const b = document.getElementById("b")!;
    const d = document.getElementById("d")!;
    const e = document.getElementById("e")!;
    [b, d, e].forEach(markVisible);

    expect(session.moveGroup([b, d], e, "after")).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "c", "e", "b", "d"]);
    expect(session.status()).toMatchObject({ moveCount: 1 });

    expect(session.undo()).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "b", "c", "d", "e"]);

    expect(session.redo()).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "c", "e", "b", "d"]);
  });

  test("transforms a group as one undoable operation", () => {
    document.body.innerHTML = `<main><section id="a"></section><section id="b"></section></main>`;
    const session = createDomMoveSession();
    const a = document.getElementById("a")!;
    const b = document.getElementById("b")!;
    [a, b].forEach(markVisible);
    a.setAttribute("style", "transform: rotate(1deg)");

    expect(session.transformGroup([
      { element: a, transform: "rotate(1deg) translate(8px, 4px)" },
      { element: b, transform: "translate(8px, 4px)" }
    ])).toBe(true);

    expect((a as HTMLElement).style.transform).toBe("rotate(1deg) translate(8px, 4px)");
    expect((b as HTMLElement).style.transform).toBe("translate(8px, 4px)");

    expect(session.undo()).toBe(true);
    expect((a as HTMLElement).style.transform).toBe("rotate(1deg)");
    expect((b as HTMLElement).style.transform).toBe("");

    expect(session.redo()).toBe(true);
    expect((a as HTMLElement).style.transform).toBe("rotate(1deg) translate(8px, 4px)");
    expect((b as HTMLElement).style.transform).toBe("translate(8px, 4px)");
  });

  test("undoes, redoes, and resets resize records in the same history", () => {
    document.body.innerHTML = `<main><section id="a"></section><section id="b"></section></main>`;
    const session = createDomMoveSession();
    const a = document.getElementById("a")!;
    const b = document.getElementById("b")!;
    [a, b].forEach(markVisible);

    a.style.width = "80px";
    a.style.height = "40px";

    session.move(a, b, "after");
    session.resize(a, { height: "64px", width: "120px" });

    expect(a.style.width).toBe("120px");
    expect(a.style.height).toBe("64px");
    expect(session.status()).toMatchObject({ moveCount: 2 });

    expect(session.undo()).toBe(true);
    expect(a.style.width).toBe("80px");
    expect(a.style.height).toBe("40px");
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["b", "a"]);

    expect(session.undo()).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "b"]);

    expect(session.redo()).toBe(true);
    expect(session.redo()).toBe(true);
    expect(a.style.width).toBe("120px");
    expect(a.style.height).toBe("64px");

    session.reset();
    expect(a.style.width).toBe("80px");
    expect(a.style.height).toBe("40px");
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "b"]);
  });

  test("rejects critical elements and self or descendant drops", () => {
    document.body.innerHTML = `
      <main id="main">
        <section id="a"><div id="child"></div></section>
        <section id="b"></section>
      </main>
    `;
    const session = createDomMoveSession();
    const a = document.getElementById("a")!;
    const child = document.getElementById("child")!;
    const b = document.getElementById("b")!;
    [a, child, b].forEach(markVisible);

    expect(isCriticalElement(document.createElement("script"))).toBe(true);
    expect(session.move(document.body, b, "after")).toBe(false);
    expect(session.move(a, a, "inside")).toBe(false);
    expect(session.move(a, child, "inside")).toBe(false);
  });

  test("identifies visible elements", () => {
    const visible = document.createElement("div");
    document.body.append(visible);
    vi.spyOn(visible, "getClientRects").mockReturnValue({ length: 1 } as DOMRectList);

    const hidden = document.createElement("div");
    document.body.append(hidden);
    vi.spyOn(hidden, "getClientRects").mockReturnValue({ length: 0 } as DOMRectList);

    expect(isVisibleElement(visible)).toBe(true);
    expect(isVisibleElement(hidden)).toBe(false);
  });
});
