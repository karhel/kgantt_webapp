// Tests : import GanttProject, génération iCal (JS) et parité avec ical.php (PHP).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseXML } from '../public/assets/js/xml.js';
import { importGanttProject } from '../public/assets/js/ganttproject.js';
import { schedule } from '../public/assets/js/scheduler.js';
import { buildICS, computedSnapshot, icsFold, icsEscape, icalEvents } from '../public/assets/js/ical.js';
import { formatSlot, toDay } from '../public/assets/js/dates.js';

const gan = readFileSync(new URL('./fixtures/projet-ganttproject.gan', import.meta.url), 'utf8');
const example = JSON.parse(readFileSync(new URL('../public/exemples/projet-exemple.kgantt.json', import.meta.url), 'utf8'));
const TODAY = toDay('2026-10-13');

test('xml : entités, CDATA, commentaires, auto-fermantes', () => {
  const r = parseXML('<?xml version="1.0"?><a x="1 &amp; 2" y=\'>\'><!-- c --><b/><c><![CDATA[<i>]]> &lt;ok&gt;</c></a>');
  assert.equal(r.name, 'a');
  assert.equal(r.attrs.x, '1 & 2');
  assert.equal(r.attrs.y, '>');
  assert.equal(r.children.length, 2);
  assert.equal(r.children[1].text, '<i> <ok>');
  assert.throws(() => parseXML('<a><b></a>'), /inattendue/);
});

test('GanttProject : structure, jalons, liens, ressources, avertissements', () => {
  const { project: p, warnings, stats } = importGanttProject(gan);
  assert.equal(p.project.name, 'Site web & BDD');
  assert.equal(p.project.description, 'Projet de 2e année <important>');
  assert.equal(p.project.start, '2026-09-07');
  assert.deepEqual(stats, { tasks: 4, milestones: 1, deps: 3, resources: 2 });

  const t = Object.fromEntries(p.tasks.map((x) => [x.name, x]));
  assert.equal(t['Recueil des besoins'].parent, t.Analyse.id);
  assert.equal(t['Cahier des charges'].color, '#ff0000');
  assert.equal(t.Analyse.color, null); // couleur par défaut de GanttProject
  assert.equal(t.Analyse.notes, 'Interview du client');
  assert.equal(t['Cahier des charges'].progress, 50);
  assert.equal(t.Développement.collapsed, true);
  assert.equal(t.Recette.type, 'milestone');
  assert.deepEqual(t['Cahier des charges'].deps, [t['Recueil des besoins'].id]);
  assert.deepEqual(t.Développement.deps, [t.Analyse.id]);
  assert.deepEqual(t.Recette.deps, [t.Développement.id]); // type 3 converti
  assert.deepEqual(t.Analyse.deps, []); // lien enfant -> parent refusé
  assert.equal(t.Développement.resources.length, 2);
  assert.equal(p.resources[0].name, 'Léa Martin');
  assert.deepEqual(p.calendar.periods, [{ start: '2026-10-02', end: '2026-10-02', type: 'off', label: 'Journée pédagogique' }]);
  assert.ok(warnings.some((w) => /convertis/.test(w)));
  assert.ok(warnings.some((w) => /ignoré/.test(w)));
  assert.ok(warnings.some((w) => /baselines/.test(w)));
});

test('GanttProject : dates conservées avec le calendrier temps plein', () => {
  const { project: p } = importGanttProject(gan);
  const s = schedule(p, { today: TODAY });
  const by = (name) => s.items.get(p.tasks.find((x) => x.name === name).id);
  assert.equal(formatSlot(by('Recueil des besoins').start), '2026-09-07');
  assert.equal(formatSlot(by('Recueil des besoins').end), '2026-09-08:pm');
  assert.equal(formatSlot(by('Cahier des charges').start), '2026-09-09');
  assert.equal(formatSlot(by('Développement').start), '2026-09-10');
  assert.equal(formatSlot(by('Développement').end), '2026-09-16:pm');
  assert.equal(formatSlot(by('Recette').start), '2026-09-16:pm'); // convention : fin du prédécesseur
});

test('GanttProject : rejet des fichiers invalides', () => {
  assert.throws(() => importGanttProject('<html></html>'), /pas un projet GanttProject/);
  assert.throws(() => importGanttProject('<project><tasks>'), /illisible/);
});

