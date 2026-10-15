// Mini-jeu « Le Temple aztèque » (jeu de chance).
// À chaque étape, deux obstacles : chaque joueur en choisit un sur son téléphone. L'un des deux est un piège (tiré au sort)
// et fait perdre une vie à ceux qui l'ont choisi. Chacun part avec 3 vies ; à 0, on est éliminé.
// Ceux qui arrivent au temple avec le plus de vies gagnent ; les éliminés sont classés derrière, selon l'étape atteinte.
import { shuffle } from '../../util.js';

export const id = 'temple';
export const label = 'Le Temple aztèque';

export const defaults = {
  // Un obstacle par ligne ; après « | », ce qui arrive si c'est le piège (sinon une phrase de « pieges » au hasard).
  obstacles: [
    "Pont de lianes | Le pont s'effondre sous tes pieds !",
    'Escalier de pierre | Une marche s\'enfonce : des pieux sortent du sol !',
    'Tunnel obscur | Un serpent te mord dans le noir !',
    'Jungle épaisse | Un léopard te griffe !',
    'Rivière | Les crocodiles attaquent !',
    'Salle des statues | Des flèches empoisonnées jaillissent des murs !',
    'Grotte | Le plafond s\'écroule !',
    'Marais | Tu t\'enlises dans les sables mouvants !',
    'Couloir de pierre | Le sol se dérobe !',
    'Liane géante | La liane casse !',
  ].join('\n'),
  pieges: ['Un serpent te mord !', 'Un léopard te griffe !', 'Le sol s\'effondre !', 'Un piège mortel se déclenche !'].join('\n'),
  etapes: 5,
  vies: 3,
  tempsChoix: 20,
  tempsPiege: 8,
};

const lines = s => String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);

// Obstacles écrits par l'organisateur : { nom, piege } (piege = phrase propre à cet obstacle, ou '').
export function obstaclesOf(sc) {
  const seen = new Set(), out = [];
  for (const line of lines(sc.obstacles)) {
    const [nom, ...rest] = line.split('|');
    const n = nom.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!n || seen.has(n.toLocaleLowerCase('fr'))) continue;
    seen.add(n.toLocaleLowerCase('fr'));
    out.push({ nom: n, piege: rest.join('|').trim().slice(0, 120) });
  }
  return out;
}

const clampInt = (v, d, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || d)));
const vivants = r => r.joueurs.filter(p => r.tp.vies[p] > 0);

// Deux obstacles différents, de préférence pas encore vus dans cette partie.
function nextEtape(ctx, r, sc) {
  const t = r.tp;
  t.etape++;
  let pool = obstaclesOf(sc);
  while (pool.length < 2) pool.push({ nom: `Passage n°${pool.length + 1}`, piege: '' });
  const vus = new Set(t.passees.flatMap(e => [e.gauche, e.droite]));
  pool = shuffle(pool).sort((a, b) => vus.has(a.nom) - vus.has(b.nom));
  const [g, d] = pool;
  const piege = Math.random() < 0.5 ? 'gauche' : 'droite';
  const o = piege === 'gauche' ? g : d;
  const generiques = lines(sc.pieges);
  const message = o.piege || generiques[Math.floor(Math.random() * generiques.length)] || 'Piège mortel !';
  t.cur = { gauche: g.nom, droite: d.nom, piege, message, choix: {}, auto: [], perdus: null };
  t.phase = 'choix';
  t.fin = ctx.now() + clampInt(sc.tempsChoix, 20, 5, 600) * 1000;
}

export function start(ctx, g, r, sc) {
  const vies = clampInt(sc.vies, 3, 1, 10);
  r.tp = { etape: 0, total: clampInt(sc.etapes, 5, 1, 20), viesMax: vies, phase: null, fin: 0, cur: null, passees: [],
    vies: Object.fromEntries(r.joueurs.map(p => [p, vies])), mort: {} };
  nextEtape(ctx, r, sc);
}

function resoudre(ctx, r, sc) {
  const t = r.tp, cur = t.cur;
  // Ceux qui n'ont pas choisi à temps : le hasard choisit pour eux.
  for (const p of vivants(r)) if (!cur.choix[p]) { cur.choix[p] = Math.random() < 0.5 ? 'gauche' : 'droite'; cur.auto.push(p); }
  cur.perdus = vivants(r).filter(p => cur.choix[p] === cur.piege);
  for (const p of cur.perdus) if (--t.vies[p] <= 0) t.mort[p] = t.etape;
  t.passees.push(cur);
  if (cur.perdus.length) ctx.sfx?.('boom');
  t.phase = 'resultat';
  t.fin = ctx.now() + clampInt(sc.tempsPiege, 8, 2, 120) * 1000;
}

