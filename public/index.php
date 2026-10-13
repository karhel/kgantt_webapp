<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * K-Gantt — page unique de l'application.
 * Aucune donnée n'est stockée côté serveur : PHP sert uniquement la page
 * et la liste des modèles de calendrier déposés dans /modeles/calendriers.
 */
declare(strict_types=1);

require __DIR__ . '/inc/config.php';

const KGANTT_VERSION = '1.0.0';

/** Liste des modèles de calendrier partagés (fichiers JSON du dossier modeles/calendriers). */
function kgantt_models(): array
{
    $models = [];
    foreach (glob(__DIR__ . '/modeles/calendriers/*.json') ?: [] as $file) {
        $data = json_decode((string) file_get_contents($file), true);
        if (!is_array($data) || ($data['format'] ?? '') !== 'kgantt-calendar') {
            continue;
        }
        $models[] = [
            'file' => 'modeles/calendriers/' . rawurlencode(basename($file)),
            'name' => (string) ($data['name'] ?? basename($file, '.json')),
            'description' => (string) ($data['description'] ?? ''),
        ];
    }
    usort($models, fn ($a, $b) => strcasecmp($a['name'], $b['name']));
    return $models;
}

$asset = function (string $path): string {
    $full = __DIR__ . '/' . $path;
    $v = is_file($full) ? (string) filemtime($full) : KGANTT_VERSION;
    return htmlspecialchars($path . '?v=' . $v, ENT_QUOTES);
};

header('Content-Type: text/html; charset=utf-8');
?><!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>K-Gantt</title>
  <meta name="description" content="K-Gantt : diagrammes de Gantt simples pour les projets étudiants, avec calendrier d'alternance école / entreprise.">
  <link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="<?= $asset('assets/css/app.css') ?>">
  <script>
    // Thème appliqué avant l'affichage pour éviter un flash.
    try {
      const t = localStorage.getItem('kgantt:theme');
      if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
    } catch (e) {}
  </script>
