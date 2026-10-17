// Mini-jeu « La Définition ».
// Chaque joueur reçoit un mot inventé (pris au hasard dans la liste écrite par l'organisateur) et le définit À L'ORAL,
// chacun son tour (30 s chacun par défaut, dans un ordre tiré au hasard).
// Les mots s'affichent sur l'écran. Ceux qui ne jouent pas ce round relient, sur leur téléphone, chaque mot au joueur qui l'avait
// (dès l'oral, en écoutant, puis pendant le vote).
// Un joueur marque un point chaque fois que quelqu'un relie son mot à lui. Celui qui en a le plus gagne.
// Plusieurs manches (3 par défaut), un nouveau mot par joueur à chaque manche.
// Les spectateurs sont classés selon leurs bonnes réponses : le premier tiers gagne un bonus (1 point par défaut).
// Le même moteur sert à « L'Anecdote » (r.type === 'anecdote', voir anecdote.js) : pas de mot, chacun écrit une anecdote
// sur lui ; les cartes s'appellent A, B, C… et c'est le joueur qu'on a le MOINS souvent retrouvé qui gagne.
import { shuffle } from '../../util.js';

export const id = 'definition';
export const label = 'La Définition';
export const spectateurs = true; // des spectateurs s'inscrivent pour deviner

export const defaults = { mots: '', manches: 3, tempsParole: 30, tempsEcriture: 120, tempsVote: 90, tempsRevelation: 25, bonusDevineurs: '3, 2, 1' }; // tempsEcriture : L'Anecdote

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
  const anecdote = r.type === 'anecdote';
  // L'Anecdote : chaque joueur reçoit au hasard une lettre de carte (A, B, C…), affichées dans l'ordre alphabétique
  const w = anecdote ? shuffle(r.joueurs.map((_, i) => String.fromCharCode(65 + i))) : pickWords(g, sc, r.joueurs.length);
  const mots = Object.fromEntries(r.joueurs.map((p, i) => [p, w[i]]));
  d.cur = { mots, defs: {}, votes: {}, ordre: anecdote ? [...w].sort() : shuffle(r.joueurs).map(p => mots[p]), trouves: null };
  // La Définition se dit à l'oral (pas d'écriture), chacun son tour : « parole » = ordre de passage (sans rapport avec l'ordre des mots).
  // L'Anecdote s'écrit sur les téléphones.
  if (!anecdote) Object.assign(d.cur, { parole: shuffle(r.joueurs), tour: 0 });
  d.phase = anecdote ? 'ecriture' : 'oral';
  d.fin = ctx.now() + (anecdote ? sc.tempsEcriture : tempsParole(sc)) * 1000;
}

const tempsParole = sc => Math.max(5, Number(sc.tempsParole) || 30);

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

// Classement des spectateurs : bonnes réponses sur toutes les manches (un lien juste = 1).
export function devineurs(r) {
  const t = {};
  for (const m of r.def?.passees || []) for (const [nom, v] of Object.entries(m.votes)) {
    t[nom] ??= 0;
    t[nom] += Object.entries(v).filter(([mot, p]) => m.mots[p] === mot).length;
  }
  const rows = Object.entries(t).map(([nom, bons]) => ({ nom, bons })).sort((a, b) => b.bons - a.bons || a.nom.localeCompare(b.nom, 'fr'));
  rows.forEach((x, i) => { x.rang = i && rows[i - 1].bons === x.bons ? rows[i - 1].rang : i + 1; });
  return rows;
}

// Bonus des meilleurs devineurs selon leur rang : 3 points au 1er, 2 au 2e, 1 au 3e (réglable), rien pour les autres.
// Les ex æquo ont le même rang (deux 1ers, puis un 3e). Il faut au moins une bonne réponse.
export const baremeDevineurs = sc => String(sc?.bonusDevineurs ?? '3, 2, 1').split(/[,;\s]+/).map(Number).filter(n => Number.isFinite(n) && n >= 0);
export function bonusDevineurs(rows, bareme = [3, 2, 1]) {
  return Object.fromEntries(rows.filter(x => x.bons > 0 && bareme[x.rang - 1] > 0).map(x => [x.nom, bareme[x.rang - 1]]));
}

