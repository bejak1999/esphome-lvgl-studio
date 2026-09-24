import { defineStore } from 'pinia';
import { DeviceBuilderClient, type DeviceInfo, type ServerInfo, type ValidationResult } from './client';
import { relayWsFactory } from './relay';
import { tr } from '@/shared/i18n';

/** Aus device-builder gemeldeter Validierungsfehler (aufbereitet für die UI). */
export interface DeviceIssue {
  message: string;
  line?: number;
  kind: 'yaml' | 'validation';
}

// Live-WS-Client außerhalb des reaktiven States halten.
let client: DeviceBuilderClient | null = null;

export const useEsphomeStore = defineStore('esphome', {
  state: () => ({
    connected: false,
    connecting: false,
    error: '',
    serverInfo: null as ServerInfo | null,
    validating: false,
    compiling: false,
    installing: false,
    deviceIssues: [] as DeviceIssue[],
    logs: [] as string[],
    devices: [] as DeviceInfo[],
    /** Aktuell im Editor geöffnetes Gerät (Config-Dateiname). */
    currentConfiguration: '',
  }),

  getters: {
    esphomeVersion(state): string | null {
      return (state.serverInfo?.esphome_version as string) ?? null;
    },
    /** Aktuell geöffnetes Gerät (aus der Geräteliste). */
    currentDevice(state): DeviceInfo | null {
      return state.devices.find((d) => d.configuration === state.currentConfiguration) ?? null;
    },
    /** Standard-OTA-Ziel: Geräte-Adresse oder `<name>.local` aus dem Config-Dateinamen. */
    otaPort(): string {
      const dev = this.currentDevice;
      if (dev?.address) return String(dev.address);
      const name = this.currentConfiguration.replace(/\.ya?ml$/i, '');
      return name ? `${name}.local` : '';
    },
  },

  actions: {
    async connect(httpUrl: string, token?: string) {
      this.connecting = true;
      this.error = '';
      try {
        client?.close();
        // Chrome kann den WS-Origin nicht umschreiben → Relay-iframe (siehe relay.ts).
        client = new DeviceBuilderClient(httpUrl, {
          token,
          wsFactory: import.meta.env.BROWSER === 'chrome' ? relayWsFactory : undefined,
        });
        this.serverInfo = await client.connect();
        this.connected = true;
        return this.serverInfo;
      } catch (e) {
        this.error = (e as Error).message;
        this.connected = false;
        throw e;
      } finally {
        this.connecting = false;
      }
    },

    disconnect() {
      client?.close();
      client = null;
      this.connected = false;
      this.serverInfo = null;
      this.devices = [];
      this.currentConfiguration = '';
    },

    /** Lädt die Geräte-Liste des device-builder. */
    async loadDevices() {
      if (!client) throw new Error(tr('err_not_connected_esphome'));
      const res = await client.listDevices();
      this.devices = res.configured ?? [];
      return this.devices;
    },

    /** Öffnet ein Gerät: liest dessen YAML und merkt es als aktuelles. Gibt das YAML zurück. */
    async openDevice(configuration: string): Promise<string> {
      if (!client) throw new Error(tr('err_not_connected_esphome'));
      const content = await client.getConfig(configuration);
      this.currentConfiguration = configuration;
      return content;
    },

    /** Speichert YAML zurück auf das aktuell geöffnete Gerät. */
    async saveDevice(content: string, configuration?: string) {
      if (!client) throw new Error(tr('err_not_connected_esphome'));
      const cfg = configuration ?? this.currentConfiguration;
      if (!cfg) throw new Error(tr('err_no_device'));
      await client.updateConfig(cfg, content);
    },

    /** Live-Validierung des YAML-Inhalts gegen die echte ESPHome-Instanz. */
    async validate(content: string, configuration?: string) {
      const cfg = configuration ?? (this.currentConfiguration || 'studio.yaml');
      if (!client) throw new Error(tr('err_not_connected_esphome'));
      this.validating = true;
      this.deviceIssues = [];
      try {
        const res: ValidationResult = await client.validateYaml(cfg, content);
        const issues: DeviceIssue[] = [];
        for (const e of res.yaml_errors ?? []) issues.push({ message: e.message, kind: 'yaml' });
        for (const e of res.validation_errors ?? [])
          issues.push({
            message: e.message,
            line: e.range ? e.range.start_line + 1 : undefined,
            kind: 'validation',
          });
        this.deviceIssues = issues;
        return issues;
      } finally {
        this.validating = false;
      }
    },

    /** Kompiliert die Config, streamt das Build-Log in `logs` und liefert das Ergebnis. */
    async compile(configuration?: string) {
      if (!client) throw new Error(tr('err_not_connected_esphome'));
      const cfg = configuration ?? this.currentConfiguration;
      if (!cfg) throw new Error(tr('err_no_device'));
      this.logs = [];
      this.compiling = true;
      try {
        return await client.compileAndWait(cfg, (line) => {
          this.logs.push(line);
          if (this.logs.length > 2000) this.logs.shift();
        });
      } finally {
        this.compiling = false;
      }
    },

    /** Flasht die Config aufs Gerät (OTA/seriell) über `port`, streamt das Log. */
    async install(port: string, configuration?: string) {
      if (!client) throw new Error(tr('err_not_connected_esphome'));
      const cfg = configuration ?? this.currentConfiguration;
      if (!cfg) throw new Error(tr('err_no_device'));
      if (!port) throw new Error(tr('err_no_upload_target'));
      this.logs = [];
      this.installing = true;
      try {
        return await client.installAndWait(cfg, port, (line) => {
          this.logs.push(line);
          if (this.logs.length > 2000) this.logs.shift();
        });
      } finally {
        this.installing = false;
      }
    },

    /** HTTP-URL der kompilierten `.bin` (oder '' ohne Verbindung/Gerät). */
    downloadUrl(configuration?: string): string {
      const cfg = configuration ?? this.currentConfiguration;
      return client && cfg ? client.downloadUrl(cfg) : '';
    },
  },
});
