# Haus Dassow · Shopping Center

Responsive private Einkaufsliste für unser Haus. Die App ist im Browser bedienbar; **gemeinsame Cloud-Nutzung funktioniert erst nach der Einrichtung eines Supabase-Projekts.**

## Was schon enthalten ist

- `web/index.html`: vorhandene Web-Oberfläche mit Login-/Listenfunktionen (ohne private Seed-Daten)
- `web/config.js`: leerer Platzhalter für die **öffentliche** Supabase-URL und den Publishable Key
- `supabase/migrations/20261104140000_initial.sql`: vorläufiges Datenbankschema; von Codex vor Produktiveinsatz auditieren und testen lassen
- `CODEX_AUFTRAG_HAUS_DASSOW.md`: Entwicklungsauftrag für Codex
- `.github/workflows/pages.yml`: vorbereitetes Deployment der statischen Webseite via GitHub Pages (Pages-Einstellung und Berechtigung erforderlich)

**Nicht enthalten (absichtlich):** `PRIVATE_Haus_Dassow_Startdaten.json` mit 46 Produkten und 7 Originalbildern. Diese Datei bitte ausschließlich lokal behalten, nach Supabase-Anmeldung über die Importfunktion einlesen. Niemals ins Git-Repository oder auf Pages hochladen.

## Codex starten

Im geklonten Repository die Datei `CODEX_AUFTRAG_HAUS_DASSOW.md` lesen lassen und vollständig abarbeiten. Der Codex-Auftrag umfasst Sicherheitsprüfung der Migration, Datenschutz, Auth, Cloud-Synchronisierung und Tests.

## Lokal testen

Ein einfacher lokaler Webserver reicht für die bestehende Version:

```powershell
cd web
python -m http.server 8080
```

Danach im Browser `http://localhost:8080` aufrufen. Ohne konfiguriertes Supabase läuft keine echte Cloud-Synchronisierung.

## Supabase verbinden

1. Supabase-Projekt anlegen.
2. Migration nach Prüfung durch Codex einspielen; die Datenbank braucht Row Level Security.
3. In `web/config.js` nur `url` und **publishable key** eintragen, niemals Service-Role-/Secret-Schlüssel.
4. Authentication-Redirect-URLs auf die endgültige HTTPS-Website setzen.
5. Konto anlegen, anmelden und private Seed-Datei importieren; Partnerkonto einladen.

## GitHub Pages

Pages unter **Settings → Pages → Source: GitHub Actions** aktivieren. Beim Push auf `main` wird ausschließlich `web/` veröffentlicht. Der vorgesehene Link lautet bei öffentlichem Pages-Zugriff `https://craine92.github.io/Haus_Dassow/`; er ist **noch nicht als erreichbar bestätigt**. GitHub Pages stellt nur das Frontend online; Datenbank und Authentifizierung kommen von Supabase.

**Hinweis:** Die bestehenden Listen-/Auth-Abläufe wurden zuvor simuliert, aber nicht mit einem echten Supabase-Projekt live getestet. Es ist noch kein Deployment bestätigt. Erst Sicherheit, Integration und Rechte prüfen, dann öffentlich verwenden.