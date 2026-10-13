// SPDX-License-Identifier: AGPL-3.0-or-later
// K-Gantt — point d'entrée de l'application.

import { store } from './store.js';
import {
  newTask, flatten, hasChildren, isDescendant, indentTask, outdentTask, moveTask, wouldCreateCycle, defaultProject,
} from './project.js';
import { WHERE } from './calendar.js';
import { computeLayout, headerSVG, bodySVG, SVG_CSS, ROW_H, HEAD_H, ZOOMS } from './gantt.js';
import { durationBetween, STATUS_LABELS } from './scheduler.js';
import {
  formatSlot, formatShortFR, formatFR, formatLongFR, dayOfSlot, halfOfSlot, toISO, today,
} from './dates.js';
import { hydrateIcons, icon } from './icons.js';
import { esc, toast, confirmDialog, pickJSONFile, pickTextFile, readFileAsText } from './ui.js';
import {
  openTaskDialog, openProjectDialog, openResourcesDialog, openNewProjectDialog, openExportDialog,
  openHelpDialog, deleteTasks, logProgress, openGanImportDialog, openIcalDialog,
} from './dialogs.js';
import { openCalendarDialog } from './calendar-ui.js';
import { exportJSON, exportCSV, exportPNG, exportPDF, exportICS } from './export.js';

const config = JSON.parse(document.getElementById('kg-config').textContent);
const ganttEl = document.getElementById('gantt');
const emptyEl = document.getElementById('empty');

let selectedId = null;
let layout = null;
let scrollToStart = true;
let tableW = 740;
try { tableW = Math.max(280, Math.min(1000, +localStorage.getItem('kgantt:tableW') || 740)); } catch { /* */ }

// Styles du SVG (partagés avec l'export).
document.head.insertAdjacentHTML('beforeend', `<style>${SVG_CSS}</style>`);
hydrateIcons();

// --- Rendu -----------------------------------------------------------------------

function render() {
  renderHeader();
  renderToolbar();
  renderGantt();
  renderStatus();
}

function renderHeader() {
  const P = store.project.project;
  document.getElementById('project-name').textContent = P.name;
  document.getElementById('project-sub').textContent = [P.team, P.className].filter(Boolean).join(' • ') || 'Cliquer pour renseigner l’équipe et la classe';
  document.title = `${P.name} — K-Gantt`;
  const s = document.getElementById('save-state');
  s.classList.toggle('is-dirty', store.dirty);
  s.textContent = store.dirty ? 'Non enregistré' : store.fileName ? `Enregistré · ${store.fileName}` : '';
  s.title = store.dirty ? 'Pensez à enregistrer votre fichier .json (Ctrl+S). Un brouillon est gardé dans ce navigateur.' : '';
}

function renderToolbar() {
  const zoom = store.project.view.zoom || 'day';
  document.querySelectorAll('[data-zoom]').forEach((b) => b.classList.toggle('is-active', b.dataset.zoom === zoom));
  const sel = selectedTask();
  const set = (action, enabled) => document.querySelectorAll(`[data-action="${action}"]`).forEach((b) => { b.disabled = !enabled; });
  set('undo', store.canUndo);
  set('redo', store.canRedo);
  for (const a of ['indent', 'outdent', 'move-up', 'move-down', 'edit', 'delete']) set(a, !!sel);
  const hasBase = !!store.project.baseline;
  set('baseline-toggle', hasBase);
  set('baseline-clear', hasBase);
  const bt = document.getElementById('baseline-toggle');
  bt.lastChild.textContent = store.project.view.showBaseline === false ? 'Afficher le prévu' : 'Masquer le prévu';
  const theme = effectiveTheme();
  const tb = document.querySelector('[data-action="theme"]');
  tb.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
}

function dateCell(slot, half) {
  const d = dayOfSlot(slot);
  const label = half ? `${formatShortFR(d)} ${halfOfSlot(slot) ? 'ap.-m.' : 'matin'}` : formatFR(d);
  return `<div class="g-date" data-open title="${esc(formatLongFR(d))}${half ? (halfOfSlot(slot) ? ', après-midi' : ', matin') : ''}">${label}</div>`;
}

