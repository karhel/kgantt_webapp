# Accessibilité de K-Gantt

**Référentiel :** WCAG 2.1, niveau AA (avec certains critères 2.2)
**Date de l'audit :** 13 octobre 2026
**Branche :** `claude/ux-accessibilite`

## Synthèse

| | Avant | Après |
|---|---|---|
| Règles axe-core en échec (WCAG 2.0/2.1/2.2 A et AA, bonnes pratiques) | 7 | **0** |
| Éléments en échec | 161 | **0** |
| Parcours clavier scripté (18 vérifications) | — | **18 / 18** |
| Défilement horizontal de la page à 200 % de zoom (720 px) | — | aucun |

Les écrans audités en thème clair et en thème sombre :
- l'accueil vide et le projet d'exemple ;
- les fenêtres tâche, calendrier, équipe, export PDF, iCal, aide et projet ;
- la page des mentions légales.

Un audit automatique ne détecte qu'environ un tiers des problèmes. Les points suivants ont donc aussi été vérifiés à la main : clavier, focus, information portée par la couleur, textes alternatifs, structure.

## Corrections

### Perceptible
| # | Problème | Critère | Gravité | Correction |
|---|---|---|---|---|
| 1 | Contrastes insuffisants : échelle de temps (4,3:1), état « Non enregistré » (3,2:1), semaines du calendrier | 1.4.3 | 🔴 | Nouvelle palette mesurée : texte secondaire ≥ 5,9:1, orange 5,2:1 sur blanc |
| 2 | Jours « Entreprise » et état des tâches signalés par la couleur seule | 1.4.1 | 🔴 | Hachures pour l'entreprise ; icônes d'état de formes différentes (coche, demi-disque, triangle, cercle) ; « en retard » écrit en toutes lettres dans le diagramme ; contour pointillé |
| 3 | Bordures des champs trop pâles | 1.4.11 | 🟡 | Contours à 3,5:1 (clair) et 4,5:1 (sombre) ; barres du diagramme cerclées en thème sombre |
| 4 | Texte blanc du pourcentage dessiné sur des barres semi-transparentes | 1.4.3 | 🟡 | Supprimé : le pourcentage est dans le tableau et dans l'infobulle de la barre |
| 5 | Lettres des jours à 9 px | 1.4.4 | 🟢 | 11 px minimum |
| 6 | Le diagramme SVG, purement graphique, était exposé aux lecteurs d'écran | 1.1.1 | 🟡 | `aria-hidden` ; le tableau en est l'équivalent textuel, présenté par une description cachée |

