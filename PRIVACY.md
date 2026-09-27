# Privacy Policy for ESPHome LVGL Studio

**Effective Date:** September 27, 2026

This Privacy Policy explains how ESPHome LVGL Studio ("the Extension") handles your data. We believe in strict privacy and transparency.

## 1. Data Collection and Storage
ESPHome LVGL Studio is a local-first browser extension. **We do not collect, store, or transmit any telemetry, usage statistics, analytics, or personal tracking data to our own servers or any third-party marketing services.**

All configuration data, including but not limited to:
- OpenRouter API Keys
- Home Assistant Access Tokens
- ESPHome Device URLs
- Dashboard Configurations (YAML)
- Addon Settings

...is stored exclusively and securely within your browser's local storage (`browser.storage.local`). This data never leaves your device unless explicitly required to perform the extension's core functions (see section 2).

## 2. Third-Party Services
To provide its functionality, the Extension communicates directly with specific third-party services configured by you. The data sent is strictly limited to what is required for the service to function:

- **OpenRouter API (or the AI service you configure):** Only if you use the AI assistant: your chat messages, attached images, error/build logs, your dashboard YAML and rendered preview images are sent directly to that service to generate code and fixes. Your own API key is used to authenticate these requests. Nothing is sent before you use the assistant; in Firefox you are asked for consent (data category “personal communications”) before the first transfer. If the assistant looks up your Home Assistant entities, their IDs and names are included. Your Home Assistant token and API keys stored in the settings are never sent to the AI service – but anything written in plain text inside your YAML (e.g. an `api: encryption: key:` instead of `!secret`) is part of the YAML and therefore sent along.
- **Local ESPHome Devices:** The Extension connects directly to your local ESPHome devices (via WebSockets or REST APIs) to read logs, compile firmware, and update YAML configurations.
- **Home Assistant:** If configured, the Extension connects directly to your Home Assistant instance to fetch entity IDs for autocompletion purposes.
- **ESPHome schema and documentation (`schema.esphome.io`, `raw.githubusercontent.com`):** The Extension downloads the public ESPHome configuration schema to validate your YAML, and – when the AI assistant looks up a component – the matching public page of the ESPHome documentation. These are plain downloads of public files; none of your data is included in them.
- **Map picker for addon locations (`nominatim.openstreetmap.org`, `basemaps.cartocdn.com`):** Only when you use the map in an addon's settings: map tiles for the area you are viewing are loaded from CARTO (OpenStreetMap data), or from a tile service the addon specifies, and an address you type into the map search is sent to OpenStreetMap Nominatim to find its coordinates. In Firefox you are asked for consent (data category “location”) before the map loads; coordinates can always be entered by hand instead. The chosen coordinates are stored locally and are only written into your YAML.

Like any web request, all of the requests above reveal your IP address to the service contacted.

We are not responsible for the privacy practices of OpenRouter, OpenStreetMap, CARTO, GitHub, ESPHome, or Home Assistant. Please review their respective privacy policies to understand how they handle data transmitted to them.

## 3. Host Permissions
At installation the Extension only requests access to `schema.esphome.io` (ESPHome configuration schema used for validation). Access to your own devices – the ESPHome dashboard, Home Assistant, camera images or addon data sources – is requested **at runtime, per host**, when you save their address in the settings or click “connect” / “Load entities”. Your browser shows which host is requested, and you can revoke the access at any time in the browser's extension settings. The Extension does not use host access to monitor your web browsing activity.

Browser-specific permissions:
- **Firefox – `webRequest` / `webRequestBlocking`:** used only to set the `Origin` header of the WebSocket handshake to the ESPHome dashboard URL you configured (the ESPHome device builder rejects connections from extension origins otherwise). No other requests are inspected or modified.
- **Chrome – `scripting`:** Chrome cannot adjust that header, so the Extension opens the WebSocket from a hidden frame on your configured ESPHome host. The script is registered only for that single host and path and only runs inside the Extension's own pages – never in your regular browser tabs.
- **`storage`:** stores your settings locally (see section 1).

## 4. Open Source
The complete source code of ESPHome LVGL Studio is open source and available for independent review and auditing. You can verify exactly how your data is handled by inspecting the code.

## 5. Changes to this Policy
We may update this Privacy Policy from time to time. Any changes will be reflected in the updated documentation of the repository.

## 6. Contact
If you have any questions or concerns about this Privacy Policy or how the Extension handles your data, please open an issue in the official GitHub repository.
