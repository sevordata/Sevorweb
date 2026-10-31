#!/usr/bin/env sh
# Usage: ./set-base-url.sh https://new-base.example/optional-path
# Replaces the current base URL in every file that hard-codes it
# (meta tags, JSON-LD, sitemap.xml, robots.txt, 404.html, config.js).
# It does NOT create a CNAME file: add one by hand only if you move to a custom domain.
set -e
NEW="${1%/}"
[ -z "$NEW" ] && { echo "Usage: $0 https://your-base-url"; exit 1; }
OLD=$(sed -n 's/.*BASE_URL: "\([^"]*\)".*/\1/p' assets/js/config.js)
[ -z "$OLD" ] && { echo "Could not read BASE_URL from assets/js/config.js"; exit 1; }
OLD_PATH=$(echo "$OLD" | sed -n 's#^https\?://[^/]*##p')
NEW_PATH=$(echo "$NEW" | sed -n 's#^https\?://[^/]*##p')
for f in index.html registro.html gracias.html para-empresas.html guias/*.html 404.html sitemap.xml robots.txt assets/js/config.js; do
  sed -i.bak "s#${OLD}#${NEW}#g" "$f" && rm -f "$f.bak"
done
# robots.txt Disallow path follows the base path
sed -i.bak "s#^Disallow: ${OLD_PATH}/gracias.html#Disallow: ${NEW_PATH}/gracias.html#" robots.txt && rm -f robots.txt.bak
echo "Base URL: $OLD -> $NEW"
