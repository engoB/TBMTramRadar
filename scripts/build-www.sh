#!/bin/sh
# Copie la web app dans www/ pour l'embarquer dans l'app iOS (fonctionne hors ligne, sans serveur).
set -e
rm -rf www && mkdir -p www
cp -r index.html privacy.html manifest.webmanifest version.json assets data www/
# Le service worker n'est pas utilisé dans l'app native : les mises à jour passent par l'App Store.
sed -i.bak 's/__BUILD__/native/g' www/index.html www/version.json && rm -f www/*.bak
echo "www/ prêt"
