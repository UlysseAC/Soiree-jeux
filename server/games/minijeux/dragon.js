// Mini-jeu « La Chasse au dragon » (tir, sans violence : on est « touché », puis « hors jeu »).
// Chacun pour soi (1v1v1v1) ou 2 contre 2. Le téléphone ne sert que de manette : pour savoir ce qui se passe, on regarde l'écran.
// Par défaut, chaque joueur est à l'abri derrière son muret : rien ne peut le toucher. Pour agir, il se met à découvert :
//   - viser un joueur ou le dragon (1 s) puis tirer : un joueur n'est touché que s'il est à découvert au moment du tir ;
//   - chercher des munitions (quelques secondes).
// L'écran montre en direct qui est à découvert et ce qu'il fait.
// Le dragon ne bouge pas ; il attaque à intervalles irréguliers (annoncé 2 s avant) et touche tous ceux qui sont à découvert.
// Fin : dragon vaincu, un seul joueur (ou une équipe) encore en jeu, ou temps écoulé.
// Classement : les survivants d'abord, selon leurs dégâts sur le dragon ; puis les éliminés, le dernier éliminé devant.

export const id = 'dragon';
export const label = 'La Chasse au dragon';

export const defaults = {
  equipesDragon: 'chacun', // chacun (1v1v1v1) | 2v2
  viesTir: 2,
  munitions: 3,
  munitionsTrouvees: 2,
  tempsRecherche: 3,
  pvDragon: 10,
  attaqueMin: 8,
  attaqueMax: 12,
  dureeTir: 180,
};

export const format = sc => (sc.equipesDragon === '2v2' ? [2, 2] : [1, 1, 1, 1]);

const VISEE = 1000, PREAVIS = 2000, MAX_OBSERVATION = 20000, MAX_MUNITIONS = 9;
const clampInt = (v, d, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) ?? d)));
const num = (v, d, lo, hi) => (Number.isFinite(Number(v)) && v !== '' ? clampInt(v, d, lo, hi) : d);

const equipeDe = (r, nom) => r.equipes.findIndex(t => t.includes(nom));
const enJeu = (d, p) => d.j[p] && d.j[p].vies > 0;
const expose = (d, p) => enJeu(d, p) && d.j[p].action !== 'cache';

function prochaineAttaque(ctx, sc) {
  const lo = num(sc.attaqueMin, 8, 3, 120), hi = Math.max(lo, num(sc.attaqueMax, 12, 3, 120));
  return ctx.now() + (lo + Math.random() * (hi - lo)) * 1000;
}

