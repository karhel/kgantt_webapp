// Fenêtres : tâche, projet, ressources, nouveau projet, export, aide.

import { store } from './store.js';
import { PALETTE, flatten, wouldCreateCycle, hasChildren, uid, defaultProject, removeTask } from './project.js';
import { WHERE, normalizeCalendar, defaultCalendar } from './calendar.js';
import { slotLabel, parseSlot, formatSlot, toISO, toDay, today, formatFR, dayOfSlot } from './dates.js';
import { STATUS_LABELS } from './scheduler.js';
import { openModal, esc, toast, confirmDialog } from './ui.js';
import { icon } from './icons.js';
import { ZOOMS } from './gantt.js';
import { importGanttProject } from './ganttproject.js';

const num = (v) => String(v).replace('.', ',');

/** Ajoute ou met à jour l'entrée du jour dans le journal d'avancement. */
export function logProgress(task, progress, note = '') {
  const date = toISO(today());
  const last = task.log[task.log.length - 1];
  if (last && last.date === date) {
    last.progress = progress;
    if (note) last.note = last.note ? `${last.note} — ${note}` : note;
  } else {
    task.log.push({ date, progress, note });
  }
}

// --- Tâche ----------------------------------------------------------------------

export function openTaskDialog(taskId) {
  const project = store.project;
  const sched = store.schedule;
  const t0 = project.tasks.find((t) => t.id === taskId);
  if (!t0) return;
  const t = structuredClone(t0);
  const it = sched.items.get(t.id);
  const isSummary = hasChildren(project, t.id);
  const half = project.project.halfDays;
  const rows = flatten(project);
  const base = project.baseline?.tasks?.[t.id];

  const depRows = rows.filter((r) => r.task.id !== t.id).map((r) => {
    const blocked = !t.deps.includes(r.task.id) && wouldCreateCycle(project, r.task.id, t.id);
    return `<label class="${blocked ? 'is-disabled' : ''}" title="${blocked ? 'Lien impossible (boucle ou tâche parente / enfant)' : ''}">
      <input type="checkbox" value="${esc(r.task.id)}" ${t.deps.includes(r.task.id) ? 'checked' : ''} ${blocked ? 'disabled' : ''}>
      <span class="wbs">${r.wbs}</span><span style="padding-left:${r.depth * 12}px">${esc(r.task.name)}</span></label>`;
  }).join('') || '<p class="muted" style="margin:6px">Aucune autre tâche.</p>';

  const resChips = project.resources.map((r) => `<label class="chip"><input type="checkbox" value="${esc(r.id)}" ${t.resources.includes(r.id) ? 'checked' : ''}><i style="background:${esc(r.color)}"></i>${esc(r.name)}</label>`).join('')
    || '<span class="muted">Aucune ressource. Ajoutez les membres de l’équipe avec le bouton « Ressources ».</span>';

  const nb = parseSlot(t.notBefore);
  const whereCards = Object.entries(WHERE).map(([k, w]) => `<label><input type="radio" name="where" value="${k}" ${t.where === k ? 'checked' : ''}><span>${w.label}</span><small>${k === 'school' ? 'compte les jours de cours' : k === 'company' ? 'compte les jours en entreprise' : 'école et entreprise'}</small></label>`).join('');

  const m = openModal({
    title: isSummary ? 'Groupe de tâches' : t.type === 'milestone' ? 'Jalon' : 'Tâche',
    body: `
      <div class="form-grid">
        <div class="field full"><label for="t-name">Nom</label><input type="text" id="t-name" value="${esc(t.name)}" autofocus></div>
        <div class="info-box">
          <span>Début : <b>${slotLabel(it.start, half)}</b></span>
          <span>Fin : <b>${slotLabel(it.milestone ? it.start : it.end, half)}</b></span>
          ${!it.milestone ? `<span>Durée : <b>${num(it.summary ? it.span : it.n / 2)} j</b></span>` : ''}
          <span>État : <b>${STATUS_LABELS[it.status]}</b> (attendu aujourd’hui : ${it.expected} %)</span>
          ${base ? `<span>Prévu : <b>${slotLabel(parseSlot(base.start), half)} → ${slotLabel(parseSlot(base.end), half)}</b></span>` : ''}
          ${it.error ? `<span class="g-err">⚠ ${esc(it.error)}</span>` : ''}
        </div>
        ${isSummary ? '<p class="full muted" style="margin:0">Les dates, la durée et l’avancement d’un groupe sont calculés à partir de ses sous-tâches.</p>' : `
        <div class="field full"><span class="label">Type</span>
          <div class="radio-cards two">
            <label><input type="radio" name="type" value="task" ${t.type !== 'milestone' ? 'checked' : ''}><span>Tâche</span><small>un travail qui dure</small></label>
            <label><input type="radio" name="type" value="milestone" ${t.type === 'milestone' ? 'checked' : ''}><span>Jalon</span><small>une échéance : rendu, soutenance…</small></label>
          </div>
        </div>
        <div class="field" data-for="task"><label for="t-duration">Durée (jours de présence)</label>
          <input type="number" id="t-duration" min="${half ? 0.5 : 1}" step="${half ? 0.5 : 1}" value="${t.duration}">
          <span class="hint">Seuls les jours correspondant au lieu sont comptés.</span></div>
        <div class="field"><label for="t-nb">Ne pas commencer avant</label>
          <div class="inline">
            <input type="date" id="t-nb" value="${nb != null ? toISO(dayOfSlot(nb)) : ''}">
            ${half ? `<select id="t-nb-half" style="flex:none;width:110px"><option value="0">matin</option><option value="1" ${nb != null && nb % 2 ? 'selected' : ''}>après-midi</option></select>` : ''}
            <button class="btn btn-icon btn-ghost" type="button" id="t-nb-clear" title="Effacer">${icon('x', 16)}</button>
          </div>
          <span class="hint">Sinon, la tâche démarre dès que possible.</span></div>
        <div class="field full" data-for="task"><span class="label">Où se fait cette tâche ?</span><div class="radio-cards">${whereCards}</div></div>
        <div class="section-title">Avancement</div>
        <div class="field full">
          <div class="progress-input">
            <input type="range" id="t-progress-range" min="0" max="100" step="5" value="${t.progress}">
            <input type="number" id="t-progress" min="0" max="100" step="5" value="${t.progress}"><span>%</span>
          </div>
          <input type="text" id="t-log-note" placeholder="Note pour le journal de bord (facultatif) : ce qui a été fait, difficultés…" style="height:36px;padding:0 10px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);background:var(--surface);margin-top:6px">
        </div>
        <div class="field full"><span class="label">Journal d’avancement</span><ul class="log-list" id="t-log"></ul></div>`}
        <div class="section-title">Organisation</div>
        <div class="field full"><span class="label">Ressources (qui fait la tâche ?)</span><div class="chips" id="t-res">${resChips}</div></div>
        <div class="field full"><span class="label">Doit attendre la fin de…</span><div class="dep-list" id="t-deps">${depRows}</div></div>
        <div class="field full"><span class="label">Couleur</span><div class="swatches" id="t-color">
          ${PALETTE.map((c) => `<button type="button" style="background:${c}" data-color="${c}" class="${(t.color || PALETTE[0]) === c ? 'is-active' : ''}" title="${c}"></button>`).join('')}
        </div></div>
        <div class="field full"><label for="t-notes">Notes</label><textarea id="t-notes" rows="3">${esc(t.notes)}</textarea></div>
      </div>`,
    foot: `<button class="btn btn-danger" type="button" id="t-delete">${icon('trash')} Supprimer</button>
      <span class="spacer"></span>
      <button class="btn" type="button" data-close="cancel">Annuler</button>
      <button class="btn btn-primary" type="button" id="t-save">Enregistrer</button>`,
  });
  const { $, $$ } = m;

  const renderLog = () => {
    const ul = $('#t-log');
    if (!ul) return;
    ul.innerHTML = t.log.length ? [...t.log].map((e, i) => ({ e, i })).reverse().map(({ e, i }) =>
      `<li><span>${formatFR(toDay(e.date))}</span><b>${e.progress} %</b><span class="${e.note ? '' : 'muted'}">${esc(e.note || '—')}</span>
       <button type="button" data-log-del="${i}" title="Supprimer l’entrée">${icon('x', 14)}</button></li>`).join('')
      : '<li><span class="muted" style="grid-column:1/-1">Pas encore d’entrée. Chaque mise à jour de l’avancement est datée ici.</span></li>';
  };
  renderLog();

  const syncType = () => {
    const ms = $('input[name="type"]:checked')?.value === 'milestone';
    $$('[data-for="task"]').forEach((el) => { el.hidden = ms; });
  };
  syncType();
  $$('input[name="type"]').forEach((r) => r.addEventListener('change', syncType));

  const range = $('#t-progress-range'), pnum = $('#t-progress');
  range?.addEventListener('input', () => { pnum.value = range.value; });
  pnum?.addEventListener('input', () => { range.value = pnum.value; });
  $('#t-nb-clear')?.addEventListener('click', () => { $('#t-nb').value = ''; });
  $('#t-color').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    $$('#t-color button').forEach((x) => x.classList.toggle('is-active', x === b));
  });
  $('#t-log')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-log-del]');
    if (b) { t.log.splice(+b.dataset.logDel, 1); renderLog(); }
  });

  $('#t-delete').addEventListener('click', async () => {
    m.close('delete');
    await deleteTasks([t.id]);
  });

  const save = () => {
    const name = $('#t-name').value.trim() || 'Sans nom';
    const deps = $$('#t-deps input:checked').map((i) => i.value);
    const resources = $$('#t-res input:checked').map((i) => i.value);
    const color = $('#t-color .is-active')?.dataset.color || null;
    store.update((p) => {
      const task = p.tasks.find((x) => x.id === t.id);
      if (!task) return false;
      task.name = name;
      task.deps = deps.filter((d) => task.deps.includes(d) || !wouldCreateCycle(p, d, task.id));
      task.resources = resources;
      task.color = color === PALETTE[0] ? null : color;
      task.notes = $('#t-notes').value;
      task.log = t.log;
      if (!isSummary) {
        task.type = $('input[name="type"]:checked').value;
        const dur = Math.max(half ? 0.5 : 1, Math.round(parseFloat(String($('#t-duration').value).replace(',', '.')) * (half ? 2 : 1) || 0) / (half ? 2 : 1));
        task.duration = Number.isFinite(dur) ? dur : 1;
        task.where = $('input[name="where"]:checked')?.value || 'school';
        const d = toDay($('#t-nb').value);
        task.notBefore = d == null ? null : formatSlot(d * 2 + (half ? +($('#t-nb-half')?.value || 0) : 0));
        const prog = Math.max(0, Math.min(100, Math.round(+pnum.value || 0)));
        const note = $('#t-log-note').value.trim();
        if (prog !== task.progress || note) logProgress(task, prog, note);
        task.progress = prog;
      }
    });
    m.close('save');
  };
  $('#t-save').addEventListener('click', save);
  m.dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
    if (e.key === 'Enter' && e.target.matches('input[type="text"], input[type="number"]')) { e.preventDefault(); save(); }
  });
}

