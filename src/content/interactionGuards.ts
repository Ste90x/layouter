export function blockPageEventWhenEditModeActive(event: Event, editModeEnabled: boolean): void {
  if (!editModeEnabled) return;

  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
}

export function stopPageEventWhenEditModeActive(event: Event, editModeEnabled: boolean): void {
  if (!editModeEnabled) return;

  event.stopImmediatePropagation();
}
