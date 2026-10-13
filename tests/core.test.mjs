// SPDX-License-Identifier: AGPL-3.0-or-later
// Tests du moteur K-Gantt (sans navigateur) : node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toDay, toISO, isoWeek, easter, formatSlot, parseSlot } from '../public/assets/js/dates.js';
import { createResolver, defaultCalendar, makeCycle, countDays } from '../public/assets/js/calendar.js';
import { defaultProject, newTask, normalizeProject, indentTask, outdentTask, wouldCreateCycle, flatten } from '../public/assets/js/project.js';
import { schedule, durationBetween } from '../public/assets/js/scheduler.js';
import { toCSV } from '../public/assets/js/csv.js';

const d = (iso) => toDay(iso);
const slotISO = (s) => formatSlot(s);

test('dates : semaines ISO, Pâques, créneaux', () => {
  assert.equal(isoWeek(d('2026-01-01')).key, '2026-W01');
  assert.equal(isoWeek(d('2027-01-01')).key, '2026-W53');
  assert.equal(toISO(easter(2027)), '2027-03-28');
  assert.equal(parseSlot('2026-09-01:pm') % 2, 1);
  assert.equal(formatSlot(parseSlot('2026-09-01:pm')), '2026-09-01:pm');
});

test('calendrier : semaine type, fériés, périodes, cycle', () => {
  const cal = defaultCalendar();
  const r = createResolver(cal);
  assert.deepEqual(r.dayInfo(d('2026-09-07')).types, ['school', 'school']); // lundi
  assert.deepEqual(r.dayInfo(d('2026-09-12')).types, ['off', 'off']); // samedi
  assert.deepEqual(r.dayInfo(d('2026-11-11')).types, ['off', 'off']); // férié
  assert.equal(r.dayInfo(d('2026-11-11')).label, 'Armistice 1918');

  cal.periods.push({ start: '2026-10-19', end: '2026-10-30', type: 'off', label: 'Vacances' });
  cal.periods.push({ start: '2026-11-16', end: '2026-11-20', type: 'company', label: 'Stage' });
  const r2 = createResolver(cal);
  assert.deepEqual(r2.dayInfo(d('2026-10-20')).types, ['off', 'off']);
  assert.deepEqual(r2.dayInfo(d('2026-11-17')).types, ['company', 'company']);
  assert.deepEqual(r2.dayInfo(d('2026-11-21')).types, ['off', 'off']); // samedi reste libre

  const alt = defaultCalendar();
  alt.cycle = makeCycle('2026-09-07', 1, 2);
  alt.weeks['2026-W40'] = 'off';
  const r3 = createResolver(alt);
  assert.equal(r3.weekType(d('2026-09-08')), 'school');
  assert.equal(r3.weekType(d('2026-09-15')), 'company');
  assert.equal(r3.weekType(d('2026-09-22')), 'company');
  assert.equal(r3.weekType(d('2026-09-29')), 'off'); // semaine 40 forcée
  assert.equal(r3.weekType(d('2026-08-31')), 'company'); // avant l'ancre, le cycle continue
  assert.deepEqual(countDays(r3, d('2026-09-07'), d('2026-09-13')), { school: 5, company: 0, off: 2 });
});

test('calendrier : demi-journées', () => {
  const cal = defaultCalendar();
  cal.weekTemplates.school[1] = ['school', 'company']; // mardi après-midi en entreprise
  const r = createResolver(cal);
  assert.deepEqual(r.dayInfo(d('2026-09-08')).types, ['school', 'company']);
});

function alternanceProject() {
  const p = defaultProject();
  p.project.start = '2026-09-07';
  // Lundi et mardi à l'école, mercredi → vendredi en entreprise.
  p.calendar.weekTemplates.school = [
    ['school', 'school'], ['school', 'school'], ['company', 'company'], ['company', 'company'],
    ['company', 'company'], ['off', 'off'], ['off', 'off'],
  ];
  p.calendar.publicHolidays = true;
  return p;
}

