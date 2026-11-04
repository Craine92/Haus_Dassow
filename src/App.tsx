import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { parseImportFile } from './lib/import'
import { messageFor } from './lib/errors'
import { normalizeProductUrl, retailerFromUrl } from './lib/links'
import { parseIncomingShare, type SharedProduct } from './lib/share'
import { euros, parseEuroToCents, sumItems } from './lib/money'
import {
  addSignedImageUrls, createHousehold, createInvite, deleteItem, getSession, isSupabaseConfigured,
  joinHousehold, loadHousehold, loadItems, removeImage, saveItem, saveItems, subscribeToHousehold,
  supabase, updateBudget, uploadImage, setItemImagePath, resolveProductImage,
} from './lib/supabase'
import { PRIORITIES, STATUSES, type Household, type ImportPreview, type ItemDraft, type ShoppingItem } from './types'

const EMPTY_DRAFT: ItemDraft = {
  id: '', name: '', description: '', price_cents: 0, quantity: 1, room: 'Wohnzimmer', retailer: '',
  priority: 'Einzug', status: 'Wunschliste', url: '', image_path: null, note: '', source: 'Eigener Eintrag',
  origin: 'Eigen', position: 0, updated_by: null,
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [recovering, setRecovering] = useState(() =>
    new URLSearchParams(window.location.search).has('recover') || window.location.hash.includes('type=recovery'))

  useEffect(() => {
    if (!supabase) { setReady(true); return }
    getSession().then(setSession).catch(console.error).finally(() => setReady(true))
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT') setRecovering(false)
      setSession(next)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) return <CenteredCard title="Haus Dassow" text="Sichere Verbindung wird vorbereitet …" />
  if (!isSupabaseConfigured) return <ConfigurationMissing />
  if (!session) return <AuthScreen />
  if (recovering) return <PasswordRecovery onFinished={() => {
    setRecovering(false)
    window.history.replaceState(window.history.state, '', window.location.pathname)
  }} />
  return <AuthenticatedApp session={session} />
}

function ConfigurationMissing() {
  return <CenteredCard title="Cloud-Konfiguration fehlt" text="Die App wurde ohne Supabase-Verbindung gebaut.">
    <p className="muted">Hinterlege <code>VITE_SUPABASE_URL</code> und <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> als GitHub-Actions-Secrets oder lokal in <code>.env.local</code>.</p>
  </CenteredCard>
}

function CenteredCard({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return <main className="center-page"><section className="auth-card"><div className="brand-icon">⌂</div><p className="eyebrow">Shopping Center</p><h1>{title}</h1><p>{text}</p>{children}</section></main>
}

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setNotice('')
    try {
      if (mode === 'reset') {
        // Query-Flag hält die Rücksetzung auch dann sichtbar, wenn Supabase
        // den Token-Hash aus der Adresszeile bereits entfernt hat.
        const redirectTo = new URL(window.location.pathname + '?recover=1', window.location.origin).toString()
        const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo })
        if (error) throw error
        setNotice('Wenn für diese E-Mail-Adresse ein Konto existiert, wird eine Nachricht zum Zurücksetzen versendet. Bitte auch den Spam-Ordner prüfen.')
        return
      }
      const result = mode === 'login'
        ? await supabase!.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase!.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin + window.location.pathname } })
      if (result.error) throw result.error
      if (mode === 'signup' && !result.data.session) setNotice('Bitte den Bestätigungslink in deiner E-Mail öffnen und dich dann anmelden.')
    } catch (error) {
      // Keine Offenlegung, ob ein Benutzerkonto existiert.
      const message = messageFor(error)
      setNotice(/invalid login credentials|invalid_credentials/i.test(message)
        ? 'Anmeldung nicht möglich. Bitte E-Mail-Adresse, Passwort und die Bestätigungsmail prüfen. Du kannst über „Passwort vergessen?“ ein neues Passwort setzen.'
        : message)
    } finally { setBusy(false) }
  }

  function changeMode(next: 'login' | 'signup' | 'reset') {
    setMode(next); setNotice(''); setPassword('')
  }

  return <main className="center-page"><section className="auth-card">
    <div className="brand-icon">⌂</div><p className="eyebrow">Haus Dassow</p>
    <h1>{mode === 'reset' ? 'Passwort zurücksetzen' : 'Gemeinsam einrichten.'}</h1>
    <p className="muted">{mode === 'reset' ? 'Gib die E-Mail-Adresse deines Kontos ein. Den Link zum neuen Passwort erhältst du per E-Mail.' : 'Private Einkaufsliste für zwei Konten. Daten werden erst nach der Anmeldung geladen.'}</p>
    <form onSubmit={submit} className="stack">
      <label>E-Mail<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      {mode !== 'reset' && <label>Passwort<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
      {notice && <div className="notice" role="status">{notice}</div>}
      <button type="submit" className="button primary" disabled={busy}>{busy ? 'Bitte warten …' : mode === 'reset' ? 'Rücksetzungs-E-Mail senden' : mode === 'login' ? 'Sicher anmelden' : 'Konto erstellen'}</button>
    </form>
    {mode === 'login' && <button className="text-button" type="button" onClick={() => changeMode('reset')}>Passwort vergessen?</button>}
    <button className="text-button" type="button" onClick={() => changeMode(mode === 'login' ? 'signup' : 'login')}>
      {mode === 'login' ? 'Noch kein Konto? Registrieren' : 'Zur Anmeldung'}
    </button>
  </section></main>
}

