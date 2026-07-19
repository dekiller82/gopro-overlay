/**
 * `ffmpeg-static`/`ffprobe-static` compute their own bundled binary's path via
 * `path.join(__dirname, ...)`, with zero awareness of Electron's asar packaging. In a packaged
 * build, `__dirname` for a module loaded from inside `app.asar` resolves to a path INSIDE the
 * packed archive -- but electron-builder's `asarUnpack` (see package.json) extracts matching files
 * to a REAL `app.asar.unpacked/` directory sitting next to `app.asar` at build time instead of
 * packing them in. The path these packages report is therefore simply wrong: it points at a
 * location inside the archive where the real file no longer lives.
 *
 * `child_process.spawn`/`execFile` don't go through Electron's asar-aware `fs` shim (that only
 * covers Node's own `fs` module, for reading) -- they hand the raw path straight to the OS, which
 * has no concept of asar at all. Since `app.asar` itself is a single real file (not a directory),
 * the OS fails trying to resolve anything past it in the path, surfacing as `ENOTDIR` (seen in the
 * wild on a packaged Linux AppImage) or `ENOENT` depending on the platform's exact path-walking
 * behavior -- either way, the spawn never finds a real, executable file.
 *
 * Rewriting the literal `app.asar` path segment to `app.asar.unpacked` points at the real file
 * electron-builder actually placed there. A no-op in dev/unpackaged builds, where the path never
 * contains `app.asar` in the first place.
 */
export function resolveUnpackedBinaryPath(rawPath: string): string
export function resolveUnpackedBinaryPath(rawPath: string | null): string | null
export function resolveUnpackedBinaryPath(rawPath: string | null): string | null {
  return rawPath ? rawPath.replace('app.asar', 'app.asar.unpacked') : rawPath
}
