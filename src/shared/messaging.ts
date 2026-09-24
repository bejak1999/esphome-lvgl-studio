import { browser } from 'wxt/browser';

/**
 * Minimaler, typisierter Nachrichten-Bus zwischen Sidebar/Editor/Options und dem Background.
 * Wird in späteren Meilensteinen um konkrete Kommandos (compile, follow_job, ha_entities, ...)
 * erweitert. Für M0 nur ein Ping/Health-Check.
 */
export type ExtMessage = { type: 'ping'; at: number };

export type ExtResponse = { type: 'pong'; at: number };

export async function sendMessage(msg: ExtMessage): Promise<ExtResponse> {
  return (await browser.runtime.sendMessage(msg)) as ExtResponse;
}

/** Öffnet den Fullscreen-Editor in einem neuen Browser-Tab (optional mit vorgewähltem Gerät). */
export async function openEditorTab(device?: string): Promise<void> {
  const base = browser.runtime.getURL('/editor.html');
  const url = device ? `${base}?device=${encodeURIComponent(device)}` : base;
  await browser.tabs.create({ url });
}

/** Öffnet die Einstellungsseite. */
export async function openOptionsPage(): Promise<void> {
  await browser.runtime.openOptionsPage();
}
