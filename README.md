# GoPro Overlay

A desktop editor for burning GoPro telemetry (GPS, speed, lean angle, G-forces, lap/sector
timing…) directly into your video as a rendered overlay — no cloud upload, no subscription. Import
one or more GoPro clips, drag widgets onto the frame, and export a finished MP4 with everything
baked in.

Built with Electron, React, and TypeScript. Runs on Windows, macOS, and Linux.

## Demo

**[▶ Watch the demo video](https://youtu.be/YtDYg4stG4M)** 
[![GoPro Overlay demo video](https://img.youtube.com/vi/YtDYg4stG4M/maxresdefault.jpg)](https://youtu.be/YtDYg4stG4M)
**[▶ Watch the demo video](https://youtu.be/YtDYg4stG4M)** 

Shows the GPS track, sector timer, timing tower, delta time, apex speed callout, and digital
speedometer widgets running together over real footage.

## Features

- **Multi-clip import** — select every part of a chapter-split GoPro recording
  (`GH010230.MP4`, `GH020230.MP4`, ...) at once; they're stitched into a single timeline with
  continuous telemetry.
- **11 telemetry widgets**, each fully configurable (colors, fonts, size, smoothing) via the
  property panel — see [Widgets](#widgets) below for what each one shows and its own options.
- **Lap & sector detection** from a start/finish line you place on the GPS track — everything
  (timer, sector timer, delta time, predictive lap timer, speed graph) derives from it
  automatically.
- **Widget alignment tools** — snap-to-edge/center dragging with configurable padding, plus
  one-click align/center buttons, so widgets line up without guessing pixel offsets.
- **Drag/resize/rotate** every widget directly on the video preview; live preview matches the
  final export exactly.
- **Project files** (`.gpo`) save the full editing state (imported clips, widgets, trim, start/finish
  line) so you can come back and keep editing.
- **GPU-accelerated export** — automatically detects and smoke-tests a working hardware encoder
  (NVIDIA NVENC, Intel Quick Sync, AMD AMF) before trusting it, falling back to CPU (libx264) if
  none is available or the GPU encoder fails partway through. See [GPU acceleration](#gpu-acceleration)
  below for exactly what's accelerated on which vendor.

## Widgets

Every widget is drag/resize/rotate-able on the preview and shares a common set of options where it
makes sense: a text outline width/color, and (for panel-style widgets) a background color/opacity.
Lap/sector-dependent widgets all key off the single start/finish point you place on the GPS track.

- **GPS track map** — the full track outline with a moving position dot. Three coloring modes:
  `solid` (one color), `speed` (gradient between a slow/fast color, scaled to this session's own
  min/max speed), or `braking` (segments colored by braking/accelerating/neutral, with an adjustable
  G-force threshold for what counts as "braking"). Dot color, radius, and an optional glow are
  configurable separately from the line.

- **Speedometer (analog & digital)** — current speed in km/h or mph, Gaussian-smoothed to damp GPS
  jitter (smoothing window is adjustable). The analog gauge has its own configurable min/max scale;
  color, accent color, and the unit label can all be toggled/recolored.

- **Timer** — two modes. `elapsed` is a plain running-time readout (color, centiseconds on/off,
  optional label). `laps` is a full F1-style timing tower: upload your own header logo (or use the
  bundled default) with an adjustable scale, set custom header text, choose `ranked` (fastest-to-slowest)
  or `chronological` row order (with newest-on-top or -bottom), and a fixed visible row count so the
  tower never resizes as laps come in.

- **Sector timer** — auto-divides each lap into three sectors by GPS arc-length (no manual marking
  needed). A sector turns **purple** the moment it ties or beats your best-ever time for that
  specific sector, even mid-lap. An optional secondary row shows the last fully completed lap's own
  S1/S2/S3 for direct comparison.

- **Delta time** — your in-progress lap's time vs. your fastest *completed* lap, compared at the
  same distance into the lap (not the same elapsed time, which would be meaningless once pace
  diverges). Separate colors for ahead/behind/no-baseline-yet, optional label.

- **Predictive lap timer** — projects a finishing time for the current lap at your current pace
  (baseline lap time + live delta). Can show a small +/- sub-readout using the same color convention
  as the Delta Time widget.

- **Apex speed callout** — detects real corner apexes (a genuine speed dip, not GPS noise) and
  flashes the minimum speed reached. Tunable detection: minimum speed drop required on both sides of
  the dip, minimum gap between consecutive apexes, and how long each callout stays on screen.

- **Speed/distance graph** — two view modes. `fullLap` draws each of the last N laps across its
  entire distance, each in its own color. `window` instead scrolls to keep your current position
  centered, showing only a band of track behind/ahead of you (width adjustable in meters) — every
  prior lap is drawn in one shared neutral reference color so the only thing that stands out is
  whether your current line is running above or below the pack right at that exact spot on track.
  Number of laps shown, current-lap highlighting, and grid styling are all configurable.

- **G-Force friction circle** — plots lateral (cornering) vs. longitudinal (braking/accelerating) G
  on a ring-gridded scatter, with a fading trail behind the current smoothed reading (trail duration,
  smoothing window, grid radius in G, and all colors are adjustable). Axis mapping is
  auto-calibrated per import from the accelerometer + GPS; a manual override (pick the vertical and
  longitudinal axis index, invert any axis) is available if auto-calibration picks the wrong one.

- **Roll / lean angle** — a numeric readout plus a tilting horizon bar (degrees-per-full-swing is
  adjustable). Uses the camera's gravity-vector stream when present, falling back to an
  accelerometer-tilt estimate on older footage (with an optional on-screen accuracy note — see
  [Known limitations](#known-limitations)). Shares the same axis auto-calibration/manual-override
  pattern as the G-Force widget.

## Requirements

- Real GoPro footage with embedded GPMF telemetry (GPS is required for most widgets; the G-Force
  and Roll/Lean widgets need the accelerometer/gyroscope streams present on Hero5 and later; the
  gravity-vector stream used for the most accurate roll reading is only present on newer cameras —
  older footage automatically falls back to an accelerometer-tilt estimate, see
  [Known limitations](#known-limitations)).
- Windows 10+, macOS 11+, or a recent Linux desktop.

## Installing

Download the installer for your platform from the
[Releases page](https://github.com/dekiller82/gopro-overlay/releases):

- **Windows** — `.exe` installer or the portable `.exe`
- **macOS** — `.dmg`
- **Linux** — `.AppImage` or `.deb`

## Development

```bash
npm install
npm run dev        # launches the app with hot reload
npm run typecheck
npm test
```

### Building distributables locally

```bash
npm run dist:win     # Windows installer + portable exe
npm run dist:mac     # macOS .dmg + .zip (must be run on macOS)
npm run dist:linux   # Linux AppImage + .deb
```

Output lands in `release/`. Cross-compiling macOS builds from Windows/Linux isn't supported by
electron-builder for the parts that need Apple's own tooling (codesigning, DMG creation) — the
[release workflow](.github/workflows/release.yml) builds all three platforms natively in CI via a
GitHub Actions matrix, triggered by pushing a `v*.*.*` tag.

## GPU acceleration

Export runs everything through ffmpeg. On startup of each export, `selectVideoEncoder` (see
[`src/main/export/gpuEncoder.ts`](src/main/export/gpuEncoder.ts)) tries, in order:

1. **NVIDIA NVENC** (`h264_nvenc`) — encode *and* decode (`-hwaccel cuda`) both run on the GPU.
2. **Intel Quick Sync** (`h264_qsv`) — encode always attempted; GPU-accelerated decode
   (`-hwaccel qsv`) is additionally enabled only after its own real decode+encode roundtrip probe
   passes on your machine, since QSV decode support varies more by driver/platform than NVENC's.
3. **AMD AMF** (`h264_amf`) — GPU-accelerated encode. Decode stays on CPU: AMD's decode hwaccel
   pairing is platform-specific (`d3d11va` on Windows, `vaapi` on Linux) and untested on real AMD
   hardware, so rather than guess a flag that could break the export outright, only the encode step
   is GPU-accelerated for AMD today.
4. **CPU** (`libx264`) — used if no GPU encoder is available, and as an automatic mid-export
   fallback if a GPU encoder that passed its startup smoke test still fails on the real export.

Every candidate is verified with a real, throwaway ffmpeg run before being trusted — nothing here
is guessed from the vendor name alone. The currently-selected encoder is shown in the export
progress bar.

## Architecture

```
src/
  main/            Electron main process — video probing/import, ffmpeg export, IPC handlers
  preload/         contextBridge API exposed to the renderer
  renderer/         React UI — editor, timeline, property panel, widget canvas
  shared/          Code used by both processes: telemetry parsing/math, widget draw functions,
                   project schema (zod), types
```

Each widget follows the same pattern: a style interface + defaults in
`shared/render/draw<Widget>.ts`, wired into `shared/render/drawWidget.ts` (the dispatch used by
both the live preview and the export renderer, so they're pixel-identical), `shared/widgets/defaults.ts`,
`shared/project/schema.ts`, and a section in `PropertyPanel.tsx`.

Telemetry (GPS/ACCL/GYRO/GRAV) is parsed once per import via `gopro-telemetry`, normalized into a
flat sample-array format, and sampled at arbitrary timestamps through `TelemetrySampler`
(`shared/telemetry/sampleAt.ts`), which both the live preview and the frame-by-frame export
renderer use identically.

## Known limitations

- **IMU axis calibration** (used by the G-Force and Roll/Lean widgets) is auto-detected per import
  by correlating accelerometer data against GPS-derived acceleration — it needs at least some
  braking/accelerating events in the clip to calibrate reliably. A manual axis override is
  available in each widget's property panel if auto-calibration picks the wrong axis.
- **Roll/lean angle accuracy** without a gravity-vector stream (older cameras) is estimated from
  raw accelerometer tilt, which reads exaggerated during hard cornering since lateral G adds to the
  tilt signal. The widget flags when it's using this fallback.
- **Widget alignment** (snapping/centering) is relative to the video frame only, not to other
  widgets.

## License

The source code in this repository is MIT licensed — see [LICENSE](LICENSE).

The bundled `Formula1-*.otf` font files under `src/renderer/src/fonts/` are **not** covered by that
license; they belong to their respective rights holder. They're included so the app's default
timing-tower styling works out of the box, but if you fork this project for wider redistribution,
consider swapping them for a font you have clear rights to.
