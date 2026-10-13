// Mini-jeu « La Définition ».
// Chaque joueur reçoit un mot inventé (pris au hasard dans la liste écrite par l'organisateur) et invente sa définition.
// Ensuite, ceux qui ne jouent pas ce round relient, sur leur téléphone, chaque mot au joueur qui l'avait.
// Un joueur marque un point chaque fois que quelqu'un relie son mot à lui. Celui qui en a le plus gagne.
// Plusieurs manches (3 par défaut), un nouveau mot par joueur à chaque manche.
import { shuffle } from '../../util.js';

export const id = 'definition';
export const label = 'La Définition';

export const defaults = { mots: '', manches: 3, tempsEcriture: 120, tempsVote: 90, tempsRevelation: 25 };

const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, n);

// Mots de la liste de l'organisateur : un par ligne, sans doublon.
export function wordsOf(sc) {
  const seen = new Set(), out = [];
  for (const line of String(sc.mots || '').split(/\r?\n/)) {
    const w = line.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!w || seen.has(w.toLocaleLowerCase('fr'))) continue;
    seen.add(w.toLocaleLowerCase('fr'));
    out.push(w);
  }
  return out;
}

const manchesOf = sc => Math.max(1, Math.min(10, Math.round(Number(sc.manches) || 3)));

// Mots tirés au sort : d'abord ceux qui n'ont pas encore servi dans la journée.
function pickWords(g, sc, n) {
  g.motsUtilises ??= {};
  const pool = shuffle(wordsOf(sc)).sort((a, b) => (g.motsUtilises[a] || 0) - (g.motsUtilises[b] || 0));
  const out = pool.slice(0, n);
  while (out.length < n) out.push(`Mot mystère n°${out.length + 1}`);
  for (const w of out) g.motsUtilises[w] = (g.motsUtilises[w] || 0) + 1;
  return out;
}

function nextManche(ctx, g, r, sc) {
  const d = r.def;
  d.manche++;
  const w = pickWords(g, sc, r.joueurs.length);
  const mots = Object.fromEntries(r.joueurs.map((p, i) => [p, w[i]]));
  d.cur = { mots, defs: {}, votes: {}, ordre: shuffle(r.joueurs).map(p => mots[p]), trouves: null };
  d.phase = 'ecriture';
  d.fin = ctx.now() + sc.tempsEcriture * 1000;
}

export function start(ctx, g, r, sc) {
  r.def = { manche: 0, total: manchesOf(sc), phase: null, fin: 0, cur: null, passees: [] };
  nextManche(ctx, g, r, sc);
}

const authorOf = (cur, mot) => Object.keys(cur.mots).find(p => cur.mots[p] === mot);

function reveal(ctx, r, sc) {
  const d = r.def, cur = d.cur;
  cur.trouves = Object.fromEntries(r.joueurs.map(p => [p, Object.values(cur.votes).filter(v => v[cur.mots[p]] === p).length]));
  d.passees.push(cur);
  d.phase = 'revelation';
  d.fin = ctx.now() + sc.tempsRevelation * 1000;
}

// Total des liens trouvés par joueur, sur toutes les manches jouées.
function totals(r) {
  const t = Object.fromEntries(r.joueurs.map(p => [p, 0]));
  for (const m of r.def.passees) for (const [p, n] of Object.entries(m.trouves || {})) if (p in t) t[p] += n;
  return t;
}

// Appelé régulièrement. Renvoie { changed, places? } ; places = { indexÉquipe: place } quand le mini-jeu est fini.
export function tick(ctx, g, r, sc, spectateurs) {
  const d = r.def, now = ctx.now();
  if (!d) return { changed: false };
  if (d.phase === 'ecriture') {
    const tousOntEcrit = r.joueurs.every(p => d.cur.defs[p]);
    if (now >= d.fin || tousOntEcrit) {
      if (!spectateurs.length) { reveal(ctx, r, sc); return { changed: true }; }
      d.phase = 'vote';
      d.fin = now + sc.tempsVote * 1000;
      return { changed: true };
    }
  } else if (d.phase === 'vote') {
    const tousOntVote = spectateurs.length && spectateurs.every(s => d.cur.votes[s]);
    if (now >= d.fin || tousOntVote) { reveal(ctx, r, sc); return { changed: true }; }
  } else if (d.phase === 'revelation' && now >= d.fin) {
    if (d.manche < d.total) { nextManche(ctx, g, r, sc); return { changed: true }; }
    d.phase = 'fini';
    const t = totals(r);
    // Place de chaque joueur (= son « équipe » en chacun pour soi) : le plus de liens trouvés en premier, ex æquo possibles.
    const places = {};
    r.equipes.forEach((team, i) => {
      const score = team.reduce((s, p) => s + (t[p] || 0), 0);
      places[i] = 1 + r.equipes.filter(o => o.reduce((s, p) => s + (t[p] || 0), 0) > score).length;
    });
    return { changed: true, places };
  }
  return { changed: false };
}

