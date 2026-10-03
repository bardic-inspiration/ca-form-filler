# DEVELOPER.md

Maintainer reference for `field-report.html`. Name and function only.
`node tools/lint.mjs` fails when this file drifts from the code (sections, line
ranges, functions, events) or when errors bypass `notify` (§12);
`node tools/lint.mjs --file-map` prints table 1.

## 1. File map

| Section | Lines |
| --- | --- |
| core — config defaults | 14–84 |
| core — utilities | 85–151 |
| core — report model | 152–222 |
| core — numbering | 223–245 |
| core — inheritance | 246–295 |
| core — tags and filters | 296–324 |
| core — photo display | 325–510 |
| core — undo history | 511–570 |
| core — file formats | 571–698 |
| core — messages and debug log | 699–848 |
| css — tokens and base | 849–900 |
| css — toolbar and page | 901–936 |
| css — header form | 937–972 |
| css — general observations | 973–984 |
| css — observation table | 985–1050 |
| css — photos | 1051–1132 |
| css — reminders | 1133–1140 |
| css — popovers, dialogs, panel | 1141–1218 |
| css — photo editor | 1219–1251 |
| css — password gate | 1252–1264 |
| css — responsive | 1265–1302 |
| css — print | 1303–1364 |
| markup — shell | 1365–1414 |
| app — dom helpers and icons | 1415–1567 |
| app — state and events | 1568–1662 |
| app — dialogs and popovers | 1663–1741 |
| app — floating toolbar | 1742–1789 |
| app — notify: messages and debug log | 1790–1862 |
| app — render: toolbar and header | 1863–2112 |
| app — render: general observations | 2113–2168 |
| app — render: observations table | 2169–2378 |
| app — render: filters and reminders | 2379–2470 |
| app — sorting and column resize | 2471–2560 |
| app — photos: import, cells, drag and drop | 2561–2780 |
| app — photos: pointer drag | 2781–2947 |
| app — photos: selection, resize and cell menu | 2948–3160 |
| app — photos: in-cell crop and rotate | 3161–3287 |
| app — photos: flatten and markup drawing | 3288–3500 |
| app — photo editor | 3501–4033 |
| app — persistence: files | 4034–4184 |
| app — persistence: autosave (IndexedDB) | 4185–4273 |
| app — export: CSV | 4274–4281 |
| app — export: PDF (print) | 4282–4482 |
| app — config panel | 4483–4672 |
| app — office defaults (developer stub) | 4673–4687 |
| app — password gate | 4688–4713 |
| app — keyboard, window events and init | 4714–4816 |

## 2. Modules

`<script id="core">` is pure (no DOM at load) and is loaded by the Node tests.
`<script id="app">` holds everything that touches the DOM. Both share one
global scope. `Core` (frozen object at the end of core) lists the core API.

### core — utilities

