#!/bin/sh
set -e
mkdir -p /app/registergericht /app/data
if [ "$(id -u)" = "0" ]; then
  chown node:node /app/registergericht /app/data
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid=node --regid=node --init-groups -- "$@"
  fi
  exec su --preserve-environment -s /bin/sh node -c 'exec "$@"' sh "$@"
fi
exec "$@"
