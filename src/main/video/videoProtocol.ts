import { protocol } from 'electron'
import { createReadStream, statSync } from 'fs'
import { Readable } from 'stream'
import type { ReadableStream as NodeWebReadableStream } from 'stream/web'
import { APP_VIDEO_SCHEME } from '../../shared/fileUrl'

/** Must run before app.whenReady(). Marks the scheme as "standard" (so URLs parse like file://, with a real path) and secure/fetchable so <video> will treat it like any normal media origin. */
export function registerVideoProtocolPrivilege(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_VIDEO_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true,
        corsEnabled: true
      }
    }
  ])
}

function requestUrlToFilePath(requestUrl: string): string {
  const url = new URL(requestUrl)
  let filePath = decodeURIComponent(url.pathname)
  // Windows drive-letter paths arrive as "/C:/Users/..." -- strip the leading slash.
  if (/^\/[a-zA-Z]:\//.test(filePath)) filePath = filePath.slice(1)
  return filePath
}

function contentTypeFor(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop()
  switch (ext) {
    case 'mp4':
      return 'video/mp4'
    case 'webm':
      return 'video/webm'
    case 'mov':
      return 'video/quicktime'
    // GoPro's low-res proxy sidecar (see main/video/lrv.ts) -- a completely standard MP4/H.264
    // container despite the unusual extension, so <video> needs the same content-type as .mp4 to
    // recognize and play it.
    case 'lrv':
      return 'video/mp4'
    default:
      return 'application/octet-stream'
  }
}

function nodeStreamToResponseBody(stream: NodeJS.ReadableStream): ReadableStream {
  return Readable.toWeb(stream as Readable) as unknown as ReadableStream
}

/**
 * Must run after app.whenReady(). Serves local files for gpo-video:// URLs with real HTTP Range
 * support (206 + Content-Range), which the <video> element requires for seeking to work.
 * `net.fetch` on a file:// URL silently truncates the body to match a Range request but never
 * sets status 206 or Content-Range -- a 200 response with a truncated body reads to the browser
 * as "this is the whole file", which breaks scrubbing. So we implement Range handling manually.
 */
export function registerVideoProtocolHandler(): void {
  protocol.handle(APP_VIDEO_SCHEME, (request) => {
    const filePath = requestUrlToFilePath(request.url)

    let size: number
    try {
      size = statSync(filePath).size
    } catch {
      return new Response('Not found', { status: 404 })
    }

    const contentType = contentTypeFor(filePath)
    const rangeHeader = request.headers.get('range')

    if (!rangeHeader) {
      return new Response(nodeStreamToResponseBody(createReadStream(filePath)) as NodeWebReadableStream as ReadableStream, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(size),
          'Accept-Ranges': 'bytes'
        }
      })
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)
    if (!match || (!match[1] && !match[2])) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    }

    let start: number
    let end: number
    if (match[1] === '') {
      // Suffix range, e.g. "bytes=-500" = last 500 bytes.
      const suffixLength = parseInt(match[2], 10)
      start = Math.max(0, size - suffixLength)
      end = size - 1
    } else {
      start = parseInt(match[1], 10)
      end = match[2] ? parseInt(match[2], 10) : size - 1
    }
    end = Math.min(end, size - 1)

    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    }

    return new Response(
      nodeStreamToResponseBody(createReadStream(filePath, { start, end })) as NodeWebReadableStream as ReadableStream,
      {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes'
        }
      }
    )
  })
}