function rowHTML(row, sched, half) {
  const t = row.task;
  const it = sched.items.get(t.id);
  const summary = it.summary;
  const toggle = summary
    ? `<button class="g-toggle" type="button" data-toggle title="${t.collapsed ? 'Déplier' : 'Replier'}">${icon(t.collapsed ? 'chevronRight' : 'chevronDown', 14)}</button>`
    : '<span class="g-toggle-spacer"></span>';
  const ms = it.milestone && !summary ? `<span class="g-ms">${icon('diamond', 13)}</span>` : '';
  const step = half ? 0.5 : 1;
  const dur = summary ? `<span class="g-ro" style="display:block">${String(it.span).replace('.', ',')} j</span>`
    : it.milestone ? '<span class="g-ro" style="display:block">—</span>'
      : `<input type="number" data-f="duration" min="${step}" step="${step}" value="${t.duration}" title="Durée en jours de présence">`;
  const where = summary || it.milestone ? ''
    : `<select data-f="where" title="Jours comptés">${Object.entries(WHERE).map(([k, w]) => `<option value="${k}"${t.where === k ? ' selected' : ''}>${w.label}</option>`).join('')}</select>`;
  const pct = summary ? `<span class="g-ro" style="display:block">${it.progress} %</span>`
    : `<input type="number" data-f="progress" min="0" max="100" step="5" value="${t.progress}" title="Avancement (%)">`;
  const statusTitle = `${STATUS_LABELS[it.status]} — réalisé ${it.progress} %, attendu ${it.expected} %${it.error ? ` — ${it.error}` : ''}`;
  return `<div class="g-row${summary ? ' is-summary' : ''}${t.id === selectedId ? ' is-selected' : ''}" data-id="${esc(t.id)}">
    <div class="g-wbs">${row.wbs}</div>
    <div class="g-name" style="padding-left:${row.depth * 16 + 2}px">${toggle}${ms}<input type="text" data-f="name" value="${esc(t.name)}" title="${esc(t.name)}"></div>
    <div>${dur}</div>
    <div>${where}</div>
    ${dateCell(it.start, half)}
    ${dateCell(it.milestone ? it.start : it.end, half)}
    <div>${pct}</div>
    <div class="g-status" title="${esc(statusTitle)}"><span class="dot dot-${it.error ? 'late' : it.status}"></span></div>
  </div>`;
}

function renderGantt() {
  const project = store.project;
  const sched = store.schedule;
  const rows = flatten(project, { includeCollapsed: false });
  const prev = layout;
  const scroller = ganttEl.querySelector('.g-scroll');
  const leftDay = prev && scroller ? prev.startDay + scroller.scrollLeft / prev.dayW : null;
  const scrollTop = scroller ? scroller.scrollTop : 0;
  const focus = captureFocus();

  layout = computeLayout(project, sched, rows);
  const L = layout;
  const viewH = ganttEl.clientHeight || 600;
  const minH = Math.max((rows.length + 1) * ROW_H, viewH - HEAD_H);
  const showBaseline = project.view.showBaseline !== false;
  const body = bodySVG(project, sched, L, { selectedId, showBaseline, minHeight: minH });
  const half = project.project.halfDays;

  ganttEl.style.setProperty('--table-w', `${tableW}px`);
  ganttEl.innerHTML = `
    <div class="g-scroll">
      <div class="g-canvas" style="width:${tableW + L.width}px">
        <div class="g-headrow">
          <div class="g-corner">
            <div class="g-cols"><div>N°</div><div>Tâche</div><div style="text-align:right">Durée</div><div>Lieu</div><div>Début</div><div>Fin</div><div style="text-align:right">%</div><div></div></div>
            <div class="g-splitter" title="Glisser pour élargir le tableau"></div>
          </div>
          <svg class="g-svg-head" width="${L.width}" height="${HEAD_H}">${headerSVG(L, sched.resolver)}</svg>
        </div>
        <div class="g-bodyrow">
          <div class="g-table" style="min-height:${body.height}px">
            ${rows.map((r) => rowHTML(r, sched, half)).join('')}
            <button class="g-add-row" type="button" data-action="add-task">${icon('plus', 16)} Ajouter une tâche</button>
          </div>
          <svg class="g-svg-body" width="${L.width}" height="${body.height}">${body.svg}</svg>
        </div>
      </div>
    </div>`;

  const sc = ganttEl.querySelector('.g-scroll');
  sc.scrollTop = scrollTop;
  if (scrollToStart) {
    sc.scrollLeft = Math.max(0, L.x(sched.start) - 60);
    scrollToStart = false;
  } else if (leftDay != null) {
    sc.scrollLeft = (leftDay - L.startDay) * L.dayW;
  }
  restoreFocus(focus);
  emptyEl.hidden = project.tasks.length > 0;
  if (!emptyEl.hidden && !emptyEl.innerHTML) renderEmpty();
}

