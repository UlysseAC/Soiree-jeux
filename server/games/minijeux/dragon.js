// Mini-jeu « La Chasse au dragon » (tir, sans violence : on est « touché », puis « hors jeu »).
// Chacun pour soi (1v1v1v1) ou 2 contre 2. Le téléphone ne sert que de manette ; tout se suit en direct sur l'écran.
// Par défaut, chaque joueur est à l'abri derrière son muret : rien ne peut le toucher. Sur son téléphone :
//   - Viser : il se lève (à découvert) et prend une cible, d'abord un adversaire, même s'il est à l'abri ;
//     on choisit ensuite sa cible parmi les adversaires et le dragon (seulement en visant) ;
//   - Tirer : possible après 1 s sur la même cible ; un joueur n'est touché que s'il est à découvert ;
//   - Recharger : remplit le chargeur en quelques secondes, à découvert ;
//   - Se cacher : retour derrière le muret.
// Le dragon ne bouge pas ; il attaque à intervalles irréguliers (annoncé 2 s avant) et touche tous ceux qui sont à découvert.
// Fin : dragon vaincu, un seul joueur (ou une équipe) encore en jeu, ou temps écoulé.
// Classement : les survivants d'abord, selon leurs dégâts sur le dragon ; puis les éliminés, le dernier éliminé devant.

export const id = 'dragon';
export const label = 'La Chasse au dragon';

export const defaults = {
  equipesDragon: 'chacun', // chacun (1v1v1v1) | 2v2
  viesTir: 2,
  chargeur: 3,
  tempsRecharge: 2,
  pvDragon: 10,
  attaqueMin: 8,
  attaqueMax: 12,
  dureeTir: 180,
};

export const format = sc => (sc.equipesDragon === '2v2' ? [2, 2] : [1, 1, 1, 1]);

export const VISEE = 1000; // temps à rester sur la même cible avant de pouvoir tirer
const PREAVIS = 2000, CADENCE = 500;
const num = (v, d, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && v !== '' && v != null ? Math.max(lo, Math.min(hi, n)) : d; };

const equipeDe = (r, nom) => r.equipes.findIndex(t => t.includes(nom));
const enJeu = (d, p) => d.j[p] && d.j[p].vies > 0;
const expose = (d, p) => enJeu(d, p) && d.j[p].action !== 'cache';

function prochaineAttaque(ctx, sc) {
  const lo = num(sc.attaqueMin, 8, 3, 120), hi = Math.max(lo, num(sc.attaqueMax, 12, 3, 120));
  return ctx.now() + (lo + Math.random() * (hi - lo)) * 1000;
}

// Cibles possibles : les adversaires encore en jeu (même à l'abri), puis le dragon.
export function cibles(r, nom) {
  const d = r.dr, eq = equipeDe(r, nom);
  return [...r.joueurs.filter(p => p !== nom && enJeu(d, p) && equipeDe(r, p) !== eq), ...(d.dragon.pv > 0 ? ['dragon'] : [])];
}

export function start(ctx, g, r, sc) {
  const now = ctx.now(), pv = num(sc.pvDragon, 10, 1, 99), balles = num(sc.chargeur, 3, 1, 12);
  r.dr = {
    phase: 'jeu', fin: now + num(sc.dureeTir, 180, 30, 1800) * 1000, debut: now, chargeur: balles,
    dragon: { pv, max: pv, attaque: prochaineAttaque(ctx, sc) + 2000, prevenu: false },
    j: Object.fromEntries(r.joueurs.map(p => [p, { vies: num(sc.viesTir, 2, 1, 9), balles, action: 'cache', cible: null, viseDepuis: 0, dernierTir: 0, finRecharge: 0, degats: 0, horsJeuA: 0 }])),
    events: [], n: 0, raison: null,
  };
}

function evenement(ctx, d, e) {
  d.events.push({ ...e, id: ++d.n, at: ctx.now() });
  if (d.events.length > 30) d.events.shift();
}

function toucher(ctx, d, p, par) {
  const me = d.j[p];
  me.vies--;
  if (me.vies <= 0) { Object.assign(me, { vies: 0, action: 'cache', cible: null, horsJeuA: ctx.now() }); evenement(ctx, d, { type: 'horsjeu', nom: p, par }); }
}

