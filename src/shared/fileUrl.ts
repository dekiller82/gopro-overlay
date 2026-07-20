/**
 * Custom scheme used to serve local video files to the <video> element. Plain `file://` URLs get
 * blocked by Chromium's "URL safety check" when the page itself isn't loaded from a `file://`
 * origin -- which is exactly the case in dev (`npm run dev` serves the renderer from
 * `http://localhost:*` via the Vite dev server). A registered custom scheme isn't subject to that
 * same origin check, so it works identically in dev and in a packaged build. Registered as a
 * privileged scheme + handled via `protocol.handle` in src/main/index.ts.
 */
export const APP_VIDEO_SCHEME = 'gpo-video'

// Placeholder authority for gpo-video:// URLs. Registering the scheme with `standard: true`
// makes Chromium parse it with the same "special scheme" rules as http/file -- but only the
// literal `file:` scheme gets the WHATWG-spec carve-out that tolerates an empty host. A custom
// standard scheme does not: an empty authority (`gpo-video:///home/...`, three slashes) gets its
// extra slash silently skipped, and the first real path segment is consumed as the host instead
// of staying in the pathname -- e.g. "/home/eren/x.mp4" loses "home" and becomes "/eren/x.mp4";
// "/C:/Users/x.mp4" loses "C:" and becomes "/Users/x.mp4". Verified directly against Chromium's
// own URL parser (`new URL()`/`<a href>`/`<video src>` all agree) on both a real POSIX path and a
// real Windows drive-letter path -- this silently broke every absolute path on every platform, it
// just went unnoticed on Windows until now. Giving the URL a real, unambiguous host removes the
// empty-authority slot entirely so there's nothing to skip.
const APP_VIDEO_HOST = 'local'

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
  return `${APP_VIDEO_SCHEME}://${APP_VIDEO_HOST}` + encodePathForUrl(filePath)
}

/** Converts an absolute filesystem path into a `file://` URL. Only used where a real file:// URL is required (not for <video> src -- use toAppVideoUrl for that). */
export function toFileUrl(filePath: string): string {
  return 'file://' + encodePathForUrl(filePath)
}
