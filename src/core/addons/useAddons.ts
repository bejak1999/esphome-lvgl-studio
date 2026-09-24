/**
 * Bindeglied zwischen Addon-Store (installierte Manifeste) und Dokument (platzierte
 * Instanzen). Bewusst als Funktionssammlung statt als weiterer Store – so bleibt
 * `core/addons/store.ts` frei von Abhängigkeiten aufs Dokument (keine Zyklen).
 */

import { useDocumentStore } from '../lvgl/document';
import { useAddonsStore } from './store';
import { buildContext, defaultConfig, resolveWidgets, resolveYaml, withDefaults } from './apply';
import type { TemplateContext } from './template';
import type { AddonInstance, AddonManifest } from './types';

export function useAddons() {
  const doc = useDocumentStore();
  const store = useAddonsStore();

  /** Manifest zur Instanz (null, wenn das Addon nicht installiert ist). */
  function manifestOf(inst: AddonInstance): AddonManifest | null {
    return store.manifest(inst.addon);
  }

  /** Auswertungskontext einer (ggf. noch nicht gespeicherten) Konfiguration. */
  function context(
    manifest: AddonManifest,
    iid: string,
    config: Record<string, unknown>,
    widgetIds?: Record<string, string>,
  ): TemplateContext {
    return buildContext(
      manifest,
      { iid, config, widgetIds: widgetIds ?? doc.addonInstance(iid)?.widgetIds },
      store.settingsFor(manifest.id),
    );
  }

  /**
   * Legt eine neue Instanz an, überträgt sie direkt ins Dokument und gibt sie zurück.
   * Das Popup öffnet danach mit den Standardwerten – man sieht sofort etwas im Canvas.
   */
  function addInstance(manifest: AddonManifest): AddonInstance {
    const inst = doc.createAddonInstance(manifest.id, defaultConfig(manifest.fields), manifest.name);
    apply(manifest, inst.iid, inst.config);
    return doc.addonInstance(inst.iid) ?? inst;
  }

  /**
   * Übernimmt eine Konfiguration. Zwei Stufen, weil das YAML-Fragment die erzeugten
   * Widget-ids kennen soll (`{{ widgets.<key> }}`): erst die Widgets anlegen/aktualisieren,
   * dann mit den zurückgegebenen ids das Fragment rendern.
   */
  function apply(manifest: AddonManifest, iid: string, config: Record<string, unknown>) {
    const merged = withDefaults(manifest.fields, config);
    doc.updateAddonInstance(iid, { config: merged, addonVersion: manifest.version });
    const ctx = context(manifest, iid, merged);
    const widgetIds = doc.applyAddonWidgets(iid, resolveWidgets(manifest, ctx));
    doc.setAddonYaml(iid, resolveYaml(manifest, context(manifest, iid, merged, widgetIds)));
  }

  /** Wendet alle Instanzen erneut an (z. B. nach geänderten Addon-Einstellungen). */
  function reapplyAll() {
    for (const inst of [...doc.addons]) {
      const m = manifestOf(inst);
      if (m) apply(m, inst.iid, inst.config);
    }
  }

  return { doc, store, manifestOf, context, addInstance, apply, reapplyAll };
}