function equipesEnJeu(r) { return r.equipes.filter(t => t.some(p => enJeu(r.dr, p))).length; }

// Score de classement d'une équipe : en jeu d'abord (selon les dégâts au dragon), puis selon l'heure de la dernière élimination.
function score(r, team) {
  const d = r.dr, vivants = team.filter(p => enJeu(d, p));
  if (vivants.length) return 1e15 + team.reduce((s, p) => s + d.j[p].degats, 0) * 1000 + vivants.reduce((s, p) => s + d.j[p].vies, 0);
  return Math.max(...team.map(p => d.j[p].horsJeuA || 0));
}
function places(r) {
  const out = {};
  r.equipes.forEach((t, i) => { const s = score(r, t); out[i] = 1 + r.equipes.filter(o => score(r, o) > s).length; });
  return out;
}

function terminer(ctx, r, raison) {
  r.dr.phase = 'fini';
  r.dr.raison = raison;
  for (const me of Object.values(r.dr.j)) Object.assign(me, { action: 'cache', cible: null });
  evenement(ctx, r.dr, { type: 'fin', raison });
  return { changed: true, places: places(r) };
}

// Si la cible n'est plus possible (hors jeu, dragon vaincu), on passe à la suivante.
function corrigerCible(ctx, r, p) {
  const me = r.dr.j[p];
  if (!me.cible) return;
  const liste = cibles(r, p);
  if (!liste.includes(me.cible)) { me.cible = liste[0] || null; me.viseDepuis = ctx.now(); }
}

export function tick(ctx, g, r, sc) {
  const d = r.dr, now = ctx.now();
  if (!d || d.phase !== 'jeu') return { changed: false };
  if (d.dragon.pv <= 0) return terminer(ctx, r, 'dragon');
  let changed = false;
  for (const [p, me] of Object.entries(d.j)) {
    if (!enJeu(d, p)) continue;
    if (me.action === 'recharge' && now >= me.finRecharge) {
      me.balles = d.chargeur;
      me.action = me.cible ? 'vise' : 'cache';
      if (me.cible) me.viseDepuis = now;
      changed = true;
    }
  }
  // le dragon : préavis, puis attaque sur tous ceux qui sont à découvert
  if (!d.dragon.prevenu && now >= d.dragon.attaque - PREAVIS) { d.dragon.prevenu = true; evenement(ctx, d, { type: 'souffle-prepare' }); changed = true; }
  if (now >= d.dragon.attaque) {
    const touches = Object.keys(d.j).filter(p => expose(d, p));
    evenement(ctx, d, { type: 'souffle', touches });
    for (const p of touches) toucher(ctx, d, p, 'dragon');
    for (const p of r.joueurs) corrigerCible(ctx, r, p);
    d.dragon.attaque = prochaineAttaque(ctx, sc);
    d.dragon.prevenu = false;
    changed = true;
  }
  if (equipesEnJeu(r) <= 1) return terminer(ctx, r, 'survivant');
  if (now >= d.fin) return terminer(ctx, r, 'temps');
  return { changed };
}

const ok = msg => ({ ok: true, msg });
const err = msg => ({ ok: false, msg });

