// Sauvegarde de la soirée : fichier local, et en option une base Upstash Redis gratuite
// (indispensable en ligne sur Render gratuit, dont le disque est effacé à chaque redémarrage).
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import edition from './edition.js';

// Par défaut : la soirée unique (clé de l'édition, ou variable STORAGE_KEY ; fichier soiree.json), comme avant les espaces.
// Un espace (site à plusieurs soirées) a sa propre clé et son propre fichier.
export function makeStorage(dataDir, env = process.env, { key = null, fichier = 'soiree.json' } = {}) {
  const KEY = key ?? (env.STORAGE_KEY || edition.cleSauvegarde);
  const file = join(dataDir, fichier);
  const url = env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  const remote = !!(url && token);
  mkdirSync(dirname(file), { recursive: true });

  // Les films des sports sont lourds et recalculables : on ne les envoie pas en ligne.
  const light = state => JSON.stringify(state, (k, v) => (k === 'replays' ? {} : v));

  async function load() {
    if (remote) {
      try {
        const r = await fetch(`${url}/get/${encodeURIComponent(KEY)}`, { headers: { Authorization: `Bearer ${token}` } });
        const j = await r.json();
        if (j.result) { console.log('  Sauvegarde en ligne retrouvée.'); return JSON.parse(j.result); }
      } catch (e) { console.error('Sauvegarde en ligne injoignable :', e.message); }
    }
    if (existsSync(file)) {
      try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error('Sauvegarde illisible, on repart de zéro :', e.message); }
    }
    return null;
  }

  let localTimer = null, remoteTimer = null, pending = null;
  function save(getState) {
    pending = getState;
    if (!localTimer) {
      localTimer = setTimeout(() => {
        localTimer = null;
        writeFileSync(file + '.tmp', JSON.stringify(pending()));
        renameSync(file + '.tmp', file);
      }, 500);
    }
    if (remote && !remoteTimer) {
      remoteTimer = setTimeout(async () => {
        remoteTimer = null;
        try {
          await fetch(`${url}/set/${encodeURIComponent(KEY)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: light(pending()) });
        } catch (e) { console.error('Sauvegarde en ligne impossible :', e.message); }
      }, 3000);
    }
  }

  // Arrêt du serveur (mise à jour Render) : on écrit tout de suite ce qui attendait.
  async function flush(getState = pending) {
    if (!getState) return;
    clearTimeout(localTimer); clearTimeout(remoteTimer);
    localTimer = remoteTimer = null;
    try {
      writeFileSync(file + '.tmp', JSON.stringify(getState()));
      renameSync(file + '.tmp', file);
    } catch (e) { console.error('Sauvegarde locale impossible :', e.message); }
    if (remote) {
      try {
        await fetch(`${url}/set/${encodeURIComponent(KEY)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: light(getState()) });
      } catch (e) { console.error('Sauvegarde en ligne impossible :', e.message); }
    }
  }

  return { load, save, flush, remote };
}