function PasswordRecovery({ onFinished }: { onFinished: () => void }) {
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [success, setSuccess] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password !== repeatPassword) { setNotice('Die beiden Passwörter stimmen nicht überein.'); return }
    setBusy(true); setNotice('')
    try {
      const { error } = await supabase!.auth.updateUser({ password })
      if (error) throw error
      setSuccess(true)
      setPassword('')
      setRepeatPassword('')
      setNotice('Passwort geändert. Du kannst dich jetzt mit dem neuen Passwort anmelden.')
    } catch (error) { setNotice(messageFor(error)) } finally { setBusy(false) }
  }

  async function finish() {
    setBusy(true)
    try {
      const { error } = await supabase!.auth.signOut()
      if (error) throw error
      onFinished()
    } catch (error) { setNotice(messageFor(error)); setBusy(false) }
  }

  return <main className="center-page"><section className="auth-card">
    <div className="brand-icon">⌂</div><p className="eyebrow">Haus Dassow · Konto</p>
    <h1>Neues Passwort</h1>
    <p className="muted">Lege ein neues Passwort mit mindestens acht Zeichen fest.</p>
    <form className="stack" onSubmit={submit}>
      {!success && <>
        <label>Neues Passwort<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label>Passwort wiederholen<input type="password" autoComplete="new-password" minLength={8} required value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} /></label>
      </>}
      {notice && <div className={success ? 'notice success' : 'notice'} role="status">{notice}</div>}
      {!success && <button className="button primary" type="submit" disabled={busy}>{busy ? 'Bitte warten …' : 'Neues Passwort speichern'}</button>}
    </form>
    {success && <button className="button primary" type="button" disabled={busy} onClick={() => void finish()}>Zur Anmeldung</button>}
  </section></main>
}

function AuthenticatedApp({ session }: { session: Session }) {
  const [household, setHousehold] = useState<Household | null | undefined>(undefined)
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const nextHousehold = await loadHousehold()
      setHousehold(nextHousehold)
      if (nextHousehold) setItems(await addSignedImageUrls(await loadItems(nextHousehold.id)))
      else setItems([])
      setError('')
    } catch (cause) { setError(messageFor(cause)) } finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!household) return
    let timer: number | undefined
    const channel = subscribeToHousehold(household.id, () => {
      window.clearTimeout(timer); timer = window.setTimeout(() => void refresh(), 180)
    })
    const fallback = window.setInterval(() => { if (!document.hidden) void refresh() }, 60_000)
    return () => { window.clearTimeout(timer); window.clearInterval(fallback); void supabase!.removeChannel(channel) }
  }, [household?.id, refresh])

  if (loading || household === undefined) return <CenteredCard title="Eure Planung" text="Einkaufsliste wird geladen …" />
  if (!household) return <HouseholdSetup email={session.user.email ?? ''} onComplete={refresh} />
  return <Dashboard household={household} items={items} error={error} onRefresh={refresh} />
}

function HouseholdSetup({ email, onComplete }: { email: string; onComplete: () => Promise<void> }) {
  const [name, setName] = useState('Haus Dassow')
  const [code, setCode] = useState(new URLSearchParams(location.search).get('invite') ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await action(); await onComplete() } catch (cause) { setError(messageFor(cause)) } finally { setBusy(false) }
  }
  return <main className="center-page"><section className="auth-card wide">
    <p className="eyebrow">Angemeldet als {email}</p><h1>Haushalt verbinden</h1>
    <p className="muted">Eine Person erstellt den Haushalt. Die zweite tritt mit dem einmaligen Einladungscode bei.</p>
    {error && <div className="notice error">{error}</div>}
    <div className="setup-grid">
      <form onSubmit={(e) => { e.preventDefault(); void run(() => createHousehold(name)) }} className="stack panel">
        <h2>Neu anlegen</h2><label>Name<input maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <button className="button primary" disabled={busy}>Haushalt erstellen</button>
      </form>
      <form onSubmit={(e) => { e.preventDefault(); void run(() => joinHousehold(code)) }} className="stack panel">
        <h2>Einladung nutzen</h2><label>Einladungscode<input required pattern="[0-9a-fA-F]{48}" value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <button className="button" disabled={busy}>Beitreten</button>
      </form>
    </div>
    <button className="text-button" onClick={() => void supabase!.auth.signOut()}>Abmelden</button>
  </section></main>
}

