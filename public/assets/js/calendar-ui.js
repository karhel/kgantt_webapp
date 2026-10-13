// SPDX-License-Identifier: AGPL-3.0-or-later
// Fenêtre « Calendrier » : rythme école / entreprise, alternance, vacances, modèles partageables.

import { normalizeCalendar, createResolver, makeCycle, countDays, TYPE_LABELS, SCHOOL, COMPANY, OFF } from './calendar.js';
import { toDay, toISO, mondayOf, isoWeek, parts, fromParts, weekday, formatShortFR, MONTHS, WEEKDAYS, today } from './dates.js';
import { openModal, esc, toast, download, slugify, pickJSONFile, confirmDialog } from './ui.js';
import { icon } from './icons.js';

const CYCLE = [SCHOOL, COMPANY, OFF];
const next = (t) => CYCLE[(CYCLE.indexOf(t) + 1) % CYCLE.length];
const SHORT = { school: 'École', company: 'Entr.', off: 'Libre' };

/** Petites semaines types prêtes à l'emploi. */
const PRESETS = {
  'Lundi → vendredi': [1, 1, 1, 1, 1, 0, 0],
  'Lundi → mercredi': [1, 1, 1, 0, 0, 0, 0],
  'Lundi + mardi': [1, 1, 0, 0, 0, 0, 0],
  'Jeudi + vendredi': [0, 0, 0, 1, 1, 0, 0],
};

/**
 * @param {{ calendar, projectStart: string, models: Array, onApply: Function }} opts
 */
