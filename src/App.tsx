import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { parseImportFile } from './lib/import'
import { normalizeProductUrl, retailerFromUrl } from './lib/links'
import { euros, parseEuroToCents, sumItems } from './lib/money'
import {
  addSignedImageUrls, createHousehold, createInvite, deleteItem, getSession, isSupabaseConfigured,
  joinHousehold, loadHousehold, loadItems, removeImage, saveItem, saveItems, subscribeToHousehold,
  supabase, updateBudget, uploadImage,
} from './lib/supabase'
import { PRIORITIES, STATUSES, type Household, type ImportPreview, type ItemDraft, type ShoppingItem } from './types'

const EMPTY_DRAFT: ItemDraft = {
  id: '', name: '', description: '', price_cents: 0, quantity: 1, room: 'Wohnzimmer', retailer: '',
  priority: 'Einzug', status: 'Wunschliste', url: '', image_path: null, note: '', source: 'Eigener Eintrag',
  origin: 'Eigen', position: 0, updated_by: null,
}

const messageFor = (error: unknown) => error instanceof Error ? error.message : 'Unbekannter Fehler'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!supabase) { setReady(true); return }
    getSession().then(setSession).catch(console.error).finally(() => setReady(true))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) return <CenteredCard title="Haus Dassow" text="Sichere Verbindung wird vorbereitet …" />
  if (!isSupabaseConfigured) return <ConfigurationMissing />
  if (!session) return <AuthScreen />
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
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice('')
    try {
      const result = mode === 'login'
        ? await supabase!.auth.signInWithPassword({ email, password })
        : await supabase!.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href.split('#')[0] } })
      if (result.error) throw result.error
      if (mode === 'signup' && !result.data.session) setNotice('Bitte bestätige die E-Mail und melde dich anschließend an.')
    } catch (error) { setNotice(messageFor(error)) } finally { setBusy(false) }
  }

  return <main className="center-page"><section className="auth-card">
    <div className="brand-icon">⌂</div><p className="eyebrow">Haus Dassow</p><h1>Gemeinsam einrichten.</h1>
    <p className="muted">Private Einkaufsliste für zwei Konten. Daten werden erst nach der Anmeldung geladen.</p>
    <form onSubmit={submit} className="stack">
      <label>E-Mail<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Passwort<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {notice && <div className="notice">{notice}</div>}
      <button className="button primary" disabled={busy}>{busy ? 'Bitte warten …' : mode === 'login' ? 'Sicher anmelden' : 'Konto erstellen'}</button>
    </form>
    <button className="text-button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setNotice('') }}>
      {mode === 'login' ? 'Noch kein Konto? Registrieren' : 'Bereits registriert? Anmelden'}
    </button>
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
  const [editor, setEditor] = useState<ShoppingItem | 'new' | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
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
    setBusy(true); setNotice('')
    try { await task(); await onRefresh(); setNotice(success) } catch (cause) { setNotice(messageFor(cause)) } finally { setBusy(false) }
  }

  async function handleImportFile(file?: File) {
    if (!file) return
    if (file.size > 25 * 1024 * 1024) { setNotice('Die Importdatei darf höchstens 25 MB groß sein.'); return }
    try { setImportPreview(parseImportFile(await file.text(), new Set(items.map((item) => item.id)))) }
    catch (cause) { setNotice(`Import nicht möglich: ${messageFor(cause)}`) }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function confirmImport() {
    if (!importPreview) return
    await mutate(async () => {
      const current = new Map(items.map((item) => [item.id, item]))
      const prepared: ItemDraft[] = []
      for (const item of importPreview.items) {
        const blob = importPreview.images.get(item.id)
        const existing = current.get(item.id)
        let imagePath = existing?.image_path ?? null
        if (blob) imagePath = await uploadImage(household.id, item.id, blob)
        prepared.push({ ...item, image_path: imagePath, created_at: existing?.created_at ?? item.created_at })
      }
      await saveItems(household.id, prepared)
      if (importPreview.sourceBudgetCents != null) await updateBudget(household.id, importPreview.sourceBudgetCents)
      setImportPreview(null)
    }, `${importPreview.items.length} Artikel wurden sicher importiert.`)
  }

  async function invite() {
    await mutate(async () => {
      const code = await createInvite()
      await navigator.clipboard.writeText(code)
      setNotice(`Einmaliger Einladungscode kopiert: ${code}`)
    }, '')
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
        <div className="actions"><button className="button" onClick={() => void invite()} disabled={busy}>Partner einladen</button><button className="button" onClick={() => fileRef.current?.click()}>Import</button><button className="button primary" onClick={() => setEditor('new')}>+ Produkt</button><button className="button icon" title="Abmelden" onClick={() => void supabase!.auth.signOut()}>↪</button></div>
      </header>
      {(error || notice) && <div className={error ? 'notice error' : 'notice'}>{error || notice}</div>}
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
      {filtered.length ? <section className="product-grid">{filtered.map((item) => <ProductCard key={item.id} item={item} disabled={busy} onEdit={() => setEditor(item)} onStatus={() => void mutate(() => saveItem(household.id, { ...item, status: item.status === 'Wunschliste' ? 'Bestellt' : item.status === 'Bestellt' ? 'Gekauft' : 'Wunschliste' }), 'Status aktualisiert.')} onDelete={() => { if (confirm(`„${item.name}“ wirklich löschen?`)) void mutate(async () => { await deleteItem(household.id, item.id); await removeImage(item.image_path) }, 'Produkt gelöscht.') }} />)}</section>
        : <div className="empty"><span>⌕</span><h3>Keine passenden Produkte</h3><p>Ändere die Filter oder füge eine neue Idee hinzu.</p></div>}
      <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(e) => void handleImportFile(e.target.files?.[0])} />
      {editor && <ItemEditor householdId={household.id} original={editor === 'new' ? null : editor} rooms={rooms} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await onRefresh(); setNotice('Produkt gespeichert.') }} />}
      {importPreview && <ImportDialog preview={importPreview} busy={busy} onClose={() => setImportPreview(null)} onConfirm={() => void confirmImport()} />}
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
  return <article className="product-card"><div className="product-image">{item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : <span>⌂</span>}<b className={`badge status-${item.status.toLowerCase()}`}>{item.status}</b></div><div className="product-body"><p className="eyebrow">{item.room} · {item.priority}</p><h3>{item.name}</h3>{item.description && <p className="description">{item.description}</p>}<div className="price"><strong>{euros(item.price_cents * item.quantity)}</strong>{item.quantity > 1 && <span>{item.quantity} × {euros(item.price_cents)}</span>}</div><p className="retailer">{item.retailer || 'Shop noch offen'}</p>{item.note && <p className="note">{item.note}</p>}</div><footer>{item.url ? <a className="button" href={item.url} target="_blank" rel="noopener noreferrer">Shop öffnen</a> : <span />}<div><button className="button icon" title="Status wechseln" disabled={disabled} onClick={onStatus}>✓</button><button className="button icon" title="Bearbeiten" onClick={onEdit}>✎</button><button className="button icon danger" title="Löschen" disabled={disabled} onClick={onDelete}>×</button></div></footer></article>
}

