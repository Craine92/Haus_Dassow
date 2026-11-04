import type { ItemDraft } from '../types'

/**
 * Supabase-Datenbankpayload aus genau den echten Tabellenspalten zusammenstellen.
 * ShoppingItem kommt aus der UI mit zusätzlichem image_url (signed storage URL),
 * das KEINE Datenbankspalte ist und niemals gespeichert werden darf.
 */
export function itemFields(item: ItemDraft) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price_cents: item.price_cents,
    quantity: item.quantity,
    room: item.room,
    retailer: item.retailer,
    priority: item.priority,
    status: item.status,
    url: item.url,
    image_path: item.image_path,
    note: item.note,
    source: item.source,
    origin: item.origin,
    position: item.position,
  }
}

export function itemUpdatePayload(item: ItemDraft) {
  // Erstellungsdatum, Datenbanktrigger-Felder und Haushalt-ID NIE überschreiben.
  return itemFields(item)
}

export function itemUpsertPayload(householdId: string, item: ItemDraft, nowIso = new Date().toISOString()) {
  const validTime = typeof item.created_at === 'string' && !Number.isNaN(Date.parse(item.created_at))
  return {
    ...itemFields(item),
    household_id: householdId,
    created_at: validTime ? item.created_at! : nowIso,
    updated_at: nowIso,
  }
}