const ok = msg => ({ ok: true, msg });
const err = msg => ({ ok: false, msg });

export function playerAction(ctx, g, r, nom, a, sc, spectateurs) {
  const d = r.def;
  if (!d?.cur) return err("Le jeu n'a pas commencé.");
  if (a.type === 'ecrire') {
    if (!r.joueurs.includes(nom)) return err('Tu ne joues pas ce round.');
    if (d.phase !== 'ecriture') return err("Le temps d'écriture est fini.");
    const t = clip(a.texte, 300);
    if (t.length < 2) return err('Écris ta définition.');
    d.cur.defs[nom] = t;
    return ok('Définition envoyée ! Tu peux la modifier jusqu\'à la fin du temps.');
  }
  if (a.type === 'voter') {
    if (!spectateurs.includes(nom)) return err('Seuls ceux qui ne jouent pas ce round peuvent deviner.');
    if (d.phase !== 'vote') return err("Ce n'est pas le moment de voter.");
    const liens = {};
    for (const mot of d.cur.ordre) {
      const p = a.liens?.[mot];
      if (r.joueurs.includes(p)) liens[mot] = p;
    }
    if (Object.keys(liens).length < d.cur.ordre.length) return err('Relie chaque mot à un joueur.');
    if (new Set(Object.values(liens)).size < Object.values(liens).length) return err('Chaque joueur n\'avait qu\'un mot : relie un mot différent à chacun.');
    d.cur.votes[nom] = liens;
    return ok('Réponses envoyées ! Tu peux les changer jusqu\'à la fin du vote.');
  }
  return err('Action inconnue.');
}

export function adminAction(ctx, g, r, a) {
  if (a.type === 'suivant') {
    if (!r.def || r.def.phase === 'fini') return err('Rien à passer.');
    r.def.fin = ctx.now();
    return ok('Étape suivante.');
  }
  return err('Action inconnue.');
}

// Vue selon qui regarde. Pendant l'écriture et le vote, personne d'autre que l'admin ne voit qui a quel mot.
export function view(ctx, g, r, as, nom, spectateurs) {
  const d = r.def;
  if (!d?.cur) return null;
  const cur = d.cur;
  const base = { type: id, manche: d.manche, total: d.total, phase: d.phase, fin: d.fin, joueurs: r.joueurs,
    ecrit: r.joueurs.filter(p => cur.defs[p]), votants: Object.keys(cur.votes).length, spectateurs: spectateurs.length };
  const cards = cur.ordre.map(mot => ({ mot, def: cur.defs[authorOf(cur, mot)] || '(pas de définition)' }));
  const reveled = d.phase === 'revelation' || d.phase === 'fini';
  if (d.phase === 'vote' || reveled) base.cartes = cards;
  if (reveled) {
    base.cartes = cards.map(c => { const p = authorOf(cur, c.mot); return { ...c, auteur: p, trouves: cur.trouves?.[p] ?? 0 }; });
    base.totaux = totals(r);
  }
  if (as === 'admin') base.admin = { mots: cur.mots, defs: cur.defs };
  if (as === 'joueur') { base.monMot = cur.mots[nom]; base.maDef = cur.defs[nom] || ''; }
  if (as === 'spectateur') {
    base.mesLiens = cur.votes[nom] || null;
    if (reveled && cur.votes[nom]) base.bons = cur.ordre.filter(m => cur.votes[nom][m] === authorOf(cur, m)).length;
  }
  return base;
}

// Un joueur remplacé en cours de partie : son remplaçant reprend son mot et sa définition.
export function renommer(r, ancien, nouveau) {
  const d = r.def;
  if (!d) return;
  for (const m of [...d.passees, d.cur]) {
    if (!m) continue;
    for (const obj of [m.mots, m.defs, m.trouves || {}]) if (ancien in obj) { obj[nouveau] = obj[ancien]; delete obj[ancien]; }
    for (const v of Object.values(m.votes)) for (const mot of Object.keys(v)) if (v[mot] === ancien) v[mot] = nouveau;
  }
}
