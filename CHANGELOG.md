# Changelog

All notable changes to GoPro Overlay are documented here.

## [Unreleased]

### Added
- **GPS Track zoomed window view** — an optional view mode that keeps the current position centered
  and zoomed in to an adjustable radius, instead of always fitting the whole track to the widget.
  Makes a close gap to the ghost marker actually visible instead of a fraction of a pixel on the
  full track's own scale.

### Fixed
- **Fixed a real memory leak that could crash the app with an out-of-memory error during a long
  editing session.** The cache backing widget header-logo images had no size limit at all — every
  distinct image ever tried as a header logo (including ones since replaced, or reverted via undo)
  stayed decoded in memory for the rest of the session, uncompressed. Also capped the undo/redo
  history, which had no limit either (every widget click, not just style edits, records a history
  point).

## [0.1.3] - 2026-07-19

### Added
- **Session Summary widget** — an end-of-session outro card with an eased opening animation,
  shown for a configurable number of seconds before the end of the trim range. Displays lap count,
  best lap/sector splits, top speed, distance, and elapsed time.
- **GPS ghost marker** — an optional second, translucent dot on the GPS Track widget showing your
  fastest completed lap's own position at the same elapsed time into its lap, so you can see
  ahead/behind spatially instead of just as a number. The property panel now shows a live status
  line explaining why the ghost isn't visible yet (no start/finish line set, or no lap completed)
  when it doesn't appear.
- **Rounded corners** on every widget's background, on by default, with an adjustable radius — and
  the digital speedometer gained its own background option to match the other widgets.
- **Recent Projects** — the start screen now lists your last 10 opened/saved projects for one-click
  reopening, instead of always going through the file picker.
- **Multi-select** — shift-click widgets (on the canvas or in the widget list) to build a selection;
  drag any member to move the whole group together, and align/center/delete apply to the whole
  selection at once.
- **Arrow-key nudge** — move the selected widget(s) by 1px (10px with Shift) using the arrow keys,
  active only while a widget is selected so it doesn't conflict with the timeline's own frame-step
  shortcut.
- **Undo/redo** for all widget edits (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or +Y), coalescing rapid bursts
  (e.g. dragging a slider) into a single undo step.
- **Saveable widget layout presets** — save your current widget arrangement under a name and
  re-apply it to any project later.
- **Autosave** with crash recovery — offers to restore your last session if the app didn't close
  cleanly.
- **LRV sidecar proxy fallback** — if a clip has a GoPro-written low-res `.LRV` proxy next to it,
  preview generation prefers that over transcoding from scratch, which is much faster.

### Fixed
- The layout-save name prompt used `window.prompt()`, which Electron's renderer does not support —
  clicking "Save current layout…" silently did nothing. Replaced with an inline name field, and
  loading a saved layout is now an explicit "Load" button instead of a plain clickable label.
- The Session Summary widget's optional best-sector row could render below the widget's own bottom
  edge instead of shrinking to fit, whenever sector data was present.
- GPS track rendering with speed/braking coloring is now cached per widget instead of re-stroking
  every segment on every frame, fixing a real performance drop during playback/scrubbing with that
  coloring mode enabled.
- No-fix `(0, 0)` GPS samples (camera briefly lost signal) are now filtered out at import instead of
  being treated as real telemetry.

## [0.1.2] - 2026-07-18

### Fixed
- No-fix (0,0) GPS samples are filtered out instead of imported as real telemetry.

### Documentation
- Documented SD card import slowness under Known limitations.
- README wording/punctuation fixes.

## [0.1.1] - 2026-07-17

### Added
- Crash diagnostics logging.

### Fixed
- Capped widget canvas device-pixel-ratio to avoid excessive backing-store size on high-DPI
  displays.

### Documentation
- Added a demo video link and expanded per-widget option details in the README.

## [0.1.0] - 2026-07-16

Initial release: import GoPro clips, build a customizable telemetry overlay from GPS track, timer,
sector timer, delta time, predictive lap timer, apex speed callout, speed/distance graph,
G-Force diagram, roll/lean angle, and speedometer (analog/digital) widgets, then export a burned-in
MP4 with GPU-accelerated encoding where available.
