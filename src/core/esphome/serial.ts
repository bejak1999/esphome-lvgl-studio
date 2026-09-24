/**
 * USB-Flashen & serielle Logs über die Web-Serial-API (Firefox unterstützt sie inzwischen).
 * Flashen läuft über esptool-js; die Logs liest ein eigener Reader direkt vom Port.
 */
import { ESPLoader, Transport } from 'esptool-js';
import { tr } from '@/shared/i18n';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).serial;
}

/** True auf Firefox. Dort funktioniert Web Serial NICHT aus einer Erweiterung heraus. */
export function isFirefox(): boolean {
  return typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);
}

/**
 * Ob der Web-Serial-Portdialog HIER (in dieser Erweiterungs-Seite) funktioniert.
 * Firefox koppelt Web Serial an ein „Add-on-Gating" pro Origin, das für moz-extension-
 * Origins nicht greift → requestPort() scheitert dort immer mit NotFoundError. Auf
 * Chromium klappt Web Serial dagegen auch in Erweiterungs-Seiten.
 */
export function webSerialUsableHere(): boolean {
  return isWebSerialSupported() && !isFirefox();
}

/** True, wenn der Fehler daher kommt, dass der Nutzer den Port-Dialog abgebrochen hat. */
export function isPortCancelled(e: unknown): boolean {
  const msg = (e as Error)?.message ?? '';
  const name = (e as { name?: string })?.name ?? '';
  return name === 'NotFoundError' || /No port selected|cancell?ed/i.test(msg);
}

/**
 * Öffnet den Port-Auswahldialog. MUSS direkt im Klick-Handler (ohne vorheriges await)
 * aufgerufen werden – sonst verliert Web Serial die User-Geste und der Dialog erscheint nicht.
 */
export function requestSerialPort(): Promise<any> {
  if (!isWebSerialSupported()) {
    return Promise.reject(new Error(tr('err_serial_unsupported')));
  }
  return (navigator as any).serial.requestPort();
}

export interface FlashHooks {
  onLog?: (line: string) => void;
  onProgress?: (pct: number) => void;
}

/**
 * Flasht ein Factory-`.bin` (vom device-builder, für Offset 0x0) per USB auf einen
 * bereits ausgewählten Port (siehe {@link requestSerialPort}).
 */
export async function flashOverUsb(port: any, bin: Uint8Array, hooks: FlashHooks = {}): Promise<void> {
  const transport = new Transport(port, false);
  const terminal = {
    clean() {},
    writeLine(data: string) { hooks.onLog?.(data); },
    write(data: string) { hooks.onLog?.(data); },
  };
  const loader = new ESPLoader({
    transport,
    baudrate: 460800,
    romBaudrate: 115200,
    terminal,
    debugLogging: false,
  } as any);

  try {
    const chip = await loader.main();
    hooks.onLog?.(`Verbunden: ${chip}`);
    await loader.writeFlash({
      // Factory-Image an Offset 0 – „keep" lässt den Flash-Header unangetastet.
      fileArray: [{ data: bin, address: 0 }],
      flashSize: 'keep',
      flashMode: 'keep',
      flashFreq: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (_i: number, written: number, total: number) =>
        hooks.onProgress?.(total ? Math.round((written / total) * 100) : 0),
    } as any);
    hooks.onLog?.('Fertig geschrieben – Neustart…');
    await loader.after('hard_reset');
  } finally {
    try { await transport.disconnect(); } catch { /* egal */ }
  }
}

export interface SerialLogSession {
  stop(): Promise<void>;
}

/**
 * Öffnet einen bereits ausgewählten Port und streamt Log-Zeilen. Ideal für Boot-/Absturz-
 * Logs, die OTA nicht zeigt.
 */
export async function openSerialLogs(
  port: any,
  baud: number,
  onLine: (line: string) => void,
  onClose?: (reason?: string) => void,
): Promise<SerialLogSession> {
  await port.open({ baudRate: baud });

  let closed = false;
  const decoder = new TextDecoder();
  let buffer = '';
  const reader = port.readable.getReader();

  (async () => {
    let reason = '';
    try {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, idx).replace(/\r$/, '');
            buffer = buffer.slice(idx + 1);
            onLine(line);
          }
        }
      }
    } catch (e) {
      reason = (e as Error)?.message ?? '';
    } finally {
      onClose?.(reason);
    }
  })();

  return {
    async stop() {
      closed = true;
      try { await reader.cancel(); } catch { /* egal */ }
      try { reader.releaseLock(); } catch { /* egal */ }
      try { await port.close(); } catch { /* egal */ }
    },
  };
}
