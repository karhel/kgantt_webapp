// Planification : calcule les dates réelles de chaque tâche à partir
// des durées (en jours de présence), du lieu, des dépendances et du calendrier.

import { createResolver, WHERE } from './calendar.js';
import { toDay, parseSlot, slotOf, today as todayDay } from './dates.js';

const MAX_SEARCH_SLOTS = 2 * 366 * 6; // on cherche au plus 6 ans de créneaux

/**
 * @returns {{
 *   items: Map<string, {
 *     start: number, end: number, n: number, runs: number[][], summary: boolean,
 *     milestone: boolean, progress: number, expected: number, status: string, error: string|null
 *   }>,
 *   start: number, end: number, progress: number, expected: number, resolver: object
 * }}
 * Les valeurs start / end sont des créneaux (demi-journées) inclusifs.
 */
export function schedule(project, { today = todayDay() } = {}) {
  const resolver = createResolver(project.calendar);
  const projectStart = slotOf(toDay(project.project.start) ?? todayDay(), 0);
  const todaySlot = slotOf(today, 0);
  const byId = new Map(project.tasks.map((t) => [t.id, t]));
  const children = new Map();
  for (const t of project.tasks) {
    if (!children.has(t.parent)) children.set(t.parent, []);
    children.get(t.parent).push(t);
  }
  const kids = (id) => children.get(id) || [];

  const items = new Map();
  const startMemo = new Map();
  const visiting = new Set();
  const errors = new Map();

  // Créneau à partir duquel la tâche peut commencer (contraintes héritées du parent comprises).
  function constraintStart(t) {
    if (startMemo.has(t.id)) return startMemo.get(t.id);
    const key = 's' + t.id;
    if (visiting.has(key)) { errors.set(t.id, 'Dépendance circulaire'); return projectStart; }
    visiting.add(key);
    let s = projectStart;
    const nb = parseSlot(t.notBefore);
    if (nb != null) s = Math.max(s, nb);
    for (const d of t.deps) {
      const dt = byId.get(d);
      if (dt) s = Math.max(s, finish(dt) + 1);
    }
    if (t.parent && byId.has(t.parent)) s = Math.max(s, constraintStart(byId.get(t.parent)));
    visiting.delete(key);
    startMemo.set(t.id, s);
    return s;
  }

  // Dernier créneau occupé ; pour un jalon, le créneau qui le précède.
  function finish(t) {
    const it = compute(t);
    return it.milestone ? it.start - 1 : it.end;
  }

  function compute(t) {
    if (items.has(t.id)) return items.get(t.id);
    const key = 'f' + t.id;
    if (visiting.has(key)) {
      errors.set(t.id, 'Dépendance circulaire');
      const s = projectStart;
      return { start: s, end: s, n: 0, runs: [], summary: false, milestone: true };
    }
    visiting.add(key);
    const cs = constraintStart(t);
    const sub = kids(t.id);
    let item;

    if (sub.length) {
      const parts = sub.map(compute);
      const start = Math.min(...parts.map((p) => p.start));
      const end = Math.max(...parts.map((p) => p.end));
      item = { start, end, n: parts.reduce((a, p) => a + p.n, 0), runs: [], summary: true, milestone: false };
    } else if (t.type === 'milestone' || !(t.duration > 0)) {
      item = { start: cs, end: cs, n: 0, runs: [], summary: false, milestone: true };
    } else {
      const accepts = (WHERE[t.where] || WHERE.school).accepts;
      const n = Math.max(1, Math.round(t.duration * 2));
      const runs = [];
      let used = 0;
      let slot = cs;
      const limit = cs + MAX_SEARCH_SLOTS;
      while (used < n && slot < limit) {
        if (accepts.includes(resolver.slotType(slot))) {
          const last = runs[runs.length - 1];
          if (last && last[1] === slot - 1) last[1] = slot; else runs.push([slot, slot]);
          used++;
        }
        slot++;
      }
      if (used < n) {
        errors.set(t.id, 'Aucun créneau disponible dans le calendrier pour ce lieu');
        item = { start: cs, end: cs, n: 0, runs: [], summary: false, milestone: true };
      } else {
        item = { start: runs[0][0], end: runs[runs.length - 1][1], n, runs, summary: false, milestone: false };
      }
    }
    visiting.delete(key);
    items.set(t.id, item);
    return item;
  }

  for (const t of project.tasks) compute(t);

  // Avancement réel et attendu (à la date du jour).
  function progressOf(t) {
    const it = items.get(t.id);
    if (it.progress != null) return it;
    const sub = kids(t.id);
    if (sub.length) {
      let w = 0, done = 0, exp = 0, ms = 0, msDone = 0, msExp = 0;
      for (const c of sub) {
        const ci = progressOf(c);
        if (ci.n > 0) { w += ci.n; done += ci.progress * ci.n; exp += ci.expected * ci.n; }
        else { ms++; msDone += ci.progress; msExp += ci.expected; }
      }
      it.progress = w ? Math.round(done / w) : ms ? Math.round(msDone / ms) : 0;
      it.expected = w ? Math.round(exp / w) : ms ? Math.round(msExp / ms) : 0;
    } else {
      it.progress = Math.max(0, Math.min(100, t.progress || 0));
      if (it.milestone) it.expected = it.start < todaySlot ? 100 : 0;
      else {
        let past = 0;
        for (const [a, b] of it.runs) past += Math.max(0, Math.min(b + 1, todaySlot) - a);
        it.expected = Math.round((100 * past) / it.n);
      }
    }
    it.status = statusOf(it.progress, it.expected);
    it.error = errors.get(t.id) || null;
    return it;
  }
  for (const t of project.tasks) progressOf(t);

  const roots = kids(null).map((t) => items.get(t.id));
  let w = 0, done = 0, exp = 0;
  for (const r of roots) {
    const k = r.n || 0;
    if (k) { w += k; done += r.progress * k; exp += r.expected * k; }
  }
  const all = [...items.values()];
  return {
    items,
    resolver,
    start: all.length ? Math.min(projectStart, ...all.map((i) => i.start)) : projectStart,
    end: all.length ? Math.max(...all.map((i) => i.end)) : projectStart,
    progress: w ? Math.round(done / w) : 0,
    expected: w ? Math.round(exp / w) : 0,
    errors,
  };
}

export const STATUS_LABELS = {
  done: 'Terminée',
  late: 'En retard',
  progress: 'En cours',
  todo: 'À faire',
};

export function statusOf(progress, expected) {
  if (progress >= 100) return 'done';
  if (expected - progress >= 10) return 'late';
  if (progress > 0) return 'progress';
  return 'todo';
}

/**
 * Durée (en jours) correspondant à la plage [startSlot, endSlot] pour une tâche,
 * en ne comptant que les créneaux compatibles avec son lieu. Sert au redimensionnement.
 */
export function durationBetween(resolver, where, startSlot, endSlot) {
  const accepts = (WHERE[where] || WHERE.school).accepts;
  let n = 0;
  for (let s = startSlot; s <= endSlot; s++) if (accepts.includes(resolver.slotType(s))) n++;
  return n / 2;
}
