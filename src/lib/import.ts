import { parseEuroToCents, sumItems } from './money'
import { normalizeProductUrl, retailerFromUrl } from './links'
import { PRIORITIES, STATUSES, type ImportPreview, type ItemDraft, type ItemPriority, type ItemStatus } from '../types'

const DATA_IMAGE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=\s]+)$/i

const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)
const integer = (value: unknown, fallback: number, min: number, max: number) => {
  const result = Math.trunc(Number(value))
  return Number.isFinite(result) ? Math.min(max, Math.max(min, result)) : fallback
}

function dataUrlToBlob(value: string): Blob | null {
  const match = DATA_IMAGE.exec(value)
  if (!match) return null
  const bytes = atob(match[2].replace(/\s/g, ''))
  const buffer = new Uint8Array(bytes.length)
  for (let index = 0; index < bytes.length; index += 1) buffer[index] = bytes.charCodeAt(index)
  return new Blob([buffer], { type: match[1].toLowerCase() })
}

function stableFallbackId(name: string, index: number) {
  const slug = name.toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `import-${String(index + 1).padStart(3, '0')}-${slug.slice(0, 70) || 'artikel'}`
}

export function parseImportFile(raw: string, existingItemIds: Set<string> = new Set()): ImportPreview {
  const parsed: unknown = JSON.parse(raw)
  const root = Array.isArray(parsed) ? { items: parsed } : parsed as Record<string, unknown>
  if (!root || !Array.isArray(root.items)) throw new Error('Die JSON-Datei enthält keine Artikelliste.')
  if (root.items.length === 0 || root.items.length > 1000) throw new Error('Die Datei muss 1 bis 1.000 Artikel enthalten.')

  const seen = new Set<string>()
  const images = new Map<string, Blob>()
  let duplicatesInFile = 0
  let existingIds = 0

  const items = root.items.map((entry, index): ItemDraft => {
    if (!entry || typeof entry !== 'object') throw new Error(`Artikel ${index + 1} ist ungültig.`)
    const value = entry as Record<string, unknown>
    const name = text(value.name ?? value.title, 170)
    if (!name) throw new Error(`Artikel ${index + 1} hat keinen Namen.`)
    const id = text(value.id ?? value.source_id, 100) || stableFallbackId(name, index)
    if (seen.has(id)) duplicatesInFile += 1
    seen.add(id)
    if (existingItemIds.has(id)) existingIds += 1

    let url = ''
    const inputUrl = text(value.url ?? value.link, 3000)
    if (inputUrl) {
      try { url = normalizeProductUrl(inputUrl) } catch { url = '' }
    }
    const rawImage = text(value.image ?? value.image_url ?? value.imageUrl, 20_000_000)
    const imageBlob = rawImage ? dataUrlToBlob(rawImage) : null
    if (imageBlob) images.set(id, imageBlob)

    const priorityInput = text(value.priority ?? value.phase, 30)
    const statusInput = text(value.status, 30)
    const priceCents = value.price_cents != null
      ? integer(value.price_cents, 0, 0, 999_999_999_999)
      : parseEuroToCents(value.price ?? 0)

    return {
      id,
      name,
      description: text(value.description, 500),
      price_cents: priceCents,
      quantity: integer(value.quantity, 1, 1, 9999),
      room: text(value.room, 100) || 'Sonstiges',
      retailer: text(value.retailer, 100) || retailerFromUrl(url),
      priority: (PRIORITIES as readonly string[]).includes(priorityInput) ? priorityInput as ItemPriority : 'Einzug',
      status: (STATUSES as readonly string[]).includes(statusInput) ? statusInput as ItemStatus : 'Wunschliste',
      url,
      image_path: null,
      note: text(value.note, 3000),
      source: text(value.source, 100),
      origin: text(value.origin, 100),
      position: integer(value.position, index, -1000000, 1000000),
      created_at: typeof value.created_at === 'string' ? value.created_at : undefined,
      updated_at: undefined,
      updated_by: null,
    }
  })

  const deduplicated = Array.from(new Map(items.map((item) => [item.id, item])).values())
  const budgetValue = root.budget_cents ?? root.budget
  const sourceBudgetCents = budgetValue == null ? null : root.budget_cents != null
    ? integer(budgetValue, 0, 0, 999_999_999_999)
    : parseEuroToCents(budgetValue)

  return {
    items: deduplicated,
    images,
    duplicatesInFile,
    existingIds,
    totalCents: sumItems(deduplicated),
    sourceBudgetCents,
  }
}
