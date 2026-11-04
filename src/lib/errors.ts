/**
 * Supabase PostgREST liefert teils reine JSON-Fehlerobjekte statt Error-Instanzen.
 * Zeige die technische Ursache verständlich, ohne ganze Objekte oder Tokens zu loggen.
 */
export function messageFor(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.slice(0, 850)
  if (typeof error === 'string' && error.trim()) return error.slice(0, 850)
  if (error && typeof error === 'object') {
    const data = error as Record<string, unknown>
    const str = (value: unknown, max = 400) => typeof value === 'string' ? value.trim().slice(0, max) : ''
    const details = [
      str(data.message),
      str(data.details),
      str(data.hint),
      str(data.error_description),
      str(data.error),
    ].filter(Boolean)
    const code = str(data.code, 50)
    const status = typeof data.status === 'number' ? String(data.status) : ''
    const prefix = [code && `Code ${code}`, status && `HTTP ${status}`].filter(Boolean).join(', ')
    if (details.length || prefix) return [prefix, ...new Set(details)].filter(Boolean).join(' – ').slice(0, 950)
  }
  return 'Der Server hat einen nicht lesbaren Fehler zurückgegeben. Bitte erneut versuchen.'
}
