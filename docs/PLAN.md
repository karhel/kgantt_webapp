# K-Gantt — Plan de développement

## Décisions de cadrage

| Sujet | Décision |
|---|---|
| Comptes / stockage | Aucun compte, aucune base de données, rien sur le serveur. Fichiers `.json` + brouillon dans le navigateur. |
| Rythme | Semaine type fixe **et** alternance de semaines, avec des modèles partageables (fichiers JSON). |
| Qui règle le calendrier | L'enseignant crée le modèle de la classe ; l'étudiant l'importe et peut l'ajuster. |
| Unité de durée | Le jour, avec la demi-journée en option. |
| Lieu des tâches | École / Entreprise / Partout. |
| Vacances | Saisies dans le calendrier de rythme (périodes) ; jours fériés français automatiques. |
| Dépendances | Fin → début uniquement (V1). |
| Ressources, prévu / réel | Oui. Pas de chemin critique pour l'instant. |
| Avancement | % par tâche + journal daté ; % global pondéré par les durées. |
| Exports | PDF (A4 / A3 paysage, en-tête), PNG, CSV (`;`), JSON, iCal (.ics). |
| Import | GanttProject (.gan). |
| Synchronisation agenda | Abonnement iCal via `ical.php`, qui lit un `.kgantt.json` déposé publiquement par l'étudiant (rien n'est stocké). |
| Technique | PHP 8 + HTML + JS (modules ES), rendu Gantt fait maison en SVG, jsPDF hébergé localement. |
| Cible | Ordinateur, interface en français, mode sombre. Hébergement o2switch sur `kgantt.phoen-ix.net`. |
| Identité visuelle | Famille « K- » (comme kgrades / kshare) : à aligner, voir lot 6. |

## Lots

### ✅ Lot 1 — Socle et moteur
- [x] Structure du projet, `index.php`, `.htaccess` (HTTPS, en-têtes de sécurité, cache)
- [x] Dates, semaines ISO, demi-journées, jours fériés (Pâques, Ascension, Pentecôte)
- [x] Calendrier de rythme : semaines types, cycle d'alternance, semaines forcées, périodes, exceptions
- [x] Planification : durées en jours de présence selon le lieu, dépendances, « pas avant », groupes, détection des boucles
- [x] Avancement attendu à la date du jour et état (à faire, en cours, terminée, en retard)
- [x] Tests unitaires (`npm test`)

### ✅ Lot 2 — Interface Gantt
- [x] Tableau éditable : nom, durée, lieu, % ; saisie rapide (Entrée = ligne suivante / nouvelle tâche)
- [x] Diagramme SVG : fond école / entreprise / libre, jours travaillés pleins, avancement, jalons, groupes, liens
- [x] Glisser pour déplacer / redimensionner / lier ; clic pour supprimer un lien
- [x] Sous-tâches (Alt+→ / Alt+←), réordonnancement, repli des groupes
- [x] Zooms Jour / Semaine / Mois, bouton « Aujourd'hui », tableau redimensionnable
- [x] Annuler / rétablir, raccourcis clavier, aide intégrée
- [x] Thème clair / sombre

### ✅ Lot 3 — Calendrier et modèles
- [x] Fenêtre Calendrier : semaines types à la demi-journée, rythme fixe ou alternance, pinceau semaine par semaine, périodes, aperçu sur 12 mois
- [x] Modèles fournis (temps plein, 2 j / 3 j, 3 j / 2 j, 1 / 1 sem., 2 / 2 sem., 1 / 3 sem.)
- [x] Partage et import d'un modèle (`.kgantt-calendar.json`) ; modèles serveur listés automatiquement par PHP

