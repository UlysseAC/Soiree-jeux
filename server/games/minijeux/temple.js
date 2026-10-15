// Mini-jeu « Le Temple aztèque » (jeu de chance).
// À chaque étape, 2 à 4 chemins (réglable étape par étape) : chaque joueur en choisit un sur son téléphone.
// Un ou plusieurs chemins (réglable) sont piégés, tirés au sort, et font perdre une vie à ceux qui les ont pris. Chacun part avec 3 vies ; à 0, on est éliminé.
// Ceux qui arrivent au temple avec le plus de vies gagnent ; les éliminés sont classés derrière, selon l'étape atteinte.
import { shuffle } from '../../util.js';

export const id = 'temple';
export const label = 'Le Temple aztèque';

export const defaults = {
  // Un obstacle par ligne : « nom | ce qui arrive si c'est le piège | décor ». La phrase et le décor sont facultatifs :
  // sans phrase, une phrase de « pieges » est tirée au hasard ; sans décor, il est deviné d'après le nom.
  obstacles: [
    "Pont de bois | Le pont de bois s'effondre sous tes pieds !",
    'Escalier de pierre | Une marche s\'enfonce : des pieux sortent du sol !',
    'Tunnel obscur | Le tunnel s\'écroule !',
    'Jungle épaisse | Un léopard te griffe !',
    'Rivière | Les crocodiles attaquent !',
    'Salle des statues | Des pieux jaillissent du sol !',
    'Grotte | Le plafond s\'écroule !',
    'Marais | Tu t\'enlises dans les sables mouvants !',
    'Liane au-dessus du ravin | La liane casse ! | liane',
    'Paroi rocheuse | Une prise se détache, tu chutes ! | escalade',
    'Coulée de lave | Le volcan entre en éruption ! | volcan',
    'Ravin du condor | Le bord du ravin cède ! | ravin',
    'Nid de serpents | Les serpents attaquent ! | serpents',
  ].join('\n'),
  pieges: ['Un serpent te mord !', 'Un léopard te griffe !', 'Le sol s\'effondre !', 'Un piège mortel se déclenche !'].join('\n'),
  etapes: 5,
  // Chemins de chaque étape : « chemins:pièges » séparés par des virgules ; la dernière valeur vaut pour les étapes suivantes.
  // Vide = 2 chemins dont 1 piégé partout. Ex. « 2:1,2:1,3:1,4:2 » : 3 chemins à l'étape 3, puis 4 chemins dont 2 piégés.
  cheminsEtapes: '',
  affichageTemple: 'carte', // carte (vue du dessus) | pierres (première version : blocs de pierre)
  vies: 3,
  tempsChoix: 20,
  tempsPiege: 8,
};

const lines = s => String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const sansAccents = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Décors de la carte. L'organisateur peut en choisir un en fin de ligne ; sinon on le devine d'après le nom.
export const DECORS = ['eau', 'tunnel', 'jungle', 'marais', 'pierre', 'volcan', 'ravin', 'serpents', 'liane', 'escalade'];
const INDICES = [ // dans l'ordre : le premier qui correspond gagne (« Pont de lianes » est un pont, donc de l'eau)
  ['volcan', /volcan|lave|feu|braise|cratere/],
  ['escalade', /escalad|paroi|grimp|falaise|muraille|rocher/],
  ['eau', /pont|riviere|fleuve|lac|crocod|cascade|\beau\b/],
  ['liane', /liane|balanc|tarzan/],
  ['ravin', /ravin|gouffre|precipice|abime|crevasse/],
  ['serpents', /serpent|vipere|cobra|python|reptile/],
  ['tunnel', /tunnel|grotte|couloir|caverne|souterrain/],
  ['marais', /marais|sable|boue|vase/],
  ['pierre', /escalier|statue|pierre|temple|salle/],
];
export function decorDe(nom, choisi = '') {
  const c = sansAccents(choisi).trim();
  if (DECORS.includes(c)) return c;
  const n = sansAccents(nom);
  return INDICES.find(([, re]) => re.test(n))?.[0] || 'jungle';
}

// Obstacles écrits par l'organisateur : { nom, piege, decor } (piege = phrase propre à cet obstacle, ou '').
export function obstaclesOf(sc) {
  const seen = new Set(), out = [];
  for (const line of lines(sc.obstacles)) {
    const [nom, piege = '', decor = ''] = line.split('|');
    const n = nom.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!n || seen.has(n.toLocaleLowerCase('fr'))) continue;
    seen.add(n.toLocaleLowerCase('fr'));
    out.push({ nom: n, piege: piege.trim().slice(0, 120), decor: decorDe(n, decor) });
  }
  return out;
}

const clampInt = (v, d, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || d)));
const vivants = r => r.joueurs.filter(p => r.tp.vies[p] > 0);