function Dashboard({ household, items, error, onRefresh }: { household: Household; items: ShoppingItem[]; error: string; onRefresh: () => Promise<void> }) {
  const [search, setSearch] = useState('')
  const [room, setRoom] = useState('Alle Produkte')
  const [status, setStatus] = useState('Alle')
  const [priority, setPriority] = useState('Alle')
  const [sort, setSort] = useState('position')
  const [sharedProduct, setSharedProduct] = useState<SharedProduct | null>(() => parseIncomingShare(window.location.search))
  const [editor, setEditor] = useState<ShoppingItem | 'new' | null>(() => parseIncomingShare(window.location.search) ? 'new' : null)
  const [linkPasteOpen, setLinkPasteOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importPickerOpen, setImportPickerOpen] = useState(false)
  const [importReading, setImportReading] = useState(false)
  const [importPickerError, setImportPickerError] = useState('')
  const [importSubmitError, setImportSubmitError] = useState('')
  const [importProgress, setImportProgress] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionFeedback, setActionFeedback] = useState<{ message: string; failed: boolean } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ShoppingItem | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [imageLookupBusy, setImageLookupBusy] = useState(false)
  const [imageLookupProgress, setImageLookupProgress] = useState('')
  const [imageLookupReport, setImageLookupReport] = useState('')
  const rooms = useMemo(() => Array.from(new Set(items.map((item) => item.room))).sort((a, b) => a.localeCompare(b, 'de')), [items])
  const total = sumItems(items)
  const ordered = sumItems(items.filter((item) => item.status === 'Bestellt'))
  const purchased = sumItems(items.filter((item) => item.status === 'Gekauft'))
  const open = total - purchased

  const filtered = useMemo(() => items.filter((item) => {
    const needle = search.toLocaleLowerCase('de-DE')
    return (room === 'Alle Produkte' || item.room === room) && (status === 'Alle' || item.status === status) &&
      (priority === 'Alle' || item.priority === priority) && (!needle || [item.name, item.description, item.retailer, item.note].some((value) => value.toLocaleLowerCase('de-DE').includes(needle)))
  }).sort((a, b) => {
    if (sort === 'price-asc') return a.price_cents - b.price_cents
    if (sort === 'price-desc') return b.price_cents - a.price_cents
    if (sort === 'name') return a.name.localeCompare(b.name, 'de')
    return a.position - b.position
  }), [items, room, status, priority, search, sort])

  async function mutate(task: () => Promise<void>, success: string) {
    setBusy(true); setNotice(''); setActionFeedback(null)
    try {
      await task()
      await onRefresh()
      setNotice(success)
      if (success) setActionFeedback({ message: success, failed: false })
    } catch (cause) {
      const message = messageFor(cause)
      setNotice(message)
      setActionFeedback({ message, failed: true })
    } finally { setBusy(false) }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteBusy) return
    setDeleteBusy(true); setDeleteError('')
    const target = deleteTarget
    try {
      // Zuerst Datensatz sicher löschen; Foto anschließend nur bestmöglich entfernen.
      await deleteItem(household.id, target.id)
      if (target.image_path) {
        try { await removeImage(target.image_path) } catch { /* Hauptdatensatz bereits gelöscht */ }
      }
      setDeleteTarget(null)
      await onRefresh()
      setNotice(`„${target.name}“ wurde gelöscht.`)
      setActionFeedback({ message: `„${target.name}“ wurde gelöscht.`, failed: false })
    } catch (cause) {
      const message = messageFor(cause)
      setDeleteError(message)
      setActionFeedback({ message, failed: true })
    } finally { setDeleteBusy(false) }
  }

  async function handleImportFile(file?: File) {
    if (!file) return
    setImportPickerError('')
    setImportReading(true)
    try {
      if (file.size === 0) throw new Error('Die ausgewählte Datei ist leer.')
      if (file.size > 25 * 1024 * 1024) throw new Error('Die Importdatei darf höchstens 25 MB groß sein.')
      const parsed = parseImportFile(await file.text(), new Set(items.map((item) => item.id)))
      setImportSubmitError('')
      setImportProgress('')
      setImportPreview(parsed)
      setImportPickerOpen(false)
    } catch (cause) {
      setImportPickerError(`Datei konnte nicht gelesen werden: ${messageFor(cause)}`)
    } finally {
      setImportReading(false)
    }
  }

  async function confirmImport() {
    if (!importPreview || busy) return
    setBusy(true)
    setImportSubmitError('')
    setNotice('')
    let stage = 'Produkte speichern'
    try {
      const current = new Map(items.map((item) => [item.id, item]))
      // Erst die Artikel in einem transaktionalen PostgREST-Upsert speichern.
      // So bleibt ein fehlgeschlagener Bild-Upload kein Hindernis für die Liste.
      setImportProgress(`Speichere ${importPreview.items.length} Produkte …`)
      const prepared: ItemDraft[] = importPreview.items.map((item) => ({
        ...item,
        image_path: current.get(item.id)?.image_path ?? null,
        created_at: current.get(item.id)?.created_at ?? item.created_at,
      }))
      await saveItems(household.id, prepared)

      // Ein Fehler bei Budget oder Storage darf gespeicherte Produkte nicht
      // als fehlgeschlagen ausgeben. Das Ergebnis bleibt wiederholbar.
      const warnings: string[] = []
      let imageCount = 0
      for (const item of importPreview.items) {
        const blob = importPreview.images.get(item.id)
        if (!blob) continue
        if (current.get(item.id)?.image_path) {
          imageCount += 1
          continue
        }
        stage = `Bild für „${item.name}“`
        setImportProgress(`Importiere Produktbilder: ${imageCount + warnings.length + 1} / ${importPreview.images.size}`)
        let uploadedPath: string | null = null
        try {
          uploadedPath = await uploadImage(household.id, item.id, blob)
          await setItemImagePath(household.id, item.id, uploadedPath)
          imageCount += 1
        } catch (cause) {
          // Ist nur die Datenbankaktualisierung fehlgeschlagen,
          // das bereits hochgeladene, verwaiste Bild bestmöglich entfernen.
          if (uploadedPath) {
            try { await removeImage(uploadedPath) } catch { /* nur Bereinigung */ }
          }
          warnings.push(`${item.name}: ${messageFor(cause)}`)
        }
      }

      stage = 'Einrichtungsbudget'
      if (importPreview.sourceBudgetCents != null) {
        try {
          await updateBudget(household.id, importPreview.sourceBudgetCents)
        } catch (cause) {
          warnings.push(`Budget konnte nicht gesetzt werden: ${messageFor(cause)}`)
        }
      }

      stage = 'Liste aktualisieren'
      setImportProgress('Lade aktualisierte Liste …')
      await onRefresh()
      const importedCount = importPreview.items.length
      setImportPreview(null)
      setNotice(warnings.length
        ? `${importedCount} Artikel sind gespeichert, ${imageCount}/${importPreview.images.size} Bilder verfügbar. Hinweise: ${warnings.slice(0, 2).join(' | ')}${warnings.length > 2 ? ` (+${warnings.length - 2} weitere)` : ''}. Du kannst die gleiche JSON später erneut importieren – bestehende Artikel werden nicht verdoppelt.`
        : `${importedCount} Artikel und ${imageCount} Produktbilder wurden erfolgreich importiert.`)
    } catch (cause) {
      setImportSubmitError(`Import bei „${stage}“ fehlgeschlagen: ${messageFor(cause)}. Der Dialog bleibt geöffnet und du kannst nach Prüfung erneut starten.`)
    } finally {
      setBusy(false)
      setImportProgress('')
    }
  }

  async function invite() {
    setInviteBusy(true)
    setNotice('')
    try {
      // Einladungen verändern die Produktliste nicht: kein Reload und keine
      // leere Erfolgsmeldung, die den generierten Code sofort wieder ausblendet.
      const code = await createInvite()
      setInviteCode(code)
    } catch (cause) {
      setNotice(`Einladung konnte nicht erstellt werden: ${messageFor(cause)}`)
    } finally {
      setInviteBusy(false)
    }
  }

  function clearShareUrl() {
    const params = new URLSearchParams(window.location.search)
    for (const name of ['url', 'text', 'title', 'share_url']) params.delete(name)
    const query = params.toString()
    window.history.replaceState(window.history.state, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash)
  }

  function closeEditor() {
    setEditor(null)
    setSharedProduct(null)
    clearShareUrl()
  }

  function addProductFromLink(value: string) {
    const product = parseIncomingShare('?url=' + encodeURIComponent(value))
    if (!product) { setNotice('Bitte einen gültigen HTTP- oder HTTPS-Produktlink eingeben.'); return }
    setLinkPasteOpen(false)
    setSharedProduct(product)
    setEditor('new')
  }

  const imagesMissingDirect = items.filter((item) => !item.image_path && /^(https:\/\/(www\.)?otto\.de\/p\/|https:\/\/(www\.)?amazon\.de\/(dp|gp\/product)\/)/i.test(item.url))
  async function fillMissingProductImages() {
    if (imageLookupBusy || imagesMissingDirect.length === 0) return
    if (!window.confirm(`Für ${imagesMissingDirect.length} Artikel versuchen wir, das zugehörige Bild direkt von der Shopseite zu übernehmen. Bestehende Bilder und Preise bleiben unverändert. Fortfahren?`)) return
    setImageLookupBusy(true)
    setImageLookupReport('')
    let ok = 0
    const failures: string[] = []
    try {
      for (let i = 0; i < imagesMissingDirect.length; i++) {
        const item = imagesMissingDirect[i]
        setImageLookupProgress(`Produktbild ${i + 1} von ${imagesMissingDirect.length}: ${item.name}`)
        try {
          const result = await resolveProductImage(household.id, item.id)
          if (result.ok) ok++
          else failures.push(`${item.name}: ${result.reason || 'Kein Bild verfügbar'}`)
        } catch (cause) {
          failures.push(`${item.name}: ${messageFor(cause)}`)
          if (/noch nicht in Supabase veröffentlicht|Edge Function returned a non-2xx/i.test(messageFor(cause))) break
        }
      }
      await onRefresh()
      setImageLookupReport(`${ok} Bilder ergänzt, ${failures.length} nicht verfügbar. ${failures.slice(0, 3).join(' | ')}${failures.length > 3 ? ` (+${failures.length - 3} weitere)` : ''}`)
    } finally {
      setImageLookupProgress('')
      setImageLookupBusy(false)
    }
  }

  function exportJson() {
    const clean = items.map(({ image_url: _imageUrl, ...item }) => item)
    const blob = new Blob([JSON.stringify({ version: 2, budget_cents: household.budget_cents, items: clean, exported_at: new Date().toISOString() }, null, 2)], { type: 'application/json' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `Haus_Dassow_Sicherung_${new Date().toISOString().slice(0, 10)}.json`; link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon small">⌂</span><div><strong>HAUS DASSOW</strong><small>Shopping Center</small></div></div>
      <p className="side-heading">Räume</p>
      {['Alle Produkte', ...rooms].map((name) => <button key={name} className={room === name ? 'nav active' : 'nav'} onClick={() => setRoom(name)}><span>{name}</span><em>{name === 'Alle Produkte' ? items.length : items.filter((item) => item.room === name).length}</em></button>)}
      <div className="side-note"><strong>Gemeinsam planen</strong><span>Live synchronisiert und nur für Haushaltsmitglieder sichtbar.</span></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><p className="eyebrow">Einkaufsplanung · {household.name}</p><h1>Schön, dass ihr da seid.</h1><p className="muted">{new Intl.DateTimeFormat('de-DE', { dateStyle: 'full' }).format(new Date())}</p></div>
        <div className="actions"><button className="button" onClick={() => void invite()} disabled={busy || inviteBusy}>{inviteBusy ? 'Einladung wird erstellt …' : 'Partner einladen'}</button><button className="button" onClick={() => { setImportPickerError(''); setImportPickerOpen(true) }}>Import</button><button className="button" onClick={() => setLinkPasteOpen(true)}>Link übernehmen</button><button className="button" disabled={imageLookupBusy || !imagesMissingDirect.length} title="Passende Shopbilder für Produkte ohne Bild suchen und privat speichern" onClick={() => void fillMissingProductImages()}>{imageLookupBusy ? 'Bilder werden gesucht …' : `Bilder nachladen (${imagesMissingDirect.length})`}</button><InstallAppButton /><button className="button primary" onClick={() => { setSharedProduct(null); setEditor('new') }}>+ Produkt</button><button className="button icon" title="Abmelden" onClick={() => void supabase!.auth.signOut()}>↪</button></div>
      </header>
      {(error || notice) && <div className={error ? 'notice error' : 'notice'}>{error || notice}</div>}
      {actionFeedback && <div role="status" aria-live="polite" className={actionFeedback.failed ? 'action-feedback fail' : 'action-feedback'}>
        <span>{actionFeedback.message}</span>
        <button type="button" onClick={() => setActionFeedback(null)} aria-label="Meldung schließen">×</button>
      </div>}
      {imageLookupProgress && <div className="notice" role="status">{imageLookupProgress}</div>}
      {imageLookupReport && <div className="notice" role="status">{imageLookupReport}</div>}
      <section className="stats">
        <Stat label="Gesamte Planung" value={euros(total)} help={`${items.length} Positionen`} />
        <Stat label="Noch offen" value={euros(open)} help="ohne gekaufte Artikel" accent />
        <Stat label="Bestellt" value={euros(ordered)} help={`${items.filter((item) => item.status === 'Bestellt').length} Positionen`} />
        <Stat label="Bereits gekauft" value={euros(purchased)} help={`Budget ${euros(household.budget_cents)}`} />
      </section>
      <Budget household={household} total={total} onSave={(cents) => mutate(() => updateBudget(household.id, cents), 'Budget gespeichert.')} />
      <section className="section-title"><div><p className="eyebrow">Sortiment</p><h2>{room}</h2><p className="muted">{filtered.length} von {items.length} Artikeln</p></div><div className="actions"><button className="button" onClick={exportJson}>JSON-Sicherung</button><button className="button" onClick={() => window.print()}>Drucken / PDF</button></div></section>
      <div className="filters">
        <input aria-label="Produkte durchsuchen" type="search" placeholder="Produkte, Shops oder Notizen durchsuchen …" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option>Alle</option>{STATUSES.map((value) => <option key={value}>{value}</option>)}</select>
        <select aria-label="Priorität" value={priority} onChange={(e) => setPriority(e.target.value)}><option>Alle</option>{PRIORITIES.map((value) => <option key={value}>{value}</option>)}</select>
        <select aria-label="Sortierung" value={sort} onChange={(e) => setSort(e.target.value)}><option value="position">Planreihenfolge</option><option value="name">Name</option><option value="price-asc">Preis aufsteigend</option><option value="price-desc">Preis absteigend</option></select>
      </div>
      {filtered.length ? <section className="product-grid">{filtered.map((item) => <ProductCard key={item.id} item={item} disabled={busy} onEdit={() => setEditor(item)} onStatus={() => void mutate(() => saveItem(household.id, { ...item, status: item.status === 'Wunschliste' ? 'Bestellt' : item.status === 'Bestellt' ? 'Gekauft' : 'Wunschliste' }), 'Status aktualisiert.')} onDelete={() => { setDeleteError(''); setDeleteTarget(item) }} />)}</section>
        : <div className="empty"><span>⌕</span><h3>Keine passenden Produkte</h3><p>Ändere die Filter oder füge eine neue Idee hinzu.</p></div>}
      {importPickerOpen && <ImportFilePickerDialog reading={importReading} error={importPickerError} onClose={() => { if (!importReading) setImportPickerOpen(false) }} onFile={(file) => void handleImportFile(file)} />}
      {editor && <ItemEditor key={editor === 'new' ? 'new-' + (sharedProduct?.url ?? '') : editor.id} householdId={household.id} original={editor === 'new' ? null : editor} prefill={editor === 'new' ? sharedProduct : null} rooms={rooms} onClose={closeEditor} onSaved={async () => {
        closeEditor()
        await onRefresh()
        setNotice('Produkt gespeichert.')
        setActionFeedback({ message: 'Produkt gespeichert.', failed: false })
      }} />}
      {importPreview && <ImportDialog preview={importPreview} busy={busy} error={importSubmitError} progress={importProgress} onClose={() => { if (!busy) setImportPreview(null) }} onConfirm={() => void confirmImport()} />}
      {inviteCode && <InviteDialog code={inviteCode} onClose={() => setInviteCode(null)} />}
      {deleteTarget && <DeleteProductDialog name={deleteTarget.name} busy={deleteBusy} error={deleteError}
        onClose={() => { if (!deleteBusy) setDeleteTarget(null) }}
        onConfirm={() => void confirmDelete()} />}
      {linkPasteOpen && <LinkPasteDialog onClose={() => setLinkPasteOpen(false)} onUse={addProductFromLink} />}
    </main>
  </div>
}

function Stat({ label, value, help, accent = false }: { label: string; value: string; help: string; accent?: boolean }) {
  return <article className={accent ? 'stat accent' : 'stat'}><span>{label}</span><strong>{value}</strong><small>{help}</small></article>
}

function Budget({ household, total, onSave }: { household: Household; total: number; onSave: (value: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState((household.budget_cents / 100).toFixed(2).replace('.', ','))
  useEffect(() => setValue((household.budget_cents / 100).toFixed(2).replace('.', ',')), [household.budget_cents])
  const percent = household.budget_cents ? Math.min(100, Math.round(total / household.budget_cents * 100)) : 0
  return <section className="budget-panel"><div><strong>Einrichtungsbudget</strong><p>{total > household.budget_cents ? `${euros(total - household.budget_cents)} über Budget` : `${euros(household.budget_cents - total)} verbleiben`}</p></div><div className="budget-track"><div><span>{euros(total)}</span><span>{euros(household.budget_cents)}</span></div><i><b style={{ width: `${percent}%` }} /></i></div>{editing ? <form className="budget-form" onSubmit={(e) => { e.preventDefault(); try { onSave(parseEuroToCents(value)); setEditing(false) } catch { /* native follow-up */ } }}><input aria-label="Budget" value={value} onChange={(e) => setValue(e.target.value)} /><button className="button primary">Speichern</button></form> : <button className="button" onClick={() => setEditing(true)}>Budget ändern</button>}</section>
}

function ProductCard({ item, disabled, onEdit, onStatus, onDelete }: { item: ShoppingItem; disabled: boolean; onEdit: () => void; onStatus: () => void; onDelete: () => void }) {
  const [imageBroken, setImageBroken] = useState(false)
  useEffect(() => setImageBroken(false), [item.image_url])
  const hasImage = Boolean(item.image_url) && !imageBroken
  return <article className="product-card">
    <div className="product-image">
      {hasImage
        ? <img src={item.image_url!} alt={`Produktfoto: ${item.name}`} loading="lazy" onError={() => setImageBroken(true)} />
        : <div className="product-image-empty">
          <span aria-hidden="true">⌂</span>
          <small>{imageBroken ? 'Bild konnte nicht geladen werden' : 'Noch kein Produktfoto'}</small>
          <button className="button" type="button" onClick={onEdit}>{imageBroken ? 'Foto prüfen' : 'Foto hinzufügen'}</button>
        </div>}
      <b className={`badge status-${item.status.toLowerCase()}`}>{item.status}</b>
    </div>
    <div className="product-body"><p className="eyebrow">{item.room} · {item.priority}</p><h3>{item.name}</h3>{item.description && <p className="description">{item.description}</p>}<div className="price"><strong>{euros(item.price_cents * item.quantity)}</strong>{item.quantity > 1 && <span>{item.quantity} × {euros(item.price_cents)}</span>}</div><p className="retailer">{item.retailer || 'Shop noch offen'}</p>{item.note && <p className="note">{item.note}</p>}</div>
    <footer>{item.url ? <a className="button" href={item.url} target="_blank" rel="noopener noreferrer">Shop öffnen</a> : <span />}<div><button className="button icon" title="Status wechseln" disabled={disabled} onClick={onStatus}>✓</button><button className="button icon" title="Bearbeiten" onClick={onEdit}>✎</button><button className="button icon danger" title="Löschen" disabled={disabled} onClick={onDelete}>×</button></div></footer>
  </article>
}

function DeleteProductDialog({ name, busy, error, onClose, onConfirm }: {
  name: string; busy: boolean; error: string; onClose: () => void; onConfirm: () => void
}) {
  return <Modal title="Produkt wirklich löschen?" onClose={() => { if (!busy) onClose() }}>
    <p>Willst du <strong>„{name}“</strong> dauerhaft aus eurer Einkaufsliste entfernen?</p>
    <p className="muted">Diese Änderung wird sofort mit eurem gemeinsamen Haushalt synchronisiert.</p>
    {error && <div className="notice error" role="alert">{error}</div>}
    <div className="modal-actions">
      <button type="button" className="button" disabled={busy} onClick={onClose}>Abbrechen</button>
      <button type="button" className="button danger" disabled={busy} onClick={onConfirm}>
        {busy ? 'Wird gelöscht …' : 'Ja, Produkt löschen'}
      </button>
    </div>
  </Modal>
}

function ItemEditor({ householdId, original, prefill, rooms, onClose, onSaved }: { householdId: string; original: ShoppingItem | null; prefill: SharedProduct | null; rooms: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<ItemDraft>(() => original ? { ...original } : { ...EMPTY_DRAFT, id: crypto.randomUUID(), position: Date.now(), name: prefill?.name ?? '', url: prefill?.url ?? '', retailer: prefill?.retailer ?? '', note: prefill?.note ?? '' })
  const [price, setPrice] = useState(original ? (original.price_cents / 100).toFixed(2).replace('.', ',') : '0,00')
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [pasteHint, setPasteHint] = useState('')

  function useImageBlob(blob: Blob) {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(blob.type)) {
      setPasteHint('Die Zwischenablage enthält kein unterstütztes Bild.')
      return
    }
    if (blob.size > 10 * 1024 * 1024) {
      setPasteHint('Das Bild ist größer als 10 MB. Bitte eine kleinere Aufnahme verwenden.')
      return
    }
    const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : blob.type === 'image/gif' ? 'gif' : 'png'
    setImage(new File([blob], `produktfoto.${ext}`, { type: blob.type }))
    setPasteHint('Bild übernommen! Prüfe die Vorschau und klicke auf Speichern.')
    setError('')
  }

  async function pasteImageFromClipboard() {
    setPasteHint('')
    try {
      if (!navigator.clipboard?.read) throw new Error('Zwischenablage konnte nicht gelesen werden.')
      const contents = await navigator.clipboard.read()
      for (const content of contents) {
        const mime = content.types.find((type) => ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type))
        if (!mime) continue
        useImageBlob(await content.getType(mime))
        return
      }
      setPasteHint('Kein Bild in der Zwischenablage. Öffne bei OTTO das Produktbild und wähle Rechtsklick → Bild kopieren. Alternativ mit Win + Shift + S einen Bildausschnitt aufnehmen.')
    } catch {
      setPasteHint('Brave hat den Zugriff auf die Zwischenablage blockiert. Nutze Strg + V im geöffneten Produktdialog oder lade ein gespeichertes Bild hoch.')
    }
  }

  useEffect(() => {
    function handlePastedImage(event: ClipboardEvent) {
      const target = event.target
      // Reines Einfügen von Text in Eingabefelder nicht verändern.
      const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) => item.kind === 'file' && item.type.startsWith('image/'))
      if (!imageItem) return
      if (target instanceof HTMLInputElement && target.type === 'file') return
      const file = imageItem.getAsFile()
      if (!file) return
      event.preventDefault()
      useImageBlob(file)
    }
    window.addEventListener('paste', handlePastedImage)
    return () => window.removeEventListener('paste', handlePastedImage)
  }, [])

  useEffect(() => {
    if (!image) { setImagePreview(null); return }
    const objectUrl = URL.createObjectURL(image)
    setImagePreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [image])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const roomList = Array.from(new Set([...rooms, draft.room, 'Wohnzimmer', 'Schlafzimmer', 'Küche', 'Bad', 'Arbeiten & Gaming', 'Außenbereich', 'Sonstiges']))
  const update = (field: keyof ItemDraft, value: ItemDraft[keyof ItemDraft]) => setDraft((current) => ({ ...current, [field]: value }))
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const url = normalizeProductUrl(draft.url)
      let imagePath = draft.image_path
      if (image) imagePath = await uploadImage(householdId, draft.id, image)
      try {
        await saveItem(householdId, { ...draft, name: draft.name.trim(), url, retailer: draft.retailer.trim() || retailerFromUrl(url), price_cents: parseEuroToCents(price), image_path: imagePath })
      } catch (cause) {
        // Fehlgeschlagene Speicherung darf keine verwaisten neuen Bilder hinterlassen.
        if (image && imagePath && imagePath !== original?.image_path) {
          try { await removeImage(imagePath) } catch { /* best effort */ }
        }
        throw cause
      }
      if (image && original?.image_path) {
        try { await removeImage(original.image_path) } catch { /* Datensatz bereits erfolgreich gespeichert */ }
      }
      await onSaved()
    } catch (cause) { setError(`Speichern fehlgeschlagen: ${messageFor(cause)}`); setBusy(false) }
  }
  return <Modal title={original ? 'Produkt bearbeiten' : 'Produkt hinzufügen'} onClose={onClose}><form className="editor-form" onSubmit={submit}
    onInvalid={(event) => { const field = event.target instanceof HTMLInputElement ? event.target : null
      setError(`Bitte Pflichtfelder prüfen: ${field?.labels?.[0]?.textContent?.trim() || field?.getAttribute('aria-label') || 'Ein Feld ist ungültig'}.`) }}>
    {error && <div className="notice error">{error}</div>}
    <label className="full">Produktname *<input required maxLength={170} value={draft.name} onChange={(e) => update('name', e.target.value)} /></label>
    <label className="full">Kurzbeschreibung<input maxLength={500} value={draft.description} onChange={(e) => update('description', e.target.value)} /></label>
    <label>Stückpreis (€) *<input required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
    <label>Anzahl *<input required type="number" min={1} max={9999} value={draft.quantity} onChange={(e) => update('quantity', Number(e.target.value))} /></label>
    <label>Raum<select value={draft.room} onChange={(e) => update('room', e.target.value)}>{roomList.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Shop<input maxLength={100} value={draft.retailer} onChange={(e) => update('retailer', e.target.value)} /></label>
    <label>Priorität<select value={draft.priority} onChange={(e) => update('priority', e.target.value)}>{PRIORITIES.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Status<select value={draft.status} onChange={(e) => update('status', e.target.value)}>{STATUSES.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className="full">Produktlink<input type="url" placeholder="https://…" value={draft.url} onChange={(e) => update('url', e.target.value)} /></label>
    <label className="full">Notiz<textarea maxLength={3000} value={draft.note} onChange={(e) => update('note', e.target.value)} /></label>
    <div className="full upload">
      <strong>Produktbild</strong>
      <p className="muted" style={{ margin: '5px 0 12px' }}>Bei OTTO Produktbild öffnen → Rechtsklick → <b>Bild kopieren</b>. Dann hier „Bild aus Zwischenablage“ klicken oder <b>Strg + V</b> drücken. Alternativ mit Win + Shift + S einen Ausschnitt aufnehmen.</p>
      <button type="button" className="button" disabled={busy} onClick={() => void pasteImageFromClipboard()}>Bild aus Zwischenablage einfügen</button>
      {pasteHint && <div className="notice" role="status" style={{ marginTop: 9 }}>{pasteHint}</div>}
      <label style={{ marginTop: 12 }}>Oder Datei auswählen (JPG, PNG, WebP, GIF; max. 10 MB)
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { setImage(e.target.files?.[0] ?? null); setPasteHint('') }} />
      </label>
      {image && <p>{image.name}</p>}
      {(imagePreview || original?.image_url) && <img src={imagePreview || original?.image_url || ''} alt="Produktvorschau" style={{ width: '100%', maxWidth: 320, maxHeight: 230, objectFit: 'contain', borderRadius: 12, marginTop: 8 }} />}
    </div>
    <div className="modal-actions full"><button type="button" className="button" onClick={onClose}>Abbrechen</button><button type="submit" className="button primary" disabled={busy}>{busy ? 'Wird gespeichert …' : 'Speichern'}</button></div>
  </form></Modal>
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as InstallPromptEvent)
    }
    const onInstalled = () => { setInstalled(true); setPromptEvent(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])
  async function install() {
    if (!promptEvent) { setShowHelp(true); return }
    try {
      await promptEvent.prompt()
      await promptEvent.userChoice
    } catch {
      setShowHelp(true)
    } finally {
      setPromptEvent(null)
    }
  }
  return <>
    <button type="button" className="button" onClick={() => void install()}>{installed ? 'App installiert ✓' : 'App installieren'}</button>
    {showHelp && <Modal title="Haus Dassow als App nutzen" onClose={() => setShowHelp(false)}>
      <p className="muted">Du kannst Haus Dassow mit eigenem Symbol öffnen – ohne die Adresse jedes Mal neu einzugeben.</p>
      <div className="install-instructions">
        <h3>Windows · Brave</h3>
        <p>Öffne das Brave-Menü (≡) und wähle <strong>Speichern und Teilen → Installieren</strong>. Ist die Option nicht vorhanden, nutze <strong>Verknüpfung erstellen</strong> oder erstelle eine Desktopverknüpfung mit der Webadresse.</p>
        <h3>Windows · Chrome / Edge</h3>
        <p>Wähle das Installationssymbol in der Adressleiste oder im Browsermenü <strong>App installieren</strong>. Alternativ: <strong>Verknüpfung erstellen</strong>.</p>
        <h3>iPhone / iPad · Safari</h3>
        <p>Öffne die Webseite in <strong>Safari</strong>, tippe auf <strong>Teilen → Zum Home-Bildschirm</strong> und aktiviere <strong>Als Web-App öffnen</strong>. Danach <strong>Hinzufügen</strong> antippen.</p>
      </div>
      <div className="modal-actions"><button type="button" className="button primary" onClick={() => setShowHelp(false)}>Verstanden</button></div>
    </Modal>}
  </>
}