function renderEmpty() {
  emptyEl.innerHTML = `<div class="empty-card">
    <div class="empty-illu"><span style="width:45%"></span><span style="width:70%;margin-left:25%"></span><span style="width:40%;margin-left:55%"></span></div>
    <h2>Planifiez votre projet en quelques minutes</h2>
    <p>① Réglez le <b>calendrier</b> de la classe (jours d’école, d’entreprise, vacances).<br>
       ② Ajoutez vos <b>tâches</b> avec leur durée en jours de présence.<br>
       ③ <b>Enregistrez</b> votre fichier .json et suivez l’avancement.</p>
    <div class="actions">
      <button class="btn btn-primary" type="button" data-action="add-task">${icon('plus')} Première tâche</button>
      <button class="btn" type="button" data-action="calendar">${icon('calendar')} Calendrier</button>
      <button class="btn" type="button" data-action="open">${icon('folder')} Ouvrir un fichier</button>
      <button class="btn" type="button" data-action="example">${icon('sparkles')} Voir un exemple</button>
    </div></div>`;
}

function renderStatus() {
  const s = store.schedule;
  const tasks = store.project.tasks;
  const late = [...s.items.values()].filter((i) => !i.summary && i.status === 'late').length;
  const leaves = [...s.items.values()].filter((i) => !i.summary).length;
  const hasBase = !!store.project.baseline && store.project.view.showBaseline !== false;
  const links = `<span class="sb-links"><a href="${esc(config.legalUrl)}" target="_blank">Mentions légales</a><a href="${esc(config.sourceUrl)}" target="_blank" rel="noopener" title="K-Gantt est un logiciel libre (AGPL-3.0)">Code source</a></span>`;
  document.getElementById('statusbar').innerHTML = tasks.length ? `
    <span class="sb-progress">Avancement <span class="meter" title="Réalisé ${s.progress} % — attendu aujourd’hui ${s.expected} %"><i style="width:${s.progress}%"></i><em style="left:calc(${s.expected}% - 1px)"></em></span>
      <b>${s.progress} %</b><span>attendu ${s.expected} %</span></span>
    <span>Du <b>${formatFR(dayOfSlot(s.start))}</b> au <b>${formatFR(dayOfSlot(s.end))}</b></span>
    <span><b>${leaves}</b> tâche${leaves > 1 ? 's' : ''}${late ? ` · <b style="color:var(--danger)">${late} en retard</b>` : ''}</span>
    <span class="legend">
      <span><i class="sw sw-school"></i>École</span><span><i class="sw sw-company"></i>Entreprise</span><span><i class="sw sw-off"></i>Libre</span>
      <span><i class="sw sw-today"></i>Aujourd’hui</span>${hasBase ? '<span><i class="sw sw-baseline"></i>Prévu</span>' : ''}
    </span>${links}` : `<span>Aucune tâche pour le moment.</span><span class="legend"><span><i class="sw sw-school"></i>École</span><span><i class="sw sw-company"></i>Entreprise</span><span><i class="sw sw-off"></i>Libre</span></span>${links}`;
}

function captureFocus() {
  const a = document.activeElement;
  const row = a?.closest?.('.g-row');
  if (!row || !a.dataset.f) return null;
  let sel = null;
  try { sel = [a.selectionStart, a.selectionEnd]; } catch { /* */ }
  return { id: row.dataset.id, f: a.dataset.f, sel };
}

function restoreFocus(f) {
  if (!f) return;
  const el = ganttEl.querySelector(`.g-row[data-id="${CSS.escape(f.id)}"] [data-f="${f.f}"]`);
  if (!el) return;
  el.focus({ preventScroll: true });
  if (f.sel && f.sel[0] != null) { try { el.setSelectionRange(f.sel[0], f.sel[1]); } catch { /* */ } }
}

// --- Sélection -----------------------------------------------------------------------

function selectedTask() {
  return store.project.tasks.find((t) => t.id === selectedId) || null;
}

function select(id, { scroll = true } = {}) {
  if (!store.project.tasks.some((t) => t.id === id)) id = null;
  selectedId = id;
  ganttEl.querySelectorAll('.g-row').forEach((r) => r.classList.toggle('is-selected', r.dataset.id === id));
  const row = layout?.rows.find((r) => r.task.id === id);
  const rect = ganttEl.querySelector('#g-sel');
  if (rect) rect.setAttribute('y', row ? row.y : -1000);
  renderToolbar();
  if (scroll && row) {
    const sc = ganttEl.querySelector('.g-scroll');
    const top = row.y, bottom = row.y + ROW_H + HEAD_H;
    if (top < sc.scrollTop) sc.scrollTop = top;
    else if (bottom > sc.scrollTop + sc.clientHeight) sc.scrollTop = bottom - sc.clientHeight;
  }
}

