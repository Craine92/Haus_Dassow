import { describe, expect, it } from 'vitest'
import { parseEuroToCents, sumItems } from './money'

describe('Geldberechnung', () => {
  it('verarbeitet deutsche und numerische Beträge in Cent', () => {
    expect(parseEuroToCents('1.299,95 €')).toBe(129995)
    expect(parseEuroToCents(10.499)).toBe(1050)
  })

  it('summiert Stückpreis mal Anzahl ohne Float-Fehler', () => {
    expect(sumItems([{ price_cents: 1999, quantity: 3 }, { price_cents: 1, quantity: 2 }])).toBe(5999)
  })
})
