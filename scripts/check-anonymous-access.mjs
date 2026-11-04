import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const source = await readFile(new URL('../web/config.js', import.meta.url), 'utf8')
const url = source.match(/url\s*:\s*["']([^"']+)["']/)?.[1]?.trim()
const key = source.match(/key\s*:\s*["']([^"']+)["']/)?.[1]?.trim()
if (!url || !key) throw new Error('Öffentliche Supabase-Konfiguration fehlt.')

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const failures = []

for (const table of ['households', 'household_members', 'shopping_items', 'household_invites']) {
  const { data, error } = await client.from(table).select('*').limit(1)
  if (!error && data?.length) failures.push(`${table}: anonymer Zugriff lieferte private Zeilen`)
}

const { error: rpcError } = await client.rpc('create_household', { p_name: 'Nicht erlaubt' })
if (!rpcError) failures.push('create_household: anonymer RPC-Aufruf wurde zugelassen')

const { data: storageData, error: storageError } = await client.storage.from('product-images').list('', { limit: 1 })
if (!storageError && storageData?.length) failures.push('product-images: anonymer Zugriff lieferte Objekte')

if (failures.length) throw new Error(failures.join('\n'))
console.log('OK: Anonyme REST-, RPC- und Storage-Zugriffe liefern keine privaten Daten.')
