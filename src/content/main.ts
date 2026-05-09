import { calculateBorderRadius } from "./borderRadius";
import { createDomMoveSession, type DropPosition, isAllowedGroupMove, isAllowedMove, isAllowedTextEdit, isCriticalElement, isVisibleElement } from "./domMover";
import { getSelectionModeClass, toggleEditActionMode, type EditActionMode } from "./editModes";
import { applyFreeMoveAxisLock } from "./freeMove";
import { getHistoryShortcut } from "./historyShortcuts";
import { blockPageEventWhenEditModeActive, stopPageEventWhenEditModeActive } from "./interactionGuards";
import { calculateResize, type ResizeCorner } from "./resize";
import { canSelectByClick, innermostElements, selectHierarchyCandidates, sortElementsInDocumentOrder } from "./selection";
import type { LayouterCommand, LayouterResponse } from "../shared/messages";

declare global {
  interface Window {
    __LAYOUTER_CONTENT_SCRIPT_READY__?: boolean;
  }
}

if (window.__LAYOUTER_CONTENT_SCRIPT_READY__) {
  throw new Error("Layouter content script already installed.");
}

window.__LAYOUTER_CONTENT_SCRIPT_READY__ = true;

const session = createDomMoveSession();

const HOVER_CLASS = "layouter-hover";
const DROP_BEFORE_CLASS = "layouter-drop-before";
const DROP_AFTER_CLASS = "layouter-drop-after";
const DROP_INSIDE_CLASS = "layouter-drop-inside";
const GHOST_CLASS = "layouter-ghost";
const SELECTED_CLASS = "layouter-selected";
const SELECTED_MODE_CLASSES = ["layouter-selected-mode-dom", "layouter-selected-mode-free"];
const EXTENSION_ROOT_ATTR = "data-layouter-extension-root";
type ResizeHandleMode = "resize" | "borderRadius";

let hoveredElement: Element | null = null;
let selectedElements = new Set<Element>();
let draggedElements: Element[] = [];
let dropTarget: Element | null = null;
let dropPosition: DropPosition | null = null;
let actionMode: EditActionMode = "dom";
let resizeHandleMode: ResizeHandleMode = "resize";
let handleMenuOpen = false;
let pendingHandleDrag: { pointerId: number; x: number; y: number } | null = null;
let selectionDragStart: { pointerId: number; x: number; y: number } | null = null;
let freeDragStart: { x: number; y: number; initialTransforms: Map<Element, string> } | null = null;
let resizeDragStart: {
  borderRadiusStyle: string;
  corner: ResizeCorner;
  height: number;
  maxRadius: number;
  pointerId: number;
  radius: number;
  width: number;
  x: number;
  y: number;
} | null = null;
let suppressHandleClick = false;
let suppressSelectionClick = false;
let textEditState: {
  draftText: string;
  element: HTMLElement;
  originalChildren: ChildNode[];
  selectionAll: boolean;
} | null = null;

const handle = createHandle();
const handleMenu = createMenu("layouter-handle-menu");
const textEditToolbar = createMenu("layouter-text-edit-toolbar");
const resizeHandles = createResizeHandles();
const marquee = createMarquee();
const editToggle = createEditToggle();

installStyles();
syncEditToggle();
wireMessages();
wireEvents();

function wireMessages(): void {
  chrome.runtime.onMessage.addListener((message: LayouterCommand, _sender, sendResponse) => {
    try {
      if (message.type === "SET_EDIT_MODE") {
        setEditMode(message.enabled);
      } else if (message.type === "UNDO") {
        session.undo();
        syncHandle();
      } else if (message.type === "REDO") {
        session.redo();
        syncHandle();
      } else if (message.type === "RESET") {
        session.reset();
        cleanupTransientState();
        clearSelection();
      }

      sendResponse({ ok: true, status: session.status() } satisfies LayouterResponse);
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown Layouter error" } satisfies LayouterResponse);
    }
    return true;
  });
}

function setEditMode(enabled: boolean): void {
  if (!enabled) cancelTextEdit();
  session.setEditMode(enabled);
  cleanupTransientState();
  if (!enabled) clearSelection();
  syncEditToggle();
}

function wireEvents(): void {
  for (const eventName of ["pointermove", "pointerdown", "pointerup", "pointercancel", "contextmenu", "click", "keydown", "beforeinput", "input"] as const) {
    document.addEventListener(eventName, handleLayouterEvent, true);
  }

  for (const eventName of ["mousedown", "mousemove", "mouseup", "dblclick", "auxclick", "dragstart", "touchstart", "touchmove", "touchend", "keyup", "keypress", "wheel"] as const) {
    document.addEventListener(eventName, blockPageEvent, true);
  }
}

