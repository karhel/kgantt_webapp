<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * K-Gantt — configuration de l'instance (mentions légales, liens).
 * Si vous hébergez votre propre instance, adaptez ces valeurs.
 */
declare(strict_types=1);

function kgantt_config(): array
{
    return [
        'site_name' => 'K-Gantt',
        'site_url' => 'https://kgantt.phoen-ix.net',
        'contact' => 'kgantt@phoen-ix.net',

        // Éditeur du site (personne physique, site non professionnel).
        'editor' => [
            'name' => '', // ← À COMPLÉTER : prénom et nom de l'éditeur
            'status' => 'Particulier, site non professionnel et non commercial',
        ],
        // Directeur de la publication : par défaut, l'éditeur.
        'publication_director' => '',

        // Hébergeur (art. 6 de la loi n° 2004-575 du 21 juin 2004, LCEN).
        'host' => [
            'name' => 'O2SWITCH SAS',
            'address' => 'Chemin des Pardiaux, 63000 Clermont-Ferrand, France',
            'phone' => '+33 4 44 44 60 40',
            'url' => 'https://www.o2switch.fr',
        ],

        // Code source (obligation de l'AGPL-3.0, article 13).
        'source_url' => 'https://github.com/karhel/kgantt_webapp',
        'license' => 'AGPL-3.0-or-later',
        'license_url' => 'https://www.gnu.org/licenses/agpl-3.0.html',
    ];
}
