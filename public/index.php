<?php
/**
 * K-Gantt — page unique de l'application.
 * Aucune donnée n'est stockée côté serveur : PHP sert uniquement la page
 * et la liste des modèles de calendrier déposés dans /modeles/calendriers.
 */
declare(strict_types=1);

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
  <header class="topbar">
    <a class="brand" href="./" title="K-Gantt">
      <span class="brand-mark" aria-hidden="true">K</span>
      <span class="brand-name">K-<b>Gantt</b></span>
    </a>
    <button class="project-title" id="project-title" type="button" title="Informations du projet">
      <span class="project-name" id="project-name">Mon projet</span>
      <span class="project-sub" id="project-sub"></span>
    </button>
    <span class="save-state" id="save-state"></span>
    <div class="topbar-actions">
      <div class="menu" data-menu>
        <button class="btn btn-ghost" type="button" data-menu-toggle data-icon="file">Fichier</button>
        <div class="menu-list" role="menu">
          <button type="button" data-action="new" data-icon="plus">Nouveau projet…</button>
          <button type="button" data-action="open" data-icon="folder">Ouvrir un fichier…<kbd>Ctrl+O</kbd></button>
          <button type="button" data-action="save" data-icon="save">Enregistrer (.json)<kbd>Ctrl+S</kbd></button>
          <hr>
          <button type="button" data-action="import-gan" data-icon="upload">Importer depuis GanttProject (.gan)…</button>
          <button type="button" data-action="example" data-icon="sparkles">Ouvrir l’exemple</button>
        </div>
      </div>
      <div class="menu" data-menu>
        <button class="btn btn-ghost" type="button" data-menu-toggle data-icon="download">Exporter</button>
        <div class="menu-list" role="menu">
          <button type="button" data-action="export-pdf" data-icon="pdf">PDF…</button>
          <button type="button" data-action="export-png" data-icon="image">Image PNG…</button>
          <button type="button" data-action="export-csv" data-icon="table">CSV (Excel)</button>
          <button type="button" data-action="export-json" data-icon="code">JSON</button>
          <hr>
          <button type="button" data-action="export-ics" data-icon="calendar">Agenda iCal (.ics) et synchronisation…</button>
        </div>
      </div>
      <button class="btn btn-icon btn-ghost" type="button" data-action="theme" data-icon="moon" title="Mode clair / sombre"></button>
      <button class="btn btn-icon btn-ghost" type="button" data-action="help" data-icon="help" title="Aide et raccourcis"></button>
    </div>
  </header>

  <nav class="toolbar" aria-label="Outils">
    <div class="tb-group">
      <button class="btn btn-primary" type="button" data-action="add-task" data-icon="plus" title="Ajouter une tâche (Insert)">Tâche</button>
      <button class="btn" type="button" data-action="add-milestone" data-icon="diamond" title="Ajouter un jalon">Jalon</button>
    </div>
    <div class="tb-group">
      <button class="btn btn-icon" type="button" data-action="outdent" data-icon="outdent" title="Remonter d’un niveau (Alt+←)"></button>
      <button class="btn btn-icon" type="button" data-action="indent" data-icon="indent" title="Transformer en sous-tâche (Alt+→)"></button>
      <button class="btn btn-icon" type="button" data-action="move-up" data-icon="up" title="Monter (Alt+↑)"></button>
      <button class="btn btn-icon" type="button" data-action="move-down" data-icon="down" title="Descendre (Alt+↓)"></button>
      <button class="btn btn-icon" type="button" data-action="edit" data-icon="edit" title="Modifier la tâche (Entrée)"></button>
      <button class="btn btn-icon" type="button" data-action="delete" data-icon="trash" title="Supprimer (Suppr)"></button>
    </div>
    <div class="tb-group">
      <button class="btn btn-icon" type="button" data-action="undo" data-icon="undo" title="Annuler (Ctrl+Z)"></button>
      <button class="btn btn-icon" type="button" data-action="redo" data-icon="redo" title="Rétablir (Ctrl+Y)"></button>
    </div>
    <div class="tb-group segmented" role="group" aria-label="Échelle">
      <button type="button" data-zoom="day">Jour</button>
      <button type="button" data-zoom="week">Semaine</button>
      <button type="button" data-zoom="month">Mois</button>
    </div>
    <button class="btn" type="button" data-action="today" data-icon="target">Aujourd’hui</button>
    <span class="tb-spacer"></span>
    <div class="tb-group">
      <button class="btn" type="button" data-action="calendar" data-icon="calendar" title="Rythme école / entreprise, vacances">Calendrier</button>
      <button class="btn" type="button" data-action="resources" data-icon="users" title="Membres de l’équipe">Ressources</button>
      <div class="menu" data-menu>
        <button class="btn" type="button" data-menu-toggle data-icon="flag" title="Comparer le prévu et le réel">Prévu / réel</button>
        <div class="menu-list menu-right" role="menu">
          <button type="button" data-action="baseline-set" data-icon="flag">Figer la planification actuelle comme « prévu »</button>
          <button type="button" data-action="baseline-toggle" data-icon="eye" id="baseline-toggle">Masquer le prévu</button>
          <button type="button" data-action="baseline-clear" data-icon="x">Supprimer la référence</button>
        </div>
      </div>
    </div>
  </nav>

  <main class="workspace">
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
  ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?></script>
  <script src="<?= $asset('assets/vendor/jspdf.umd.min.js') ?>" defer></script>
  <script type="module" src="<?= $asset('assets/js/app.js') ?>"></script>
</body>
</html>
