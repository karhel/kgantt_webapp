// Import des fichiers GanttProject (.gan) vers un projet K-Gantt.
//
// Correspondances :
//   tâche / sous-tâche → tâche (arborescence conservée)
//   meeting="true"      → jalon
//   duration (jours ouvrés GanttProject) → durée en jours de présence
//   complete            → avancement (%)
//   <depend type="2">   → dépendance fin → début (les autres types sont convertis, avec un avertissement)
//   ressources + allocations → ressources
//   jours fériés datés du calendrier → périodes « libre »

import { parseXML, childNamed, childrenNamed } from './xml.js';
import { defaultProject, normalizeProject, wouldCreateCycle, PALETTE } from './project.js';
import { defaultCalendar, normalizeCalendar } from './calendar.js';
import { toDay, toISO, formatSlot } from './dates.js';

const GP_DEFAULT_COLORS = new Set(['#8cb6ce', '#8cb6cf']);
const DEP_TYPES = { 1: 'début → début', 3: 'fin → fin', 4: 'début → fin' };

/**
 * @param {string} xmlText contenu du fichier .gan
 * @param {{ where?: 'school'|'company'|'any', keepDates?: boolean, calendar?: object }} opts
 * @returns {{ project: object, warnings: string[], stats: { tasks: number, milestones: number, deps: number, resources: number } }}
 */
export function importGanttProject(xmlText, { where = 'any', keepDates = true, calendar = null } = {}) {
  let root;
  try { root = parseXML(xmlText); } catch (e) { throw new Error(`Fichier GanttProject illisible : ${e.message}`); }
  if (!root || root.name !== 'project') throw new Error('Ce fichier n’est pas un projet GanttProject (.gan).');

  const warnings = [];
  const p = defaultProject();
  p.project.name = root.attrs.name?.trim() || 'Projet importé';
  p.project.description = childNamed(root, 'description')?.text.trim() || '';
  p.calendar = calendar ? normalizeCalendar(structuredClone(calendar)) : defaultCalendar();

  // Jours fériés / congés datés du calendrier GanttProject
  const cals = childNamed(root, 'calendars');
  for (const d of childrenNamed(cals, 'date')) {
    const y = +d.attrs.year, m = +d.attrs.month, day = +d.attrs.date;
    if (!y || !m || !day) continue; // dates récurrentes sans année : ignorées (fériés déjà calculés)
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (toDay(iso) == null) continue;
    p.calendar.periods.push({ start: iso, end: iso, type: 'off', label: d.attrs.description || 'Congé (GanttProject)' });
  }
  // Congés des ressources : non repris (K-Gantt planifie au niveau de la classe)
  if (childrenNamed(childNamed(root, 'vacations'), 'vacation').length) {
    warnings.push('Les congés individuels des ressources ne sont pas repris.');
  }

  // Tâches (récursif)
  const tasks = [];
  const starts = [];
  const depsRaw = [];
  let otherDepTypes = 0, lags = 0;
  const walk = (el, parent) => {
    for (const t of childrenNamed(el, 'task')) {
      const id = `gp${t.attrs.id}`;
      const milestone = t.attrs.meeting === 'true';
      const start = toDay(t.attrs.start || '');
      if (start != null) starts.push(start);
      const color = (t.attrs.color || '').toLowerCase();
      const hasKids = childrenNamed(t, 'task').length > 0;
      tasks.push({
        id,
        name: t.attrs.name || 'Sans nom',
        parent,
        type: milestone ? 'milestone' : 'task',
        duration: milestone ? 0 : Math.max(1, Math.round(parseFloat(t.attrs.duration) || 1)),
        where,
        notBefore: null,
        _start: start,
        _hasKids: hasKids,
        deps: [],
        progress: Math.max(0, Math.min(100, Math.round(+t.attrs.complete || 0))),
        resources: [],
        color: /^#[0-9a-f]{6}$/.test(color) && !GP_DEFAULT_COLORS.has(color) ? color : null,
        notes: childNamed(t, 'notes')?.text.trim() || '',
        collapsed: t.attrs.expand === 'false',
        log: [],
      });
      for (const d of childrenNamed(t, 'depend')) {
        const type = +d.attrs.type || 2;
        if (type !== 2) otherDepTypes++;
        if (+d.attrs.difference) lags++;
        depsRaw.push({ from: id, to: `gp${d.attrs.id}` });
      }
      walk(t, id);
    }
  };
  walk(childNamed(root, 'tasks'), null);
  if (!tasks.length) warnings.push('Le fichier ne contient aucune tâche.');

  const byId = new Map(tasks.map((t) => [t.id, t]));
  let rejected = 0;
  for (const { from, to } of depsRaw) {
    const t = byId.get(to);
    if (!t || !byId.has(from) || t.deps.includes(from)) continue;
    if (wouldCreateCycle({ tasks }, from, to)) { rejected++; continue; }
    t.deps.push(from);
  }
  if (rejected) warnings.push(`${rejected} lien(s) ignoré(s) : boucle ou lien entre une tâche et son groupe.`);
  if (otherDepTypes) warnings.push(`${otherDepTypes} lien(s) d’un autre type (${Object.values(DEP_TYPES).join(', ')}) ont été convertis en « fin → début ».`);
  if (lags && !keepDates) warnings.push(`${lags} lien(s) avec décalage : le décalage n’est pas repris.`);

  // Dates de départ
  if (starts.length) p.project.start = toISO(Math.min(...starts));
  if (keepDates) {
    for (const t of tasks) {
      if (!t._hasKids && t._start != null) t.notBefore = formatSlot(t._start * 2);
    }
  }

  // Ressources et affectations
  const resIds = new Map();
  childrenNamed(childNamed(root, 'resources'), 'resource').forEach((r, i) => {
    const id = `gpr${r.attrs.id}`;
    resIds.set(r.attrs.id, id);
    p.resources.push({ id, name: r.attrs.name || `Ressource ${i + 1}`, color: PALETTE[i % PALETTE.length] });
  });
  for (const a of childrenNamed(childNamed(root, 'allocations'), 'allocation')) {
    const t = byId.get(`gp${a.attrs['task-id']}`);
    const r = resIds.get(a.attrs['resource-id']);
    if (t && r && !t.resources.includes(r)) t.resources.push(r);
  }

  if (childrenNamed(childNamed(root, 'previous'), 'previous-tasks').length) {
    warnings.push('Les états de référence (« baselines ») de GanttProject ne sont pas repris : utilisez « Prévu / réel » après l’import.');
  }

  p.tasks = tasks.map(({ _start, _hasKids, ...t }) => t);
  const project = normalizeProject(p);
  return {
    project,
    warnings,
    stats: {
      tasks: project.tasks.filter((t) => t.type !== 'milestone').length,
      milestones: project.tasks.filter((t) => t.type === 'milestone').length,
      deps: project.tasks.reduce((a, t) => a + t.deps.length, 0),
      resources: project.resources.length,
    },
  };
}
