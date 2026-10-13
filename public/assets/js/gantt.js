// SPDX-License-Identifier: AGPL-3.0-or-later
// Rendu SVG du diagramme (en-tête de la frise + corps). Le même code sert
// à l'affichage à l'écran et aux exports PNG / PDF.

import {
  dayOfSlot, mondayOf, parts, fromParts, weekday, isoWeek, today as todayDay,
  MONTHS, MONTHS_SHORT, WEEKDAYS_SHORT, parseSlot, formatFR,
} from './dates.js';
import { PALETTE } from './project.js';
import { STATUS_LABELS } from './scheduler.js';

export const ZOOMS = {
  day: { label: 'Jour', dayW: 34 },
  week: { label: 'Semaine', dayW: 14 },
  month: { label: 'Mois', dayW: 4.5 },
};

export const ROW_H = 34;
export const HEAD_H = 52;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = (n) => Math.round(n * 10) / 10;

/** Abscisse d'un jalon : fin de son créneau s'il suit un prédécesseur, sinon début. */
export const milestoneX = (L, it) => L.x(it.start + (it.atEnd ? 1 : 0));

/** Couleurs et styles du SVG ; les variables --g-* sont définies par le thème (app.css). */
export const SVG_CSS = `
.g-head-bg{fill:var(--g-head)}
.g-head-line{stroke:var(--g-line);stroke-width:1}
.g-head-text{fill:var(--g-text);font-size:11px}
.g-head-strong{fill:var(--g-text-strong);font-size:12px;font-weight:600}
.g-head-muted{fill:var(--g-muted);font-size:11px}
.g-head-today{fill:var(--g-today)}
.g-head-today-text{fill:var(--g-school);font-size:11px;font-weight:700}
.bg-school{fill:var(--g-school)}
.bg-company{fill:var(--g-company)}
.bg-off{fill:var(--g-off)}
.hatch-line{stroke:var(--g-company-hatch);stroke-width:2}
.g-grid{stroke:var(--g-line);stroke-width:1}
.g-grid-soft{stroke:var(--g-line-soft);stroke-width:1}
.g-row-sel{fill:var(--g-select)}
.g-today{stroke:var(--g-today);stroke-width:2;stroke-dasharray:4 3}
.bar-hit{fill:transparent}
.bar-gap{stroke:currentColor;stroke-width:2;stroke-dasharray:2 3}
.bar-run{fill:currentColor;fill-opacity:.25;stroke:var(--g-bar-outline);stroke-width:1.25}
.bar-progress{fill:currentColor}
.bar-ms{stroke:var(--g-bar-outline);stroke-width:2}
.bar-summary{fill:var(--g-summary)}
.bar-summary-progress{fill:var(--g-summary-progress)}
.bar-baseline{fill:var(--g-baseline)}
.bar-label{fill:var(--g-text);font-size:12px}
.bar-label-muted{fill:var(--g-muted);font-size:11.5px}
.bar-label-late{fill:var(--g-late);font-size:11.5px;font-weight:700}
.bar-late{stroke:var(--g-late);stroke-width:2;stroke-dasharray:5 3;fill:none}
.dep{stroke:var(--g-dep);stroke-width:1.4;fill:none}
.dep-arrow{fill:var(--g-dep)}
.g-cell-text{fill:var(--g-text);font-size:12px}
.g-cell-strong{fill:var(--g-text-strong);font-size:12px;font-weight:600}
.g-cell-muted{fill:var(--g-muted);font-size:11px}
.g-title{fill:var(--g-text-strong);font-size:20px;font-weight:700}
.g-subtitle{fill:var(--g-muted);font-size:12px}
`;

/** Valeurs claires des variables, utilisées pour les exports (indépendants du thème). */
export const SVG_LIGHT_VARS = `
--g-head:#faf9f7;--g-line:#e2dfda;--g-line-soft:#efece8;--g-text:#292524;--g-text-strong:#1c1917;
--g-muted:#5c554e;--g-today:#b91c1c;--g-school:#ffffff;--g-company:#e8eef5;--g-company-hatch:#9fb4ca;--g-off:#e9e7e3;
--g-select:rgba(194,65,12,.08);--g-summary:#292524;--g-summary-progress:#c2410c;--g-baseline:#8f877e;
--g-late:#b91c1c;--g-dep:#5c554e;--g-milestone-empty:#ffffff;--g-bar-outline:currentColor;`;

