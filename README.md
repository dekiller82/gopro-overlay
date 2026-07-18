# GoPro Overlay

A desktop editor for burning GoPro telemetry (GPS, speed, lean angle, G-forces, lap/sector
timing…) directly into your video as a rendered overlay — no cloud upload, no subscription. Import
one or more GoPro clips, drag widgets onto the frame, and export a finished MP4 with everything
baked in.

Built with Electron, React, and TypeScript. Runs on Windows, macOS, and Linux.

## Features

- **Multi-clip import** — select every part of a chapter-split GoPro recording
  (`GH010230.MP4`, `GH020230.MP4`, ...) at once; they're stitched into a single timeline with
  continuous telemetry.
- **11 telemetry widgets**, each fully configurable (colors, fonts, size, smoothing) via the
  property panel:
  - GPS track map
  - Analog & digital speedometer
  - Timer (elapsed time or F1-style lap timing tower)
  - Sector timer
  - Delta time (vs. best lap)
  - Predictive lap timer
  - Apex speed callout
  - Speed/distance graph (full-lap or a scrolling window centered on the current position, with
    prior laps shown as reference traces)
  - G-Force friction circle (lateral vs. longitudinal G, from the onboard accelerometer)
  - Roll / lean angle (from the onboard gyroscope/gravity vector)
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