function handleLayouterEvent(event: Event): void {
  if (!session.status().editModeEnabled) return;

  if (textEditState && handleTextEditEvent(event)) return;

  if (event instanceof MouseEvent && event.type === "contextmenu") {
    handleContextMenu(event);
  } else if (event instanceof MouseEvent && event.type === "click") {
    handlePageClick(event);
  } else if (event instanceof PointerEvent) {
    handlePointerEvent(event);
  } else if (event instanceof KeyboardEvent && event.type === "keydown") {
    handleKeyDown(event);
  }

  if (isRightClickPrelude(event)) {
    stopPageEvent(event);
  } else {
    blockPageEvent(event);
  }
}

function handlePointerEvent(event: PointerEvent): void {
  if (textEditState) return;

  if (selectionDragStart && event.pointerId === selectionDragStart.pointerId) {
    handleSelectionDrag(event);
    return;
  }

  if (pendingHandleDrag && event.pointerId === pendingHandleDrag.pointerId) {
    handlePendingHandleDrag(event);
    return;
  }

  if (resizeDragStart && event.pointerId === resizeDragStart.pointerId) {
    handleResizeDrag(event);
    return;
  }

  if (draggedElements.length > 0) {
    if (event.type === "pointermove") handlePointerMove(event);
    if (event.type === "pointerup") handlePointerUp(event);
    if (event.type === "pointercancel") cancelDrag();
    return;
  }

  if (event.type === "pointerdown" && isHandleEvent(event)) {
    handlePointerDown(event);
    return;
  }

  if (event.type === "pointerdown" && isResizeHandleEvent(event)) {
    handleResizePointerDown(event);
    return;
  }

  if (isExtensionEvent(event)) return;

  if (event.type === "pointermove") {
    handlePointerMove(event);
  } else if (event.type === "pointerdown") {
    handlePointerDown(event);
  } else if (event.type === "pointerup") {
    handlePointerUp(event);
  } else if (event.type === "pointercancel") {
    cancelDrag();
  }
}

function handlePointerMove(event: PointerEvent): void {
  if (draggedElements.length === 0) {
    if (selectedElements.size === 0) setHover(elementFromPoint(event.clientX, event.clientY));
    syncHandle();
    return;
  }

  if (actionMode === "free") {
    updateFreeDrag(event);
    return;
  }

  const target = elementFromPoint(event.clientX, event.clientY);
  const nextTarget = target && !draggedElements.includes(target) ? target : null;
  setDrop(nextTarget, event);
}

function handlePointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;

  if (event.shiftKey && !isExtensionEvent(event)) {
    selectionDragStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    closeMenus();
    clearHover();
    showMarquee(event.clientX, event.clientY, 0, 0);
    return;
  }

  if (selectedElements.size === 0 || !isHandleEvent(event)) return;

  pendingHandleDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  handle.setPointerCapture(event.pointerId);
}

function beginHandleDrag(event: PointerEvent): void {
  if (selectedElements.size === 0) return;

  draggedElements = getSelectedElementsInDocumentOrder();
  for (const element of draggedElements) element.classList.add(GHOST_CLASS);
  closeMenus();
  clearHover();
  suppressHandleClick = true;

  if (actionMode === "free") {
    freeDragStart = {
      x: event.clientX,
      y: event.clientY,
      initialTransforms: new Map(draggedElements.map((element) => [element, getElementTransform(element)]))
    };
  }
}

function handlePendingHandleDrag(event: PointerEvent): void {
  if (!pendingHandleDrag) return;

  if (event.type === "pointerup" || event.type === "pointercancel") {
    if (handle.hasPointerCapture(pendingHandleDrag.pointerId)) handle.releasePointerCapture(pendingHandleDrag.pointerId);
    pendingHandleDrag = null;
    return;
  }

  if (event.type !== "pointermove") return;

  const dx = event.clientX - pendingHandleDrag.x;
  const dy = event.clientY - pendingHandleDrag.y;
  if (Math.hypot(dx, dy) < 4) return;

  beginHandleDrag(event);
  pendingHandleDrag = null;
  handlePointerMove(event);
}

function handlePointerUp(event: PointerEvent): void {
  if (draggedElements.length === 0) return;

  if (actionMode === "free") {
    commitFreeDrag(event);
  } else if (dropTarget && dropPosition) {
    if (draggedElements.length === 1) {
      session.move(draggedElements[0], dropTarget, dropPosition);
    } else {
      session.moveGroup(draggedElements, dropTarget, dropPosition);
    }
  }

  for (const element of draggedElements) element.classList.remove(GHOST_CLASS);
  draggedElements = [];
  freeDragStart = null;
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  clearDrop();
  syncHandle();
}