/** Supprime des tâches (avec confirmation si elles ont des sous-tâches). */
export async function deleteTasks(ids) {
  const project = store.project;
  const withKids = ids.filter((id) => hasChildren(project, id));
  const names = ids.map((id) => project.tasks.find((t) => t.id === id)?.name).filter(Boolean);
  if (!names.length) return false;
  if (withKids.length && !(await confirmDialog(`Supprimer « ${esc(names.join(', '))} » et toutes ses sous-tâches ?`, { ok: 'Supprimer', danger: true }))) return false;
  store.update((p) => { for (const id of ids) removeTask(p, id); });
  toast(`${names.length > 1 ? 'Tâches supprimées' : 'Tâche supprimée'} (Ctrl+Z pour annuler).`);
  return true;
}

// --- Projet -------------------------------------------------------------------------

function projectFields(P) {
  return `
    <div class="field full"><label for="p-name">Nom du projet</label><input type="text" id="p-name" value="${esc(P.name)}" autofocus></div>
    <div class="field"><label for="p-team">Équipe / membres</label><input type="text" id="p-team" value="${esc(P.team)}" placeholder="ex. Groupe 3 — Léa, Tom, Inès"></div>
    <div class="field"><label for="p-class">Classe</label><input type="text" id="p-class" value="${esc(P.className)}" placeholder="ex. BTS SIO 1"></div>
    <div class="field"><label for="p-teacher">Enseignant·e référent·e</label><input type="text" id="p-teacher" value="${esc(P.teacher)}"></div>
    <div class="field"><label for="p-start">Date de début du projet</label><input type="date" id="p-start" value="${esc(P.start)}"></div>
    <div class="field full"><label for="p-desc">Description</label><textarea id="p-desc" rows="3">${esc(P.description)}</textarea></div>
    <div class="field full"><label class="check"><input type="checkbox" id="p-half" ${P.halfDays ? 'checked' : ''}> Autoriser les durées en demi-journées (0,5 jour)</label></div>`;
}

