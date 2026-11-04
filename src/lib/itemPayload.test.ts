import { describe, expect, it } from 'vitest'
import { itemUpsertPayload } from './itemPayload'
import type { ItemDraft } from '../types'

const example: ItemDraft = {
  id: 'moebel-1', name: 'Schrank', description: '', price_cents: 54900, quantity: 1, room: 'Schlafzimmer',
  retailer: 'OTTO', priority: 'Einzug', status: 'Wunschliste', url: '', image_path: null,
  note: '', source: 'Import', origin: 'Import', position: 0, updated_by: null,
}

describe('Datenbank-Payload für vorhandene und importierte Artikel', () => {
  const timestamp = '2026-11-04T14:30:00.000Z'

  it('setzt created_at bei Importdaten ohne Datum explizit', () => {
    const result = itemUpsertPayload('haushalt-uuid', example, timestamp)
    expect(result.created_at).toBe(timestamp)
    expect(result.household_id).toBe('haushalt-uuid')
    expect(result.price_cents).toBe(54900)
    expect(result.image_path).toBeNull()
  })

  it('behält created_at bei erneutem Import bestehender Artikel', () => {
    const original = '2026-01-15T08:00:00.000Z'
    const result = itemUpsertPayload('haushalt-uuid', { ...example, created_at: original }, timestamp)
    expect(result.created_at).toBe(original)
  })

  it('weist leere und ungültige Zeitstempel auf eine gültige Zeit zurück', () => {
    expect(itemUpsertPayload('h', { ...example, created_at: '' }, timestamp).created_at).toBe(timestamp)
    expect(itemUpsertPayload('h', { ...example, created_at: 'ungültig' }, timestamp).created_at).toBe(timestamp)
  })
})