export function playerAction(ctx, g, r, nom, a, sc) {
  const d = r.dr;
  if (!d || d.phase !== 'jeu') return err("Ce n'est pas le moment.");
  if (!r.joueurs.includes(nom)) return err('Tu ne joues pas ce round.');
  const me = d.j[nom], now = ctx.now();
  if (!enJeu(d, nom)) return err('Tu es hors jeu.');
  if (a.type === 'viser') { // se lever et prendre une cible : d'abord un adversaire, même s'il est à l'abri
    const liste = cibles(r, nom);
    if (!liste.length) return err('Plus de cible.');
    if (!me.cible || !liste.includes(me.cible)) { me.cible = liste[0]; me.viseDepuis = now; }
    if (me.action === 'cache') me.action = 'vise';
    return ok('');
  }
  if (a.type === 'cibler') { // choisir directement sa cible (un joueur ou le dragon), seulement en visant
    if (me.action !== 'vise') return err('Appuie d\'abord sur « Viser ».');
    if (!cibles(r, nom).includes(a.cible)) return err('Cette cible n\'est pas possible.');
    me.cible = a.cible;
    me.viseDepuis = now;
    return ok('');
  }
  if (a.type === 'tirer') {
    if (me.action !== 'vise' || !me.cible) return err('Appuie d\'abord sur « Viser ».');
    if (me.balles <= 0) return err('Chargeur vide : recharge !');
    if (now - me.viseDepuis < VISEE) return err('Garde ta cible une seconde avant de tirer.');
    if (now - me.dernierTir < CADENCE) return err('');
    me.balles--;
    me.dernierTir = now;
    if (me.cible === 'dragon') {
      d.dragon.pv--; me.degats++;
      evenement(ctx, d, { type: 'tir', de: nom, vers: 'dragon', touche: true });
      return ok(d.dragon.pv <= 0 ? 'Le dragon est vaincu !' : '');
    }
    const touche = expose(d, me.cible);
    evenement(ctx, d, { type: 'tir', de: nom, vers: me.cible, touche });
    if (touche) { toucher(ctx, d, me.cible, nom); corrigerCible(ctx, r, nom); }
    return ok(touche ? 'Touché !' : 'Raté : à l\'abri !');
  }
  if (a.type === 'recharger') {
    if (me.action === 'recharge') return err('Tu recharges déjà.');
    if (me.balles >= d.chargeur) return err('Ton chargeur est plein.');
    Object.assign(me, { action: 'recharge', finRecharge: now + num(sc.tempsRecharge, 2, 1, 30) * 1000 });
    return ok('');
  }
  if (a.type === 'cacher') {
    Object.assign(me, { action: 'cache', cible: null, finRecharge: 0 });
    return ok('');
  }
  return err('Action inconnue.');
}

export function adminAction(ctx, g, r, a) {
  if (a.type === 'suivant') {
    if (!r.dr || r.dr.phase !== 'jeu') return err('Rien à passer.');
    r.dr.fin = ctx.now();
    return ok('Fin de la partie.');
  }
  return err('Action inconnue.');
}

// L'écran montre tout en direct (qui est debout, qui vise qui, les balles) ; le téléphone, seulement son joueur.
export function view(ctx, g, r, as, nom) {
  const d = r.dr;
  if (!d) return null;
  const v = {
    type: id, phase: d.phase, fin: d.fin, raison: d.raison, chargeur: d.chargeur,
    dragon: { pv: d.dragon.pv, max: d.dragon.max, prepare: d.phase === 'jeu' && d.dragon.prevenu, attaque: d.dragon.prevenu ? d.dragon.attaque : null },
    joueurs: r.joueurs.map(p => ({ nom: p, equipe: equipeDe(r, p), vies: d.j[p].vies, horsJeu: !enJeu(d, p), degats: d.j[p].degats })),
    etats: r.joueurs.map(p => ({ nom: p, action: enJeu(d, p) ? d.j[p].action : 'horsjeu', cible: d.j[p].cible, balles: d.j[p].balles, pretA: d.j[p].viseDepuis + VISEE, finRecharge: d.j[p].finRecharge })),
    events: d.events.slice(-8),
    equipes: r.equipes.every(t => t.length === 1) ? null : r.equipes,
  };
  if (as === 'admin') v.attaque = d.dragon.attaque;
  if (as === 'joueur' && d.j[nom]) {
    const me = d.j[nom];
    v.moi = { vies: me.vies, balles: me.balles, action: me.action, cible: me.cible, pretA: me.viseDepuis + VISEE, finRecharge: me.finRecharge, horsJeu: !enJeu(d, nom), equipe: equipeDe(r, nom) };
  }
  return v;
}

export function renommer(r, ancien, nouveau) {
  const d = r.dr;
  if (!d || !(ancien in d.j)) return;
  d.j[nouveau] = d.j[ancien];
  delete d.j[ancien];
  for (const me of Object.values(d.j)) if (me.cible === ancien) me.cible = nouveau;
}
