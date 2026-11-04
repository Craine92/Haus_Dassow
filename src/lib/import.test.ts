import { describe, expect, it } from 'vitest'
import { parseImportFile } from './import'

describe('privater JSON-Import', () => {
  it('ist über IDs idempotent und rechnet Cent korrekt', () => {
    const source = JSON.stringify({ items: [
      { id: 'stuhl-1', name: 'Stuhl', price: '49,99', quantity: 2, phase: 'Später' },
      { id: 'stuhl-1', name: 'Stuhl aktualisiert', price: 50, quantity: 2 },
    ] })
    const result = parseImportFile(source, new Set(['stuhl-1']))
    expect(result.items).toHaveLength(1)
    expect(result.duplicatesInFile).toBe(1)
    expect(result.existingIds).toBe(2)
    expect(result.totalCents).toBe(10000)
  })

  it('entfernt unsichere Links statt sie zu importieren', () => {
    const result = parseImportFile(JSON.stringify([{ id: 'x', name: 'X', url: 'javascript:alert(1)' }]))
    expect(result.items[0].url).toBe('')
  })
})