export function openCalendarDialog({ calendar, projectStart, models = [], onApply }) {
  let cal = normalizeCalendar(structuredClone(calendar));
  let gridStart = mondayOf(toDay(projectStart) ?? today());
  let brush = SCHOOL;

  const modelOptions = models.map((m, i) => `<option value="${i}">${esc(m.name)}</option>`).join('');

  const m = openModal({
    title: 'Calendrier du rythme école / entreprise',
    wide: true,
    body: `
      <div class="form-grid" style="margin-bottom:16px">
        <div class="field"><label for="cal-name">Nom du calendrier</label><input type="text" id="cal-name"></div>
        <div class="field"><label for="cal-model">Partir d’un modèle</label>
          <div class="inline">
            <select id="cal-model"><option value="">— Choisir un modèle —</option>${modelOptions}</select>
            <button class="btn" type="button" id="cal-import">${icon('upload')} Importer</button>
          </div>
        </div>
      </div>
      <div class="cal-layout">
        <div style="display:grid;gap:14px;align-content:start">
          <section class="cal-card">
            <h3 id="cal-h1">1. Semaines types</h3>
            <p>Chaque bouton est une demi-journée : il passe de <b>École</b> à <b>Entreprise</b> puis <b>Libre</b> à chaque clic. Le nom du jour change la journée entière.</p>
            <div id="tpl-school"></div>
            <div id="tpl-company"></div>
          </section>
          <section class="cal-card">
            <h3 id="cal-h2">2. Rythme des semaines</h3>
            <div class="radio-cards two" role="radiogroup" aria-labelledby="cal-h2">
              <label><input type="radio" name="rhythm" value="fixed"><span>Toujours la même semaine</span><small>ex. : lundi-mardi à l’école, le reste en entreprise</small></label>
              <label><input type="radio" name="rhythm" value="cycle"><span>Alternance de semaines</span><small>ex. : 1 semaine école / 2 semaines entreprise</small></label>
            </div>
            <div id="rhythm-fixed" class="inline">
              <label for="default-week">Toutes les semaines utilisent la</label>
              <select id="default-week"><option value="school">semaine type « École »</option><option value="company">semaine type « Entreprise »</option></select>
            </div>
            <div id="rhythm-cycle" class="inline" style="flex-wrap:wrap">
              <input type="number" id="cy-school" min="0" max="20" style="width:64px;flex:none" aria-label="Nombre de semaines à l’école"> <span aria-hidden="true">sem. école puis</span>
              <input type="number" id="cy-company" min="0" max="20" style="width:64px;flex:none" aria-label="Nombre de semaines en entreprise"> <span aria-hidden="true">sem. entreprise, à partir du</span>
              <input type="date" id="cy-anchor" style="flex:none;width:150px" aria-label="Date de départ du cycle">
            </div>
          </section>
          <section class="cal-card">
            <h3 id="cal-h3">3. Ajustements semaine par semaine</h3>
            <p>Choisissez un type, puis cliquez sur les semaines à modifier pour reproduire le calendrier d’alternance de l’établissement.</p>
            <div class="paint" id="brush" role="group" aria-label="Type à appliquer aux semaines">
              <span aria-hidden="true">Appliquer :</span>
              <button type="button" data-brush="school" class="slot-school" aria-pressed="false">École</button>
              <button type="button" data-brush="company" class="slot-company" aria-pressed="false">Entreprise</button>
              <button type="button" data-brush="off" class="slot-off" aria-pressed="false">Libre</button>
              <button type="button" data-brush="auto" aria-pressed="false">Selon le rythme</button>
              <span style="flex:1"></span>
              <button type="button" class="btn btn-sm btn-icon" id="wk-prev" aria-label="Semaines précédentes" title="Semaines précédentes">${icon('chevronLeft', 16)}</button>
              <button type="button" class="btn btn-sm btn-icon" id="wk-next" aria-label="Semaines suivantes" title="Semaines suivantes">${icon('chevronRight', 16)}</button>
            </div>
            <div class="weeks-grid" id="weeks-grid" role="group" aria-labelledby="cal-h3"></div>
          </section>
        </div>
        <div style="display:grid;gap:14px;align-content:start">
          <section class="cal-card">
            <h3 id="cal-h4">4. Vacances, stages et exceptions</h3>
            <div class="periods" id="periods"></div>
            <div class="inline">
              <button class="btn btn-sm" type="button" id="add-period">${icon('plus', 16)} Ajouter une période</button>
              <span style="flex:1"></span>
              <label class="check"><input type="checkbox" id="holidays"> Jours fériés automatiques</label>
            </div>
          </section>
          <section class="cal-card">
            <h3>Aperçu sur 12 mois</h3>
            <div class="cal-stats" id="cal-stats" aria-live="polite"></div>
            <div class="year-preview" id="preview" aria-hidden="true"></div>
          </section>
        </div>
      </div>`,
    foot: `
      <button class="btn" type="button" id="cal-export">${icon('download')} Partager ce modèle (.json)</button>
      <span class="spacer"></span>
      <button class="btn" type="button" data-close="cancel">Annuler</button>
      <button class="btn btn-primary" type="button" id="cal-apply">Appliquer au projet</button>`,
  });
  const { $, $$ } = m;

  // --- Rendu des sous-parties ------------------------------------------------

  function renderTemplate(kind) {
    const tpl = cal.weekTemplates[kind];
    const kindLabel = kind === SCHOOL ? 'école' : 'entreprise';
    const head = WEEKDAYS.map((d, i) => `<button type="button" class="h" data-day="${i}" aria-label="${d} entier, semaine ${kindLabel} : changer le type" title="Changer la journée entière">${d.slice(0, 3)}</button>`).join('');
    const row = (half, label) => `<span class="r" aria-hidden="true">${label}</span>` + tpl.map((p, i) =>
      `<button type="button" class="slot-btn slot-${p[half]}" data-day="${i}" data-half="${half}" aria-label="${WEEKDAYS[i]} ${label.toLowerCase()}, semaine ${kindLabel} : ${TYPE_LABELS[p[half]]}">${SHORT[p[half]]}</button>`).join('');
    const presets = Object.keys(PRESETS).map((k) => `<option>${esc(k)}</option>`).join('');
    $(`#tpl-${kind}`).innerHTML = `
      <div class="inline" style="margin-bottom:6px">
        <b style="flex:1" id="tpl-title-${kind}">Semaine type « ${kind === SCHOOL ? 'École' : 'Entreprise'} »</b>
        <select class="tpl-preset" data-kind="${kind}" aria-label="Remplir la semaine type ${kindLabel} avec un modèle" style="flex:none;width:auto;min-height:30px;border:1px solid var(--border-strong);border-radius:6px;background:var(--surface);padding:0 6px">
          <option value="">Remplir : jours à ${kind === SCHOOL ? 'l’école' : 'l’entreprise'}…</option>${presets}
        </select>
      </div>
      <div class="week-tpl" data-kind="${kind}" role="group" aria-labelledby="tpl-title-${kind}"><span></span>${head}${row(0, 'Matin')}${row(1, 'Après-midi')}</div>`;
  }

  function renderRhythm() {
    const isCycle = !!cal.cycle;
    $$('input[name="rhythm"]').forEach((r) => { r.checked = r.value === (isCycle ? 'cycle' : 'fixed'); });
    $('#rhythm-fixed').hidden = isCycle;
    $('#rhythm-cycle').hidden = !isCycle;
    $('#default-week').value = cal.defaultWeek === COMPANY ? COMPANY : SCHOOL;
    if (isCycle) {
      $('#cy-school').value = cal.cycle.weeks.filter((w) => w === SCHOOL).length;
      $('#cy-company').value = cal.cycle.weeks.filter((w) => w === COMPANY).length;
      $('#cy-anchor').value = cal.cycle.anchor;
    }
  }

  function renderWeeks() {
    const r = createResolver(cal);
    const chips = [];
    for (let i = 0; i < 52; i++) {
      const mon = gridStart + i * 7;
      const wk = isoWeek(mon);
      const forced = cal.weeks[wk.key];
      const type = r.weekType(mon);
      const c = countDays(r, mon, mon + 6);
      // Couleur dominante de la semaine réelle (après vacances / fériés)
      const dom = c.school >= c.company && c.school > 0 ? SCHOOL : c.company > 0 ? COMPANY : OFF;
      const desc = `Semaine ${wk.week} du ${formatShortFR(mon)} : ${TYPE_LABELS[type]}${forced ? ' (modifiée)' : ''}, ${String(c.school).replace('.', ',')} j d’école, ${String(c.company).replace('.', ',')} j en entreprise`;
      chips.push(`<button type="button" class="week-chip t-${dom}${forced ? ' is-forced' : ''}" data-week="${wk.key}" aria-label="${desc}" title="${desc}">
        <b>S${wk.week}</b>${formatShortFR(mon)}</button>`);
    }
    $('#weeks-grid').innerHTML = chips.join('');
    $$('#brush [data-brush]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.brush === brush)));
  }

  function renderPeriods() {
    const rows = cal.periods.map((p, i) => `
      <div class="period" data-i="${i}">
        <label>Du <input type="date" data-f="start" value="${esc(p.start)}"></label>
        <label>Au <input type="date" data-f="end" value="${esc(p.end)}"></label>
        <select data-f="type" aria-label="Type de période">
          <option value="off"${p.type === OFF ? ' selected' : ''}>Libre</option>
          <option value="company"${p.type === COMPANY ? ' selected' : ''}>Entreprise</option>
          <option value="school"${p.type === SCHOOL ? ' selected' : ''}>École</option>
        </select>
        <input type="text" data-f="label" value="${esc(p.label || '')}" placeholder="ex. Vacances d’hiver" aria-label="Libellé de la période">
        <button type="button" class="btn btn-icon btn-ghost btn-sm" data-del="${i}" aria-label="Supprimer la période ${esc(p.label || `${i + 1}`)}" title="Supprimer la période">${icon('trash', 16)}</button>
      </div>`).join('');
    $('#periods').innerHTML = rows || '<p class="muted" style="margin:0">Aucune période. Ajoutez les vacances scolaires, les périodes de stage…</p>';
    $('#holidays').checked = cal.publicHolidays;
  }

  function renderPreview() {
    const r = createResolver(cal);
    const p0 = parts(gridStart);
    const months = [];
    let stats = { school: 0, company: 0, off: 0 };
    const t = today();
    for (let k = 0; k < 12; k++) {
      const first = fromParts(p0.y, p0.m + k, 1);
      const last = fromParts(p0.y, p0.m + k + 1, 0);
      const pad = weekday(first);
      const cells = Array(pad).fill('<span></span>');
      for (let d = first; d <= last; d++) {
        const info = r.dayInfo(d);
        const [a, b] = info.types;
        stats.school += (a === SCHOOL) * 0.5 + (b === SCHOOL) * 0.5;
        stats.company += (a === COMPANY) * 0.5 + (b === COMPANY) * 0.5;
        const title = `${formatShortFR(d)} : ${a === b ? TYPE_LABELS[a] : `matin ${TYPE_LABELS[a]}, après-midi ${TYPE_LABELS[b]}`}${info.label ? ` — ${info.label}` : ''}`;
        const cls = a === b ? `t-${a}` : 'mixed';
        const tok = (x) => (x === OFF ? 'g-off' : x === SCHOOL ? 'surface' : 'g-company-hatch');
        const style = a === b ? '' : ` style="--a:var(--${tok(a)});--b:var(--${tok(b)})"`;
        cells.push(`<span class="${cls}${d === t ? ' is-today' : ''}"${style} title="${esc(title)}">${parts(d).d}</span>`);
      }
      months.push(`<div class="mini-month"><h4>${MONTHS[parts(first).m]} ${parts(first).y}</h4><div class="mini-days">${cells.join('')}</div></div>`);
    }
    $('#preview').innerHTML = months.join('');
    $('#cal-stats').innerHTML = `Sur ces 12 mois : <span><b>${String(stats.school).replace('.', ',')}</b> j d’école</span><span><b>${String(stats.company).replace('.', ',')}</b> j en entreprise</span>`;
  }

  function renderAll() {
    $('#cal-name').value = cal.name || '';
    renderTemplate(SCHOOL);
    renderTemplate(COMPANY);
    renderRhythm();
    renderWeeks();
    renderPeriods();
    renderPreview();
  }
  const refresh = () => { renderWeeks(); renderPreview(); };

  // --- Évènements ------------------------------------------------------------

  // Après un nouveau rendu, rend le focus au bouton équivalent (navigation au clavier).
  function keepFocus(fn) {
    const a = document.activeElement;
    let sel = null;
    if (a?.matches?.('.slot-btn')) sel = `.week-tpl[data-kind="${a.closest('.week-tpl').dataset.kind}"] .slot-btn[data-day="${a.dataset.day}"][data-half="${a.dataset.half}"]`;
    else if (a?.matches?.('.week-tpl .h')) sel = `.week-tpl[data-kind="${a.closest('.week-tpl').dataset.kind}"] .h[data-day="${a.dataset.day}"]`;
    else if (a?.matches?.('.week-chip')) sel = `.week-chip[data-week="${a.dataset.week}"]`;
    else if (a?.matches?.('[data-brush]')) sel = `[data-brush="${a.dataset.brush}"]`;
    fn();
    if (sel) $(sel)?.focus();
  }

  m.dialog.addEventListener('click', (e) => keepFocus(() => onClick(e)));
  function onClick(e) {
    const slot = e.target.closest('.week-tpl .slot-btn');
    if (slot) {
      const kind = slot.closest('.week-tpl').dataset.kind;
      const p = cal.weekTemplates[kind][+slot.dataset.day];
      p[+slot.dataset.half] = next(p[+slot.dataset.half]);
      renderTemplate(kind); refresh(); return;
    }
    const dayBtn = e.target.closest('.week-tpl .h');
    if (dayBtn) {
      const kind = dayBtn.closest('.week-tpl').dataset.kind;
      const p = cal.weekTemplates[kind][+dayBtn.dataset.day];
      const v = next(p[0]);
      p[0] = v; p[1] = v;
      renderTemplate(kind); refresh(); return;
    }
    const br = e.target.closest('[data-brush]');
    if (br) { brush = br.dataset.brush; renderWeeks(); return; }
    const chip = e.target.closest('.week-chip');
    if (chip) {
      if (brush === 'auto') delete cal.weeks[chip.dataset.week];
      else cal.weeks[chip.dataset.week] = brush;
      refresh(); return;
    }
    const del = e.target.closest('[data-del]');
    if (del) { cal.periods.splice(+del.dataset.del, 1); renderPeriods(); refresh(); $('#add-period').focus(); }
  }

  m.dialog.addEventListener('change', (e) => {
    const preset = e.target.closest('.tpl-preset');
    if (preset && preset.value) {
      const kind = preset.dataset.kind;
      const work = kind; // jours cochés -> type de la semaine ; autres jours ouvrés -> l'autre type
      const other = kind === SCHOOL ? COMPANY : SCHOOL;
      cal.weekTemplates[kind] = PRESETS[preset.value].map((on, i) => {
        const t = i >= 5 ? OFF : on ? work : other;
        return [t, t];
      });
      renderTemplate(kind); refresh();
    }
  });

  $('#cal-name').addEventListener('input', (e) => { cal.name = e.target.value; });
  $$('input[name="rhythm"]').forEach((r) => r.addEventListener('change', () => {
    if (r.value === 'cycle' && r.checked) cal.cycle = makeCycle(toISO(gridStart), 1, 1);
    if (r.value === 'fixed' && r.checked) cal.cycle = null;
    renderRhythm(); refresh();
  }));
  $('#default-week').addEventListener('change', (e) => { cal.defaultWeek = e.target.value; refresh(); });
  const updateCycle = () => {
    const s = Math.max(0, +$('#cy-school').value || 0), c = Math.max(0, +$('#cy-company').value || 0);
    const a = $('#cy-anchor').value || toISO(gridStart);
    cal.cycle = makeCycle(a, s, c) || makeCycle(a, 1, 0);
    refresh();
  };
  ['#cy-school', '#cy-company', '#cy-anchor'].forEach((s) => $(s).addEventListener('change', updateCycle));

  $('#wk-prev').addEventListener('click', () => { gridStart -= 26 * 7; refresh(); });
  $('#wk-next').addEventListener('click', () => { gridStart += 26 * 7; refresh(); });

  $('#add-period').addEventListener('click', () => {
    const last = cal.periods[cal.periods.length - 1];
    const s = last ? toDay(last.end) + 7 : gridStart;
    cal.periods.push({ start: toISO(s), end: toISO(s + 6), type: OFF, label: '' });
    renderPeriods(); refresh();
    $$('#periods .period').pop()?.querySelector('input')?.focus();
  });
  $('#periods').addEventListener('change', (e) => {
    const tr = e.target.closest('.period[data-i]');
    if (!tr) return;
    const p = cal.periods[+tr.dataset.i];
    p[e.target.dataset.f] = e.target.value;
    if (toDay(p.start) != null && toDay(p.end) != null && toDay(p.end) < toDay(p.start)) {
      p.end = p.start;
      tr.querySelector('[data-f="end"]').value = p.end;
    }
    refresh();
  });
  $('#holidays').addEventListener('change', (e) => { cal.publicHolidays = e.target.checked; refresh(); });

  // --- Modèles ---------------------------------------------------------------

  async function useModel(data, label) {
    if (!(await confirmDialog(`Remplacer le calendrier actuel par le modèle « ${esc(label)} » ?`, { ok: 'Remplacer' }))) return;
    cal = normalizeCalendar(data);
    renderAll();
    toast(`Modèle « ${label} » chargé. Vérifiez puis cliquez sur « Appliquer ».`);
  }

  $('#cal-model').addEventListener('change', async (e) => {
    const model = models[+e.target.value];
    e.target.value = '';
    if (!model) return;
    try {
      const res = await fetch(model.file, { cache: 'no-cache' });
      if (!res.ok) throw new Error();
      await useModel(await res.json(), model.name);
    } catch { toast('Impossible de charger ce modèle.', { error: true }); }
  });

  $('#cal-import').addEventListener('click', async () => {
    const f = await pickJSONFile();
    if (!f) return;
    const data = f.data?.format === 'kgantt' ? f.data.calendar : f.data;
    if (!data || (data.format && data.format !== 'kgantt-calendar')) {
      toast('Ce fichier ne contient pas de calendrier K-Gantt.', { error: true });
      return;
    }
    await useModel(data, data.name || f.name);
  });

  $('#cal-export').addEventListener('click', () => {
    const data = normalizeCalendar(cal);
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${slugify(data.name || 'calendrier')}.kgantt-calendar.json`);
    toast('Modèle téléchargé : partagez ce fichier avec vos étudiants ou collègues.');
  });

  $('#cal-apply').addEventListener('click', () => {
    onApply(normalizeCalendar(cal));
    m.close('apply');
  });

  renderAll();
  return m;
}
