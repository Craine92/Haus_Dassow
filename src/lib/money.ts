export const euros = (cents: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)

export function parseEuroToCents(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) throw new Error('Ungültiger Preis')
    return Math.round(value * 100)
  }
  const input = String(value ?? '').trim().replace(/\s|€/g, '')
  if (!input) return 0
  const normalized = input.includes(',')
    ? input.replace(/\./g, '').replace(',', '.')
    : input
  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`Ungültiger Preis: ${input}`)
  return Math.round(amount * 100)
}

export const sumItems = (items: Array<{ price_cents: number; quantity: number }>) =>
  items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0)
