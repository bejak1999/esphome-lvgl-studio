# Frigate-Kamera – Addon für ESPHome LVGL Studio

Zeigt auf dem ESPHome-Display alle paar Sekunden ein aktuelles Standbild einer
Frigate-Kamera. Die Kameraliste kommt live aus Frigate, Overlays (Zeitstempel, erkannte
Objekte, Bewegung, Zonen) lassen sich zuschalten.

Das Addon ist **eine JSON-Datei** ([`addon.json`](addon.json)) und wird nicht mit der
Extension ausgeliefert.

## Installieren

1. In ESPHome LVGL Studio die **Einstellungen** öffnen (⚙).
2. Abschnitt **Addons → Datei…** und diese `addon.json` auswählen.
3. Beim Addon auf **Einstellungen** klicken und die **Frigate-Basis-URL** eintragen,
   z. B. `http://192.168.1.20:5000` (ohne Schrägstrich am Ende).
4. Im Editor links unter **Addons** auf „Frigate-Kamera" klicken – im Popup erscheint die
   Kameraliste.

## Konfiguration

| Feld | Bedeutung |
| --- | --- |
| **Kamera** | Dropdown, gefüllt aus `GET /api/config` (Schlüssel unter `cameras`). Ist Frigate gerade nicht erreichbar, lässt sich der Name von Hand eintragen. |
| **Größe** | Pixelgröße auf dem Display. Frigate skaliert serverseitig auf diese Höhe (`?h=`), es wird also nur so viel übertragen wie nötig. |
| **Aktualisierung** | Abstand zwischen zwei Bildern (2–60 s). |
| **JPEG-Qualität** | `?quality=` – niedriger heißt kleineres Bild und schnellerer Download. |
| **Overlays** | `timestamp`, `bbox` (erkannte Objekte), `motion`, `regions` – Frigate zeichnet sie direkt ins Bild. |
| **Beschriftung** | Zusätzliches Label mit dem Kameranamen unter dem Bild. |

Die Vorschau im Popup zeigt exakt das Bild, das später auf dem Gerät landet.

## Was im YAML entsteht

```yaml
online_image:
  - url: "http://192.168.1.20:5000/api/hof/latest.jpg?h=135&quality=70"
    id: img_1__img
    format: JPEG
    type: RGB565
    update_interval: 5s
    resize: 240x135
http_request:
  timeout: 10s
```

Dazu das LVGL-`image`-Widget, das auf `img_1__img` zeigt.

## Bekannte Grenzen

- Die Frigate-Adresse muss **aus dem WLAN des ESP32** erreichbar sein – `localhost` oder ein
  Docker-internes Netz funktionieren nicht.
- Frigate hinter HTTPS mit selbstsigniertem Zertifikat ist auf dem ESP32 mühsam; im LAN ist
  HTTP zuverlässiger.
- Jedes Bild wird komplett dekodiert und im RAM gehalten: 320×240 in RGB565 sind ~150 KB.
  Ohne PSRAM lieber bei ≤ 240×135 bleiben oder das Intervall erhöhen.
- Es wird das JPEG von `latest.jpg` verwendet, kein Videostream – Frigates
  `/api/<cam>/latest.jpg` ist genau dafür gedacht.

## Eigene Änderungen

`addon.json` bearbeiten, in den Einstellungen erneut über **Datei…** installieren (gleiche
`id` = Update) und im Editor **Übernehmen** drücken. Format-Referenz:
`EspHomeTool/docs/ADDONS.md`.