function readProjectFields($, P) {
  return {
    ...P,
    name: $('#p-name').value.trim() || 'Mon projet',
    team: $('#p-team').value.trim(),
    className: $('#p-class').value.trim(),
    teacher: $('#p-teacher').value.trim(),
    start: toDay($('#p-start').value) != null ? $('#p-start').value : P.start,
    description: $('#p-desc').value,
    halfDays: $('#p-half').checked,
  };
}

export function openProjectDialog() {
  const P = store.project.project;
  const m = openModal({
    title: 'Informations du projet',
    body: `<div class="form-grid">${projectFields(P)}</div>`,
    foot: `<span class="spacer"></span><button class="btn" type="button" data-close="cancel">Annuler</button>
      <button class="btn btn-primary" type="button" id="p-save">Enregistrer</button>`,
  });
  const save = () => {
    const next = readProjectFields(m.$, P);
    store.update((p) => {
      p.project = next;
      if (!next.halfDays) for (const t of p.tasks) if (t.duration % 1) t.duration = Math.ceil(t.duration);
    });
    m.close('save');
  };
  m.$('#p-save').addEventListener('click', save);
  m.dialog.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[type="text"]')) { e.preventDefault(); save(); } });
}

/** Nouveau projet : informations + choix du calendrier de départ. */
export function openNewProjectDialog({ models, onCreate }) {
  const P = defaultProject().project;
  const opts = models.map((md, i) => `<option value="${i}">${esc(md.name)}</option>`).join('');
  const m = openModal({
    title: 'Nouveau projet',
    body: `<div class="form-grid">${projectFields(P)}
      <div class="field full"><label for="p-cal">Calendrier de la classe</label>
        <select id="p-cal"><option value="">Temps plein école (lundi → vendredi)</option>${opts}<option value="current">Garder le calendrier du projet actuel</option></select>
        <span class="hint">Vous pourrez ensuite l’adapter (alternance, vacances…) avec le bouton « Calendrier ».</span></div></div>`,
    foot: `<span class="spacer"></span><button class="btn" type="button" data-close="cancel">Annuler</button>
      <button class="btn btn-primary" type="button" id="p-create">Créer le projet</button>`,
  });
  const create = async () => {
    const proj = defaultProject();
    proj.project = readProjectFields(m.$, P);
    const v = m.$('#p-cal').value;
    try {
      if (v === 'current') proj.calendar = normalizeCalendar(structuredClone(store.project.calendar));
      else if (v !== '') {
        const res = await fetch(models[+v].file, { cache: 'no-cache' });
        proj.calendar = normalizeCalendar(await res.json());
      } else proj.calendar = defaultCalendar();
    } catch {
      toast('Modèle de calendrier introuvable : calendrier par défaut utilisé.', { error: true });
    }
    m.close('create');
    onCreate(proj);
  };
  m.$('#p-create').addEventListener('click', create);
}

