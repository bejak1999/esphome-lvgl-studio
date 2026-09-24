import { computed, ref } from 'vue';
import { OpenRouterClient, supportsImageInput, type ModelInfo } from '@/core/agent/openrouter';
import type { useSettingsStore } from './settings';
import { tr } from '@/shared/i18n';

type SettingsStore = ReturnType<typeof useSettingsStore>;

/**
 * Modell-Auswahl für die Einstellungen (Options-Seite **und** Sidebar).
 * Merkt sich zusätzlich die Kontextgröße des gewählten Modells, damit die
 * Token-Füllstandsanzeige auch ohne geladene Modell-Liste rechnen kann.
 */
export function useModelList(settings: SettingsStore) {
  const models = ref<ModelInfo[]>([]);
  const loading = ref(false);
  const error = ref('');
  const custom = ref(false);

  async function load() {
    if (!settings.settings.ai.apiKey) {
      error.value = tr('err_models_key');
      return;
    }
    loading.value = true;
    error.value = '';
    try {
      const client = new OpenRouterClient({
        apiKey: settings.settings.ai.apiKey,
        baseUrl: settings.settings.ai.baseUrl,
      });
      // Nur Modelle mit Bild-Eingabe (nötig für Vision & die render_preview-Selbstprüfung).
      models.value = (await client.listModels())
        .filter(supportsImageInput)
        .sort((a, b) => a.id.localeCompare(b.id));
      // Aktuelles Modell nicht in der Liste? Als Auswahl ergänzen.
      if (settings.settings.ai.model && !models.value.some((m) => m.id === settings.settings.ai.model)) {
        models.value.unshift({ id: settings.settings.ai.model, name: `${settings.settings.ai.model} ${tr('models_current')}` });
      }
      syncContextLength();
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }

  /** Kontextgröße des aktuell gewählten Modells in die Einstellungen übernehmen. */
  function syncContextLength() {
    const hit = models.value.find((m) => m.id === settings.settings.ai.model);
    if (hit?.context_length) settings.settings.ai.contextLength = hit.context_length;
  }

  const count = computed(() => models.value.length);

  return { models, loading, error, custom, load, syncContextLength, count };
}

/** „128000" → „128k" (kompakt für enge UI). */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 || n >= 100_000 ? 0 : 1)}k`;
  return String(n);
}
