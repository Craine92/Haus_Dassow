export const STATUSES = ['Wunschliste', 'Bestellt', 'Gekauft'] as const
export const PRIORITIES = ['Einzug', 'Später', 'Prüfen', 'Projekt'] as const

export type ItemStatus = (typeof STATUSES)[number]
export type ItemPriority = (typeof PRIORITIES)[number]

export interface Household {
  id: string
  name: string
  owner_id: string
  budget_cents: number
  created_at: string
  updated_at: string
}

export interface ShoppingItem {
  household_id: string
  id: string
  name: string
  description: string
  price_cents: number
  quantity: number
  room: string
  retailer: string
  priority: ItemPriority
  status: ItemStatus
  url: string
  image_path: string | null
  image_url?: string | null
  note: string
  source: string
  origin: string
  position: number
  created_at?: string
  updated_at?: string
  updated_by?: string | null
}

export type ItemDraft = Omit<ShoppingItem, 'household_id' | 'image_url'>

export interface ImportPreview {
  items: ItemDraft[]
  images: Map<string, Blob>
  duplicatesInFile: number
  existingIds: number
  totalCents: number
  sourceBudgetCents: number | null
}