// --- Ressources -------------------------------------------------------------------

export function openResourcesDialog() {
  const project = store.project;
  let list = structuredClone(project.resources);
  const used = (id) => project.tasks.filter((t) => t.resources.includes(id)).length;

  const m = openModal({
    title: 'Ressources (membres de l’équipe)',
    body: `<p class="muted" style="margin:0 0 12px">Ajoutez les personnes de l’équipe pour indiquer qui réalise chaque tâche.</p>
      <table class="list-table"><thead><tr><th style="width:52px">Couleur</th><th>Nom</th><th style="width:90px">Tâches</th><th style="width:44px"></th></tr></thead><tbody id="r-list"></tbody></table>
      <button class="btn btn-sm" type="button" id="r-add" style="margin-top:10px">${icon('plus', 16)} Ajouter une personne</button>`,
    foot: `<span class="spacer"></span><button class="btn" type="button" data-close="cancel">Annuler</button>
      <button class="btn btn-primary" type="button" id="r-save">Enregistrer</button>`,
  });
  const render = () => {
    m.$('#r-list').innerHTML = list.map((r, i) => `<tr data-i="${i}">
      <td><input type="color" value="${esc(r.color)}" data-f="color"></td>
      <td><input type="text" value="${esc(r.name)}" data-f="name" placeholder="Prénom Nom"></td>
      <td class="muted">${used(r.id)}</td>
      <td><button class="btn btn-icon btn-ghost btn-sm" type="button" data-del="${i}" title="Supprimer">${icon('trash', 16)}</button></td></tr>`).join('')
      || '<tr><td colspan="4" class="muted" style="padding:10px 6px">Aucune ressource pour le moment.</td></tr>';
  };
  render();
  m.$('#r-add').addEventListener('click', () => {
    list.push({ id: uid('r'), name: '', color: PALETTE[list.length % PALETTE.length] });
    render();
    m.$$('#r-list input[type="text"]').pop()?.focus();
  });
  m.$('#r-list').addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-i]');
    if (tr) list[+tr.dataset.i][e.target.dataset.f] = e.target.value;
  });
  m.$('#r-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (b) { list.splice(+b.dataset.del, 1); render(); }
  });
  m.$('#r-save').addEventListener('click', () => {
    list = list.map((r) => ({ ...r, name: r.name.trim() })).filter((r) => r.name);
    const ids = new Set(list.map((r) => r.id));
    store.update((p) => {
      p.resources = list;
      for (const t of p.tasks) t.resources = t.resources.filter((r) => ids.has(r));
    });
    m.close('save');
  });
}

