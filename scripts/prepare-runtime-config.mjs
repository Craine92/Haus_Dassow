import { mkdir, readFile, writeFile } from 'node:fs/promises'

const source = await readFile(new URL('../web/config.js', import.meta.url), 'utf8')
const url = source.match(/url\s*:\s*["']([^"']+)["']/)?.[1]?.trim() ?? ''
const key = source.match(/key\s*:\s*["']([^"']+)["']/)?.[1]?.trim() ?? ''

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
  throw new Error('web/config.js enthält keine gültige HTTPS-Supabase-URL.')
}

const isPublishable = key.startsWith('sb_publishable_')
let isLegacyAnon = false
if (key.split('.').length === 3) {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'))
    isLegacyAnon = payload.role === 'anon'
  } catch { /* ungültige JWTs werden unten abgelehnt */ }
}

if (!isPublishable && !isLegacyAnon) {
  throw new Error('Nur ein Publishable Key oder Legacy-Anon-Key darf in den Browser-Build gelangen.')
}

await mkdir(new URL('../public/', import.meta.url), { recursive: true })
await writeFile(
  new URL('../public/config.js', import.meta.url),
  `window.HAUS_DASSOW_CONFIG = Object.freeze(${JSON.stringify({ url, key })});\n`,
  { encoding: 'utf8', mode: 0o600 },
)

console.log('Öffentliche Supabase-Laufzeitkonfiguration vorbereitet.')
