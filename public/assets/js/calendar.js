// Calendrier de rythme (école / entreprise / libre) à la demi-journée.
//
// Résolution du type d'une demi-journée, de la plus faible à la plus forte priorité :
//   1. semaine type (école ou entreprise) choisie par : semaine spécifique > cycle > semaine par défaut
//   2. périodes (vacances, stage, semaine école exceptionnelle…)
//   3. jours fériés (si activés)
//   4. exceptions ponctuelles par jour

import { toDay, toISO, weekday, isoWeek, mondayOf, frenchHolidays, parts, dayOfSlot, halfOfSlot } from './dates.js';

export const SCHOOL = 'school';
export const COMPANY = 'company';
export const OFF = 'off';
export const SLOT_TYPES = [SCHOOL, COMPANY, OFF];

export const TYPE_LABELS = { school: 'École', company: 'Entreprise', off: 'Libre' };

/** Lieux possibles d'une tâche et créneaux qu'elle peut consommer. */
export const WHERE = {
  school: { label: 'École', accepts: [SCHOOL] },
  company: { label: 'Entreprise', accepts: [COMPANY] },
  any: { label: 'Partout', accepts: [SCHOOL, COMPANY] },
};

const weekOf = (am, pm = am) => [am, pm];
const fiveDays = (type) => [0, 1, 2, 3, 4, 5, 6].map((i) => (i < 5 ? weekOf(type) : weekOf(OFF)));

export function defaultCalendar() {
  return {
    format: 'kgantt-calendar',
    version: 1,
    name: 'Temps plein école (lundi → vendredi)',
    description: '',
    weekTemplates: { school: fiveDays(SCHOOL), company: fiveDays(COMPANY) },
    defaultWeek: SCHOOL,
    cycle: null, // { anchor: "2026-09-07", weeks: ["school", "company"] }
    weeks: {}, // { "2026-W40": "company" | "school" | "off" }
    periods: [], // [{ start, end, type, label }]
    days: {}, // { "2026-11-12": ["off", "school"] }
    publicHolidays: true,
  };
}

/** Complète / nettoie un calendrier importé. */
export function normalizeCalendar(cal) {
  const base = defaultCalendar();
  const out = { ...base, ...(cal || {}) };
  out.format = 'kgantt-calendar';
  out.version = 1;
  const fixWeek = (w, fallback) => {
    if (!Array.isArray(w) || w.length !== 7) return fallback;
    return w.map((d) => {
      const pair = Array.isArray(d) ? d : [d, d];
      return [0, 1].map((i) => (SLOT_TYPES.includes(pair[i]) ? pair[i] : OFF));
    });
  };
  out.weekTemplates = {
    school: fixWeek(out.weekTemplates?.school, base.weekTemplates.school),
    company: fixWeek(out.weekTemplates?.company, base.weekTemplates.company),
  };
  if (![SCHOOL, COMPANY, OFF].includes(out.defaultWeek)) out.defaultWeek = SCHOOL;
  if (out.cycle && (!Array.isArray(out.cycle.weeks) || !out.cycle.weeks.length || toDay(out.cycle.anchor) == null)) {
    out.cycle = null;
  }
  out.weeks = out.weeks && typeof out.weeks === 'object' ? out.weeks : {};
  out.periods = Array.isArray(out.periods)
    ? out.periods.filter((p) => toDay(p.start) != null && toDay(p.end) != null && SLOT_TYPES.includes(p.type))
    : [];
  out.days = out.days && typeof out.days === 'object' ? out.days : {};
  out.publicHolidays = out.publicHolidays !== false;
  return out;
}

/**
 * Crée un résolveur rapide (avec cache) pour un calendrier.
 * resolver.slotType(slot) -> 'school' | 'company' | 'off'
 */
export function createResolver(calendar) {
  const cal = normalizeCalendar(calendar);
  const periods = cal.periods.map((p) => ({ ...p, s: toDay(p.start), e: toDay(p.end) }));
  const anchor = cal.cycle ? mondayOf(toDay(cal.cycle.anchor)) : null;
  const cache = new Map();

  function weekType(day) {
    const key = isoWeek(day).key;
    if (cal.weeks[key]) return cal.weeks[key];
    if (cal.cycle) {
      const n = cal.cycle.weeks.length;
      const idx = Math.floor((mondayOf(day) - anchor) / 7);
      return cal.cycle.weeks[((idx % n) + n) % n];
    }
    return cal.defaultWeek;
  }

  function computeDay(day) {
    const wt = weekType(day);
    const wd = weekday(day);
    let pair = wt === OFF ? [OFF, OFF] : [...cal.weekTemplates[wt === COMPANY ? COMPANY : SCHOOL][wd]];
    let label = null;

    for (const p of periods) {
      if (day < p.s || day > p.e) continue;
      if (p.type === OFF) pair = [OFF, OFF];
      // Une période école/entreprise transforme les demi-journées travaillées de la semaine type.
      else pair = pair.map((t) => (t === OFF ? OFF : p.type));
      label = p.label || label;
    }

    if (cal.publicHolidays) {
      const h = frenchHolidays(parts(day).y).get(day);
      if (h) { pair = [OFF, OFF]; label = h; }
    }

    const ex = cal.days[toISO(day)];
    if (ex) pair = Array.isArray(ex) ? [ex[0], ex[1] ?? ex[0]] : [ex, ex];

    return { types: pair, label, weekType: wt };
  }

  function dayInfo(day) {
    let v = cache.get(day);
    if (!v) { v = computeDay(day); cache.set(day, v); }
    return v;
  }

  return {
    calendar: cal,
    dayInfo,
    weekType,
    slotType: (slot) => dayInfo(dayOfSlot(slot)).types[halfOfSlot(slot)],
  };
}

/** Compte les jours (par demi-journée) de chaque type entre deux dates incluses. */
export function countDays(resolver, startDay, endDay) {
  const out = { school: 0, company: 0, off: 0 };
  for (let d = startDay; d <= endDay; d++) {
    for (const t of resolver.dayInfo(d).types) out[t] += 0.5;
  }
  return out;
}

/** Construit un cycle "N semaines école puis M semaines entreprise". */
export function makeCycle(anchorISO, schoolWeeks, companyWeeks) {
  const weeks = [...Array(Math.max(0, schoolWeeks)).fill(SCHOOL), ...Array(Math.max(0, companyWeeks)).fill(COMPANY)];
  return weeks.length ? { anchor: anchorISO, weeks } : null;
}