// --- Export PDF / PNG -------------------------------------------------------------

export function openExportDialog(kind, onExport) {
  const zoom = store.project.view.zoom || 'week';
  const zoomOpts = Object.entries(ZOOMS).map(([k, z]) => `<label><input type="radio" name="zoom" value="${k}" ${k === zoom ? 'checked' : ''}><span>${z.label}</span><small>${k === 'day' ? 'détaillé' : k === 'week' ? 'équilibré' : 'vue d’ensemble'}</small></label>`).join('');
  const m = openModal({
    title: kind === 'pdf' ? 'Exporter en PDF' : 'Exporter en image PNG',
    body: `<div class="form-grid">
      ${kind === 'pdf' ? `
      <div class="field"><span class="label">Format du papier (paysage)</span>
        <div class="radio-cards two"><label><input type="radio" name="paper" value="a4" checked><span>A4</span></label><label><input type="radio" name="paper" value="a3"><span>A3</span></label></div></div>
      <div class="field"><span class="label">Mise en page</span>
        <div class="radio-cards two"><label><input type="radio" name="fit" value="page" checked><span>Une page</span><small>tout réduire</small></label><label><input type="radio" name="fit" value="pages"><span>Plusieurs pages</span><small>taille réelle</small></label></div></div>` : ''}
      <div class="field full"><span class="label">Échelle de temps</span><div class="radio-cards">${zoomOpts}</div></div>
      <div class="field full">
        <label class="check"><input type="checkbox" id="x-expand" checked> Afficher toutes les sous-tâches (même repliées)</label>
        ${store.project.baseline ? '<label class="check"><input type="checkbox" id="x-baseline" checked> Afficher le prévu (référence)</label>' : ''}
      </div></div>`,
    foot: `<span class="spacer"></span><button class="btn" type="button" data-close="cancel">Annuler</button>
      <button class="btn btn-primary" type="button" id="x-go">${icon('download')} Exporter</button>`,
  });
  m.$('#x-go').addEventListener('click', async () => {
    const opts = {
      paper: m.$('input[name="paper"]:checked')?.value,
      fit: m.$('input[name="fit"]:checked')?.value,
      zoom: m.$('input[name="zoom"]:checked').value,
      expandAll: m.$('#x-expand').checked,
      showBaseline: m.$('#x-baseline')?.checked ?? false,
    };
    const btn = m.$('#x-go');
    btn.disabled = true;
    btn.textContent = 'Génération…';
    try {
      await onExport(opts);
      m.close('done');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Exporter';
      toast(err.message || 'Échec de l’export.', { error: true });
    }
  });
}

// --- Aide ----------------------------------------------------------------------------