/** Motif hachuré des jours « Entreprise » (l'information ne repose pas sur la seule couleur). */
const HATCH_DEFS = '<defs><pattern id="kg-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
  + '<rect class="bg-company" width="6" height="6"/><line class="hatch-line" x1="1" y1="0" x2="1" y2="6"/></pattern></defs>';

/** Calcule la géométrie de la frise. rows = [{ task, depth, wbs }] (lignes visibles). */
export function computeLayout(project, sched, rows, zoom = project.view?.zoom || 'day', { today = todayDay() } = {}) {
  const dayW = (ZOOMS[zoom] || ZOOMS.day).dayW;
  let first = Math.min(dayOfSlot(sched.start), today);
  let last = Math.max(dayOfSlot(sched.end), today);
  // Ne pas s'étendre démesurément vers "aujourd'hui" si le projet est loin.
  if (today < dayOfSlot(sched.start) - 60) first = dayOfSlot(sched.start);
  if (today > dayOfSlot(sched.end) + 60) last = dayOfSlot(sched.end);

  let startDay, endDay;
  if (zoom === 'month') {
    const p = parts(first);
    startDay = fromParts(p.y, p.m, 1);
    const q = parts(last);
    endDay = fromParts(q.y, q.m + 2, 0);
  } else {
    startDay = mondayOf(first) - 7;
    endDay = mondayOf(last) + 7 * (zoom === 'week' ? 6 : 3) - 1;
  }
  const minDays = zoom === 'month' ? 365 : zoom === 'week' ? 120 : 42;
  if (endDay - startDay + 1 < minDays) endDay = startDay + minDays - 1;

  const days = endDay - startDay + 1;
  const width = Math.ceil(days * dayW);
  const x = (slot) => (slot - startDay * 2) * (dayW / 2);
  return {
    zoom, dayW, startDay, endDay, days, width, today,
    rowH: ROW_H, headH: HEAD_H,
    height: Math.max(rows.length, 1) * ROW_H,
    rows: rows.map((r, i) => ({ ...r, y: i * ROW_H })),
    x,
    slotAt: (px) => Math.floor(px / (dayW / 2)) + startDay * 2,
  };
}

// --- En-tête ----------------------------------------------------------------

export function headerSVG(L, resolver) {
  const out = [];
  const H1 = 22;
  out.push(`<rect class="g-head-bg" x="0" y="0" width="${L.width}" height="${L.headH}"/>`);

  // Ligne 1 : mois (ou années en zoom mois)
  let d = L.startDay;
  while (d <= L.endDay) {
    const p = parts(d);
    const next = L.zoom === 'month' ? fromParts(p.y + 1, 0, 1) : fromParts(p.y, p.m + 1, 1);
    const end = Math.min(next, L.endDay + 1);
    const x0 = (d - L.startDay) * L.dayW;
    const w = (end - d) * L.dayW;
    const label = L.zoom === 'month' ? `${p.y}` : w > 90 ? `${MONTHS[p.m]} ${p.y}` : w > 40 ? MONTHS_SHORT[p.m] : '';
    out.push(`<line class="g-head-line" x1="${r1(x0)}" y1="0" x2="${r1(x0)}" y2="${L.headH}"/>`);
    if (label) out.push(`<text class="g-head-strong" x="${r1(x0 + 6)}" y="15">${esc(label)}</text>`);
    d = end;
  }
  out.push(`<line class="g-head-line" x1="0" y1="${H1}" x2="${L.width}" y2="${H1}"/>`);

  // Ligne 2 : jours / semaines / mois
  if (L.zoom === 'day') {
    for (let day = L.startDay; day <= L.endDay; day++) {
      const x0 = (day - L.startDay) * L.dayW;
      const info = resolver.dayInfo(day);
      const isToday = day === L.today;
      if (isToday) out.push(`<rect class="g-head-today" x="${r1(x0 + 2)}" y="${H1 + 3}" width="${r1(L.dayW - 4)}" height="${L.headH - H1 - 6}" rx="6"/>`);
      const title = info.label ? `<title>${esc(info.label)}</title>` : '';
      out.push(`<g>${title}<text class="${isToday ? 'g-head-today-text' : 'g-head-muted'}" x="${r1(x0 + L.dayW / 2)}" y="${H1 + 12}" text-anchor="middle">${WEEKDAYS_SHORT[weekday(day)]}</text>`);
      out.push(`<text class="${isToday ? 'g-head-today-text' : 'g-head-text'}" x="${r1(x0 + L.dayW / 2)}" y="${H1 + 25}" text-anchor="middle">${parts(day).d}</text></g>`);
      if (weekday(day) === 0) out.push(`<line class="g-head-line" x1="${r1(x0)}" y1="${H1}" x2="${r1(x0)}" y2="${L.headH}"/>`);
    }
  } else if (L.zoom === 'week') {
    for (let day = mondayOf(L.startDay); day <= L.endDay; day += 7) {
      const x0 = (day - L.startDay) * L.dayW;
      const wk = isoWeek(day);
      const p = parts(day);
      out.push(`<line class="g-head-line" x1="${r1(x0)}" y1="${H1}" x2="${r1(x0)}" y2="${L.headH}"/>`);
      out.push(`<text class="g-head-text" x="${r1(x0 + 4)}" y="${H1 + 13}">S${wk.week}</text>`);
      out.push(`<text class="g-head-muted" x="${r1(x0 + 4)}" y="${H1 + 25}">${String(p.d).padStart(2, '0')}/${String(p.m + 1).padStart(2, '0')}</text>`);
    }
  } else {
    let day = L.startDay;
    while (day <= L.endDay) {
      const p = parts(day);
      const next = fromParts(p.y, p.m + 1, 1);
      const x0 = (day - L.startDay) * L.dayW;
      out.push(`<line class="g-head-line" x1="${r1(x0)}" y1="${H1}" x2="${r1(x0)}" y2="${L.headH}"/>`);
      out.push(`<text class="g-head-text" x="${r1(x0 + ((next - day) * L.dayW) / 2)}" y="${H1 + 19}" text-anchor="middle">${MONTHS_SHORT[p.m]}</text>`);
      day = next;
    }
  }
  out.push(`<line class="g-head-line" x1="0" y1="${L.headH - 0.5}" x2="${L.width}" y2="${L.headH - 0.5}"/>`);
  return out.join('');
}

