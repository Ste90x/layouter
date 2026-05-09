# Layouter Context

## Glossary

### Prototype Session

A temporary page-editing session for trying layout changes on the current tab. Changes live only in the current document and are discarded on reload.

### Edit Mode

The mode where Layouter listens for layout-prototyping gestures on the page. When Edit Mode is off, the page should behave normally.

### In-Page Toggle

The always-available page control that turns Edit Mode on or off without opening the extension popup.

### Move Operation

A user action that repositions one or more visible page elements somewhere else in the same DOM tree during a Prototype Session.

### Delete Operation

A user action that removes the current selection from the DOM during a Prototype Session. A Delete Operation is temporary and can be undone within the session.

### Unwrap Operation

A user action that removes a single selected wrapper element from the DOM while preserving its child nodes in the wrapper's original position. An Unwrap Operation is temporary and can be undone within the session.

### Text Edit Operation

A user action that replaces a single selected element's text during a Prototype Session. A Text Edit Operation is temporary and can be undone within the session.

### Drop Position

The requested relationship between the moved element and the drop target: before the target, after the target, or inside the target.

### Selected Element

A single page element currently chosen for modification during Edit Mode.

### Selected Group

Two or more page elements currently chosen for movement during Edit Mode. A Selected Group moves together until Escape clears the selection.

### Selection Candidate Hierarchy

The ordering Layouter uses when a selection gesture touches nested page elements. Group selection prefers the smallest useful layout boxes and promotes to a parent only when the gesture covers most of that parent.

### Selection Lock

The state after a Selected Element or Selected Group is chosen. While locked, regular clicks cannot select or modify other page elements. Shift-click and Shift-drag may still add to or remove from the Selected Group until Escape clears the selection.

### Free Position Move

A temporary visual move that repositions the selection with CSS transforms during a Prototype Session.

### Axis-Locked Free Move

A Free Position Move constrained to exactly one movement axis by a modifier key.

### Resize Operation

A temporary size change that modifies a single Selected Element's inline width and height during a Prototype Session.

### Border Radius Operation

A temporary change to a single Selected Element's corner roundness during a Prototype Session.
