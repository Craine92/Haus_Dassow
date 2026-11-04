import { describe, expect, it } from 'vitest'
import { parseImportFile } from './import'

describe('private Haus-Dassow-JSON', () => {
  it('liest die ursprüngliche Datenstruktur mit 46 Artikeln und 7 eingebetteten Bildern', () => {
    const items = Array.from({ length: 46 }, (_, index) => ({
      id: `original-${String(index + 1).padStart(2, '0')}`,
      name: `Testmöbel ${index + 1}`,
      price: index === 0 ? 10498.76 : 0,
      quantity: 1,
      room: 'Wohnzimmer',
      phase: 'Einzug',
      status: 'Wunschliste',
      retailer: 'OTTO',
      image: index < 7 ? 'data:image/webp;base64,AAEC' : '',
    }))
    const preview = parseImportFile(JSON.stringify({ version: 1, budget: 12000, items }))
    expect(preview.items).toHaveLength(46)
    expect(preview.images.size).toBe(7)
    expect(preview.totalCents).toBe(1_049_876)
    expect(preview.sourceBudgetCents).toBe(1_200_000)
    expect(preview.items[0].priority).toBe('Einzug')
  })

  it('gibt eine verständliche Fehlermeldung bei ungültigen Daten', () => {
    expect(() => parseImportFile('{}')).toThrow(/keine Artikelliste/)
    expect(() => parseImportFile('{ungültig')).toThrow()
  })
})
