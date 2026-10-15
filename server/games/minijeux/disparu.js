// Mini-jeu de mémoire « Qu'est-ce qui a changé ? ».
// L'écran montre une scène d'objets (tirés de la liste écrite par l'organisateur) pendant quelques secondes, l'efface,
// puis la remontre avec un objet en moins. Sur son téléphone, chacun choisit l'objet disparu parmi 4 propositions
// (les 3 autres n'étaient pas dans la scène : regarder l'écran n'aide pas). Bonne réponse : 100 points + jusqu'à 50 pour la rapidité.
// Les manches deviennent plus dures : plus d'objets, et à partir d'une manche les objets changent de place.
import { shuffle } from '../../util.js';

export const id = 'disparu';
export const label = "Qu'est-ce qui a changé ?";

export const defaults = {
  objets: ['🍎 Pomme', '🎸 Guitare', '⚽ Ballon', '🔑 Clé', '🕶️ Lunettes', '🎩 Chapeau', '📷 Appareil photo', '🚲 Vélo', '🌂 Parapluie', '🧸 Ours en peluche',
    '🍕 Pizza', '⏰ Réveil', '🎈 Ballon de baudruche', '🪑 Chaise', '📚 Livres', '🕯️ Bougie', '🎲 Dé', '🧦 Chaussette', '🍌 Banane', '🦆 Canard',
    '🎺 Trompette', '🧲 Aimant', '🔦 Lampe torche', '🪴 Plante', '🥐 Croissant', '🎁 Cadeau', '🧀 Fromage', '🐟 Poisson', '🌵 Cactus', '🍩 Donut',
    '🎧 Casque', '🪁 Cerf-volant', '✂️ Ciseaux', '🧩 Puzzle', '🥕 Carotte', '🐌 Escargot', '🚀 Fusée', '🍄 Champignon', '🪥 Brosse à dents', '🎯 Cible'].join('\n'),
  manchesMemo: 5,
  objetsDepart: 6,
  objetsPlus: 2,
  tempsMemo: 15,
  tempsReponse: 20,
  melangeDes: 3, // à partir de cette manche, les objets changent de place (0 = jamais)
};

const num = (v, d, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && v !== '' && v != null ? Math.max(lo, Math.min(hi, n)) : d; };
const NOIR = 1500, REVELATION = 6000, POINTS = 100, RAPIDITE = 50;

// Objets de l'organisateur : « emoji nom » (l'emoji est facultatif), un par ligne, sans doublon.
export function objetsOf(sc) {
  const seen = new Set(), out = [];
  for (const line of String(sc.objets || '').split(/\r?\n/)) {
    const l = line.trim().replace(/\s+/g, ' ');
    if (!l) continue;
    const m = l.match(/^(\S+)\s+(.+)$/);
    const emoji = m && !/[\p{L}\p{N}]/u.test(m[1]) ? m[1] : '';
    const nom = (emoji ? m[2] : l).slice(0, 30);
    const k = nom.toLocaleLowerCase('fr');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ emoji, nom });
  }
  return out;
}

function nouvelleManche(ctx, r, sc) {
  const m = r.mem;
  m.manche++;
  const pool = shuffle(objetsOf(sc));
  const n = Math.max(3, Math.min(pool.length - 3, num(sc.objetsDepart, 6, 3, 30) + (m.manche - 1) * num(sc.objetsPlus, 2, 0, 10)));
  const scene = pool.slice(0, n), leurres = pool.slice(n, n + 3);
  const iManquant = Math.floor(Math.random() * scene.length);
  const melange = num(sc.melangeDes, 3, 0, 20);
  const apres = scene.map((o, i) => (i === iManquant ? null : o));
  m.cur = {
    scene, manquant: scene[iManquant],
    // la scène qui revient : un trou à la place de l'objet disparu, ou tout mélangé (sans trou) à partir de la manche réglée
    apres: melange && m.manche >= melange ? shuffle(apres.filter(Boolean)) : apres,
    choix: shuffle([scene[iManquant], ...leurres]),
    reponses: {}, debutQuestion: 0,
  };
  m.phase = 'memorise';
  m.fin = ctx.now() + num(sc.tempsMemo, 15, 3, 120) * 1000;
}

export function start(ctx, g, r, sc) {
  r.mem = { manche: 0, total: num(sc.manchesMemo, 5, 1, 15), phase: null, fin: 0, cur: null, scores: Object.fromEntries(r.joueurs.map(p => [p, 0])), passees: [] };
  nouvelleManche(ctx, r, sc);
}

function places(r) {
  const s = r.mem.scores, out = {};
  r.equipes.forEach((t, i) => { out[i] = 1 + r.equipes.filter(o => (s[o[0]] || 0) > (s[t[0]] || 0)).length; });
  return out;
}