### Utilisable
| # | Problème | Critère | Gravité | Correction |
|---|---|---|---|---|
| 7 | Entrée, Suppr et les flèches détournées par les raccourcis globaux même sur un bouton : Entrée sur « Calendrier » ouvrait la fiche de la tâche | 2.1.1 | 🔴 | Les raccourcis ne s'appliquent plus sur les boutons ni sur les liens |
| 8 | Cases « Ressources » masquées (`display:none`) : inaccessibles au clavier | 2.1.1 | 🔴 | Cases visibles et focalisables |
| 9 | Dates du tableau cliquables seulement à la souris | 2.1.1 | 🟡 | Boutons, qui ouvrent la fiche de la tâche |
| 10 | Séparateur du tableau réglable seulement à la souris | 2.1.1 | 🟢 | `role="separator"` réglable aux flèches, Début et Fin |
| 11 | Menus : pas d'Échap, pas de flèches, pas d'`aria-expanded` | 2.1.1, 4.1.2 | 🟡 | Motif bouton + liste : flèches, Début, Fin, Échap, fermeture quand le focus quitte le menu |
| 12 | Focus perdu après chaque redessin : Tab dans le tableau, boutons du calendrier, repli d'un groupe | 2.4.3 | 🔴 | Focus restauré sur l'élément équivalent |
| 13 | Liste « Doit attendre la fin de… » défilante sans accès clavier | 2.1.1 | 🟡 | Zone focalisable et nommée |
| 14 | Pas de lien d'évitement ni de `h1` | 2.4.1, 1.3.1 | 🟡 | Lien « Aller au planning », titre de niveau 1, zones (`header`, `nav`, `main`, `footer`) nommées |
| 15 | Focus peu visible sur certains contrôles | 2.4.7 | 🟡 | Contour orange de 2 px uniforme (`:focus-visible`) |
| 16 | Cibles de 20 px (repli des groupes, suppression d'une entrée du journal) | 2.5.8 (2.2) | 🟢 | 24 px minimum |
| 17 | Animations sans prise en compte des préférences | 2.3.3 | 🟢 | `prefers-reduced-motion` respecté |

### Compréhensible
| # | Problème | Critère | Gravité | Correction |
|---|---|---|---|---|
| 18 | Saisies invalides corrigées sans explication (nom vide, durée nulle, 150 %) | 3.3.1 | 🟡 | Message d'erreur explicite, annoncé (`role="alert"`) |
| 19 | Champs sans étiquette : tableau, curseur d'avancement, demi-journée, équipe, cycle d'alternance | 3.3.2 | 🔴 | Étiquettes visibles ou `aria-label` contextualisés (« Durée en jours de présence, tâche 1.2 ») |
| 20 | Groupes de boutons radio sans légende | 1.3.1 | 🟡 | `fieldset` et `legend` |
| 21 | Notifications effacées au bout de 3,8 s | 2.2.1 | 🟢 | Durée proportionnelle à la longueur du message, au moins 8 s pour une erreur |

### Robuste
| # | Problème | Critère | Gravité | Correction |
|---|---|---|---|---|
| 22 | Boutons-icônes nommés seulement par `title` | 4.1.2 | 🟡 | `aria-label` (et `aria-keyshortcuts`) |
| 23 | États non exposés : échelle choisie, pinceau, couleur, ligne sélectionnée, groupe replié | 4.1.2 | 🟡 | `aria-pressed`, `aria-current`, `aria-expanded` |
| 24 | Fenêtres sans nom accessible | 4.1.2 | 🟡 | `aria-labelledby` vers le titre ; bouton « Fermer » nommé |

## Contrastes (mesurés)

| Élément | Clair | Sombre | Minimum |
|---|---|---|---|
| Texte principal | 15,2:1 | 13,6:1 | 4,5:1 |
| Texte secondaire (sur la surface la plus foncée) | 5,9:1 | 5,9:1 | 4,5:1 |
| Liens et texte orange | 5,2:1 | 7,7:1 | 4,5:1 |
| Bouton principal | 5,2:1 | 7,7:1 | 4,5:1 |
| Erreur / retard | 6,5:1 | 6,3:1 | 4,5:1 |
| Contour des champs | 3,5:1 | 4,5:1 | 3:1 |
| Ligne « aujourd'hui » | 6,5:1 | 6,3:1 | 3:1 |

Couleurs des barres (≥ 3:1 sur fond clair) : orange `#c2410c`, bleu `#1d4ed8`, sarcelle `#0f766e`, vert `#15803d`, violet `#7e22ce`, framboise `#be185d`, brun `#854d0e`, ardoise `#475569`.

## Clavier

| Élément | Tab | Entrée / Espace | Échap | Flèches |
|---|---|---|---|---|
| Lien d'évitement | 1er arrêt | va au planning | — | — |
| Menus Fichier, Exporter, Prévu / réel | bouton | ouvre ou ferme | ferme, focus rendu au bouton | ↓ / ↑ ouvrent puis parcourent ; Début / Fin |
| Échelle Jour / Semaine / Mois | chaque bouton | choisit (`aria-pressed`) | — | — |
| Ligne du tableau | champs dans l'ordre | Entrée sur le nom : ligne suivante ou nouvelle tâche | annule la saisie | ↑ ↓ sur le nom : ligne précédente / suivante ; Alt + flèches : niveau et ordre |
| Date d'une ligne | bouton | ouvre la fiche | — | — |
| Séparateur du tableau | arrêt | — | — | ← → (Maj : pas plus grand), Début, Fin |
| Fenêtres | piégé dans la fenêtre (natif) | — | ferme, focus rendu au déclencheur | — |
| Calendrier : demi-journées et semaines | chaque bouton | change le type, focus conservé | — | — |

Raccourcis globaux, hors champs de saisie et hors boutons :
- Inser : nouvelle tâche ;
- Entrée : ouvrir la fiche ;
- Suppr : supprimer ;
- ↑ ↓ : changer de ligne ;
- F2 : renommer ;
- Ctrl + Z / Y : annuler / rétablir ;
- Ctrl + S / O : enregistrer / ouvrir.

## Lecteurs d'écran (structure exposée)

| Élément | Annonce |
|---|---|
| Ligne du tableau | « Tâche 1.2 : Rédaction du cahier des charges, groupe » |
| Nom, durée, lieu, avancement | « Nom, tâche 1.2 », « Durée en jours de présence, tâche 1.2 »… |
| État | « En retard (réalisé 30 %, attendu 100 %) » |
| Date | « Début : mer. 9 sept. 2026, matin. Ouvrir la fiche de la tâche 1.2 » |
| Repli d'un groupe | « Replier le groupe Cadrage, réduit / développé » |
| Demi-journée du calendrier | « Lundi matin, semaine école : École » |
| Semaine | « Semaine 40 du 28/09 : Entreprise (modifiée), 0 j d’école, 5 j en entreprise » |

## Limites connues

- **Diagramme à la souris :** glisser une barre, l'étirer ou tracer un lien ne se fait qu'à la souris. Toutes ces actions existent aussi au clavier dans la fiche de la tâche (Entrée) : date « ne pas commencer avant », durée, tâches à attendre. Le diagramme est volontairement masqué aux lecteurs d'écran, qui passent par le tableau.
- **Pas de test avec un vrai lecteur d'écran :** NVDA, JAWS et VoiceOver n'ont pas été utilisés. C'est l'étape suivante recommandée, idéalement avec des élèves concernés.
- **Exports PDF et PNG :** ce sont des images, sans texte balisé. Pour une version accessible, utiliser l'export CSV (tableur) ou iCal.
- **Écrans tactiles et mobiles :** hors du périmètre (application prévue pour ordinateur).

## Refaire l'audit

```bash
php -S localhost:8080 -t public &                # application
npm install --no-save playwright axe-core        # outils d'audit (non requis pour l'application)
npx playwright install chromium
node tools/audit-accessibilite.cjs               # 0 règle en échec attendu
```
