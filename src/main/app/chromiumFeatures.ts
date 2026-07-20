/**
 * Chromium `--enable-features` values this app wants active before `app.whenReady()`, combined
 * into ONE list per platform (not multiple separate `appendSwitch('enable-features', ...)` calls --
 * that overwrites the previous value on a repeated switch name rather than merging it).
 *
 * These exist because Chromium's own hardware video decode paths aren't active by default on every
 * platform, which is the REAL reason native <video> playback of GoPro H.264/HEVC footage can fail
 * outright (and the preview-proxy transcode fallback exists at all) -- not a codec this build can
 * never decode. Each is platform-gated since it targets a different OS's own decode API. Harmless
 * no-op wherever the platform/GPU doesn't actually support a given one; if HW decode still isn't
 * available/working on a given machine, native playback fails exactly as before and the existing
 * proxy/transcode fallback still catches it.
 */
export function chromiumFeaturesFor(platform: NodeJS.Platform): string[] {
  // Stock Electron/Chromium HW-decode path for HEVC, present from Electron 22+, but the platform
  // (OS-level, e.g. Windows Media Foundation) decoder isn't always active by default.
  const features = ['PlatformHEVCDecoderSupport']

  if (platform === 'linux') {
    // VA-API hardware video decode -- Chromium doesn't enable this on Linux by default at all (and
    // doesn't consider it officially supported there), so without it every GoPro clip's H.264/HEVC
    // falls back to a software decoder Electron's own FFmpeg build doesn't include (patent-licensed
    // codecs), failing native preview outright regardless of how fast the source file itself loads.
    features.push('AcceleratedVideoDecodeLinuxZeroCopyGL', 'AcceleratedVideoDecodeLinuxGL')
  }

  return features
}