export function tick(ctx, g, r, sc) {
  const m = r.mem, now = ctx.now();
  if (!m) return { changed: false };
  // tout le monde a répondu : on n'attend pas la fin du temps
  if (m.phase === 'question' && r.joueurs.every(p => m.cur.reponses[p])) m.fin = Math.min(m.fin, now);
  if (now < m.fin) return { changed: false };
  if (m.phase === 'memorise') { m.phase = 'noir'; m.fin = now + NOIR; return { changed: true }; }
  if (m.phase === 'noir') {
    m.phase = 'question'; m.cur.debutQuestion = now;
    m.cur.duree = num(sc.tempsReponse, 20, 5, 120) * 1000;
    m.fin = now + m.cur.duree;
    return { changed: true };
  }
  if (m.phase === 'question') {
    const duree = m.cur.duree || 1;
    for (const [p, rep] of Object.entries(m.cur.reponses)) {
      rep.juste = rep.nom === m.cur.manquant.nom;
      rep.points = rep.juste ? POINTS + Math.round(RAPIDITE * Math.max(0, 1 - (rep.at - m.cur.debutQuestion) / duree)) : 0;
      m.scores[p] = (m.scores[p] || 0) + rep.points;
    }
    m.passees.push(m.cur);
    m.phase = 'revelation'; m.fin = now + REVELATION;
    return { changed: true };
  }
  if (m.phase === 'revelation') {
    if (m.manche < m.total) { nouvelleManche(ctx, r, sc); return { changed: true }; }
    m.phase = 'fini';
    return { changed: true, places: places(r) };
  }
  return { changed: false };
}

const ok = msg => ({ ok: true, msg });
const err = msg => ({ ok: false, msg });

export function playerAction(ctx, g, r, nom, a) {
  const m = r.mem;
  if (!m || m.phase !== 'question') return err("Ce n'est pas le moment de répondre.");
  if (!r.joueurs.includes(nom)) return err('Tu ne joues pas ce round.');
  if (a.type !== 'repondre') return err('Action inconnue.');
  if (m.cur.reponses[nom]) return err('Tu as déjà répondu.');
  const o = m.cur.choix[Number(a.choix)];
  if (!o) return err('Choisis un des objets.');
  m.cur.reponses[nom] = { nom: o.nom, at: ctx.now() };
  return ok('Réponse enregistrée !');
}

export function adminAction(ctx, g, r, a) {
  if (a.type === 'suivant') {
    if (!r.mem || r.mem.phase === 'fini') return err('Rien à passer.');
    r.mem.fin = ctx.now();
    return ok('Étape suivante.');
  }
  return err('Action inconnue.');
}

// Pendant la question, personne ne voit l'objet disparu (seulement les 4 propositions sur les téléphones).
export function view(ctx, g, r, as, nom) {
  const m = r.mem;
  if (!m?.cur) return null;
  const cur = m.cur, revele = m.phase === 'revelation' || m.phase === 'fini';
  const v = {
    type: id, manche: m.manche, total: m.total, phase: m.phase, fin: m.fin,
    repondu: Object.keys(cur.reponses).length, joueurs: r.joueurs,
    scores: m.scores,
  };
  if (m.phase === 'memorise') v.scene = cur.scene;
  if (m.phase === 'question' || revele) v.apres = cur.apres;
  if (revele) {
    v.manquant = cur.manquant;
    v.scene = cur.scene;
    v.reponses = Object.entries(cur.reponses).map(([p, x]) => ({ nom: p, objet: x.nom, juste: x.juste, points: x.points, temps: x.at - cur.debutQuestion })).sort((a, b) => b.points - a.points || a.temps - b.temps);
  }
  if (as === 'admin') v.manquantAdmin = cur.manquant;
  if (as === 'joueur' && r.joueurs.includes(nom)) {
    v.moi = { score: m.scores[nom] || 0, reponse: cur.reponses[nom]?.nom || null, juste: revele ? !!cur.reponses[nom]?.juste : undefined, points: revele ? cur.reponses[nom]?.points || 0 : undefined };
    if (m.phase === 'question') v.choix = cur.choix;
  }
  return v;
}

export function renommer(r, ancien, nouveau) {
  const m = r.mem;
  if (!m) return;
  if (ancien in m.scores) { m.scores[nouveau] = m.scores[ancien]; delete m.scores[ancien]; }
  for (const e of [...m.passees, m.cur]) if (e && ancien in e.reponses) { e.reponses[nouveau] = e.reponses[ancien]; delete e.reponses[ancien]; }
}
