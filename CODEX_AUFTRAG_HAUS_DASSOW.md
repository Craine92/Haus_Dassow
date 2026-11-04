# Codex-Auftrag: Haus Dassow Shopping Center — produktionsreife gemeinsame Web-App

## Kontext und Ausgangsdateien

Repository: https://github.com/Craine92/Haus_Dassow

Dies ist eine private Haus-Einkaufsplanung für zwei Personen. Es gibt bereits eine funktionierende Oberfläche (Shopping Center v2) und eine vorbereitete Supabase-SQL-Datei. **Nutze das Cloud-v2-Paket als Ausgangsbasis, NICHT ausschließlich die einzelne Demo-HTML.** Das Paket enthält:

- `web/index.html`: produktive Oberfläche (noch ohne eingebettete Einkaufsdaten)
- `web/config.js`: Browser-Konfiguration (derzeit leer)
- `supabase/migrations/20261104140000_initial.sql`: vorbereitetes Schema/RLS/Einladungs-RPCs, bitte sorgfältig auditieren
- `PRIVATE_Haus_Dassow_Startdaten.json`: private Importdatei mit 46 Artikeln und sieben Originalbildern; **wird dem Nutzer separat ausgehändigt, nicht im Repository**
- `Vorschau_Demo.html`: Demo liegt **außerhalb des Repositories**, NICHT deployen
- `README.md`: Anleitung für das Repository

Ursprungsdaten: **46 Positionen, Plansumme 10.498,76 EUR**, sieben Möbelbilder. Preisangaben sind manuell gepflegte Momentaufnahmen. Behalte Produkte, Bilder, Raumeinteilung und UX. Die private Importdatei darf **niemals automatisch im Client gebündelt, im öffentlichen Repository committed oder als statisches Asset veröffentlicht** werden. Import nur nach authentifizierter Anmeldung mit eigener Datei-Auswahl.

## Ziel

Liefere eine tatsächlich nutzbare, responsive und datenschutzbewusste Anwendung für zwei Benutzerkonten (Partner), die eine gemeinsame Einkaufsliste **gleichzeitig** bearbeiten können. GitHub verwaltet Quellcode und Deployment; produktbezogene Änderungen landen in **Supabase**, nicht als Git-Commits.

## Technische Umsetzung

