# DEVELOPER.md

Maintainer reference for `field-report.html`. Name and function only.
`node tools/lint.mjs` fails when this file drifts from the code (sections, line
ranges, functions, events); `node tools/lint.mjs --file-map` prints table 1.

## 1. File map

| Section | Lines |
| --- | --- |
| core — config defaults | 14–72 |
| core — utilities | 73–119 |
| core — report model | 120–190 |
| core — numbering | 191–213 |
| core — inheritance | 214–263 |
| core — tags and filters | 264–292 |
| core — undo history | 293–334 |
| core — file formats | 335–462 |
| css — tokens and base | 463–514 |
| css — toolbar and page | 515–543 |
| css — header form | 544–575 |
| css — general observations | 576–588 |
| css — observation table | 589–645 |
| css — photos | 646–671 |
| css — reminders | 672–679 |
| css — popovers, dialogs, panel | 680–743 |
| css — photo editor | 744–776 |
| css — responsive | 777–806 |
| css — print | 807–867 |
| markup — shell | 868–905 |
| app — dom helpers and icons | 906–1017 |
| app — state and events | 1018–1106 |
| app — dialogs and popovers | 1107–1182 |
| app — render: toolbar and header | 1183–1376 |
| app — render: general observations | 1377–1432 |
| app — render: observations table | 1433–1641 |
| app — render: filters and reminders | 1642–1733 |
| app — sorting and column resize | 1734–1822 |
| app — photos: import, cells, drag and drop | 1823–2028 |
| app — photos: flatten and markup drawing | 2029–2216 |
| app — photo editor | 2217–2756 |
| app — persistence: files | 2757–2899 |
| app — persistence: autosave (IndexedDB) | 2900–2985 |
| app — export: CSV | 2986–2993 |
| app — export: PDF (print) | 2994–3169 |
| app — config panel | 3170–3350 |
| app — office defaults (developer stub) | 3351–3365 |
| app — keyboard, window events and init | 3366–3444 |

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

### core — report model

| Function | Description |
| --- | --- |
| `createReport(options = {}) → report` | New report; `options.config`, `options.tags`, `options.today`. |
| `createObservation(report) → Observation` | Blank observation for the current report number. |
| `createGeneralObservation() → object` | `{ id, text, images }`. |
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

### core — undo history

| Function | Description |
| --- | --- |
| `History` | Class: `record(snapshot)`, `undo(current)`, `redo(current)`, `canUndo()`, `canRedo()`, `clear()`; limit `HISTORY_LIMIT` (100). |
| `snapshotReport(report) → string` | JSON of `SNAPSHOT_KEYS` (excludes photos, config, ui). |
| `restoreSnapshot(report, snapshot) → report` | Apply a snapshot in place and renumber. |

### core — file formats

| Function | Description |
| --- | --- |
| `fileBaseName(report) → string` | `YYMMDD_{ProjectNo}_FOR-{NN}`. |
| `referencedPhotoIds(report) → Set` | Photo ids used by general, current and inherited items. |
| `serializeReport(report) → string` | Renumber, drop unreferenced photos, JSON. |
| `migrate(data) → data` | Schema upgrade hook (no steps yet). |
| `normalizeItem(item, report) → Observation` | Fill missing observation fields. |
| `normalizeReport(data) → report` | Fill defaults for every report field. |
| `parseReport(json) → report` | Validate `app`/`schemaVersion`, migrate, normalize. Throws user-facing errors. |
| `csvField(value) → string` | RFC 4180 quoting. |
| `toCSV(report) → string` | BOM + CRLF CSV, current items then inherited. |
| `officeDefaultsJSON(report) → string` | Office-defaults JSON (config + tags). |
| `applyOfficeDefaults(report, json) → report` | Replace config + tags from office-defaults JSON. |

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
| `safeLocalGet(key) → string\|null` | localStorage read, never throws. |
| `safeLocalSet(key, value)` | localStorage write, never throws. |

### app — state and events

| Function | Description |
| --- | --- |
| `emit(name, detail = {})` | Dispatch a custom event on `document`. |
| `on(name, handler)` | Listen for a custom event (handler gets `detail`). |
| `markDirty()` | Flag unsaved changes; emits `report:changed`. |
| `checkpoint()` | Record an undo snapshot before a structural change. |
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
| `alertDialog(message, title)` | Message dialog. |
| `promptDialog(title, label, value) → Promise<string\|null>` | Text input dialog. |
| `showPopover(anchor, content)` | Show `#popover` under an element. |
| `closePopover()` | Hide the popover. |
| `showMenu(anchor, items)` | Popover menu of `{ label, icon, run }`. |

