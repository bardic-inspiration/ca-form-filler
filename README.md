# Field Observation Report Tool

Fill out, save and reopen Walker Macy Field Observation Reports, and export
them as PDFs that match the Word template.

## 1. Getting started

1. Open `field-report.html` in **Chrome** or **Edge** (double-click it, or drag
   it onto a browser window).
2. That's it. Nothing to install, and no internet connection is needed.

## 2. Filling out a report

- **Report No.** sets the title ("Field Observation Report 01") and the item
  numbers (1.01, 1.02…).
- Fill in By, Purpose, dates, Project, Project No., Time and Weather.
  Both dates start as today.
- **Attendees** and **Distribution**: type a name and press Enter. Click a
  name to change it, or × to remove it.
- **Disclaimer**: click Edit to change it for this report.
- **General Observations/Comments**: click *Add general observation*. Each
  one can hold pictures (sketches, details): drop them in, paste, or click.

## 3. Observations

- Click **Add observation** for a new row, then type in the Observation and
  Contract Requirement boxes.
- Hover over a row to see its controls:
  - drag the ⠿ handle to move the row (numbers update by themselves);
  - the bin deletes the row.
- Drag the line between column headings to resize columns. Double-click it
  to reset.
- **Marking complete**: click *Incomplete*. It turns green and shows today's
  date. Click the green pill to change the date or mark it incomplete again.
- **Tags**: click *+ Tag* to tick existing tags or create a new one with a
  color.
- **Show** (All / Incomplete / Complete) and tag buttons above the table
  filter what you see. They never change the PDF.
- Made a mistake? **Ctrl+Z** undoes, **Ctrl+Y** redoes.

## 4. Photos

1. Drop photos onto a Supporting Photo box, paste one (Ctrl+V) while the
   mouse is over the box, or click the box to choose files. Several photos
   stack in one box.
2. Drag a photo to reorder it, or onto another row to move it.
3. Click the pencil to open the photo editor:
   - tools: select/move, circle, arrow, pen, line, dimension (a line with a
     label such as 19"), text, and crop;
   - pick a color and a line thickness before drawing;
   - zoom with the mouse wheel, pinch, or the +/− buttons; hold Space and
     drag (or drag with two fingers) to move around;
   - rotate turns a sideways photo; *Reset crop* undoes cropping;
   - select a drawing and press Delete to remove it.
4. Click **Save** to keep your changes, or **Cancel**. Drawings stay
   editable later.

## 5. Saving and opening

- **Save** (Ctrl+S) saves the report file. The first time, you choose where.
  After that, Save updates the same file.
- **Save As** saves a copy under a new name.
- File names look like `260626_P3935_FOR-01.json` (date, project number,
  report number).
- **Open** opens a saved report. You can also drop a report file onto the
  window.
- The tool keeps a backup of your work every 30 seconds. If the browser
  closes before you save, it offers to **restore unsaved work** next time.

## 6. Next report

1. Click **New → Next report from previous…** and choose the previous
   report's file.
2. The new report copies the project details, people, tags and settings,
   and gets the next number. Dates, time and weather start fresh.
3. Every item that was not complete appears under **Open Items from Previous
   Reports** at the end, with its original number (2.11 stays 2.11).
4. Mark them complete as they're fixed. Completed items show once as
   complete, then drop off the report after that.

*New → Blank report* starts an empty report.

## 7. Exporting

- **Export PDF** (Ctrl+P) opens the print window. Choose:
  1. Destination: **Save as PDF**
  2. More settings → **Headers and footers: off**
  3. More settings → **Background graphics: on**
- **Export CSV** saves a spreadsheet of all items for tracking in Excel.

## 8. Settings (gear icon)

Settings are saved with each report and apply right away.

| Setting | What it does |
| --- | --- |
| Numbering format | 1.01, 01.01, 1, A.1, or your own pattern |
| Start numbering at | First item number |
| Carry forward incomplete items | Turns the "Next report" open-items list on or off |
| Apply on-screen column widths | PDF uses your column widths instead of the template's |
| Show completion status | PDF shows the status pill under each item number |
| Show scope tags | PDF shows tags under each item number |
| Show Reminders section | PDF includes Open Items from Previous Reports |
| Photo export size / quality | Smaller numbers make smaller PDFs |
| Default markup color | Starting color in the photo editor |
| Default disclaimer text | Disclaimer for new reports |
| Tags | Rename, recolor, delete or add tags |
| Masthead logo, tagline, footer | Replace the logo or change the page 1 text |
| Autosave every | How often the backup is taken |
| Copy debug info | Copies a problem report to send to a maintainer (see section 9) |

## 9. Troubleshooting

When something goes wrong, the tool shows a message saying what happened and
what to do next.

- **Sending a problem report.** Open Settings (gear icon) → Troubleshooting →
  **Copy debug info**, then paste it into an email or chat to the maintainer.
  If copying isn't allowed, the tool saves `field-report-debug.txt` to your
  Downloads folder instead; attach that file. The report lists your browser,
  which features it supports, and recent problems. It never includes your
  report's text or photos. Copy it before reloading the page: the list of
  problems is cleared when the page closes.
- **On a phone, nothing happens when adding photos or exporting.** The file
  is probably open in another app's viewer (for example the Files app), which
  can't choose files or print. The tool shows a message when this happens.
  Open the file with **Chrome** instead: ⋮ → Open with → Chrome.
- **The PDF font looks different.** The report uses Franklin Gothic. If it
  isn't installed on your computer, a similar font is used instead.
- **Save downloads a copy instead of updating the file.** Some browsers or
  settings don't allow saving over files. Your report is in the Downloads
  folder; open it from there next time.
- **The file is very large.** Photos make up most of the size. They are
  shrunk when added; remove photos you don't need.
- **Missing background colors or extra text at the page edges in the PDF.**
  Check the print settings in section 7.
- **I closed the tab without saving.** Reopen the tool in the same browser
  and choose *Restore*.

---

Contributors: see [`AGENTS.md`](AGENTS.md) and [`DEVELOPER.md`](DEVELOPER.md).
Licensed [MIT](LICENSE).
