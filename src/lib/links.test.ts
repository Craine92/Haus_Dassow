import { describe, expect, it } from 'vitest'
import { normalizeProductUrl, retailerFromUrl } from './links'

describe('Produktlinks', () => {
  it('erkennt Händler', () => {
    expect(retailerFromUrl('https://www.otto.de/p/test')).toBe('OTTO')
    expect(retailerFromUrl('https://www.amazon.de/dp/ABC')).toBe('Amazon')
  })

  it('blockiert aktive Protokolle', () => {
    expect(() => normalizeProductUrl('javascript:alert(1)')).toThrow()
  })
})
