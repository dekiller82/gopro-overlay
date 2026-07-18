import { loadImage, type Image } from '@napi-rs/canvas'

/** Widget style stores the user's custom logo as a data URL (small image, fully self-contained in
 *  the project JSON -- no external file path to keep valid across machines/moves). `loadImage`
 *  doesn't document data-URL string support, so the base64 payload is decoded to a Buffer directly. */
export async function loadHeaderImageFromDataUrl(dataUrl: string): Promise<Image> {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const buffer = Buffer.from(base64, 'base64')
  return loadImage(buffer)
}