// --- Corps ------------------------------------------------------------------

/** Fond : demi-journées colorées selon le calendrier (école / entreprise / libre). */
function backgroundSVG(L, resolver, height) {
  const out = [];
  let runType = null, runStart = 0;
  const flush = (endSlot) => {
    if (runType && runType !== 'school') {
      const x0 = L.x(runStart), x1 = L.x(endSlot);
      const fill = runType === 'company' ? ' fill="url(#kg-hatch)"' : '';
      out.push(`<rect class="bg-${runType}"${fill} x="${r1(x0)}" y="0" width="${r1(x1 - x0)}" height="${height}"/>`);
    }
  };
  const first = L.startDay * 2, last = (L.endDay + 1) * 2;
  for (let s = first; s < last; s++) {
    const t = resolver.slotType(s);
    if (t !== runType) { flush(s); runType = t; runStart = s; }
  }
  flush(last);

  // Séparateurs : semaines (zoom jour/semaine) ou mois (zoom mois)
  if (L.zoom === 'month') {
    let day = L.startDay;
    while (day <= L.endDay) {
      const p = parts(day);
      const x0 = (day - L.startDay) * L.dayW;
      out.push(`<line class="g-grid-soft" x1="${r1(x0)}" y1="0" x2="${r1(x0)}" y2="${height}"/>`);
      day = fromParts(p.y, p.m + 1, 1);
    }
  } else {
    for (let day = mondayOf(L.startDay); day <= L.endDay; day += L.zoom === 'day' ? 1 : 7) {
      if (day < L.startDay) continue;
      const x0 = (day - L.startDay) * L.dayW;
      const cls = weekday(day) === 0 ? 'g-grid' : 'g-grid-soft';
      out.push(`<line class="${cls}" x1="${r1(x0)}" y1="0" x2="${r1(x0)}" y2="${height}"/>`);
    }
  }
  return out.join('');
}

function depPath(x1, y1, x2, y2, rowH) {
  // Lien "fin → début" en angles droits.
  if (x2 - x1 >= 14) {
    const xm = x1 + 7;
    return `M${r1(x1)} ${y1}H${r1(xm)}V${y2}H${r1(x2 - 5)}`;
  }
  const ym = y2 > y1 ? y2 - rowH / 2 : y2 + rowH / 2;
  return `M${r1(x1)} ${y1}h7V${ym}H${r1(x2 - 12)}V${y2}H${r1(x2 - 5)}`;
}

/**
 * Corps du diagramme. opts : { selectedId, showBaseline, interactive, resources }
 */
