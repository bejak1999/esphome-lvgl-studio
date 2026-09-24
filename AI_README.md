# ESPHome LVGL Studio (AI & Developer Reference)

> **Note for AI Assistant & Developers**: This document contains background architecture notes, project structure, and development context for AI agents working on this codebase. For user-facing documentation, features, installation, and usage instructions, please refer to [README.md](README.md).

Browser-Extension (Firefox first, then Chrome) for **visually building LVGL dashboards for ESPHome** with an **autonomous AI Agent** (OpenRouter) that writes YAML, compiles, and self-corrects build errors (auto-debug loop).

## Features & Architecture Overview

- **Visual LVGL Editor**: Widget palette, Drag & Drop Canvas, Element Tree, Properties Panel, Design/Split/Code/Preview modes.
- **Autonomous AI Agent**: YAML generation, Image -> Dashboard conversion, Auto-Compile & Auto-Fix loop.
- **Structure-Preserving YAML Parser (CST)**: Edits in the visual editor preserve existing entity bindings, lambdas, and automations without destroying user code.
- **Always Up-To-Date Schemas**: Official ESPHome JSON schema dump (`lvgl-schema.json`) + online component documentation.
- **Home Assistant Integration**: Live HA entity autocompletion, real-time binding generation (`<widget_id>__state`), status feedback.
- **Declarative Addons**: Pure JSON extension system for custom widgets, dynamic cards, and dashboard templates.
- **Dual UI Layout**: Sidebar (Chat + Live Preview) + Fullscreen Editor Tab with synchronized document state via `browser.storage.local`.

## Stack

Vue 3 + Vite + Tailwind CSS v4 + Pinia, bundled with [WXT](https://wxt.dev) (MV3/MV2, Firefox + Chrome).

## Development Commands

```bash
npm install          # Install dependencies & run `wxt prepare`
npm run dev          # Start Firefox extension with HMR
npm run dev:chrome   # Start Chrome extension with HMR
npm run build        # Production build for Firefox
npm run build:chrome # Production build for Chrome
npm run zip          # Create Firefox AMO upload zip (.output/esphome-lvgl-studio-0.0.1-firefox.zip)
npm run compile      # Typecheck (vue-tsc)
npm run test         # Run unit tests (vitest)
```

## Firefox Cross-Origin WebSocket Permission

The ESPHome `device-builder` rejects cross-origin WebSockets from extensions by default. The extension rewrites the `Origin` header during handshake. For Firefox to permit this on local IP addresses/LAN:
**Add-ons Menu (Puzzle Icon) → ESPHome LVGL Studio → Permissions → Turn ON "Run on restricted sites"**.

## Project Structure

```
src/
├─ entrypoints/
│  ├─ background.ts      # Service worker & header modification listeners
│  ├─ sidepanel/         # Sidebar: Chat, AI Agent, Live Canvas Preview
│  ├─ editor/            # Fullscreen Editor (Canvas, Palette, Tree, Properties, Modals)
│  └─ options/           # Extension Settings Page (Language, Endpoints, Tokens, Models)
├─ core/                 # Core engine
│  ├─ lvgl/              # Widget document model, catalog, types, Canvas rendering
│  ├─ yaml/              # CST structure-preserving YAML parser & generator
│  ├─ agent/             # OpenRouter LLM client, tool definition & auto-debug loop
│  ├─ esphome/           # ESPHome REST API, WebSocket compilation & serial connection
│  ├─ ha/                # Home Assistant REST/WS state store & autocomplete
│  ├─ schema/            # Offline schema validator
│  └─ addons/            # JSON Addon manifest engine, field renderer, template resolver
├─ shared/               # Pinia settings store, i18n service, messaging, shared Vue forms
└─ assets/               # Tailwind CSS & global styles
```

## Additional Documentation

- [README.md](README.md) - Main user-facing documentation & store presentation
- [docs/ADDONS.md](docs/ADDONS.md) - Complete guide for building declarative JSON Addons
