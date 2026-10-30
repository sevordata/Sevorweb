#!/usr/bin/env sh
# Usage: ./set-base-url.sh https://new-domain.example
# Replaces the current base URL in every file that hard-codes it
# (meta tags, JSON-LD, sitemap.xml, robots.txt, config.js) and updates CNAME.
set -e
NEW="${1%/}"
[ -z "$NEW" ] && { echo "Usage: $0 https://your-domain"; exit 1; }
OLD=$(sed -n 's/.*BASE_URL: "\([^"]*\)".*/\1/p' assets/js/config.js)
[ -z "$OLD" ] && { echo "Could not read BASE_URL from assets/js/config.js"; exit 1; }
for f in index.html registro.html gracias.html sitemap.xml robots.txt assets/js/config.js; do
  sed -i.bak "s#${OLD}#${NEW}#g" "$f" && rm -f "$f.bak"
done
echo "${NEW#*://}" > CNAME
echo "Base URL: $OLD -> $NEW (CNAME: $(cat CNAME))"
