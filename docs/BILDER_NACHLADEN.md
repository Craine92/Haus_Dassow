# Produktbilder automatisch aus OTTO und Amazon ergänzen

Die ursprünglichen 46 Positionen enthalten **7 eingebettete Bilder** und 39
Einträge mit Shop-Links, aber ohne gespeicherte Bilder. Das ist kein Fehler beim
Import. Die neuen Bilder werden erst beim Klick heruntergeladen.

## 1. Bilddienst einmalig in Supabase veröffentlichen

Aus dem Repository in VS Code:

```powershell
git pull origin main
npx supabase login
npx supabase link --project-ref fjzazoftorwyhvfywbdi
npx supabase functions deploy resolve-product-image --project-ref fjzazoftorwyhvfywbdi --no-verify-jwt
```

Die Funktion prüft die Benutzer-JWT selbst via Supabase Auth und nutzt **nur
Publishable/Anon-Key und RLS**, niemals den Service-Role-Key. `--no-verify-jwt`
dient der Kompatibilität mit den neuen `sb_publishable_`-Keys am Edge-Gateway;
anonyme oder ungültige Sitzungen werden in der Funktion abgewiesen.

**Kein Secret-Token in GitHub speichern.** Supabase-CLI-Login lokal ausführen.

## 2. Bilder nachladen

App öffnen, anmelden und `Bilder nachladen (39)` klicken.
Die Anzahl richtet sich nach den derzeit fehlenden Bildern mit direkten
OTTO-/Amazon-Produktlinks. Bestehende Bilder, Produktnamen, Preise, Status und
Notizen bleiben erhalten. Alle übernommenen Bilder liegen privat im Bucket
`product-images` und werden nur Mitgliedern des Haushalts angezeigt.

## Grenzen

- Nur echte direkte Produktseiten, keine Such- oder Startseiten.
- OTTO/Amazon können automatisierte Seitenabrufe blockieren oder
  Metadaten/Bilder für manche Varianten nicht öffentlich liefern.
- Bei Nichtverfügbarkeit zeigt die App den konkreten Grund und lässt den
  Artikel unverändert. Ein Bild kann jederzeit manuell über `Foto hinzufügen`
  importiert werden.
- Vor allem bei Farbe und Größe die Variante kontrollieren; Bild und
  Produktlink müssen übereinstimmen.
- Der Dienst ruft nur erlaubte Shop-/Bildhosts per HTTPS ab,
  begrenzt Antwortgröße und Dauer, folgt nur erlaubten Weiterleitungen,
  prüft Login/RLS und erfindet keine Bilder oder Preise.
- Die Menge ist auf euer kleines privates Haushaltsprojekt ausgelegt;
  für öffentlichen Mehrnutzerbetrieb müssten serverseitige
  Rate-Limits ergänzt werden.
