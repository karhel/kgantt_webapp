// SPDX-License-Identifier: AGPL-3.0-or-later
// Agenda iCalendar (RFC 5545) : export .ics et données pour l'abonnement (ical.php).
//
// Les dates calculées sont aussi enregistrées dans le fichier .kgantt.json
// (section "computed") : le serveur peut ainsi produire l'agenda sans refaire
// la planification et sans rien stocker.

import { flatten } from './project.js';
import { formatSlot, parseSlot, dayOfSlot, halfOfSlot, toISO } from './dates.js';
import { WHERE } from './calendar.js';
import { STATUS_LABELS } from './scheduler.js';

export const ICAL_DOMAIN = 'kgantt.phoen-ix.net';

/** Instantané des dates calculées, enregistré dans le fichier projet. */
export function computedSnapshot(project, sched) {
  const tasks = {};
  for (const t of project.tasks) {
    const it = sched.items.get(t.id);
    if (!it) continue;
    tasks[t.id] = {
      start: formatSlot(it.start),
      end: formatSlot(it.milestone ? it.start : it.end),
      runs: it.runs.map(([a, b]) => [formatSlot(a), formatSlot(b)]),
      summary: it.summary,
      milestone: it.milestone,
      progress: it.progress,
      status: it.status,
    };
  }
  return { generatedAt: new Date().toISOString(), progress: sched.progress, tasks };
}

/** Échappement des valeurs texte (RFC 5545 §3.3.11). */
export function icsEscape(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Repli des lignes à 75 octets (RFC 5545 §3.1), sans couper un caractère UTF-8. */
export function icsFold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '', bytes = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { out.push(cur); cur = ''; bytes = 0; limit = 74; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const icsDate = (day) => toISO(day).replace(/-/g, '');
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Regroupe les créneaux travaillés en plages de jours [début, fin] (jours inclus). */
export function dayRanges(runs) {
  const ranges = [];
  for (const [a, b] of runs) {
    const s = dayOfSlot(a), e = dayOfSlot(b);
    const last = ranges[ranges.length - 1];
    if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e); else ranges.push([s, e]);
  }
  return ranges;
}

/**
 * Liste des évènements (indépendante du format) à partir du projet et de l'instantané.
 * mode : 'runs' (un évènement par période travaillée) ou 'span' (un évènement par tâche).
 */
export function icalEvents(project, computed, { mode = 'runs', groups = false } = {}) {
  const pid = project.project.id || 'projet';
  const resName = new Map(project.resources.map((r) => [r.id, r.name]));
  const half = project.project.halfDays;
  const events = [];
  for (const { task: t, wbs } of flatten(project)) {
    const c = computed.tasks[t.id];
    if (!c) continue;
    if (c.summary && !groups) continue;
    const s = parseSlot(c.start), e = parseSlot(c.end);
    if (s == null || e == null) continue;
    const halfLabel = (slot) => (half ? (halfOfSlot(slot) ? ' (après-midi)' : ' (matin)') : '');
    const lines = [
      `Projet : ${project.project.name}`,
      `Tâche ${wbs}${c.milestone ? ' (jalon)' : c.summary ? ' (groupe)' : ''}`,
      c.summary || c.milestone ? null : `Lieu : ${WHERE[t.where]?.label || ''} — durée ${String(t.duration).replace('.', ',')} j`,
      `Du ${toISO(dayOfSlot(s))}${halfLabel(s)} au ${toISO(dayOfSlot(e))}${halfLabel(e)}`,
      `Avancement : ${c.progress} % — ${STATUS_LABELS[c.status] || ''}`,
      t.resources.length ? `Ressources : ${t.resources.map((r) => resName.get(r)).filter(Boolean).join(', ')}` : null,
      t.notes ? `\n${t.notes}` : null,
    ].filter((x) => x != null);
    const base = { taskId: t.id, description: lines.join('\n'), progress: c.progress };

    if (c.milestone) {
      events.push({ ...base, uid: `${pid}-${t.id}`, summary: `◆ ${t.name}`, start: dayOfSlot(s), end: dayOfSlot(s) });
    } else if (mode === 'span' || c.summary || !c.runs?.length) {
      events.push({ ...base, uid: `${pid}-${t.id}`, summary: c.summary ? `▸ ${t.name}` : t.name, start: dayOfSlot(s), end: dayOfSlot(e) });
    } else {
      const ranges = dayRanges(c.runs.map(([a, b]) => [parseSlot(a), parseSlot(b)]));
      ranges.forEach(([a, b], i) => {
        events.push({
          ...base,
          uid: `${pid}-${t.id}-${i + 1}`,
          summary: ranges.length > 1 ? `${t.name} (${i + 1}/${ranges.length})` : t.name,
          start: a,
          end: b,
        });
      });
    }
  }
  return events;
}

/** Fichier .ics complet. */
export function buildICS(project, computed, opts = {}) {
  const now = opts.now || new Date();
  const seq = Math.max(0, Math.floor((Date.parse(computed.generatedAt) || now.getTime()) / 60000) - 26e6);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//K-Gantt//K-Gantt 1.0//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(`${project.project.name} (K-Gantt)`)}`,
    `X-WR-CALDESC:${icsEscape([project.project.team, project.project.className].filter(Boolean).join(' — '))}`,
  ];
  for (const ev of icalEvents(project, computed, opts)) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}@${ICAL_DOMAIN}`,
      `DTSTAMP:${stamp(now)}`,
      `SEQUENCE:${seq}`,
      `DTSTART;VALUE=DATE:${icsDate(ev.start)}`,
      `DTEND;VALUE=DATE:${icsDate(ev.end + 1)}`,
      `SUMMARY:${icsEscape(ev.summary)}`,
      `DESCRIPTION:${icsEscape(ev.description)}`,
      `CATEGORIES:${icsEscape(project.project.name)}`,
      'TRANSP:TRANSPARENT',
      'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