test('planification : durées en jours de présence et dépendances', () => {
  const p = alternanceProject();
  const a = newTask({ id: 'a', name: 'Analyse', duration: 3, where: 'school' });
  const b = newTask({ id: 'b', name: 'Dév', duration: 2, where: 'any', deps: ['a'] });
  const c = newTask({ id: 'c', name: 'Rendu', type: 'milestone', deps: ['b'] });
  const e = newTask({ id: 'e', name: 'Mission', duration: 1, where: 'company' });
  p.tasks.push(a, b, c, e);
  const s = schedule(p, { today: d('2026-09-01') });

  const A = s.items.get('a');
  // 3 jours d'école : lun 7, mar 8, lun 14 -> fin le 14 après-midi
  assert.equal(slotISO(A.start), '2026-09-07');
  assert.equal(slotISO(A.end), '2026-09-14:pm');
  assert.equal(A.runs.length, 2);

  const B = s.items.get('b');
  // "Partout" : mar 15 + mer 16
  assert.equal(slotISO(B.start), '2026-09-15');
  assert.equal(slotISO(B.end), '2026-09-16:pm');

  const C = s.items.get('c');
  assert.ok(C.milestone);
  assert.equal(slotISO(C.start), '2026-09-16:pm'); // jalon à la fin de son prédécesseur
  assert.ok(C.atEnd);

  const E = s.items.get('e');
  assert.equal(slotISO(E.start), '2026-09-09'); // premier mercredi
});

test('planification : demi-journées, "pas avant", tâches parentes, avancement', () => {
  const p = alternanceProject();
  p.project.halfDays = true;
  p.tasks.push(
    newTask({ id: 'g', name: 'Groupe', duration: 0 }),
    newTask({ id: 'x', parent: 'g', duration: 0.5, progress: 100 }),
    newTask({ id: 'y', parent: 'g', duration: 1.5, deps: ['x'], progress: 0 }),
    newTask({ id: 'z', duration: 1, notBefore: '2026-09-21:pm' }),
  );
  const s = schedule(p, { today: d('2026-09-15') });
  const X = s.items.get('x'), Y = s.items.get('y'), G = s.items.get('g'), Z = s.items.get('z');
  assert.equal(slotISO(X.start), '2026-09-07');
  assert.equal(slotISO(X.end), '2026-09-07');
  assert.equal(slotISO(Y.start), '2026-09-07:pm');
  assert.equal(slotISO(Y.end), '2026-09-08:pm');
  assert.ok(G.summary);
  assert.equal(G.start, X.start);
  assert.equal(G.end, Y.end);
  assert.equal(G.progress, 25); // 1 créneau fait sur 4
  assert.equal(Y.expected, 100);
  assert.equal(Y.status, 'late');
  assert.equal(slotISO(Z.start), '2026-09-21:pm');
  assert.equal(slotISO(Z.end), '2026-09-22');
});

test('planification : les dépendances d’une tâche parente s’appliquent aux enfants', () => {
  const p = alternanceProject();
  p.tasks.push(
    newTask({ id: 'a', duration: 2 }),
    newTask({ id: 'g', deps: ['a'] }),
    newTask({ id: 'g1', parent: 'g', duration: 1 }),
  );
  const s = schedule(p, { today: d('2026-09-01') });
  assert.equal(slotISO(s.items.get('g1').start), '2026-09-14');
});

test('redimensionnement : durée entre deux créneaux selon le lieu', () => {
  const r = createResolver(alternanceProject().calendar);
  const s = parseSlot('2026-09-07');
  const e = parseSlot('2026-09-13:pm');
  assert.equal(durationBetween(r, 'school', s, e), 2);
  assert.equal(durationBetween(r, 'company', s, e), 3);
  assert.equal(durationBetween(r, 'any', s, e), 5);
});

