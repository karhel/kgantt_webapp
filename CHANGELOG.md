# Journal des modifications

Ce fichier suit le format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le [versionnage sémantique](https://semver.org/lang/fr/).

## [Non publié]

### Modifié
- Nouvelle identité visuelle sobre autour de l'orange ; suppression des dégradés, halos, flous et effets décoratifs.
- Accessibilité WCAG 2.1 AA : contrastes vérifiés, navigation complète au clavier, étiquettes et états exposés aux lecteurs d'écran, information jamais portée par la seule couleur (voir `docs/ACCESSIBILITE.md`).
- Messages d'erreur explicites pour les saisies invalides.
- Le tableau ne masque plus le diagramme dans une fenêtre étroite.

## [1.0.0] — 2026-10-13

Première version publique.

### Ajouté
- Diagramme de Gantt : tâches, sous-tâches, jalons, liens fin → début, ressources, avancement, référence prévu / réel.
- Calendrier d'alternance école / entreprise à la demi-journée, avec des modèles partageables.
- Durées en jours de présence selon le lieu de la tâche (école, entreprise, partout).
- Journal d'avancement daté et détection des retards.
- Fichiers `.kgantt.json` (aucun stockage sur le serveur) et brouillon local.
- Exports PDF, PNG, CSV, JSON et iCal (.ics).
- Import des projets GanttProject (.gan).
- Abonnement iCal sans stockage (`ical.php`).
- Mode sombre, raccourcis clavier, aide intégrée.
- Mentions légales et politique de confidentialité.
- Publication en logiciel libre sous licence AGPL-3.0-or-later.
