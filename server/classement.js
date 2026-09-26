// Classement de la soirée : points de chaque jeu, bonus pour un jeu raté, bonus manuels.

export function defaultConfig() {
  return {
    chemin: { gagnant: 60, perdant: 25 },
    grandpari: { max: 60, min: 10 },
    duel: { max: 90, min: 15 },
    bonusMax: 1.5,
    ordre: 'duel', // jeu qui départage les égalités (le dernier de la soirée)
  };
}

const GAME_NAMES = { chemin: 'Le Chemin', duel: 'Duel au Far West', grandpari: 'Le Grand Pari' };

// Points max d'un jeu (sert au calcul du bonus pour un jeu raté).
function maxOf(cfg, gameId) {
  return gameId === 'chemin' ? cfg.chemin.gagnant : cfg[gameId]?.max ?? 0;
}

// Points par place : le 1er a max, le dernier min, régulièrement entre les deux ; ex æquo = mêmes points.
function byRank(list, value, { max, min }, wonOf = null) {
  const sorted = [...list].sort((a, b) => value(b) - value(a));
  const n = sorted.length;
  const out = {};
  sorted.forEach(r => {
    const rank = sorted.findIndex(x => value(x) === value(r)) + 1;
    out[r.pid] = { pts: n === 1 ? max : min + (max - min) * (n - rank) / (n - 1), rank, won: wonOf ? wonOf(r) : rank === 1 };
  });
  return out;
}

export function gamePoints(cfg, rec) {
  const res = rec.results || [];
  if (rec.gameId === 'chemin') {
    return Object.fromEntries(res.map(r => [r.pid, { pts: r.won ? cfg.chemin.gagnant : cfg.chemin.perdant, won: !!r.won }]));
  }
  if (rec.gameId === 'duel') return byRank(res, r => (r.prime || 0) + (r.paris || 0) + (r.won ? 1e9 : 0), cfg.duel, r => !!r.won);
  if (rec.gameId === 'grandpari') return byRank(res, r => r.argent || 0, cfg.grandpari);
  return {};
}

// records : [{ gameId, results }] (le dernier de chaque jeu compte). bonus : { pid: points }.
export function compute(cfg, records, names, bonus = {}, gameName = id => GAME_NAMES[id] ?? id) {
  const latest = {};
  for (const r of records) latest[r.gameId] = r;
  const held = Object.keys(latest);
  const per = Object.fromEntries(held.map(id => [id, gamePoints(cfg, latest[id])]));
  const heldMax = held.reduce((s, id) => s + maxOf(cfg, id), 0);
  const pids = new Set([...held.flatMap(id => Object.keys(per[id])), ...Object.keys(bonus)]);
  const rows = [...pids].map(pid => {
    const games = {};
    let raw = 0, wins = 0, playedMax = 0;
    for (const id of held) {
      const g = per[id][pid];
      if (!g) continue;
      games[id] = Math.round(g.pts * 10) / 10;
      raw += g.pts;
      playedMax += maxOf(cfg, id);
      if (g.won) wins++;
    }
    const mult = playedMax ? Math.min(cfg.bonusMax, heldMax / playedMax) : 1;
    const b = Number(bonus[pid] || 0);
    const total = Math.round((raw * mult + b) * 10) / 10;
    return { pid, name: names(pid), games, mult: Math.round(mult * 100) / 100, bonus: b, total, wins, played: Object.keys(games).length };
  });
  rows.sort((a, b) => b.total - a.total || b.wins - a.wins || (b.games[cfg.ordre] ?? -1) - (a.games[cfg.ordre] ?? -1) || a.name.localeCompare(b.name, 'fr'));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { rows, held: held.map(id => ({ id, name: gameName(id), max: maxOf(cfg, id) })) };
}
