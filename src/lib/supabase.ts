import { createClient, type RealtimeChannel, type Session } from '@supabase/supabase-js'
import type { Household, ItemDraft, ShoppingItem } from '../types'
import { itemUpsertPayload } from './itemPayload'

const runtimeConfig = window.HAUS_DASSOW_CONFIG
const url = import.meta.env.VITE_SUPABASE_URL?.trim() || runtimeConfig?.url?.trim() || ''
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || runtimeConfig?.key?.trim() || ''

export const isSupabaseConfigured = Boolean(url && key)
export const supabase = isSupabaseConfigured ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

function client() {
  if (!supabase) throw new Error('Supabase ist noch nicht konfiguriert.')
  return supabase
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await client().auth.getSession()
  if (error) throw error
  return data.session
}

export async function loadHousehold(): Promise<Household | null> {
  const { data, error } = await client().from('households').select('*').maybeSingle()
  if (error) throw error
  return data as Household | null
}

export async function createHousehold(name: string): Promise<string> {
  const { data, error } = await client().rpc('create_household', { p_name: name })
  if (error) throw error
  return data as string
}

export async function joinHousehold(code: string): Promise<string> {
  const { data, error } = await client().rpc('join_household', { p_code: code.trim() })
  if (error) throw error
  return data as string
}

export async function createInvite(): Promise<string> {
  const { data, error } = await client().rpc('create_household_invite')
  if (error) throw error
  return data as string
}

export async function loadItems(householdId: string): Promise<ShoppingItem[]> {
  const { data, error } = await client().from('shopping_items').select('*')
    .eq('household_id', householdId).order('position').order('created_at')
  if (error) throw error
  return (data ?? []) as ShoppingItem[]
}

export async function addSignedImageUrls(items: ShoppingItem[]): Promise<ShoppingItem[]> {
  const paths = items.flatMap((item) => item.image_path ? [item.image_path] : [])
  if (!paths.length) return items
  const { data, error } = await client().storage.from('product-images').createSignedUrls(paths, 3600)
  if (error) throw error
  const urls = new Map(paths.map((path, index) => [path, data?.[index]?.signedUrl ?? null]))
  return items.map((item) => ({ ...item, image_url: item.image_path ? urls.get(item.image_path) : null }))
}

export async function saveItem(householdId: string, item: ItemDraft): Promise<void> {
  const { error } = await client().from('shopping_items').upsert(itemUpsertPayload(householdId, item), {
    onConflict: 'household_id,id',
  })
  if (error) throw error
}

export async function saveItems(householdId: string, items: ItemDraft[]): Promise<void> {
  for (let index = 0; index < items.length; index += 50) {
    const rows = items.slice(index, index + 50).map((item) => itemUpsertPayload(householdId, item))
    const { error } = await client().from('shopping_items').upsert(rows, { onConflict: 'household_id,id' })
    if (error) throw error
  }
}

/** Ein vorhandenes Produktbild ändern, ohne den ursprünglichen created_at-Wert zu überschreiben. */
export async function setItemImagePath(householdId: string, id: string, imagePath: string): Promise<void> {
  const { data, error } = await client().from('shopping_items')
    .update({ image_path: imagePath })
    .eq('household_id', householdId)
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Produkt für Bildaktualisierung nicht gefunden oder keine Berechtigung.')
}

export async function deleteItem(householdId: string, id: string): Promise<void> {
  const { error } = await client().from('shopping_items').delete().eq('household_id', householdId).eq('id', id)
  if (error) throw error
}

export async function updateBudget(householdId: string, budgetCents: number): Promise<void> {
  const { error } = await client().from('households').update({ budget_cents: budgetCents }).eq('id', householdId)
  if (error) throw error
}

export async function uploadImage(householdId: string, itemId: string, file: Blob): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Das Bild darf höchstens 10 MB groß sein.')
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Nicht unterstütztes Bildformat.')
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' } as Record<string, string>)[file.type]
  const safeItemId = itemId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100)
  const path = `${householdId}/${safeItemId}/${crypto.randomUUID()}.${extension}`
  const { error } = await client().storage.from('product-images').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return path
}

export async function removeImage(path: string | null): Promise<void> {
  if (!path) return
  const { error } = await client().storage.from('product-images').remove([path])
  if (error) throw error
}

export async function resolveProductImage(householdId: string, itemId: string): Promise<{ ok: boolean; status?: string; reason?: string }> {
  const { data, error } = await client().functions.invoke('resolve-product-image', {
    body: { householdId, itemId },
  })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 404) throw new Error('Bilddienst ist noch nicht in Supabase veröffentlicht. Edge Function resolve-product-image deployen.')
    throw new Error(error.message || 'Bilddienst nicht erreichbar')
  }
  if (!data || typeof data !== 'object') throw new Error('Ungültige Antwort vom Bilddienst')
  if (typeof data.error === 'string') throw new Error(data.error)
  return { ok: data.ok === true, status: data.status, reason: data.reason }
}

export function subscribeToHousehold(householdId: string, refresh: () => void): RealtimeChannel {
  return client().channel(`household-${householdId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter: `household_id=eq.${householdId}` }, refresh)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'households', filter: `id=eq.${householdId}` }, refresh)
    .subscribe()
}