| Function | Description |
| --- | --- |
| `uuid() → string` | Random UUID (falls back to a timestamp id). |
| `clone(value) → any` | Deep copy via JSON. |
| `pad(n, width) → string` | Zero-pad a number. |
| `isoDate(date = new Date()) → string` | Local date as `YYYY-MM-DD`. |
| `formatDate(iso) → string` | `YYYY-MM-DD` → `M/D/YYYY`. |
| `toLetters(n) → string` | 1 → A, 27 → AA. |
| `moveById(list, id, beforeId) → list` | Move item `id` before `beforeId` (end when null), in place. |
| `isEmbeddedWebView(userAgent) → boolean` | Android WebView (`; wv)`): pickers, print and downloads may be ignored. |
| `sha256Hex(text) → Promise<string>` | SHA-256 of the UTF-8 text, lower-case hex. |
| `passwordMatches(text) → Promise<boolean>` | `sha256Hex(text)` equals `PASSWORD_SHA256` (the unlock password's hash). |

### core — report model

| Function | Description |
| --- | --- |
| `createReport(options = {}) → report` | New report; `options.config`, `options.tags`, `options.today`. |
| `createObservation(report) → Observation` | Blank observation for the current report number. |
| `createGeneralObservation() → object` | `{ id, text, images, display }`. |
| `createPhoto(dataUrl, fileName) → Photo` | Photo record with no crop or markup. |
| `setStatus(item, status, date) → item` | Set complete (with date) or incomplete (clears date). |
| `reportTitle(report) → string` | "Field Observation Report 01". |

### core — numbering

| Function | Description |
| --- | --- |
| `formatToken(value, fmt) → string` | Apply one token format (`02`, `A`). |
| `formatItemNumber(pattern, reportNumber, itemNumber) → string` | Expand a numbering pattern. |
| `renumber(report) → report` | Recompute `observation.number` for every current item. |

### core — inheritance

| Function | Description |
| --- | --- |
| `nextReportFrom(previous, options = {}) → report` | Next report: copies header/tags/config, carries incomplete items when `carryForward`. |
| `reminderGroups(report, items) → [{ sourceReport, title, items }]` | Inherited items grouped by source report, newest first. |

### core — tags and filters

| Function | Description |
| --- | --- |
| `allItems(report) → Observation[]` | Current plus inherited items. |
| `tagUsage(report, tagId) → number` | Items carrying the tag. |
| `deleteTag(report, tagId) → report` | Remove tag and strip it from all items. |
| `matchesFilter(item, filter) → boolean` | Screen filter test (`status`, any of `tagIds`). |
| `printColumnWidths(report) → number[]` | PDF column widths (template or on-screen). |

### core — photo display

Cell `kind` is `obs` (table row) or `gen` (general observation), the prefix of
a photo cell target (`obs:<id>`, `gen:<id>`).

Photo sizes: `PHOTO_SIZE_PRESETS` (`[{ width, label }]`: 100 Full, 50 Half,
`100 / 3` Third) is the single source of preset sizes; `PHOTO_WIDTH_STEPS` is
its widths. Photo widths subtract their share of the gaps (css — photos), so 2
halves or 3 thirds fill a row exactly.

Automatic and manual cells: a cell is automatic (`display.photoMode` unset)
until the user sizes a photo, then manual (`'manual'`). An automatic cell
takes every width from an arrangement (`autoArrangements()`, the chosen
`display.photoArrangement` or the default) and ignores photo overrides; a
manual cell uses each photo's override, else the cell default. There is no
toggle: `makePhotoCellManual()` runs on a handle drag or a default-width pick,
`setPhotoArrangement()` on a Layout pick.

| Function | Description |
| --- | --- |
| `validPhotoWidth(value) → number\|null` | A number in 10–100, else null. A `PHOTO_WIDTH_STEPS` value is kept exact (a third is `100 / 3`); any other width is a freeform override, rounded to a whole %. |
| `snapPhotoWidth(pct) → number` | Clamp to 10–100; snap to `PHOTO_WIDTH_STEPS` within `PHOTO_WIDTH_SNAP` (4) %, else round. |
| `photoWidthLabel(pct) → string` | Width as a whole %, e.g. `'33%'` for a third. |
| `cellDisplay(display, kind) → { photoWidth, photoAlign, photoMode, photoArrangement }` | Cell defaults: 100 %, `left` (table) or `center` (general), `auto`, no arrangement chosen (`null`). |
| `autoArrangements(count) → [{ key, rows, widths }]` | Plausible layouts for `count` photos: rows of 2 (lone last photo Full; the default, first), rows of 1, rows of 3 (remainder Full or 2 Halves); duplicates dropped. `rows`: photos per row; `key`: `rows.join('-')`; `widths`: per photo, from `PHOTO_SIZE_PRESETS`. |
| `cellArrangement(cell, count) → arrangement\|null` | An automatic cell's arrangement: `cell.photoArrangement` if it is one of `autoArrangements(count)`, else the default; null for a manual cell or no photos. |
| `effectivePhotoWidth(photo, cell) → number` | `photo.display.width` if valid, else the cell's `photoWidth`. |
| `photoMaxHeightIn(config, kind) → number` | `photoMaxHeightTable` / `photoMaxHeightGeneral`, clamped to 1–6 in. |
| `printPhotoCellWidthIn(report, kind) → number` | Photo cell content width in the PDF (inches; mirrors css — print). |
| `photoScale(report, kind) → { maxHeightIn, gapIn, capRatio, gapRatio }` | PDF height cap and photo gap (inches), and each as a multiple of `printPhotoCellWidthIn()`, so the editor can draw the PDF's layout at any cell width. |
| `photoLayout(report, kind, display, ids) → { ...photoScale(), align, arrangement, photos: [{ id, width }] }` | Layout of one photo cell, shared by screen and print: the editor is a scaled copy of the PDF. Widths come from `cellArrangement()` (its `key` is `arrangement`) or, in a manual cell (`arrangement: null`), `effectivePhotoWidth()`. |
| `setPhotoArrangement(report, display, ids, key)` | Make the cell automatic with arrangement `key` and clear its photos' width overrides. |
| `makePhotoCellManual(report, kind, display, ids)` | Make an automatic cell manual, writing each photo's current width as its override, so nothing moves; no-op on a manual cell. |
| `photoCountChanged(report, display, ids)` | After photos are added to or removed from a cell: an automatic cell drops its chosen arrangement (back to the default) and the overrides of photos moved in; a manual cell is unchanged. |
| `clearPhotoWidths(report, ids)` | Delete `display.width` from each photo. |
| `movePhoto(src, dest, photoId, beforeId) → boolean` | Move an id between (or within) photo lists; false when nothing changed. |
| `stepPhoto(list, photoId, delta) → boolean` | Move an id one place earlier (`-1`) or later (`1`) in its list via `movePhoto()`; false at either end. |
| `rotateCrop90(crop, height) → crop\|null` | Crop `{x, y, w, h}` turned 90° clockwise with a photo of the given (pre-rotation) height. |
| `resizeCrop(start, edge, dx, dy, W, H, min) → crop` | Drag a crop: `edge` is `move` or a mix of `n`/`s`/`e`/`w`; stays inside W × H, each side ≥ `min`. |
| `normalizeCrop(crop, W, H) → crop\|null` | Whole px inside the photo; null when it covers the whole photo. |

### core — undo history

| Function | Description |
| --- | --- |
| `History` | Class: `record(snapshot)`, `undo(current)`, `redo(current)`, `canUndo()`, `canRedo()`, `clear()`; limit `HISTORY_LIMIT` (100). |
| `snapshotReport(report) → { json, originals }` | JSON of `SNAPSHOT_KEYS`, `photoDisplay` (each photo's `display`) and `photoEdits` (each photo's `crop`, `markup`); `originals` holds each photo's `original` by reference (not copied). Excludes adding/removing photos, config, ui. |
| `restoreSnapshot(report, snapshot) → report` | Apply a snapshot in place (photo `display`, and `crop`/`markup`/`original` of photos it lists) and renumber. |

### core — file formats

| Function | Description |
| --- | --- |
| `fileBaseName(report) → string` | `YYMMDD_{ProjectNo}_FOR-{NN}`. |
| `referencedPhotoIds(report) → Set` | Photo ids used by general, current and inherited items. |
| `serializeReport(report) → string` | Renumber, drop unreferenced photos, JSON. |
| `migrate(data) → data` | Schema upgrade hook (no steps yet). |
| `normalizeItem(item, report) → Observation` | Fill missing observation fields. |
| `normalizeAttendee(a) → { name, organization }` | Upgrade a plain-name attendee (older files) to the two-field shape. |
| `formatAttendee(a) → string` | `Name (Organization)`, or just the name; used in the printed report. |
| `normalizeReport(data) → report` | Fill defaults for every report field (empty `display` objects on older files). |
| `parseReport(json) → report` | Validate `app`/`schemaVersion`, migrate, normalize. Throws user-facing errors. |
| `csvField(value) → string` | RFC 4180 quoting. |
| `toCSV(report) → string` | BOM + CRLF CSV, current items then inherited. |
| `officeDefaultsJSON(report) → string` | Office-defaults JSON (config + tags). |
| `applyOfficeDefaults(report, json) → report` | Replace config + tags from office-defaults JSON. |

### core — messages and debug log

| Function | Description |
| --- | --- |
| `userError(message) → Error` | Error with `userFacing: true`; `notify` shows its message as-is. |
| `describeError(err) → string` | `Name: message` plus 5 stack lines; data URLs become `data:…`; capped at 1000 chars. |
| `DebugLog` | Class: `add(level, code, detail, time)`, `entries`; keeps the last `DEBUG_LOG_LIMIT` (200). |
| `formatDebugReport({ userAgent, capabilities, entries, now }) → string` | Plain-text debug report (§12). |

### app — dom helpers and icons

| Function | Description |
| --- | --- |
| `h(tag, props, ...children) → Element` | Element builder (`class`, `dataset`, `style`, `on*`, `html`, attributes). |
| `icon(name) → Element` | Inline SVG icon from `ICON_PATHS`. |
| `toast(message, ms = 3200)` | Transient status message. |
| `showBusy(message)` | Full-screen busy overlay. |
| `hideBusy()` | Hide the busy overlay. |
| `readFileAsText(file) → Promise<string>` | File text. |
| `readFileAsDataURL(file) → Promise<string>` | File as data URL. |
| `downloadBlob(name, blob)` | Trigger a download. |
| `expectBrowserWindow(timeoutMs, onMissing) → mark()` | Call `onMissing` if no blur/visibility change (picker or print window) within the timeout. |
| `openFilePicker(input)` | `showPicker()` (fallback `click()`); `notify.warn('FILE_PICKER_UNAVAILABLE')` if no picker appears. |
| `showEnvironmentNotice()` | Inside embedded WebViews: log `EMBEDDED_VIEWER`, show its message in the `#notice` banner. |
| `safeLocalGet(key) → string\|null` | localStorage read, never throws. |
| `safeLocalSet(key, value)` | localStorage write, never throws. |

### app — state and events

| Function | Description |
| --- | --- |
| `emit(name, detail = {})` | Dispatch a custom event on `document`. |
| `on(name, handler)` | Listen for a custom event (handler gets `detail`). |
| `markDirty()` | Flag unsaved changes; emits `report:changed`. |
| `checkpoint(snapshot)` | Record an undo snapshot before a structural change (default: now; pass one taken earlier to record a pre-change state). |
| `beginTextEdit(key)` | Record one undo snapshot per text field edit session. |
| `endTextEdit()` | End the text edit session (focusout). |
| `undo()` | Undo the last change and re-render. |
| `redo()` | Redo and re-render. |
| `loadReport(report, { fileHandle, fileName, dirty })` | Make a report current; emits `report:loaded`. |
| `findObservation(id) → Observation` | Current or inherited item by id. |
| `isInherited(item) → boolean` | Item is in `report.inherited`. |

### app — dialogs and popovers

| Function | Description |
| --- | --- |
| `modal({ title, body, buttons }) → Promise<string>` | Show `#dlg`; resolves with the clicked button value. |
| `confirmDialog(message, opts) → Promise<boolean>` | OK/Cancel dialog. |
| `alertDialog(message, title, hint)` | Message dialog with an optional hint line. Called only by `notify`. |
| `promptDialog(title, label, value) → Promise<string\|null>` | Text input dialog. |
| `showPopover(anchor, content)` | Show `#popover` under an element. |
| `closePopover()` | Hide the popover. |
| `showMenu(anchor, items)` | Popover menu of `{ label, icon, run }`. |

### app — floating toolbar

One `#float-bar` (`role="toolbar"`) floats above one element at a time: today
the selected photo (`photoToolbarActions()`) and crop mode (✓ / ✕). Other
elements can use it by passing their own actions. State lives in `floatBar`
(`{ anchor, observer }`).

| Function | Description |
| --- | --- |
| `showFloatingToolbar(anchor, actions, { label })` | Replace any open toolbar with buttons for `[{ name, label, icon, run, kind, disabled }]` (`kind`: `primary` \| `danger`; `data-action` = `name`) and keep it on `anchor` (ResizeObserver, window resize). |
| `hideFloatingToolbar()` | Hide and empty the toolbar. |
| `placeFloatingToolbar()` | Center it above the anchor (below when there is no room), inside the viewport; hide it once the anchor is removed. |

### app — notify: messages and debug log

| Function | Description |
| --- | --- |
| `notify` | Frozen object: `info(code, opts)`, `warn(code, opts)`, `error(code, opts)`, `log(level, code, detail)` (§12). |
| `messageText(code) → string` | Catalog message plus its "what to do" line. |
| `notifyUser(level, code, { err, detail }) → Promise` | Log, then toast (info/warn) or dialog (error). |
| `reportUncaught(err, detail)` | `window` `error`/`unhandledrejection`: set `data-error`, show `UNEXPECTED_ERROR` once at a time, log the rest. |
| `detectCapabilities() → object` | Fill `capabilities` and log `CAPABILITIES`. |
| `copyDebugInfo()` | Copy `formatDebugReport()` to the clipboard; else download `field-report-debug.txt`. |

### app — render: toolbar and header

| Function | Description |
| --- | --- |
| `buildToolbar()` | Build toolbar buttons from `TOOLBAR_ACTIONS`. |
| `runAction(action, anchor)` | Dispatch a toolbar action. |
| `updateChrome()` | Toolbar title, unsaved dot, page title. |
| `textField(label, value, onInput, opts) → Element` | Labeled input. |
| `headerTextField(label, key, opts) → Element` | Input bound to `report.header[key]`. |
| `chipInput(list, label) → Element` | Chip editor bound to an array. |
| `attendeeInput(list, label) → Element` | Attendee pill editor (name | organization, ×) bound to an array of attendees. |
| `renderHeader()` | Render `#sec-header`. |
| `renderDisclaimer(editing = false) → Element` | Collapsed or editing disclaimer block. |

### app — render: general observations

| Function | Description |
| --- | --- |
| `renderGeneral()` | Render `#sec-general` (list, images, sorting). |

### app — render: observations table

| Function | Description |
| --- | --- |
| `renderObservations()` | Render `#sec-observations` (filters, table, sorting, resizing). |
| `addObservation()` | Append a row and focus its Observation cell. |
| `observationRow(o) → Element` | One table row / mobile card. |
| `deleteItem(item)` | Confirm and delete a current or inherited item. |
| `statusPill(item) → Element` | Incomplete / Complete date / Open from Report NN pill. |
| `showStatusPopover(anchor, item)` | Completion date popover. |
| `tagPills(item) → Element[]` | Tag pills plus "+ Tag". |
| `colorSwatches(selected, onPick) → Element` | Pastel tag color picker. |
| `showTagPicker(anchor, item)` | Tag checklist and new-tag form. |
| `findItemAnchor(item) → Element` | The item's "+ Tag" pill. |
| `refreshItem(item)` | Re-render one item's pills (or the reminders). |

### app — render: filters and reminders

| Function | Description |
| --- | --- |
| `renderFilterBar() → Element` | Status and tag filter controls. |
| `renderFilterBarInPlace()` | Replace the current filter bar. |
| `applyFilter()` | Hide rows that fail `state.filter` (screen only). |
| `remindersVisible() → boolean` | `carryForward` on and inherited items exist. |
| `renderReminders()` | Render `#sec-reminders`. |
| `renderAll()` | Render every section. |

### app — sorting and column resize

| Function | Description |
| --- | --- |
| `makeSortable(container, { item, handle, onMove })` | Pointer-based drag reorder (mouse and touch); calls `onMove(id, beforeId)`. |
| `initColumnResize(table)` | Header border drag / double-click reset; writes `ui.columnWidths`. |

### app — photos: import, cells, drag and drop

| Function | Description |
| --- | --- |
| `loadImage(src) → Promise<HTMLImageElement>` | Cached image decode. |
| `importImageFile(file) → Promise<Photo>` | Downscale to 1600 px JPEG 0.85, add to `report.photos`. |
| `photoList(target) → string[]` | Photo id array for `obs:<id>` or `gen:<id>`. |
| `addPhotosTo(target, files, beforeId)` | Import image files into a cell. |
| `photoCellDisplay(target) → object` | The cell's `display` (observation or general observation). |
| `setPhotoScale(cell, { capRatio, gapRatio })` | Set `--cap-ratio` and `--gap-ratio` on a photo cell (from `photoScale()`). |
| `updatePhotoScale()` | Refresh `--cap-ratio` and `--gap-ratio` on every photo cell (after cap, column width or template changes). |
| `photoCell(target, ids, { readOnly, compact }) → Element` | Photo flow (`photoLayout()`: widths, alignment, cap) with add button or empty state; re-selects `state.selectedPhotoId` once its figure is in the cell. |
| `photoFigure(photo, readOnly, width = 100) → Element` | One photo (`--w` = width %); focusable when editable (no buttons on the photo itself). |
| `trackAspect(img, fig)` | Set `--ar` (width ÷ height) on `fig` whenever `img` loads, so capped photos narrow. |
| `setPhotoImage(img, photo)` | Show the cached flattened preview if fresh; else a blank box of the crop's shape (or the original, if only marked up) until the preview renders. |
| `blankImage(w, h) → string` | Transparent SVG data URL of the given size. |
| `refreshPhotoCell(target)` | Re-render one photo cell. |
| `dropBeforeId(cell, x, y, skipId) → string\|null` | Photo to insert before at a point in the flow (reading order), ignoring `skipId`; null = end. |
| `bindPhotoEvents()` | Click (add, cell ⋯ menu), file input, image file drop, paste, `photo:changed` listeners. |

### app — photos: pointer drag

One Pointer Events gesture for mouse, touch and pen (no HTML5 drag and drop for
photos). Mouse: drag after `PHOTO_MOUSE_SLOP` px. Touch/pen: long-press
`PHOTO_LONG_PRESS_MS` (400 ms) to pick up; moving more than
`PHOTO_TOUCH_SLOP` px first is a scroll. While active, a non-passive
`touchmove` listener stops page scrolling and the page auto-scrolls within
`PHOTO_AUTOSCROLL_EDGE` px of the viewport edge. Gesture state lives in
`photoDrag` (module variable).

| Function | Description |
| --- | --- |
| `bindPhotoDrag()` | `pointerdown` on a photo (not its handles, not in crop mode) in an editable cell starts a gesture; blocks touch scroll and the long-press context menu while dragging. |
| `photoPointerMove(e)` | Start the mouse drag, abandon a touch long-press that moved (scroll), or update an active drag. |
| `startPhotoDrag()` | Pointer capture, `.dragging`, `.photo-ghost` image, short vibration on touch, Escape listener, auto-scroll loop. |
| `updatePhotoDrag()` | Move the ghost; hit-test the cell under the pointer (`.drag-over`), compute `beforeId`, place the indicator. |
| `showPhotoDropIndicator(cell, beforeId, skipId)` | `#drop-indicator` as a vertical bar on the edge of `beforeId` (after the last photo; a line in an empty cell). |
| `hidePhotoDropIndicator()` | Hide `#drop-indicator` and reset its height. |
| `autoScrollPhotoDrag()` | rAF loop: scroll near the top/bottom edge and re-hit-test. |
| `photoDragKeydown(e)` | Escape cancels the drag. |
| `photoPointerUp(e)` | End the gesture; a tap/click (no drag) selects the photo, a drag drops into the cell under the pointer, if any. |
| `endPhotoGesture()` | Clean up without changes (Escape, `pointercancel`, scroll, drop outside a cell). |
| `dropPhoto(from, to, photoId, beforeId)` | `movePhoto()` between cell targets; one undo step when something moved; refresh both cells. |

### app — photos: selection, resize and cell menu

| Function | Description |
| --- | --- |
| `selectPhoto(id)` | Set `state.selectedPhotoId` (null clears) and update every editable photo. |
| `setPhotoSelected(fig, on)` | `.selected` outline, four `.photo-handle` corners (36 px targets), the `.photo-size` width label and the floating toolbar. |
| `photoToolbarActions(fig) → action[]` | Crop, Rotate 90°, Edit photo, Remove photo; with `photoMoveControls` on, Move photo earlier / later between Rotate and Edit (disabled at the ends of the cell). |
| `stepPhotoIn(target, photoId, delta, focus)` | `stepPhoto()` within a cell; one undo step; refresh the cell; focus follows the photo (`'photo'`) or stays on an enabled move button (`'toolbar'`). |
| `removePhoto(target, photoId)` | Take a photo out of a cell; one undo step. |
| `bindPhotoResize()` | Any pointerdown outside the selected photo and the toolbar applies an open crop and clears the selection; start a resize from a handle; Enter/Space on a focused photo selects it and focuses its toolbar; with `photoMoveControls` on, Alt+↑/← and Alt+↓/→ call `stepPhotoIn()`. |
| `startPhotoResize(e, handle)` | Corner drag: width follows the pointer (twice the move when centered), `snapPhotoWidth()`, live `--w` and label; on release one undo step makes the cell manual (`makePhotoCellManual()`) and writes `photo.display.width`; `pointercancel` reverts. |
| `arrangementDiagram(rows) → Element` | Small SVG of an arrangement's rows (`.layout-diagram`) for the Layout picker. |
| `arrangementLabel(arrangement) → string` | Accessible name of an arrangement: one preset label per row, e.g. `'Half, Full'`. |
| `showPhotoCellMenu(anchor, target)` | Cell ⋯ popover: Layout (`.layout-picker`, one button per `autoArrangements()` entry, shown for 2+ arrangements; pressed = the current one of an automatic cell; picking calls `setPhotoArrangement()`), default width (Full / Half / Third, from `PHOTO_SIZE_PRESETS`; makes the cell manual; pressed only when manual), alignment (left/center), "Reset photos to cell default" (clears overrides); each change is one undo step. |

### app — photos: in-cell crop and rotate

Crop mode (`photoCrop`: `{ fig, photo, target, W, H, box }`, or null) shows
the full photo at its current width with the outside dimmed (`.crop-shade`),
and a `.crop-box` with eight `.crop-handle`s (`data-edge`). Resize handles
and pointer drag are off; the toolbar shows only ✓ / ✕. ✓, Enter or a
pointerdown outside the photo applies; ✕, Escape, undo or redo discards.

| Function | Description |
| --- | --- |
| `startPhotoCrop(fig)` | Enter crop mode on a photo (box = `photo.crop` or the whole photo). |
| `placeCropBox()` | Position the crop box and the undimmed window (% of the photo). |
| `startCropDrag(e)` | Handle or box drag via `resizeCrop()`, at least `CROP_MIN_PX` (24) screen px; `pointercancel` reverts. |
| `finishPhotoCrop(apply)` | Leave crop mode; on apply write `normalizeCrop()` to `photo.crop` (one undo step when changed); re-render the cell. |
| `bindPhotoCrop()` | `pointerdown` on the crop box starts `startCropDrag()`. |
| `rotatePhoto(photoId)` | `rotatePhotoData()` on the photo; one undo step; emits `photo:changed`. |

### app — photos: flatten and markup drawing

| Function | Description |
| --- | --- |
| `flattenPhoto(photo, maxSide, quality) → Promise<string>` | Crop + markup + downscale to JPEG; cached per photo and size. |
| `flatKey(photo, quality) → string` | Cache key for the photo's current original, crop and markup. |
| `freshFlattened(photo, maxSide, quality) → string \| null` | Finished flattened URL matching the photo as it is now, else null. |
| `cachedFlattened(photo, maxSide) → string` | Last flattened URL, else the original. |
| `renderFlattened(photo, maxSide, quality) → Promise<string>` | Uncached flatten. |
| `drawShapes(ctx, shapes)` | Draw a markup array. |
| `textLines(s) → string[]` | Text shape lines. |
| `drawHaloText(ctx, text, x, y, size, color)` | Text with a white halo. |
| `drawShape(ctx, s)` | Draw one shape (see §9). |
| `shapeBounds(s, ctx) → {x, y, w, h}` | Shape bounding box. |
| `distToSegment(px, py, x1, y1, x2, y2) → number` | Point-to-segment distance. |
| `hitShape(s, x, y, tol, ctx) → boolean` | Hit test. |
| `translateShape(s, dx, dy)` | Move a shape. |
| `rotateShape90(s, height, ctx)` | Rotate a shape 90° clockwise with the photo. |
| `rotatePhotoData(data, img) → { original, crop, markup }` | Original turned 90° clockwise (re-encoded JPEG), crop and markup follow. Shared by the editor and `rotatePhoto()`. |

### app — photo editor

| Function | Description |
| --- | --- |
| `editorIsOpen() → boolean` | `#photo-editor` is open. |
| `buildEditorToolbar()` | Build tools, colors, widths, commands; bind canvas events. |
| `openPhotoEditor(photoId)` | Open on a working copy of the photo. |
| `closePhotoEditor(save)` | Close; on save write back (one undo step when anything changed) and emit `photo:changed`. |
| `sizeEditorCanvas()` | Match canvas pixels to its box. |
| `fitEditor()` | Fit the image in view. |
| `zoomEditorAt(x, y, factor)` | Zoom around a canvas point. |
| `setEditorTool(tool)` | Select a tool; updates the hint line. |
| `selectedShape() → shape\|null` | Selected shape. |
| `setEditorColor(hex)` | Current color; recolors the selection. |
| `strokeWidth(index) → number` | Stroke width in image px for Thin/Medium/Thick. |
| `setEditorWidth(index)` | Current width; applies to the selection. |
| `editorSnapshot() → object` | `{ original, crop, markup }` copy. |
| `pushEditorUndo()` | Record an editor undo step. |
| `applyEditorSnapshot(snap)` | Restore an editor step. |
| `updateEditorButtons()` | Enable/disable undo, redo, delete, reset crop. |
| `editorCommand(cmd)` | zoom-in, zoom-out, fit, rotate, reset-crop, delete, undo, redo, cancel, save. |
| `deleteSelectedShape()` | Remove the selected shape. |
| `rotateEditorPhoto()` | `rotatePhotoData()` on the working copy (an editor undo step). |
| `requestEditorRender()` | Schedule a frame. |
| `renderEditor()` | Draw image, shapes, crop shade, selection. |
| `editorPoint(e) → {x, y}` | Pointer position in image coordinates. |
| `hitTestEditor(p) → shape\|null` | Topmost shape at a point. |
| `newShape(tool, p) → shape` | New shape at a point. |
| `editorPointerDown(e)` | Start draw, move, crop, pan or pinch. |
| `editorPointerMove(e)` | Update the current gesture. |
| `editorPointerUp(e)` | Commit the current gesture. |
| `editorDoubleClick(e)` | Edit text / dimension label. |
| `openTextInput(shape, prop, isNew, justDrawn)` | Floating text box for text or labels. |
| `commitTextInput()` | Apply the floating text box. |
| `editorKeydown(e)` | Undo/redo, Delete, Space-pan, +/- zoom. |
| `editorKeyup(e)` | End Space-pan. |

### app — persistence: files

| Function | Description |
| --- | --- |
| `confirmDiscard() → Promise<boolean>` | Ask before losing unsaved changes. |
| `pickFileViaInput() → Promise<File\|null>` | Fallback picker (`#file-json`). |
| `pickJSONFile() → Promise<{handle, name, text}\|null>` | File System Access picker, else fallback. |
| `openReportFile(picked)` | Open a report (picked or dropped). |
| `newReportAction(anchor)` | New menu (blank / next from previous) or blank. |
| `newBlankReport()` | Blank report keeping config and tags. |
| `newReportFromPrevious()` | Pick the previous JSON and start the next report. |
| `ensureWritePermission(handle) → Promise<boolean>` | Query/request readwrite permission. |
| `defaultFileName(ext) → string` | Open file's base name, else `fileBaseName()`, plus `ext`. |
| `saveReport({ saveAs }) → Promise<boolean>` | Save in place / Save As; download fallback. |
| `afterSaved(message)` | Clear dirty flag; emits `report:saved`. |

### app — persistence: autosave (IndexedDB)

| Function | Description |
| --- | --- |
| `idbOpen() → Promise<IDBDatabase>` | Open the autosave database. |
| `idbRequest(mode, fn) → Promise<any>` | Run one store request in a transaction. |
| `writeAutosave()` | Write the report if it changed since the last write. |
| `readAutosave() → Promise<record\|null>` | Read the autosave record. |
| `restartAutosaveTimer()` | Interval from `config.autosaveSeconds`. |
| `offerAutosaveRecovery()` | On load, offer to restore unsaved work. |

### app — export: CSV

| Function | Description |
| --- | --- |
| `exportCSV()` | Download `toCSV()` as `<file name>.csv`. |

### app — export: PDF (print)

| Function | Description |
| --- | --- |
| `cssString(text) → string` | Quote text for CSS `content`. |
| `updatePageStyle()` | Write `@page` rules (running header, page 1 footer) into `#print-page-style`. |
| `printPhotoIds() → string[]` | Photos that appear in the PDF. |
| `printPhotoFlow(kind, display, ids, urlFor) → Element\|null` | Print photo flow from `photoLayout()` (`--w`, `--cap` and `--gap` in inches, alignment). |
| `printPill(text, cls, bg) → Element` | Print pill. |
| `printItemPills(item, { status }) → Element\|null` | Status/tag pills per Config toggles. |
| `renderPrint(urlFor)` | Build `#print-root` from the report. |
| `preparePrint() → Promise` | Flatten photos, build print DOM, wait for image decode. |
| `showPrintTip() → Promise<boolean>` | One-time print settings tip. |
| `exportPDF()` | Tip, prepare, set `document.title`, `window.print()`; explains if no print window opened. |
| `bindPrintEvents()` | `beforeprint` sets `printOpened` and builds when needed, `afterprint` reset. |

### app — config panel

| Function | Description |
| --- | --- |
| `setConfig(key, value)` | Write `report.config[key]`; emits `config:changed`. |
| `configToggle(label, key, hint) → Element` | Checkbox row. |
| `configRange(label, key, opts) → Element` | Slider row. |
| `configText(label, key, opts) → Element` | Text / textarea field. |
| `numberingField() → Element` | Presets, custom pattern, start number. |
| `tagsEditor() → Element` | Rename, recolor, delete, add tags. |
| `logoEditor() → Element` | Logo preview, replace, reset. |
| `renderConfigPanel()` | Build `#config-panel` (Troubleshooting → Copy debug info calls `copyDebugInfo()`). |
| `openConfig()` | Show the panel. |
| `closeConfig()` | Hide the panel. |

### app — office defaults (developer stub)

| Function | Description |
| --- | --- |
| `exportOfficeDefaults() → string` | Current config + tags as office-defaults JSON. |
| `importOfficeDefaults(json)` | Apply office-defaults JSON to the current report. |

### app — password gate

A product seal, not security: `<body class="locked">` hides everything but
`#gate` until the password is entered. To change the password, replace
`PASSWORD_SHA256` with the new password's hash (`echo -n <password> | sha256sum`).

| Function | Description |
| --- | --- |
| `isLocked() → boolean` | `body` still has `locked`. |
| `bindGate(onUnlock)` | Focus `#gate-input`; on a matching submit remove `locked`, hide `#gate`, call `onUnlock`; otherwise show `#gate-error`. |

### app — keyboard, window events and init

| Function | Description |
| --- | --- |
| `bindGlobalEvents()` | Shortcuts (none while locked; in crop mode Enter applies and Escape discards; otherwise Escape also clears the photo selection), toolbar placement on resize, unload warning, autosave triggers, JSON drop, event listeners. |
| `init()` | Route `window` errors to `reportUncaught()`, `detectCapabilities()`, build UI, load a blank report, WebView notice, set `data-ready`, `bindGate()` (offer recovery on unlock). |

## 3. State

`report` (one JSON document; `state.report` in the app):

| Field | Type | Default |
| --- | --- | --- |
| `schemaVersion` | number | `1` |
| `app` | string | `"WM-FieldReport"` |
| `header.reportNumber` | number | `1` |
| `header.reportTitle` | string | `"Field Observation Report"` |
| `header.author`, `purpose`, `project`, `projectNumber`, `time`, `weather` | string | `""` |
| `header.visitDate`, `header.reportDate` | ISO date | today |
| `header.attendees` | `{ name, organization }[]` (older files with plain names are upgraded on load) | `[]` |
| `header.distribution` | string[] | `[]` |
| `disclaimer` | string | `config.disclaimer` |
| `generalObservations[]` | `{ id, text, images: photoId[], display }` | `[]` |
| `observations[]` | Observation | `[]` |
| `inherited[]` | Observation + `sourceReport`, `originalNumber` | `[]` |
| `tags[]` | `{ id, name, color }` (color = `TAG_COLORS` key) | `[]` |
| `photos` | `{ [id]: Photo }` | `{}` |
| `config` | see §4 | `DEFAULT_CONFIG` |
| `ui.columnWidths` | number[4] (%) | `[8, 36, 32, 24]` |

Observation: `id` (UUID), `number` (string), `description`, `requirement`,
`photoIds[]`, `display`, `status` (`incomplete`\|`complete`),
`completedDate` (ISO\|null), `tagIds[]`, `createdInReport` (number).

Cell `display` (observation and general observation; `{}` = defaults, see
`cellDisplay()`): `photoWidth` (10–100 %, the menu offers the
`PHOTO_SIZE_PRESETS` Full/Half/Third; other values are kept as overrides;
default 100; used by manual cells), `photoAlign` (`left`\|`center`; default
`left` in the table, `center` in general observations), `photoMode` (absent =
automatic, `'manual'`), `photoArrangement` (automatic cells: the chosen
`autoArrangements()` key, e.g. `'3'`; absent = the default).

Photo: `id`, `original` (JPEG data URL, ≤ 1600 px), `crop` (`{x, y, w, h}`
original px \| null), `markup[]` (§9), `caption`, `fileName`, `display`
(`{ width }`: optional width override, 10–100 % of its cell; moves with the
photo between cells).

App-only `state`: `fileHandle`, `fileName`, `dirty`, `changeCount`,
`autosavedCount`, `history`, `editKey`, `filter`, `autosaveTimer`,
`printPrepared`, `printOpened`, `autosaveWarned`, `pendingPhotoTarget`,
`hoverPhotoTarget`, `selectedPhotoId`. Also app-only: `debugLog` (`DebugLog`) and `capabilities`
(§12); neither is ever written to a file.

## 4. Config

| Key | Type | Default | Read by |
| --- | --- | --- | --- |
| `numberingPattern` | string | `{report}.{item:02}` | `renumber()` |
| `numberingStart` | number | `1` | `renumber()` |
| `carryForward` | boolean | `true` | `nextReportFrom()`, `remindersVisible()`, `newReportAction()` |
| `pdfUseScreenWidths` | boolean | `false` | `printColumnWidths()` |
| `pdfShowStatus` | boolean | `false` | `printItemPills()` |
| `pdfShowTags` | boolean | `false` | `printItemPills()` |
| `pdfShowReminders` | boolean | `true` | `renderPrint()` |
| `photoExportMaxSide` | number (400–1200) | `600` | `preparePrint()`, `bindPrintEvents()` |
| `photoExportQuality` | number | `0.8` | `preparePrint()` |
| `photoMaxHeightTable` | number (1–6 in) | `2` | `photoMaxHeightIn()` → `photoCell()`, `printPhotoFlow()` |
| `photoMaxHeightGeneral` | number (1–6 in) | `4` | `photoMaxHeightIn()` → `photoCell()`, `printPhotoFlow()` |
| `markupColor` | hex | `#F26A21` | `openPhotoEditor()` |
| `photoMoveControls` | boolean | `false` | `photoToolbarActions()`, `bindPhotoResize()` |
| `disclaimer` | string | template text | `createReport()`, `renderDisclaimer()` |
| `logo` | data URL \| null | `null` (= `DEFAULT_LOGO`) | `renderPrint()`, `logoEditor()` |
| `autosaveSeconds` | number (≥ 5) | `30` | `restartAutosaveTimer()` |
| `mastheadTagline` | string | `LANDSCAPE ARCHITECTURE   URBAN DESIGN   PLANNING` | `renderPrint()` |
| `footerText` | string | office address line | `updatePageStyle()` |

Other constants: `APP_ID`, `DEFAULTS_APP_ID`, `SCHEMA_VERSION`,
`DEFAULT_COLUMN_WIDTHS`, `PDF_COLUMN_WIDTHS` (`[8, 38, 33, 21]`),
`PHOTO_UPLOAD_MAX_SIDE`, `PHOTO_UPLOAD_QUALITY`,
`PHOTO_WIDTH_MIN`, `PHOTO_WIDTH_SNAP`, `PHOTO_MAX_HEIGHT_RANGE`,
`PRINT_CONTENT_WIDTH_IN`, `HISTORY_LIMIT`,
`TAG_COLORS`, `NUMBERING_PRESETS`, `CSV_COLUMNS`, `SNAPSHOT_KEYS`,
`MESSAGES`, `LOG_CODES`, `DEBUG_LOG_LIMIT`, `DEBUG_DETAIL_MAX`,
`OPEN_IN_BROWSER_HELP`, `SEND_DEBUG_HELP`.

## 5. Events

Dispatched on `document` by `emit()`; `detail` is the payload.

| Event | Payload | Emitter | Listeners |
| --- | --- | --- | --- |
| `report:loaded` | `{ report }` | `loadReport()` | `bindGlobalEvents()`: `renderAll()`, `restartAutosaveTimer()` |
| `report:changed` | `{ dirty }` | `markDirty()` | `bindGlobalEvents()`: `updateChrome()` |
| `report:saved` | `{ fileName }` | `afterSaved()` | `bindGlobalEvents()`: `updateChrome()`, `writeAutosave()` |
| `photo:changed` | `{ photoId }` | `closePhotoEditor()` | `bindPhotoEvents()`: refresh that photo's images |
| `config:changed` | `{ key }` (`*` = all) | `setConfig()`, `importOfficeDefaults()` | `bindGlobalEvents()`: renumber/re-render, restart autosave |

## 6. Storage

| Item | Value |
| --- | --- |
| IndexedDB database / store / key | `wm-field-report` / `autosave` / `current` |
| Autosave record | `{ savedAt, dirty, fileName, fileHandle, json }` |
| localStorage | `wm-field-report:print-tip-shown`; `wm-field-report:probe` (written and removed by `detectCapabilities()`) |
| File System Access | `showOpenFilePicker` / `showSaveFilePicker`; handle kept in `state.fileHandle` (and in the autosave record); Save writes via `createWritable()` |
| Fallback | `#file-json` input (opened by `openFilePicker()`) for Open; `downloadBlob()` for Save (Save As prompts for a name) |

## 7. Rendering

| Kind | Entry points |
| --- | --- |
| Screen | `renderAll()` → `renderHeader()`, `renderGeneral()`, `renderObservations()`, `renderReminders()`; partial: `refreshItem()`, `refreshPhotoCell()`, `renderFilterBarInPlace()`, `updateChrome()` |
| Print | `exportPDF()` → `preparePrint()` → `renderPrint()` → `updatePageStyle()`; menu print: `beforeprint` in `bindPrintEvents()` |
| Photo flatten | `flattenPhoto()` → `renderFlattened()`: draw crop of original, `drawShapes()` in original coordinates, downscale to max side, `toDataURL('image/jpeg', quality)`; screen previews use max side 1000 |

## 8. CSS

| Section | Key classes |
| --- | --- |
| css — tokens and base | 778–829 |
| css — toolbar and page | 830–865 |
| css — header form | 866–901 |
| css — general observations | 902–913 |
| css — observation table | 914–979 |
| css — photos | 980–1058 |
| css — reminders | 1059–1066 |
| css — popovers, dialogs, panel | 1067–1144 |
| css — photo editor | 1145–1177 |
| css — password gate | 1178–1190 |
| css — responsive | 1191–1228 |
| css — print | 1229–1290 |

`@page` rules are generated at runtime into `<style id="print-page-style">`
by `updatePageStyle()`: Letter, margins 1.55in 1in 0.8in 1in; `@top-left`
running header with `counter(page)` / `counter(pages)`; `@page :first` has
top margin 0.6in, no header, and the footer in `@bottom-center`.

## 9. Photo editor

Coordinates: original-image pixels (before crop). Crop is `{x, y, w, h}` in
the same space. Rotate re-encodes `original` and transforms crop and shapes.

| Tool | Shape |
| --- | --- |
| Select / move | — |
| Circle / ellipse | `{ id, type: 'ellipse', cx, cy, rx, ry, color, width }` |
| Arrow | `{ id, type: 'arrow', x1, y1, x2, y2, color, width }` |
| Freehand pen | `{ id, type: 'pen', points: [[x, y], …], color, width }` |
| Line | `{ id, type: 'line', x1, y1, x2, y2, color, width }` |
| Dimension | `{ id, type: 'dimension', x1, y1, x2, y2, label, size, color, width }` |
| Text | `{ id, type: 'text', x, y, text, size, color, width: 0 }` |
| Crop | sets `photo.crop` |

Colors: `MARKUP_COLORS`. Widths: `STROKE_FACTORS` × longest image side.

## 10. Formats

| Format | Structure |
| --- | --- |
| Report JSON | §3; file name `YYMMDD_{ProjectNo}_FOR-{NN}.json` |
| CSV | UTF-8 BOM, CRLF, RFC 4180; columns `CSV_COLUMNS`; current items then inherited |
| Office defaults JSON (stub) | `{ app: "WM-FieldReport-Defaults", schemaVersion, config, tags }` |

## 11. Extension points

| Item | Where |
| --- | --- |
| `migrate()` | core — file formats |
| `exportOfficeDefaults()`, `importOfficeDefaults()` | app — office defaults (`// TODO: office defaults UI`) |
| `DEFAULT_CONFIG`, `DEFAULT_LOGO`, `DEFAULT_DISCLAIMER` | core — config defaults |
| Numbering tokens | `{report}`, `{item}`; format suffix `:NN` (zero pad to NN digits) or `:A` (letters) |

## 12. Errors and debug log

Every problem the user can hit goes through `notify` (app — notify). Nothing
else calls `alertDialog()` or `console.*`; `node tools/lint.mjs` enforces
this and rejects an empty `catch` (or `.catch(() => {})`) with no comment.

| Call | Presentation | Logged |
| --- | --- | --- |
| `notify.info(code, opts)` | Toast, 5 s | yes |
| `notify.warn(code, opts)` | Toast, 9 s | yes |
| `notify.error(code, opts)` | Dialog (title, message, "what to do" hint); for failures that stop an action | yes |
| `notify.log(level, code, detail)` | None | yes |

`opts`: `err` (the caught error; shown instead of the catalog message when
`err.userFacing`, see `userError()`) and `detail` (log only). Success
messages ("Saved …") still use `toast()` directly.

User-facing codes (`MESSAGES`, each `{ title, message, action }`):

| Code | Level | Raised by |
| --- | --- | --- |
| `FILE_PICKER_UNAVAILABLE` | warn | `openFilePicker()` |
| `PRINT_UNAVAILABLE` | error | `exportPDF()` |
| `EMBEDDED_VIEWER` | banner (logged) | `showEnvironmentNotice()` |
| `OPEN_INVALID_FILE` | error | `openReportFile()`, JSON drop in `bindGlobalEvents()` |
| `NEXT_REPORT_FAILED` | error | `newReportFromPrevious()` |
| `RESTORE_FAILED` | error | `offerAutosaveRecovery()` |
| `SAVE_FAILED` | error | `saveReport()` |
| `STORAGE_UNAVAILABLE` | warn (once per visit) | `writeAutosave()` |
| `IMAGE_UNREADABLE` | error | `addPhotosTo()`, `openPhotoEditor()`, logo input in `bindGlobalEvents()` |
| `PDF_PREPARE_FAILED` | error | `exportPDF()` |
| `DEBUG_INFO_DOWNLOADED` | info | `copyDebugInfo()` |
| `UNEXPECTED_ERROR` | error | `reportUncaught()` |

Log-only codes (`LOG_CODES`, value = description): `CAPABILITIES`,
`SHOW_PICKER_FALLBACK`, `FS_ACCESS_FALLBACK`, `WRITE_PERMISSION_FAILED`,
`AUTOSAVE_READ_FAILED`, `AUTOSAVE_WRITE_FAILED`, `PREVIEW_FAILED`,
`CLIPBOARD_FALLBACK`, `EMBEDDED_VIEWER`, `RESIZE_OBSERVER_LOOP`.
`tests/core.test.mjs` checks every code passed to `notify` is in a catalog.

Debug log: `debugLog`, in memory only, last 200 entries
`{ time (ISO, UTC), level (info|warn|error), code, detail (describeError()) }`.

Capabilities (`detectCapabilities()`, logged once at startup):
`fileSystemAccess`, `showPicker`, `indexedDB`, `localStorage`, `print`,
`clipboard`, `embeddedWebView`, `originScheme` (`file:`, `content:`, …).

Debug report (`formatDebugReport()`; Settings → Troubleshooting → Copy debug
info). No report content or photos:

```text
Field Report debug info
Generated: <ISO time>
App: WM-FieldReport, schema <SCHEMA_VERSION>
User agent: <navigator.userAgent>

Capabilities:
  <name>: <value>

Log (<n> entries, oldest first):
  <time> <level> <code> <detail>
```

## 13. Inlined dependencies

None.

## Checks

| Command | Checks |
| --- | --- |
| `node tools/lint.mjs` | Scripts parse, no network access, errors go through `notify`, this file in sync |
| `node --test` | Core logic (`tests/core.test.mjs`); headless Chrome boot and print (`tests/smoke.test.mjs`) and in-page behavior over CDP (the other `tests/*.test.mjs`), all sharing the Chrome launch and CDP helpers in `tests/browser.mjs`; needs Chrome/Chromium/Edge or `CHROME_PATH` |
