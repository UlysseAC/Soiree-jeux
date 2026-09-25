#!/usr/bin/env bash
# Lance la soirée jeux sur cet ordinateur (Linux).
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js n'est pas installé."
  echo "  Ubuntu / Debian : sudo apt install nodejs npm"
  echo "  Fedora          : sudo dnf install nodejs"
  echo "  Arch            : sudo pacman -S nodejs npm"
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Première fois : installation (une minute)…"
  npm install --omit=dev
fi
if command -v ufw >/dev/null 2>&1 && sudo -n ufw status 2>/dev/null | grep -q "Status: active"; then
  if ! sudo -n ufw status | grep -q "${PORT:-3000}"; then
    echo "Le pare-feu (ufw) est actif. Si les téléphones n'arrivent pas à se connecter :"
    echo "  sudo ufw allow ${PORT:-3000}"
  fi
fi

( sleep 2
  URL="http://localhost:${PORT:-3000}"
  command -v xdg-open >/dev/null 2>&1 && { xdg-open "$URL/admin" >/dev/null 2>&1; xdg-open "$URL/ecran" >/dev/null 2>&1; } ) &

node server/index.js