### ✅ Lot 4 — Suivi et fichiers
- [x] Fenêtre tâche : type, durée, lieu, « pas avant », ressources, dépendances, couleur, notes
- [x] Journal d'avancement daté avec note
- [x] Ressources (membres de l'équipe)
- [x] Prévu / réel : figer, afficher / masquer, supprimer la référence
- [x] Ouvrir / enregistrer `.kgantt.json`, glisser-déposer, brouillon local, alerte avant fermeture
- [x] Exports CSV, JSON, PNG, PDF (une page ou plusieurs pages)
- [x] Projet d'exemple

### ✅ Lot 4 bis — GanttProject et agendas
- [x] Import `.gan` : arborescence, jalons, liens (autres types convertis en fin → début), avancement, notes, couleurs, ressources, affectations, jours fériés datés
- [x] Options d'import : calendrier, lieu des tâches, conservation des dates d'origine ; aperçu et avertissements
- [x] Export `.ics` : un évènement par période travaillée ou par tâche, identifiants stables
- [x] Dates calculées enregistrées dans le `.kgantt.json` (section `computed`)
- [x] `ical.php` : abonnement sans stockage, conversion des liens de partage (Nextcloud, Dropbox, Google Drive, GitHub), protection contre l'accès au réseau interne
- [x] Tests : lecteur XML, import, iCal, parité PHP / JS

### ⏳ Lot 5 — Recette avec une classe pilote
- [ ] Tester avec un groupe d'étudiants sur un vrai projet (et un vrai calendrier d'alternance)
- [ ] Recueillir les retours : vocabulaire, raccourcis, lisibilité des exports
- [ ] Vérifier sur Firefox, Chrome, Edge et Safari récents
- [ ] Tester l'abonnement iCal en conditions réelles (Nextcloud de l'établissement, Google Agenda, Outlook)
- [ ] Déploiement sur `kgantt.phoen-ix.net`

### 🔜 Lot 6 — Améliorations proposées
- [ ] **Identité visuelle** alignée sur kgrades / kshare (couleurs, police, logo) : à fournir. Tout est centralisé dans les variables CSS de `app.css`.
- [ ] Jours exceptionnels en cliquant sur l'en-tête du diagramme (ex. sortie scolaire)
- [ ] Filtre par ressource, et charge par personne
- [ ] Chemin critique (mis de côté pour l'instant)
- [ ] Autres types de liens (début → début, fin → fin), décalages (« 2 jours après »)
- [ ] Copier / coller et multi-sélection de tâches
- [ ] Modèles de projet (trames de tâches types fournies par l'enseignant)
- [ ] Export PDF du journal d'avancement (pour l'évaluation)
- [ ] Mode lecture seule « enseignant » pour ouvrir plusieurs fichiers d'étudiants
- [ ] Export vers GanttProject (.gan), si besoin pendant la transition

## Points d'attention

- **Sauvegarde** : sans compte, le fichier `.json` *est* la sauvegarde. L'interface rappelle les modifications non enregistrées. Le brouillon local n'est qu'un filet de sécurité, propre à un navigateur et à un poste.
- **Retards** : une tâche est « en retard » si son % réalisé est inférieur d'au moins 10 points au % attendu, calculé sur les jours travaillés déjà écoulés.
- **Déplacement à la souris** : déplacer une barre fixe une date « ne pas commencer avant ». Les dépendances et le calendrier restent prioritaires ; la barre se cale alors sur le premier créneau possible.

## Conformité aux conventions des diagrammes de Gantt

Référentiels : usages PMI / PMBOK, MS Project et GanttProject, dates et semaines ISO 8601.

| Convention | État |
|---|---|
| Liste des tâches avec n° hiérarchique (WBS), nom, durée, début, fin, % | ✅ |
| Barres sur une échelle de temps, du début à la fin (dates de fin incluses) | ✅ |
| Jours non travaillés (week-ends, fériés, vacances) visibles sur la frise | ✅ |
| Échelles jour / semaine (n° ISO) / mois, ligne « aujourd'hui » | ✅ |
| Jalons en losange, durée nulle | ✅ |
| Jalon lié à une tâche : placé et daté à la **fin** de celle-ci | ✅ (corrigé : il pouvait être daté du samedi suivant) |
| Tâches récapitulatives (groupes) : barre noire à crochets, du début du 1er enfant à la fin du dernier | ✅ |
| Durée d'un groupe = étendue en jours travaillés | ✅ (corrigé : c'était la somme des sous-tâches) |
| Avancement d'un groupe pondéré par la durée des sous-tâches | ✅ |
| Liens fin → début fléchés, détection des boucles | ✅ |
| Avancement (%) dessiné dans la barre | ✅ |
| Référence (prévu) affichée sous la barre réelle | ✅ |
| Ressources affichées à côté des barres | ✅ |
| Légende, titre, date d'édition sur les exports | ✅ |
| Autres liens : début → début, fin → fin, début → fin | ❌ volontairement repoussé (lot 6) |
| Décalage / avance sur un lien (« +2 j ») | ❌ à prévoir (lot 6) |
| Chemin critique et marge | ❌ volontairement repoussé (lot 6) |
| Colonne « Prédécesseurs » dans le tableau | ⚠️ visible dans la fiche tâche et l'export CSV, pas dans le tableau |