export function openHelpDialog(version) {
  openModal({
    title: 'Aide — K-Gantt',
    wide: true,
    body: `<div class="help-grid">
      <div>
        <h3>1. Le calendrier de la classe</h3>
        <p>Commencez par <b>Calendrier</b> : indiquez les jours à l’école et en entreprise (à la demi-journée), l’alternance des semaines, les vacances et les stages. Un enseignant peut <b>partager ce modèle</b> sous forme de fichier .json.</p>
        <h3 style="margin-top:14px">2. Les tâches</h3>
        <ul>
          <li>La <b>durée</b> se compte en jours de présence : une tâche de 3 jours « École » dure 3 jours de cours, même s’ils sont répartis sur plusieurs semaines.</li>
          <li>Le <b>lieu</b> indique quels jours sont comptés : École, Entreprise ou Partout.</li>
          <li>Les <b>dépendances</b> (« doit attendre la fin de… ») décalent automatiquement les dates.</li>
          <li>Les <b>sous-tâches</b> (Alt+→) regroupent le travail ; le groupe calcule ses dates et son avancement.</li>
        </ul>
        <h3 style="margin-top:14px">3. Suivre l’avancement</h3>
        <p>Saisissez le % réalisé : chaque mise à jour est datée dans le <b>journal</b>. Une tâche est signalée <span style="color:var(--danger)">en retard</span> quand l’avancement est inférieur à ce qui était attendu à la date du jour. Le menu <b>Prévu / réel</b> fige la planification initiale pour la comparer à la réalité.</p>
      </div>
      <div>
        <h3>Dans le diagramme</h3>
        <ul>
          <li>Glisser une barre : choisir la date de début (« ne pas commencer avant »).</li>
          <li>Glisser le bord droit : changer la durée.</li>
          <li>Glisser le rond ○ en bout de barre vers une autre tâche : créer un lien.</li>
          <li>Cliquer sur un lien : le supprimer. Double-clic : modifier la tâche.</li>
        </ul>
        <h3 style="margin-top:14px">Raccourcis clavier</h3>
        <div class="shortcuts">
          <kbd>Inser</kbd><span>Ajouter une tâche après la sélection</span>
          <kbd>Entrée</kbd><span>Modifier la tâche sélectionnée</span>
          <kbd>Suppr</kbd><span>Supprimer la tâche sélectionnée</span>
          <kbd>↑ ↓</kbd><span>Changer de tâche</span>
          <kbd>Alt + → / ←</kbd><span>Sous-tâche / remonter d’un niveau</span>
          <kbd>Alt + ↑ / ↓</kbd><span>Déplacer la tâche</span>
          <kbd>Ctrl + Z / Y</kbd><span>Annuler / rétablir</span>
          <kbd>Ctrl + S</kbd><span>Enregistrer le fichier .json</span>
          <kbd>Ctrl + O</kbd><span>Ouvrir un fichier</span>
        </div>
        <h3 style="margin-top:14px">Vos données</h3>
        <h3 style="margin-top:14px">GanttProject et agendas</h3>
        <p><b>Fichier → Importer depuis GanttProject</b> reprend un projet .gan existant. <b>Exporter → Agenda iCal</b> ajoute les tâches à Google Agenda, Outlook ou Apple Calendrier, une fois ou par abonnement (mise à jour automatique).</p>
        <p>Rien n’est envoyé sur le serveur. Votre travail est enregistré dans un <b>fichier .json</b> que vous gardez (Fichier → Enregistrer). Un brouillon est aussi conservé dans ce navigateur en cas de fermeture accidentelle.</p>
        <p class="muted" style="margin-top:10px">K-Gantt version ${esc(version)}</p>
      </div></div>`,
    foot: '<span class="spacer"></span><button class="btn btn-primary" type="button" data-close="ok">Compris</button>',
  });
}

// --- Import GanttProject -----------------------------------------------------------------