### app — render: toolbar and header

| Function | Description |
| --- | --- |
| `buildToolbar()` | Build toolbar buttons from `TOOLBAR_ACTIONS`. |
| `runAction(action, anchor)` | Dispatch a toolbar action. |
| `updateChrome()` | Toolbar title, unsaved dot, page title. |
| `textField(label, value, onInput, opts) → Element` | Labeled input. |
| `headerTextField(label, key, opts) → Element` | Input bound to `report.header[key]`. |
| `chipInput(list, label) → Element` | Chip editor bound to an array. |
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
| `photoCell(target, ids, { readOnly, compact }) → Element` | Photo stack with empty state. |
| `photoFigure(photo, readOnly) → Element` | One photo with edit/remove buttons. |
| `setPhotoImage(img, photo)` | Show original, then the flattened preview. |
| `refreshPhotoCell(target)` | Re-render one photo cell. |
| `dropBeforeId(cell, clientY) → string\|null` | Photo to insert before at a drop point. |
| `bindPhotoEvents()` | Click, file input, drag/drop, paste, `photo:changed` listeners. |

### app — photos: flatten and markup drawing

| Function | Description |
| --- | --- |
| `flattenPhoto(photo, maxSide, quality) → Promise<string>` | Crop + markup + downscale to JPEG; cached per photo and size. |
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

### app — photo editor

| Function | Description |
| --- | --- |
| `editorIsOpen() → boolean` | `#photo-editor` is open. |
| `buildEditorToolbar()` | Build tools, colors, widths, commands; bind canvas events. |
| `openPhotoEditor(photoId)` | Open on a working copy of the photo. |
| `closePhotoEditor(save)` | Close; on save write back and emit `photo:changed`. |
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
| `rotateEditorPhoto()` | Rotate original 90° clockwise (re-encodes JPEG), crop and shapes follow. |
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
| `printPill(text, cls, bg) → Element` | Print pill. |
| `printItemPills(item, { status }) → Element\|null` | Status/tag pills per Config toggles. |
| `renderPrint(urlFor)` | Build `#print-root` from the report. |
| `preparePrint() → Promise` | Flatten photos, build print DOM, wait for image decode. |
| `showPrintTip() → Promise<boolean>` | One-time print settings tip. |
| `exportPDF()` | Tip, prepare, set `document.title`, `window.print()`. |
| `bindPrintEvents()` | `beforeprint` fallback build, `afterprint` reset. |

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
| `renderConfigPanel()` | Build `#config-panel`. |
| `openConfig()` | Show the panel. |
| `closeConfig()` | Hide the panel. |

### app — office defaults (developer stub)

| Function | Description |
| --- | --- |
| `exportOfficeDefaults() → string` | Current config + tags as office-defaults JSON. |
| `importOfficeDefaults(json)` | Apply office-defaults JSON to the current report. |

### app — keyboard, window events and init

| Function | Description |
| --- | --- |
| `bindGlobalEvents()` | Shortcuts, unload warning, autosave triggers, JSON drop, event listeners. |
| `init()` | Build UI, load a blank report, set `data-ready`, offer recovery. |

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
| `header.attendees`, `header.distribution` | string[] | `[]` |
| `disclaimer` | string | `config.disclaimer` |
| `generalObservations[]` | `{ id, text, images: photoId[] }` | `[]` |
| `observations[]` | Observation | `[]` |
| `inherited[]` | Observation + `sourceReport`, `originalNumber` | `[]` |
| `tags[]` | `{ id, name, color }` (color = `TAG_COLORS` key) | `[]` |
| `photos` | `{ [id]: Photo }` | `{}` |
| `config` | see §4 | `DEFAULT_CONFIG` |
| `ui.columnWidths` | number[4] (%) | `[8, 36, 32, 24]` |

Observation: `id` (UUID), `number` (string), `description`, `requirement`,
`photoIds[]`, `display` (`{}`), `status` (`incomplete`\|`complete`),
`completedDate` (ISO\|null), `tagIds[]`, `createdInReport` (number).

