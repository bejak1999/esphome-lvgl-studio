import type { WidgetNode } from '../lvgl/types';
import type { Language } from '@/shared/i18n';

/**
 * Beispielinhalte der eingebauten Vorlagen: Texte, Werte und Icons.
 *
 * Die Vorlagen in builtins.ts beschreiben nur Aufbau und Quell-Palette. Was auf dem Display
 * steht, kommt beim Einfügen aus dieser Tabelle – in der UI-Sprache (en/de). Nicht aufgeführte
 * Texte (Tastatur-Tasten, IP-Adressen, Einheiten …) bleiben unverändert.
 */

type Pair = [en: string, de: string];
const same = (s: string): Pair => [s, s];

export const TEXTS: Record<string, Pair> = {
  // Klima
  Heating: ['Heating', 'Heizen'],
  HEATING: ['HEATING', 'HEIZEN'],
  '23.0': same('22.5'),
  '21.5': same('20.5'),
  '22.0': same('21.0'),
  'Currently 19.8°': ['Currently 20.1°', 'Aktuell 20,1°'],
  'Fan: Auto': ['Fan: auto', 'Lüfter: Auto'],
  HUMIDITY: ['HUMIDITY', 'FEUCHTE'],
  '54%': same('49%'),
  'AIR QUALITY': ['AIR', 'LUFT'],
  Good: ['Good', 'Gut'],
  ENERGY: ['ENERGY', 'ENERGIE'],
  '2.4 kWh': same('3.1 kWh'),
  OUTDOOR: ['OUTSIDE', 'AUSSEN'],
  '8.2°': same('11.4°'),
  Heat: ['Heat', 'Heizen'],
  Cool: ['Cool', 'Kühlen'],
  Off: ['Off', 'Aus'],
  'Now: 21.5°C': ['Now: 20.5 °C', 'Jetzt: 20,5 °C'],
  Mon: ['Mon', 'Mo'],
  Tue: ['Tue', 'Di'],
  Wed: ['Wed', 'Mi'],
  Thu: ['Thu', 'Do'],
  Fri: ['Fri', 'Fr'],
  Sat: ['Sat', 'Sa'],
  Sun: ['Sun', 'So'],
  'Wake Up': ['Wake up', 'Aufstehen'],
  '23°C': same('22°C'),
  Away: ['Away', 'Weg'],
  '18°C': same('17°C'),
  Return: ['Home', 'Zuhause'],
  Sleep: ['Night', 'Nacht'],
  '19°C': same('18°C'),
  MODE: ['MODE', 'MODUS'],
  // Licht
  '80%': same('65%'),
  LIGHT: ['LIGHT', 'LICHT'],
  '12W': same('9W'),
  Lighting: ['Lighting', 'Licht'],
  '4 of 6 on': ['3 of 5 on', '3 von 5 an'],
  '75%': same('70%'),
  Kitchen: ['Kitchen', 'Küche'],
  Bedroom: ['Bedroom', 'Schlafen'],
  '30%': same('25%'),
  Porch: ['Terrace', 'Terrasse'],
  '60%': same('55%'),
  Relax: ['Relax', 'Relaxen'],
  Focus: ['Work', 'Arbeit'],
  Bright: ['Bright', 'Hell'],
  // Energie
  'Power Usage': ['Energy now', 'Verbrauch'],
  '1.4 kW': same('0.9 kW'),
  HVAC: ['Heat pump', 'Wärmepumpe'],
  '2.4 kW': same('1.1 kW'),
  '340W': same('280W'),
  '240W': same('190W'),
  Today: ['Today', 'Heute'],
  '12.8 kWh': same('9.6 kWh'),
  '980W': same('870W'),
  '420W': same('360W'),
  'EV Charger': ['Wallbox', 'Wallbox'],
  '380W': same('410W'),
  Other: ['Other', 'Sonstiges'],
  '280W': same('230W'),
  TOTAL: ['TOTAL', 'GESAMT'],
  '18.6 kWh': same('14.2 kWh'),
  // Sensoren
  '22.4': same('21.8'),
  '58': same('52'),
  '1013': same('1008'),
  '340': same('420'),
  '22 °C': same('21 °C'),
  '48 %': same('52 %'),
  '1013 hPa': same('1008 hPa'),
  '340 ppm': same('610 ppm'),
  '48% · 1013 hPa': same('52% · 1008 hPa'),
  '3 lights · 2 plugs': ['2 lights · 1 plug', '2 Lichter · 1 Stecker'],
  'Living Room': ['Lounge', 'Wohnzimmer'],
  // Cover / Lüfter
  'Living Room Blinds': ['Office blinds', 'Rollo Büro'],
  Open: ['Open', 'Offen'],
  'Ceiling Fan': ['Ceiling fan', 'Deckenlüfter'],
  Medium: ['Medium', 'Mittel'],
  'Speed 2/3': ['Level 2/3', 'Stufe 2/3'],
  // Bewässerung
  'Front Lawn': ['Lawn', 'Rasen'],
  Idle: ['Idle', 'Bereit'],
  Moisture: ['Soil', 'Boden'],
  '65%': same('58%'),
  Irrigation: ['Irrigation', 'Bewässerung'],
  '06:00 AM Daily': ['Daily 05:30', 'Täglich 05:30'],
  'Next: 6h 23m': ['Next: 4h 10m', 'Nächste: 4h 10m'],
  'Garden Beds': ['Veg beds', 'Beete'],
  '72%': same('66%'),
  'Back Yard': ['Backyard', 'Garten'],
  '48%': same('44%'),
  'Side Strip': ['Hedge', 'Hecke'],
  '61%': same('57%'),
  '35%': same('39%'),
  '45 min': same('40 min'),
  '38.4 gal': same('142 L'),
  // Sicherheit
  'ARMED AWAY': ['ARMED', 'SCHARF'],
  'Front Door': ['Front door', 'Haustür'],
  Secure: ['Locked', 'Zu'],
  'Motion Sensor': ['Motion', 'Bewegung'],
  Windows: ['Windows', 'Fenster'],
  OPEN: ['OPEN', 'OFFEN'],
  'Back Door': ['Patio door', 'Terrassentür'],
  'System Armed': ['Alarm on', 'Alarm aktiv'],
  Closed: ['Closed', 'Zu'],
  '2 min ago': ['3 min ago', 'vor 3 Min.'],
  Hallway: ['Hallway', 'Flur'],
  Clear: ['Clear', 'Frei'],
  '5 min ago': ['8 min ago', 'vor 8 Min.'],
  'Garage Door': ['Garage door', 'Garagentor'],
  // Szenen
  SCENES: ['SCENES', 'SZENEN'],
  Movie: ['Cinema', 'Kino'],
  Morning: ['Day', 'Tag'],
  Dinner: ['Dinner', 'Essen'],
  'Movie Night': ['Cinema night', 'Kinoabend'],
  Active: ['Active', 'Aktiv'],
  '5 devices': ['4 devices', '4 Geräte'],
  'Living Room Lights': ['Lounge lights', 'Licht Wohnen'],
  'Dimmed 20%': ['Dimmed 15%', 'Gedimmt 15%'],
  Netflix: same('Streaming'),
  'Surround On': ['Surround on', 'Surround an'],
  AC: ['Air con', 'Klima'],
  '22°C Cool': ['21°C cool', '21°C kühlen'],
  'Quick Controls': ['Quick access', 'Schnellzugriff'],
  Lights: ['Lights', 'Licht'],
  Fan: ['Fan', 'Lüfter'],
  Speaker: ['Music', 'Musik'],
  Lock: ['Lock', 'Schloss'],
  // Navigation / Status
  Home: ['Home', 'Start'],
  Energy: ['Energy', 'Energie'],
  Shield: ['Security', 'Schutz'],
  Alerts: ['Alerts', 'Meldung'],
  Settings: ['Settings', 'Setup'],
  Dashboard: ['Overview', 'Übersicht'],
  '14:32': same('09:41'),
  'Mon 28 Mar': ['Tue 14 Oct', 'Di 14. Okt'],
  'Motion Detected': ['Motion detected', 'Bewegung erkannt'],
  'Front door camera detected movement': ['Driveway camera detected movement', 'Kamera Einfahrt hat Bewegung erkannt'],
  // WLAN-Einrichtung
  'Connection Mode': ['Connection', 'Verbindung'],
  'How should this device connect?': ['How should this display connect?', 'Wie soll sich das Display verbinden?'],
  'Join Network': ['Use Wi-Fi', 'WLAN nutzen'],
  'Connect to your existing WiFi': ['Join your existing network', 'Mit vorhandenem WLAN verbinden'],
  'Create Hotspot': ['Setup hotspot', 'Setup-Hotspot'],
  'Device creates its own network': ['Display opens its own network', 'Display öffnet eigenes Netz'],
  'Device Hotspot': ['Setup hotspot', 'Setup-Hotspot'],
  'Connect to configure this device': ['Connect to set up this display', 'Verbinden zum Einrichten'],
  'WIFI:S:ESP32-Setup;P:esphome123;;': same('WIFI:S:Display-Setup;P:setup2026;;'),
  'ESP32-Setup': same('Display-Setup'),
  esphome123: same('setup2026'),
  Network: ['Network', 'Netz'],
  Password: ['Password', 'Passwort'],
  'Scan to connect': ['Scan to connect', 'Zum Verbinden scannen'],
  'Open Portal': ['Open portal', 'Portal öffnen'],
  'Enter Password': ['Enter password', 'Passwort eingeben'],
  'Step 2/4': ['Step 2/4', 'Schritt 2/4'],
  HomeNetwork_5G: same('MyWiFi'),
  Secured: ['Secured', 'Gesichert'],
  'Enter WiFi password|': ['Wi-Fi password|', 'WLAN-Passwort|'],
  Connect: ['Connect', 'Verbinden'],
  Space: ['Space', 'Leer'],
  Connecting: ['Connecting', 'Verbinde'],
  'Step 3/4': ['Step 3/4', 'Schritt 3/4'],
  'Authenticating…': ['Signing in…', 'Anmeldung…'],
  'Connected!': ['Connected!', 'Verbunden!'],
  Done: ['Done', 'Fertig'],
  'Connection Failed': ['Connection failed', 'Verbindung fehlgeschlagen'],
  'Wrong password or network unavailable': ['Wrong password or network not reachable', 'Falsches Passwort oder Netz nicht erreichbar'],
  Retry: ['Retry', 'Erneut'],
  Back: ['Back', 'Zurück'],
  'Manual IP': ['Manual IP', 'Manuelle IP'],
  'Static network configuration': ['Static network settings', 'Feste Netzwerkeinstellungen'],
  'IP Address': ['IP address', 'IP-Adresse'],
  Subnet: ['Subnet', 'Subnetz'],
  Apply: ['Apply', 'Übernehmen'],
  'Firmware Update': ['Firmware update', 'Firmware-Update'],
  'Downloading…': ['Downloading…', 'Lädt…'],
  'v2.1.0 → v2.2.0': same('v1.4 → v1.5'),
  // Basis
  Temperatur: ['Temperature', 'Temperatur'],
  '23.5°': same('21.9°'),
  Licht: ['Light', 'Licht'],
  Helligkeit: ['Brightness', 'Helligkeit'],
};