// Nombre de chemins et de pièges de l'étape k (1 = première étape)
export function planEtape(sc, k) {
  const plan = String(sc.cheminsEtapes || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
  const [n, p] = String(plan[Math.min(k, plan.length) - 1] || '2:1').split(':').map(Number);
  const chemins = Math.max(2, Math.min(4, Math.round(n) || 2));
  return { chemins, pieges: Math.max(1, Math.min(chemins - 1, Math.round(p) || 1)) };
}

// Des obstacles différents, de préférence pas encore vus dans cette partie ; certains sont piégés.
function nextEtape(ctx, r, sc) {
  const t = r.tp;
  t.etape++;
  const plan = planEtape(sc, t.etape);
  let pool = obstaclesOf(sc);
  while (pool.length < plan.chemins) pool.push({ nom: `Passage n°${pool.length + 1}`, piege: '', decor: 'jungle' });
  const vus = new Set(t.passees.flatMap(e => e.chemins.map(c => c.nom)));
  pool = shuffle(pool).sort((a, b) => vus.has(a.nom) - vus.has(b.nom));
  const chemins = pool.slice(0, plan.chemins);
  const pieges = shuffle(chemins.map((_, i) => i)).slice(0, plan.pieges).sort((a, b) => a - b);
  const generiques = lines(sc.pieges);
  const messages = chemins.map((o, i) => (pieges.includes(i) ? o.piege || generiques[Math.floor(Math.random() * generiques.length)] || 'Piège mortel !' : ''));
  t.cur = { chemins: chemins.map(o => ({ nom: o.nom, decor: o.decor })), pieges, messages, choix: {}, auto: [], perdus: null };
  t.phase = 'choix';
  t.debut = ctx.now();
  t.fin = ctx.now() + clampInt(sc.tempsChoix, 20, 5, 600) * 1000;
}

export function start(ctx, g, r, sc) {
  const vies = clampInt(sc.vies, 3, 1, 10);
  r.tp = { etape: 0, total: clampInt(sc.etapes, 5, 1, 20), viesMax: vies, phase: null, fin: 0, cur: null, passees: [],
    vies: Object.fromEntries(r.joueurs.map(p => [p, vies])), mort: {}, mortChemin: {} };
  nextEtape(ctx, r, sc);
}

function resoudre(ctx, r, sc) {
  const t = r.tp, cur = t.cur, n = cur.chemins.length;
  // Ceux qui n'ont pas choisi à temps : le hasard choisit pour eux.
  for (const p of vivants(r)) if (cur.choix[p] == null) { cur.choix[p] = Math.floor(Math.random() * n); cur.auto.push(p); }
  cur.perdus = vivants(r).filter(p => cur.pieges.includes(cur.choix[p]));
  for (const p of cur.perdus) if (--t.vies[p] <= 0) { t.mort[p] = t.etape; t.mortChemin[p] = cur.choix[p]; }
  t.passees.push(cur);
  t.phase = 'resultat';
  t.debut = ctx.now();
  t.fin = ctx.now() + clampInt(sc.tempsPiege, 8, 2, 120) * 1000;
}

// Score pour le classement : arrivés au temple d'abord (selon les vies), puis éliminés selon l'étape atteinte.
const score = (t, p) => (t.vies[p] > 0 ? 1000 + t.vies[p] : t.mort[p] || 0);

export function tick(ctx, g, r, sc) {
  const t = r.tp, now = ctx.now();
  if (!t) return { changed: false };
  if (t.phase === 'choix') {
    if (now >= t.fin || vivants(r).every(p => t.cur.choix[p] != null)) { resoudre(ctx, r, sc); return { changed: true }; }
  } else if (t.phase === 'resultat' && now >= t.fin) {
    if (t.etape < t.total && vivants(r).length) { nextEtape(ctx, r, sc); return { changed: true }; }
    t.phase = 'arrivee';
    t.debut = now;
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
  const i = a.cote === 'gauche' ? 0 : a.cote === 'droite' ? 1 : Number(a.chemin);
  if (!Number.isInteger(i) || i < 0 || i >= t.cur.chemins.length) return err('Choisis un des chemins.');
  t.cur.choix[nom] = i;
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

// Pendant le choix, personne ne voit le choix des autres (seulement qui a choisi), ni où sont les pièges.
export function view(ctx, g, r, as, nom) {
  const t = r.tp;
  if (!t?.cur) return null;
  const cur = t.cur, revele = t.phase !== 'choix';
  const v = {
    type: id, etape: t.etape, total: t.total, phase: t.phase, fin: t.fin, debut: t.debut || 0, viesMax: t.viesMax,
    affichage: ctx.cfg.jeux[r.jeu]?.affichageTemple === 'pierres' ? 'pierres' : 'carte',
    chemins: cur.chemins,
    // étapes déjà jouées (tout y est dévoilé) : pour dessiner la carte
    passees: t.passees.filter(e => e !== cur).map(e => ({ chemins: e.chemins, pieges: e.pieges })),
    joueurs: r.joueurs.map(p => ({ nom: p, vies: t.vies[p], mort: t.mort[p] || 0, mortChemin: t.mortChemin?.[p] ?? null, choisi: cur.choix[p] != null,
      ...(revele ? { choix: cur.choix[p] ?? null, perdu: !!cur.perdus?.includes(p), auto: cur.auto.includes(p) } : {}) })),
  };
  if (revele) Object.assign(v, { pieges: cur.pieges, messages: cur.messages });
  if (as === 'joueur') Object.assign(v, { monChoix: cur.choix[nom] ?? null, mesVies: t.vies[nom], monMort: t.mort[nom] || 0 });
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
