const allowedProtocols = new Set(['http:', 'https:'])

export function normalizeProductUrl(value: string): string {
  const input = value.trim()
  if (!input) return ''
  const url = new URL(input)
  if (!allowedProtocols.has(url.protocol)) throw new Error('Nur HTTP- und HTTPS-Links sind erlaubt.')
  url.username = ''
  url.password = ''
  return url.toString()
}

export function retailerFromUrl(value: string): string {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'otto.de' || host.endsWith('.otto.de')) return 'OTTO'
    if (host.includes('amazon.')) return 'Amazon'
    if (host.includes('ikea.')) return 'IKEA'
    if (host.includes('home24.')) return 'home24'
    if (host.includes('wayfair.')) return 'Wayfair'
    if (host.includes('moemax.')) return 'mömax'
    if (host.includes('xxxlutz.')) return 'XXXLutz'
    return host.slice(0, 100)
  } catch {
    return ''
  }
}