function focusName(id, selectAll = false) {
  const el = ganttEl.querySelector(`.g-row[data-id="${CSS.escape(id)}"] [data-f="name"]`);
  if (!el) return;
  el.focus();
  if (selectAll) el.select();
}

// --- Actions sur les tâches ------------------------------------------------------

function addTask(type = 'task') {
  let id = null;
  store.update((p) => {
    const sel = p.tasks.find((t) => t.id === selectedId);
    const t = newTask({
      name: type === 'milestone' ? 'Nouveau jalon' : 'Nouvelle tâche',
      type,
      duration: type === 'milestone' ? 0 : 1,
      parent: sel ? sel.parent : null,
      where: sel && !hasChildren(p, sel.id) ? sel.where : 'school',
    });
    const order = flatten(p).map((r) => r.task);
    if (sel) {
      let i = order.indexOf(sel);
      while (i + 1 < order.length && isDescendant(p, order[i + 1].id, sel.id)) i++;
      order.splice(i + 1, 0, t);
    } else order.push(t);
    p.tasks = order;
    id = t.id;
    selectedId = id;
  });
  if (id) { select(id); focusName(id, true); }
}

function withSelected(fn) {
  const t = selectedTask();
  if (!t) { toast('Sélectionnez d’abord une tâche.'); return; }
  fn(t);
}

const actions = {
  'add-task': () => addTask('task'),
  'add-milestone': () => addTask('milestone'),
  indent: () => withSelected((t) => { if (!store.update((p) => indentTask(p, t.id))) toast('Impossible : il faut une tâche juste au-dessus, au même niveau.'); }),
  outdent: () => withSelected((t) => { store.update((p) => outdentTask(p, t.id)); }),
  'move-up': () => withSelected((t) => store.update((p) => moveTask(p, t.id, -1))),
  'move-down': () => withSelected((t) => store.update((p) => moveTask(p, t.id, 1))),
  edit: () => withSelected((t) => openTaskDialog(t.id)),
  delete: () => withSelected(async (t) => {
    const order = flatten(store.project, { includeCollapsed: false }).map((r) => r.task.id);
    const i = order.indexOf(t.id);
    if (await deleteTasks([t.id])) {
      const rest = flatten(store.project, { includeCollapsed: false }).map((r) => r.task.id);
      select(rest[Math.min(i, rest.length - 1)] || null);
    }
  }),
  undo: () => store.undo(),
  redo: () => store.redo(),
  today: () => scrollToDay(today()),
  calendar: () => openCalendarDialog({
    calendar: store.project.calendar,
    projectStart: store.project.project.start,
    models: config.models,
    onApply: (cal) => { store.update((p) => { p.calendar = cal; }); toast('Calendrier appliqué : les dates ont été recalculées.'); },
  }),
  resources: () => openResourcesDialog(),
  'baseline-set': async () => {
    if (!store.project.tasks.length) return toast('Ajoutez d’abord des tâches.');
    if (store.project.baseline && !(await confirmDialog('Remplacer la planification « prévue » enregistrée précédemment par la planification actuelle ?', { ok: 'Remplacer' }))) return;
    const s = store.schedule;
    store.update((p) => {
      const tasks = {};
      for (const t of p.tasks) {
        const it = s.items.get(t.id);
        tasks[t.id] = { start: formatSlot(it.start), end: formatSlot(it.milestone ? it.start : it.end), milestone: it.milestone, atEnd: !!it.atEnd };
      }
      p.baseline = { date: toISO(today()), tasks };
      p.view.showBaseline = true;
    });
    toast('Planification figée comme « prévu » : les écarts apparaissent en gris sous les barres.');
  },
  'baseline-toggle': () => store.setView({ showBaseline: store.project.view.showBaseline === false }),
  'baseline-clear': async () => {
    if (await confirmDialog('Supprimer la planification de référence (prévu) ?', { ok: 'Supprimer', danger: true })) {
      store.update((p) => { p.baseline = null; });
    }
  },
  new: () => confirmDiscard().then((ok) => ok && openNewProjectDialog({
    models: config.models,
    onCreate: (proj) => { store.load(proj, { isDirty: true }); selectedId = null; scrollToStart = true; render(); toast('Projet créé. Ajoutez vos tâches !'); },
  })),
  open: () => openFile(),
  save: () => saveFile(),
  example: () => openExample(),
  'export-json': () => saveFile(),
  'import-gan': () => importGan(),
  'export-ics': () => openIcalDialog({ onDownload: (o) => exportICS(store.project, store.schedule, o) }),
  'export-csv': () => { exportCSV(store.project, store.schedule); },
  'export-png': () => openExportDialog('png', (o) => exportPNG(store.project, store.schedule, o)),
  'export-pdf': () => openExportDialog('pdf', (o) => exportPDF(store.project, store.schedule, o)),
  theme: () => toggleTheme(),
  help: () => openHelpDialog(config),
  project: () => openProjectDialog(),
};

