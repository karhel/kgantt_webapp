# Contribuer à K-Gantt

Merci de votre intérêt ! K-Gantt est un logiciel libre sous licence **AGPL-3.0-or-later**. Toutes les contributions sont les bienvenues : signalements de bugs, idées, traductions, documentation et code.

## Signaler un problème ou proposer une idée

- Ouvrez un ticket (*issue*) sur GitHub avec le modèle adapté : « Bug » ou « Idée ».
- Pour un bug, indiquez votre navigateur, les étapes pour reproduire le problème et, si possible, un fichier `.kgantt.json` d'exemple **sans données personnelles**.
- Pour une **faille de sécurité**, n'ouvrez pas de ticket public : suivez [SECURITY.md](SECURITY.md).

## Proposer une modification

1. Créez une branche à partir de `main`.
2. Lancez l'application et les tests :
   ```bash
   php -S localhost:8080 -t public     # application : http://localhost:8080
   npm test                            # tests (Node.js ≥ 18 et PHP ≥ 8.0 requis)
   ```
3. Ajoutez ou adaptez les tests de `tests/` quand vous modifiez le calendrier, la planification, les imports ou les exports.
4. Ouvrez une *pull request* qui décrit le changement et la façon de le vérifier.

## Conventions

- **Pas de framework ni d'étape de compilation** : modules JavaScript natifs servis tels quels, PHP sans dépendance.
- **Aucune donnée côté serveur** : ne pas introduire de base de données, de cookies, de traceurs ni de ressources externes (polices, CDN). C'est un engagement envers les utilisateurs, voir les mentions légales.
- **Interface en français**, vocabulaire simple pour des étudiants.
- Code : indentation de 2 espaces en JS / CSS et de 4 en PHP (voir `.editorconfig`). Les commentaires sont en français.
- Chaque fichier source commence par `SPDX-License-Identifier: AGPL-3.0-or-later`.
- Le moteur (`dates.js`, `calendar.js`, `scheduler.js`, `ical.js`…) ne dépend pas du DOM, pour rester testable avec Node.
- La génération iCal existe en JavaScript (`ical.js`) et en PHP (`inc/ical-lib.php`) ; un test vérifie que les deux produisent le même résultat. Modifiez-les ensemble.

## Licence des contributions

En proposant une contribution, vous acceptez qu'elle soit distribuée sous la licence du projet (AGPL-3.0-or-later). Vous conservez vos droits d'auteur. Vous déclarez avoir le droit de proposer ce code, par exemple s'il a été écrit dans un cadre scolaire ou professionnel.

## Code de conduite

Ce projet suit un [code de conduite](CODE_OF_CONDUCT.md). En participant, vous vous engagez à le respecter.
