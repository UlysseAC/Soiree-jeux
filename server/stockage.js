// Sauvegarde de la soirée : fichier local, et en option une base Upstash Redis gratuite
// (indispensable en ligne sur Render gratuit, dont le disque est effacé à chaque redémarrage).
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const KEY = 'soiree-jeux';

export function makeStorage(dataDir, env = process.env) {
  const file = join(dataDir, 'soiree.json');
  const url = env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  const remote = !!(url && token);
  mkdirSync(dataDir, { recursive: true });

  // Les films des sports sont lourds et recalculables : on ne les envoie pas en ligne.
  const light = state => JSON.stringify(state, (k, v) => (k === 'replays' ? {} : v));

  async function load() {
    if (remote) {
      try {
        const r = await fetch(`${url}/get/${KEY}`, { headers: { Authorization: `Bearer ${token}` } });
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
          await fetch(`${url}/set/${KEY}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: light(pending()) });
        } catch (e) { console.error('Sauvegarde en ligne impossible :', e.message); }
      }, 3000);
    }
  }

  return { load, save, remote };
}
