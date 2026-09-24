# `src/core` — Kernlogik (framework-nah, wiederverwendbar in Sidebar & Editor)

Diese Module werden in den Meilensteinen M1–M6 gefüllt (siehe Plan
`~/.claude/plans/smooth-splashing-simon.md`):

- `yaml/` — CST-Parser, Widget↔YAML-Mapping, **strukturerhaltendes Patchen**
  (Entity-Bindings/Lambdas/Automationen überleben Editor-Änderungen).
- `lvgl/` — LVGL-Widget-Datenmodell + DOM/Canvas-Renderer für die Vorschau.
- `agent/` — OpenRouter-Client, Tool-Use-Loop, Auto-Debug-Orchestrator.
- `esphome/` — device-builder-WS-Adapter (`subscribe_events`, `firmware/install`,
  `firmware/follow_job`) + Legacy-Dashboard-Adapter (`/compile`, `/logs`).
- `ha/` — Home-Assistant-Client (Entities via REST/WS).
- `schema/` — JSON-Schema-Dump (`build_language_schema.py`) laden/cachen →
  Validierung + Autocomplete + Property-Panel-Felder.
- `docs/` — `esphome-docs` (MDX) fetch/cache + Retrieval für KI-Kontext.
- `addons/` — Addon-System: deklarative JSON-Manifeste → Formularfelder, Templates
  (`template.ts`), abgeleitete Werte + Widget-Auflösung (`apply.ts`), YAML-Fragment-Merge
  auf Knoten-Ebene, damit `!lambda`/`!secret` überleben (`yamlMerge.ts`), Instanz-Persistenz
  im YAML-Kommentar (`instances.ts`). Es gibt **keine** vorinstallierten Addons – die
  fertigen liegen als eigene Manifeste in `../addonWeather` und `../addonFrigate`.
  Autoren-Doku: `docs/ADDONS.md`.
