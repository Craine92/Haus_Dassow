# Haus Dassow auf Handy und PC installieren

## Windows (Brave, Chrome, Edge)
1. https://craine92.github.io/Haus_Dassow/ öffnen.
2. Im Browsermenü "App installieren" bzw. "Verknüpfung erstellen" auswählen.
3. Das Haus-Dassow-Symbol an Taskleiste/Startmenü anheften oder auf Desktop legen.
4. Einmal anmelden; der Browser speichert die Sitzung wie üblich.

## iPhone/iPad
1. Haus Dassow in **Safari** öffnen.
2. Teilen → **Zum Home-Bildschirm**.
3. **Als Web-App öffnen** aktivieren und Hinzufügen.
4. Das Icon erscheint auf dem Home-Bildschirm. Anmeldung bleibt durch die Web-App verwaltet.

## Teilen von OTTO-/Amazon-Produkten
- **Android / Chromium:** Sobald die PWA installiert ist, kann sie als Freigabeziel auftauchen.
  Beim Teilen öffnet die PWA einen vorausgefüllten Produktentwurf. Der Benutzer
  prüft und ergänzt Preis/Foto, bevor er gespeichert wird.
- **iPhone:** Safari unterstützt den Web Share Target Standard derzeit nicht.
  Erstellt in der iOS-App **Kurzbefehle** eine eigene Aktion für das Teilen-Menü:
  1. Neuer Kurzbefehl "Zu Haus Dassow"; als Eingabe im Teilen-Menü URLs zulassen.
  2. Aktion **URL codieren**: Eingabe „Kurzbefehl-Eingabe“.
  3. Aktion **Text**: `https://craine92.github.io/Haus_Dassow/?url=` und direkt dahinter die Variable **Codierter Text**.
  4. Aktion **URLs öffnen** mit dem Text aus Schritt 3.
  Anschließend in OTTO/Amazon → Teilen → „Zu Haus Dassow“.
- **Fallback auf allen Geräten:** Link kopieren, Haus Dassow öffnen und
  **Link übernehmen** anklicken.

## Bilder & Preise
Das Einlesen eines Produktlinks übernimmt zunächst nur URL, ggf. Titel und Shop.
Viele Händler unterbinden Browserabrufe (CORS, Bot-Schutz). Daher werden
Preis und Produktbild *nicht* automatisch als zuverlässig verfügbar versprochen.
Im Produktformular können Preis und Bild ergänzt werden. Bilder werden privat
in Supabase Storage gespeichert und nach Berechtigung geprüft angezeigt.

## Datenschutz
Geteilte Links öffnen nur ein Formular, sie schreiben nicht automatisch in die
Datenbank. Nur nach Anmeldung und bewusstem Speichern entsteht ein Produkt.
Private JSONs niemals committen. Die PWA cached keine privaten Daten offline.
