// Test des tâches de L'Enquête : un bac à sable, sans partie ni joueurs réels. Un appareil (ou plusieurs) enchaîne les 22 tâches ;
// pour une tâche à plusieurs, un même appareil joue tous les rôles à la fois (un panneau par rôle).
import * as E from './games/enquete.js';
import * as T from './games/taches.js';

const PIDS = ['t1', 't2', 't3'];

export function creerBac(cfgJeu = {}) {
  let t = Date.now();
  const cfg = { ...E.defaultConfig(), ...cfgJeu, taches: true, panne: false, armesJoueurs: false, sallesPropres: 0, indicesParSalle: 1, indicesFinale: 1 };
  const noms = Object.fromEntries(PIDS.map((p, i) => [p, `Joueur ${i + 1}`]));
  const ctx = { now: () => Date.now(), cfg, name: p => noms[p] ?? '?', sfx: () => {} };
  const g = E.start(ctx, PIDS);
  E.adminAction(ctx, g, { type: 'lancer' });
  const salles = String(cfg.salles || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const liste = [];
  salles.forEach((salle, n) => {
    const def = T.SALLES[n % T.SALLES.length];
    liste.push({ n, salle, id: def.solo, groupe: false, nom: T.SOLOS[def.solo].nom, joueurs: 1 });
    liste.push({ n, salle, id: def.groupe, groupe: true, nom: T.GROUPES[def.groupe].nom, joueurs: T.GROUPES[def.groupe].n });
  });
  let courant = -1;

  const vue = () => {
    E.tick(ctx, g);
    if (courant < 0) return { ok: true, liste, courant };
    const it = liste[courant], s = `s${it.n}`;
    const succes = g.joueurs.t1.indices > 0;
    const v = { ok: true, courant, item: it, succes, vues: [] };
    for (let k = 0; k < it.joueurs; k++) {
      const tache = E.playerView(ctx, g, PIDS[k]).tache;
      v.vues.push({ role: k, tache });
    }
    if (it.groupe) { const sv = E.salleView(ctx, g, it.n)?.tache; if (sv?.tablette) v.tablette = sv.tablette; }
    return v;
  };

  return {
    liste: () => ({ ok: true, liste }),
    choisir(i) {
      const it = liste[Number(i)];
      if (!it) return { ok: false, msg: 'Tâche inconnue.' };
      courant = Number(i);
      g.sessions = {};
      for (const p of PIDS) Object.assign(g.joueurs[p], { pris: {}, indices: 0, recus: {}, elimines: [], notes: [], vus: {} });
      for (const p of PIDS) E.adminAction(ctx, g, { type: 'placer', pid: p, salle: `s${it.n}` });
      g.taches[it.n] = it.groupe ? { id: it.id, groupe: true, params: {} } : { id: it.id, groupe: false, params: { ...(T.SOLOS[it.id].params ? T.SOLOS[it.id].params() : {}), niveau: T.NIVEAUX[cfg.difficulte] ?? 1 } };
      if (it.groupe) {
        E.playerAction(ctx, g, 't1', { type: 'tacheLancer' });
        for (let k = 1; k < it.joueurs; k++) E.playerAction(ctx, g, PIDS[k], { type: 'tacheRejoindre' });
      }
      return vue();
    },
    action(pid, a) {
      if (courant < 0 || !PIDS.includes(pid)) return { ok: false, msg: 'Choisis d\'abord une tâche.' };
      const r = E.playerAction(ctx, g, pid, a);
      return { ...vue(), r };
    },
    vue,
  };
}