export function bodySVG(project, sched, L, opts = {}) {
  const { selectedId = null, interactive = true, showBaseline = true } = opts;
  const resolver = sched.resolver;
  const height = Math.max(L.height, opts.minHeight || 0);
  const resName = new Map(project.resources.map((r) => [r.id, r]));
  const out = [];

  out.push(HATCH_DEFS);
  out.push(backgroundSVG(L, resolver, height));

  // Lignes (+ rectangle de sélection, déplacé par l'application sans tout redessiner)
  if (interactive) {
    const sel = L.rows.find((r) => r.task.id === selectedId);
    out.push(`<rect id="g-sel" class="g-row-sel" x="0" y="${sel ? sel.y : -1000}" width="${L.width}" height="${L.rowH}"/>`);
  }
  for (const row of L.rows) {
    out.push(`<line class="g-grid-soft" x1="0" y1="${row.y + L.rowH - 0.5}" x2="${L.width}" y2="${row.y + L.rowH - 0.5}"/>`);
  }

  // Aujourd'hui
  if (L.today >= L.startDay && L.today <= L.endDay) {
    const tx = r1(L.x(L.today * 2));
    out.push(`<line class="g-today" x1="${tx}" y1="0" x2="${tx}" y2="${height}"/>`);
  }

  // Dépendances
  const rowOf = new Map(L.rows.map((r) => [r.task.id, r]));
  const deps = [];
  for (const row of L.rows) {
    const t = row.task;
    const it = sched.items.get(t.id);
    for (const pid of t.deps) {
      const prow = rowOf.get(pid);
      if (!prow) continue;
      const pit = sched.items.get(pid);
      const x1 = pit.milestone ? milestoneX(L, pit) + 7 : L.x(pit.end + 1);
      const x2 = it.milestone ? milestoneX(L, it) - 7 : L.x(it.start);
      const y1 = prow.y + L.rowH / 2, y2 = row.y + L.rowH / 2;
      const path = depPath(x1, y1, x2, y2, L.rowH);
      const hit = interactive ? `<path d="${path}" stroke="transparent" stroke-width="10" fill="none" data-role="dep" data-from="${esc(pid)}" data-to="${esc(t.id)}" style="cursor:pointer"><title>Cliquer pour supprimer ce lien</title></path>` : '';
      deps.push(`<g><path class="dep" d="${path}"/>${hit}<path class="dep-arrow" d="M${r1(x2 - 6)} ${y2 - 4}L${r1(x2)} ${y2}L${r1(x2 - 6)} ${y2 + 4}Z"/></g>`);
    }
  }
  out.push(deps.join(''));

  // Barres
  for (const row of L.rows) {
    const t = row.task;
    const it = sched.items.get(t.id);
    const color = t.color || PALETTE[0];
    const yMid = row.y + L.rowH / 2;
    const g = [];
    const base = showBaseline ? project.baseline?.tasks?.[t.id] : null;
    let labelX;

    if (base) {
      const bs = parseSlot(base.start), be = parseSlot(base.end);
      if (bs != null && be != null) {
        if (base.milestone) {
          const bx = L.x(bs + (base.atEnd ? 1 : 0));
          g.push(`<path class="bar-baseline" d="M${r1(bx)} ${row.y + L.rowH - 9}l4 4l-4 4l-4 -4z"><title>Prévu : ${formatFR(dayOfSlot(bs))}</title></path>`);
        } else {
          g.push(`<rect class="bar-baseline" x="${r1(L.x(bs))}" y="${row.y + L.rowH - 7}" width="${r1(Math.max(2, L.x(be + 1) - L.x(bs)))}" height="4" rx="2"><title>Prévu : ${formatFR(dayOfSlot(bs))} → ${formatFR(dayOfSlot(be))}</title></rect>`);
        }
      }
    }

    if (it.summary) {
      const x0 = L.x(it.start), x1 = L.x(it.end + 1);
      const w = Math.max(2, x1 - x0);
      const y = yMid - 6;
      g.push(`<rect class="bar-summary" x="${r1(x0)}" y="${y}" width="${r1(w)}" height="8" rx="2"/>`);
      g.push(`<rect class="bar-summary-progress" x="${r1(x0)}" y="${y + 2}" width="${r1((w * it.progress) / 100)}" height="4" rx="1"/>`);
      g.push(`<path class="bar-summary" d="M${r1(x0)} ${y + 8}v6l6 -6z M${r1(x1)} ${y + 8}v6l-6 -6z"/>`);
      labelX = x1 + 8;
    } else if (it.milestone) {
      const cx = milestoneX(L, it);
      // Jalon atteint : losange plein ; à venir : losange vide (différence de forme, pas seulement de couleur).
      const fill = it.progress >= 100 ? 'currentColor' : 'var(--g-milestone-empty)';
      g.push(`<path class="bar-ms" d="M${r1(cx)} ${yMid - 8}l8 8l-8 8l-8 -8z" fill="${fill}" data-role="bar"/>`);
      if (it.status === 'late') g.push(`<path class="bar-late" d="M${r1(cx)} ${yMid - 11}l11 11l-11 11l-11 -11z"/>`);
      labelX = cx + 14;
      if (interactive) g.push(linkHandle(cx + 11, yMid));
    } else {
      const x0 = L.x(it.start), x1 = L.x(it.end + 1);
      const y = yMid - 9, h = 18;
      // Zone de saisie pour la souris, puis interruptions en pointillés entre les périodes travaillées.
      g.push(`<rect class="bar-hit" x="${r1(x0)}" y="${y}" width="${r1(x1 - x0)}" height="${h}" data-role="bar"/>`);
      for (let i = 1; i < it.runs.length; i++) {
        g.push(`<line class="bar-gap" x1="${r1(L.x(it.runs[i - 1][1] + 1))}" y1="${yMid}" x2="${r1(L.x(it.runs[i][0]))}" y2="${yMid}"/>`);
      }
      // Périodes travaillées (claires) et partie réalisée (pleine)
      let left = Math.round((it.n * it.progress) / 100);
      for (const [a, b] of it.runs) {
        const rx0 = L.x(a), rx1 = L.x(b + 1);
        g.push(`<rect class="bar-run" x="${r1(rx0)}" y="${y}" width="${r1(rx1 - rx0)}" height="${h}" rx="2" data-role="bar"/>`);
        if (left > 0) {
          const k = Math.min(left, b - a + 1);
          g.push(`<rect class="bar-progress" x="${r1(rx0)}" y="${y}" width="${r1(L.x(a + k) - rx0)}" height="${h}" rx="2" data-role="bar"/>`);
          left -= k;
        }
      }
      if (it.status === 'late') g.push(`<rect class="bar-late" x="${r1(x0 - 3)}" y="${y - 3}" width="${r1(x1 - x0 + 6)}" height="${h + 6}" rx="4"/>`);
      labelX = x1 + 8;
      if (interactive) {
        g.push(`<rect x="${r1(x1 - 6)}" y="${y}" width="10" height="${h}" fill="transparent" data-role="resize" style="cursor:ew-resize"><title>Glisser pour changer la durée</title></rect>`);
        g.push(linkHandle(x1 + 9, yMid));
        labelX = x1 + 20;
      }
    }

    const names = t.resources.map((r) => resName.get(r)?.name).filter(Boolean).join(', ');
    let label = `<tspan class="bar-label">${esc(t.name)}</tspan>`;
    if (names) label += `<tspan class="bar-label-muted" dx="6">${esc(names)}</tspan>`;
    if (it.status === 'late' && !it.summary && !it.error) label += `<tspan class="bar-label-late" dx="6">en retard</tspan>`;
    if (it.error) label += `<tspan class="bar-label-late" dx="6">${esc(it.error)}</tspan>`;
    g.push(`<text x="${r1(labelX)}" y="${yMid + 4}" style="pointer-events:none">${label}</text>`);

    const cls = `g-task${it.summary ? ' is-summary' : ''}${it.milestone ? ' is-milestone' : ''}`;
    const when = it.milestone ? formatFR(dayOfSlot(it.start)) : `${formatFR(dayOfSlot(it.start))} → ${formatFR(dayOfSlot(it.end))}`;
    const tip = `${t.name} — ${when} — ${it.progress} % (${STATUS_LABELS[it.status]})`;
    out.push(`<g class="${cls}" data-id="${esc(t.id)}" style="color:${esc(color)};${interactive && !it.summary ? 'cursor:grab' : ''}"><title>${esc(tip)}</title>${g.join('')}</g>`);
  }
  return { svg: out.join(''), height };
}

function linkHandle(cx, cy) {
  return `<circle class="link-handle" cx="${r1(cx)}" cy="${cy}" r="5" data-role="link"><title>Glisser vers une autre tâche pour créer un lien</title></circle>`;
}
