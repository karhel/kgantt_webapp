<?php
/**
 * K-Gantt — génération iCalendar côté serveur (abonnement).
 * Miroir de assets/js/ical.js : lit un projet .kgantt.json contenant la section
 * "computed" (dates calculées par l'application) et produit un fichier .ics.
 */
declare(strict_types=1);

const KGANTT_ICAL_DOMAIN = 'kgantt.phoen-ix.net';
const KGANTT_MAX_JSON_BYTES = 3 * 1024 * 1024;

final class KGanttIcalError extends RuntimeException
{
}

/** "2026-09-01" ou "2026-09-01:pm" -> [numéro de jour, demi-journée] ; null si invalide. */
function kgantt_parse_slot($s): ?array
{
    if (!is_string($s) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})(:pm)?$/', $s, $m)) {
        return null;
    }
    if (!checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
        return null;
    }
    $day = intdiv(gmmktime(0, 0, 0, (int) $m[2], (int) $m[3], (int) $m[1]), 86400);
    return [$day, isset($m[4]) && $m[4] !== '' ? 1 : 0];
}

function kgantt_day_iso(int $day): string
{
    return gmdate('Y-m-d', $day * 86400);
}

function kgantt_ics_escape(string $s): string
{
    $s = str_replace('\\', '\\\\', $s);
    $s = str_replace([';', ','], ['\\;', '\\,'], $s);
    return preg_replace('/\r?\n/', '\\n', $s);
}

/** Repli à 75 octets sans couper un caractère UTF-8. */
function kgantt_ics_fold(string $line): string
{
    if (strlen($line) <= 75) {
        return $line;
    }
    $out = [];
    $cur = '';
    $limit = 75;
    foreach (preg_split('//u', $line, -1, PREG_SPLIT_NO_EMPTY) as $ch) {
        if (strlen($cur) + strlen($ch) > $limit) {
            $out[] = $cur;
            $cur = '';
            $limit = 74;
        }
        $cur .= $ch;
    }
    $out[] = $cur;
    return implode("\r\n ", $out);
}