function scrollToDay(day) {
  const sc = ganttEl.querySelector('.g-scroll');
  if (!sc || !layout) return;
  if (day < layout.startDay || day > layout.endDay) { toast('Cette date est en dehors de la période du projet.'); return; }
  sc.scrollTo({ left: Math.max(0, layout.x(day * 2) - (sc.clientWidth - tableW) / 3), behavior: 'smooth' });
}

// --- Fichiers ------------------------------------------------------------------------

async function confirmDiscard() {
  if (!store.dirty || !store.project.tasks.length) return true;
  return confirmDialog('Le projet actuel contient des modifications non enregistrées. Continuer quand même ?<br><span class="muted">Astuce : Fichier → Enregistrer (Ctrl+S) pour garder votre travail.</span>', { ok: 'Continuer', danger: true });
}

function loadData(data, name) {
  try {
    store.load(data, { name });
    selectedId = null;
    scrollToStart = true;
    render();
    toast(`« ${store.project.project.name} » ouvert.`);
  } catch (err) {
    toast(err.message || 'Fichier illisible.', { error: true });
  }
}

async function openFile() {
  if (!(await confirmDiscard())) return;
  const f = await pickJSONFile();
  if (f) loadData(f.data, f.name);
}

async function openExample() {
  if (!(await confirmDiscard())) return;
  try {
    const res = await fetch(config.example, { cache: 'no-cache' });
    const data = await res.json();
    store.load(data, { isDirty: false });
    selectedId = null;
    scrollToStart = true;
    render();
    toast('Projet d’exemple ouvert. Enregistrez-le sous votre nom pour le modifier.');
  } catch { toast('Impossible de charger l’exemple.', { error: true }); }
}

async function importGan(file = null) {
  if (!(await confirmDiscard())) return;
  const f = file || await pickTextFile('.gan,.xml');
  if (!f) return;
  openGanImportDialog({
    fileName: f.name,
    text: f.text,
    models: config.models,
    onImport: (proj) => {
      store.load(proj, { isDirty: true });
      selectedId = null;
      scrollToStart = true;
      render();
      toast(`Projet GanttProject importé : ${proj.tasks.length} élément(s). Pensez à l’enregistrer au format K-Gantt (Ctrl+S).`);
    },
  });
}

function saveFile() {
  const name = exportJSON(store.project, store.schedule);
  store.markSaved(name);
  toast(`Fichier « ${name} » téléchargé. Gardez-le précieusement : c’est votre sauvegarde.`);
}

// Glisser-déposer d'un fichier sur la page
let dragDepth = 0;
const overlay = document.getElementById('drop-overlay');
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; overlay.hidden = false; } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) overlay.hidden = true; });
window.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  overlay.hidden = true;
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  if (/\.(gan|xml)$/i.test(f.name)) {
    importGan({ name: f.name, text: await readFileAsText(f) });
    return;
  }
  if (!(await confirmDiscard())) return;
  try { loadData(JSON.parse(await readFileAsText(f)), f.name); } catch { toast('Ce fichier n’est pas un JSON valide.', { error: true }); }
});

window.addEventListener('beforeunload', (e) => {
  if (store.dirty && store.project.tasks.length) { e.preventDefault(); e.returnValue = ''; }
});

// --- Thème ---------------------------------------------------------------------------

function effectiveTheme() {
  const t = document.documentElement.dataset.theme;
  if (t) return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function toggleTheme() {
  const t = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('kgantt:theme', t); } catch { /* */ }
  renderToolbar();
}

// --- Évènements : barre d'outils et menus ------------------------------------------

document.addEventListener('click', (e) => {
  const toggle = e.target.closest('[data-menu-toggle]');
  document.querySelectorAll('.menu.is-open').forEach((m) => { if (!m.contains(toggle)) m.classList.remove('is-open'); });
  if (toggle) { toggle.closest('[data-menu]').classList.toggle('is-open'); return; }

  const a = e.target.closest('[data-action]');
  if (a && !a.disabled && actions[a.dataset.action]) {
    a.closest('.menu')?.classList.remove('is-open');
    actions[a.dataset.action]();
    return;
  }
  const z = e.target.closest('[data-zoom]');
  if (z) store.setView({ zoom: z.dataset.zoom });
});
document.getElementById('project-title').addEventListener('click', () => openProjectDialog());

