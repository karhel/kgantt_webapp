# K-Gantt

[![Licence : AGPL v3](https://img.shields.io/badge/licence-AGPL--3.0-blue.svg)](LICENSE)
[![Tests](https://github.com/karhel/kgantt_webapp/actions/workflows/tests.yml/badge.svg)](https://github.com/karhel/kgantt_webapp/actions/workflows/tests.yml)

**Diagrammes de Gantt simples et intuitifs pour les projets étudiants, pensés pour l'alternance.**

K-Gantt est une application web (PHP / HTML / JavaScript) qui permet aux étudiants de planifier leurs projets de classe en tenant compte de leur **rythme réel** : jours à l'école, jours en entreprise, vacances, stages. Les durées sont saisies en **jours de présence** et les dates sont calculées automatiquement.

Adresse de production : **https://kgantt.phoen-ix.net**. K-Gantt est un **logiciel libre** : vous pouvez l'utiliser, l'étudier, le modifier et l'héberger pour votre établissement.

---

## Fonctionnalités

### Planification
- Tâches, **sous-tâches** (groupes), **jalons** (rendus, soutenances…)
- **Durées en jours de présence**, avec les demi-journées en option
- **Lieu de la tâche**, qui détermine les jours comptés : *École* (jours de cours), *Entreprise* ou *Partout*
- **Dépendances** « fin → début » : une tâche attend la fin d'une autre, et les dates se recalculent seules
- Contrainte « ne pas commencer avant » une date
- **Ressources** : membres de l'équipe, avec une couleur par personne
- Saisie rapide au clavier dans le tableau, avec annuler / rétablir (100 niveaux)
- Dans le diagramme, à la souris :
  - glisser une barre pour la déplacer ;
  - glisser son bord droit pour changer la durée ;
  - glisser son rond ○ vers une autre tâche pour créer un lien ;
  - cliquer sur un lien pour le supprimer.
- Échelles **Jour / Semaine / Mois** et ligne « aujourd'hui »

### Calendrier d'alternance
- **Semaines types** « École » et « Entreprise », réglables à la demi-journée
- Rythme **fixe** (ex. lundi-mardi à l'école, le reste en entreprise) ou **alternance de semaines** (ex. 1 semaine école / 2 semaines entreprise)
- **Ajustements semaine par semaine** au pinceau, pour reproduire le calendrier d'alternance de l'établissement
- **Périodes** : vacances, stages, semaines de regroupement
- **Jours fériés** français calculés automatiquement
- Aperçu sur 12 mois et décompte des jours d'école et d'entreprise
- **Modèles partageables** : un enseignant exporte le calendrier de sa classe (`.kgantt-calendar.json`), les étudiants l'importent. Les modèles déposés dans `public/modeles/calendriers/` apparaissent dans la liste.

Dans le diagramme, les barres montrent les jours réellement travaillés : une tâche « École » de 3 jours s'étale sur plusieurs semaines, et seuls les jours de cours sont pleins.

### Suivi de l'avancement
- % réalisé par tâche ; le % des groupes et du projet est calculé et pondéré par les durées
- **Journal d'avancement daté**, avec une note facultative (journal de bord)
- **État** de chaque tâche (à faire, en cours, terminée, en retard), en comparant le réalisé à l'attendu à la date du jour
- **Prévu / réel** : on fige une planification de référence, qui s'affiche en gris sous les barres

### Fichiers et exports
- **Pas de compte, pas de base de données, aucune donnée stockée sur le serveur**
- Le projet est enregistré dans un fichier **`.kgantt.json`** : *Fichier → Enregistrer* (Ctrl+S) pour l'enregistrer, *Ouvrir* (Ctrl+O) ou glisser-déposer pour le rouvrir
- Un **brouillon** est conservé dans le navigateur (localStorage), pour éviter les pertes en cas de fermeture accidentelle
- Exports :
  - **PDF** : A4 ou A3 paysage, sur une page ou sur plusieurs pages, avec un en-tête projet / équipe / classe ;
  - **PNG** ;
  - **CSV** compatible Excel en français (séparateur `;`, UTF-8 avec BOM) ;
  - **JSON**.
  - **iCal (.ics)** : un évènement par période travaillée (seuls les jours où la tâche avance) ou un évènement par tâche.
- **Import GanttProject (.gan)** : tâches, sous-tâches, jalons, liens, avancement, notes, couleurs, ressources et affectations, jours fériés datés. On choisit le calendrier (temps plein ou alternance), le lieu des tâches, et on peut conserver les dates d'origine.
- **Synchronisation avec un agenda** (Google Agenda, Outlook, Apple Calendrier) par abonnement iCal, voir ci-dessous
- Thème clair et **mode sombre**, interface **accessible** (WCAG 2.1 AA, navigation complète au clavier) : voir [docs/ACCESSIBILITE.md](docs/ACCESSIBILITE.md)

### Synchronisation iCal (abonnement)

Il n'y a aucun stockage sur le serveur, donc l'abonnement lit le fichier du projet là où l'étudiant l'a déposé :

1. L'étudiant enregistre son projet. Le fichier `.kgantt.json` contient aussi les dates calculées (section `computed`).
2. Il dépose ce fichier sur un espace en ligne avec un **lien public** : Nextcloud de l'établissement, Dropbox, Google Drive ou GitHub. Les liens de partage de ces services sont convertis automatiquement en liens de téléchargement.
3. *Exporter → Agenda iCal* fournit l'adresse d'abonnement `https://kgantt.phoen-ix.net/ical.php?url=…`, à ajouter dans l'agenda.
4. À chaque nouveau dépôt du fichier, l'agenda se met à jour au rythme d'actualisation de l'application. Google Agenda peut mettre plusieurs heures.

Protections de `ical.php` :
- le serveur n'accepte que le **HTTPS** sur le port 443 ;
- il refuse les **adresses privées ou réservées** (pas d'accès au réseau interne) et vérifie l'adresse IP à chaque redirection (3 au maximum) ;
- les fichiers sont limités à **3 Mo** et le téléchargement à 10 s ;
- rien n'est conservé.

Pour désactiver la fonction, mettez `KGANTT_ICAL_ENABLED` à `false` dans `public/ical.php`. L'extension PHP **cURL** est requise ; elle est active par défaut chez o2switch.

---

## Installation sur o2switch

L'application n'a besoin que de **PHP ≥ 8.0** (avec cURL pour l'abonnement iCal), sans base de données ni dépendance à installer.

1. Dans cPanel, créez le sous-domaine `kgantt.phoen-ix.net`. Notez son dossier racine, par exemple `~/kgantt.phoen-ix.net`.
2. Activez le certificat **SSL Let's Encrypt** pour le sous-domaine (cPanel → *Let's Encrypt SSL*). Le `.htaccess` force ensuite le HTTPS.
3. Envoyez le **contenu du dossier `public/`** dans ce dossier racine, par FTP / SFTP, par le gestionnaire de fichiers ou par Git avec *Git Version Control*.
   ```
   public/
   ├── index.php              ← page de l'application
   ├── mentions-legales.php   ← mentions légales et confidentialité
   ├── ical.php               ← abonnement iCal (lit un .kgantt.json public, ne stocke rien)
   ├── inc/                   ← configuration de l'instance et bibliothèque PHP (non accessibles depuis le web)
   ├── .htaccess              ← HTTPS, en-têtes de sécurité, cache
   ├── assets/                ← CSS, JavaScript, jsPDF, icônes
   ├── modeles/calendriers/   ← modèles de calendrier proposés aux étudiants
   └── exemples/              ← projet d'exemple
   ```
4. Renseignez les informations de l'instance dans **`public/inc/config.php`** : nom de l'éditeur, contact, hébergeur, lien vers le code source. Elles alimentent la page `mentions-legales.php` et les liens de l'application.
5. Ouvrez https://kgantt.phoen-ix.net.

> **Héberger votre propre instance** : la licence AGPL impose de laisser vos utilisateurs accéder au code source de la version que vous exécutez. Si vous modifiez K-Gantt, publiez vos modifications et faites pointer `source_url` (dans `inc/config.php`) vers ce code. Le lien « Code source » de l'application l'affiche automatiquement.

Pour **ajouter un modèle de calendrier** pour une classe :
1. réglez le calendrier dans l'application ;
2. cliquez sur *Partager ce modèle (.json)* ;
3. déposez le fichier dans `public/modeles/calendriers/` sur le serveur.

Il apparaît aussitôt dans la liste « Partir d'un modèle ».

## Développement

```bash
# Serveur local
php -S localhost:8080 -t public        # ou : npm run serve

# Tests du moteur (calendrier, planification, CSV) — Node.js ≥ 18
npm test

# Régénérer les modèles de calendrier fournis et le projet d'exemple
node tools/generer-modeles.mjs
```

### Organisation du code

| Fichier | Rôle |
|---|---|
| `public/index.php` | Page unique ; liste les modèles de calendrier |
| `assets/js/dates.js` | Dates, semaines ISO, demi-journées, jours fériés |
| `assets/js/calendar.js` | Calendrier de rythme : type de chaque demi-journée (école / entreprise / libre) |
| `assets/js/scheduler.js` | Moteur de planification : dates, groupes, avancement attendu, retards |
| `assets/js/project.js` | Modèle de données, validation des fichiers, arborescence, détection des boucles |
| `assets/js/store.js` | État, annuler / rétablir, brouillon local |
| `assets/js/gantt.js` | Rendu SVG du diagramme (écran et exports) |
| `assets/js/app.js` | Interface : tableau, interactions, clavier, menus |
| `assets/js/dialogs.js`, `calendar-ui.js` | Fenêtres : tâche, projet, ressources, export, aide, calendrier |
| `assets/js/export.js`, `csv.js` | Exports JSON, CSV, PNG, PDF |
| `assets/js/ical.js` | Génération iCalendar (.ics) et dates calculées enregistrées dans le fichier |
| `assets/js/ganttproject.js`, `xml.js` | Import des fichiers GanttProject (.gan) |
| `public/ical.php`, `inc/ical-lib.php` | Abonnement iCal côté serveur (même résultat que `ical.js`, vérifié par les tests) |
| `assets/vendor/jspdf.umd.min.js` | [jsPDF](https://github.com/parallax/jsPDF) 2.5.1 (MIT) |
| `tests/` | Tests unitaires (`node --test`) |

Pas de framework ni d'étape de compilation : les fichiers sont des modules ES servis tels quels.

### Format de fichier `.kgantt.json` (version 1)

```jsonc
{
  "format": "kgantt", "version": 1,
  "project":  { "id": "p…", "name": "…", "team": "…", "className": "…", "teacher": "…", "start": "2026-09-07", "halfDays": false },
  "calendar": {
    "format": "kgantt-calendar", "version": 1, "name": "…",
    "weekTemplates": { "school": [["school","school"], …7 jours], "company": [ … ] }, // [matin, après-midi]
    "defaultWeek": "school",                                    // rythme fixe
    "cycle": { "anchor": "2026-08-31", "weeks": ["school","company"] }, // ou alternance (null sinon)
    "weeks": { "2026-W44": "off" },                             // semaines forcées
    "periods": [{ "start": "2026-10-17", "end": "2026-11-01", "type": "off", "label": "Toussaint" }],
    "days": {}, "publicHolidays": true
  },
  "resources": [{ "id": "lea", "name": "Léa", "color": "#4f46e5" }],
  "tasks": [{
    "id": "t1", "name": "Analyse", "parent": null, "type": "task",   // ou "milestone"
    "duration": 2, "where": "school",                                // "school" | "company" | "any"
    "notBefore": null, "deps": [], "progress": 50, "resources": ["lea"],
    "color": null, "notes": "", "collapsed": false,
    "log": [{ "date": "2026-09-14", "progress": 50, "note": "…" }]
  }],
  "baseline": { "date": "2026-09-07", "tasks": { "t1": { "start": "2026-09-07", "end": "2026-09-08:pm" } } },
  "view": { "zoom": "week", "showBaseline": true },
  // Ajouté à l'enregistrement, ignoré à l'ouverture : dates calculées pour l'abonnement iCal
  "computed": { "generatedAt": "…", "tasks": { "t1": { "start": "…", "end": "…", "runs": [["2026-09-07", "2026-09-08:pm"]], "progress": 50, "status": "progress" } } }
}
```

Une demi-journée s'écrit `AAAA-MM-JJ` pour le matin et `AAAA-MM-JJ:pm` pour l'après-midi.

## Feuille de route

Voir [docs/PLAN.md](docs/PLAN.md).

## Contribuer

Les contributions sont les bienvenues : signalements, idées, documentation, code. Lisez [CONTRIBUTING.md](CONTRIBUTING.md) et le [code de conduite](CODE_OF_CONDUCT.md). Pour une faille de sécurité, voir [SECURITY.md](SECURITY.md). Les évolutions sont listées dans [CHANGELOG.md](CHANGELOG.md).

Contact : **kgantt@phoen-ix.net**

## Licence

Copyright © 2026 karhel et les contributeurs de K-Gantt.

K-Gantt est distribué sous licence **GNU Affero General Public License v3.0 ou ultérieure** (AGPL-3.0-or-later). Le texte complet est dans [LICENSE](LICENSE).

En résumé : vous pouvez utiliser, modifier et redistribuer K-Gantt, y compris dans un cadre commercial. Toute version modifiée doit rester sous la même licence, et **si vous la proposez en ligne, vous devez en fournir le code source à ses utilisateurs**.

Composant tiers : [jsPDF](https://github.com/parallax/jsPDF) 2.5.1, licence MIT (`public/assets/vendor/jspdf.LICENSE.txt`).
