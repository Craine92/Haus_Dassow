// Haus Dassow: Bilder für bereits gespeicherte Shop-Produkte nachladen.
// Nur auf expliziten Benutzerklick; bestehende Artikel/Bilder/Preise unverändert.
// Deployment: npx supabase functions deploy resolve-product-image --project-ref fjzazoftorwyhvfywbdi
import { createClient } from 'npm:@supabase/supabase-js@2'

const PAGE_HOSTS = new Set(['www.otto.de', 'otto.de', 'www.amazon.de', 'amazon.de'])
const IMAGE_DOMAINS = ['otto.de', 'otto-cdn.de', 'media-amazon.com', 'ssl-images-amazon.com']
const MAX_HTML = 1_800_000
const MAX_IMAGE = 5_000_000
const ORIGINS = new Set(['https://craine92.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173'])

function json(body: Record<string, unknown>, status = 200, origin = ''): Response {
  const cors = ORIGINS.has(origin) ? origin : 'https://craine92.github.io'
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': cors,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Vary': 'Origin',
  } })
}
function validPageUrl(input: string): URL | null {
  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !PAGE_HOSTS.has(url.hostname.toLowerCase())) return null
    if (url.hostname.endsWith('otto.de') && !url.pathname.startsWith('/p/')) return null
    if (url.hostname.endsWith('amazon.de') && !(/\/dp\//i.test(url.pathname) || /\/gp\/product\//i.test(url.pathname))) return null
    return url
  } catch { return null }
}
function validImageUrl(input: string, base: string): URL | null {
  try {
    const url = new URL(input, base)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null
    if (!IMAGE_DOMAINS.some((domain) => host === domain || host.endsWith('.' + domain))) return null
    return url
  } catch { return null }
}
function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|quot|apos|lt|gt);/gi, (match, inner: string) => {
    const key = inner.toLowerCase()
    if (key === 'amp') return '&'
    if (key === 'quot') return '"'
    if (key === 'apos') return "'"
    if (key === 'lt') return '<'
    if (key === 'gt') return '>'
    if (key.startsWith('#')) {
      const number = key.startsWith('#x') ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10)
      return Number.isFinite(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : match
    }
    return match
  })
}
function attr(tag: string, name: string): string {
  const escaped = name.replace(/[.*+?^$()|[\]{}]/g, '\\$&')
  const rx = new RegExp('(?:\\s|^)' + escaped + '\\s*=\\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\\s>]+))', 'i')
  const m = rx.exec(tag)
  return decodeEntities((m?.[1] || m?.[2] || m?.[3] || '').trim())
}
function imageFromHtml(html: string, sourceUrl: string): URL | null {
  const tags = html.match(/<meta\b[^>]*>/gi) || []
  const candidates = new Map<string, string>()
  for (const tag of tags) {
    const property = (attr(tag, 'property') || attr(tag, 'name')).toLowerCase()
    const content = attr(tag, 'content')
    if (property && content && !candidates.has(property)) candidates.set(property, content)
  }
  for (const name of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) {
    const image = candidates.get(name)
    if (image) {
      const valid = validImageUrl(image, sourceUrl)
      if (valid && !/logo|placeholder|no-image/i.test(valid.pathname)) return valid
    }
  }
  return null
}
async function safeGet(url: URL, mode: 'html' | 'image'): Promise<{ bytes: Uint8Array; finalUrl: URL; type: string }> {
  const max = mode === 'html' ? MAX_HTML : MAX_IMAGE
  let current = url
  for (let redirect = 0; redirect < 3; redirect++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    let response: Response
    try {
      response = await fetch(current.href, {
        redirect: 'manual', signal: controller.signal,
        headers: { Accept: mode === 'html' ? 'text/html' : 'image/avif,image/webp,image/png,image/jpeg,image/gif' },
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw Error('Weiterleitung ohne Ziel')
        const next = mode === 'html' ? validPageUrl(new URL(location, current).href) : validImageUrl(location, current.href)
        if (!next) throw Error('Weiterleitung auf eine nicht freigegebene Domain')
        current = next
        await response.body?.cancel()
        continue
      }
      if (!response.ok) throw Error('Shop antwortet mit HTTP ' + response.status)
      const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      if (mode === 'html' && type !== 'text/html') throw Error('Shop hat keine HTML-Produktseite geliefert')
      if (mode === 'image' && !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)) throw Error('Kein unterstütztes Produktbild')
      const length = Number(response.headers.get('content-length') || 0)
      if (length > max) throw Error('Antwort ist zu groß')
      const reader = response.body?.getReader()
      if (!reader) throw Error('Leere Antwort')
      const chunks: Uint8Array[] = []
      let total = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          total += value.length
          if (total > max) throw Error('Antwort überschreitet Größenlimit')
          chunks.push(value)
        }
      } finally { void reader.cancel().catch(() => {}) }
      const result = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
      return { bytes: result, finalUrl: current, type }
    } finally { clearTimeout(timeout) }
  }
  throw Error('Zu viele Weiterleitungen')
}
Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || ''
  if (origin && !ORIGINS.has(origin)) return json({ error: 'Nicht freigegebene Herkunft' }, 403, origin)
  if (request.method === 'OPTIONS') return json({}, 200, origin)
  if (request.method !== 'POST') return json({ error: 'POST erforderlich' }, 405, origin)
  const authorization = request.headers.get('authorization') || ''
  const token = /^Bearer (.+)$/i.exec(authorization)?.[1]
  if (!token) return json({ error: 'Bitte anmelden' }, 401, origin)
  const apiUrl = Deno.env.get('SUPABASE_URL') || ''
  // Bevorzugt publishable key: niemals Secret/Service-Role für Nutzeroperationen.
  let publicKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  try { publicKey = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || publicKey } catch { /* legacy */ }
  if (!apiUrl || !publicKey) return json({ error: 'Supabase ist nicht konfiguriert' }, 503, origin)
  const client = createClient(apiUrl, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: authError } = await client.auth.getUser(token)
  if (authError || !userData.user) return json({ error: 'Sitzung ungültig' }, 401, origin)
  try {
    const raw = await request.text()
    if (raw.length > 1500) return json({ error: 'Ungültige Anfrage' }, 400, origin)
    const body = JSON.parse(raw)
    const householdId = typeof body.householdId === 'string' ? body.householdId : ''
    const itemId = typeof body.itemId === 'string' ? body.itemId : ''
    if (!/^[0-9a-f-]{36}$/i.test(householdId) || !itemId || itemId.length > 100) {
      return json({ error: 'Haushalt oder Produkt ungültig' }, 400, origin)
    }
    const { data: item, error: itemError } = await client.from('shopping_items')
      .select('id, url, image_path').eq('household_id', householdId).eq('id', itemId).maybeSingle()
    if (itemError || !item) return json({ error: 'Produkt nicht gefunden oder kein Zugriff' }, 404, origin)
    if (item.image_path) return json({ ok: true, status: 'already_exists' }, 200, origin)
    const page = validPageUrl(item.url || '')
    if (!page) return json({ ok: false, reason: 'Nur direkte OTTO-/Amazon-Produktlinks werden unterstützt.' }, 200, origin)
    let imageBytes: Uint8Array, type: string
    try {
      const htmlResponse = await safeGet(page, 'html')
      const html = new TextDecoder().decode(htmlResponse.bytes)
      const imageUrl = imageFromHtml(html, htmlResponse.finalUrl.href)
      if (!imageUrl) return json({ ok: false, reason: 'Shop stellt kein zugängliches Produktbild bereit.' }, 200, origin)
      const imageResponse = await safeGet(imageUrl, 'image')
      imageBytes = imageResponse.bytes
      type = imageResponse.type
    } catch (cause) {
      // Keine Sperren/CAPTCHAs umgehen oder ein unpassendes Bild erfinden.
      const detail = cause instanceof Error ? cause.message : 'Bildabruf fehlgeschlagen'
      return json({ ok: false, reason: detail.slice(0, 150) }, 200, origin)
    }
    const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : type === 'image/gif' ? 'gif' : 'webp'
    const safeId = itemId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100)
    const path = householdId + '/' + safeId + '/' + crypto.randomUUID() + '.' + ext
    const { error: uploadError } = await client.storage.from('product-images')
      .upload(path, imageBytes, { contentType: type, upsert: false })
    if (uploadError) return json({ ok: false, reason: 'Storage: ' + uploadError.message.slice(0, 140) }, 200, origin)
    const { data: updated, error: updateError } = await client.from('shopping_items')
      .update({ image_path: path }).eq('household_id', householdId).eq('id', itemId)
      .is('image_path', null).select('id').maybeSingle()
    if (updateError || !updated) {
      await client.storage.from('product-images').remove([path])
      return json({ ok: false, reason: updateError?.message || 'Produkt wurde zwischenzeitlich geändert.' }, 200, origin)
    }
    return json({ ok: true, status: 'saved' }, 200, origin)
  } catch {
    return json({ error: 'Anfrage konnte nicht verarbeitet werden' }, 400, origin)
  }
})