export function start(ctx, g, r, sc) {
  const now = ctx.now(), pv = num(sc.pvDragon, 10, 1, 99);
  r.dr = {
    phase: 'jeu', fin: now + num(sc.dureeTir, 180, 30, 1800) * 1000, debut: now,
    dragon: { pv, max: pv, attaque: prochaineAttaque(ctx, sc) + 2000, prevenu: false },
    j: Object.fromEntries(r.joueurs.map(p => [p, { vies: num(sc.viesTir, 2, 1, 9), munitions: num(sc.munitions, 3, 0, MAX_MUNITIONS), action: 'cache', cible: null, finAction: 0, depuis: now, degats: 0, horsJeuA: 0 }])),
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
  if (me.vies <= 0) { me.vies = 0; me.action = 'cache'; me.cible = null; me.horsJeuA = ctx.now(); evenement(ctx, d, { type: 'horsjeu', nom: p, par }); }
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
  for (const p of Object.keys(r.dr.j)) { r.dr.j[p].action = 'cache'; r.dr.j[p].cible = null; }
  evenement(ctx, r.dr, { type: 'fin', raison });
  return { changed: true, places: places(r) };
}

export function tick(ctx, g, r, sc) {
  const d = r.dr, now = ctx.now();
  if (!d || d.phase !== 'jeu') return { changed: false };
  let changed = false;
  // actions qui se terminent : tirs (après 1 s de visée) et recherches de munitions
  for (const [p, me] of Object.entries(d.j)) {
    if (!enJeu(d, p)) continue;
    if (me.action === 'observe' && now - me.depuis > MAX_OBSERVATION) { me.action = 'cache'; changed = true; }
    if ((me.action === 'vise' || me.action === 'cherche') && now >= me.finAction) {
      if (me.action === 'cherche') {
        me.munitions = Math.min(MAX_MUNITIONS, me.munitions + num(sc.munitionsTrouvees, 2, 1, 9));
        evenement(ctx, d, { type: 'munitions', nom: p });
      } else {
        me.munitions--;
        if (me.cible === 'dragon') {
          if (d.dragon.pv > 0) { d.dragon.pv--; me.degats++; evenement(ctx, d, { type: 'tir', de: p, vers: 'dragon', touche: true }); }
        } else if (enJeu(d, me.cible)) {
          const touche = expose(d, me.cible);
          evenement(ctx, d, { type: 'tir', de: p, vers: me.cible, touche });
          if (touche) toucher(ctx, d, me.cible, p);
        }
      }
      me.action = 'cache'; me.cible = null; me.depuis = now;
      changed = true;
    }
  }
  if (d.dragon.pv <= 0) return terminer(ctx, r, 'dragon');
  // le dragon : préavis, puis attaque sur tous ceux qui sont à découvert
  if (!d.dragon.prevenu && now >= d.dragon.attaque - PREAVIS) { d.dragon.prevenu = true; evenement(ctx, d, { type: 'souffle-prepare' }); changed = true; }
  if (now >= d.dragon.attaque) {
    const touches = Object.keys(d.j).filter(p => expose(d, p));
    evenement(ctx, d, { type: 'souffle', touches });
    for (const p of touches) toucher(ctx, d, p, 'dragon');
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
  const occupe = me.action === 'vise' || me.action === 'cherche';
  if (a.type === 'observer') {
    if (occupe) return ok('');
    me.action = a.on ? 'observe' : 'cache';
    me.depuis = now;
    return ok('');
  }
  if (a.type === 'viser') {
    if (occupe) return err('Tu es déjà occupé.');
    if (me.munitions <= 0) return err('Plus de munitions : va en chercher !');
    if (a.cible === 'dragon') { if (d.dragon.pv <= 0) return err('Le dragon est déjà vaincu.'); }
    else {
      if (!enJeu(d, a.cible) || a.cible === nom) return err('Cible impossible.');
      if (equipeDe(r, a.cible) === equipeDe(r, nom)) return err('C\'est ton coéquipier !');
    }
    Object.assign(me, { action: 'vise', cible: a.cible, finAction: now + VISEE, depuis: now });
    return ok(a.cible === 'dragon' ? 'Tu vises le dragon…' : `Tu vises ${a.cible}…`);
  }
  if (a.type === 'chercher') {
    if (occupe) return err('Tu es déjà occupé.');
    if (me.munitions >= MAX_MUNITIONS) return err('Tu as déjà le maximum de munitions.');
    Object.assign(me, { action: 'cherche', cible: null, finAction: now + num(sc.tempsRecherche, 3, 1, 30) * 1000, depuis: now });
    return ok('Tu cherches des munitions…');
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

// Ce que voit chacun : l'écran montre tout (qui est à découvert, ce qu'il fait, ses munitions) ; le téléphone, seulement son joueur.
export function view(ctx, g, r, as, nom) {
  const d = r.dr;
  if (!d) return null;
  const v = {
    type: id, phase: d.phase, fin: d.fin, raison: d.raison,
    dragon: { pv: d.dragon.pv, max: d.dragon.max, prepare: d.phase === 'jeu' && d.dragon.prevenu, attaque: d.dragon.prevenu ? d.dragon.attaque : null },
    joueurs: r.joueurs.map(p => ({ nom: p, equipe: equipeDe(r, p), vies: d.j[p].vies, horsJeu: !enJeu(d, p), degats: d.j[p].degats })),
    events: d.events.slice(-8),
    etats: r.joueurs.map(p => ({ nom: p, action: enJeu(d, p) ? d.j[p].action : 'horsjeu', cible: d.j[p].cible, munitions: d.j[p].munitions })),
    equipes: r.equipes.length > 2 || r.equipes.every(t => t.length === 1) ? null : r.equipes,
  };
  if (as === 'admin') v.attaque = d.dragon.attaque;
  if (as === 'joueur' && d.j[nom]) {
    const me = d.j[nom];
    v.moi = { vies: me.vies, munitions: me.munitions, action: me.action, cible: me.cible, finAction: me.finAction, horsJeu: !enJeu(d, nom), equipe: equipeDe(r, nom) };
    v.cibles = r.joueurs.filter(p => p !== nom && enJeu(d, p) && equipeDe(r, p) !== equipeDe(r, nom));
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