function handleResizePointerDown(event: PointerEvent): void {
  const selectedElement = getSingleSelectedElement();
  if (event.button !== 0 || !selectedElement || !(selectedElement instanceof HTMLElement)) return;
  const corner = getResizeCorner(event);
  if (!corner) return;

  const rect = selectedElement.getBoundingClientRect();
  resizeDragStart = {
    borderRadiusStyle: selectedElement.style.borderRadius,
    corner,
    height: rect.height,
    maxRadius: Math.min(rect.width, rect.height) / 2,
    pointerId: event.pointerId,
    radius: getElementBorderRadius(selectedElement),
    width: rect.width,
    x: event.clientX,
    y: event.clientY
  };
  closeMenus();
  clearHover();
  getResizeHandle(corner)?.setPointerCapture(event.pointerId);
}

function handleResizeDrag(event: PointerEvent): void {
  const selectedElement = getSingleSelectedElement();
  if (!resizeDragStart || !selectedElement || !(selectedElement instanceof HTMLElement)) return;

  if (event.type === "pointercancel") {
    releaseResizePointerCapture();
    resizeDragStart = null;
    syncHandle();
    return;
  }

  if (event.type !== "pointermove" && event.type !== "pointerup") return;

  if (resizeHandleMode === "borderRadius") {
    handleBorderRadiusDrag(event, selectedElement);
    return;
  }

  const next = calculateResize({
    corner: resizeDragStart.corner,
    deltaX: event.clientX - resizeDragStart.x,
    deltaY: event.clientY - resizeDragStart.y,
    preserveAspectRatio: event.shiftKey,
    startHeight: resizeDragStart.height,
    startWidth: resizeDragStart.width
  });

  if (event.type === "pointermove") {
    selectedElement.style.width = `${next.width}px`;
    selectedElement.style.height = `${next.height}px`;
    syncHandle();
    return;
  }

  const width = `${next.width}px`;
  const height = `${next.height}px`;
  selectedElement.style.width = `${resizeDragStart.width}px`;
  selectedElement.style.height = `${resizeDragStart.height}px`;
  session.resize(selectedElement, { height, width });
  releaseResizePointerCapture();
  resizeDragStart = null;
  syncHandle();
}

function handleBorderRadiusDrag(event: PointerEvent, selectedElement: HTMLElement): void {
  if (!resizeDragStart) return;
  const next = calculateBorderRadius({
    corner: resizeDragStart.corner,
    deltaX: event.clientX - resizeDragStart.x,
    deltaY: event.clientY - resizeDragStart.y,
    maxRadius: resizeDragStart.maxRadius,
    startRadius: resizeDragStart.radius
  });

  if (event.type === "pointermove") {
    selectedElement.style.borderRadius = `${next}px`;
    syncHandle();
    return;
  }

  const borderRadius = `${next}px`;
  selectedElement.style.borderRadius = resizeDragStart.borderRadiusStyle;
  session.borderRadius(selectedElement, borderRadius);
  releaseResizePointerCapture();
  resizeDragStart = null;
  syncHandle();
}

function handleContextMenu(event: MouseEvent): void {
  if (!isExtensionEvent(event)) closeMenus();
}

function handlePageClick(event: MouseEvent): void {
  if (textEditState) return;

  if (suppressSelectionClick) {
    suppressSelectionClick = false;
    return;
  }

  if (!canSelectByClick({ selectionCount: selectedElements.size, isExtensionTarget: isExtensionEvent(event), isShiftKey: event.shiftKey })) return;

  const target = event.target instanceof Element && !event.target.closest(`[${EXTENSION_ROOT_ATTR}]`)
    ? event.target
    : elementFromPoint(event.clientX, event.clientY);
  if (!target || isCriticalElement(target) || !isVisibleElement(target)) return;

  if (event.shiftKey) {
    toggleElementSelection(target);
  } else {
    selectElements([target]);
  }
}

function handleKeyDown(event: KeyboardEvent): void {
  if (textEditState) return;

  const historyShortcut = getHistoryShortcut(event);
  if (historyShortcut && !hasActiveInteraction()) {
    if (historyShortcut === "undo") {
      session.undo();
    } else {
      session.redo();
    }
    syncHandle();
    return;
  }

  if (event.key === "Escape") {
    cancelDrag();
    closeMenus();
    clearDrop();
    clearHover();
    clearSelection();
    return;
  }

  if (event.key === "Delete" && selectedElements.size > 0 && !hasActiveInteraction()) {
    if (session.deleteElements(getSelectedElementsInDocumentOrder())) {
      clearSelection();
      closeMenus();
      clearDrop();
      clearHover();
    }
    return;
  }

  if (isTextEditStartKey(event) && selectedElements.size === 1 && !hasActiveInteraction()) {
    const selectedElement = getSingleSelectedElement();
    if (selectedElement instanceof HTMLElement && isAllowedTextEdit(selectedElement)) {
      startTextEdit(selectedElement);
      applyTextEditKey(event);
    }
    return;
  }

  if (event.key === "Tab" && selectedElements.size > 0 && draggedElements.length === 0) {
    actionMode = toggleEditActionMode(actionMode);
    closeMenus();
    syncSelectionMode();
    syncHandle();
  }
}

