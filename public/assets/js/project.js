// Modèle de données d'un projet K-Gantt (fichier .kgantt.json).

import { defaultCalendar, normalizeCalendar, WHERE } from './calendar.js';
import { toDay, toISO, today, mondayOf } from './dates.js';

export const FILE_FORMAT = 'kgantt';
export const FILE_VERSION = 1;

export const PALETTE = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#7c3aed', '#475569'];

export function uid(prefix = 't') {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

export function newTask(fields = {}) {
  return {
    id: uid('t'),
    name: 'Nouvelle tâche',
    parent: null,
    type: 'task', // 'task' | 'milestone'
    duration: 1, // en jours (0,5 = une demi-journée)
    where: 'school', // 'school' | 'company' | 'any'
    notBefore: null, // créneau "AAAA-MM-JJ" ou "AAAA-MM-JJ:pm"
    deps: [], // ids des tâches qui doivent être terminées avant
    progress: 0,
    resources: [],
    color: null,
    notes: '',
    collapsed: false,
    log: [], // [{ date, progress, note }]
    ...fields,
  };
}

export function defaultProject() {
  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    project: {
      name: 'Mon projet',
      description: '',
      team: '',
      className: '',
      teacher: '',
      start: toISO(mondayOf(today())),
      halfDays: false,
    },
    calendar: defaultCalendar(),
    resources: [],
    tasks: [],
    baseline: null, // { date, tasks: { id: { start, end } } }
    view: { zoom: 'day' },
  };
}

const clampProgress = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

/** Valide et complète un projet lu depuis un fichier JSON. Lève une erreur si inutilisable. */
export function normalizeProject(data) {
  if (!data || typeof data !== 'object') throw new Error('Le fichier ne contient pas un projet valide.');
  if (data.format === 'kgantt-calendar') throw new Error('Ce fichier est un modèle de calendrier, pas un projet. Importez-le depuis la fenêtre « Calendrier ».');
  if (data.format && data.format !== FILE_FORMAT) throw new Error('Format de fichier inconnu.');
  if (data.version > FILE_VERSION) throw new Error('Ce fichier a été créé par une version plus récente de K-Gantt.');

  const base = defaultProject();
  const p = {
    ...base,
    project: { ...base.project, ...(data.project || {}) },
    calendar: normalizeCalendar(data.calendar),
    resources: Array.isArray(data.resources) ? data.resources.filter((r) => r && r.id).map((r, i) => ({
      id: String(r.id), name: String(r.name ?? 'Ressource'), color: r.color || PALETTE[i % PALETTE.length],
    })) : [],
    view: { ...base.view, ...(data.view || {}) },
    baseline: data.baseline && typeof data.baseline === 'object' && data.baseline.tasks ? data.baseline : null,
  };
  if (toDay(p.project.start) == null) p.project.start = base.project.start;
  p.project.halfDays = !!p.project.halfDays;

  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const seen = new Set();
  p.tasks = tasks.filter((t) => t && t.id && !seen.has(t.id) && seen.add(t.id)).map((t) => newTask({
    ...t,
    id: String(t.id),
    name: String(t.name ?? ''),
    type: t.type === 'milestone' ? 'milestone' : 'task',
    duration: Math.max(0, Math.round((Number(t.duration) || 0) * 2) / 2),
    where: WHERE[t.where] ? t.where : 'school',
    deps: Array.isArray(t.deps) ? t.deps.map(String) : [],
    resources: Array.isArray(t.resources) ? t.resources.map(String) : [],
    progress: clampProgress(t.progress),
    log: Array.isArray(t.log) ? t.log : [],
  }));
  const ids = new Set(p.tasks.map((t) => t.id));
  const resIds = new Set(p.resources.map((r) => r.id));
  for (const t of p.tasks) {
    if (!ids.has(t.parent) || t.parent === t.id) t.parent = null;
    t.deps = t.deps.filter((d) => ids.has(d) && d !== t.id);
    t.resources = t.resources.filter((r) => resIds.has(r));
  }
  return p;
}

// --- Arborescence ---------------------------------------------------------

export function childrenOf(project, id) {
  return project.tasks.filter((t) => t.parent === id);
}

export function hasChildren(project, id) {
  return project.tasks.some((t) => t.parent === id);
}

export function isDescendant(project, id, ancestorId) {
  const byId = new Map(project.tasks.map((t) => [t.id, t]));
  let cur = byId.get(id);
  while (cur && cur.parent) {
    if (cur.parent === ancestorId) return true;
    cur = byId.get(cur.parent);
  }
  return false;
}

