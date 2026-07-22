import { GlobalFonts } from '@napi-rs/canvas'

// `loadSystemFonts` exists on the real GlobalFonts object at runtime (verified directly) but is
// missing from this installed version's own .d.ts -- a type-declaration gap in the library itself,
// not a typo here. `IGlobalFonts` isn't exported from '@napi-rs/canvas' so it can't be augmented via
// normal declaration merging; this local cast is the narrowest fix. Shared by registerFonts.ts too,
// so the workaround lives in exactly one place.
interface GlobalFontsWithSystemFonts {
  loadSystemFonts(): void
}

/** Idempotent -- safe to call repeatedly (e.g. once at renderer startup, once again per export). */
export function loadSystemFontsIntoGlobalFonts(): void {
  ;(GlobalFonts as unknown as GlobalFontsWithSystemFonts).loadSystemFonts()
}

/**
 * Real OS-installed font family names, via the same `@napi-rs/canvas` API export rendering uses to
 * register/use fonts (`GlobalFonts`) -- so whatever this returns is guaranteed usable by the export
 * pipeline too, not just enumerable.
 */
export function listSystemFonts(): string[] {
  loadSystemFontsIntoGlobalFonts()
  const families = GlobalFonts.families.map((f) => f.family)
  return [...new Set(families)].sort((a, b) => a.localeCompare(b))
}
