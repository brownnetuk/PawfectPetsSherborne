#!/usr/bin/env bash
# Publishes docs/privacy-policy.html to the WordPress site as the
# "privacy-policy" page (creating it, or updating it if it already exists).
#
# Needs a WordPress user with an Application Password (WordPress admin >
# Users > Profile > Application Passwords). Pass them as environment
# variables; nothing is stored:
#
#   WP_USER='james' WP_APP_PASSWORD='xxxx xxxx xxxx xxxx xxxx xxxx' docs/publish-privacy-policy.sh
#
# Optional: WP_SITE (default https://pawfectpetssherborne.co.uk),
#           WP_STATUS (publish | draft, default publish).
set -euo pipefail

SITE="${WP_SITE:-https://pawfectpetssherborne.co.uk}"
STATUS="${WP_STATUS:-publish}"
SLUG="privacy-policy"
TITLE="Privacy Policy"
HTML_FILE="$(cd "$(dirname "$0")" && pwd)/privacy-policy.html"

: "${WP_USER:?Set WP_USER to your WordPress username}"
: "${WP_APP_PASSWORD:?Set WP_APP_PASSWORD to an Application Password for that user}"

payload=$(python3 - "$HTML_FILE" "$TITLE" "$SLUG" "$STATUS" <<'PY'
import json, sys
html, title, slug, status = sys.argv[1:5]
print(json.dumps({"title": title, "slug": slug, "status": status, "content": open(html).read()}))
PY
)

# Reuse the existing page if there is one (any status), else create it.
existing=$(curl -sS -u "$WP_USER:$WP_APP_PASSWORD" "$SITE/wp-json/wp/v2/pages?slug=$SLUG&status=publish,draft,pending,private&_fields=id" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["id"] if isinstance(d, list) and d else "")')

if [ -n "$existing" ]; then
  echo "Updating existing page id $existing"
  url="$SITE/wp-json/wp/v2/pages/$existing"
else
  echo "Creating new page"
  url="$SITE/wp-json/wp/v2/pages"
fi

curl -sS -u "$WP_USER:$WP_APP_PASSWORD" -H 'Content-Type: application/json' -X POST "$url" -d "$payload" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("status:", d.get("status"), "| link:", d.get("link") or d)'
