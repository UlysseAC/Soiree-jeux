#!/usr/bin/env bash
# Lance la soirée jeux sur ce Mac (double-clic).
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js n'est pas installé : télécharge-le sur https://nodejs.org (version LTS), puis relance."
  read -n 1 -s -r -p "Appuie sur une touche pour fermer."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Première fois : installation (une minute)…"
  npm install --omit=dev
fi

( sleep 2; open "http://localhost:${PORT:-3000}/admin"; open "http://localhost:${PORT:-3000}/ecran" ) &
node server/index.js
