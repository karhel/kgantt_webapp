<?php
/**
 * K-Gantt — abonnement iCal.
 *
 *   https://kgantt.phoen-ix.net/ical.php?url=<lien public vers un fichier .kgantt.json>
 *       &mode=runs|span   (un évènement par période travaillée / un par tâche)
 *       &groupes=1        (inclure les groupes de tâches)
 *
 * Le fichier est lu à chaque demande de l'application d'agenda ; rien n'est stocké.
 */
declare(strict_types=1);

require __DIR__ . '/inc/ical-lib.php';

/** Interrupteur général : passer à false pour désactiver l'abonnement. */
const KGANTT_ICAL_ENABLED = true;

header('X-Content-Type-Options: nosniff');

function kgantt_fail(int $code, string $message): void
{
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo $message;
    exit;
}

if (!KGANTT_ICAL_ENABLED) {
    kgantt_fail(503, 'L’abonnement iCal est désactivé sur ce serveur.');
}
$url = isset($_GET['url']) ? (string) $_GET['url'] : '';
if ($url === '' || strlen($url) > 2000) {
    kgantt_fail(400, 'Paramètre « url » manquant : indiquez le lien public de votre fichier .kgantt.json.');
}
$mode = ($_GET['mode'] ?? 'runs') === 'span' ? 'span' : 'runs';
$groups = ($_GET['groupes'] ?? '0') === '1';

try {
    $data = kgantt_fetch_project($url);
    $ics = kgantt_ics($data, $mode, $groups);
} catch (KGanttIcalError $e) {
    kgantt_fail(422, $e->getMessage());
} catch (Throwable $e) {
    kgantt_fail(500, 'Erreur inattendue lors de la génération de l’agenda.');
}

$name = preg_replace('/[^a-z0-9]+/i', '-', (string) ($data['project']['name'] ?? 'projet'));
header('Content-Type: text/calendar; charset=utf-8');
header('Content-Disposition: inline; filename="' . trim($name, '-') . '.ics"');
header('Cache-Control: public, max-age=900');
echo $ics;