// --- Évènements : tableau -------------------------------------------------------------

function commitField(id, field, raw) {
  const half = store.project.project.halfDays;
  store.update((p) => {
    const t = p.tasks.find((x) => x.id === id);
    if (!t) return false;
    if (field === 'name') {
      const v = String(raw).trim();
      if (!v) return false;
      t.name = v;
    } else if (field === 'duration') {
      const n = parseFloat(String(raw).replace(',', '.'));
      if (!Number.isFinite(n)) return false;
      const step = half ? 2 : 1;
      t.duration = Math.max(1 / step, Math.round(n * step) / step);
    } else if (field === 'where') {
      t.where = WHERE[raw] ? raw : 'school';
    } else if (field === 'progress') {
      const v = Math.max(0, Math.min(100, Math.round(+raw || 0)));
      if (v === t.progress) return false;
      t.progress = v;
      logProgress(t, v);
    }
  });
  // La valeur peut avoir été corrigée (arrondi, nom vide…) : on réaffiche.
  renderGantt();
}

ganttEl.addEventListener('change', (e) => {
  const input = e.target.closest('[data-f]');
  const row = e.target.closest('.g-row');
  // Différé : laisse le focus atteindre le champ suivant (Tab) avant de redessiner,
  // pour qu'il soit restauré après le rendu.
  if (input && row) setTimeout(() => commitField(row.dataset.id, input.dataset.f, input.value), 0);
});

ganttEl.addEventListener('focusin', (e) => {
  const row = e.target.closest('.g-row');
  if (row && row.dataset.id !== selectedId) select(row.dataset.id, { scroll: false });
});

ganttEl.addEventListener('keydown', (e) => {
  const input = e.target.closest('.g-row [data-f]');
  if (!input) return;
  const row = input.closest('.g-row');
  const ids = layout.rows.map((r) => r.task.id);
  const i = ids.indexOf(row.dataset.id);
  if (e.key === 'Escape') {
    input.value = input.defaultValue;
    input.blur();
    e.stopPropagation();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const field = input.dataset.f;
    const val = input.value;
    if (input.value !== input.defaultValue) commitField(row.dataset.id, field, val);
    if (field === 'name') {
      // Entrée sur le nom : passer à la ligne suivante, ou en créer une nouvelle.
      if (i + 1 < ids.length) { select(ids[i + 1]); focusName(ids[i + 1], true); } else { select(ids[i]); addTask('task'); }
    } else {
      ganttEl.querySelector(`.g-row[data-id="${CSS.escape(row.dataset.id)}"] [data-f="${field}"]`)?.blur();
    }
  } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && input.dataset.f === 'name' && !e.altKey) {
    e.preventDefault();
    const j = i + (e.key === 'ArrowDown' ? 1 : -1);
    if (ids[j]) {
      if (input.value !== input.defaultValue) commitField(row.dataset.id, 'name', input.value);
      select(ids[j]);
      focusName(ids[j], true);
    }
  }
});

ganttEl.addEventListener('click', (e) => {
  const row = e.target.closest('.g-row');
  if (!row) return;
  const id = row.dataset.id;
  if (e.target.closest('[data-toggle]')) {
    store.update((p) => { const t = p.tasks.find((x) => x.id === id); t.collapsed = !t.collapsed; }, { history: false });
    return;
  }
  select(id, { scroll: false });
  if (e.target.closest('[data-open]')) openTaskDialog(id);
});

ganttEl.addEventListener('dblclick', (e) => {
  const row = e.target.closest('.g-row');
  if (row && !e.target.closest('input, select, button')) openTaskDialog(row.dataset.id);
  const g = e.target.closest('.g-svg-body .g-task');
  if (g) openTaskDialog(g.dataset.id);
});