/** Parcours de l'arborescence des tâches : [[tâche, n° hiérarchique], ...] */
function kgantt_flatten(array $tasks): array
{
    $byParent = [];
    $ids = [];
    foreach ($tasks as $t) {
        if (is_array($t) && isset($t['id'])) {
            $ids[(string) $t['id']] = true;
        }
    }
    foreach ($tasks as $t) {
        if (!is_array($t) || !isset($t['id'])) {
            continue;
        }
        $p = isset($t['parent']) && isset($ids[(string) $t['parent']]) ? (string) $t['parent'] : '';
        $byParent[$p][] = $t;
    }
    $out = [];
    $seen = [];
    $walk = function (string $parent, string $prefix) use (&$walk, &$out, &$seen, $byParent) {
        foreach ($byParent[$parent] ?? [] as $i => $t) {
            $id = (string) $t['id'];
            if (isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            $wbs = $prefix === '' ? (string) ($i + 1) : $prefix . '.' . ($i + 1);
            $out[] = [$t, $wbs];
            $walk($id, $wbs);
        }
    };
    $walk('', '');
    return $out;
}

/** Plages de jours travaillés à partir des créneaux. */
function kgantt_day_ranges(array $runs): array
{
    $ranges = [];
    foreach ($runs as $r) {
        if (!is_array($r) || count($r) < 2) {
            continue;
        }
        $a = kgantt_parse_slot($r[0]);
        $b = kgantt_parse_slot($r[1]);
        if (!$a || !$b) {
            continue;
        }
        $n = count($ranges);
        if ($n && $a[0] <= $ranges[$n - 1][1] + 1) {
            $ranges[$n - 1][1] = max($ranges[$n - 1][1], $b[0]);
        } else {
            $ranges[] = [$a[0], $b[0]];
        }
    }
    return $ranges;
}

/**
 * @param array  $data  projet K-Gantt décodé
 * @param string $mode  'runs' | 'span'
 */
function kgantt_ics(array $data, string $mode = 'runs', bool $groups = false, ?int $now = null): string
{
    if (($data['format'] ?? '') !== 'kgantt') {
        throw new KGanttIcalError('Ce fichier n’est pas un projet K-Gantt.');
    }
    $computed = $data['computed']['tasks'] ?? null;
    if (!is_array($computed)) {
        throw new KGanttIcalError('Ce fichier ne contient pas les dates calculées : ouvrez-le dans K-Gantt et enregistrez-le à nouveau.');
    }
    $now = $now ?? time();
    $P = is_array($data['project'] ?? null) ? $data['project'] : [];
    $name = (string) ($P['name'] ?? 'Projet');
    $pid = (string) ($P['id'] ?? 'projet');
    $half = !empty($P['halfDays']);
    $where = ['school' => 'École', 'company' => 'Entreprise', 'any' => 'Partout'];
    $status = ['done' => 'Terminée', 'late' => 'En retard', 'progress' => 'En cours', 'todo' => 'À faire'];
    $res = [];
    foreach ((array) ($data['resources'] ?? []) as $r) {
        if (is_array($r) && isset($r['id'])) {
            $res[(string) $r['id']] = (string) ($r['name'] ?? '');
        }
    }
    $generated = strtotime((string) ($data['computed']['generatedAt'] ?? '')) ?: $now;
    $seq = max(0, intdiv($generated, 60) - 26000000);

    $lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//K-Gantt//K-Gantt 1.0//FR',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:' . kgantt_ics_escape($name . ' (K-Gantt)'),
        'X-WR-CALDESC:' . kgantt_ics_escape(implode(' — ', array_filter([(string) ($P['team'] ?? ''), (string) ($P['className'] ?? '')]))),
        'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
        'X-PUBLISHED-TTL:PT1H',
    ];
    $stamp = gmdate('Ymd\THis\Z', $now);
    $halfLabel = fn (array $s) => $half ? ($s[1] ? ' (après-midi)' : ' (matin)') : '';

    foreach (kgantt_flatten((array) ($data['tasks'] ?? [])) as [$t, $wbs]) {
        $id = (string) $t['id'];
        $c = $computed[$id] ?? null;
        if (!is_array($c) || (!empty($c['summary']) && !$groups)) {
            continue;
        }
        $s = kgantt_parse_slot($c['start'] ?? null);
        $e = kgantt_parse_slot($c['end'] ?? null);
        if (!$s || !$e) {
            continue;
        }
        $tname = (string) ($t['name'] ?? '');
        $isMs = !empty($c['milestone']);
        $isSum = !empty($c['summary']);
        $progress = (int) ($c['progress'] ?? 0);
        $names = array_filter(array_map(fn ($r) => $res[(string) $r] ?? null, (array) ($t['resources'] ?? [])));
        $desc = array_filter([
            'Projet : ' . $name,
            'Tâche ' . $wbs . ($isMs ? ' (jalon)' : ($isSum ? ' (groupe)' : '')),
            ($isMs || $isSum) ? null : 'Lieu : ' . ($where[$t['where'] ?? ''] ?? '') . ' — durée ' . str_replace('.', ',', (string) ($t['duration'] ?? '')) . ' j',
            'Du ' . kgantt_day_iso($s[0]) . $halfLabel($s) . ' au ' . kgantt_day_iso($e[0]) . $halfLabel($e),
            'Avancement : ' . $progress . ' % — ' . ($status[$c['status'] ?? ''] ?? ''),
            $names ? 'Ressources : ' . implode(', ', $names) : null,
            !empty($t['notes']) ? "\n" . (string) $t['notes'] : null,
        ], fn ($x) => $x !== null);
        $description = implode("\n", $desc);

        $events = [];
        if ($isMs) {
            $events[] = [$pid . '-' . $id, '◆ ' . $tname, $s[0], $s[0]];
        } elseif ($mode === 'span' || $isSum || empty($c['runs'])) {
            $events[] = [$pid . '-' . $id, ($isSum ? '▸ ' : '') . $tname, $s[0], $e[0]];
        } else {
            $ranges = kgantt_day_ranges((array) $c['runs']);
            $n = count($ranges);
            foreach ($ranges as $i => [$a, $b]) {
                $events[] = [$pid . '-' . $id . '-' . ($i + 1), $n > 1 ? sprintf('%s (%d/%d)', $tname, $i + 1, $n) : $tname, $a, $b];
            }
        }
        foreach ($events as [$uid, $summary, $a, $b]) {
            array_push(
                $lines,
                'BEGIN:VEVENT',
                'UID:' . $uid . '@' . KGANTT_ICAL_DOMAIN,
                'DTSTAMP:' . $stamp,
                'SEQUENCE:' . $seq,
                'DTSTART;VALUE=DATE:' . gmdate('Ymd', $a * 86400),
                'DTEND;VALUE=DATE:' . gmdate('Ymd', ($b + 1) * 86400),
                'SUMMARY:' . kgantt_ics_escape($summary),
                'DESCRIPTION:' . kgantt_ics_escape($description),
                'CATEGORIES:' . kgantt_ics_escape($name),
                'TRANSP:TRANSPARENT',
                'STATUS:CONFIRMED',
                'END:VEVENT'
            );
        }
    }
    $lines[] = 'END:VCALENDAR';
    return implode("\r\n", array_map('kgantt_ics_fold', $lines)) . "\r\n";
}