/** Liste ordonnée (parcours en profondeur) : [{ task, depth, wbs }] */
export function flatten(project, { includeCollapsed = true } = {}) {
  const out = [];
  const walk = (parent, depth, prefix) => {
    childrenOf(project, parent).forEach((t, i) => {
      const wbs = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      out.push({ task: t, depth, wbs });
      if (includeCollapsed || !t.collapsed) walk(t.id, depth + 1, wbs);
    });
  };
  walk(null, 0, '');
  return out;
}

/** Réordonne project.tasks pour que chaque sous-tâche suive son parent (ordre d'affichage). */
export function reorderTree(project) {
  project.tasks = flatten(project).map((r) => r.task);
}

/** Supprime une tâche et ses descendants ; nettoie les dépendances. */
export function removeTask(project, id) {
  const doomed = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of project.tasks) {
      if (t.parent && doomed.has(t.parent) && !doomed.has(t.id)) { doomed.add(t.id); grew = true; }
    }
  }
  project.tasks = project.tasks.filter((t) => !doomed.has(t.id));
  for (const t of project.tasks) t.deps = t.deps.filter((d) => !doomed.has(d));
  return doomed;
}

/** Indente une tâche sous sa sœur précédente. */
export function indentTask(project, id) {
  const t = project.tasks.find((x) => x.id === id);
  if (!t) return false;
  const siblings = childrenOf(project, t.parent);
  const idx = siblings.indexOf(t);
  if (idx <= 0) return false;
  const newParent = siblings[idx - 1];
  t.parent = newParent.id;
  newParent.collapsed = false;
  // Une tâche parente ne peut pas dépendre de ses enfants (et inversement).
  newParent.deps = newParent.deps.filter((d) => d !== t.id);
  t.deps = t.deps.filter((d) => d !== newParent.id);
  reorderTree(project);
  return true;
}

/** Remonte une tâche d'un niveau (elle se place juste après son ancien parent). */
export function outdentTask(project, id) {
  const t = project.tasks.find((x) => x.id === id);
  if (!t || !t.parent) return false;
  const parent = project.tasks.find((x) => x.id === t.parent);
  // Les sœurs suivantes deviennent les enfants de la tâche (comportement classique des Gantt).
  const siblings = childrenOf(project, t.parent);
  for (const s of siblings.slice(siblings.indexOf(t) + 1)) s.parent = t.id;
  t.parent = parent.parent;
  project.tasks.splice(project.tasks.indexOf(t), 1);
  const order = flatten(project).map((r) => r.task);
  const pos = order.indexOf(parent);
  let insertAt = pos + 1;
  while (insertAt < order.length && isDescendant(project, order[insertAt].id, parent.id)) insertAt++;
  order.splice(insertAt, 0, t);
  project.tasks = order;
  reorderTree(project);
  return true;
}

/** Déplace une tâche parmi ses sœurs (dir = -1 ou +1). */
export function moveTask(project, id, dir) {
  const t = project.tasks.find((x) => x.id === id);
  if (!t) return false;
  const siblings = childrenOf(project, t.parent);
  const idx = siblings.indexOf(t);
  const other = siblings[idx + dir];
  if (!other) return false;
  const a = project.tasks.indexOf(t);
  const b = project.tasks.indexOf(other);
  project.tasks[a] = other;
  project.tasks[b] = t;
  reorderTree(project);
  return true;
}

/** Vrai si ajouter "from -> to" (to dépend de from) crée un cycle ou un lien interdit. */
export function wouldCreateCycle(project, fromId, toId) {
  if (fromId === toId) return true;
  if (isDescendant(project, fromId, toId) || isDescendant(project, toId, fromId)) return true;
  const byId = new Map(project.tasks.map((t) => [t.id, t]));
  // Graphe : début(X) dépend de fin(prédécesseurs de X) et de début(parent de X) ;
  //          fin(X) dépend de début(X) et de fin(enfants de X).
  // Le lien crée un cycle si fin(from) dépend déjà de début(to).
  const stack = [['f', fromId]];
  const seen = new Set();
  while (stack.length) {
    const [kind, id] = stack.pop();
    if (kind === 's' && id === toId) return true;
    const key = kind + id;
    if (seen.has(key)) continue;
    seen.add(key);
    const t = byId.get(id);
    if (!t) continue;
    if (kind === 's') {
      for (const d of t.deps) stack.push(['f', d]);
      if (t.parent) stack.push(['s', t.parent]);
    } else {
      stack.push(['s', id]);
      for (const c of project.tasks) if (c.parent === id) stack.push(['f', c.id]);
    }
  }
  return false;
}
