import { normalizeProductUrl, retailerFromUrl } from './links'

export interface SharedProduct {
  name: string
  url: string
  retailer: string
  note: string
}

function cleanUrl(value: string): string {
  try {
    return normalizeProductUrl(value.trim().replace(/[),;.!?]+$/, ''))
  } catch {
    return ''
  }
}

/** Öffnet geteilte Links als Entwurf, niemals als automatischen Datenbank-Write. */
export function parseIncomingShare(query: string): SharedProduct | null {
  const params = new URLSearchParams(query)
  const sharedText = (params.get('text') ?? '').slice(0, 3000)
  const rawUrl = params.get('url') || params.get('share_url') || ''
  const textUrl = sharedText.match(/https?:\/\/[^\s<>"']+/i)?.[0] || ''
  const url = cleanUrl(rawUrl) || cleanUrl(textUrl)
  if (!url) return null
  const title = (params.get('title') ?? '').trim().slice(0, 170)
  const retailer = retailerFromUrl(url)
  const name = title || `${retailer || 'Neues'} Produkt`
  const note = sharedText.replace(textUrl, '').trim().slice(0, 3000)
  return { name, url, retailer, note }
}
