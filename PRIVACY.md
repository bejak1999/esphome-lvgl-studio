# Privacy Policy for ESPHome LVGL Studio

**Effective Date:** September 24, 2026

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

- **OpenRouter API:** If you use the AI assistant feature, the chat history, error logs, and your dashboard YAML are sent directly to the OpenRouter API to generate code and fixes. Your OpenRouter API key is used to authenticate these requests.
- **Local ESPHome Devices:** The Extension connects directly to your local ESPHome devices (via WebSockets or REST APIs) to read logs, compile firmware, and update YAML configurations.
- **Home Assistant:** If configured, the Extension connects directly to your Home Assistant instance to fetch entity IDs for autocompletion purposes.

We are not responsible for the privacy practices of OpenRouter, ESPHome, or Home Assistant. Please review their respective privacy policies to understand how they handle data transmitted to them.

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