function hasActiveInteraction(): boolean {
  return Boolean(draggedElements.length > 0 || pendingHandleDrag || resizeDragStart || selectionDragStart || textEditState);
}

function isTextEditStartKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}

function blockPageEvent(event: Event): void {
  if (isExtensionEvent(event)) return;
  if (isRightClickPrelude(event)) {
    stopPageEventWhenEditModeActive(event, session.status().editModeEnabled);
    return;
  }

  blockPageEventWhenEditModeActive(event, session.status().editModeEnabled);
}

function stopPageEvent(event: Event): void {
  if (isExtensionEvent(event)) return;
  stopPageEventWhenEditModeActive(event, session.status().editModeEnabled);
}

function openHandleMenu(): void {
  if (selectedElements.size === 0) return;
  const singleSelectedElement = getSingleSelectedElement();
  const menuButtons = [
    makeMenuButton("Move in DOM", () => {
      actionMode = "dom";
      closeMenus();
      syncSelectionMode();
      syncHandle();
    }),
    makeMenuButton("Free position", () => {
      actionMode = "free";
      closeMenus();
      syncSelectionMode();
      syncHandle();
    })
  ];

  if (singleSelectedElement instanceof HTMLElement) {
    menuButtons.push(makeMenuButton(
      resizeHandleMode === "resize" ? "Use radius handles" : "Use resize handles",
      () => {
        resizeHandleMode = resizeHandleMode === "resize" ? "borderRadius" : "resize";
        closeMenus();
        syncHandle();
      }
    ));
  }

  if (singleSelectedElement instanceof HTMLElement && isAllowedTextEdit(singleSelectedElement)) {
    menuButtons.push(makeMenuButton("Change text", () => {
      startTextEdit(singleSelectedElement);
    }));
  }

  if (singleSelectedElement && singleSelectedElement.childNodes.length > 0) {
    menuButtons.push(makeMenuButton("Remove wrapper", () => {
      if (session.unwrapElement(singleSelectedElement)) {
        clearSelection();
        clearDrop();
        clearHover();
      }
      closeMenus();
    }));
  }

  handleMenuOpen = true;
  handleMenu.replaceChildren(...menuButtons);

  const rect = handle.getBoundingClientRect();
  positionMenu(handleMenu, rect.left, rect.bottom + 6);
}

function makeMenuButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

function createMenu(className: string): HTMLDivElement {
  const menu = document.createElement("div");
  menu.className = className;
  menu.setAttribute(EXTENSION_ROOT_ATTR, "true");
  menu.hidden = true;
  document.documentElement.append(menu);
  return menu;
}

function createHandle(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "layouter-handle";
  button.ariaLabel = "Move selected element";
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" /></svg>`;
  button.setAttribute(EXTENSION_ROOT_ATTR, "true");
  button.hidden = true;
  button.addEventListener("pointerup", (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (suppressHandleClick) {
      suppressHandleClick = false;
      return;
    }

    if (handleMenuOpen) {
      closeMenus();
    } else {
      openHandleMenu();
    }
  });
  document.documentElement.append(button);
  return button;
}

function createResizeHandles(): Record<ResizeCorner, HTMLButtonElement> {
  return {
    ne: createResizeHandle("ne"),
    nw: createResizeHandle("nw"),
    se: createResizeHandle("se"),
    sw: createResizeHandle("sw")
  };
}

function createMarquee(): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "layouter-selection-marquee";
  element.setAttribute(EXTENSION_ROOT_ATTR, "true");
  element.hidden = true;
  document.documentElement.append(element);
  return element;
}

function createEditToggle(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "layouter-edit-toggle";
  button.setAttribute(EXTENSION_ROOT_ATTR, "true");
  button.title = "Toggle Layouter Edit Mode";
  button.ariaLabel = "Toggle Layouter Edit Mode";
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setEditMode(!session.status().editModeEnabled);
  });
  document.documentElement.append(button);
  return button;
}

function syncEditToggle(): void {
  editToggle.dataset.editMode = session.status().editModeEnabled ? "on" : "off";
  editToggle.title = session.status().editModeEnabled ? "Turn Layouter off" : "Turn Layouter on";
  editToggle.ariaLabel = editToggle.title;
}

function showMarquee(x: number, y: number, width: number, height: number): void {
  marquee.hidden = false;
  marquee.style.left = `${x}px`;
  marquee.style.top = `${y}px`;
  marquee.style.width = `${width}px`;
  marquee.style.height = `${height}px`;
}

function hideMarquee(): void {
  marquee.hidden = true;
}

