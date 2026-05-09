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

  test("deletes, undoes, redoes, and resets a single element", () => {
    document.body.innerHTML = `
      <main>
        <section id="a"></section>
        <section id="b"></section>
        <section id="c"></section>
      </main>
    `;
    const session = createDomMoveSession();
    const b = document.getElementById("b")!;

    expect(session.deleteElements([b])).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "c"]);
    expect(session.status()).toMatchObject({ canUndo: true, moveCount: 1 });

    expect(session.undo()).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "b", "c"]);

    expect(session.redo()).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "c"]);

    session.reset();
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "b", "c"]);
  });

  test("deletes a group as one history action and restores original order", () => {
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
    const c = document.getElementById("c")!;
    const e = document.getElementById("e")!;

    expect(session.deleteElements([b, c, e])).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "d"]);
    expect(session.status()).toMatchObject({ moveCount: 1 });

    expect(session.undo()).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "b", "c", "d", "e"]);

    expect(session.redo()).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "d"]);
  });

  test("unwraps an element while preserving element children", () => {
    document.body.innerHTML = `
      <main>
        <section id="before"></section>
        <div id="wrapper">
          <p id="a"></p>
          <p id="b"></p>
        </div>
        <section id="after"></section>
      </main>
    `;
    const session = createDomMoveSession();
    const wrapper = document.getElementById("wrapper")!;

    expect(session.unwrapElement(wrapper)).toBe(true);
    expect([...document.querySelector("main")!.children].map((node) => node.id)).toEqual(["before", "a", "b", "after"]);
    expect(document.getElementById("wrapper")).toBeNull();

    expect(session.undo()).toBe(true);
    expect([...document.querySelector("main")!.children].map((node) => node.id)).toEqual(["before", "wrapper", "after"]);
    expect([...wrapper.children].map((node) => node.id)).toEqual(["a", "b"]);

    expect(session.redo()).toBe(true);
    expect([...document.querySelector("main")!.children].map((node) => node.id)).toEqual(["before", "a", "b", "after"]);
  });

  test("unwrap preserves text nodes and child order through reset", () => {
    document.body.innerHTML = `<main><div id="wrapper">before <span id="child"></span> after</div><section id="tail"></section></main>`;
    const session = createDomMoveSession();
    const wrapper = document.getElementById("wrapper")!;

    expect(session.unwrapElement(wrapper)).toBe(true);
    expect([...document.querySelector("main")!.childNodes].map((node) =>
      node.nodeType === Node.TEXT_NODE ? node.textContent : (node as Element).id
    )).toEqual(["before ", "child", " after", "tail"]);

    session.reset();
    expect([...document.querySelector("main")!.children].map((node) => node.id)).toEqual(["wrapper", "tail"]);
    expect([...wrapper.childNodes].map((node) =>
      node.nodeType === Node.TEXT_NODE ? node.textContent : (node as Element).id
    )).toEqual(["before ", "child", " after"]);
  });

  test("replaces text and restores original child nodes through undo and redo", () => {
    document.body.innerHTML = `<main><button id="button">Buy <span id="amount">2</span></button></main>`;
    const session = createDomMoveSession();
    const button = document.getElementById("button")!;
    const originalChildren = [...button.childNodes];

    expect(session.replaceText(button, "Buy 3", originalChildren)).toBe(true);
    expect(button.textContent).toBe("Buy 3");
    expect(button.children).toHaveLength(0);

    expect(session.undo()).toBe(true);
    expect([...button.childNodes]).toEqual(originalChildren);
    expect(button.innerHTML).toBe('Buy <span id="amount">2</span>');

    expect(session.redo()).toBe(true);
    expect(button.textContent).toBe("Buy 3");
    expect(button.children).toHaveLength(0);
  });

  test("resets text edits to the original child nodes", () => {
    document.body.innerHTML = `<main><p id="copy">Hello <strong id="strong">world</strong></p></main>`;
    const session = createDomMoveSession();
    const copy = document.getElementById("copy")!;
    const originalChildren = [...copy.childNodes];

    session.replaceText(copy, "Hello layout", originalChildren);
    expect(copy.textContent).toBe("Hello layout");

    session.reset();
    expect([...copy.childNodes]).toEqual(originalChildren);
    expect(copy.innerHTML).toBe('Hello <strong id="strong">world</strong>');
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

  test("undoes, redoes, and resets border-radius records in the same history", () => {
    document.body.innerHTML = `<main><section id="a"></section><section id="b"></section></main>`;
    const session = createDomMoveSession();
    const a = document.getElementById("a")!;
    const b = document.getElementById("b")!;
    [a, b].forEach(markVisible);

    a.style.borderRadius = "6px";

    session.move(a, b, "after");
    session.borderRadius(a, "18px");

    expect(a.style.borderRadius).toBe("18px");
    expect(session.status()).toMatchObject({ moveCount: 2 });

    expect(session.undo()).toBe(true);
    expect(a.style.borderRadius).toBe("6px");
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["b", "a"]);

    expect(session.undo()).toBe(true);
    expect([...document.querySelectorAll("main > section")].map((node) => node.id)).toEqual(["a", "b"]);

    expect(session.redo()).toBe(true);
    expect(session.redo()).toBe(true);
    expect(a.style.borderRadius).toBe("18px");

    session.reset();
    expect(a.style.borderRadius).toBe("6px");
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
    expect(session.deleteElements([document.body])).toBe(false);
    expect(session.unwrapElement(document.body)).toBe(false);
    expect(session.replaceText(document.body, "Nope")).toBe(false);
    expect(session.unwrapElement(b)).toBe(false);
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
