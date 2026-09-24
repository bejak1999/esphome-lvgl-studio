/**
 * Kuratierte Material-Design-Icons für den Editor-Icon-Picker (kategorisiert).
 * Codepoints stammen aus der gebündelten @mdi/font (materialdesignicons.css).
 * Der Glyph wird über die MDI-Schrift gerendert; im ESPHome-YAML wird das Zeichen
 * als Text gesetzt (benötigt eine mdi-Font-Definition im Ziel-YAML).
 */

export interface IconDef {
  /** MDI-Name (z. B. "lightbulb-outline"). */
  name: string;
  label: string;
  /** Unicode-Codepoint des Glyphs. */
  code: number;
  category: string;
}

export const ICON_CATEGORIES: string[] = ["Beleuchtung","Klima","Sicherheit","Energie","Medien","Haushalt","Navigation","Status"];

export const ICONS: IconDef[] = [
  { name: "lightbulb", label: "Lightbulb", code: 0xF0335, category: "Beleuchtung" },
  { name: "lightbulb-outline", label: "Lightbulb Outline", code: 0xF0336, category: "Beleuchtung" },
  { name: "lightbulb-on", label: "Lightbulb On", code: 0xF06E8, category: "Beleuchtung" },
  { name: "ceiling-light", label: "Ceiling Light", code: 0xF0769, category: "Beleuchtung" },
  { name: "lamp", label: "Lamp", code: 0xF06B5, category: "Beleuchtung" },
  { name: "floor-lamp", label: "Floor Lamp", code: 0xF08DD, category: "Beleuchtung" },
  { name: "led-strip", label: "Led Strip", code: 0xF07D6, category: "Beleuchtung" },
  { name: "wall-sconce-flat", label: "Wall Sconce Flat", code: 0xF091D, category: "Beleuchtung" },
  { name: "string-lights", label: "String Lights", code: 0xF12BA, category: "Beleuchtung" },
  { name: "thermometer", label: "Thermometer", code: 0xF050F, category: "Klima" },
  { name: "snowflake", label: "Snowflake", code: 0xF0717, category: "Klima" },
  { name: "fire", label: "Fire", code: 0xF0238, category: "Klima" },
  { name: "water-percent", label: "Water Percent", code: 0xF058E, category: "Klima" },
  { name: "fan", label: "Fan", code: 0xF0210, category: "Klima" },
  { name: "air-conditioner", label: "Air Conditioner", code: 0xF001B, category: "Klima" },
  { name: "radiator", label: "Radiator", code: 0xF0438, category: "Klima" },
  { name: "weather-sunny", label: "Weather Sunny", code: 0xF0599, category: "Klima" },
  { name: "weather-night", label: "Weather Night", code: 0xF0594, category: "Klima" },
  { name: "weather-cloudy", label: "Weather Cloudy", code: 0xF0590, category: "Klima" },
  { name: "weather-partly-cloudy", label: "Weather Partly Cloudy", code: 0xF0595, category: "Klima" },
  { name: "weather-rainy", label: "Weather Rainy", code: 0xF0597, category: "Klima" },
  { name: "weather-windy", label: "Weather Windy", code: 0xF059D, category: "Klima" },
  { name: "lock", label: "Lock", code: 0xF033E, category: "Sicherheit" },
  { name: "lock-open-variant", label: "Lock Open Variant", code: 0xF0FC6, category: "Sicherheit" },
  { name: "door", label: "Door", code: 0xF081A, category: "Sicherheit" },
  { name: "door-open", label: "Door Open", code: 0xF081C, category: "Sicherheit" },
  { name: "window-closed-variant", label: "Window Closed Variant", code: 0xF11DB, category: "Sicherheit" },
  { name: "window-open-variant", label: "Window Open Variant", code: 0xF11DC, category: "Sicherheit" },
  { name: "cctv", label: "Cctv", code: 0xF07AE, category: "Sicherheit" },
  { name: "shield-home", label: "Shield Home", code: 0xF068A, category: "Sicherheit" },
  { name: "motion-sensor", label: "Motion Sensor", code: 0xF0D91, category: "Sicherheit" },
  { name: "alarm-light", label: "Alarm Light", code: 0xF078F, category: "Sicherheit" },
  { name: "flash", label: "Flash", code: 0xF0241, category: "Energie" },
  { name: "power", label: "Power", code: 0xF0425, category: "Energie" },
  { name: "power-plug", label: "Power Plug", code: 0xF06A5, category: "Energie" },
  { name: "battery", label: "Battery", code: 0xF0079, category: "Energie" },
  { name: "battery-charging", label: "Battery Charging", code: 0xF0084, category: "Energie" },
  { name: "solar-power", label: "Solar Power", code: 0xF0A72, category: "Energie" },
  { name: "gauge", label: "Gauge", code: 0xF029A, category: "Energie" },
  { name: "transmission-tower", label: "Transmission Tower", code: 0xF0D3E, category: "Energie" },
  { name: "ev-station", label: "Ev Station", code: 0xF05F1, category: "Energie" },
  { name: "play", label: "Play", code: 0xF040A, category: "Medien" },
  { name: "pause", label: "Pause", code: 0xF03E4, category: "Medien" },
  { name: "stop", label: "Stop", code: 0xF04DB, category: "Medien" },
  { name: "skip-next", label: "Skip Next", code: 0xF04AD, category: "Medien" },
  { name: "skip-previous", label: "Skip Previous", code: 0xF04AE, category: "Medien" },
  { name: "volume-high", label: "Volume High", code: 0xF057E, category: "Medien" },
  { name: "volume-off", label: "Volume Off", code: 0xF0581, category: "Medien" },
  { name: "music", label: "Music", code: 0xF075A, category: "Medien" },
  { name: "movie", label: "Movie", code: 0xF0381, category: "Medien" },
  { name: "television", label: "Television", code: 0xF0502, category: "Medien" },
  { name: "speaker", label: "Speaker", code: 0xF04C3, category: "Medien" },
  { name: "fridge", label: "Fridge", code: 0xF0290, category: "Haushalt" },
  { name: "washing-machine", label: "Washing Machine", code: 0xF072A, category: "Haushalt" },
  { name: "coffee", label: "Coffee", code: 0xF0176, category: "Haushalt" },
  { name: "silverware-fork-knife", label: "Silverware Fork Knife", code: 0xF0A70, category: "Haushalt" },
  { name: "shower", label: "Shower", code: 0xF09A0, category: "Haushalt" },
  { name: "bed", label: "Bed", code: 0xF02E3, category: "Haushalt" },
  { name: "sofa", label: "Sofa", code: 0xF04B9, category: "Haushalt" },
  { name: "stove", label: "Stove", code: 0xF04DE, category: "Haushalt" },
  { name: "home", label: "Home", code: 0xF02DC, category: "Navigation" },
  { name: "cog", label: "Cog", code: 0xF0493, category: "Navigation" },
  { name: "menu", label: "Menu", code: 0xF035C, category: "Navigation" },
  { name: "chevron-left", label: "Chevron Left", code: 0xF0141, category: "Navigation" },
  { name: "chevron-right", label: "Chevron Right", code: 0xF0142, category: "Navigation" },
  { name: "arrow-left", label: "Arrow Left", code: 0xF004D, category: "Navigation" },
  { name: "arrow-right", label: "Arrow Right", code: 0xF0054, category: "Navigation" },
  { name: "close", label: "Close", code: 0xF0156, category: "Navigation" },
  { name: "check", label: "Check", code: 0xF012C, category: "Navigation" },
  { name: "plus", label: "Plus", code: 0xF0415, category: "Navigation" },
  { name: "minus", label: "Minus", code: 0xF0374, category: "Navigation" },
  { name: "refresh", label: "Refresh", code: 0xF0450, category: "Navigation" },
  { name: "magnify", label: "Magnify", code: 0xF0349, category: "Navigation" },
  { name: "wifi", label: "Wifi", code: 0xF05A9, category: "Status" },
  { name: "bluetooth", label: "Bluetooth", code: 0xF00AF, category: "Status" },
  { name: "check-circle", label: "Check Circle", code: 0xF05E0, category: "Status" },
  { name: "alert", label: "Alert", code: 0xF0026, category: "Status" },
  { name: "information", label: "Information", code: 0xF02FC, category: "Status" },
  { name: "bell", label: "Bell", code: 0xF009A, category: "Status" },
  { name: "clock-outline", label: "Clock Outline", code: 0xF0150, category: "Status" },
  { name: "calendar", label: "Calendar", code: 0xF00ED, category: "Status" },
  { name: "heart", label: "Heart", code: 0xF02D1, category: "Status" },
  { name: "account", label: "Account", code: 0xF0004, category: "Status" },
  { name: "battery-alert", label: "Battery Alert", code: 0xF0083, category: "Status" },
];

/** Codepoint → Glyph-Zeichen (für Rendering & YAML-Text). */
export function iconGlyph(code: number): string {
  return String.fromCodePoint(code);
}