function createResizeHandle(corner: ResizeCorner): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `layouter-resize-handle layouter-resize-${corner}`;
  button.setAttribute(EXTENSION_ROOT_ATTR, "true");
  button.dataset.resizeCorner = corner;
  button.hidden = true;
  button.ariaLabel = `Resize ${corner.toUpperCase()}`;
  document.documentElement.append(button);
  return button;
}

function positionMenu(menu: HTMLElement, x: number, y: number): void {
  menu.hidden = false;
  menu.style.left = `${Math.max(8, x)}px`;
  menu.style.top = `${Math.max(8, y)}px`;
}

function closeMenus(): void {
  handleMenu.hidden = true;
  handleMenuOpen = false;
}

function startTextEdit(element: HTMLElement): void {
  cancelTextEdit();
  const originalChildren = [...element.childNodes];
  const initialText = element.textContent ?? "";
  textEditState = { draftText: initialText, element, originalChildren, selectionAll: true };
  closeMenus();
  clearHover();
  hideResizeHandles();
  element.replaceChildren(document.createTextNode(initialText));
  element.classList.add("layouter-text-editing");
  element.focus();
  selectElementText(element);
  syncTextEditToolbar();
}

function commitTextEdit(): void {
  if (!textEditState) return;
  const { element, originalChildren } = textEditState;
  const nextText = textEditState.draftText;
  element.classList.remove("layouter-text-editing");
  textEditState = null;
  textEditToolbar.hidden = true;
  session.replaceText(element, nextText, originalChildren);
  clearSelection();
}

function cancelTextEdit(): void {
  if (!textEditState) return;
  const { element, originalChildren } = textEditState;
  element.classList.remove("layouter-text-editing");
  element.replaceChildren(...originalChildren);
  textEditState = null;
  textEditToolbar.hidden = true;
  syncHandle();
}

function syncTextEditToolbar(): void {
  if (!textEditState) return;
  textEditToolbar.replaceChildren(
    makeMenuButton("Confirm text", commitTextEdit),
    makeMenuButton("Cancel", cancelTextEdit)
  );
  const rect = textEditState.element.getBoundingClientRect();
  positionMenu(textEditToolbar, rect.left, rect.bottom + 6);
}

function handleTextEditEvent(event: Event): boolean {
  if (!textEditState) return false;
  if (event instanceof KeyboardEvent) {
    event.preventDefault();
    event.stopImmediatePropagation();
    applyTextEditKey(event);
    return true;
  }
  if (isExtensionEvent(event)) return false;
  if (event instanceof InputEvent) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }
  if (!(event.target instanceof Node) || !textEditState.element.contains(event.target)) return false;
  event.stopImmediatePropagation();
  return true;
}

function applyTextEditKey(event: KeyboardEvent): void {
  if (!textEditState) return;

  if (event.key === "Enter" && !event.shiftKey) {
    commitTextEdit();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
    textEditState.selectionAll = true;
    selectElementText(textEditState.element);
    return;
  }

  if (event.key === "Backspace" || event.key === "Delete") {
    textEditState.draftText = textEditState.selectionAll ? "" : textEditState.draftText.slice(0, -1);
    textEditState.selectionAll = false;
    renderTextEditDraft();
    return;
  }

  if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;

  textEditState.draftText = textEditState.selectionAll ? event.key : `${textEditState.draftText}${event.key}`;
  textEditState.selectionAll = false;
  renderTextEditDraft();
}

function renderTextEditDraft(): void {
  if (!textEditState) return;
  textEditState.element.textContent = textEditState.draftText;
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(textEditState.element);
  range.collapse(false);
  selection.addRange(range);
}

