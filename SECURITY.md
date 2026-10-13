# Politique de sécurité

## Signaler une vulnérabilité

Merci de **ne pas ouvrir de ticket public** pour une faille de sécurité.

Écrivez à **kgantt@phoen-ix.net** en indiquant :
- la description de la faille et son impact ;
- les étapes pour la reproduire ;
- la version ou le commit concerné.

Vous recevrez une réponse sous 7 jours. Une fois le correctif publié, nous pourrons vous créditer si vous le souhaitez.

## Périmètre

Points particulièrement sensibles :
- `public/ical.php` et `public/inc/ical-lib.php`, qui téléchargent un fichier distant : contournement des protections contre l'accès au réseau interne (SSRF), déni de service ;
- la lecture des fichiers importés (`.kgantt.json`, `.gan`) : injection de code (XSS) dans l'interface ou les exports ;
- les en-têtes de sécurité (`public/.htaccess`).

## Versions maintenues

Seule la dernière version publiée de la branche `main` reçoit les correctifs de sécurité.
