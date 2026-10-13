// SPDX-License-Identifier: AGPL-3.0-or-later
// Utilitaires de dates : tout est calculé en "numéros de jour" UTC (entiers)
// et en "créneaux" (2 créneaux par jour : 0 = matin, 1 = après-midi).

const MS_DAY = 86400000;

export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.',
  'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const WEEKDAYS_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** "2026-09-01" -> numéro de jour (entier) ; null si invalide. */
export function toDay(iso) {
  if (typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(t) ? null : Math.round(t / MS_DAY);
}

/** numéro de jour -> "2026-09-01" */
export function toISO(day) {
  return new Date(day * MS_DAY).toISOString().slice(0, 10);
}

/** Aujourd'hui (date locale du navigateur) en numéro de jour. */
export function today() {
  const d = new Date();
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_DAY);
}

/** 0 = lundi ... 6 = dimanche */
export function weekday(day) {
  return (new Date(day * MS_DAY).getUTCDay() + 6) % 7;
}

export function parts(day) {
  const d = new Date(day * MS_DAY);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

export function fromParts(y, m, d) {
  return Math.round(Date.UTC(y, m, d) / MS_DAY);
}

/** Lundi de la semaine contenant le jour. */
export function mondayOf(day) {
  return day - weekday(day);
}

/** Semaine ISO : { year, week, key: "2026-W37" } */
export function isoWeek(day) {
  const thursday = day - weekday(day) + 3;
  const year = parts(thursday).y;
  const firstThursday = fromParts(year, 0, 4);
  const week = 1 + Math.round((thursday - mondayOf(firstThursday) - 3) / 7);
  return { year, week, key: `${year}-W${String(week).padStart(2, '0')}` };
}

/** "12/09/2026" */
export function formatFR(day) {
  if (day == null) return '';
  const p = parts(day);
  return `${String(p.d).padStart(2, '0')}/${String(p.m + 1).padStart(2, '0')}/${p.y}`;
}

/** "12/09" */
export function formatShortFR(day) {
  const p = parts(day);
  return `${String(p.d).padStart(2, '0')}/${String(p.m + 1).padStart(2, '0')}`;
}

/** "lun. 12 sept. 2026" */
export function formatLongFR(day) {
  const p = parts(day);
  return `${WEEKDAYS[weekday(day)].slice(0, 3).toLowerCase()}. ${p.d} ${MONTHS_SHORT[p.m]} ${p.y}`;
}

// --- Créneaux (demi-journées) -------------------------------------------

export const slotOf = (day, half = 0) => day * 2 + half;
export const dayOfSlot = (slot) => Math.floor(slot / 2);
export const halfOfSlot = (slot) => ((slot % 2) + 2) % 2;

/** "2026-09-01" ou "2026-09-01:pm" -> créneau */
export function parseSlot(str) {
  if (!str) return null;
  const day = toDay(str);
  if (day == null) return null;
  return slotOf(day, /:pm$/.test(str) ? 1 : 0);
}

/** créneau -> "2026-09-01" ou "2026-09-01:pm" */
export function formatSlot(slot) {
  const iso = toISO(dayOfSlot(slot));
  return halfOfSlot(slot) ? `${iso}:pm` : iso;
}

/** Libellé lisible d'un créneau, avec la demi-journée si demandé. */
export function slotLabel(slot, withHalf = false) {
  const base = formatFR(dayOfSlot(slot));
  if (!withHalf) return base;
  return `${base} ${halfOfSlot(slot) ? 'ap.-m.' : 'matin'}`;
}

// --- Jours fériés français ------------------------------------------------

/** Dimanche de Pâques (algorithme de Meeus/Jones/Butcher). */
export function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return fromParts(year, month - 1, day);
}

const holidayCache = new Map();

/** Map numéro de jour -> libellé, pour les jours fériés de métropole de l'année. */
export function frenchHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const e = easter(year);
  const list = [
    [fromParts(year, 0, 1), 'Jour de l’an'],
    [e + 1, 'Lundi de Pâques'],
    [fromParts(year, 4, 1), 'Fête du travail'],
    [fromParts(year, 4, 8), 'Victoire 1945'],
    [e + 39, 'Ascension'],
    [e + 50, 'Lundi de Pentecôte'],
    [fromParts(year, 6, 14), 'Fête nationale'],
    [fromParts(year, 7, 15), 'Assomption'],
    [fromParts(year, 10, 1), 'Toussaint'],
    [fromParts(year, 10, 11), 'Armistice 1918'],
    [fromParts(year, 11, 25), 'Noël'],
  ];
  const map = new Map(list);
  holidayCache.set(year, map);
  return map;
}