function selectElementText(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectElements(elements: Element[]): void {
  cancelTextEdit();
  clearSelection();
  selectedElements = new Set(normalizeSelection(elements));
  for (const element of selectedElements) element.classList.add(SELECTED_CLASS);
  syncSelectionMode();
  closeMenus();
  clearHover();
  syncHandle();
}

function toggleElementSelection(element: Element): void {
  const next = new Set(selectedElements);
  if (next.has(element)) {
    next.delete(element);
  } else {
    next.add(element);
  }
  selectElements([...next]);
}

function clearSelection(): void {
  for (const element of selectedElements) element.classList.remove(SELECTED_CLASS, ...SELECTED_MODE_CLASSES);
  selectedElements = new Set();
  handle.hidden = true;
  hideResizeHandles();
}

function cleanupTransientState(): void {
  cancelTextEdit();
  cancelDrag();
  closeMenus();
  clearHover();
  clearDrop();
}

function cancelDrag(): void {
  for (const element of draggedElements) element.classList.remove(GHOST_CLASS);
  draggedElements = [];
  pendingHandleDrag = null;
  selectionDragStart = null;
  resizeDragStart = null;
  freeDragStart = null;
  hideMarquee();
}

function getSingleSelectedElement(): Element | null {
  return selectedElements.size === 1 ? [...selectedElements][0] : null;
}

function getSelectedElementsInDocumentOrder(): Element[] {
  return sortElementsInDocumentOrder([...selectedElements]);
}

function normalizeSelection(elements: Element[]): Element[] {
  const eligible = elements.filter(isSelectableElement);
  return sortElementsInDocumentOrder(innermostElements([...new Set(eligible)]));
}

function isSelectableElement(element: Element): boolean {
  return !isCriticalElement(element) && isVisibleElement(element) && !element.closest(`[${EXTENSION_ROOT_ATTR}]`);
}

function handleSelectionDrag(event: PointerEvent): void {
  if (!selectionDragStart) return;

  if (event.type === "pointercancel") {
    selectionDragStart = null;
    hideMarquee();
    return;
  }

  if (event.type === "pointermove") {
    const rect = getSelectionDragRect(event);
    showMarquee(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
    return;
  }

  if (event.type !== "pointerup") return;

  const rect = getSelectionDragRect(event);
  const moved = Math.hypot(event.clientX - selectionDragStart.x, event.clientY - selectionDragStart.y) >= 4;
  selectionDragStart = null;
  hideMarquee();

  if (!moved) return;
  suppressSelectionClick = true;

  const hits = getIntersectingSelectableElements(rect);
  if (hits.length === 0) {
    syncHandle();
    return;
  }

  selectElements([...selectedElements, ...hits]);
}

function getSelectionDragRect(event: PointerEvent): DOMRect {
  if (!selectionDragStart) return new DOMRect(event.clientX, event.clientY, 0, 0);
  const left = Math.min(selectionDragStart.x, event.clientX);
  const top = Math.min(selectionDragStart.y, event.clientY);
  const right = Math.max(selectionDragStart.x, event.clientX);
  const bottom = Math.max(selectionDragStart.y, event.clientY);
  return new DOMRect(left, top, right - left, bottom - top);
}

function getIntersectingSelectableElements(rect: DOMRect): Element[] {
  const candidates = [...document.body.querySelectorAll("*")].filter(isSelectableElement);
  return selectHierarchyCandidates(candidates, rect);
}

function elementFromPoint(x: number, y: number): Element | null {
  const element = document.elementFromPoint(x, y);
  if (!element || element.closest(`[${EXTENSION_ROOT_ATTR}]`)) return null;
  return element;
}

function setHover(element: Element | null): void {
  if (hoveredElement === element) return;
  clearHover();
  if (!element || isCriticalElement(element) || !isVisibleElement(element)) return;
  hoveredElement = element;
  hoveredElement.classList.add(HOVER_CLASS);
}

function clearHover(): void {
  hoveredElement?.classList.remove(HOVER_CLASS);
  hoveredElement = null;
}

function setDrop(target: Element | null, event: PointerEvent): void {
  clearDrop();
  if (!target || draggedElements.length === 0) return;
  const allowed = draggedElements.length === 1
    ? isAllowedMove(draggedElements[0], target)
    : isAllowedGroupMove(draggedElements, target);
  if (!allowed) return;

  dropTarget = target;
  dropPosition = inferDropPosition(target, event);

  if (dropPosition === "before") target.classList.add(DROP_BEFORE_CLASS);
  if (dropPosition === "after") target.classList.add(DROP_AFTER_CLASS);
  if (dropPosition === "inside") target.classList.add(DROP_INSIDE_CLASS);
}

function clearDrop(): void {
  dropTarget?.classList.remove(DROP_BEFORE_CLASS, DROP_AFTER_CLASS, DROP_INSIDE_CLASS);
  dropTarget = null;
  dropPosition = null;
}

function inferDropPosition(target: Element, event: PointerEvent): DropPosition {
  const rect = target.getBoundingClientRect();
  const y = event.clientY - rect.top;
  if (y < rect.height * 0.25) return "before";
  if (y > rect.height * 0.75) return "after";
  return "inside";
}

function updateFreeDrag(event: PointerEvent): void {
  if (draggedElements.length === 0 || !freeDragStart) return;
  const { dx, dy } = getFreeDragDelta(event);
  for (const element of draggedElements) {
    if (!(element instanceof HTMLElement)) continue;
    const initialTransform = freeDragStart.initialTransforms.get(element) ?? "";
    element.style.transform = `${initialTransform} translate(${dx}px, ${dy}px)`.trim();
  }
  syncHandle();
}

function commitFreeDrag(event: PointerEvent): void {
  if (draggedElements.length === 0 || !freeDragStart) return;
  const { dx, dy } = getFreeDragDelta(event);
  const changes = draggedElements.flatMap((element) => {
    if (!(element instanceof HTMLElement)) return [];
    const initialTransform = freeDragStart?.initialTransforms.get(element) ?? "";
    const transform = `${initialTransform} translate(${dx}px, ${dy}px)`.trim();
    element.style.transform = initialTransform;
    return [{ element, transform }];
  });
  if (changes.length === 1) {
    session.transform(changes[0].element, changes[0].transform);
  } else {
    session.transformGroup(changes);
  }
}

function getFreeDragDelta(event: PointerEvent): { dx: number; dy: number } {
  if (!freeDragStart) return { dx: 0, dy: 0 };
  return applyFreeMoveAxisLock(
    {
      dx: event.clientX - freeDragStart.x,
      dy: event.clientY - freeDragStart.y
    },
    {
      controlKey: event.ctrlKey,
      shiftKey: event.shiftKey
    }
  );
}

function getElementTransform(element: Element): string {
  return element instanceof HTMLElement ? element.style.transform : "";
}

function getElementBorderRadius(element: HTMLElement): number {
  return parseFloat(window.getComputedStyle(element).borderTopLeftRadius) || 0;
}

function syncHandle(): void {
  if (selectedElements.size === 0) return;
  const rect = getSelectionBounds();
  if (!rect) return;
  handle.hidden = false;
  handle.dataset.actionMode = actionMode;
  handle.title = actionMode === "dom" ? "Move in DOM" : "Free position";
  handle.ariaLabel = handle.title;
  handle.style.left = `${Math.max(8, rect.left + rect.width / 2 - 17)}px`;
  handle.style.top = `${Math.max(8, rect.top - 30)}px`;
  if (selectedElements.size === 1) {
    syncResizeHandles(rect);
  } else {
    hideResizeHandles();
  }
}

function syncSelectionMode(): void {
  for (const element of selectedElements) {
    element.classList.remove(...SELECTED_MODE_CLASSES);
    element.classList.add(getSelectionModeClass(actionMode));
  }
}

function getSelectionBounds(): DOMRect | null {
  const rects = [...selectedElements].map((element) => element.getBoundingClientRect());
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

function isExtensionEvent(event: Event): boolean {
  return event.target instanceof Element && Boolean(event.target.closest(`[${EXTENSION_ROOT_ATTR}]`));
}

function isHandleEvent(event: Event): boolean {
  return event.target instanceof Element && Boolean(event.target.closest(".layouter-handle"));
}

function isResizeHandleEvent(event: Event): boolean {
  return event.target instanceof Element && Boolean(event.target.closest(".layouter-resize-handle"));
}

function getResizeCorner(event: Event): ResizeCorner | null {
  if (!(event.target instanceof Element)) return null;
  const corner = event.target.closest<HTMLElement>(".layouter-resize-handle")?.dataset.resizeCorner;
  return corner === "ne" || corner === "nw" || corner === "se" || corner === "sw" ? corner : null;
}

function getResizeHandle(corner: ResizeCorner): HTMLButtonElement | null {
  return resizeHandles[corner] ?? null;
}

function releaseResizePointerCapture(): void {
  if (!resizeDragStart) return;
  getResizeHandle(resizeDragStart.corner)?.hasPointerCapture(resizeDragStart.pointerId)
    ? getResizeHandle(resizeDragStart.corner)?.releasePointerCapture(resizeDragStart.pointerId)
    : undefined;
}

function syncResizeHandles(rect: DOMRect): void {
  const points: Record<ResizeCorner, { cursor: string; x: number; y: number }> = {
    ne: { cursor: "nesw-resize", x: rect.right, y: rect.top },
    nw: { cursor: "nwse-resize", x: rect.left, y: rect.top },
    se: { cursor: "nwse-resize", x: rect.right, y: rect.bottom },
    sw: { cursor: "nesw-resize", x: rect.left, y: rect.bottom }
  };

  for (const corner of Object.keys(points) as ResizeCorner[]) {
    const point = points[corner];
    const resizeHandle = resizeHandles[corner];
    resizeHandle.hidden = false;
    resizeHandle.dataset.handleMode = resizeHandleMode;
    resizeHandle.title = resizeHandleMode === "resize" ? `Resize ${corner.toUpperCase()}` : `Round corners ${corner.toUpperCase()}`;
    resizeHandle.ariaLabel = resizeHandle.title;
    resizeHandle.style.cursor = point.cursor;
    resizeHandle.style.left = `${point.x - 6}px`;
    resizeHandle.style.top = `${point.y - 6}px`;
  }
}

function hideResizeHandles(): void {
  for (const resizeHandle of Object.values(resizeHandles)) {
    resizeHandle.hidden = true;
  }
}

function isRightClickPrelude(event: Event): boolean {
  if (!(event instanceof MouseEvent) && !(event instanceof PointerEvent)) return false;
  if (event.type === "contextmenu") return false;
  return event.button === 2;
}

function installStyles(): void {
  const style = document.createElement("style");
  style.setAttribute(EXTENSION_ROOT_ATTR, "true");
  style.textContent = `
    .${HOVER_CLASS} {
      outline: 2px solid #2563eb !important;
      outline-offset: 2px !important;
    }

    .${GHOST_CLASS} {
      opacity: 0.45 !important;
      cursor: grabbing !important;
    }

    .${SELECTED_CLASS}.${getSelectionModeClass("dom")} {
      outline: 2px solid #f59e0b !important;
      outline-offset: 2px !important;
    }

    .${SELECTED_CLASS}.${getSelectionModeClass("free")} {
      outline: 2px solid #06b6d4 !important;
      outline-offset: 2px !important;
    }

    .${DROP_BEFORE_CLASS} {
      box-shadow: inset 0 3px 0 #16a34a !important;
    }

    .${DROP_AFTER_CLASS} {
      box-shadow: inset 0 -3px 0 #16a34a !important;
    }

    .${DROP_INSIDE_CLASS} {
      outline: 3px solid #16a34a !important;
      outline-offset: -3px !important;
    }

    .layouter-handle-menu,
    .layouter-text-edit-toolbar {
      position: fixed !important;
      z-index: 2147483647 !important;
      display: grid !important;
      gap: 4px !important;
      min-width: 132px !important;
      padding: 6px !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 6px !important;
      background: #ffffff !important;
      box-shadow: 0 10px 30px rgb(15 23 42 / 0.18) !important;
      font: 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }

    .layouter-handle-menu[hidden],
    .layouter-text-edit-toolbar[hidden],
    .layouter-handle[hidden],
    .layouter-resize-handle[hidden],
    .layouter-selection-marquee[hidden] {
      display: none !important;
    }

    .layouter-handle-menu button,
    .layouter-text-edit-toolbar button,
    .layouter-handle,
    .layouter-edit-toggle {
      appearance: none !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 5px !important;
      background: #f8fafc !important;
      color: #172033 !important;
      cursor: pointer !important;
      font: 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      padding: 7px 9px !important;
      text-align: left !important;
    }

    .layouter-edit-toggle {
      position: fixed !important;
      z-index: 2147483647 !important;
      left: 0 !important;
      top: 0 !important;
      width: 28px !important;
      height: 28px !important;
      min-width: 28px !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: #64748b !important;
      clip-path: polygon(0 0, 100% 0, 0 100%) !important;
      cursor: pointer !important;
      opacity: 0.45 !important;
      text-align: initial !important;
    }

    .layouter-edit-toggle:hover,
    .layouter-edit-toggle:focus-visible {
      opacity: 0.9 !important;
      outline: 2px solid #ffffff !important;
      outline-offset: 1px !important;
    }

    .layouter-edit-toggle[data-edit-mode="on"] {
      background: #16a34a !important;
      opacity: 0.9 !important;
    }

    .layouter-text-editing {
      outline: 2px solid #22c55e !important;
      outline-offset: 2px !important;
      cursor: text !important;
    }

    .layouter-handle {
      position: fixed !important;
      z-index: 2147483647 !important;
      width: 34px !important;
      height: 28px !important;
      min-width: 34px !important;
      display: inline-grid !important;
      place-items: center !important;
      padding: 0 !important;
      cursor: grab !important;
      background: #f59e0b !important;
      border-color: #d97706 !important;
      color: #111827 !important;
    }

    .layouter-handle[data-action-mode="free"] {
      background: #06b6d4 !important;
      border-color: #0891b2 !important;
      color: #052f3a !important;
    }

    .layouter-handle svg {
      width: 18px !important;
      height: 18px !important;
      display: block !important;
      fill: none !important;
      stroke: currentColor !important;
      stroke-linecap: round !important;
      stroke-linejoin: round !important;
      stroke-width: 2 !important;
      pointer-events: none !important;
    }

    .layouter-resize-handle {
      appearance: none !important;
      position: fixed !important;
      z-index: 2147483647 !important;
      width: 12px !important;
      height: 12px !important;
      padding: 0 !important;
      border: 2px solid #ffffff !important;
      border-radius: 50% !important;
      background: #2563eb !important;
      box-shadow: 0 1px 5px rgb(15 23 42 / 0.25) !important;
    }

    .layouter-resize-handle[data-handle-mode="borderRadius"] {
      background: #16a34a !important;
    }

    .layouter-selection-marquee {
      position: fixed !important;
      z-index: 2147483646 !important;
      pointer-events: none !important;
      border: 1px solid #2563eb !important;
      background: rgb(37 99 235 / 0.12) !important;
      box-shadow: 0 0 0 1px rgb(255 255 255 / 0.8) inset !important;
    }
  `;
  document.documentElement.append(style);
}
