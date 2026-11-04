import type { ItemDraft } from '../types'

/**
 * PostgRESTs Bulk-Upsert setzt bei fehlenden Feldern je nach Schema-Cache
 * NULL statt eines DB-Defaults. created_at ist NOT NULL und muss daher auch
 * für importierte Altdaten explizit vorhanden sein.
 *
 * Bei bestehenden Datensätzen den ursprünglichen Zeitstempel beibehalten.
 */
export function itemUpsertPayload(householdId: string, item: ItemDraft, nowIso = new Date().toISOString()) {
  const createdAt = typeof item.created_at === 'string' && !Number.isNaN(Date.parse(item.created_at))
    ? item.created_at
    : nowIso
  return {
    ...item,
    household_id: householdId,
    created_at: createdAt,
  }
}