// Élargir / réduire le tableau
ganttEl.addEventListener('pointerdown', (e) => {
  const sp = e.target.closest('.g-splitter');
  if (!sp) return;
  e.preventDefault();
  sp.classList.add('is-active');
  const x0 = e.clientX, w0 = tableW;
  const move = (ev) => {
    tableW = Math.max(280, Math.min(1000, w0 + ev.clientX - x0));
    ganttEl.style.setProperty('--table-w', `${tableW}px`);
    ganttEl.querySelector('.g-canvas').style.width = `${tableW + layout.width}px`;
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    sp.classList.remove('is-active');
    try { localStorage.setItem('kgantt:tableW', String(tableW)); } catch { /* */ }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
});

// --- Évènements : diagramme (glisser, redimensionner, lier) ----------------------

let drag = null;
let tip = null;

function showTip(text, x, y) {
  if (!tip) { tip = document.createElement('div'); tip.className = 'drag-tip'; document.body.appendChild(tip); }
  tip.textContent = text;
  tip.style.left = `${x + 14}px`;
  tip.style.top = `${y + 16}px`;
}
function hideTip() { tip?.remove(); tip = null; }

function svgPoint(svg, e) {
  const r = svg.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function slotLabelShort(slot) {
  const half = store.project.project.halfDays;
  return `${formatLongFR(dayOfSlot(slot))}${half ? (halfOfSlot(slot) ? ' (après-midi)' : ' (matin)') : ''}`;
}

ganttEl.addEventListener('pointerdown', (e) => {
  const svg = e.target.closest('.g-svg-body');
  if (!svg || e.button !== 0) return;
  const g = e.target.closest('.g-task');
  const role = e.target.dataset?.role;
  const p = svgPoint(svg, e);

  if (!g) {
    // Clic dans une zone vide : sélection de la ligne
    if (role === 'dep') return;
    const row = layout.rows[Math.floor(p.y / ROW_H)];
    select(row ? row.task.id : null, { scroll: false });
    return;
  }
  const id = g.dataset.id;
  const it = store.schedule.items.get(id);
  select(id, { scroll: false });
  if (it.summary && role !== 'link') return;

  if (role === 'link') {
    e.preventDefault();
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'dep-temp');
    svg.appendChild(path);
    svg.classList.add('is-linking');
    drag = { kind: 'link', id, svg, path, x0: p.x, y0: p.y, target: null };
  } else if (role === 'resize') {
    e.preventDefault();
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'drag-preview');
    const row = layout.rows.find((r) => r.task.id === id);
    rect.setAttribute('y', row.y + 6);
    rect.setAttribute('height', ROW_H - 12);
    rect.setAttribute('rx', 4);
    rect.setAttribute('x', layout.x(it.start));
    svg.appendChild(rect);
    drag = { kind: 'resize', id, svg, rect, it, duration: null };
  } else if (role === 'bar') {
    const origin = it.milestone && it.atEnd ? it.start + 1 : it.start;
    drag = { kind: 'move', id, svg, g, it, origin, x0: p.x, moved: false, slot: origin };
  } else return;
  svg.setPointerCapture(e.pointerId);
});

ganttEl.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = svgPoint(drag.svg, e);
  const half = store.project.project.halfDays;
  const snap = (slot) => (half ? slot : slot - (slot % 2));

  if (drag.kind === 'move') {
    const dx = p.x - drag.x0;
    if (!drag.moved && Math.abs(dx) < 4) return;
    drag.moved = true;
    drag.svg.classList.add('is-dragging');
    const slot = snap(drag.origin + Math.round(dx / (layout.dayW / 2)));
    drag.slot = slot;
    drag.g.setAttribute('transform', `translate(${layout.x(slot) - layout.x(drag.origin)} 0)`);
    showTip(`Début souhaité : ${slotLabelShort(slot)}`, e.clientX, e.clientY);
  } else if (drag.kind === 'resize') {
    const t = store.project.tasks.find((x) => x.id === drag.id);
    let end = layout.slotAt(p.x);
    if (!half) end = end - (end % 2) + 1;
    end = Math.max(end, drag.it.start + (half ? 0 : 1));
    const min = half ? 0.5 : 1;
    drag.duration = Math.max(min, durationBetween(store.schedule.resolver, t.where, drag.it.start, end));
    drag.rect.setAttribute('width', Math.max(4, layout.x(end + 1) - layout.x(drag.it.start)));
    showTip(`Durée : ${String(drag.duration).replace('.', ',')} jour${drag.duration > 1 ? 's' : ''} (${WHERE[t.where].label.toLowerCase()})`, e.clientX, e.clientY);
  } else if (drag.kind === 'link') {
    drag.path.setAttribute('d', `M${drag.x0} ${drag.y0}L${p.x} ${p.y}`);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tg = el?.closest?.('.g-svg-body .g-task');
    if (drag.target && drag.target !== tg) drag.target.classList.remove('is-drop-target');
    drag.target = tg && tg.dataset.id !== drag.id ? tg : null;
    drag.target?.classList.add('is-drop-target');
    const name = drag.target ? store.project.tasks.find((t) => t.id === drag.target.dataset.id)?.name : null;
    showTip(name ? `« ${name} » attendra la fin de cette tâche` : 'Relâcher sur la tâche qui doit attendre', e.clientX, e.clientY);
  }
});