1. **Frontend:** Refaktoriere die vorhandene Single-HTML-App bei Bedarf auf **Vite + TypeScript** und verständliche Module. Bewahre das bestehende Mint/Beige/Anthrazit-Design und die Desktop-/Mobilbedienung. Kein unnötiger Komplettumbau und keine Regressionen.
2. **Backend:** Supabase Auth + Postgres + RLS; optional Supabase Realtime für Cross-Device Updates, mit zuverlässigem Refetch-Fallback. Erstelle versionierte Migrationen im Ordner `supabase/migrations/`; passe die vorhandene SQL-Datei an, statt sie blind zu übernehmen. Für Bilder mit Upload langfristig privaten Supabase-Storage-Bucket mit passenden Policies nutzen; alternativ die vorhandene Bildspeicherung sicher weiterverwenden. Keine öffentlichen Bilder/Listen ohne explizite Freigabe.
3. **Anmeldung und Haushalt:** E-Mail/Passwort, Auth-Redirects und Logout; gemeinsamer Haushalt, Besitzer/Partner, sichere, ablaufende, nur einmal einlösbare Einladung; Haushaltsdaten ausschließlich für Mitglieder zugänglich.
4. **Artikel:** Vollständiges Hinzufügen, Bearbeiten, Löschen, Duplizieren, Status ändern (Wunschliste / bestellt / gekauft), Anzahl, Einzelpreis, Händler, URL, Bild, Beschreibung, Notiz, Zimmer, Phase/Priorität. Filter, Suche, Sortieren. Anzeige der Einzel- und Gesamtsummen sowie offen/bestellt/gekauft, nach Raum und Phase. Rechne Geldwerte zuverlässig in Cent oder mit geeignetem Decimal-Verhalten.
5. **Links:** Amazon, OTTO und weitere Shop-Links erkennen und speichern; Besuch des Produktlinks. Versuche Titel/Bild/Preis nur über legitime bereitgestellte Metadaten/APIs. **Kein Versprechen automatischer Preisextraktion.** Falls Shops Abrufe blockieren, muss manuell hinzufügbar und korrigierbar bleiben. Baue keine unkontrollierte beliebige URL-Fetch-Funktion (SSRF-Schutz) und umgehe keine Shop-Sperren.
6. **Import/Export:** Authentifizierter Import der privaten JSON-Liste mit idempotenten IDs, Duplikatkontrolle, Vorschau und Bestätigung; JSON-Export und einfaches Drucken/PDF. Sicherstellen, dass nach einmaligem Import weiterhin **46 Artikel / 10.498,76 EUR** angezeigt werden und ein erneuter Import diese nicht verdoppelt. Neue Einträge der Benutzer nicht überschreiben, ohne expliziten Hinweis.
7. **Sicherheit:** Bei allen exponierten Tabellen, Funktionen und Storage-Buckets Policies/Grants prüfen. `anon` darf keinen Zugriff auf die privaten Artikel oder Einladungen haben. Verwende im Browser ausschließlich `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` (oder deren nachvollziehbare Entsprechungen). `service_role`, `sb_secret`, Datenbankkennwort, persönliche E-Mails und private Startdaten **niemals** committen oder clientseitig einbinden. `.env.example` ohne echte Schlüssel und eine `.gitignore` erstellen. Security-Definer-Funktionen mit festem `search_path` auditieren. Einladungslinks zeitlich begrenzen. Reactiv/sicheres Rendering, kein XSS aus Produktnamen oder Links.
8. **Deployment:** GitHub Actions für Build, Tests und automatisches Hosting bereitstellen. Bevorzugt **GitHub Pages für eine rein statische App**, wenn Repository/Sichtbarkeit/Plan es erlauben; sonst Vercel/Netlify mit Repository-Anbindung. Bei GitHub Pages den Pfad `/Haus_Dassow/` (Base URL) beachten. Site öffentlich erreichbar, aber **App-Daten ausschließlich nach Login**. Bei Supabase Auth die endgültige HTTPS-URL als Site-/Redirect-URL dokumentieren. Ein git push soll bei erfolgreicher Pipeline die Website aktualisieren.
9. **Wartung:** Saubere Readme auf Deutsch, lokale Startbefehle, Deployment-Setup, SQL-Migration, Auth-Konfiguration, Import, Einladungen und Fehlerbehebung. Optional PWA/Installierbarkeit für Handy, wenn die Basis stabil funktioniert.

## Tests und Abnahme

- `npm install`, `npm run build`, `npm run lint` (falls vorhanden), Tests und GitHub Action erfolgreich.
- Nicht angemeldeter Besucher erhält keine privaten Artikeldaten; fremdes Konto ohne Einladung kann nicht lesen, schreiben, uploaden oder Beitrittscodes auslesen.
- Zwei autorisierte Konten: A fügt Produkt hinzu, B sieht es zeitnah; B ändert Preis/Status, A erhält Änderung.
- Import 46 Artikel mit Originalbildern und Summe 10.498,76 EUR; erneuter Import erzeugt keine Duplikate.
- Kaufstatus, Mengen, Gesamtsummen, Filter, Upload, Link, Backup funktionieren auf Desktop und Mobil.
- Keine Secrets oder private Daten in Repository, Release-Bundle und Browser-Konsole.
- Wenn Supabase/GitHub-Zugriff oder Deployment-Rechte fehlen: **implementiere alle vorbereitbaren Teile**, führe lokale Tests aus und gib am Schluss **eine kurze Checkliste der konkret noch benötigten Benutzeraktionen**. Erfinde keine Supabase-Zugangsdaten, behaupte keine erfolgreich durchgeführten Live-Tests, wenn keine Verbindung bestand.

## Arbeitsweise

1. Bestand und Git-Status prüfen, dann kurz den Implementierungsplan nennen.
2. In überschaubaren Commits arbeiten; vorhandene Daten und Oberfläche nicht zerstören.
3. Implementieren, Tests ausführen, Fehler beheben und dokumentieren.
4. Wenn GitHub-Authentifizierung vorhanden und vom Benutzer freigegeben, auf `https://github.com/Craine92/Haus_Dassow` pushen; andernfalls fertige Commits und exakten Push-Befehl bereitstellen.
5. Zum Schluss tatsächliche Produktions-URL (nur falls deployed), verwendete Supabase-Projektverbindung, Testergebnisse und offene Konfigurationsschritte nennen.

**Fang jetzt mit der Bestandsaufnahme und Umsetzung an. Frage nur bei tatsächlich notwendigen Freigaben oder Zugängen nach.**