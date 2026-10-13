// SPDX-License-Identifier: AGPL-3.0-or-later
// État de l'application : projet courant, annuler / rétablir, brouillon local.
// Aucune donnée n'est envoyée au serveur : le brouillon reste dans le navigateur.

import { defaultProject, normalizeProject } from './project.js';
import { schedule } from './scheduler.js';

const DRAFT_KEY = 'kgantt:draft';
const MAX_HISTORY = 100;

const listeners = new Set();
let project = defaultProject();
let sched = null;
let undoStack = [];
let redoStack = [];
let dirty = false;
let fileName = null;
let saveTimer = null;

export const store = {
  get project() { return project; },
  get schedule() {
    if (!sched) sched = schedule(project);
    return sched;
  },
  get dirty() { return dirty; },
  get fileName() { return fileName; },
  get canUndo() { return undoStack.length > 0; },
  get canRedo() { return redoStack.length > 0; },

  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /**
   * Modifie le projet. La fonction reçoit le projet et peut le muter.
   * Si elle renvoie false, rien n'est enregistré dans l'historique.
   */
  update(fn, { history = true } = {}) {
    const before = JSON.stringify(project);
    const res = fn(project);
    if (res === false) return false;
    const after = JSON.stringify(project);
    if (before === after) return false;
    if (history) {
      undoStack.push(before);
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
      redoStack = [];
    }
    changed(true);
    return true;
  },

  /** Change uniquement l'affichage (zoom…) : pas d'historique. */
  setView(patch) {
    project.view = { ...project.view, ...patch };
    emit();
    queueDraft();
  },

  undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(project));
    project = JSON.parse(undoStack.pop());
    changed(true);
  },

  redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(project));
    project = JSON.parse(redoStack.pop());
    changed(true);
  },

  /** Remplace le projet (nouveau / ouverture de fichier). */
  load(data, { name = null, isDirty = false } = {}) {
    project = normalizeProject(data);
    fileName = name;
    undoStack = [];
    redoStack = [];
    changed(isDirty);
  },

  markSaved(name) {
    if (name) fileName = name;
    dirty = false;
    emit();
    queueDraft();
  },

  // --- Brouillon local (localStorage) ----------------------------------

  readDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d && d.project ? d : null;
    } catch { return null; }
  },

  clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* stockage indisponible */ }
  },
};

function changed(isDirty) {
  sched = null;
  dirty = isDirty;
  emit();
  queueDraft();
}

function emit() {
  for (const fn of listeners) fn();
}

function queueDraft() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        savedAt: new Date().toISOString(), fileName, dirty, project,
      }));
    } catch { /* stockage indisponible (navigation privée…) */ }
  }, 400);
}
