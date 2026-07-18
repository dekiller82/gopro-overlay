/**
 * Custom scheme used to serve local video files to the <video> element. Plain `file://` URLs get
 * blocked by Chromium's "URL safety check" when the page itself isn't loaded from a `file://`
 * origin -- which is exactly the case in dev (`npm run dev` serves the renderer from
 * `http://localhost:*` via the Vite dev server). A registered custom scheme isn't subject to that
 * same origin check, so it works identically in dev and in a packaged build. Registered as a
 * privileged scheme + handled via `protocol.handle` in src/main/index.ts.
 */
export const APP_VIDEO_SCHEME = 'gpo-video'

function encodePathForUrl(filePath: string): string {
  let p = filePath.replace(/\\/g, '/')
  if (!p.startsWith('/')) p = '/' + p

  return p
    .split('/')
    .map((segment, i) => (i === 1 && /^[a-zA-Z]:$/.test(segment) ? segment : encodeURIComponent(segment)))
    .join('/')
}

/** Converts an absolute filesystem path (Windows or POSIX) into a `gpo-video://` URL usable as a <video> src. */
export function toAppVideoUrl(filePath: string): string {
  return `${APP_VIDEO_SCHEME}://` + encodePathForUrl(filePath)
}

/** Converts an absolute filesystem path into a `file://` URL. Only used where a real file:// URL is required (not for <video> src -- use toAppVideoUrl for that). */
export function toFileUrl(filePath: string): string {
  return 'file://' + encodePathForUrl(filePath)
}