ganttEl.addEventListener('pointerup', () => {
  if (!drag) return;
  const d = drag;
  drag = null;
  hideTip();
  d.svg.classList.remove('is-dragging', 'is-linking');

  if (d.kind === 'move') {
    if (!d.moved) return;
    const slot = d.slot;
    store.update((p) => { const t = p.tasks.find((x) => x.id === d.id); t.notBefore = formatSlot(slot); });
    const it = store.schedule.items.get(d.id);
    const start = it && (it.milestone && it.atEnd ? it.start + 1 : it.start);
    if (start != null && start !== slot) {
      toast(`Début ajusté au ${slotLabelShort(start)} : premier créneau possible (calendrier ou tâches à attendre).`);
    }
  } else if (d.kind === 'resize') {
    d.rect.remove();
    if (d.duration != null) store.update((p) => { const t = p.tasks.find((x) => x.id === d.id); t.duration = d.duration; });
  } else if (d.kind === 'link') {
    d.path.remove();
    d.target?.classList.remove('is-drop-target');
    if (!d.target) return;
    const to = d.target.dataset.id;
    const project = store.project;
    const target = project.tasks.find((t) => t.id === to);
    if (target.deps.includes(d.id)) return toast('Ce lien existe déjà.');
    if (wouldCreateCycle(project, d.id, to)) return toast('Lien impossible : il créerait une boucle (ou relie une tâche à son groupe).', { error: true });
    store.update((p) => { p.tasks.find((t) => t.id === to).deps.push(d.id); });
    toast(`« ${target.name} » commencera après « ${project.tasks.find((t) => t.id === d.id).name} ».`);
  }
});

ganttEl.addEventListener('click', async (e) => {
  const dep = e.target.closest('[data-role="dep"]');
  if (!dep) return;
  const { from, to } = dep.dataset;
  const tasks = store.project.tasks;
  const a = tasks.find((t) => t.id === from)?.name, b = tasks.find((t) => t.id === to)?.name;
  if (await confirmDialog(`Supprimer le lien « ${esc(a)} » → « ${esc(b)} » ?`, { ok: 'Supprimer', danger: true })) {
    store.update((p) => { const t = p.tasks.find((x) => x.id === to); t.deps = t.deps.filter((x) => x !== from); });
  }
});

// --- Clavier ---------------------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  const mod = e.ctrlKey || e.metaKey;
  const editing = e.target.closest?.('input, select, textarea');

  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(); return; }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openFile(); return; }
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && !editing) { e.preventDefault(); store.undo(); return; }
  if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) && !editing) { e.preventDefault(); store.redo(); return; }

  if (e.altKey && ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
    const keep = captureFocus();
    if (e.key === 'ArrowRight') actions.indent();
    if (e.key === 'ArrowLeft') actions.outdent();
    if (e.key === 'ArrowUp') actions['move-up']();
    if (e.key === 'ArrowDown') actions['move-down']();
    restoreFocus(keep);
    return;
  }
  if (editing) return;

  const ids = layout?.rows.map((r) => r.task.id) || [];
  const i = ids.indexOf(selectedId);
  if (e.key === 'Insert' || (mod && e.key === 'Enter')) { e.preventDefault(); addTask('task'); }
  else if (e.key === 'Delete' && selectedId) { e.preventDefault(); actions.delete(); }
  else if (e.key === 'Enter' && selectedId) { e.preventDefault(); openTaskDialog(selectedId); }
  else if (e.key === 'F2' && selectedId) { e.preventDefault(); focusName(selectedId, true); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); select(ids[Math.min(ids.length - 1, i + 1)] ?? ids[0]); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); select(ids[Math.max(0, i - 1)] ?? ids[0]); }
  else if (e.key === 'Escape') select(null);
});

window.addEventListener('resize', () => renderGantt());
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => renderToolbar());

// --- Démarrage -------------------------------------------------------------------------

store.subscribe(render);

const draft = store.readDraft();
if (draft) {
  try {
    store.load(draft.project, { name: draft.fileName, isDirty: !!draft.dirty });
    if (draft.project.tasks?.length) toast('Votre dernier travail a été restauré depuis ce navigateur.');
  } catch {
    store.clearDraft();
    store.load(defaultProject());
  }
} else {
  render();
}
