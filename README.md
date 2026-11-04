# Haus Dassow · Shopping Center

Private, responsive Einkaufs- und Budgetplanung für zwei Personen. Das Frontend läuft als React-/TypeScript-App auf GitHub Pages; Authentifizierung, Daten, Realtime und private Produktbilder liegen in Supabase. Eine öffentlich erreichbare Frontend-URL gibt **keine** Einkaufsdaten preis: Ohne gültige Anmeldung liefern die Row-Level-Security-Regeln keine Haushaltsdaten.

## Funktionen

- zwei oder mehr getrennte E-Mail-/Passwortkonten in einem gemeinsamen Haushalt
- einmalige, 48 Stunden gültige Partner-Einladung
- Produkte anlegen, bearbeiten, löschen und zwischen Wunschliste, bestellt und gekauft wechseln
- Stückzahl, Cent-genaue Preise, Shop-Link, Raum, Priorität, Beschreibung und Notiz
- privater Supabase-Storage für JPG-, PNG-, WebP- und GIF-Bilder
- Live-Updates über Supabase Realtime plus Refetch-Fallback
- Budget, Plansumme, offene, bestellte und gekaufte Kosten
- Suche, Filter, Sortierung, JSON-Sicherung sowie Drucken/PDF
- authentifizierter, idempotenter JSON-Import mit Vorschau und Bestätigung
- responsive Bedienung für Desktop, iPhone und iPad

Die frühere Cloud-v2-Oberfläche bleibt unter `web/` als Designreferenz erhalten, wird aber nicht mehr deployt. Der produktive Build entsteht aus `src/`.

## 1. Lokal starten

Voraussetzung: Node.js 22.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Die eingecheckte `web/config.js` ist die zentrale öffentliche Laufzeitkonfiguration. Vor Entwicklung und Build erzeugt `scripts/prepare-runtime-config.mjs` daraus automatisch `public/config.js`. Das Skript akzeptiert ausschließlich Publishable- oder Legacy-Anon-Keys und lehnt Secret-/Service-Role-Keys ab.

Optional können lokale Werte mit `.env.local` überschrieben werden:

```dotenv
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
```

`service_role`, `sb_secret_*`, Datenbankkennwort, private E-Mail-Adressen und Startdaten gehören niemals in Browservariablen oder Git. `.env.local` und die generierte `public/config.js` werden durch `.gitignore` ausgeschlossen. Der in `web/config.js` gespeicherte Publishable Key ist ausdrücklich für Browserzugriffe bestimmt; Sicherheit entsteht durch Auth und RLS, nicht durch Geheimhaltung dieses Keys.

Qualitätsprüfung:

```powershell
npm run lint
npm test
npm run build
node scripts/check-anonymous-access.mjs
```

## 2. Supabase einrichten

1. Ein neues Supabase-Projekt in einer passenden EU-Region erstellen.
2. Das Projekt mit der Supabase CLI verknüpfen und Migrationen zuerst prüfen, dann anwenden:

   ```powershell
   supabase migration list --remote
   supabase db push --remote --dry-run
   supabase db push --remote
   ```
3. Unter **Authentication → Providers → Email** E-Mail/Passwort aktivieren. Für den Produktivbetrieb E-Mail-Bestätigung eingeschaltet lassen.
4. Unter **Authentication → URL Configuration** setzen:
   - Site URL: `https://craine92.github.io/Haus_Dassow/`
   - Redirect URLs: dieselbe Pages-URL und für lokale Entwicklung `http://localhost:5173/**`
5. Unter **Project Settings → API** Projekt-URL und **Publishable Key** kopieren. Keinen Secret- oder Service-Role-Key verwenden.

Die Migration legt Tabellen, RPCs, RLS-Regeln, Realtime-Publikation und den privaten Bucket `product-images` an. Bilder sind nicht öffentlich; die App erzeugt nach erfolgreicher RLS-Prüfung kurzlebige Signed URLs.

### Bestehende Datenbank

Die initiale Migration ist für ein frisches Projekt geschrieben. Wurde eine ältere Schemafassung bereits produktiv angewandt, die Datei nicht erneut blind ausführen. Stattdessen eine additive Folgemigration erstellen und Daten (`price` → `price_cents`, `phase` → `priority`, Data-URL → Storage) kontrolliert migrieren.

## 3. Erster Haushalt und Partnerkonto

1. Die App öffnen, erstes Konto registrieren und E-Mail bestätigen.
2. Anmelden und **Haushalt erstellen** wählen.
3. **Partner einladen** anklicken. Der einmalig verwendbare Code wird kopiert und läuft nach 48 Stunden ab. Ein neu erzeugter Code ersetzt den vorherigen.
4. Zweites Konto registrieren/anmelden, Code unter **Einladung nutzen** einfügen.

Nur die Besitzerrolle kann Codes erzeugen. Beide Haushaltsmitglieder dürfen gemeinsame Produkte und Budget bearbeiten.

## 4. Private 46 Artikel importieren

`PRIVATE_Haus_Dassow_Startdaten.json` bleibt ausschließlich lokal. Sie darf nicht nach `public/`, `src/`, `web/`, GitHub oder Pages kopiert werden.

