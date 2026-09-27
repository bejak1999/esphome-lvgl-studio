# Addons für ESPHome LVGL Studio

Ein **Addon** bringt fertige Funktionsblöcke in den Editor: „Frigate-Kamera anzeigen",
„Kartenausschnitt vom gewählten Punkt", „Sensorkarte für eine Home-Assistant-Entity".
Der Nutzer installiert es in den Einstellungen, klickt es links im Editor an, füllt ein
Popup aus – und im Dashboard stehen die passenden LVGL-Widgets samt ESPHome-YAML.

Ein Addon ist **eine JSON-Datei**. Kein Code, kein Build, keine Abhängigkeiten.

---

## Inhalt

1. [Warum JSON und was daraus folgt](#1-warum-json-und-was-daraus-folgt)
2. [Schnellstart: Addon in 15 Zeilen](#2-schnellstart-addon-in-15-zeilen)
3. [Installieren und verwalten](#3-installieren-und-verwalten)
4. [Bedienung im Editor](#4-bedienung-im-editor)
5. [Manifest-Referenz](#5-manifest-referenz)
   - [Kopfdaten](#51-kopfdaten)
   - [`settings` und `fields`](#52-settings-und-fields)
   - [Feldtypen](#53-feldtypen)
   - [`visibleIf`](#54-visibleif)
   - [Templates und Filter](#55-templates-und-filter)
   - [`outputs`](#56-outputs)
   - [`widgets`](#57-widgets)
   - [`yaml` – zusätzliche Komponenten](#58-yaml--zusätzliche-komponenten)
   - [`preview`](#59-preview)
6. [Vom Widget zum ESPHome-YAML](#6-vom-widget-zum-esphome-yaml)
7. [Wo Instanzen gespeichert werden](#7-wo-instanzen-gespeichert-werden)
8. [Beispiele](#8-beispiele)
9. [Fehlersuche](#9-fehlersuche)
10. [Für Studio-Entwickler: neue Feldtypen](#10-für-studio-entwickler-neue-feldtypen)

---

## 1. Warum JSON und was daraus folgt

Browser-Extensions dürfen unter Manifest V3 **keinen nachgeladenen Code ausführen**
(`unsafe-eval` ist gesperrt). Ein Addon-System mit JavaScript-Plugins wäre also nicht nur
riskant, sondern technisch unmöglich. Deshalb ist ein Addon rein deklarativ:

| Ein Addon **kann** | Ein Addon **kann nicht** |
| --- | --- |
| Formularfelder definieren (inkl. Karte, Farbwähler, Live-Dropdown aus einer URL) | eigenen JavaScript-Code mitbringen |
| Werte per Template in URLs/Props einsetzen, Teile bedingt weglassen | beliebige Berechnungen (nur `calc`, siehe unten) |
| rechnen (`+ - * / % ^`, `min/max/round/…`) | auf Dateien, Speicher oder andere Addons zugreifen |
| LVGL-Widgets anlegen und pflegen | eigene UI-Komponenten rendern |
| Top-Level-YAML-Komponenten ergänzen – inklusive ESPHome-Lambdas | vorhandene Nutzer-Werte überschreiben |
| Bilder/Endpunkte zur Laufzeit abfragen (Vorschau, Dropdown) | dauerhaft im Hintergrund laufen |

Auf dem **Gerät** kann ein Addon dagegen sehr wohl Logik ausführen: Alles, was ESPHome
kann (Lambdas, `interval:`, `on_time:`, Automationen), lässt sich über das
[`yaml`-Fragment](#58-yaml--zusätzliche-komponenten) mitliefern. Genau so entsteht z. B.
die Radar-Animation der Wetterkarte.

Was daraus folgt: Ein installiertes Addon kann nichts kaputtmachen, was der Nutzer nicht
sieht. Alles, was es tut, landet sichtbar im Editor-Modell und im YAML.

---

## 2. Schnellstart: Addon in 15 Zeilen

```json
{
  "id": "demo.uhr-label",
  "name": "Uhrzeit-Label",
  "version": "1.0.0",
  "icon": "🕒",
  "description": "Ein Label, dessen Größe und Farbe man einstellen kann.",
  "fields": [
    { "key": "farbe", "kind": "color", "label": "Textfarbe", "default": "#e5e7eb" },
    { "key": "groesse", "kind": "slider", "label": "Schriftgröße", "min": 10, "max": 64, "default": 28, "unit": "px" }
  ],
  "widgets": [
    {
      "key": "uhr",
      "type": "label",
      "name": "Uhrzeit",
      "width": 140,
      "height": "{{ config.groesse }}",
      "props": { "text": "12:34", "text_color": "{{ config.farbe }}", "font_size": "{{ config.groesse }}" }
    }
  ]
}
```

Einstellungen öffnen → **Addons → JSON direkt einfügen** → einfügen → *Aus JSON
installieren*. Danach steht „Uhrzeit-Label" links im Editor unter **Addons**.

---

## 3. Installieren und verwalten

**Es ist nichts vorinstalliert.** Auch die beiden fertigen Addons liegen als eigenständige
Manifeste in [`docs/examples`](examples) und werden wie jedes andere installiert – am
einfachsten per **Von URL** mit der angegebenen Adresse:

| Addon | Datei | Adresse für „Von URL“ |
| --- | --- | --- |
| Wetterkarte (Kartenpunkt, Regenradar-Animation, Uhr, Balken) | [`weather-radar/addon.json`](examples/weather-radar/addon.json) | `https://raw.githubusercontent.com/bejak1999/esphome-lvgl-studio/main/docs/examples/weather-radar/addon.json` |
| Frigate-Kamera (Kamera-Dropdown, Overlays) | [`frigate-camera/addon.json`](examples/frigate-camera/addon.json) | `https://raw.githubusercontent.com/bejak1999/esphome-lvgl-studio/main/docs/examples/frigate-camera/addon.json` |

Einstellungen (⚙ im Editor oder in der Sidebar) → Abschnitt **Addons**:

- **Von URL** – z. B. eine `raw.githubusercontent.com`-Adresse. Die Quelle wird gemerkt,
  „Aktualisieren" holt das Manifest erneut.
- **Datei…** – lokale `.json`-Datei.
- **JSON direkt einfügen** – zum Ausprobieren beim Entwickeln.

Beim Installieren wird das Manifest geprüft. Fehler erscheinen im Klartext
(„`fields[2]`: unbekannte 'kind' …"). Reine `Hinweis:`-Meldungen verhindern die
Installation nicht.

Weitere Aktionen je Addon: **aktiv**-Schalter (blendet es im Editor aus, ohne es zu
löschen), **Einstellungen** (die `settings`-Felder), **Manifest kopieren** (zum Teilen),
**Aktualisieren** (nur bei URL-Installation), **Deinstallieren**. Eine erneute Installation
mit derselben `id` ist ein Update: die `settings`-Werte bleiben erhalten.

Alles wird in `browser.storage.local` gespeichert und ist nach einem Neustart wieder da.

---

## 4. Bedienung im Editor

- Links unter der Widget-Palette: Abschnitt **Addons**.
  - Oben die installierten Addons – Klick legt eine **Instanz** an und öffnet das Popup.
  - Darunter **Im Dashboard**: alle Instanzen des aktuellen Dokuments. Klick öffnet sie
    erneut, `✕` entfernt Instanz **und** ihre Widgets.
- Im Popup: Felder ausfüllen, rechts die Live-Vorschau, unten **Übernehmen**.
  „Übernehmen" ist ein einzelner Undo-Schritt (Strg+Z macht ihn rückgängig).
- **Position gehört dem Nutzer:** nach dem Anlegen verschiebt man die Widgets frei im
  Canvas. Ein erneutes „Übernehmen" ändert nur Größe (wenn sie aus der Konfiguration
  kommt), Props und Namen – nie die Position.
- Instanzen auf anderen Seiten sind mit „· andere Seite" markiert; ein Klick wechselt dorthin.

---

## 5. Manifest-Referenz

### 5.1 Kopfdaten

| Feld | Pflicht | Bedeutung |
| --- | --- | --- |
| `id` | ja | Eindeutig, Kleinbuchstaben/Ziffern/`.`/`-`/`_`, 3–64 Zeichen. Konvention: `<herkunft>.<name>`, z. B. `benni.frigate-türklingel`. |
| `name` | ja | Anzeigename. |
| `version` | ja | Freitext, üblich ist SemVer. |
| `api` | – | Manifest-Format, aktuell `1`. Fehlt es, wird `1` angenommen. |
| `description` | – | Ein bis zwei Sätze; erscheint im Popup und in den Einstellungen. |
| `author`, `homepage` | – | Anzeige in den Einstellungen (`homepage` wird als Link gezeigt). |
| `icon` | – | Ein Emoji. |
| `settings` | – | Felder, die **einmal pro Installation** gelten (Basis-URLs, API-Keys). |
| `fields` | ja (darf `[]` sein) | Felder **je Instanz** (das Popup). |
| `outputs` | – | Abgeleitete Werte, verfügbar als `{{ out.<key> }}`. |
| `widgets` | ja | Die LVGL-Widgets, die die Instanz anlegt. |
| `yaml` | – | Zusätzliche Top-Level-Komponenten als YAML-Template. |
| `preview` | – | Live-Vorschau im Popup. |

### 5.2 `settings` und `fields`

Beide benutzen dieselbe Feld-Syntax, unterscheiden sich aber im Geltungsbereich:

- `settings` → `{{ settings.<key> }}`, gilt für **alle** Instanzen des Addons
  (Frigate-URL, Geoapify-Key). Wird in den Einstellungen gepflegt und ist im Popup
  eingeklappt mit erreichbar.
- `fields` → `{{ config.<key> }}`, gehört zu **einer** Instanz (welche Kamera, welche Größe).

Fehlt ein Wert, greift `default`; fehlt auch das, ein typabhängiger Standard. Neue Felder
in einer neuen Addon-Version bekommen bestehende Instanzen automatisch mit ihrem Default.

### 5.3 Feldtypen

Gemeinsame Schlüssel: `key` (Pflicht), `kind` (Pflicht), `label` (Pflicht), `help`,
`default`, `visibleIf`.

| `kind` | Wert im Template | Zusätzliche Schlüssel |
| --- | --- | --- |
| `text` | String | `placeholder`, `password` (Eingabe verdeckt) |
| `number` | Zahl | `min`, `max`, `step` |
| `slider` | Zahl | `min`, `max`, `step`, `unit` (nur Anzeige) |
| `select` | String | `options: [{ "value": "a", "label": "A" }]` (Pflicht) |
| `remote-select` | String | `url` (Pflicht, Template), `itemsPath`, `valueKey`, `labelKey` |
| `checkbox` | `true`/`false` | – |
| `color` | `#rrggbb` | – |
| `size` | `{ width, height }` → `{{ config.k.width }}` | `presets: ["320x240", …]` |
| `map` | `{ lat, lon, zoom, spanKm }` | `spanKm: { min, max, default }`, `aspectFrom`, `tileUrl`, `tileAttribution` |
| `ha-entity` | String (`sensor.xyz`) | – (Vorschläge kommen aus Home Assistant) |
| `note` | – (kein Wert) | nur `label` + `help`: Hinweistext im Formular |

**`remote-select`** lädt seine Optionen beim Öffnen von `url`:

```json
{
  "key": "camera", "kind": "remote-select", "label": "Kamera",
  "url": "{{ settings.url }}/api/config",
  "itemsPath": "cameras"
}
```

- `itemsPath` ist ein Punkt-Pfad in der JSON-Antwort (leer = ganze Antwort).
- Zeigt er auf ein **Objekt**, sind die Schlüssel die Werte (so liefert Frigate seine
  Kameras). Zeigt er auf eine **Liste**, werden `valueKey` (Standard `id`, ersatzweise
  `name`) und `labelKey` (Standard `name`) benutzt.
- Ist der Endpunkt nicht erreichbar, kann der Nutzer den Wert von Hand eintragen – das
  Addon funktioniert also auch ohne erreichbare API.

**`map`** zeigt eine echte Karte: Klick setzt den Punkt, Ziehen verschiebt, Mausrad zoomt,
`spanKm` regelt die Breite des Ausschnitts, und der blaue Rahmen zeigt genau den Bereich,
den das Gerät später lädt. `aspectFrom` verweist auf ein `size`-Feld (z. B.
`"config.size"`), damit der Rahmen das Seitenverhältnis des Bildes hat. Zusätzlich gibt es
eine Ortssuche (Nominatim) und Zahlenfelder für Lat/Lon.

Die Kacheln kommen standardmäßig von den CARTO-Basemaps. **Nicht** von
`tile.openstreetmap.org`: dessen Nutzungsregeln verlangen einen Referer bzw. eine
identifizierbare Anwendung, und Anfragen von einer Extension-Seite beantwortet der Server
mit „Access blocked"-Kacheln. Ein Addon kann eine eigene Quelle vorgeben – sinnvoll, wenn
ohnehin ein Kartenschlüssel konfiguriert ist, denn dann sieht die Vorschau genauso aus wie
das Bild auf dem Gerät:

```json
{
  "key": "location", "kind": "map", "label": "Standort",
  "tileUrl": "https://maps.geoapify.com/v1/tile/osm-bright-smooth/{z}/{x}/{y}.png?apiKey={{ settings.geoapifyKey }}",
  "tileAttribution": "© OpenStreetMap · © Geoapify"
}
```

`{z}/{x}/{y}` bleiben als Platzhalter stehen (einfache Klammern – nur `{{ … }}` wird
ersetzt). Lädt eine Kachel nicht (falscher Key, Dienst blockiert), fällt die Karte
automatisch auf die Standardquelle zurück.

### 5.4 `visibleIf`

Blendet Felder **und** Widgets bedingt aus:

```json
{ "visibleIf": { "key": "radar", "truthy": true } }
{ "visibleIf": { "key": "settings.provider", "equals": "geoapify" } }
{ "visibleIf": { "key": "config.mode", "in": ["a", "b"] } }
{ "visibleIf": { "key": "config.mode", "not": "aus" } }
```

`key` ohne Punkt wird als `config.<key>` gelesen. Genau eine der Prüfungen `equals`,
`not`, `in`, `truthy` angeben.

### 5.5 Templates und Filter

Überall, wo Text steht (URLs, Props, Namen, YAML-Fragment), gilt `{{ pfad }}`:

| Präfix | Inhalt |
| --- | --- |
| `config.…` | Werte der `fields` dieser Instanz |
| `settings.…` | Werte der `settings` der Installation |
| `out.…` | berechnete `outputs` |
| `iid` | Instanz-id (`a_1`, …) – für eindeutige YAML-ids |
| `widgets.<key>` | id des erzeugten Widgets, z. B. `img_2` (**nur im `yaml`-Fragment**, siehe 5.8) |
| `addon.id`, `addon.name`, `addon.version` | Metadaten |

Unbekannte Pfade ergeben einen leeren String (kein Absturz). Filter werden mit `|`
angehängt und dürfen verkettet werden:

| Filter | Wirkung |
| --- | --- |
| `fixed:5` | Zahl mit 5 Nachkommastellen |
| `round`, `int`, `abs` | runden / ganzzahlig / Betrag |
| `upper`, `lower` | Groß-/Kleinschreibung |
| `enc` | URL-Kodierung (für Query-Parameter) |
| `nohash` | `#ff8800` → `ff8800` |
| `default:xyz` | Ersatz, wenn leer |

Beispiel: `?lat={{ config.location.lat | fixed:5 }}&q={{ config.text | enc }}`

**Bedingte Blöcke** lassen Teile weg, wenn ein Wert nicht gesetzt ist – in URLs genauso wie
im YAML-Fragment:

```
{{#if config.timestamp}}&timestamp=1{{/if}}
{{#if config.radar}}Radar an{{else}}Radar aus{{/if}}
```

Der Pfad wird wie bei `visibleIf` ohne Punkt als `config.<key>` gelesen. Als **falsch**
gelten: nicht gesetzt, `false`, `0`, leerer String (und die Strings `"false"`/`"0"`, damit
auch Ergebnisse von `switch`/`calc` funktionieren). Blöcke dürfen verschachtelt werden.

### 5.6 `outputs`

Berechnete Werte, in Deklarationsreihenfolge ausgewertet – ein späterer Output darf einen
früheren als `{{ out.… }}` benutzen.

```json
"outputs": [
  { "key": "url", "kind": "template", "value": "{{ settings.url }}/api/{{ config.camera }}/latest.jpg" },
  { "key": "doppelt", "kind": "calc", "expr": "{{ config.size.width }} * 2" },
  { "key": "bild", "kind": "switch", "on": "settings.provider",
    "cases": { "a": "https://a/…", "b": "https://b/…" }, "fallback": "" },
  { "key": "bbox", "kind": "bbox",
    "lat": "{{ config.location.lat }}", "lon": "{{ config.location.lon }}",
    "spanKm": "{{ config.location.spanKm }}",
    "width": "{{ config.size.width }}", "height": "{{ config.size.height }}",
    "order": "wsen", "digits": 6 }
]
```

- **`template`** – Zeichenkette zusammensetzen.
- **`calc`** – Rechnen mit `+ - * / % ^`, Klammern, `pi`/`e` und den Funktionen
  `min, max, round, floor, ceil, abs, sqrt, cos, sin, tan, rad, deg, pow`.
  Optional `digits` (Nachkommastellen). Division durch 0 ergibt 0, Unsinn ergibt 0 –
  es wird nie eine Ausnahme geworfen.
- **`switch`** – Fallunterscheidung über einen Pfad (`on`), Werte in `cases`,
  `fallback` wenn kein Fall passt. Die Fall-Werte sind selbst Templates.
- **`bbox`** – WGS84-Bounding-Box aus Mittelpunkt + Breite in km. Die Höhe folgt dem
  Seitenverhältnis von `width`/`height`, damit das Bild nicht verzerrt.
  `order: "wsen"` (Standard) liefert `west,south,east,north` – so wollen es die meisten
  Static-Map-APIs. `order: "swne"` liefert `south,west,north,east` für WMS 1.3.0 mit
  EPSG:4326.

### 5.7 `widgets`

```json
{
  "key": "cam",
  "type": "image",
  "name": "Kamera {{ config.camera }}",
  "x": 0, "y": "{{ out.captionY }}",
  "width": "{{ config.size.width }}", "height": "{{ config.size.height }}",
  "entity": "{{ config.entity }}",
  "props": { "img_source": "online", "img_url": "{{ out.snapshot }}" },
  "visibleIf": { "key": "caption", "truthy": true },
  "children": []
}
```

| Feld | Bedeutung |
| --- | --- |
| `key` | Stabiler Schlüssel innerhalb des Addons. **Nicht ändern** – daran hängt die Zuordnung zum bereits erzeugten Widget. |
| `type` | Widget-Typ: `obj`, `label`, `icon`, `image`, `bar`, `led`, `line`, `meter`, `spinner`, `qrcode`, `button`, `slider`, `arc`, `switch`, `checkbox`, `dropdown`, `textarea` |
| `name` | Anzeigename im Element-Baum (Template). |
| `x`, `y` | **Versatz zum ersten Widget der Instanz**, nur beim Anlegen. Danach gehört die Position dem Nutzer. |
| `width`, `height` | Zahl oder Template. Enthält einer der beiden ein `{{`, wird die Größe bei jedem „Übernehmen" nachgezogen. |
| `props` | LVGL-/Editor-Eigenschaften, Werte dürfen Templates sein (rein numerische Ergebnisse werden zu Zahlen, `true`/`false` zu Booleans). |
| `entity` | Home-Assistant-Entity; die YAML-Engine erzeugt daraus die Sensor-Anbindung. |
| `children` | Verschachtelte Widgets. Nur `obj` nimmt Kinder auf; bei anderen Typen landen sie auf der Seite. |
| `visibleIf` | Widget nur anlegen, wenn die Bedingung stimmt – wird sie später falsch, verschwindet es wieder. |

Häufige `props` (die vollständige Liste steht in
[`src/core/lvgl/catalog.ts`](../src/core/lvgl/catalog.ts) und
[`src/core/yaml/mapping.ts`](../src/core/yaml/mapping.ts)):

| Bereich | Props |
| --- | --- |
| Alle | `bg_color`, `bg_opa` (0–100), `radius`, `border_width`, `border_color`, `opa`, `hidden`, `shadow_color`, `shadow_width`, `pad_all` |
| Text (`label`, `icon`, `checkbox`, `button`) | `text`, `text_color`, `font_size`, `text_align` (`LEFT`/`CENTER`/`RIGHT`) |
| `image` | `img_source` (`online`/`file`/`ref`), `img_url`, `img_file`, `img_ref`, `img_format`, `img_type`, `img_transparency`, `img_update_interval` (`5s`, `never`), `img_resize` (`320x180`), `img_buffer_size` (nur `online`, siehe unten) |
| Werte (`bar`, `slider`, `arc`, `meter`) | `value`, `min_value`, `max_value`, `color` |
| Zustände (`switch`, `checkbox`, `led`) | `checked`, `color`, `brightness` |
| `dropdown` | `options` (Liste), `selected_index` |

#### Automatischer Gruppen-Container

Alle Top-Level-Widgets einer Instanz landen automatisch in einem unsichtbaren
`obj`-Container (Schlüssel `__root` – **im Manifest reserviert**, `validateManifest`
lehnt einen Widget-`key` mit diesem Namen ab). Grund: LVGL-Kindkoordinaten sind relativ
zum Elternteil, daher bewegt ein Ziehen des Containers im Editor die ganze Instanz auf
einmal – man muss nicht jedes Widget (Karte, Radar, Balken, Uhr, …) einzeln greifen.

Praktisch bedeutet das:
- `x`/`y` in der Tabelle oben sind der Versatz **innerhalb der Gruppe**, nicht auf der
  Seite – Studio errechnet daraus Größe und Position des Containers.
- Der Container selbst ist unsichtbar (`bg_opa: 0`) und braucht keine eigene Angabe im
  Manifest.
- Explizit über `children:` verschachtelte Widgets (z. B. eine selbst gebaute Karte mit
  Titel/Wert) bleiben unter ihrem eigenen Elternteil – nur was sonst lose auf der Seite
  läge, wird zusätzlich gruppiert.
- Bereits vorhandene Instanzen (aus einer Studio-Version ohne diese Gruppierung) werden
  beim nächsten „Übernehmen" automatisch in den Container übernommen, ohne sich zu
  verschieben.

### 5.8 `yaml` – zusätzliche Komponenten

Braucht das Addon mehr als Widgets (Sensoren, Skripte, Intervalle, größere Timeouts),
liefert es ein Top-Level-YAML-Template:

```json
"yaml": "sensor:\n  - platform: template\n    id: addon_{{ iid }}_wert\n    lambda: 'return 1;'\n    update_interval: 60s\n"
```

**Die erzeugten Widget-ids stehen als `{{ widgets.<key> }}` zur Verfügung** – das Fragment
wird erst gerendert, nachdem die Widgets angelegt sind. Damit kann ein Addon echte
ESPHome-Logik auf seine eigenen Widgets schreiben (ESPHome-Tags wie `!lambda` und
`!secret` überstehen den Export unverändert):

```yaml
interval:
  - interval: 5s
    id: addon_{{ iid }}_tick
    then:
      - lvgl.label.update:
          id: {{ widgets.titel }}
          text: !lambda 'return "Hallo";'
```

Bei einem `image`-Widget heißt die zugehörige Bildkomponente `{{ widgets.<key> }}__img` –
so spricht z. B. die Wetterkarte ihr Radarbild mit `online_image.set_url` an.

Zusammenführung beim Export:

- Fehlt der Top-Level-Schlüssel, wird er komplett übernommen.
- Bei **Maps** werden nur fehlende Unterschlüssel ergänzt – **bestehende Werte des
  Nutzers bleiben immer stehen**. (Deshalb ist `http_request: { timeout: 15s }` ein
  freundlicher Vorschlag und kein Zwang.)
- Bei **Listen** gehören Einträge mit `id: addon_…` dem Addon: sie werden bei jedem Export
  aktualisiert und beim Entfernen der Instanz wieder gelöscht. Fremde Einträge werden nie
  angefasst.

> **Konvention (wird beim Installieren geprüft):** jede `id` im Fragment beginnt mit
> `addon_` und enthält `{{ iid }}`, z. B. `addon_{{ iid }}_wert`. Nur so bleiben mehrere
> Instanzen kollisionsfrei und aufräumbar.

### 5.9 `preview`

```json
"preview": { "kind": "image", "url": "{{ out.snapshot }}" }
```

Zeigt das Bild rechts im Popup, sobald die URL vollständig ist – so sieht man die richtige
Kamera bzw. den richtigen Kartenausschnitt vor dem Übernehmen. Nur `kind: "image"` wird
unterstützt.

---

## 6. Vom Widget zum ESPHome-YAML

Addons erzeugen **Editor-Widgets**, nicht direkt YAML. Den Rest macht die vorhandene
YAML-Engine – und zwar strukturerhaltend, also ohne Lambdas, Automationen oder Kommentare
im Geräte-YAML zu zerstören. Zwei Beispiele:

Ein `image`-Widget mit `img_source: "online"` wird zu

```yaml
online_image:
  - url: "http://frigate:5000/api/hof/latest.jpg?h=180"
    id: img_1__img
    format: AUTO
    type: RGB565
    update_interval: 5s
    resize: 320x180
http_request: {}          # ergänzt die Engine automatisch
lvgl:
  pages:
    - id: main_page
      widgets:
        - image:
            id: img_1
            src: img_1__img
            x: 20
            y: 20
            width: 320
            height: 180
```

Ein Widget mit `entity: "sensor.temperatur"` bekommt zusätzlich einen
Home-Assistant-Sensor (`<id>__state`) und die passende Aktualisierung.

Praktische Folge: Für „alle paar Sekunden ein Bild" braucht ein Addon **kein** eigenes
YAML – ein `image`-Widget mit `img_url` und `img_update_interval` genügt.

### Bildformate richtig setzen

`online_image` verlangt ein **gültiges** `format` – erlaubt sind nur `PNG`, `JPEG`, `JPG`
und `BMP`. Ein `AUTO` bricht die Kompilierung ab
(„Unknown value 'AUTO'"). Fehlt die Angabe oder ist sie ungültig, rät Studio anhand der URL
und schreibt sonst `PNG`; im Manifest sollte das Format trotzdem passend gesetzt sein:

| Quelle | `img_format` | `img_type` | Hinweis |
| --- | --- | --- | --- |
| Frigate `latest.jpg` | `JPEG` | `RGB565` | |
| Geoapify Static Map | `PNG` | `RGB565` | `&format=png` in die URL, sonst liefert Geoapify JPEG |
| WMS-Overlay (z. B. DWD-Radar) | `PNG` | `RGB565` + `img_transparency: alpha_channel` | ohne Transparenz verdeckt das Overlay die Karte |

`img_type: RGBA` gibt es in ESPHome nicht mehr; Studio übersetzt es automatisch nach
`RGB565` + `alpha_channel`.

### RAM: der Download-Puffer von `online_image`

Jedes `online_image`-Widget legt zwei Dinge im RAM des Geräts an:

1. Das **fertig dekodierte Bild** (`Breite × Höhe × Bytes/Pixel`, bei RGB565 also
   `×2`) – bleibt dauerhaft belegt, solange das Widget existiert. Hebel dafür: die
   Bildgröße kleiner wählen.
2. Einen **Download-Puffer** zum Streamen der HTTP-Antwort – Standard 64 KB
   (ESPHomes eigener `online_image`-Default), über `img_buffer_size` (Bytes)
   einstellbar.

Der zweite Punkt ist der überraschende Teil: `online_image` legt diesen Puffer als
C++-Member-Objekt an, das schon **beim Booten konstruiert wird – vor `setup()`, also
vor Display- und WLAN-Initialisierung**. Zwei `online_image`-Widgets (z. B. Karte +
Regenradar) reservieren damit ungefragt `2 × 64 KB = 128 KB`, bevor überhaupt eine
Zeile eigener Code läuft. Auf einem ESP32 **ohne PSRAM** (~300 KB nutzbares RAM) kann
das allein dazu führen, dass der Display-Treiber seinen eigenen (viel kleineren)
Framebuffer nicht mehr zugeteilt bekommt – Symptom:

```
[E][display:016]: Could not allocate buffer for display!
Guru Meditation Error: Core 1 panic'ed (StoreProhibited)
```
gefolgt von einem Boot-Loop.

`img_buffer_size` senkt nur diesen Streaming-Puffer (kein Effekt auf das Aussehen,
minimal langsameres Laden) – **nicht** die dekodierte Bildgröße aus Punkt 1. Ein
Addon mit mehreren Online-Bildern (wie die Wetterkarte) sollte dieses Feld anbieten,
wenn es für kleine/PSRAM-lose Boards gedacht ist:

```json
{ "key": "downloadBuffer", "kind": "slider", "label": "Download-Puffer je Bild",
  "min": 4096, "max": 65536, "step": 4096, "default": 16384 }
```
und in den `props` der Bild-Widgets: `"img_buffer_size": "{{ config.downloadBuffer }}"`.
Ohne diese Angabe bleibt ESPHomes Standard (64 KB) unverändert.

---

## 7. Wo Instanzen gespeichert werden

Die platzierten Instanzen stehen als Kommentar **im Geräte-YAML**:

```yaml
# lvgl-studio-addons (automatisch verwaltet – nicht von Hand ändern)
# lvgl-studio-addon: {"iid":"a_1","addon":"studio.frigate-camera","page":"main_page","config":{…},"widgetIds":{"cam":"img_1"},"yaml":"…"}
esphome:
  name: display
```

Vorteile: Das YAML ist die Quelle der Wahrheit, also findet man seine Addons nach
„Gerät laden" auf jedem Rechner wieder – ESPHome ignoriert Kommentare vollständig.
Weil auch das gerenderte `yaml`-Fragment mitgespeichert wird, exportiert ein Dashboard
korrekt, **selbst wenn das Addon dort nicht installiert ist**; das Popup zeigt dann nur
den Hinweis „Addon nicht installiert", die Widgets bleiben unangetastet.

Löschen kann man eine Instanz jederzeit über `✕` im Panel (Widgets gehen mit) – oder man
löscht die Widgets von Hand; beim nächsten „Übernehmen" legt das Addon sie neu an.

---

## 8. Beispiele

Die beiden ausgelieferten Addons liegen neben dem Projekt und sind die Referenz zum
Abschauen:

- **Wetterkarte** – [`examples/weather-radar/addon.json`](examples/weather-radar/addon.json): `map`-Feld mit eigener Kachelquelle, zwei
  `bbox`-Outputs (Static-Map- und WMS-Achsenreihenfolge), `switch` für zwei Anbieter,
  zuschaltbares Radar-Overlay mit Alpha-Kanal, Uhr (`time:` + `on_time`) und
  Radar-Animation (`globals:` + `interval:` + `online_image.set_url` mit Lambda) im
  `yaml`-Fragment, gesteuert über bedingte Blöcke.
- **Frigate-Kamera** – [`examples/frigate-camera/addon.json`](examples/frigate-camera/addon.json): `remote-select` gegen `/api/config`,
  `size` mit Presets, Overlay-Schalter, die als URL-Parameter eingebaut werden.

Zum Kopieren als eigene Dateien:

- [`docs/examples/hello-addon.json`](examples/hello-addon.json) – kleinstes sinnvolles Addon.
- [`docs/examples/ha-sensor-card.json`](examples/ha-sensor-card.json) – Karte mit
  Container + Kindern, Home-Assistant-Entity-Bindung und `yaml`-Fragment.

Ein JSON-Schema für Editor-Autovervollständigung liegt unter
[`docs/addon-manifest.schema.json`](addon-manifest.schema.json):

```json
{ "$schema": "https://raw.githubusercontent.com/<dein-repo>/main/docs/addon-manifest.schema.json", "id": "…" }
```

(`$schema` wird beim Installieren ignoriert und darf stehen bleiben.)

---

## 9. Fehlersuche

| Symptom | Ursache / Lösung |
| --- | --- |
| Installation abgelehnt | Die angezeigten Meldungen nennen Feld und Problem. `id`-Regeln beachten, `widgets` darf nicht leer sein. |
| Dropdown bleibt leer | URL im Popup unter „Addon-Einstellungen" prüfen; `itemsPath` zeigt vielleicht auf den falschen Ast. Der Wert lässt sich immer manuell eintragen. |
| Vorschau bleibt grau | URL unvollständig (fehlender API-Key?) oder Endpunkt nicht erreichbar. Die URL steht klein unter der Vorschau. |
| Bild bleibt auf dem Gerät leer | Die Adresse muss **aus dem WLAN des ESP32** erreichbar sein (kein `localhost`). Kleinere Auflösung/`resize` versuchen – RAM ist knapp. HTTPS auf ESP32 ist heikel; HTTP im LAN ist zuverlässiger. |
| Widget-Größe ändert sich nicht | `width`/`height` im Manifest sind feste Zahlen. Nur Templates (`"{{ config.size.width }}"`) werden nachgezogen. |
| Zahl im Widget ist 0 | Tippfehler im Template-Pfad: unbekannte Pfade sind leer. Bei `width`/`height` greift dann der Katalog-Standard, sonst 0. |
| Alte Instanz-Widgets bleiben liegen | Der `key` eines Widgets wurde in einer neuen Addon-Version umbenannt. Instanz einmal entfernen und neu anlegen. |
| Einträge im YAML bleiben nach dem Entfernen | Die `id` im `yaml`-Fragment beginnt nicht mit `addon_`. Nur solche Einträge kann Studio wieder aufräumen. |
| Kompilierfehler „Unknown value 'AUTO'" | `img_format` muss `PNG`, `JPEG`, `JPG` oder `BMP` sein – siehe [Bildformate](#bildformate-richtig-setzen). |
| Karte im Popup zeigt „Access blocked" | Kachelquelle blockiert Extension-Anfragen. Ohne `tileUrl` nutzt Studio die Standardquelle; mit eigenem Key ggf. den Key prüfen. |
| Fragment landet nicht im YAML | Es muss gültiges YAML sein – ein Syntaxfehler wird beim Export stillschweigend übersprungen. Zum Prüfen: „Zusätzliches YAML" im Popup ansehen. |

---

## 10. Für Studio-Entwickler: neue Feldtypen

Ein neuer Feldtyp (z. B. „Zeitspanne" oder „Icon-Auswahl") berührt genau vier Stellen:

1. `FieldKind` + ggf. neue Schlüssel in [`src/core/addons/types.ts`](../src/core/addons/types.ts).
2. Standardwert in `defaultForKind` ([`src/core/addons/apply.ts`](../src/core/addons/apply.ts))
   und den Typ in die Prüfliste `FIELD_KINDS` derselben Datei.
3. Darstellung in [`src/shared/addons/AddonField.vue`](../src/shared/addons/AddonField.vue)
   (komplexere Felder als eigene Komponente daneben, wie `MapPicker.vue`).
4. Diese Doku: Tabelle in [5.3](#53-feldtypen).

Der Rest (Speichern, Templates, Sichtbarkeit, Anwenden) funktioniert automatisch, weil
Feldwerte einfach im `config`-Objekt landen.

Die Kernlogik ist ohne Vue testbar; die Tests dazu liegen in
[`src/core/addons/addons.test.ts`](../src/core/addons/addons.test.ts).