// --- Récupération du fichier partagé ---------------------------------------------------

/** Transforme un lien de partage courant en lien de téléchargement direct. */
function kgantt_normalize_share_url(string $url): string
{
    $url = trim($url);
    // Nextcloud / ownCloud : https://cloud.exemple.fr/s/TOKEN -> .../s/TOKEN/download
    if (preg_match('#^(https://[^/]+(?:/index\.php)?/s/[A-Za-z0-9]+)/?$#', $url, $m)) {
        return $m[1] . '/download';
    }
    // Google Drive : /file/d/ID/... -> téléchargement direct
    if (preg_match('#^https://drive\.google\.com/file/d/([\w-]+)#', $url, $m)) {
        return 'https://drive.google.com/uc?export=download&id=' . $m[1];
    }
    // Dropbox : dl=0 -> dl=1
    if (preg_match('#^https://(www\.)?dropbox\.com/#', $url)) {
        $url = preg_replace('/([?&])dl=0\b/', '$1dl=1', $url);
        return str_contains($url, 'dl=1') ? $url : $url . (str_contains($url, '?') ? '&' : '?') . 'dl=1';
    }
    // GitHub : /blob/ -> raw.githubusercontent.com
    if (preg_match('#^https://github\.com/([^/]+)/([^/]+)/blob/(.+)$#', $url, $m)) {
        return "https://raw.githubusercontent.com/{$m[1]}/{$m[2]}/{$m[3]}";
    }
    return $url;
}

/** Vérifie l'URL et renvoie [hôte, port, IP publique résolue]. Refuse les adresses internes. */
function kgantt_check_public_url(string $url): array
{
    $parts = parse_url($url);
    if (!$parts || strtolower($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || isset($parts['user']) || isset($parts['pass'])) {
        throw new KGanttIcalError('L’adresse du fichier doit commencer par https://');
    }
    $host = strtolower($parts['host']);
    $port = (int) ($parts['port'] ?? 443);
    if ($port !== 443) {
        throw new KGanttIcalError('Seul le port HTTPS standard (443) est accepté.');
    }
    $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
    if (!$ips) {
        throw new KGanttIcalError('Serveur introuvable : ' . $host);
    }
    foreach ($ips as $ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            throw new KGanttIcalError('Adresse non autorisée.');
        }
    }
    return [$host, $port, $ips[0]];
}

/** Télécharge le JSON (HTTPS, adresses publiques uniquement, 3 Mo max, 3 redirections max). */
function kgantt_fetch_project(string $url): array
{
    if (!function_exists('curl_init')) {
        throw new KGanttIcalError('L’extension PHP cURL est nécessaire.');
    }
    $url = kgantt_normalize_share_url($url);
    for ($hop = 0; $hop <= 3; $hop++) {
        [$host, $port, $ip] = kgantt_check_public_url($url);
        $body = '';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RESOLVE => ["$host:$port:$ip"], // empêche un changement d'IP entre vérification et requête
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_USERAGENT => 'K-Gantt iCal (+https://' . KGANTT_ICAL_DOMAIN . ')',
            CURLOPT_HTTPHEADER => ['Accept: application/json, */*;q=0.5'],
            CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$body) {
                $body .= $chunk;
                return strlen($body) > KGANTT_MAX_JSON_BYTES ? 0 : strlen($chunk);
            },
        ]);
        if (defined('CURLOPT_PROTOCOLS')) {
            curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
        }
        $ok = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $location = (string) curl_getinfo($ch, CURLINFO_REDIRECT_URL);
        $err = curl_error($ch);
        curl_close($ch);

        if (strlen($body) > KGANTT_MAX_JSON_BYTES) {
            throw new KGanttIcalError('Fichier trop volumineux.');
        }
        if ($ok === false) {
            throw new KGanttIcalError('Téléchargement impossible : ' . $err);
        }
        if ($code >= 300 && $code < 400 && $location !== '') {
            $url = $location;
            continue;
        }
        if ($code !== 200) {
            throw new KGanttIcalError("Le serveur du fichier a répondu « $code ». Vérifiez que le lien est public.");
        }
        $data = json_decode(preg_replace('/^\xEF\xBB\xBF/', '', $body), true);
        if (!is_array($data)) {
            throw new KGanttIcalError('Le lien ne renvoie pas un fichier JSON (lien de partage non public ou page web ?).');
        }
        return $data;
    }
    throw new KGanttIcalError('Trop de redirections.');
}