function LinkPasteDialog({ onClose, onUse }: { onClose: () => void; onUse: (url: string) => void }) {
  const [url, setUrl] = useState('')
  return <Modal title="Produktlink übernehmen" onClose={onClose}>
    <p className="muted">Kopiere einen Produktlink aus OTTO, Amazon oder einem anderen Shop. Wir übernehmen den Link und erkennen den Shop. Name, Preis und Produktfoto kannst du anschließend ergänzen.</p>
    <form className="stack" onSubmit={(event) => { event.preventDefault(); onUse(url) }}>
      <label>Produktlink<input type="url" autoFocus required placeholder="https://www.otto.de/…" value={url} onChange={(event) => setUrl(event.target.value)} /></label>
      <div className="modal-actions"><button type="button" className="button" onClick={onClose}>Abbrechen</button><button className="button primary">Weiter zum Produkt</button></div>
    </form>
  </Modal>
}

function InviteDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function copyCode() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Zwischenablage nicht verfügbar')
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setCopyError(false)
    } catch {
      // Brave und andere Browser können Clipboard-Zugriffe verweigern.
      // Der Code bleibt immer sichtbar und kann manuell kopiert werden.
      inputRef.current?.focus()
      inputRef.current?.select()
      setCopyError(true)
    }
  }

  return <Modal title="Partner einladen" onClose={onClose}>
    <p className="muted">Teile diesen einmalig verwendbaren Einladungscode mit Justine. Er ist 48 Stunden gültig. Sie kann ihn nach der Anmeldung unter „Einladung nutzen“ eingeben.</p>
    <label>Dein Einladungscode
      <input ref={inputRef} aria-label="Einladungscode" readOnly value={code} onFocus={(event) => event.currentTarget.select()} />
    </label>
    {copied && <div className="notice success" role="status">Einladungscode wurde kopiert.</div>}
    {copyError && <div className="notice" role="status">Automatisches Kopieren wurde blockiert. Der Code ist markiert – kopiere ihn mit Strg+C.</div>}
    <div className="modal-actions">
      <button type="button" className="button" onClick={onClose}>Schließen</button>
      <button type="button" className="button primary" onClick={() => void copyCode()}>{copied ? 'Erneut kopieren' : 'Code kopieren'}</button>
    </div>
  </Modal>
}