Photo: `id`, `original` (JPEG data URL, ≤ 1600 px), `crop` (`{x, y, w, h}`
original px \| null), `markup[]` (§9), `caption`, `fileName`.

App-only `state`: `fileHandle`, `fileName`, `dirty`, `changeCount`,
`autosavedCount`, `history`, `editKey`, `filter`, `autosaveTimer`,
`printPrepared`, `pendingPhotoTarget`, `hoverPhotoTarget`.

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
| `markupColor` | hex | `#F26A21` | `openPhotoEditor()` |
| `disclaimer` | string | template text | `createReport()`, `renderDisclaimer()` |
| `logo` | data URL \| null | `null` (= `DEFAULT_LOGO`) | `renderPrint()`, `logoEditor()` |
| `autosaveSeconds` | number (≥ 5) | `30` | `restartAutosaveTimer()` |
| `mastheadTagline` | string | `LANDSCAPE ARCHITECTURE   URBAN DESIGN   PLANNING` | `renderPrint()` |
| `footerText` | string | office address line | `updatePageStyle()` |

Other constants: `APP_ID`, `DEFAULTS_APP_ID`, `SCHEMA_VERSION`,
`DEFAULT_COLUMN_WIDTHS`, `PDF_COLUMN_WIDTHS` (`[8, 38, 33, 21]`),
`PHOTO_UPLOAD_MAX_SIDE`, `PHOTO_UPLOAD_QUALITY`, `HISTORY_LIMIT`,
`TAG_COLORS`, `NUMBERING_PRESETS`, `CSV_COLUMNS`, `SNAPSHOT_KEYS`.

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
| localStorage | `wm-field-report:print-tip-shown` |
| File System Access | `showOpenFilePicker` / `showSaveFilePicker`; handle kept in `state.fileHandle` (and in the autosave record); Save writes via `createWritable()` |
| Fallback | `#file-json` input for Open; `downloadBlob()` for Save (Save As prompts for a name) |

## 7. Rendering

| Kind | Entry points |
| --- | --- |
| Screen | `renderAll()` → `renderHeader()`, `renderGeneral()`, `renderObservations()`, `renderReminders()`; partial: `refreshItem()`, `refreshPhotoCell()`, `renderFilterBarInPlace()`, `updateChrome()` |
| Print | `exportPDF()` → `preparePrint()` → `renderPrint()` → `updatePageStyle()`; menu print: `beforeprint` in `bindPrintEvents()` |
| Photo flatten | `flattenPhoto()` → `renderFlattened()`: draw crop of original, `drawShapes()` in original coordinates, downscale to max side, `toDataURL('image/jpeg', quality)`; screen previews use max side 1000 |

## 8. CSS

| Section | Key classes |
| --- | --- |
| css — tokens and base | `:root` tokens, `.btn`, `.icon-btn`, `.icon` |
| css — toolbar and page | `.toolbar`, `.tb-btn`, `.tb-secondary`, `.tb-overflow`, `.page`, `.card` |
| css — header form | `.header-grid`, `.field`, `.chips`, `.chip`, `.disclaimer` |
| css — general observations | `.gen-list`, `.gen-item`, `.autogrow` |
| css — observation table | `.obs-table`, `.col-resizer`, `.cell-text`, `.item-cell`, `.pill*`, `.drag-handle`, `.hover-control`, `.drop-indicator` |
| css — photos | `.photo-cell`, `.photo`, `.photo-edit`, `.photo-remove`, `.photo-empty` |
| css — reminders | `.rem-group`, `.rem-table` |
| css — popovers, dialogs, panel | `.popover`, `.menu-item`, `.swatch`, `.dlg`, `.config-panel`, `.toast`, `.busy` |
| css — photo editor | `.pe`, `.pe-bar`, `.pe-btn`, `.pe-stage`, `.pe-text-input` |
| css — responsive | `< 900px`: cards, icon toolbar, 44 px targets |
| css — print | `#print-root`, `.pr`, `.pr-masthead`, `.pr-title`, `.pr-head`, `.pr-general`, `.pr-table`, `.pr-reminders` |

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

## 12. Inlined dependencies

None.

## Checks

| Command | Checks |
| --- | --- |
| `node tools/lint.mjs` | Scripts parse, no network access, this file in sync |
| `node --test` | Core logic (`tests/core.test.mjs`); headless Chrome boot and print (`tests/smoke.test.mjs`, needs Chrome/Chromium/Edge or `CHROME_PATH`) |