/** Icon-Tausch: Quell-Glyph → eigener Glyph (alle in der gebündelten MDI-Schrift enthalten). */
export const ICON_SWAP: Record<number, number> = {
  0xf0238: 0xf0438, // fire → radiator
  0xf0241: 0xf140c, // flash → lightning-bolt-outline
  0xf050f: 0xf0510, // thermometer → thermometer-lines
  0xf058c: 0xf0e0a, // water → water-outline
  0xf0143: 0xf0b2d, // chevron-up → chevron-up-circle-outline
  0xf0140: 0xf0b27, // chevron-down → chevron-down-circle-outline
  0xf0208: 0xf06d0, // eye → eye-outline
  0xf02dc: 0xf06a1, // home → home-outline
  0xf04db: 0xf0667, // stop → stop-circle-outline
  0xf0210: 0xf171d, // fan → fan-auto
  0xf068a: 0xf0ccb, // shield → shield-home-outline
  0xf033e: 0xf0341, // lock → lock-outline
  0xf0d91: 0xf0583, // motion-sensor → walk
  0xf0381: 0xf0422, // movie → popcorn
  0xf0425: 0xf0a48, // power → exit-run
  0xf0450: 0xf04e6, // refresh → sync
  0xf0717: 0xf0f2a, // snowflake → snowflake-variant
  0xf0502: 0xf07f4, // television → television-classic
  0xf04c3: 0xf071f, // speaker → speaker-wireless
  0xf009a: 0xf009c, // bell → bell-outline
  0xf0493: 0xf08bb, // cog → cog-outline
};

function mapText(s: string, lang: Language): string {
  const cp = [...s].length === 1 ? s.codePointAt(0)! : 0;
  if (cp && ICON_SWAP[cp]) return String.fromCodePoint(ICON_SWAP[cp]);
  const pair = TEXTS[s];
  return pair ? pair[lang === 'de' ? 1 : 0] : s;
}

/** Vorlage (tiefe Kopie) mit Beispielinhalten in der UI-Sprache. */
export function localizeTemplate(node: WidgetNode, lang: Language): WidgetNode {
  const copy = JSON.parse(JSON.stringify(node)) as WidgetNode;
  const walk = (n: WidgetNode) => {
    const p = n.props as Record<string, unknown>;
    for (const k of ['text', 'placeholder_text']) if (typeof p[k] === 'string') p[k] = mapText(p[k] as string, lang);
    if (Array.isArray(p.options)) p.options = (p.options as unknown[]).map((o) => (typeof o === 'string' ? mapText(o, lang) : o));
    n.children.forEach(walk);
  };
  walk(copy);
  return copy;
}