function ImportFilePickerDialog({ reading, error, onClose, onFile }: { reading: boolean; error: string; onClose: () => void; onFile: (file?: File) => void }) {
  return <Modal title="Einkaufsliste importieren" onClose={onClose}>
    <p className="muted">Wähle die private JSON-Datei aus. Danach siehst du zunächst eine Vorschau mit der Anzahl der Artikel, Bildern und Gesamtsumme. Es wird noch nichts gespeichert.</p>
    <label className="full upload">JSON-Datei auswählen
      <input aria-label="JSON-Datei auswählen" type="file" accept=".json,application/json,text/json" disabled={reading} onChange={(event) => onFile(event.currentTarget.files?.[0])} />
    </label>
    {reading && <div className="notice" role="status">Datei wird geprüft – bitte einen Moment …</div>}
    {error && <div className="notice error" role="alert">{error}</div>}
    <p className="muted">Die Originaldatei für euer Haus heißt <strong>PRIVATE_Haus_Dassow_Startdaten.json</strong> und enthält 46 Positionen mit sieben Bildern. Die Datei wird nicht öffentlich hochgeladen.</p>
    <div className="modal-actions"><button type="button" className="button" disabled={reading} onClick={onClose}>Schließen</button></div>
  </Modal>
}

function ImportDialog({ preview, busy, error, progress, onClose, onConfirm }: { preview: ImportPreview; busy: boolean; error: string; progress: string; onClose: () => void; onConfirm: () => void }) {
  const expected = preview.items.length === 46 && preview.totalCents === 1_049_876
  return <Modal title="Privaten Import prüfen" onClose={() => { if (!busy) onClose() }}>
    <div className="import-summary">
      <div><span>Artikel</span><strong>{preview.items.length}</strong></div>
      <div><span>Plansumme</span><strong>{euros(preview.totalCents)}</strong></div>
      <div><span>Bilder</span><strong>{preview.images.size}</strong></div>
      <div><span>Vorhandene IDs</span><strong>{preview.existingIds}</strong></div>
    </div>
    <div className={expected ? 'notice success' : 'notice'}>{expected ? 'Die erwarteten 46 Positionen und 10.498,76 € wurden erkannt.' : 'Die Datei weicht vom erwarteten Startbestand (46 Positionen / 10.498,76 €) ab. Bitte vor dem Import prüfen.'}</div>
    <p className="muted">Gleiche IDs werden aktualisiert, nicht doppelt angelegt. Sonstige Produkte bleiben erhalten. {preview.duplicatesInFile ? `${preview.duplicatesInFile} doppelte IDs werden zusammengeführt.` : ''}</p>
    <p className="muted"><strong>Erste Produkte:</strong> {preview.items.slice(0, 4).map((item) => item.name).join(' · ')}{preview.items.length > 4 ? ' …' : ''}</p>
    {progress && <div role="status" className="notice">{progress}</div>}
    {error && <div role="alert" className="notice error">{error}</div>}
    <div className="modal-actions">
      <button type="button" className="button" disabled={busy} onClick={onClose}>Abbrechen</button>
      <button type="button" className="button primary" disabled={busy} onClick={onConfirm}>{busy ? 'Import läuft …' : 'Import bestätigen'}</button>
    </div>
  </Modal>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; addEventListener('keydown', key); return () => removeEventListener('keydown', key) }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><div><p className="eyebrow">Eure Planung</p><h2>{title}</h2></div><button className="button icon" onClick={onClose}>×</button></header>{children}</section></div>
}
