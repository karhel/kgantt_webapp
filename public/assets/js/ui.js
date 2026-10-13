// SPDX-License-Identifier: AGPL-3.0-or-later
// Petits utilitaires d'interface : fenêtres modales, confirmations, notifications.

import { icon, hydrateIcons } from './icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Ouvre une fenêtre modale.
 * @param {{ title: string, body: string, foot?: string, wide?: boolean, onMount?: Function }} opts
 * @returns {{ dialog: HTMLDialogElement, close: Function, $: Function, $$: Function, done: Promise }}
 */
let modalCount = 0;

export function openModal({ title, body, foot = '', wide = false, onMount, onClose }) {
  const dlg = document.createElement('dialog');
  const titleId = `dlg-title-${++modalCount}`;
  dlg.className = `modal${wide ? ' wide' : ''}`;
  dlg.setAttribute('aria-labelledby', titleId);
  dlg.innerHTML = `
    <form method="dialog" class="modal-head">
      <h2 id="${titleId}">${esc(title)}</h2>
      <button class="btn btn-icon btn-ghost" value="cancel" aria-label="Fermer" title="Fermer (Échap)">${icon('x')}</button>
    </form>
    <div class="modal-body">${body}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}`;
  document.body.appendChild(dlg);
  hydrateIcons(dlg);
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const api = {
    dialog: dlg,
    $: (sel) => dlg.querySelector(sel),
    $$: (sel) => [...dlg.querySelectorAll(sel)],
    close(value) {
      if (!dlg.open) return;
      dlg.close();
      dlg.remove();
      onClose?.(value);
      resolveDone(value);
    },
    done,
  };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); api.close(null); });
  dlg.addEventListener('close', () => { if (dlg.isConnected) { dlg.remove(); onClose?.(null); resolveDone(null); } });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) api.close(null); // clic sur le fond
    const b = e.target.closest('[data-close]');
    if (b) api.close(b.dataset.close || null);
  });
  dlg.showModal();
  onMount?.(api);
  const first = dlg.querySelector('[autofocus]') || dlg.querySelector('.modal-body input, .modal-body select, .modal-body textarea');
  first?.focus();
  return api;
}

/** Fenêtre de confirmation ; renvoie une promesse booléenne. */
export function confirmDialog(message, { title = 'Confirmation', ok = 'Confirmer', danger = false } = {}) {
  const m = openModal({
    title,
    body: `<p style="margin:0">${message}</p>`,
    foot: `<span class="spacer"></span>
      <button class="btn" type="button" data-close="no">Annuler</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-close="yes" autofocus>${esc(ok)}</button>`,
  });
  m.$('[data-close="yes"]').focus();
  return m.done.then((v) => v === 'yes');
}

export function toast(message, { error = false, timeout = 3800 } = {}) {
  const box = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast${error ? ' is-error' : ''}`;
  // Les erreurs sont annoncées immédiatement par les lecteurs d'écran.
  if (error) t.setAttribute('role', 'alert');
  t.textContent = message;
  box.appendChild(t);
  // Laisse le temps de lire : plus long pour les erreurs et les messages longs.
  setTimeout(() => t.remove(), Math.max(timeout, error ? 8000 : 0, message.length * 70));
}

/** Déclenche le téléchargement d'un Blob. */
export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** "Projet de BTS : V2" -> "projet-de-bts-v2" */
export function slugify(s) {
  return String(s || 'projet').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'projet';
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file, 'utf-8');
  });
}

/** Choisit un fichier JSON via une boîte de dialogue du navigateur. */
export function pickJSONFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try { resolve({ name: f.name, data: JSON.parse(await readFileAsText(f)) }); }
      catch { toast('Ce fichier n’est pas un JSON valide.', { error: true }); resolve(null); }
    });
    input.click();
  });
}

/** Choisit un fichier texte quelconque ; renvoie { name, text } ou null. */
export function pickTextFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try { resolve({ name: f.name, text: await readFileAsText(f) }); }
      catch { toast('Impossible de lire ce fichier.', { error: true }); resolve(null); }
    });
    input.click();
  });
}
