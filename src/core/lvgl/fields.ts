import type { WidgetType } from './types';

/**
 * Welche Prop-Felder das Eigenschaften-Panel pro Widget-Typ anbietet.
 *
 * Bewusst hier (und nicht in der .vue) definiert, damit ein Test automatisch prüfen kann,
 * dass JEDE angebotene Einstellung auch wirklich im exportierten YAML landet.
 */
export const PROP_FIELDS: Record<WidgetType, string[]> = {
  obj: ['bg_color', 'bg_opa', 'radius', 'border_width', 'border_color'],
  label: ['text', 'text_color', 'font_size', 'text_align', 'text_opa', 'text_letter_spacing', 'text_line_space', 'text_decor', 'long_mode', 'recolor', 'decimals'],
  icon: ['text', 'text_color', 'font_size', 'text_align', 'text_opa', 'text_decor'],
  image: ['img_source', 'img_url', 'img_file', 'img_ref', 'img_format', 'img_type', 'img_update_interval', 'img_resize', 'img_transparency', 'img_buffer_size', 'bg_color', 'radius'],
  button: ['text', 'text_color', 'font_size', 'text_align', 'text_decor', 'bg_color', 'radius',
    'checkable', 'checked_bg_color', 'checked_bg_opa'],
  slider: ['value', 'min_value', 'max_value', 'color', 'bg_color', 'grad_part'],
  bar: ['value', 'min_value', 'max_value', 'color', 'bg_color', 'radius', 'grad_part'],
  arc: ['value', 'min_value', 'max_value', 'arc_width', 'color', 'bg_color', 'adjustable'],
  meter: ['value', 'min_value', 'max_value', 'arc_width', 'color', 'bg_color'],
  switch: ['checked', 'color', 'bg_color'],
  checkbox: ['checked', 'text', 'text_color', 'color', 'text_align', 'text_decor'],
  led: ['color', 'brightness'],
  // `text` gibt es beim dropdown nicht – es zeigt immer die gewählte Option.
  dropdown: ['options', 'selected_index', 'bg_color', 'text_color', 'radius'],
  textarea: ['text', 'placeholder_text', 'max_length', 'one_line', 'password_mode', 'bg_color', 'text_color', 'border_color', 'border_width', 'radius'],
  spinner: ['color', 'arc_width', 'spin_time', 'arc_length', 'arc_rounded'],
  line: ['points', 'color', 'line_width', 'line_rounded'],
  // `size` folgt automatisch der Widget-Größe (LVGL zeichnet den Code in `size`).
  qrcode: ['text', 'light_color', 'dark_color'],
};

/** Universelle Style-Felder (für jedes Widget), aus mapping.UNIVERSAL_PROPS gespiegelt. */
export const UNIVERSAL_FIELD_KEYS = [
  'opa', 'hidden', 'bg_grad_dir', 'bg_grad_color', 'border_opa', 'pad_all',
  'shadow_color', 'shadow_width', 'shadow_opa', 'shadow_spread', 'shadow_offset_x', 'shadow_offset_y',
  'outline_color', 'outline_width', 'outline_opa', 'outline_pad',
  'scrollbar_mode', 'scrollable',
];
