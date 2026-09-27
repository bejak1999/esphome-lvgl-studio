# Wetterkarte – Addon für ESPHome LVGL Studio

Zeigt auf dem ESPHome-Display einen Kartenausschnitt um einen frei gewählten Punkt –
optional mit animiertem DWD-Niederschlagsradar, Uhr und Fortschrittsbalken.
Fachlich das Gegenstück zum Esp32Weather-Webtool, nur eben als ESPHome-Dashboard.

Das Addon ist **eine JSON-Datei** ([`addon.json`](addon.json)) und wird nicht mit der
Extension ausgeliefert.

## Installieren

1. In ESPHome LVGL Studio die **Einstellungen** öffnen (⚙).
2. Abschnitt **Addons → Datei…** und diese `addon.json` auswählen.
3. Beim Addon auf **Einstellungen** klicken: Kartenanbieter wählen und – bei Geoapify –
   den API-Key eintragen (kostenlos auf [geoapify.com](https://www.geoapify.com/), Projekt → API-Key).
   Derselbe Key liefert die Kacheln der Vorschaukarte **und** das Bild auf dem Gerät.
4. Im Editor links unter **Addons** auf „Wetterkarte" klicken.

## Konfiguration

| Bereich | Was es tut |
| --- | --- |
| **Standort** | Klick auf die Karte setzt den Mittelpunkt, der Regler „Breite" den Ausschnitt in km. Der blaue Rahmen zeigt exakt den Bereich, den das Gerät später lädt (Seitenverhältnis folgt der eingestellten Bildgröße). Ortssuche und Lat/Lon-Felder sind ebenfalls da. |
| **Größe** | Pixelgröße des Bildes auf dem Display. Klein halten – das Bild liegt komplett im RAM des ESP32. |
| **Karte aktualisieren** | Wie oft die Basiskarte neu geladen wird (sie ändert sich kaum, 30 min sind sinnvoll). |
| **Regenradar** | Legt das DWD-Niederschlagsradar als transparente Ebene über die Karte (nur Deutschland). |
| **Anzahl Bilder** | 1 = nur das aktuelle Radarbild. Mehr Bilder ergeben eine Schleife (älteste Aufnahme zuerst) – das Gerät baut die URL je Bild selbst und hängt den passenden `time`-Parameter an. |
| **Abstand / Anzeigedauer** | Zeitlicher Abstand der Radarbilder (DWD liefert alle 5 min) und wie lange jedes zu sehen ist. |
| **Fortschrittsbalken** | Dünner Balken am unteren Rand: an welcher Stelle der Schleife die Anzeige gerade steht. |
| **Uhr** | Label mit der Zeit aus dem Netz (SNTP), Position/Größe/Farbe/Format einstellbar. |
| **Download-Puffer je Bild** | Siehe „Speicher (RAM)" unten – ohne PSRAM klein halten. |

## Was im YAML entsteht

- `online_image:` für die Karte (Geoapify Static Map bzw. staticmap.openstreetmap.de)
  und – wenn eingeschaltet – ein zweites für das Radar mit
  `type: RGB565` + `transparency: alpha_channel`, damit die Karte darunter sichtbar bleibt.
- `time:` (SNTP) für Uhr und Animation, mit `on_time` zum Aktualisieren des Uhr-Labels.
- `globals:` + `interval:` für die Radar-Animation. Der `interval`-Block setzt per
  `online_image.set_url` die URL mit dem Zeitstempel des jeweiligen Bildes und schiebt den
  Balken weiter.
- `http_request: timeout: 20s` – Kartenbilder brauchen etwas länger als die Vorgabe.

Alle erzeugten Einträge tragen ids mit dem Präfix `addon_<instanz>_` und verschwinden
wieder, wenn die Instanz entfernt wird. Eigene Einträge im YAML bleiben unangetastet.

## Speicher (RAM) – wichtig ohne PSRAM

Karte und Regenradar sind zwei getrennte `online_image`-Komponenten. Jede davon legt
zwei Dinge im RAM an:

1. Das **dekodierte Bild** – `Breite × Höhe × 2 Byte` (RGB565), bleibt dauerhaft belegt.
   Bei 240×240 sind das ~115 KB, mit Radar also **zwei** solcher Bilder gleichzeitig.
2. Einen **Download-Puffer** zum Streamen der HTTP-Antwort – das steuert das Feld
   „Download-Puffer je Bild" (Standard hier: 16 KB statt ESPHomes 64-KB-Vorgabe).

Der zweite Punkt ist auf kleinen Boards der überraschende Teil: ESPHome legt diesen
Puffer **schon beim Booten an – vor Display- und WLAN-Initialisierung**. Zwei
Online-Bilder mit je 64 KB reservieren also 128 KB, bevor überhaupt eine Zeile eigener
Code läuft. Auf einem ESP32 **ohne PSRAM** (~300 KB nutzbares RAM) kann allein das den
Speicher für den Display-Puffer knapp machen – Symptom:

```
[E][display:016]: Could not allocate buffer for display!
Guru Meditation Error: Core 1 panic'ed (StoreProhibited)
```
gefolgt von einem Boot-Loop, direkt beim Start, noch bevor WLAN verbindet.

**Ohne PSRAM empfohlen:**
- „Download-Puffer je Bild" niedrig lassen (8–16 KB reicht für PNG-Streaming völlig aus).
- Größe möglichst klein wählen (240×240 oder kleiner) – das ist der Hebel für Punkt 1,
  den der Puffer-Regler NICHT beeinflusst.
- Im Zweifel Radar erst mal ausschalten, ein Bild testen, dann zuschalten.

## Bekannte Grenzen

- **Nur Deutschland**: das DWD-Radar deckt Deutschland und Randgebiete ab.
- Die Animation braucht eine gültige Uhrzeit; direkt nach dem Start zeigt das Gerät bis zur
  ersten SNTP-Synchronisierung das aktuelle Radarbild ohne `time`-Parameter.
- **Die Animation ist kein flüssiges Video**: ESPHome kann die Einzelbilder nicht
  zwischenspeichern, jedes wird bei jedem Durchlauf neu geladen und dekodiert. Unter etwa
  4 Sekunden je Bild wird es ruckelig, und die Netzlast steigt spürbar (bei 6 Bildern à 5 s
  sind das 12 Downloads pro Minute).
- `staticmap.openstreetmap.de` ist ein Community-Dienst ohne Verfügbarkeitsgarantie – für
  dauerhaften Betrieb ist Geoapify die verlässlichere Wahl.

## Eigene Änderungen

`addon.json` bearbeiten, in den Einstellungen erneut über **Datei…** installieren (gleiche
`id` = Update) und im Editor **Übernehmen** drücken. Format-Referenz:
`EspHomeTool/docs/ADDONS.md`.