1. Als Haushaltsmitglied anmelden.
2. **Import** wählen und die lokale JSON-Datei auswählen.
3. Vorschau prüfen. Beim Originalbestand bestätigt die App **46 Artikel / 10.498,76 €** und zeigt die Zahl erkannter Bilder.
4. Import ausdrücklich bestätigen.

IDs sind der Idempotenzschlüssel. Ein erneuter Import aktualisiert gleiche IDs, legt sie nicht doppelt an und lässt alle anderen bestehenden Einträge unangetastet. Gleiche IDs in der Importdatei werden zusammengeführt. Eingebettete Bilder werden erst nach der Bestätigung in den privaten Bucket hochgeladen; die private Datei wird nie Teil des Builds.

## 5. GitHub Pages und HTTPS

Im Repository:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions** wählen.
2. Auf `main` pushen oder den Workflow manuell starten.

Für den Publishable Key sind keine GitHub-Secrets nötig; der Workflow übernimmt die geprüfte `web/config.js`. Secret- und Service-Role-Keys bleiben weiterhin verboten.

Die Action installiert reproduzierbar mit `npm ci`, prüft TypeScript, führt Tests aus, baut mit der Pages-Base `/Haus_Dassow/` und veröffentlicht nur `dist/`. Die vorgesehene HTTPS-URL ist `https://craine92.github.io/Haus_Dassow/`. Sie gilt erst dann als produktiv bestätigt, wenn der Workflow erfolgreich lief und die URL manuell geprüft wurde.

## 6. Sicherheitsabnahme

Für einen belastbaren RLS-Test drei Konten verwenden: Haushalt A (Besitzer + Partner) und ein fremdes Konto B.

1. Abgemeldet: REST-Abfragen auf `households`, `shopping_items` und `household_invites` liefern keine privaten Zeilen; Storage-Dateien lassen sich nicht öffentlich lesen.
2. Fremdes Konto B ohne Einladung: Lesen/Ändern/Löschen von A-Artikeln und Upload in den A-Pfad schlagen fehl.
3. Partner in A: A legt einen Artikel an, Partner sieht ihn zeitnah; Partner ändert Preis/Status, A sieht die Änderung.
4. Einladung: falscher, abgelaufener und bereits verwendeter Code schlagen fehl. Direkter Tabellenzugriff auf Einladungshashes ist gesperrt.
5. Import zweimal ausführen: weiterhin 46 Startartikel statt 92; zusätzliche eigene Artikel bleiben erhalten.
6. Bild hochladen, auf zweitem Gerät anzeigen und danach Artikel löschen. (Storage-Löschung wird von der App angestoßen.)
7. `dist/`, Browser-Netzwerk und Konsole auf private Startdaten, E-Mails und Secret-/Service-Role-Schlüssel prüfen.

Die lokale Test-Suite prüft Geld-/Import-/Linklogik. Echte RLS- und Realtime-Abnahme benötigt ein verbundenes Supabase-Projekt und kann nicht durch Unit-Tests ersetzt werden.

Der transaktionale Remote-Test kann ohne Docker ausgeführt werden und verwirft alle simulierten Benutzer-/Haushaltsdaten am Ende:

```powershell
supabase db query --remote --file supabase/tests/rls_policies.test.sql
```

## Fehlerbehebung

- **„Cloud-Konfiguration fehlt“:** Vite-Variablen beim Build nicht gesetzt; lokale `.env.local` bzw. GitHub-Secrets prüfen und neu bauen.
- **Nach Login kein Haushalt:** Haushalt erstellen oder gültigen Einladungscode nutzen.
- **Bild-Upload scheitert:** Migration/Bucket/Policies prüfen; Datei maximal 10 MB und erlaubtes MIME-Format.
- **Keine Live-Updates:** Realtime-Publikation prüfen. Die App lädt im sichtbaren Tab zusätzlich alle 60 Sekunden neu.
- **Auth-Link führt falsch:** Site URL und Redirect URLs in Supabase müssen exakt zur Pages-URL passen.
- **404 auf Pages:** Workflow-Artefakt muss `dist/` sein und Vite mit Base `/Haus_Dassow/` bauen.

## App installieren und JSON-Import

Im angemeldeten Dashboard gibt es den sichtbaren Button **App installieren**. Falls
Brave/Chrome/Edge keine native Installation anbieten, zeigt er Anweisungen für
Desktop bzw. iPhone (Safari → Teilen → Zum Home-Bildschirm). Der Service Worker
nutzt ausschließlich Netzwerkantworten und speichert bewusst **keine** privaten
Einkaufsdaten offline.

Der Button **Import** öffnet einen eigenen Dialog mit sichtbarer Dateiauswahl.
Für `PRIVATE_Haus_Dassow_Startdaten.json` zeigt die Vorschau 46 Positionen,
10.498,76 € und sieben Produktbilder. Erst nach expliziter Bestätigung werden
Produkte und private Bilder in Supabase übernommen. Fehler bei Datei, Upload
oder Speichern werden direkt im Dialog angezeigt.
