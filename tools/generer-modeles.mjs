// Génère les modèles de calendrier fournis et le projet d'exemple.
// Usage : node tools/generer-modeles.mjs
import { writeFileSync } from 'node:fs';
import { defaultCalendar, makeCycle } from '../public/assets/js/calendar.js';
import { defaultProject, newTask } from '../public/assets/js/project.js';
import { schedule } from '../public/assets/js/scheduler.js';
import { formatSlot } from '../public/assets/js/dates.js';

const S = 'school', C = 'company', O = 'off';
const week = (...days) => [...days, O, O].slice(0, 7).map((t) => [t, t]);
const out = (file, data) => writeFileSync(new URL(`../public/${file}`, import.meta.url), JSON.stringify(data, null, 2) + '\n');

function model(name, description, patch) {
  const c = defaultCalendar();
  return { ...c, name, description, ...patch };
}

const models = {
  'temps-plein-ecole': model('Temps plein école (lundi → vendredi)',
    'Tous les jours ouvrés à l’école. Pour les classes hors alternance.', {}),
  'alternance-2j-ecole-3j-entreprise': model('Alternance : 2 jours école / 3 jours entreprise',
    'Lundi et mardi à l’école, du mercredi au vendredi en entreprise, toutes les semaines.',
    { weekTemplates: { school: week(S, S, C, C, C), company: week(C, C, C, C, C) } }),
  'alternance-3j-ecole-2j-entreprise': model('Alternance : 3 jours école / 2 jours entreprise',
    'Du lundi au mercredi à l’école, jeudi et vendredi en entreprise.',
    { weekTemplates: { school: week(S, S, S, C, C), company: week(C, C, C, C, C) } }),
  'alternance-1-semaine-1-semaine': model('Alternance : 1 semaine école / 1 semaine entreprise',
    'Une semaine sur deux à l’école. Ajustez la date de départ du cycle et les semaines particulières.',
    { cycle: makeCycle('2026-08-31', 1, 1) }),
  'alternance-2-semaines-2-semaines': model('Alternance : 2 semaines école / 2 semaines entreprise',
    'Deux semaines à l’école puis deux semaines en entreprise.',
    { cycle: makeCycle('2026-08-31', 2, 2) }),
  'alternance-1-semaine-3-semaines': model('Alternance : 1 semaine école / 3 semaines entreprise',
    'Une semaine à l’école puis trois semaines en entreprise.',
    { cycle: makeCycle('2026-08-31', 1, 3) }),
};
for (const [file, data] of Object.entries(models)) out(`modeles/calendriers/${file}.json`, data);

// --- Projet d'exemple ---------------------------------------------------------
const p = defaultProject();
p.project = {
  name: 'Application de gestion de bibliothèque',
  description: 'Projet de 1re année : application web de prêt de livres pour le CDI.',
  team: 'Groupe 2 — Léa, Tom, Inès',
  className: 'BTS SIO 1',
  teacher: 'M. Martin',
  start: '2026-09-07',
  halfDays: true,
};
p.calendar = {
  ...models['alternance-2j-ecole-3j-entreprise'],
  name: 'BTS SIO 1 — 2 j école / 3 j entreprise (exemple)',
  periods: [
    { start: '2026-10-17', end: '2026-11-01', type: O, label: 'Vacances de la Toussaint (exemple)' },
    { start: '2026-12-19', end: '2027-01-03', type: O, label: 'Vacances de Noël (exemple)' },
    { start: '2026-11-23', end: '2026-11-27', type: S, label: 'Semaine de regroupement à l’école' },
  ],
};
p.resources = [
  { id: 'lea', name: 'Léa', color: '#4f46e5' },
  { id: 'tom', name: 'Tom', color: '#059669' },
  { id: 'ines', name: 'Inès', color: '#db2777' },
];
const T = (id, f) => newTask({ id, ...f });
p.tasks = [
  T('g1', { name: 'Cadrage', duration: 0 }),
  T('t11', { parent: 'g1', name: 'Analyse du besoin avec la documentaliste', duration: 2, progress: 100, resources: ['lea', 'tom', 'ines'], log: [{ date: '2026-09-14', progress: 100, note: 'Entretien réalisé' }] }),
  T('t12', { parent: 'g1', name: 'Rédaction du cahier des charges', duration: 2, where: 'any', deps: ['t11'], progress: 100, resources: ['lea'] }),
  T('m13', { parent: 'g1', name: 'Validation du cahier des charges', type: 'milestone', duration: 0, deps: ['t12'], progress: 100 }),
  T('g2', { name: 'Conception', duration: 0 }),
  T('t21', { parent: 'g2', name: 'Modélisation de la base de données', duration: 3, deps: ['m13'], progress: 60, resources: ['tom'], color: '#0891b2' }),
  T('t22', { parent: 'g2', name: 'Maquettes de l’interface', duration: 2, where: 'any', deps: ['m13'], progress: 30, resources: ['ines'], color: '#0891b2' }),
  T('g3', { name: 'Réalisation', duration: 0 }),
  T('t31', { parent: 'g3', name: 'Développement du back-end', duration: 6, deps: ['t21'], resources: ['tom', 'lea'], color: '#059669' }),
  T('t32', { parent: 'g3', name: 'Développement du front-end', duration: 5, deps: ['t22'], resources: ['ines'], color: '#059669' }),
  T('t33', { parent: 'g3', name: 'Tests chez le tuteur en entreprise', duration: 2, where: 'company', deps: ['t31', 't32'], resources: ['lea'], color: '#d97706' }),
  T('g4', { name: 'Livraison', duration: 0 }),
  T('t41', { parent: 'g4', name: 'Documentation utilisateur', duration: 2, where: 'any', deps: ['t33'], resources: ['ines'] }),
  T('t42', { parent: 'g4', name: 'Préparation de la soutenance', duration: 1.5, deps: ['t33'], resources: ['lea', 'tom', 'ines'] }),
  T('m43', { parent: 'g4', name: 'Soutenance', type: 'milestone', duration: 0, deps: ['t41', 't42'], color: '#dc2626' }),
];
// Le « prévu » : la planification initiale, où la modélisation était estimée à 2 jours.
const initial = structuredClone(p);
initial.tasks.find((t) => t.id === 't21').duration = 2;
const s0 = schedule(initial);
p.baseline = { date: '2026-09-07', tasks: {} };
for (const t of initial.tasks) {
  const it = s0.items.get(t.id);
  p.baseline.tasks[t.id] = { start: formatSlot(it.start), end: formatSlot(it.milestone ? it.start : it.end), milestone: it.milestone };
}
p.view = { zoom: 'week', showBaseline: true };
out('exemples/projet-exemple.kgantt.json', p);
console.log('Modèles et exemple générés.');