// Appelé régulièrement. Renvoie { changed, places? } ; places = { indexÉquipe: place } quand le mini-jeu est fini.
export function tick(ctx, g, r, sc, spectateurs) {
  const d = r.def, now = ctx.now();
  if (!d) return { changed: false };
  // à l'oral, chacun son tour : quand le temps du joueur est écoulé, on passe au suivant
  if (d.phase === 'oral' && now >= d.fin && d.cur.tour < d.cur.parole.length - 1) {
    d.cur.tour++;
    d.fin = now + tempsParole(sc) * 1000;
    return { changed: true };
  }
  if (d.phase === 'ecriture' || d.phase === 'oral') {
    const tousOntEcrit = d.phase === 'ecriture' && r.joueurs.every(p => d.cur.defs[p]);
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
      // La Définition : le plus souvent retrouvé gagne ; L'Anecdote : le moins souvent retrouvé gagne
      const mieux = r.type === 'anecdote' ? (a, b) => a < b : (a, b) => a > b;
      places[i] = 1 + r.equipes.filter(o => mieux(o.reduce((s, p) => s + (t[p] || 0), 0), score)).length;
    });
    d.devineurs = devineurs(r);
    const bonus = bonusDevineurs(d.devineurs, baremeDevineurs(sc));
    return { changed: true, places, bonus };
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
    if (r.type !== 'anecdote') return err("La définition se dit à l'oral : pas besoin de l'écrire.");
    if (d.phase !== 'ecriture') return err("Le temps d'écriture est fini.");
    const t = clip(a.texte, 300);
    if (t.length < 2) return err(r.type === 'anecdote' ? 'Écris ton anecdote.' : 'Écris ta définition.');
    d.cur.defs[nom] = t;
    return ok(`${r.type === 'anecdote' ? 'Anecdote envoyée' : 'Définition envoyée'} ! Tu peux la modifier jusqu'à la fin du temps.`);
  }
  if (a.type === 'voter') {
    if (!spectateurs.includes(nom)) return err('Seuls ceux qui ne jouent pas ce round peuvent deviner.');
    // La Définition : on peut relier dès l'oral, en écoutant (puis corriger pendant le vote)
    if (d.phase !== 'vote' && !(d.phase === 'oral' && r.type !== 'anecdote')) return err("Ce n'est pas le moment de voter.");
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

// Vue selon qui regarde. Pendant l'oral et le vote, personne d'autre que l'admin ne voit qui a quel mot.
export function view(ctx, g, r, as, nom, spectateurs) {
  const d = r.def;
  if (!d?.cur) return null;
  const cur = d.cur;
  const base = { type: r.type === 'anecdote' ? 'anecdote' : id, manche: d.manche, total: d.total, phase: d.phase, fin: d.fin, joueurs: r.joueurs,
    ecrit: r.joueurs.filter(p => cur.defs[p]), votants: Object.keys(cur.votes).length, spectateurs: spectateurs.length };
  const anecdote = r.type === 'anecdote';
  // La Définition : seuls les mots sont affichés (les définitions sont dites à l'oral). L'Anecdote : les anecdotes écrites.
  const cards = cur.ordre.map(mot => ({ mot, ...(anecdote ? { def: cur.defs[authorOf(cur, mot)] || '(pas d\'anecdote)' } : {}) }));
  const reveled = d.phase === 'revelation' || d.phase === 'fini';
  if (d.phase === 'oral' || d.phase === 'vote' || reveled) base.cartes = cards;
  if (d.phase === 'oral') Object.assign(base, { parole: cur.parole, tour: cur.tour, parleur: cur.parole[cur.tour] });
  if (reveled) {
    base.cartes = cards.map(c => { const p = authorOf(cur, c.mot); return { ...c, auteur: p, trouves: cur.trouves?.[p] ?? 0 }; });
    base.totaux = totals(r);
    base.devineurs = devineurs(r).slice(0, 5);
  }
  if (as === 'admin') base.admin = { mots: cur.mots, defs: cur.defs };
  if (as === 'joueur') { base.monMot = cur.mots[nom]; base.maDef = cur.defs[nom] || ''; }
  if (as === 'spectateur') {
    base.mesLiens = cur.votes[nom] || null;
    if (reveled && cur.votes[nom]) base.bons = cur.ordre.filter(m => cur.votes[nom][m] === authorOf(cur, m)).length;
    if (reveled) base.mesBons = devineurs(r).find(x => x.nom === nom)?.bons ?? 0;
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