// Score pour le classement : arrivés au temple d'abord (selon les vies), puis éliminés selon l'étape atteinte.
const score = (t, p) => (t.vies[p] > 0 ? 1000 + t.vies[p] : t.mort[p] || 0);

export function tick(ctx, g, r, sc) {
  const t = r.tp, now = ctx.now();
  if (!t) return { changed: false };
  if (t.phase === 'choix') {
    if (now >= t.fin || vivants(r).every(p => t.cur.choix[p])) { resoudre(ctx, r, sc); return { changed: true }; }
  } else if (t.phase === 'resultat' && now >= t.fin) {
    if (t.etape < t.total && vivants(r).length) { nextEtape(ctx, r, sc); return { changed: true }; }
    t.phase = 'arrivee';
    t.fin = now + clampInt(sc.tempsPiege, 8, 2, 120) * 1000;
    return { changed: true };
  } else if (t.phase === 'arrivee' && now >= t.fin) {
    t.phase = 'fini';
    const places = {};
    r.equipes.forEach((team, i) => {
      const s = score(t, team[0]);
      places[i] = 1 + r.equipes.filter(o => score(t, o[0]) > s).length;
    });
    return { changed: true, places };
  }
  return { changed: false };
}

const ok = msg => ({ ok: true, msg });
const err = msg => ({ ok: false, msg });

export function playerAction(ctx, g, r, nom, a) {
  const t = r.tp;
  if (!t?.cur) return err("Le jeu n'a pas commencé.");
  if (a.type !== 'choisir') return err('Action inconnue.');
  if (!r.joueurs.includes(nom)) return err('Tu ne joues pas ce round.');
  if (!(t.vies[nom] > 0)) return err('Tu as perdu toutes tes vies…');
  if (t.phase !== 'choix') return err('Trop tard pour cette étape.');
  if (a.cote !== 'gauche' && a.cote !== 'droite') return err('Choisis un des deux obstacles.');
  t.cur.choix[nom] = a.cote;
  return ok('Choix enregistré.');
}

export function adminAction(ctx, g, r, a) {
  if (a.type === 'suivant') {
    if (!r.tp || r.tp.phase === 'fini') return err('Rien à passer.');
    r.tp.fin = ctx.now();
    return ok('Étape suivante.');
  }
  return err('Action inconnue.');
}

// Pendant le choix, personne ne voit le choix des autres (seulement qui a choisi), ni où est le piège.
export function view(ctx, g, r, as, nom) {
  const t = r.tp;
  if (!t?.cur) return null;
  const cur = t.cur, revele = t.phase !== 'choix';
  const v = {
    type: id, etape: t.etape, total: t.total, phase: t.phase, fin: t.fin, viesMax: t.viesMax,
    gauche: cur.gauche, droite: cur.droite,
    joueurs: r.joueurs.map(p => ({ nom: p, vies: t.vies[p], mort: t.mort[p] || 0, choisi: !!cur.choix[p],
      ...(revele ? { choix: cur.choix[p] || null, perdu: !!cur.perdus?.includes(p), auto: cur.auto.includes(p) } : {}) })),
  };
  if (revele) Object.assign(v, { piege: cur.piege, message: cur.message });
  if (as === 'joueur') Object.assign(v, { monChoix: cur.choix[nom] || null, mesVies: t.vies[nom], monMort: t.mort[nom] || 0 });
  return v;
}

export function renommer(r, ancien, nouveau) {
  const t = r.tp;
  if (!t) return;
  for (const obj of [t.vies, t.mort]) if (ancien in obj) { obj[nouveau] = obj[ancien]; delete obj[ancien]; }
  for (const e of [...t.passees, t.cur]) {
    if (!e) continue;
    if (ancien in e.choix) { e.choix[nouveau] = e.choix[ancien]; delete e.choix[ancien]; }
    for (const k of ['auto', 'perdus']) if (e[k]) e[k] = e[k].map(p => (p === ancien ? nouveau : p));
  }
}