export function openGanImportDialog({ fileName, text, models, onImport }) {
  let preview;
  try {
    preview = importGanttProject(text);
  } catch (err) {
    toast(err.message, { error: true });
    return;
  }
  const opts = models.map((md, i) => `<option value="${i}">${esc(md.name)}</option>`).join('');
  const st = preview.stats;
  const whereCards = Object.entries(WHERE).map(([k, w]) => `<label><input type="radio" name="g-where" value="${k}" ${k === 'any' ? 'checked' : ''}><span>${w.label}</span><small>${k === 'school' ? 'jours de cours uniquement' : k === 'company' ? 'jours en entreprise' : 'comme GanttProject (jours ouvrés)'}</small></label>`).join('');
  const m = openModal({
    title: 'Importer un projet GanttProject',
    body: `<div class="form-grid">
      <div class="info-box"><span>Fichier : <b>${esc(fileName)}</b></span><span>Projet : <b>${esc(preview.project.project.name)}</b></span>
        <span><b>${st.tasks}</b> tâche(s), <b>${st.milestones}</b> jalon(s), <b>${st.deps}</b> lien(s), <b>${st.resources}</b> ressource(s)</span></div>
      ${preview.warnings.length ? `<div class="full muted" style="font-size:13px"><b>À savoir :</b><ul style="margin:4px 0 0;padding-left:18px">${preview.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
      <div class="field full"><label for="g-cal">Calendrier du projet importé</label>
        <select id="g-cal"><option value="">Temps plein (lundi → vendredi), comme GanttProject</option>${opts}<option value="current">Calendrier du projet actuel</option></select>
        <span class="hint">GanttProject compte les jours ouvrés. Avec un calendrier d’alternance, les durées deviennent des jours de présence et les dates s’allongent.</span></div>
      <div class="field full"><span class="label">Lieu des tâches importées</span><div class="radio-cards">${whereCards}</div></div>
      <div class="field full"><label class="check"><input type="checkbox" id="g-keep" checked> Conserver les dates de début de GanttProject</label>
        <span class="hint">Chaque tâche reçoit une contrainte « ne pas commencer avant » sa date d’origine. Décochez pour laisser K-Gantt tout replanifier au plus tôt.</span></div>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" type="button" data-close="cancel">Annuler</button>
      <button class="btn btn-primary" type="button" id="g-go">${icon('upload')} Importer</button>`,
  });
  m.$('#g-go').addEventListener('click', async () => {
    const v = m.$('#g-cal').value;
    let calendar = null;
    try {
      if (v === 'current') calendar = store.project.calendar;
      else if (v !== '') calendar = await (await fetch(models[+v].file, { cache: 'no-cache' })).json();
    } catch {
      toast('Modèle de calendrier introuvable : calendrier temps plein utilisé.', { error: true });
    }
    try {
      const res = importGanttProject(text, {
        where: m.$('input[name="g-where"]:checked').value,
        keepDates: m.$('#g-keep').checked,
        calendar,
      });
      m.close('import');
      onImport(res.project);
    } catch (err) {
      toast(err.message, { error: true });
    }
  });
}

// --- Agenda iCal ---------------------------------------------------------------------------

export function openIcalDialog({ onDownload }) {
  const P = store.project.project;
  const base = new URL('ical.php', window.location.href).href;
  const m = openModal({
    title: 'Agenda iCal',
    wide: true,
    body: `<div class="form-grid">
      <div class="field full"><span class="label">Contenu de l’agenda</span>
        <div class="radio-cards two">
          <label><input type="radio" name="i-mode" value="runs" checked><span>Un évènement par période travaillée</span><small>idéal en alternance : seuls les jours où la tâche avance</small></label>
          <label><input type="radio" name="i-mode" value="span"><span>Un évènement par tâche</span><small>du début à la fin, sans interruption</small></label>
        </div>
        <label class="check" style="margin-top:6px"><input type="checkbox" id="i-groups"> Inclure les groupes de tâches</label>
      </div>

      <div class="section-title">1. Fichier à importer (une fois)</div>
      <div class="full inline">
        <span class="muted" style="flex:1">Téléchargez un fichier <b>.ics</b> et importez-le dans Google Agenda, Outlook ou Apple Calendrier. Pour le mettre à jour, importez à nouveau le fichier : les évènements gardent le même identifiant.</span>
        <button class="btn btn-primary" type="button" id="i-download">${icon('download')} Télécharger le .ics</button>
      </div>

      <div class="section-title">2. Synchronisation automatique (abonnement)</div>
      <ol class="full" style="margin:0;padding-left:20px;font-size:13px;display:grid;gap:4px">
        <li><b>Enregistrez</b> votre projet (Fichier → Enregistrer) puis déposez le fichier <b>.kgantt.json</b> sur un espace en ligne avec un <b>lien de partage public</b> : Nextcloud de l’établissement, Dropbox, Google Drive, GitHub…</li>
        <li>Collez ce lien ci-dessous et copiez l’<b>adresse d’abonnement</b>.</li>
        <li>Dans votre agenda : <i>Google Agenda</i> → Autres agendas → « À partir de l’URL » ; <i>Outlook</i> → Ajouter un calendrier → « S’abonner à partir du web » ; <i>Apple Calendrier</i> → Fichier → « Nouvel abonnement ».</li>
        <li>Ensuite, à chaque fois que vous remplacez le fichier en ligne, l’agenda se met à jour tout seul (de quelques minutes à quelques heures selon l’application).</li>
      </ol>
      <div class="field full"><label for="i-src">Lien public du fichier .kgantt.json</label>
        <input type="text" id="i-src" placeholder="https://cloud.mon-lycee.fr/s/AbCdEf…" value="${esc(P.shareUrl || '')}"></div>
      <div class="field full"><label for="i-sub">Adresse d’abonnement à copier dans l’agenda</label>
        <div class="inline">
          <input type="text" id="i-sub" readonly placeholder="Collez d’abord le lien de votre fichier">
          <button class="btn" type="button" id="i-copy">${icon('copy')} Copier</button>
          <a class="btn" id="i-webcal" href="#" title="Ouvrir directement dans l’application d’agenda de cet ordinateur">${icon('calendar')} Ouvrir</a>
          <button class="btn" type="button" id="i-test">${icon('check')} Tester</button>
        </div>
        <span class="hint" id="i-result">Le fichier est lu à chaque actualisation de l’agenda ; rien n’est conservé sur le serveur K-Gantt.</span></div>
    </div>`,
    foot: '<span class="spacer"></span><button class="btn" type="button" data-close="ok">Fermer</button>',
  });
  const { $ } = m;
  const opts = () => ({ mode: m.$('input[name="i-mode"]:checked').value, groups: $('#i-groups').checked });
  const subUrl = () => {
    const src = $('#i-src').value.trim();
    if (!/^https:\/\/\S+$/i.test(src)) return '';
    const o = opts();
    return `${base}?url=${encodeURIComponent(src)}${o.mode === 'span' ? '&mode=span' : ''}${o.groups ? '&groupes=1' : ''}`;
  };
  const refresh = () => {
    const u = subUrl();
    $('#i-sub').value = u;
    $('#i-webcal').href = u ? u.replace(/^https?:/, 'webcal:') : '#';
    for (const id of ['#i-copy', '#i-test']) $(id).disabled = !u;
    $('#i-webcal').style.pointerEvents = u ? '' : 'none';
    $('#i-webcal').style.opacity = u ? '' : '.45';
    const src = $('#i-src').value.trim();
    $('#i-result').textContent = src && !u ? 'Le lien doit commencer par https://' : 'Le fichier est lu à chaque actualisation de l’agenda ; rien n’est conservé sur le serveur K-Gantt.';
  };
  refresh();
  m.dialog.addEventListener('input', refresh);
  m.dialog.addEventListener('change', refresh);
  $('#i-src').addEventListener('change', () => {
    const v = $('#i-src').value.trim();
    if (v !== (store.project.project.shareUrl || '')) store.update((p) => { p.project.shareUrl = v; }, { history: false });
  });
  $('#i-download').addEventListener('click', () => onDownload(opts()));
  $('#i-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#i-sub').value); toast('Adresse d’abonnement copiée.'); }
    catch { $('#i-sub').select(); toast('Copiez l’adresse sélectionnée (Ctrl+C).'); }
  });
  $('#i-test').addEventListener('click', async () => {
    const out = $('#i-result');
    out.textContent = 'Test en cours…';
    out.style.color = '';
    try {
      const res = await fetch(subUrl(), { cache: 'no-store' });
      const body = await res.text();
      if (!res.ok) throw new Error(body || `Erreur ${res.status}`);
      const n = (body.match(/BEGIN:VEVENT/g) || []).length;
      out.textContent = `✓ L’abonnement fonctionne : ${n} évènement(s). Vérifiez que le fichier en ligne est bien votre dernière version.`;
      out.style.color = 'var(--success)';
    } catch (err) {
      out.textContent = `✗ ${err.message}`;
      out.style.color = 'var(--danger)';
    }
  });
}
