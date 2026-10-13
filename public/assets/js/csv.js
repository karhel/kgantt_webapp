// Export CSV compatible Excel (français) : séparateur « ; », BOM UTF-8, fins de ligne CRLF.

import { flatten } from './project.js';
import { slotLabel, parseSlot } from './dates.js';
import { WHERE } from './calendar.js';
import { STATUS_LABELS } from './scheduler.js';

const cell = (v) => {
  const s = v == null ? '' : String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const num = (v) => String(v).replace('.', ',');

export const CSV_HEADERS = ['N°', 'Nom', 'Type', 'Durée (jours)', 'Lieu', 'Début', 'Fin', 'Avancement (%)',
  'Prédécesseurs', 'Ressources', 'État', 'Début prévu', 'Fin prévue', 'Notes'];

export function toCSV(project, sched) {
  const rows = flatten(project);
  const wbs = new Map(rows.map((r) => [r.task.id, r.wbs]));
  const resName = new Map(project.resources.map((r) => [r.id, r.name]));
  const half = project.project.halfDays;
  const lines = [CSV_HEADERS.map(cell).join(';')];

  for (const { task: t, wbs: n } of rows) {
    const it = sched.items.get(t.id);
    const type = it.summary ? 'Groupe' : it.milestone ? 'Jalon' : 'Tâche';
    const base = project.baseline?.tasks?.[t.id];
    lines.push([
      n,
      t.name,
      type,
      it.summary || it.milestone ? (it.summary ? num(it.span) : 0) : num(t.duration),
      it.summary ? '' : it.milestone ? '' : WHERE[t.where].label,
      slotLabel(it.start, half),
      slotLabel(it.milestone ? it.start : it.end, half),
      it.progress,
      t.deps.map((d) => wbs.get(d)).filter(Boolean).join(', '),
      t.resources.map((r) => resName.get(r)).filter(Boolean).join(', '),
      STATUS_LABELS[it.status] || '',
      base ? slotLabel(parseSlot(base.start), half) : '',
      base ? slotLabel(parseSlot(base.end), half) : '',
      t.notes || '',
    ].map(cell).join(';'));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