test('iCal : échappement et repli des lignes', () => {
  assert.equal(icsEscape('a,b;c\\d\ne'), 'a\\,b\;c\\\\d\\ne');
  const long = 'SUMMARY:' + 'é'.repeat(60);
  const folded = icsFold(long);
  for (const line of folded.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ''), long);
});

test('iCal : évènements par période travaillée ou par tâche', () => {
  const s = schedule(example, { today: TODAY });
  const c = computedSnapshot(example, s);
  const runs = icalEvents(example, c, { mode: 'runs' });
  const span = icalEvents(example, c, { mode: 'span' });
  const leaves = example.tasks.filter((t) => !example.tasks.some((x) => x.parent === t.id));
  assert.equal(span.length, leaves.length);
  assert.ok(runs.length > span.length); // l'alternance découpe les tâches
  const back = runs.filter((e) => e.taskId === 't31');
  assert.ok(back.length > 1 && /\(1\/\d\)$/.test(back[0].summary));
  assert.ok(runs.some((e) => e.summary === '◆ Soutenance'));
  assert.equal(new Set(runs.map((e) => e.uid)).size, runs.length);
  assert.equal(icalEvents(example, c, { mode: 'span', groups: true }).length, example.tasks.length);
});

test('iCal : le PHP (abonnement) produit exactement le même fichier que le JS', () => {
  const s = schedule(example, { today: TODAY });
  const data = { ...example, computed: computedSnapshot(example, s) };
  data.computed.generatedAt = '2026-10-13T08:00:00.000Z';
  const now = new Date('2026-10-13T09:30:00Z');
  const dir = mkdtempSync(join(tmpdir(), 'kgantt-'));
  writeFileSync(join(dir, 'p.json'), JSON.stringify(data));
  const lib = new URL('../public/inc/ical-lib.php', import.meta.url).pathname;
  for (const [mode, groups] of [['runs', false], ['span', true]]) {
    const js = buildICS(example, data.computed, { mode, groups, now });
    const php = execFileSync('php', ['-r', `require '${lib}'; echo kgantt_ics(json_decode(file_get_contents($argv[1]), true), $argv[2], $argv[3] === '1', ${now.getTime() / 1000});`, join(dir, 'p.json'), mode, groups ? '1' : '0']).toString();
    const strip = (x) => x.split('\r\n').filter((l) => !/^(REFRESH-INTERVAL|X-PUBLISHED-TTL)/.test(l)).join('\r\n');
    assert.equal(strip(php), strip(js), `mode ${mode}`);
    assert.match(js, /^BEGIN:VCALENDAR\r\n/);
  }
});

test('ical.php : URL partagées et adresses internes refusées', () => {
  const lib = new URL('../public/inc/ical-lib.php', import.meta.url).pathname;
  const php = (code) => execFileSync('php', ['-r', `require '${lib}'; ${code}`]).toString();
  assert.equal(php("echo kgantt_normalize_share_url('https://cloud.lycee.fr/s/AbC123');"), 'https://cloud.lycee.fr/s/AbC123/download');
  assert.equal(php("echo kgantt_normalize_share_url('https://www.dropbox.com/scl/fi/x/p.json?rlkey=k&dl=0');"), 'https://www.dropbox.com/scl/fi/x/p.json?rlkey=k&dl=1');
  assert.equal(php("echo kgantt_normalize_share_url('https://github.com/a/b/blob/main/p.json');"), 'https://raw.githubusercontent.com/a/b/main/p.json');
  assert.equal(php("echo kgantt_normalize_share_url('https://drive.google.com/file/d/XyZ_1/view?usp=sharing');"), 'https://drive.google.com/uc?export=download&id=XyZ_1');
  for (const bad of ['http://exemple.fr/p.json', 'https://127.0.0.1/p.json', 'https://10.0.0.2/p.json', 'https://169.254.169.254/latest', 'https://[::1]/x', 'file:///etc/passwd', 'https://exemple.fr:8443/x']) {
    const out = php(`try { kgantt_check_public_url('${bad}'); echo 'OK'; } catch (KGanttIcalError $e) { echo 'REFUS'; }`);
    assert.equal(out, 'REFUS', bad);
  }
  assert.match(php("try { kgantt_ics(['format' => 'kgantt', 'tasks' => []]); } catch (KGanttIcalError $e) { echo $e->getMessage(); }"), /enregistrez-le à nouveau/);
});
