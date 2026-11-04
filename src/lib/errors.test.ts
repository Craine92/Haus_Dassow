import { describe, expect, it } from 'vitest'
import { messageFor } from './errors'

describe('Fehlermeldungen aus Supabase', () => {
  it('zeigt PostgREST-Fehlerobjekte samt Code an', () => {
    const error = { code: '42501', message: 'new row violates row-level security policy', details: 'for table shopping_items' }
    const message = messageFor(error)
    expect(message).toContain('42501')
    expect(message).toContain('row-level security')
  })
  it('zeigt Fehlermeldungen aus Error-Instanzen an', () => {
    expect(messageFor(new Error('Bild konnte nicht hochgeladen werden'))).toContain('hochgeladen')
  })
  it('verhindert lange, unlesbare Fehlermeldungen', () => {
    expect(messageFor({ message: 'X'.repeat(9999) }).length).toBeLessThan(1000)
  })
})
