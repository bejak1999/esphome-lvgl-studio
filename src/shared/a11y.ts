import type { App, Directive } from 'vue';

/**
 * Barrierefreiheit, zentral statt pro Komponente:
 *  - `v-dialog="close"`: macht ein Overlay zum modalen Dialog (role/aria-modal/aria-labelledby),
 *    fokussiert ihn, schließt per Escape (nur der oberste Dialog) und gibt den Fokus zurück.
 *  - Auto-Label: verknüpft `<label>` mit dem direkt folgenden Eingabefeld (`for`/`id`), damit
 *    Screenreader jedes Feld benennen – ohne jedes Formular von Hand mit ids zu versehen.
 */

type CloseFn = () => void;
interface DialogState {
  close: CloseFn;
  restore: Element | null;
}

const stack: HTMLElement[] = [];
const states = new WeakMap<HTMLElement, DialogState>();
let uid = 0;

function onKeydown(ev: KeyboardEvent) {
  if (ev.key !== 'Escape' || !stack.length) return;
  const top = stack[stack.length - 1];
  ev.stopPropagation();
  states.get(top)?.close();
}

export const vDialog: Directive<HTMLElement, CloseFn> = {
  mounted(el, binding) {
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    const heading = el.querySelector('h1, h2, h3');
    if (heading) {
      if (!heading.id) heading.id = `dlg-title-${++uid}`;
      el.setAttribute('aria-labelledby', heading.id);
    }
    states.set(el, { close: binding.value, restore: document.activeElement });
    if (!stack.length) document.addEventListener('keydown', onKeydown, true);
    stack.push(el);
    // Fokus in den Dialog: bevorzugt ein Eingabefeld (z. B. Suche), sonst der erste Knopf,
    // sonst der Dialog selbst. (Ein Selektor-String würde einfach das erste in DOM-Reihenfolge
    // liefern – oft den Schließen-Knopf im Kopf.)
    const first =
      el.querySelector<HTMLElement>('input:not([type=hidden]):not([type=checkbox]), textarea, select') ??
      el.querySelector<HTMLElement>('button');
    if (!el.hasAttribute('tabindex')) el.tabIndex = -1;
    (first ?? el).focus({ preventScroll: true });
  },
  updated(el, binding) {
    const st = states.get(el);
    if (st) st.close = binding.value;
  },
  unmounted(el) {
    const i = stack.indexOf(el);
    if (i >= 0) stack.splice(i, 1);
    if (!stack.length) document.removeEventListener('keydown', onKeydown, true);
    const restore = states.get(el)?.restore;
    if (restore instanceof HTMLElement && restore.isConnected) restore.focus({ preventScroll: true });
  },
};

const CONTROL = 'input:not([type=hidden]), select, textarea';

function linkLabels(root: ParentNode) {
  for (const label of root.querySelectorAll<HTMLLabelElement>('label:not([for])')) {
    if (label.querySelector(CONTROL)) continue; // umschließt sein Feld bereits
    const next = label.nextElementSibling;
    if (!next) continue;
    const ctrl = next.matches(CONTROL) ? next : next.querySelector(`:scope > ${CONTROL.split(', ').join(', :scope > ')}`);
    if (!ctrl) continue;
    if (!ctrl.id) ctrl.id = `fld-${++uid}`;
    label.htmlFor = ctrl.id;
  }
}

/** Registriert die Direktive und verknüpft Labels laufend (auch in später geöffneten Panels). */
export function installA11y(app: App) {
  app.directive('dialog', vDialog);
  let queued = false;
  const run = () => {
    queued = false;
    linkLabels(document);
  };
  new MutationObserver(() => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(run);
    }
  }).observe(document.body, { childList: true, subtree: true });
  requestAnimationFrame(run);
}
