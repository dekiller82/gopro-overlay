import { describe, expect, it } from 'vitest'
import { FALLBACK_FONT_STACK, FORMULA1_BOLD, FORMULA1_FONT_ID, FORMULA1_REGULAR, resolveFontStack } from './fonts'

describe('resolveFontStack', () => {
  it('resolves to the bundled Formula1 pairing when fontFamily is falsy', () => {
    expect(resolveFontStack(undefined, 'bold')).toBe(`"${FORMULA1_BOLD}", ${FALLBACK_FONT_STACK}`)
    expect(resolveFontStack(null, 'regular')).toBe(`"${FORMULA1_REGULAR}", ${FALLBACK_FONT_STACK}`)
    expect(resolveFontStack('', 'bold')).toBe(`"${FORMULA1_BOLD}", ${FALLBACK_FONT_STACK}`)
  })

  it('resolves to the bundled Formula1 pairing when fontFamily is the explicit sentinel', () => {
    expect(resolveFontStack(FORMULA1_FONT_ID, 'bold')).toBe(`"${FORMULA1_BOLD}", ${FALLBACK_FONT_STACK}`)
    expect(resolveFontStack(FORMULA1_FONT_ID, 'regular')).toBe(`"${FORMULA1_REGULAR}", ${FALLBACK_FONT_STACK}`)
  })

  it('uses the given family name directly for a real system font, same string for both weights', () => {
    expect(resolveFontStack('Arial', 'bold')).toBe(`"Arial", ${FALLBACK_FONT_STACK}`)
    expect(resolveFontStack('Arial', 'regular')).toBe(`"Arial", ${FALLBACK_FONT_STACK}`)
  })

  it('an explicit literal bundled font name overrides the weight argument -- picking "Formula1 Bold" directly forces Bold even where a widget would otherwise ask for Regular', () => {
    expect(resolveFontStack(FORMULA1_BOLD, 'regular')).toBe(`"${FORMULA1_BOLD}", ${FALLBACK_FONT_STACK}`)
    expect(resolveFontStack(FORMULA1_REGULAR, 'bold')).toBe(`"${FORMULA1_REGULAR}", ${FALLBACK_FONT_STACK}`)
  })
})