test('arborescence et cycles', () => {
  const p = defaultProject();
  p.tasks.push(newTask({ id: 'a' }), newTask({ id: 'b' }), newTask({ id: 'c' }));
  assert.ok(indentTask(p, 'b'));
  assert.equal(p.tasks.find((t) => t.id === 'b').parent, 'a');
  assert.ok(wouldCreateCycle(p, 'a', 'b')); // parent / enfant interdit
  p.tasks.find((t) => t.id === 'c').deps.push('a');
  assert.ok(wouldCreateCycle(p, 'c', 'a'));
  assert.ok(wouldCreateCycle(p, 'c', 'b')); // b hérite des contraintes de a
  assert.ok(outdentTask(p, 'b'));
  assert.equal(p.tasks.find((t) => t.id === 'b').parent, null);
  assert.deepEqual(flatten(p).map((r) => r.task.id), ['a', 'b', 'c']);

  const q = defaultProject();
  q.tasks.push(newTask({ id: 'p' }), newTask({ id: 'p1', parent: 'p' }), newTask({ id: 'p2', parent: 'p' }));
  assert.ok(!wouldCreateCycle(q, 'p1', 'p2')); // deux sœurs peuvent être liées
});

test('lecture de fichier : normalisation et rejet', () => {
  const p = normalizeProject({
    format: 'kgantt', version: 1,
    tasks: [{ id: 'a', name: 'A', deps: ['zz', 'a'], parent: 'nope', progress: 140, duration: '2.3' }],
  });
  const a = p.tasks[0];
  assert.deepEqual(a.deps, []);
  assert.equal(a.parent, null);
  assert.equal(a.progress, 100);
  assert.equal(a.duration, 2.5);
  assert.throws(() => normalizeProject({ format: 'kgantt-calendar' }), /modèle de calendrier/);
  assert.throws(() => normalizeProject('x'));
});

test('export CSV : séparateur ; et échappement', () => {
  const p = alternanceProject();
  p.resources.push({ id: 'r1', name: 'Léa', color: '#000' });
  p.tasks.push(newTask({ id: 'a', name: 'Analyse; "besoin"', duration: 1, resources: ['r1'] }));
  const csv = toCSV(p, schedule(p, { today: d('2026-09-01') }));
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  assert.match(lines[0], /^N°;Nom;/);
  assert.match(lines[1], /^1;"Analyse; ""besoin""";Tâche;1;École;07\/09\/2026;07\/09\/2026;0;;Léa;/);
});

test('conventions Gantt : jalon daté de la fin de son prédécesseur, jamais un samedi', () => {
  const p = defaultProject();
  p.project.start = '2026-09-07';
  p.tasks.push(
    newTask({ id: 'a', duration: 5 }), // lundi → vendredi
    newTask({ id: 'm', type: 'milestone', duration: 0, deps: ['a'] }),
    newTask({ id: 'b', duration: 1, deps: ['m'] }),
    newTask({ id: 'libre', type: 'milestone', duration: 0, notBefore: '2026-09-09' }),
  );
  const s = schedule(p, { today: d('2026-09-01') });
  assert.equal(slotISO(s.items.get('m').start), '2026-09-11:pm'); // vendredi
  assert.equal(slotISO(s.items.get('b').start), '2026-09-14'); // le successeur démarre lundi
  assert.equal(slotISO(s.items.get('libre').start), '2026-09-09'); // jalon sans prédécesseur : à sa date
  assert.equal(s.items.get('libre').atEnd, false);
  // Attendu : à 100 % seulement une fois la date passée
  assert.equal(schedule(p, { today: d('2026-09-11') }).items.get('m').expected, 0);
  assert.equal(schedule(p, { today: d('2026-09-12') }).items.get('m').expected, 100);
});

test('conventions Gantt : durée d’un groupe = étendue en jours travaillés', () => {
  const p = defaultProject();
  p.project.start = '2026-09-07';
  p.tasks.push(
    newTask({ id: 'g' }),
    newTask({ id: 'g1', parent: 'g', duration: 3 }),
    newTask({ id: 'g2', parent: 'g', duration: 3 }), // en parallèle
    newTask({ id: 'h' }),
    newTask({ id: 'h1', parent: 'h', duration: 4 }),
    newTask({ id: 'h2', parent: 'h', duration: 2, deps: ['h1'] }), // traverse un week-end
  );
  const s = schedule(p, { today: d('2026-09-01') });
  assert.equal(s.items.get('g').span, 3);
  assert.equal(s.items.get('h').span, 6);
  assert.equal(s.items.get('g').n, 12); // le travail total (pondération de l'avancement) reste 6 j
});
