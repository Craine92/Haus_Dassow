import { describe, expect, it } from 'vitest'
import { itemFields, itemUpdatePayload, itemUpsertPayload } from './itemPayload'
import type { ItemDraft, ShoppingItem } from '../types'

const example: ItemDraft = {
  id: 'moebel-1', name: 'Schrank', description: '', price_cents: 54900, quantity: 1, room: 'Schlafzimmer',
  retailer: 'OTTO', priority: 'Einzug', status: 'Wunschliste', url: '', image_path: null,
  note: '', source: 'Import', origin: 'Import', position: 0, updated_by: null,
}

describe('Schreibpayload nur mit erlaubten Postgres-Feldern', () => {
  const timestamp = '2026-11-04T14:30:00.000Z'
  const signed: ShoppingItem = {
    ...example, household_id: 'h', created_at: timestamp,
    image_url: 'https://public.example.com/temporary-signed-image',
    updated_at: timestamp, updated_by: null,
  }

  it('schließt das zusätzliche UI-Feld image_url sowie alle managed Felder aus', () => {
    const update = itemUpdatePayload(signed)
    expect(update).toMatchObject({ id: example.id, name: 'Schrank', status: 'Wunschliste' })
    expect(Object.keys(update)).not.toContain('image_url')
    expect(Object.keys(update)).not.toContain('household_id')
    expect(Object.keys(update)).not.toContain('updated_by')
    expect(Object.keys(update)).not.toContain('created_at')
    expect(Object.keys(update)).not.toContain('updated_at')
    const inserted = itemUpsertPayload('h', signed, timestamp)
    expect(Object.keys(inserted)).not.toContain('image_url')
    expect(Object.keys(inserted)).not.toContain('updated_by')
  })

  it('setzt created_at bei neuen Importdaten explizit', () => {
    const result = itemUpsertPayload('haushalt-uuid', example, timestamp)
    expect(result.created_at).toBe(timestamp)
    expect(result.updated_at).toBe(timestamp)
    expect(result.household_id).toBe('haushalt-uuid')
    expect(result.price_cents).toBe(54900)
    expect(result.image_path).toBeNull()
  })

  it('behält created_at beim Wiederimport vorhandener Artikel', () => {
    const original = '2026-01-15T08:00:00.000Z'
    const result = itemUpsertPayload('haushalt-uuid', { ...example, created_at: original }, timestamp)
    expect(result.created_at).toBe(original)
  })

  it('fällt bei fehlenden oder ungültigen Erstellungsdaten auf Jetzt zurück', () => {
    expect(itemUpsertPayload('h', { ...example, created_at: '' }, timestamp).created_at).toBe(timestamp)
    expect(itemUpsertPayload('h', { ...example, created_at: 'falsch' }, timestamp).created_at).toBe(timestamp)
  })

  it('erhält alle 15 erlaubten fachlichen Felder', () => {
    expect(Object.keys(itemFields(example))).toHaveLength(15)
  })
})
