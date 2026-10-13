<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * K-Gantt — mentions légales et politique de confidentialité.
 * Les informations de l'instance sont définies dans inc/config.php.
 */
declare(strict_types=1);

require __DIR__ . '/inc/config.php';

$c = kgantt_config();
$h = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
$editor = trim($c['editor']['name']);
$director = trim($c['publication_director']) ?: $editor;
$css = 'assets/css/app.css?v=' . (is_file(__DIR__ . '/assets/css/app.css') ? filemtime(__DIR__ . '/assets/css/app.css') : '1');

header('Content-Type: text/html; charset=utf-8');
?><!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mentions légales — <?= $h($c['site_name']) ?></title>
  <meta name="description" content="Mentions légales et politique de confidentialité de K-Gantt.">
  <link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="<?= $h($css) ?>">
  <script>
    try {
      const t = localStorage.getItem('kgantt:theme');
      if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
    } catch (e) {}
  </script>
</head>
<body class="page">
  <header class="topbar">
    <a class="brand" href="./" title="Retour à K-Gantt">
      <span class="brand-mark" aria-hidden="true">K</span>
      <span class="brand-name">K-<b>Gantt</b></span>
    </a>
    <div class="topbar-actions">
      <a class="btn" href="./">← Retour à l’application</a>
    </div>
  </header>

  <main class="legal">
    <h1>Mentions légales</h1>
    <p class="lead">Conformément à la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l’économie numérique (LCEN).</p>

    <?php if ($editor === ''): ?>
      <p class="legal-warning">⚠ Configuration incomplète : renseignez le nom de l’éditeur dans <code>inc/config.php</code>.</p>
    <?php endif; ?>

    <section>
      <h2>Éditeur du site</h2>
      <p>
        Le site <a href="<?= $h($c['site_url']) ?>"><?= $h(preg_replace('#^https?://#', '', $c['site_url'])) ?></a> est édité par
        <strong><?= $h($editor ?: '—') ?></strong>, <?= $h(lcfirst($c['editor']['status'])) ?>.<br>
        Contact : <a href="mailto:<?= $h($c['contact']) ?>"><?= $h($c['contact']) ?></a>
      </p>
      <p>Directeur de la publication : <strong><?= $h($director ?: '—') ?></strong>.</p>
    </section>

    <section>
      <h2>Hébergement</h2>
      <p>
        <strong><?= $h($c['host']['name']) ?></strong><br>
        <?= $h($c['host']['address']) ?><br>
        Téléphone : <?= $h($c['host']['phone']) ?><br>
        Site : <a href="<?= $h($c['host']['url']) ?>" rel="noopener"><?= $h(preg_replace('#^https?://#', '', $c['host']['url'])) ?></a>
      </p>
    </section>

    <section>
      <h2>Logiciel libre et propriété intellectuelle</h2>
      <p>
        K-Gantt est un <strong>logiciel libre</strong> distribué sous licence
        <a href="<?= $h($c['license_url']) ?>" rel="noopener">GNU Affero General Public License version 3 ou ultérieure</a>
        (AGPL-3.0-or-later). Vous pouvez l’utiliser, l’étudier, le modifier et le redistribuer selon les termes de cette licence.
        Si vous proposez une version modifiée en ligne, vous devez en publier le code source.
      </p>
      <p>Code source : <a href="<?= $h($c['source_url']) ?>" rel="noopener"><?= $h(preg_replace('#^https?://#', '', $c['source_url'])) ?></a></p>
      <p>
        Composant tiers : <a href="https://github.com/parallax/jsPDF" rel="noopener">jsPDF</a> (licence MIT), utilisé pour l’export PDF.
        Les noms «&nbsp;GanttProject&nbsp;», «&nbsp;Google Agenda&nbsp;», «&nbsp;Outlook&nbsp;» et «&nbsp;Apple Calendrier&nbsp;» appartiennent à leurs propriétaires respectifs
        et ne sont cités que pour décrire des fonctions de compatibilité.
      </p>
      <p>Les projets créés avec K-Gantt appartiennent à leurs auteurs.</p>
    </section>

    <h1 id="confidentialite">Données personnelles et confidentialité</h1>

    <section>
      <h2>Aucun compte, aucune donnée conservée sur le serveur</h2>
      <p>
        K-Gantt fonctionne <strong>entièrement dans votre navigateur</strong>. Il n’y a ni inscription, ni base de données :
        vos projets ne sont pas envoyés au serveur. Ils sont enregistrés uniquement dans les fichiers
        <code>.kgantt.json</code> que vous téléchargez et conservez vous-même.
      </p>
    </section>

    <section>
      <h2>Stockage local du navigateur</h2>
      <p>Pour votre confort, K-Gantt enregistre dans le stockage local de votre navigateur (<code>localStorage</code>), sur votre seul appareil :</p>
      <ul>
        <li>un <strong>brouillon</strong> du projet en cours, pour le retrouver après une fermeture accidentelle ;</li>
        <li>vos préférences d’affichage (thème clair ou sombre, largeur du tableau).</li>
      </ul>
      <p>
        Ces informations ne sont jamais transmises. Vous pouvez les effacer à tout moment en supprimant les données du site
        dans les réglages de votre navigateur. Aucun <strong>cookie</strong>, aucun outil de <strong>mesure d’audience</strong>
        ni aucune ressource externe (police, script, publicité) n’est utilisé.
      </p>
    </section>

    <section>
      <h2>Abonnement iCal</h2>
      <p>
        Si vous utilisez l’abonnement d’agenda, votre application d’agenda interroge régulièrement le serveur K-Gantt, qui
        télécharge alors le fichier de projet dont vous avez fourni le lien public, génère l’agenda et le renvoie
        <strong>sans rien conserver</strong>. Le lien du fichier figurant dans l’adresse d’abonnement, il peut apparaître dans
        les journaux techniques du serveur. N’utilisez cette fonction qu’avec un fichier que vous acceptez de rendre accessible
        par lien.
      </p>
    </section>

    <section>
      <h2>Journaux techniques de l’hébergeur</h2>
      <p>
        Comme tout site web, l’hébergeur enregistre des journaux de connexion (adresse IP, date, page demandée, navigateur)
        nécessaires au fonctionnement et à la sécurité du service, et conservés au plus un an conformément aux obligations
        légales. Ils ne sont pas utilisés à d’autres fins.
      </p>
    </section>

    <section>
      <h2>Vos droits</h2>
      <p>
        Conformément au Règlement général sur la protection des données (RGPD) et à la loi «&nbsp;Informatique et Libertés&nbsp;»,
        vous disposez d’un droit d’accès, de rectification, d’effacement et d’opposition concernant les données qui vous
        concernent. Pour l’exercer, écrivez à <a href="mailto:<?= $h($c['contact']) ?>"><?= $h($c['contact']) ?></a>.
        Vous pouvez également adresser une réclamation à la <a href="https://www.cnil.fr" rel="noopener">CNIL</a>.
      </p>
    </section>

    <section>
      <h2>Responsabilité</h2>
      <p>
        K-Gantt est fourni gratuitement, «&nbsp;en l’état&nbsp;», sans garantie d’aucune sorte, comme le prévoit sa licence.
        Les plannings calculés sont une aide à l’organisation : vérifiez les dates importantes (rendus, soutenances)
        auprès de votre établissement. Pensez à enregistrer régulièrement vos fichiers : l’éditeur ne peut pas récupérer
        un projet qui n’a pas été enregistré.
      </p>
    </section>

    <section>
      <h2>Droit applicable</h2>
      <p>Les présentes mentions sont régies par le droit français.</p>
    </section>

    <p class="muted">Dernière mise à jour : 13 octobre 2026.</p>
  </main>
</body>
</html>