function ItemEditor({ householdId, original, rooms, onClose, onSaved }: { householdId: string; original: ShoppingItem | null; rooms: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<ItemDraft>(() => original ? { ...original } : { ...EMPTY_DRAFT, id: crypto.randomUUID(), position: Date.now() })
  const [price, setPrice] = useState(original ? (original.price_cents / 100).toFixed(2).replace('.', ',') : '')
  const [image, setImage] = useState<File | null>(null)
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
      await saveItem(householdId, { ...draft, name: draft.name.trim(), url, retailer: draft.retailer.trim() || retailerFromUrl(url), price_cents: parseEuroToCents(price), image_path: imagePath })
      if (image && original?.image_path) await removeImage(original.image_path)
      await onSaved()
    } catch (cause) { setError(messageFor(cause)); setBusy(false) }
  }
  return <Modal title={original ? 'Produkt bearbeiten' : 'Produkt hinzufügen'} onClose={onClose}><form className="editor-form" onSubmit={submit}>
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
    <label className="full upload">Produktbild (JPG, PNG, WebP oder GIF; max. 10 MB)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />{image && <span>{image.name}</span>}</label>
    <div className="modal-actions full"><button type="button" className="button" onClick={onClose}>Abbrechen</button><button className="button primary" disabled={busy}>{busy ? 'Wird gespeichert …' : 'Speichern'}</button></div>
  </form></Modal>
}

function ImportDialog({ preview, busy, onClose, onConfirm }: { preview: ImportPreview; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const expected = preview.items.length === 46 && preview.totalCents === 1_049_876
  return <Modal title="Privaten Import prüfen" onClose={onClose}><div className="import-summary"><div><span>Artikel</span><strong>{preview.items.length}</strong></div><div><span>Plansumme</span><strong>{euros(preview.totalCents)}</strong></div><div><span>Bilder</span><strong>{preview.images.size}</strong></div><div><span>Vorhandene IDs</span><strong>{preview.existingIds}</strong></div></div>
    <div className={expected ? 'notice success' : 'notice'}>{expected ? 'Die erwarteten 46 Positionen und 10.498,76 € wurden erkannt.' : 'Die Datei weicht vom erwarteten Startbestand (46 Positionen / 10.498,76 €) ab. Bitte vor dem Import prüfen.'}</div>
    <p className="muted">Gleiche IDs werden aktualisiert; andere vorhandene und neue Einträge bleiben erhalten. Ein erneuter Import erzeugt daher keine Duplikate. {preview.duplicatesInFile ? `${preview.duplicatesInFile} doppelte IDs innerhalb der Datei werden zusammengeführt.` : ''}</p>
    <div className="modal-actions"><button className="button" onClick={onClose}>Abbrechen</button><button className="button primary" disabled={busy} onClick={onConfirm}>{busy ? 'Import läuft …' : 'Import bestätigen'}</button></div>
  </Modal>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; addEventListener('keydown', key); return () => removeEventListener('keydown', key) }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><div><p className="eyebrow">Eure Planung</p><h2>{title}</h2></div><button className="button icon" onClick={onClose}>×</button></header>{children}</section></div>
}
