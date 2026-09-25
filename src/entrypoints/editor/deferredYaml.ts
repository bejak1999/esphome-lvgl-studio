import { inject, provide, ref, watch, type Ref, type WatchStopHandle } from 'vue';
import { useDocumentStore } from '@/core/lvgl/document';

const KEY = Symbol('deferredYaml');

/**
 * YAML für Anzeigen, die nicht bei jeder Mausbewegung neu rechnen müssen (Code-Ansicht,
 * statische Validierung). Das komplette YAML neu zu erzeugen kostet bei großen Configs
 * 100+ ms – beim Ziehen im Split-Modus ruckelte das. Aktualisiert 150 ms nach der letzten
 * Änderung; das Modell selbst (Canvas, Speichern, Export) bleibt immer sofort aktuell.
 */
export function provideDeferredYaml(active: Ref<boolean>): Ref<string> {
  const doc = useDocumentStore();
  const yaml = ref('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop: WatchStopHandle | null = null;
  // Nur beobachten, solange Code/Validierung sichtbar sind – der tiefe Watcher selbst kostet
  // bei vielen Widgets spürbar Zeit pro Mausbewegung.
  watch(
    active,
    (on) => {
      stop?.();
      stop = null;
      clearTimeout(timer);
      if (!on) return;
      yaml.value = doc.exportedYaml;
      stop = watch(
        () => [doc.pages, doc.addons, doc.baseYaml],
        () => {
          clearTimeout(timer);
          timer = setTimeout(() => (yaml.value = doc.exportedYaml), 150);
        },
        { deep: true },
      );
    },
    { immediate: true },
  );
  provide(KEY, yaml);
  return yaml;
}

/** Verzögertes YAML aus dem Editor – außerhalb davon direkt das aktuelle. */
export function useDeferredYaml(): Ref<string> | null {
  return inject<Ref<string> | null>(KEY, null);
}