</head>
<body>
  <a class="skip-link" href="#planning">Aller au planning</a>
  <header class="topbar">
    <h1 class="sr-only" id="page-title">K-Gantt, planification de projet</h1>
    <a class="brand" href="./">
      <svg class="brand-mark" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" focusable="false">
        <rect x="1" y="3" width="11" height="4" rx="1" fill="currentColor"/>
        <rect x="6" y="9" width="14" height="4" rx="1" fill="currentColor"/>
        <rect x="3" y="15" width="8" height="4" rx="1" fill="currentColor"/>
      </svg>
      <span class="brand-name">K-Gantt</span>
    </a>
    <button class="project-title" id="project-title" type="button" aria-describedby="project-sub">
      <span class="project-name" id="project-name">Mon projet</span>
      <span class="project-sub" id="project-sub"></span>
    </button>
    <span class="save-state" id="save-state" role="status"></span>
    <div class="topbar-actions">
      <div class="menu" data-menu>
        <button class="btn btn-ghost" type="button" data-menu-toggle aria-expanded="false" aria-controls="menu-fichier" data-icon="file">Fichier</button>
        <div class="menu-list" id="menu-fichier">
          <button type="button" data-action="new" data-icon="plus">Nouveau projet…</button>
          <button type="button" data-action="open" data-icon="folder" aria-keyshortcuts="Control+O">Ouvrir un fichier…<kbd>Ctrl+O</kbd></button>
          <button type="button" data-action="save" data-icon="save" aria-keyshortcuts="Control+S">Enregistrer (.json)<kbd>Ctrl+S</kbd></button>
          <hr>
          <button type="button" data-action="import-gan" data-icon="upload">Importer depuis GanttProject (.gan)…</button>
          <button type="button" data-action="example" data-icon="file">Ouvrir le projet d’exemple</button>
        </div>
      </div>
      <div class="menu" data-menu>
        <button class="btn btn-ghost" type="button" data-menu-toggle aria-expanded="false" aria-controls="menu-export" data-icon="download">Exporter</button>
        <div class="menu-list" id="menu-export">
          <button type="button" data-action="export-pdf" data-icon="pdf">PDF…</button>
          <button type="button" data-action="export-png" data-icon="image">Image PNG…</button>
          <button type="button" data-action="export-csv" data-icon="table">Tableau CSV (Excel)</button>
          <button type="button" data-action="export-json" data-icon="code">Fichier JSON</button>
          <hr>
          <button type="button" data-action="export-ics" data-icon="calendar">Agenda iCal et synchronisation…</button>
        </div>
      </div>
      <button class="btn btn-icon btn-ghost" type="button" data-action="theme" data-icon="moon" aria-label="Passer en thème sombre" title="Thème clair ou sombre"></button>
      <button class="btn btn-icon btn-ghost" type="button" data-action="help" data-icon="help" aria-label="Aide et raccourcis clavier" title="Aide et raccourcis clavier"></button>
    </div>
  </header>

  <nav class="toolbar" aria-label="Outils du planning">
    <div class="tb-group" role="group" aria-label="Ajouter">
      <button class="btn btn-primary" type="button" data-action="add-task" data-icon="plus" aria-keyshortcuts="Insert">Nouvelle tâche</button>
      <button class="btn" type="button" data-action="add-milestone" data-icon="diamond">Nouveau jalon</button>
    </div>
    <div class="tb-group" role="group" aria-label="Tâche sélectionnée">
      <button class="btn btn-icon" type="button" data-action="outdent" data-icon="outdent" aria-label="Remonter d’un niveau" title="Remonter d’un niveau (Alt+←)" aria-keyshortcuts="Alt+ArrowLeft"></button>
      <button class="btn btn-icon" type="button" data-action="indent" data-icon="indent" aria-label="Transformer en sous-tâche" title="Transformer en sous-tâche (Alt+→)" aria-keyshortcuts="Alt+ArrowRight"></button>
      <button class="btn btn-icon" type="button" data-action="move-up" data-icon="up" aria-label="Monter la tâche" title="Monter la tâche (Alt+↑)" aria-keyshortcuts="Alt+ArrowUp"></button>
      <button class="btn btn-icon" type="button" data-action="move-down" data-icon="down" aria-label="Descendre la tâche" title="Descendre la tâche (Alt+↓)" aria-keyshortcuts="Alt+ArrowDown"></button>
      <button class="btn btn-icon" type="button" data-action="edit" data-icon="edit" aria-label="Modifier la tâche" title="Modifier la tâche (Entrée)" aria-keyshortcuts="Enter"></button>
      <button class="btn btn-icon" type="button" data-action="delete" data-icon="trash" aria-label="Supprimer la tâche" title="Supprimer la tâche (Suppr)" aria-keyshortcuts="Delete"></button>
    </div>
    <div class="tb-group" role="group" aria-label="Historique">
      <button class="btn btn-icon" type="button" data-action="undo" data-icon="undo" aria-label="Annuler" title="Annuler (Ctrl+Z)" aria-keyshortcuts="Control+Z"></button>
      <button class="btn btn-icon" type="button" data-action="redo" data-icon="redo" aria-label="Rétablir" title="Rétablir (Ctrl+Y)" aria-keyshortcuts="Control+Y"></button>
    </div>
    <div class="tb-group segmented" role="group" aria-label="Échelle de temps">
      <button type="button" data-zoom="day" aria-pressed="false">Jour</button>
      <button type="button" data-zoom="week" aria-pressed="false">Semaine</button>
      <button type="button" data-zoom="month" aria-pressed="false">Mois</button>
    </div>
    <button class="btn" type="button" data-action="today" data-icon="target">Aujourd’hui</button>
    <span class="tb-spacer"></span>
    <div class="tb-group" role="group" aria-label="Paramètres du projet">
      <button class="btn" type="button" data-action="calendar" data-icon="calendar">Calendrier</button>
      <button class="btn" type="button" data-action="resources" data-icon="users">Équipe</button>
      <div class="menu" data-menu>
        <button class="btn" type="button" data-menu-toggle aria-expanded="false" aria-controls="menu-prevu" data-icon="flag">Prévu / réel</button>
        <div class="menu-list menu-right" id="menu-prevu">
          <button type="button" data-action="baseline-set" data-icon="flag">Figer le planning actuel comme « prévu »</button>
          <button type="button" data-action="baseline-toggle" data-icon="eye" id="baseline-toggle">Masquer le prévu</button>
          <button type="button" data-action="baseline-clear" data-icon="x">Supprimer le prévu</button>
        </div>
      </div>
    </div>
  </nav>

  <main class="workspace" id="planning" tabindex="-1" aria-label="Planning">
    <p class="sr-only" id="gantt-help">Le tableau des tâches est modifiable au clavier. Le diagramme à droite en est la représentation graphique ; toutes ses actions (dates, durées, liens) sont aussi disponibles dans la fiche d’une tâche, ouverte avec la touche Entrée.</p>
    <div id="gantt" class="gantt"></div>
    <div id="empty" class="empty" hidden></div>
  </main>

  <footer class="statusbar" id="statusbar"></footer>

  <div class="toasts" id="toasts" aria-live="polite"></div>
  <div class="drop-overlay" id="drop-overlay" hidden><div>Déposez votre fichier <b>.json</b> (ou <b>.gan</b> GanttProject) pour l’ouvrir</div></div>

  <script type="application/json" id="kg-config"><?= json_encode([
      'version' => KGANTT_VERSION,
      'models' => kgantt_models(),
      'example' => 'exemples/projet-exemple.kgantt.json',
      'sourceUrl' => kgantt_config()['source_url'],
      'contact' => kgantt_config()['contact'],
      'legalUrl' => 'mentions-legales.php',
  ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?></script>
  <script src="<?= $asset('assets/vendor/jspdf.umd.min.js') ?>" defer></script>
  <script type="module" src="<?= $asset('assets/js/app.js') ?>"></script>
</body>
</html>
