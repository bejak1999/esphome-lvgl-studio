import type { Language } from '@/shared/i18n';
import type { Template } from './types';

/**
 * Anzeigenamen der eingebauten Vorlagen und Kategorien. Gespeichert (und in builtins.ts
 * definiert) sind die deutschen Namen; für Englisch werden sie hier übersetzt. Eigene
 * Vorlagen der Nutzer behalten ihren Namen unverändert.
 */

const CATEGORY_EN: Record<string, string> = {
  Klima: 'Climate',
  Beleuchtung: 'Lighting',
  Energie: 'Energy',
  Sicherheit: 'Security',
  Sensoren: 'Sensors',
  Szenen: 'Scenes',
  'Cover/Lüftung': 'Covers/Fans',
  Bewässerung: 'Irrigation',
  'UI/Navigation': 'UI/Navigation',
  'WLAN-Setup': 'Wi-Fi setup',
  Basis: 'Basics',
  Weitere: 'Other',
};

const NAME_EN: Record<string, string> = {
  b_climate_card: 'Climate card',
  b_climate_control: 'Climate control',
  b_temperature_gauge: 'Temperature gauge',
  b_hvac_schedule: 'Heating schedule',
  b_mode_selector: 'Mode selector',
  b_light_control: 'Light dimmer',
  b_lighting_dashboard: 'Lighting overview',
  b_energy_usage: 'Energy usage',
  b_energy_detail: 'Energy detail',
  b_multi_sensor: 'Multi sensor',
  b_sensor_strip: 'Sensor strip',
  b_room_card: 'Room card',
  b_cover_control: 'Roller shutter',
  b_fan_control: 'Fan',
  b_irrigation_zone: 'Irrigation zone',
  b_irrigation_dashboard: 'Irrigation schedule',
  b_security_panel: 'Alarm panel',
  b_door_sensor: 'Door/window contact',
  b_motion_detector: 'Motion detector',
  b_garage_door: 'Garage door',
  b_scene_launcher: 'Scene tiles',
  b_scene_editor: 'Scene details',
  b_quick_toggle: 'Quick toggles',
  b_dock_nav: 'Navigation dock',
  b_status_island: 'Status bar',
  b_notification: 'Notification',
  b_wifi_ap_select: 'Connection type',
  b_wifi_portal: 'Hotspot / QR',
  b_wifi_password: 'Password entry',
  b_wifi_connecting: 'Connecting…',
  b_wifi_success: 'Connected',
  b_wifi_error: 'Connection error',
  b_wifi_manual_ip: 'Manual IP',
  b_wifi_ota: 'Firmware update',
  b_sensor_card: 'Sensor card',
  b_light_button: 'Light button',
  b_gauge: 'Gauge (arc)',
  b_status_row: 'Status row',
  b_slider_row: 'Slider card',
};

export function templateName(tpl: Template, lang: Language): string {
  return lang === 'en' && tpl.builtin ? (NAME_EN[tpl.id] ?? tpl.name) : tpl.name;
}

export function categoryName(category: string, lang: Language): string {
  return lang === 'en' ? (CATEGORY_EN[category] ?? category) : category;
}
