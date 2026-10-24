// Jeu 5 — L'Enquête : un Cluedo grandeur nature. Voir docs/jeu5-enquete.md.
// Après un dîner, tout le monde est amnésique et un cadavre est dans la maison. Une salle, un personnage et une arme
// forment la solution (personne ne les a). Chaque joueur incarne un personnage (réglé dans l'admin) et reçoit 3 cartes ; le joueur
// dont le personnage est dans la solution est le tueur… sans le savoir. On se déplace de salle en salle en scannant le
// QR code de la tablette ; dans une salle, on interroge un joueur présent ou on demande un indice à la tablette.
import { createHmac, randomBytes } from 'node:crypto';
import { shuffle } from '../util.js';
import * as T from './taches.js';

export const id = 'enquete';
export const name = "L'Enquête";
export const minPlayers = 2;


export const SALLES_1930 = ['Garage', 'Salle de jeu', 'Salle à manger', 'Salon', 'Cuisine', 'Bureau', 'Salle de bain', 'Chambre', 'Grenier', 'Bibliothèque', 'Pharmacie'].join('\n');
export const SALLES_V1 = SALLES_1930.replace('Salle de bain', 'Salle de bains');
export const PERSOS_1930 = ['Veuve Pervenche', 'Madame Blanche', 'Colonel Moutarde', 'Miss Scarlette', 'Maître Rose', 'Professeur Violet', 'Docteur Olive', 'Doctoresse Orchidée', 'Monsieur Prunelle', 'Sergent Legris', 'Juge Orange', 'Détective Anthracite', 'Comptesse Ivoire', 'Baron Safran'].join('\n');
export const PERSOS_AVANT = ['Le Majordome', 'La Comtesse', 'Le Docteur', 'Le Colonel', 'La Cantatrice', 'Le Professeur', 'La Gouvernante', 'Le Notaire', "L'Héritière", 'Le Jardinier', 'La Veuve', 'Le Chef cuisinier', "L'Aventurière", 'Le Pasteur'].join('\n');
export const ARMES_1930 = ['Poignard', 'Chandelier', 'Revolver', 'Corde', 'Clé anglaise', 'Matraque', 'Poison', 'Fusil de chasse', 'Club de Golf', 'Hache'].join('\n');
// Réglages d'une arme, pour le tueur et pour un joueur : délai entre deux victimes dans la même salle (s), nombre maximum de victimes
// par passage dans une salle, délai de rechargement une fois la salle quittée (s) et effet (selon l'arme : assommé en s, cordes, salles de poison).
// Joueur : effet = durée (s) d'assommé ou de mains liées ; nombre = cordes que porte le joueur.
const reg = (eTueur, eJoueur, tueur = {}, nombre = 3) => ({ tueur: { usage: 20, max: 2, recharge: 180, effet: eTueur, ...tueur }, joueur: { usage: 30, max: 1, recharge: 240, effet: eJoueur, nombre } });
export const ARMES_REGLAGES = [reg(0, 0), reg(60, 60), reg(0, 0, { usage: 60, max: 1 }, 2), reg(2, 60, {}, 2), reg(60, 60), reg(60, 60), reg(3, 0, {}, 2), reg(0, 0, { usage: 60, max: 1 }, 2), reg(60, 60), reg(0, 0)];
export const ARMES_AVANT = ['Couteau', 'Corde', 'Chandelier', 'Revolver', 'Poison', 'Clé anglaise', 'Matraque'].join('\n');
// Ancienne liste par défaut (avant les tâches) : remplacée par celle du manoir si elle n'a pas été modifiée.
export const SALLES_AVANT = ['Cuisine', 'Salon', 'Salle à manger', 'Bibliothèque', 'Bureau', 'Chambre', 'Salle de bain', 'Entrée', 'Jardin', 'Cave', 'Grenier'].join('\n');

export function defaultConfig() {
  return {
    // Dans cet ordre : chaque salle a ses tâches (voir taches.js et docs/jeu5-taches.md).
    salles: SALLES_1930,
    // Une ligne par personnage ; chaque joueur en reçoit un au hasard.
    personnages: PERSOS_1930,
    armes: ARMES_1930,
    intro: "Vous vous réveillez autour de la table du dîner. Personne ne se souvient de rien.\nDans la maison, un corps.\nPersonne n'a pu entrer ni sortir : le coupable est l'un d'entre vous… et il ne le sait peut-être pas lui-même.",
    dureeMax: 7200, // durée maximale de l'enquête (s)
    finaleApres: 5400, // la phase finale commence au bout de ce temps (s) ; 0 = seulement à la main
    delaiQuestion: 30, // entre deux questions d'un même joueur (s)
    delaiReponse: 60, // le joueur interrogé a ce temps pour choisir la carte ; ensuite, une carte au hasard (s)
    rotationQr: 30, // le QR code des tablettes change toutes les … s ; 0 = fixe
    taches: true, // il faut réussir la tâche d'une salle pour en recevoir l'indice (sinon, indice gratuit)
    tachesSolo: Array.from({ length: 11 }, () => true), // tâche solo activée, salle par salle (dans l'ordre des salles)
    tachesGroupe: Array.from({ length: 11 }, () => true), // tâche à plusieurs activée, salle par salle
    chanceSolo: 50, // chance (%) que la salle tire sa tâche solo plutôt que celle à plusieurs
    difficulte: 'normal', // facile | normal | difficile
    etages: ['Sous-sol', 'Sous-sol', 'Rez-de-chaussée', 'Rez-de-chaussée', 'Rez-de-chaussée', 'Rez-de-chaussée', 'Rez-de-chaussée', 'Étage', 'Étage', 'Étage', 'Étage'], // étage de chaque salle (armes à feu : même étage)
    armesJoueurs: true, // des armes traînent dans les salles (et s'obtiennent en réussissant une tâche) : les joueurs s'en servent entre eux
    chanceArmeTache: 25, // chance (%) de trouver une arme en réussissant une tâche
    premiereArme: 150, // la première arme apparaît au bout de … s d'enquête
    apparitionArme: 150, // ensuite, une arme apparaît dans une salle toutes les … s
    delaiMenace: 60, // une personne menacée doit donner une carte dans ce temps (s), sinon une carte est donnée au hasard
    armesReglages: ARMES_REGLAGES, // une entrée par arme (dans l'ordre des armes) : { tueur, joueur } = { usage, max, recharge, effet }
    panne: true, // début de partie : les plombs ont sauté, chacun va réparer dans sa salle (sinon l'enquête démarre tout de suite)
    delaiQuitter: 10, // après « Quitter la salle », le joueur reste dans la salle ce temps (s)
    penaliteOubli: 30, // immobilisé ce temps s'il scanne une autre salle sans avoir quitté la sienne (s)
    rejoindreEnCours: true, // un joueur peut rejoindre la partie déjà lancée, avec un personnage qui n'est joué par personne
    liensSalles: true, // l'admin peut copier des liens permanents vers chaque salle (ils marchent sans scanner la tablette)
    complices: true, // chaque joueur a un complice, à retrouver grâce à des indices (Bureau, Salle de jeu, Grenier)
    sallesComplices: { bureau: 'Bureau', jeu: 'Salle de jeu', grenier: 'Grenier' }, // noms des salles (comme dans la liste des salles)
    texteBureauComplice: "Dans les tiroirs du bureau, des lettres et des photos : vous avez tous un complice dans cette maison. Retrouve le tien : cherche dans la salle de jeu et au grenier.",
    texteJeuComplice: 'Sous le tapis vert, une carte griffonnée : ton complice est {complice}.',
    texteGrenierComplice: 'Dans une vieille malle, un registre : {complice} est incarné par {joueur}.',
    ficheNumerique: false, // fiche de détective sur le téléphone (sinon, sur papier)
    indicesParSalle: 3, // indices par joueur et par salle (au plus 3 : les 3 indices écrits de la salle)
    indicesFinale: 3, // pendant la phase finale
    // Solution : vide = tirée au hasard ; sinon le nom exact (utile si les indices écrits parlent de la solution).
    solution: { salle: '', perso: '', arme: '' },
    // Indices de chaque salle (une ligne = un indice, dans l'ordre). {carte} = une carte qui n'est pas dans la solution ;
    // {salle}, {perso}, {arme} = une salle, un personnage, une arme qui ne sont pas dans la solution.
    // Trois indices écrits par salle, avec la chance (en %) qu'ils soient donnés en premier (p1) puis en deuxième (p2).
    // Un joueur ne reçoit jamais deux fois le même indice, ni un indice qui cite une carte qu'il connaît déjà.
    // Un emplacement vide est rempli au lancement avec un vrai fait tiré de la solution (visible dans l'admin).
    // 3 pools d'indices communs à tout le jeu (1er, 2e et 3e indice) : une ligne = un indice, avec en option sa chance à la fin (« texte | 30 »).
    // À chaque partie, leurs indices sont répartis au hasard entre les salles.
    poolsIndices: ['', '', ''],
    rangPropre: 'hasard', // rang auquel une salle « trop propre » donne son indice général : '2', '3' ou 'hasard' (jamais le premier)
    sallesPropres: 2, // nombre de salles « trop propres » (indice général : le crime n'a pas eu lieu ici)
    textePropre: "Cette salle est trop propre : il est impossible qu'un crime y ait eu lieu.",
    // Indices automatiques (quand une salle n'a plus d'indice écrit) : une ligne = un modèle, tiré au hasard.
    // {3salle}, {3arme}, {3perso}, {3carte} = 3 cartes dont AU PLUS UNE est dans la solution (indice à recouper).
    modeles: [
      "Un souvenir revient : « {carte} » n'a rien à voir avec le crime.",
      'Au moins 2 de ces 3 salles ne sont pas le lieu du crime : {3salle}.',
      "Au moins 2 de ces 3 armes n'ont pas servi : {3arme}.",
      'Au moins 2 de ces 3 personnages sont innocents : {3perso}.',
    ].join('\n'),
  };
}

// ---------- outils ----------
const lignes = (t, max = 40) => String(t ?? '').split(/\r?\n/).map(x => x.trim().slice(0, 40)).filter(Boolean).slice(0, max);
const ok = msg => ({ ok: true, msg });
const err = msg => ({ ok: false, msg });
const pick = a => a[Math.floor(Math.random() * a.length)];

// Personnages réglés dans l'admin (un par ligne). Une ancienne ligne « Prénom = Personnage » ne garde que le personnage.
export function personnagesDe(texte) {
  return String(texte ?? '').split(/\r?\n/).map(l => l.split('=').pop().split('|')[0].trim().slice(0, 40)).filter(Boolean).slice(0, 40);
}
// Sexe des personnages : « Nom | F » (femme) ou « Nom | H » (non) dans la liste ; sans marque, celui des personnages d'origine (les autres : non).
const FEMMES_1930 = ['Veuve Pervenche', 'Madame Blanche', 'Miss Scarlette', 'Doctoresse Orchidée', 'Comptesse Ivoire'];
export function femmesDe(texte) {
  const out = {};
  for (const l of String(texte ?? '').split(/\r?\n/)) {
    const [n, m] = l.split('=').pop().split('|').map(x => x.trim());
    if (n) out[n.toLowerCase()] = m ? /^f/i.test(m) : FEMMES_1930.some(x => x.toLowerCase() === n.toLowerCase());
  }
  return out;
}
// Personnage de chaque joueur : tiré au hasard parmi ceux de l'admin qui ne sont pas déjà en jeu.
function attribuer(ctx, pids, deja = []) {
  const libres = shuffle(personnagesDe(ctx.cfg.personnages).filter(n => !deja.includes(n)));
  // le tueur fixé dans l'admin est toujours en jeu
  const fixe = libres.findIndex(n => n.toLowerCase() === String(ctx.cfg.solution?.perso ?? '').trim().toLowerCase());
  if (fixe > 0) libres.unshift(...libres.splice(fixe, 1));
  let n = deja.length;
  return Object.fromEntries(pids.map(p => [p, libres.shift() ?? `Personnage ${++n + libres.length}`]));
}

// Cartes de la partie : salles s0…, personnages p0… (un par joueur, dans l'ordre donné), armes a0….
function cartesDe(cfg, persos) {
  const salles = lignes(cfg.salles === SALLES_AVANT || cfg.salles === SALLES_V1 ? SALLES_1930 : cfg.salles, 20), armes = lignes(cfg.armes, 20);
  const c = {};
  salles.forEach((nom, i) => { c[`s${i}`] = { id: `s${i}`, type: 'salle', nom }; });
  persos.forEach((nom, i) => { c[`p${i}`] = { id: `p${i}`, type: 'perso', nom }; });
  armes.forEach((nom, i) => { c[`a${i}`] = { id: `a${i}`, type: 'arme', nom }; });
  return c;
}
const deType = (g, t) => Object.values(g.cartes).filter(c => c.type === t).map(c => c.id);
const nom = (g, id) => g.cartes[id]?.nom ?? '?';

// Distribution : chaque carte (hors solution) une fois, puis des doublons (2 joueurs au plus par carte),
// jamais deux fois la même carte au même joueur ; chacun reçoit exactement `parJoueur` cartes.
// Les deux exemplaires d'un doublon se suivent dans le paquet, et on distribue en tournant : ils vont à deux joueurs différents.
export function distribuer(cartes, pids, parJoueur = 3) {
  const total = pids.length * parJoueur;
  const base = shuffle(cartes);
  const doubles = Math.min(base.length, Math.max(0, total - base.length));
  const paquet = shuffle(base.map((c, i) => (i < doubles ? [c, c] : [c]))).flat().slice(0, total);
  const ordre = shuffle(pids);
  const mains = Object.fromEntries(pids.map(p => [p, []]));
  paquet.forEach((c, k) => mains[ordre[k % ordre.length]].push(c));
  return mains;
}

// Code d'une salle pour une fenêtre de temps : 4 chiffres, différents d'une salle à l'autre.
// Code permanent d'une salle (lien à envoyer aux joueurs) : propre à cette partie.
export const codeFixe = (g, n) => createHmac('sha256', g.secret).update(`fixe:${n}`).digest('hex').slice(0, 10);
function codesDe(g, w) {
  const out = [], pris = new Set();
  for (let s = 0; s < g.nbSalles; s++) {
    let k = 0, code;
    do { code = String(parseInt(createHmac('sha256', g.secret).update(`${s}:${w}:${k++}`).digest('hex').slice(0, 8), 16) % 9000 + 1000); } while (pris.has(code));
    pris.add(code);
    out.push(code);
  }
  return out;
}
const fenetre = (ctx, g, now = ctx.now()) => (ctx.cfg.rotationQr > 0 ? Math.floor(now / (ctx.cfg.rotationQr * 1000)) : 0);

function feed(g, ctx, text) {
  g.feed.unshift({ t: ctx.now(), text });
  g.feed.length = Math.min(g.feed.length, 40);
}
// Qui joue quel personnage reste secret pendant la partie : en public, seulement le prénom.
const qui = (ctx, g, p) => ctx.name(p);

// ---------- indices de remplissage (faits vrais tirés de la solution) ----------
const listeNoms = noms => (noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}` : noms[0] || '…');
function indiceAuto(g) {
  const sol = Object.values(g.solution), type = pick(['salle', 'perso', 'arme']);
  const innocentes = Object.values(g.cartes).filter(c => !sol.includes(c.id)).map(c => c.id);
  if (Math.random() < 0.5) { // une carte innocentée
    const c = pick(innocentes);
    return { texte: `Un souvenir revient : « ${nom(g, c)} » n'a rien à voir avec le crime.`, elim: [c] };
  }
  const lib = innocentes.filter(c => g.cartes[c].type === type), laSol = g.solution[type];
  const choix = shuffle([...shuffle(lib).slice(0, 2), laSol]).map(c => nom(g, c)); // au moins 2 sur 3 sont innocentes
  const mot = { salle: 'salles ne sont pas le lieu du crime', perso: 'personnages sont innocents', arme: 'armes n\'ont pas servi' }[type];
  return { texte: `Au moins 2 de ces 3 ${mot} : ${listeNoms(choix)}.`, elim: [] };
}

// Un pool d'indices : une ligne = un indice ; « texte | 30 » donne sa chance (20 par défaut) ; 0 = jamais.
export function lirePool(texte) {
  return String(texte ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(.*?)\s*\|\s*(\d+(?:[.,]\d+)?)\s*$/);
    return m && m[1] ? { texte: m[1].trim(), poids: Number(m[2].replace(',', '.')) } : { texte: l, poids: 20 };
  });
}
// Au lancement : pour chaque rang (1er, 2e, 3e indice), on tire dans le pool autant d'indices que de salles (selon leurs chances, sans doublon)
// et on les place dans des salles au hasard. Les salles qui n'en reçoivent pas (pool trop petit) donneront un fait tiré de la solution.
function repartirIndices(ctx, g) {
  const n = g.nbSalles, parSalle = Array.from({ length: n }, () => [null, null, null]);
  [0, 1, 2].forEach(r => {
    const restants = lirePool(ctx.cfg.poolsIndices?.[r]);
    const salles = shuffle(Array.from({ length: n }, (_, i) => i));
    for (const i of salles) {
      if (!restants.length) break;
      let total = restants.reduce((a, e) => a + Math.max(0, e.poids), 0), k;
      if (total <= 0) k = Math.floor(Math.random() * restants.length);
      else { let t = Math.random() * total; k = restants.findIndex(e => (t -= Math.max(0, e.poids)) <= 0); if (k < 0) k = restants.length - 1; }
      parSalle[i][r] = restants.splice(k, 1)[0].texte;
    }
  });
  g.indicesSalle = parSalle;
}

// ---------- départ ----------
export function start(ctx, pids) {
  const cfg = ctx.cfg;
  const ordre = shuffle(pids);
  const persos = attribuer(ctx, ordre);
  const g = {
    phase: 'intro', // intro | enquete | finale ; puis finished
    debut: 0, endsAt: 0, finaleAt: 0,
    secret: randomBytes(16).toString('hex'),
    cartes: cartesDe(cfg, ordre.map(p => persos[p])),
    joueurs: {}, // pid -> { perso, main, salle, indices, pris: { salle: n }, accuse, nextAsk, last, vus: { carte: [pid] }, elimines: [] }
    questions: [], // { id, de, a, salle, perso, arme, at, carte, etat }
    feed: [], finished: false, winner: null, finishedAt: 0, solution: null,
  };
  g.nbSalles = deType(g, 'salle').length;
  g.auto = []; g.propres = [];
  g.femmes = {}; // cartes de personnages qui sont des femmes (jamais envoyé aux téléphones : sert aux indices)
  { const f = femmesDe(cfg.personnages); for (const id of deType(g, 'perso')) if (f[g.cartes[id].nom.toLowerCase()]) g.femmes[id] = true; }
  // Solution : celle fixée dans l'admin si elle existe, sinon au hasard.
  const fixe = (t, n) => deType(g, t).find(id => n && g.cartes[id].nom.toLowerCase() === String(n).trim().toLowerCase());
  g.solution = {
    salle: fixe('salle', cfg.solution?.salle) || pick(deType(g, 'salle')),
    perso: fixe('perso', cfg.solution?.perso) || pick(deType(g, 'perso')),
    arme: fixe('arme', cfg.solution?.arme) || pick(deType(g, 'arme')),
  };
  // salles « trop propres » (jamais la salle du crime) et indices de remplissage tirés de la vraie solution
  g.propres = shuffle(deType(g, 'salle').filter(x => x !== g.solution.salle)).slice(0, Math.max(0, Math.round(Number(cfg.sallesPropres) || 0)));
  g.proprePos = Object.fromEntries(g.propres.map(x => [x, cfg.rangPropre === '2' ? 1 : cfg.rangPropre === '3' ? 2 : pick([1, 2])])); // rang (0 = 1er) de l'indice « trop propre » : jamais le premier
  g.auto = Array.from({ length: g.nbSalles }, () => [0, 1, 2].map(() => indiceAuto(g)));
  repartirIndices(ctx, g);
  const sol = new Set(Object.values(g.solution));
  const mains = distribuer(Object.keys(g.cartes).filter(c => !sol.has(c)), ordre);
  ordre.forEach((p, i) => {
    g.joueurs[p] = { perso: `p${i}`, main: mains[p], salle: null, indices: 0, pris: {}, accuse: null, nextAsk: 0, last: null, vus: {}, elimines: [], coches: [] };
  });
  apparier(g, ordre);
  return g;
}

// ---------- les complices ----------
// Deux par deux (un trio en cercle si le nombre de joueurs est impair). Chacun doit retrouver le sien grâce à des indices :
// le Bureau annonce qu'il y a des complices, la Salle de jeu donne le personnage du complice, le Grenier le joueur qui l'incarne ;
// ensuite, dans la même salle, ils échangent une carte chacun. Un tueur peut y recruter son complice.
function apparier(g, pids) {
  const o = shuffle(pids), n = o.length;
  if (n < 2) return;
  const reste = n % 2 ? 3 : 0;
  for (let i = 0; i + 1 < n - reste; i += 2) { g.joueurs[o[i]].complice = o[i + 1]; g.joueurs[o[i + 1]].complice = o[i]; }
  if (reste) { const t = o.slice(-3); t.forEach((p, i) => { g.joueurs[p].complice = t[(i + 1) % 3]; }); }
  for (const p of pids) g.joueurs[p].comp = { debloque: false, jeu: false, grenier: false, choix: null, fait: false };
}
const nomSalle = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
// La salle (s0, s1…) qui porte ce nom dans la liste des salles, ou null.
const salleNommee = (g, nomCherche) => deType(g, 'salle').find(s => nomSalle(nom(g, s)) === nomSalle(nomCherche)) ?? null;
const sallesComp = (ctx, g) => ({ bureau: salleNommee(g, ctx.cfg.sallesComplices?.bureau), jeu: salleNommee(g, ctx.cfg.sallesComplices?.jeu), grenier: salleNommee(g, ctx.cfg.sallesComplices?.grenier) });
const compPret = J => !!(J.comp && J.comp.jeu && J.comp.grenier);
// Le complice de p est-il en jeu et prêt à le retrouver ? Chacun doit avoir fait sa propre enquête s'il désigne l'autre.
function peutSeRetrouver(g, p, q) {
  const P = g.joueurs[p], Q = g.joueurs[q];
  if (!P || !Q || P.mort || Q.mort || !P.salle || P.salle !== Q.salle) return false;
  const mutuel = P.complice === q && Q.complice === p;
  // deux complices l'un de l'autre : il suffit que l'un ait tout trouvé et que l'autre ait débloqué la 1re étape (Bureau)
  if (mutuel) return (compPret(P) && !!Q.comp?.debloque) || (compPret(Q) && !!P.comp?.debloque);
  if (P.complice === q) return compPret(P);
  if (Q.complice === p) return compPret(Q);
  return false;
}
const texteComplice = (ctx, g, p, texte) => {
  const c = g.joueurs[p].complice;
  return String(texte ?? '').replace(/\{complice\}/g, c ? nom(g, g.joueurs[c].perso) : '?').replace(/\{joueur\}/g, c ? ctx.name(c) : '?').replace(/\{sexe\}/g, c && g.femmes?.[g.joueurs[c].perso] ? 'est une femme' : 'n\'est pas une femme');
};
function complice(ctx, g, p, a) {
  const J = g.joueurs[p], C = J.complice && g.joueurs[J.complice];
  if (!ctx.cfg.complices || !J.comp || !C) return err('Tu n\'as pas de complice.');
  const sa = sallesComp(ctx, g);
  if (a.op === 'chercher') {
    if (!J.comp.debloque) return err('Tu ne sais pas encore que tu as un complice.');
    const cle = J.salle === sa.jeu ? 'jeu' : J.salle === sa.grenier ? 'grenier' : null;
    if (!cle) return err('Ce n\'est pas ici que tu trouveras des traces de ton complice.');
    if (J.comp[cle]) return err('Tu as déjà trouvé ce qu\'il y avait ici.');
    J.comp[cle] = true;
    const texte = texteComplice(ctx, g, p, cle === 'jeu' ? ctx.cfg.texteJeuComplice : ctx.cfg.texteGrenierComplice);
    (J.notes ??= []).unshift({ t: ctx.now(), salle: J.salle, texte: `🤝 ${texte}` });
    return { ok: true, msg: `🤝 ${texte}`, indice: texte };
  }
  if (a.op === 'echanger') {
    // Deux complices l'un de l'autre échangent leurs cartes (quand les deux ont choisi). Sans réciprocité (nombre impair, joueur arrivé en cours de partie),
    // chacun donne simplement une carte à son complice, qui n'a rien à faire.
    if (J.comp.fait) return err('Tu as déjà donné une carte à ton complice.');
    const mutuel = C.complice === p;
    if (C.mort || !J.salle || J.salle !== C.salle) return err('Tu dois être dans la même salle que ton complice.');
    if (!peutSeRetrouver(g, p, J.complice)) return err(mutuel ? 'Il faut que l\'un de vous deux ait trouvé qui est son complice (salle de jeu et grenier) et que l\'autre ait débloqué les complices (bureau).' : 'Trouve d\'abord qui est ton complice (salle de jeu et grenier).');
    if (!J.main.includes(a.carte)) return err('Choisis une de tes cartes.');
    const donner = (X, Y, carte, de) => { // Y reçoit la carte de X
      (Y.vus[carte] ??= []).includes(de) || Y.vus[carte].push(de);
      (Y.notes ??= []).unshift({ t: ctx.now(), salle: Y.salle, texte: `🤝 ${ctx.name(de)}, ton complice, t'a donné : « ${nom(g, carte)} ».` });
    };
    if (!mutuel) { donner(J, C, a.carte, p); J.comp.fait = true; return ok(`🤝 Tu as donné « ${nom(g, a.carte)} » à ton complice.`); }
    J.comp.choix = a.carte;
    if (C.comp?.choix && !C.comp.fait) { // les deux ont choisi : chacun reçoit la carte de l'autre
      const recue = C.comp.choix;
      donner(C, J, recue, J.complice); donner(J, C, J.comp.choix, p);
      J.comp.fait = C.comp.fait = true; J.comp.choix = C.comp.choix = null;
      return ok(`🤝 Échange fait : ton complice t'a donné « ${nom(g, recue)} ».`);
    }
    return ok('Carte choisie : l\'échange se fera quand ton complice aura choisi la sienne.');
  }
  if (a.op === 'recruter') { // le tueur propose : son complice (dans la même salle) choisit d'accepter ou non
    if (!J.tueur?.actif) return err('Action inconnue.');
    if (J.tueur.recrute) return err('Tu as déjà fait ta proposition à ton complice.');
    if (C.tueur) return err('Ton complice est déjà tueur.');
    if (!peutSeRetrouver(g, p, J.complice) && !peutSeRetrouver(g, J.complice, p)) return err('Tu dois être dans la même salle que ton complice, après l\'avoir retrouvé.');
    J.tueur.recrute = 'attente';
    C.comp.propose = p;
    return ok(`😈 Tu as proposé à ${ctx.name(J.complice)} de devenir tueur. Il doit accepter, dans cette salle.`);
  }
  if (a.op === 'accepter' || a.op === 'refuser') { // réponse du complice
    const pid = J.comp.propose, P = pid && g.joueurs[pid];
    if (!P?.tueur || P.tueur.recrute !== 'attente' || P.mort) { J.comp.propose = null; return err('Personne ne te propose rien.'); }
    if (a.op === 'refuser') {
      J.comp.propose = null; P.tueur.recrute = 'refuse';
      (P.notes ??= []).unshift({ t: ctx.now(), salle: P.salle, texte: `😈 ${ctx.name(p)} a refusé de devenir tueur.` });
      return ok('Tu as refusé : tu restes innocent.');
    }
    if (!P.salle || P.salle !== J.salle) return err('Il faut être dans la même salle que ton complice pour accepter.');
    J.comp.propose = null; P.tueur.recrute = p;
    J.tueur = { actif: true, recrue: true, cache: null, arme: false, pret: 0, usage: null, victimes: 0, at: ctx.now() };
    (J.notes ??= []).unshift({ t: ctx.now(), salle: J.salle, texte: '🩸 Tu as accepté : tu es désormais tueur. Il te faut une arme : ramasse-en une dans une salle.' });
    (P.notes ??= []).unshift({ t: ctx.now(), salle: P.salle, texte: `😈 ${ctx.name(p)} a accepté : il est tueur, mais doit trouver une arme.` });
    return ok('🩸 Tu es désormais tueur. Il te faut une arme : ramasse-en une qui traîne dans une salle.');
  }
  return err('Action inconnue.');
}

// ---------- simulateur d'indices (admin) ----------
// Pour chaque salle : une partie simulée toute neuve, et un joueur simulé qui récupère ses indices à la suite (en passant par d'autres salles
// entre deux indices). Rien n'est enregistré : c'est pour relire ses textes tels que les joueurs les verront.
const PRENOMS = ['Léa', 'Hugo', 'Emma', 'Louis', 'Chloé', 'Jules', 'Manon', 'Adam', 'Inès', 'Lucas', 'Camille', 'Noé', 'Sarah', 'Tom'];
export function simulerIndices(cfgJeu, nb = 8) {
  const n = Math.max(3, Math.min(14, Math.round(Number(nb)) || 8));
  const cfg = { ...cfgJeu, taches: false, panne: false, armesJoueurs: false };
  const noms = {}, pids = Array.from({ length: n }, (_, i) => { noms[`s${i}`] = PRENOMS[i % PRENOMS.length] + (i >= PRENOMS.length ? i : ''); return `s${i}`; });
  const ctx = { now: () => Date.now(), cfg, name: p => noms[p] ?? '?', sfx: () => {} };
  const nbSalles = lignes(cfg.salles === SALLES_AVANT || cfg.salles === SALLES_V1 ? SALLES_1930 : cfg.salles, 20).length;
  const salles = [], g = start(ctx, pids);
  adminAction(ctx, g, { type: 'lancer' });
  const P = pids.find(x => g.joueurs[x].perso !== g.solution.perso);
  const J = g.joueurs[P];
  for (let i = 0; i < nbSalles; i++) {
    // le joueur simulé repart de zéro pour chaque salle (mêmes indices répartis dans la partie, rien de retenu d'une salle à l'autre)
    Object.assign(J, { pris: {}, recus: {}, vus: {}, elimines: [], dernier: {}, histo: [], nommes: [], salle: null });
    const indices = [];
    for (let k = 0; k < Math.max(1, Math.min(4, maxSalle(ctx, g))); k++) {
      if (k > 0) for (const x of [(i + 1) % nbSalles, (i + 2) % nbSalles].slice(0, Math.min(k, 2))) adminAction(ctx, g, { type: 'placer', pid: P, salle: `s${x}` });
      adminAction(ctx, g, { type: 'placer', pid: P, salle: `s${i}` });
      const avant = J.recus?.[`s${i}`]?.length || 0;
      const r = playerAction(ctx, g, P, { type: 'indice' });
      if (!r.ok) break;
      const cle = (J.recus?.[`s${i}`]?.length || 0) > avant ? J.recus[`s${i}`].at(-1) : null; // pas de nouveau repère : indice de secours
      indices.push({ texte: r.indice, source: cle === 'propre' ? 'propre' : cle === 'auto' ? 'auto' : cle ? 'écrit' : 'secours', ...(r.complice ? { complice: r.complice } : {}) });
    }
    salles.push({ nom: nom(g, `s${i}`), indices });
  }
  // textes des complices vus par un joueur simulé
  const complices = { personne: J.complice ? nom(g, g.joueurs[J.complice].perso) : '', joueur: J.complice ? noms[J.complice] : '',
    bureau: texteComplice(ctx, g, P, cfg.texteBureauComplice), jeu: texteComplice(ctx, g, P, cfg.texteJeuComplice), grenier: texteComplice(ctx, g, P, cfg.texteGrenierComplice) };
  return { ok: true, joueurs: n, salles, complices: cfg.complices ? complices : null };
}

// L'admin lance l'enquête après le texte d'introduction.
// Début : l'admin lance → les plombs sautent (panne) : chaque joueur reçoit une salle (une au moins par salle, 2 pour certaines)
// et un code à taper sur la tablette de cette salle. Quand tous l'ont tapé, l'enquête commence.
function lancer(ctx, g) {
  if (!ctx.cfg.panne) return commencer(ctx, g);
  const pids = shuffle(Object.keys(g.joueurs)), salles = shuffle(deType(g, 'salle'));
  const codes = new Set();
  g.panne = { salles: {}, codes: {}, entres: [] };
  pids.forEach((p, i) => {
    g.panne.salles[p] = i < salles.length ? salles[i] : pick(salles); // une personne par salle d'abord, puis les autres au hasard
    let c; do { c = String(Math.floor(1000 + Math.random() * 9000)); } while (codes.has(c));
    codes.add(c); g.panne.codes[p] = c;
  });
  g.phase = 'panne';
  feed(g, ctx, '⚡ La foudre a frappé : les plombs ont sauté ! Chacun doit rejoindre sa salle pour les réparer.');
  ctx.sfx?.('annonce');
}
// Les armes apparaissent selon un calendrier fixé au début de l'enquête (une première après premiereArme s, puis une toutes les apparitionArme s),
// pour qu'un indice puisse dire où et quand la prochaine arrivera.
function planifierArmes(ctx, g, now) {
  g.planArmes = [];
  etendreArmes(ctx, g, now);
}
// Le calendrier couvre toute la durée de l'enquête (et se prolonge si elle est rallongée) : il y a des armes jusqu'à la fin.
function etendreArmes(ctx, g, debut) {
  const premiere = (ctx.cfg.premiereArme ?? 150) * 1000, pas = Math.max(10, ctx.cfg.apparitionArme ?? 150) * 1000, salles = deType(g, 'salle');
  const fin = Math.max(g.endsAt || 0, ctx.now()) + pas;
  let derniere = g.planArmes.at(-1)?.salle ?? null;
  for (let k = g.planArmes.length; k < 1000; k++) {
    const t = (g.planArmes.at(-1)?.t ?? debut + premiere - pas) + pas;
    if (t > fin) break;
    const salle = pick(salles.filter(x => x !== derniere)); derniere = salle;
    g.planArmes.push({ t, salle, arme: pick(armesNoms(g)), fait: false });
  }
}
// Tous les codes tapés (ou l'admin force) : le courant revient et l'enquête commence.
function commencer(ctx, g) {
  const now = ctx.now();
  for (const [p, s] of Object.entries(g.panne?.salles ?? {})) if (!g.joueurs[p].salle) g.joueurs[p].salle = s;
  g.phase = 'enquete';
  g.debut = now;
  g.endsAt = now + ctx.cfg.dureeMax * 1000;
  planifierArmes(ctx, g, now);
  g.finaleAt = ctx.cfg.finaleApres > 0 ? now + ctx.cfg.finaleApres * 1000 : 0;
  g.taches = Array.from({ length: g.nbSalles }, (_, n) => tirerTache(ctx, n));
  g.sessions = {};
  feed(g, ctx, g.panne ? '💡 Le courant est revenu : l\'enquête commence !' : "🔎 L'enquête commence !");
}

// ---------- tâches des salles ----------
const niveau = ctx => T.NIVEAUX[ctx.cfg.difficulte] ?? 1;
const activees = (ctx, n) => ({ solo: ctx.cfg.tachesSolo?.[n] !== false, groupe: ctx.cfg.tachesGroupe?.[n] !== false });
const paramsSolo = (ctx, id) => ({ ...(T.SOLOS[id].params ? T.SOLOS[id].params() : {}), niveau: niveau(ctx) });
function tirerTache(ctx, n, precedent = null) {
  const t = T.tirer(n, { ...activees(ctx, n), chanceSolo: Number(ctx.cfg.chanceSolo ?? 50), precedent });
  return t && { ...t, params: t.groupe ? {} : paramsSolo(ctx, t.id) };
}
const maxSalle = (ctx, g) => (g.phase === 'finale' ? ctx.cfg.indicesFinale : ctx.cfg.indicesParSalle);
// Où en est un joueur dans une salle : indice n° 1 et 2 = par une tâche ; entre deux indices, il faut passer dans d'autres salles
// (1 autre salle avant le 2e, 2 autres salles avant le 3e) ; le 3e se demande sans tâche.
function etatBase(ctx, g, p, s) {
  const J = g.joueurs[p], c = J.pris[s] || 0;
  if (c >= maxSalle(ctx, g)) return { etat: 'fini', c };
  const besoin = Math.min(c, 2), vu = new Set((J.histo || []).slice(J.dernier?.[s] ?? 0).filter(x => x !== s)).size;
  if (c > 0 && vu < besoin) return { etat: 'attente', c, reste: besoin - vu };
  return { etat: 'ok', c };
}
// Peut-il faire la tâche de la salle pour gagner un indice ? (sinon : indice déjà pris, trop tôt, ou 3e indice qui se demande sans tâche)
const aIndice = (ctx, g, p, s) => { const e = etatBase(ctx, g, p, s); return !(e.etat === 'ok' && e.c < 2); };
function etatIndice(ctx, g, p, s) {
  const e = etatBase(ctx, g, p, s);
  if (e.etat !== 'ok') return e;
  return { ...e, etat: e.c < 2 && ctx.cfg.taches && g.taches && tacheDe(ctx, g, s) ? 'tache' : 'libre' };
}
// Tâche de la salle pour les joueurs qui y sont : la tâche à plusieurs devient la solo s'il ne reste pas assez de joueurs sans l'indice.
function tacheDe(ctx, g, s) {
  const n = Number(s.slice(1));
  if (!g.taches || n >= g.taches.length) return null;
  const on = activees(ctx, n);
  // réglages changés dans l'admin : la salle retire une tâche permise (sauf pendant une tâche à plusieurs)
  let t = g.taches[n];
  if (!g.sessions[s] && (!t ? on.solo || on.groupe : !(t.groupe ? on.groupe : on.solo))) t = g.taches[n] = tirerTache(ctx, n, t);
  if (!t) return null; // aucune tâche dans cette salle : l'indice est gratuit
  if (!t.groupe || g.sessions[s]) return t;
  const besoin = Object.keys(g.joueurs).filter(p => !g.joueurs[p].mort && !aIndice(ctx, g, p, s)).length;
  if (besoin >= T.GROUPES[t.id].n) return t;
  if (!on.solo) return null; // pas assez de joueurs pour la tâche à plusieurs et pas de solo : indice gratuit
  const solo = T.SALLES[n % T.SALLES.length].solo;
  return { id: solo, groupe: false, params: (t.paramsSolo ??= paramsSolo(ctx, solo)) };
}
// Réussite : chaque participant reçoit l'indice de la salle (tous ceux de la phase finale d'un coup), puis la salle tire une nouvelle tâche.
function reussir(ctx, g, s, pids) {
  const textes = {};
  for (const p of pids) {
    const J = g.joueurs[p];
    if (!J || J.salle !== s) continue;
    const t = [];
    if (!aIndice(ctx, g, p, s)) { const r = indice(ctx, g, p, true); if (r.ok) { t.push(r.indice); if (r.complice) t.push(`🤝 ${r.complice}`); } }
    if (ctx.cfg.armesJoueurs && !J.arme && Math.random() * 100 < (ctx.cfg.chanceArmeTache ?? 0)) {
      const i = pick(armesNoms(g));
      donnerArme(ctx, g, p, i);
      t.push(`🎁 Tu trouves une arme : ${nom(g, `a${i}`)} !`);
    }
    textes[p] = t;
  }
  const n = Number(s.slice(1));
  feed(g, ctx, `✅ ${pids.map(p => ctx.name(p)).join(' et ')} : tâche réussie (${nom(g, s)})`);
  delete g.sessions[s];
  g.taches[n] = tirerTache(ctx, n, g.taches[n]);
  return textes;
}
// Un joueur qui quitte la salle annule la tâche à plusieurs en cours (ou quitte la file d'attente).
function quitterSession(g, p) {
  for (const [s, se] of Object.entries(g.sessions || {})) {
    if (!se.joueurs.includes(p)) continue;
    if (se.etat === 'jeu' || se.joueurs.length <= 1) delete g.sessions[s];
    else se.joueurs = se.joueurs.filter(x => x !== p);
  }
}

function finale(ctx, g) {
  if (g.phase !== 'enquete') return false;
  g.phase = 'finale';
  feed(g, ctx, '⚡ Phase finale : les indices sont doublés !');
  ctx.sfx?.('annonce');
  return true;
}

function terminer(ctx, g, winner = null) {
  g.finished = true;
  g.finishedAt = ctx.now();
  g.winner = winner;
  for (const q of g.questions) if (q.etat === 'attente') q.etat = 'annulee';
  feed(g, ctx, winner && g.joueurs[winner].tueur ? `🔪 ${qui(ctx, g, winner)}, le tueur, l'emporte : plus personne n'est en vie.` : winner ? `🏆 ${qui(ctx, g, winner)} a résolu l'enquête !` : "🕯 Fin de l'enquête : la vérité est révélée.");
  ctx.sfx?.('victoire');
}

// Une question en attente se résout : carte choisie, ou au hasard si le temps est écoulé.
function resoudre(ctx, g, q, carte, rien = false) {
  q.carte = carte;
  q.etat = 'repondue';
  const de = g.joueurs[q.de];
  if (carte) (de.vus[carte] ??= []).includes(q.a) || de.vus[carte].push(q.a);
  feed(g, ctx, `🗣 ${qui(ctx, g, q.de)} a interrogé ${qui(ctx, g, q.a)} dans ${nom(g, q.salle)} : ${carte ? 'une carte montrée' : rien ? 'rien de nouveau' : 'aucune carte'}`);
}
const enCommun = (g, q) => g.joueurs[q.a].main.filter(c => [q.salle, q.perso, q.arme].includes(c));
// Cartes que l'interrogé peut encore montrer : jamais deux fois la même à la même personne.
const dejaMontree = (g, de, a, c) => (g.joueurs[de].vus[c] || []).includes(a);
const aMontrer = (g, q) => enCommun(g, q).filter(c => !dejaMontree(g, q.de, q.a, c));

// Fin du chrono « Quitter la salle » : le joueur sort pour de bon.
function sortir(ctx, g, p) {
  const J = g.joueurs[p];
  quitteSalle(ctx, g, p);
  if (J.mort) return;
  quitterSession(g, p);
  J.salle = null;
  J.quitteA = 0;
}

export function tick(ctx, g) {
  if (g.finished || g.phase === 'intro' || g.phase === 'panne') return false;
  const now = ctx.now();
  let changed = false;
  for (const [p, J] of Object.entries(g.joueurs)) if (J.quitteA && now >= J.quitteA) { sortir(ctx, g, p); changed = true; }
  for (const q of g.questions) {
    if (q.etat === 'attente' && now >= q.at + ctx.cfg.delaiReponse * 1000) { if (g.joueurs[q.a].mort) q.etat = 'annulee'; else { const l = aMontrer(g, q); resoudre(ctx, g, q, l.length ? pick(l) : null, !l.length); } changed = true; }
  }
  for (const [s, se] of Object.entries(g.sessions || {})) {
    const def = T.GROUPES[se.id];
    if (se.etat !== 'jeu' || !def.tick) continue;
    const avant = JSON.stringify(se.data.code ?? null);
    if (def.tick(se.data, now) === 'reussi') { reussir(ctx, g, s, se.joueurs); changed = true; } else if (JSON.stringify(se.data.code ?? null) !== avant) changed = true;
  }
  for (const m of g.menaces || []) if (m.etat === 'attente' && now >= m.fin) { { const l = cartesLibres(g, m.de, m.a); if (l.length) remettreCarte(ctx, g, m, pick(l)); else m.etat = 'annulee'; changed = true; } }
  if (ctx.cfg.armesJoueurs && g.phase !== 'intro') {
    if (!g.planArmes) planifierArmes(ctx, g, g.debut || now);
    else if (g.planArmes.at(-1).t < g.endsAt) etendreArmes(ctx, g, g.debut || now);
    g.armesSol ??= {};
    for (const e of g.planArmes) {
      if (e.fait || now < e.t) continue;
      e.fait = true; changed = true;
      if (g.armesSol[e.salle] == null && Object.keys(g.armesSol).length < Math.max(2, Math.ceil(g.nbSalles / 3))) g.armesSol[e.salle] = e.arme;
    }
  }
  if (g.phase === 'enquete' && g.finaleAt && now >= g.finaleAt) changed = finale(ctx, g) || changed;
  if (now >= g.endsAt) { terminer(ctx, g); changed = true; }
  return changed;
}

// ---------- indices ----------
// Cartes qu'un joueur ne connaît pas encore (pas dans sa main, pas vues, pas éliminées), hors solution.
function inconnues(g, p, type = null) {
  const J = g.joueurs[p], sol = new Set(Object.values(g.solution));
  return Object.values(g.cartes).filter(c => !sol.has(c.id) && (!type || c.type === type) && !J.main.includes(c.id) && !J.vus[c.id] && !J.elimines.includes(c.id)).map(c => c.id);
}
// Repères qui parlent d'un autre joueur : {joueur}, {sexe}, {nonperso} (« pas A »), {2nonperso} (« ni A ni B »), {5nonpersos} (« A, B, C, D et E » : des innocents qu'il n'incarne pas).
const RE_JOUEUR = /\{joueur\}|\{sexe\}|\{\d?nonpersos?\}/;
// La prochaine arme prévue au calendrier (pas encore apparue).
const prochaineArme = (g, now) => (g.planArmes || []).find(e => !e.fait && e.t > now) ?? null;
// Joueurs dont on peut donner le nom à p dans un indice : vivants, pas lui-même, jamais le même nom deux fois pour lui.
const joueurNommable = (g, p) => Object.keys(g.joueurs).filter(x => x !== p && !g.joueurs[x].mort && !(g.joueurs[p].nommes || []).includes(x));
function remplir(g, p, texte, n, nomJoueur = x => x, now = Date.now()) {
  const elimines = [];
  // {joueur} : le nom d'un autre joueur (de préférence dont le personnage est encore inconnu de celui qui lit) ;
  // avec {3perso}, les 3 personnages proposés contiennent le vrai personnage de ce joueur.
  const J0 = g.joueurs[p];
  // parmi les joueurs les moins nommés jusque-là dans la partie
  const nommables = RE_JOUEUR.test(texte) ? joueurNommable(g, p) : [], min = Math.min(...nommables.map(x => g.nommes?.[x] || 0));
  const cible = nommables.filter(x => (g.nommes?.[x] || 0) === min);
  const inconnuPerso = x => !J0.main.includes(g.joueurs[x].perso) && !J0.vus[g.joueurs[x].perso] && !J0.elimines.includes(g.joueurs[x].perso);
  const cibleNom = cible.length ? pick(cible.filter(inconnuPerso).length ? cible.filter(inconnuPerso) : cible) : null;
  if (cibleNom) { (J0.nommes ??= []).push(cibleNom); (g.nommes ??= {})[cibleNom] = (g.nommes[cibleNom] || 0) + 1; }
  let vide = false; // plus aucune carte à éliminer de ce type pour ce joueur
  const prendre = type => {
    const libres = inconnues(g, p, type).filter(c => !elimines.includes(c));
    const pris = shuffle(libres).slice(0, n);
    elimines.push(...pris);
    if (!pris.length) vide = true;
    return pris.length ? pris.map(c => nom(g, c)).join(' » et « ') : '…';
  };
  // Indice à recouper : k cartes dont au plus une est dans la solution (une fois sur deux). Ces cartes ne comptent pas comme éliminées.
  const groupe = (k, type) => {
    if (cibleNom && type === 'perso') { // « X peut être A, B ou C » : le vrai personnage de X parmi k personnages
      const vrai = g.joueurs[cibleNom].perso, autresPersos = shuffle(deType(g, 'perso').filter(c => c !== vrai && c !== g.joueurs[p].perso));
      const noms = shuffle([vrai, ...autresPersos.slice(0, Math.max(1, k - 1))]).map(c => nom(g, c));
      return noms.length > 1 ? `${noms.slice(0, -1).join(', ')} ou ${noms.at(-1)}` : noms[0];
    }
    const J = g.joueurs[p], sol = Object.values(g.solution).filter(c => !type || g.cartes[c].type === type);
    const innocentes = Object.values(g.cartes).filter(c => !Object.values(g.solution).includes(c.id) && (!type || c.type === type)).map(c => c.id);
    const inconnu = c => !J.main.includes(c) && !J.vus[c] && !J.elimines.includes(c) && !elimines.includes(c);
    const avecSol = sol.length && Math.random() < 0.5;
    const nb = Math.max(1, k - (avecSol ? 1 : 0));
    const choix = [...shuffle(innocentes.filter(inconnu)), ...shuffle(innocentes.filter(c => !inconnu(c)))].slice(0, nb);
    if (avecSol) choix.push(pick(sol));
    return listeNoms(shuffle(choix).map(c => nom(g, c)));
  };
  const out = texte
    .replace(/\{(\d)?nonpersos\}/g, (_, k) => { // « Il est impossible que {5nonpersos} aient été là : {joueur} n'est aucun d'eux » : des innocents (jamais le coupable) que ce joueur n'incarne pas
      const innocents = shuffle(deType(g, 'perso').filter(c => c !== g.joueurs[cibleNom ?? p]?.perso && c !== J0.perso && c !== g.solution.perso)).slice(0, Math.max(2, Math.min(8, Number(k) || 3))).map(c => nom(g, c));
      if (!cibleNom || innocents.length < 2) { vide = true; return '…'; }
      return `${innocents.slice(0, -1).join(', ')} et ${innocents.at(-1)}`;
    })
    .replace(/\{(\d)?nonperso\}/g, (_, k) => { // « {joueur} n'est {nonperso} » : des personnages que ce joueur n'incarne pas
      if (!cibleNom) { vide = true; return '…'; }
      const k2 = Math.max(1, Math.min(6, Number(k) || 1));
      const autres = shuffle(deType(g, 'perso').filter(c => c !== g.joueurs[cibleNom].perso && c !== J0.perso)).slice(0, k2).map(c => nom(g, c));
      if (!autres.length) { vide = true; return '…'; }
      return autres.length === 1 ? `pas ${autres[0]}` : autres.map(x => `ni ${x}`).join(autres.length > 2 ? ', ' : ' ');
    })
    .replace(/\{joueur\}/g, cibleNom ? nomJoueur(cibleNom) : 'Quelqu\'un')
    .replace(/\{lieu_arme\}/g, () => { const e = prochaineArme(g, now); if (!e) vide = true; return e ? nom(g, e.salle) : '…'; })
    .replace(/\{heure_arme\}/g, () => { const e = prochaineArme(g, now); if (!e) vide = true; return e ? new Date(e.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':', 'h') : '…'; })
    .replace(/\{sexe\}/g, cibleNom ? (g.femmes?.[g.joueurs[cibleNom].perso] ? 'est une femme' : 'n\'est pas une femme') : 'est quelqu\'un')
    .replace(/\{(\d)(carte|salle|perso|arme)s?\}/g, (_, k, t) => groupe(Math.max(2, Number(k)), t === 'carte' ? null : t))
    .replace(/\{(carte|salle|perso|arme)\}/g, (_, k) => prendre(k === 'carte' ? null : k));
  if (vide) return { texte: "Tu as déjà éliminé toutes les pistes que cette salle pouvait t'apprendre : il ne te revient rien de nouveau.", elimines: [] };
  return { texte: out, elimines };
}

// Indice de la salle s pour le joueur p : celui que la salle porte à ce rang (1er, 2e ou 3e indice du joueur dans la salle), tiré des 3 pools au lancement.
// L'indice général « trop propre » prend la place du 2e ou du 3e (jamais le 1er). Jamais deux fois le même texte pour un joueur,
// jamais un indice qui cite une carte déjà connue : sinon, un fait vrai tiré de la solution.
function choisirIndice(ctx, g, p, s) {
  const J = g.joueurs[p], n = Number(s.slice(1));
  J.recus ??= {};
  const recus = J.recus[s] ??= [], rang = Math.min(J.pris[s] || 0, 2);
  const connu = new Set([...J.main, ...Object.keys(J.vus), ...J.elimines]);
  const norm = x => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const cite = texte => [...connu].some(id => nom(g, id).length >= 3 && norm(texte).includes(norm(nom(g, id))));
  if (g.propres?.includes(s) && !recus.includes('propre') && !connu.has(s) && rang >= (g.proprePos?.[s] ?? 1)) {
    return { cle: 'propre', texte: String(ctx.cfg.textePropre || ''), concret: true, elim: [s] };
  }
  const texte = String(g.indicesSalle?.[n]?.[rang] ?? '').trim();
  if (texte && !recus.includes(texte) && !cite(texte) && !(RE_JOUEUR.test(texte) && !joueurNommable(g, p).length)) return { cle: texte, texte, concret: false, auto: false };
  const a = g.auto?.[n]?.[rang]; // pas d'indice écrit pour cette salle à ce rang (ou inutilisable pour ce joueur) : un fait vrai tiré de la solution
  return a && !cite(a.texte) ? { cle: 'auto', texte: a.texte, concret: true, elim: a.elim, auto: true } : null;
}

function indice(ctx, g, p, parTache = false) {
  const J = g.joueurs[p];
  const s = J.salle;
  const e = etatIndice(ctx, g, p, s);
  if (e.etat === 'fini') return err('Tu as déjà tous les indices de cette salle.');
  if (e.etat === 'attente') return err(`Prochain indice de cette salle : passe d'abord dans ${e.reste} autre${e.reste > 1 ? 's' : ''} salle${e.reste > 1 ? 's' : ''}.`);
  if (e.etat === 'tache' && !parTache) return err('Réussis la tâche de la salle pour obtenir son indice.');
  const deja = e.c;
  const modeles = String(ctx.cfg.modeles ?? '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  // Le tueur (qui ne le sait pas encore) a des souvenirs plus précis : deux cartes innocentées à chaque indice automatique.
  const tueur = J.perso === g.solution.perso && !J.tueur;
  const choix = choisirIndice(ctx, g, p, s);
  let r;
  if (choix && !(tueur && choix.auto)) {
    r = choix.concret ? { texte: choix.texte, elimines: choix.elim || [] } : remplir(g, p, choix.texte, g.phase === 'finale' ? 2 : 1, ctx.name, ctx.now());
    (J.recus[s] ??= []).push(choix.cle);
  } else { // plus d'indice disponible pour ce joueur dans cette salle : indice automatique de secours
    const brut = tueur ? 'Un souvenir précis te revient : « {carte} » n\'a rien à voir avec le crime.' : modeles.length ? pick(modeles) : "« {carte} » n'a rien à voir avec le crime.";
    r = remplir(g, p, brut, g.phase === 'finale' || tueur ? 2 : 1);
  }
  if (J.aveugle) { J.aveugle = false; r = { texte: '☠️ Le texte est illisible : tes yeux te brûlent… (le poison a abîmé ta vue)', elimines: [] }; }
  J.pris[s] = deja + 1;
  (J.dernier ??= {})[s] = (J.histo || []).length; // le prochain indice demande de passer dans d'autres salles à partir d'ici
  J.indices++;
  for (const c of r.elimines) if (!J.elimines.includes(c)) J.elimines.push(c);
  (J.notes ??= []).unshift({ t: ctx.now(), salle: s, texte: r.texte });
  const res = { ok: true, msg: `💡 ${r.texte}`, indice: r.texte };
  // le Bureau annonce qu'il y a des complices (en plus de l'indice) : le bouton « Complice » apparaît
  if (ctx.cfg.complices && J.comp && !J.comp.debloque && J.complice && s === sallesComp(ctx, g).bureau) {
    J.comp.debloque = true;
    const texte = texteComplice(ctx, g, p, ctx.cfg.texteBureauComplice);
    (J.notes ??= []).unshift({ t: ctx.now(), salle: s, texte: `🤝 ${texte}` });
    res.msg += `\n🤝 ${texte}`; res.complice = texte;
  }
  return res;
}

// ---------- le tueur actif et les corps ----------
// Ce que fait l'arme dépend de son nom : tranche (un coup), assomme (deux coups), piège (corde), poison, tir (même étage).
const sansAccent = x => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function typeArme(n) {
  const x = sansAccent(n);
  if (/poison/.test(x)) return 'poison';
  if (/corde/.test(x)) return 'piege';
  if (/revolver|fusil|pistolet/.test(x)) return 'tir';
  if (/chandelier|matraque|club|anglaise|marteau/.test(x)) return 'assomme';
  return 'tranche';
}
function armeTueur(ctx, g, J = null) {
  // le tueur d'origine : l'arme du crime ; un complice recruté : l'arme qu'il a ramassée (il n'en a pas tant qu'il n'en a pas trouvé)
  const i = J?.tueur?.recrue ? J.arme?.i : Number(String(g.solution.arme).slice(1));
  if (i == null) return null;
  const r = { ...ARMES_REGLAGES[i % ARMES_REGLAGES.length].tueur, ...ctx.cfg.armesReglages?.[i]?.tueur };
  return { type: typeArme(nom(g, `a${i}`)), usage: Number(r.usage) || 0, max: Math.max(1, Number(r.max) || 1), recharge: Number(r.recharge) || 0, effet: Number(r.effet) || 0 };
}
const etageDe = (ctx, g, s) => String(ctx.cfg.etages?.[Number(String(s).slice(1))] ?? '').trim() || 'Rez-de-chaussée';

// Le tueur quitte une salle où il s'est servi de l'arme : elle recharge. Un empoisonné qui part au bout de 0 salle meurt.
function quitteSalle(ctx, g, p) {
  const J = g.joueurs[p], now = ctx.now();
  if (J.tueur?.usage?.n && J.tueur.usage.salle === J.salle) {
    J.tueur.pret = now + (armeTueur(ctx, g, J)?.recharge || 0) * 1000;
    J.tueur.usage = null;
  }
  if (J.arme?.usage?.n && J.arme.usage.salle === J.salle) {
    J.arme.pret = now + armeJoueur(ctx, g, J.arme.i).recharge * 1000;
    J.arme.usage = null;
  }
  if (J.poison && J.poison.restant <= 0 && J.salle && !J.mort) mettreAMort(ctx, g, J.poison.par, p, { poison: true });
}

function mettreAMort(ctx, g, tueurId, cible, extra = {}) {
  const C = g.joueurs[cible], now = ctx.now();
  C.mort = { at: now, salle: C.salle, par: tueurId, jeton: randomBytes(4).toString('hex'), trouvePar: [], ...extra };
  C.assomme = 0; C.poison = null;
  for (const m of g.menaces || []) if (m.etat === 'attente' && (m.a === cible || m.de === cible)) m.etat = 'annulee';
  quitterSession(g, cible);
  for (const q of g.questions) if (q.etat === 'attente' && (q.a === cible || q.de === cible)) q.etat = 'annulee';
  const T = g.joueurs[tueurId];
  if (T?.tueur) T.tueur.victimes = (T.tueur.victimes || 0) + 1;
  // victime d'un complice recruté : son corps désigne 5 personnages, dont celui du meurtrier (reste à trouver quel joueur l'incarne)
  if (T?.tueur?.recrue) {
    const autres = shuffle(deType(g, 'perso').filter(c => c !== T.perso && c !== C.perso)).slice(0, 4);
    C.mort.suspects = shuffle([T.perso, ...autres]);
  }
  // plus aucun innocent en vie : le tueur l'emporte
  const tueurs = Object.keys(g.joueurs).filter(x => g.joueurs[x].tueur);
  if (!g.finished && tueurs.length && Object.keys(g.joueurs).every(x => g.joueurs[x].tueur || g.joueurs[x].mort)) terminer(ctx, g, tueurs[0]);
}

// Délais d'une arme (tueur ou joueur) : T porte l'état { pret, usage }.
function delaiRefus(T, J, arm, now) {
  if (now < (T.pret || 0)) return `Ton arme recharge : encore ${Math.ceil((T.pret - now) / 1000)} s.`;
  const u = T.usage;
  if (u && u.salle === J.salle) {
    if (u.n >= arm.max) return `Tu ne peux plus t'en servir dans cette salle (${arm.max} au maximum) : quitte-la d'abord.`;
    if (now < u.last + arm.usage * 1000) return `Ton arme n'est pas prête : encore ${Math.ceil((u.last + arm.usage * 1000 - now) / 1000)} s.`;
  }
  return null;
}
function peutServir(ctx, g, J, arm, now) {
  const T = J.tueur;
  if (T.recrue && !J.arme) return 'Tu n\'as pas d\'arme : ramasse-en une dans une salle (il en apparaît de temps en temps).';
  if (!T.recrue && !T.arme) return `Va d'abord chercher ${nom(g, g.solution.arme)} dans : ${nom(g, T.cache)}.`;
  return delaiRefus(T, J, arm, now);
}
function aServi(J, now, T = J.tueur) {
  if (!T.usage || T.usage.salle !== J.salle) T.usage = { salle: J.salle, n: 0, last: 0 };
  T.usage.n++; T.usage.last = now;
}
const bruit = (ctx, g, etage) => {
  const texte = `🔫 Un coup de feu retentit : il vient de l'étage « ${etage} » !`;
  feed(g, ctx, texte);
  g.bruits = [{ t: ctx.now(), etage }];
  for (const J of Object.values(g.joueurs)) if (!J.mort) (J.notes ??= []).unshift({ t: ctx.now(), salle: null, texte });
};

// Meurtre : la règle dépend de l'arme du crime.
function tuer(ctx, g, p, cible) {
  const J = g.joueurs[p], C = g.joueurs[cible], now = ctx.now();
  if (!J.tueur?.actif) return err('Action inconnue.');
  const arm = armeTueur(ctx, g, J);
  if (!arm) return err('Tu n\'as pas d\'arme : ramasse-en une dans une salle (il en apparaît de temps en temps).');
  if (arm.type === 'piege') return err('Avec une corde, on pose un piège.');
  const refus = peutServir(ctx, g, J, arm, now);
  if (refus) return err(refus);
  if (!C || cible === p || C.mort) return err('Choisis une victime.');
  if (arm.type === 'tir') {
    if (!C.salle) return err(`${ctx.name(cible)} n'est dans aucune salle.`);
    if (etageDe(ctx, g, C.salle) !== etageDe(ctx, g, J.salle)) return err(`${ctx.name(cible)} n'est pas à ton étage.`);
  } else if (C.salle !== J.salle) return err(`${ctx.name(cible)} n'est pas dans ta salle.`);
  if (arm.type === 'poison') {
    if (C.poison) return err(`${ctx.name(cible)} est déjà empoisonné.`);
    C.poison = { par: p, restant: Math.floor(Math.random() * (arm.effet + 1)) };
    aServi(J, now);
    return ok(`${ctx.name(cible)} est empoisonné. Il ne le sait pas… il mourra dans 0 à ${arm.effet} salles.`);
  }
  if (arm.type === 'assomme' && !(C.assomme > now)) {
    C.assomme = now + (arm.effet || 60) * 1000;
    C.assommeType = 'assomme';
    C.quitteA = 0;
    aServi(J, now);
    return ok(`${ctx.name(cible)} est assommé et reste dans la salle ${arm.effet || 60} s. Un deuxième coup le tuera.`);
  }
  mettreAMort(ctx, g, p, cible);
  aServi(J, now);
  if (arm.type === 'tir') bruit(ctx, g, etageDe(ctx, g, J.salle));
  return ok(`${ctx.name(cible)} ne se relèvera pas.`);
}
// Corde : un piège pour la prochaine personne qui entre dans la salle.
function poserPiege(ctx, g, p) {
  const J = g.joueurs[p], now = ctx.now();
  if (!J.tueur?.actif) return err('Action inconnue.');
  const arm = armeTueur(ctx, g, J);
  if (!arm || arm.type !== 'piege') return err('Action inconnue.');
  const refus = peutServir(ctx, g, J, arm, now);
  if (refus) return err(refus);
  if (J.tueur.recrue && J.tueur.cordes === undefined) J.tueur.cordes = arm.effet;
  if (!(J.tueur.cordes > 0)) return err('Tu n\'as plus de corde : récupère-la sur un cadavre.');
  g.pieges ??= {};
  if (g.pieges[J.salle]) return err('Un piège est déjà tendu ici.');
  g.pieges[J.salle] = { par: p, at: now };
  J.tueur.cordes--;
  aServi(J, now);
  return ok('Piège tendu : la prochaine personne qui entrera ici sera prise.');
}
// ---------- les armes des joueurs (pénalités entre joueurs) ----------
// Selon le nom : poignard, hache, revolver, fusil = menace (donne une carte) ; chandelier, matraque, club, clé anglaise = assomme ;
// corde = mains liées ; poison = le prochain indice est illisible.
const typeJoueur = (g, i) => ({ tranche: 'menace', tir: 'menace', assomme: 'assomme', piege: 'corde', poison: 'poison' })[typeArme(nom(g, `a${i}`))];
function armeJoueur(ctx, g, i) {
  const r = { ...ARMES_REGLAGES[i % ARMES_REGLAGES.length].joueur, ...ctx.cfg.armesReglages?.[i]?.joueur };
  return { type: typeJoueur(g, i), usage: Number(r.usage) || 0, max: Math.max(1, Number(r.max) || 1), recharge: Number(r.recharge) || 0, effet: Number(r.effet) || 0, nombre: Math.max(1, Number(r.nombre) || 1) };
}
function donnerArme(ctx, g, p, i) {
  g.joueurs[p].arme = { i, reste: armeJoueur(ctx, g, i).nombre, usage: null, pret: 0 };
}
const armesNoms = g => deType(g, 'arme').map(id => Number(id.slice(1)));
function ramasser(ctx, g, p) {
  const J = g.joueurs[p], i = g.armesSol?.[J.salle];
  if (i == null) return err('Il n\'y a rien à ramasser ici.');
  if (J.arme) return err('Tu as déjà une arme : pose-la d\'abord.');
  if (J.tueur?.arme && !J.tueur.recrue) return err('Tu as déjà l\'arme du crime : tu ne peux pas en porter une deuxième.');
  delete g.armesSol[J.salle];
  donnerArme(ctx, g, p, i);
  return ok(`Tu ramasses : ${nom(g, `a${i}`)}.`);
}
function poserArme(ctx, g, p) {
  const J = g.joueurs[p];
  if (!J.arme) return err('Tu n\'as pas d\'arme.');
  g.armesSol ??= {};
  if (g.armesSol[J.salle] != null) return err('Il y a déjà une arme ici.');
  g.armesSol[J.salle] = J.arme.i;
  J.arme = null;
  return ok('Tu poses ton arme.');
}
function viser(ctx, g, p, cible) {
  const J = g.joueurs[p], C = g.joueurs[cible], now = ctx.now();
  if (!J.arme) return err('Tu n\'as pas d\'arme.');
  if (J.tueur?.recrue) return err('Utilise ton panneau de tueur (🌀 Souvenirs).');
  const arm = armeJoueur(ctx, g, J.arme.i), n = nom(g, `a${J.arme.i}`);
  const refus = delaiRefus(J.arme, J, arm, now);
  if (refus) return err(refus);
  // une utilisation réussie : l'arme finit par se casser
  const use = r => {
    aServi(J, now, J.arme);
    if (--J.arme.reste <= 0) { J.arme = null; r.msg += ` Ton ${n} se casse : plus aucune utilisation.`; } else r.msg += ` (${J.arme.reste} utilisation${J.arme.reste > 1 ? 's' : ''} restante${J.arme.reste > 1 ? 's' : ''})`;
    return r;
  };
  if (!C || cible === p || C.salle !== J.salle) return err('Choisis quelqu\'un de ta salle.');
  const qui = ctx.name(cible);
  if (C.mort) return err(`${qui} ne réagit pas…`);
  if (arm.type === 'assomme' || arm.type === 'corde') {
    if (C.assomme > now) return err(`${qui} est déjà immobilisé.`);
    C.assomme = now + (arm.effet || 60) * 1000;
    C.assommeType = arm.type === 'corde' ? 'corde' : 'assomme';
    C.quitteA = 0;
    feed(g, ctx, arm.type === 'corde' ? `🪢 ${qui} a les mains liées.` : `💫 ${qui} a été assommé.`);
    return use(ok(arm.type === 'corde' ? `Tu as lié les mains de ${qui} (${arm.effet || 60} s).` : `${qui} est assommé (${arm.effet || 60} s).`));
  }
  if (arm.type === 'poison') {
    if (C.aveugle) return err(`${qui} est déjà empoisonné.`);
    C.aveugle = true; // il ne le sait pas : son prochain indice sera illisible
    return use(ok(`${qui} est empoisonné : le prochain indice qu'il lira sera illisible.`));
  }
  g.menaces ??= [];
  if (g.menaces.some(m => m.etat === 'attente' && m.a === cible)) return err(`${qui} est déjà menacé.`);
  if (!cartesLibres(g, p, cible).length) return err(`${qui} t'a déjà donné toutes ses cartes.`);
  g.menaces.push({ id: `m${g.menaces.length + 1}`, de: p, a: cible, at: now, fin: now + (ctx.cfg.delaiMenace ?? 60) * 1000, etat: 'attente' });
  C.quitteA = 0;
  return use(ok(`Tu menaces ${qui} avec ${n} : il doit te donner une carte.`));
}
// Cartes qu'un joueur peut encore donner à une personne qui le menace : jamais deux fois la même.
const cartesLibres = (g, de, a) => g.joueurs[a].main.filter(c => !dejaMontree(g, de, a, c));
function donner(ctx, g, p, carte) {
  const J = g.joueurs[p], m = (g.menaces || []).find(x => x.etat === 'attente' && x.a === p);
  if (!m) return err('Personne ne te menace.');
  if (!cartesLibres(g, m.de, p).includes(carte)) return err('Choisis une de tes cartes que tu ne lui as pas déjà donnée.');
  remettreCarte(ctx, g, m, carte);
  return ok('Tu as donné ta carte.');
}
function remettreCarte(ctx, g, m, carte) {
  const A = g.joueurs[m.de], C = g.joueurs[m.a];
  m.etat = 'faite'; m.carte = carte;
  (A.vus[carte] ??= []).includes(m.a) || A.vus[carte].push(m.a);
  (A.notes ??= []).unshift({ t: ctx.now(), salle: A.salle, texte: `${ctx.name(m.a)} t'a donné : « ${nom(g, carte)} ».` });
}

// Scanner le QR code d'une victime : ses 3 cartes ; le 1er scan annonce le corps, le 2e innocent l'identifie.
function trouverCorps(ctx, g, p, a) {
  const C = g.joueurs[a.victime], J = g.joueurs[p];
  if (!C?.mort || String(a.c) !== C.mort.jeton) return err('QR code inconnu.');
  if (a.victime === p) return err('C\'est ton propre corps…');
  if (J.mort) return err('Tu es mort, toi aussi.');
  if (C.mort.trouvePar.includes(p)) return err('Tu as déjà fouillé ce corps.');
  C.mort.trouvePar.push(p);
  const innocents = C.mort.trouvePar.filter(x => !g.joueurs[x].tueur).length;
  if (C.mort.trouvePar.length === 1) feed(g, ctx, `💀 Un corps a été trouvé dans : ${nom(g, C.mort.salle)} !`);
  if (innocents === 2 && !C.mort.identifie) { C.mort.identifie = true; feed(g, ctx, `🕯 La victime est ${ctx.name(a.victime)} (${nom(g, C.perso)}).`); }
  let corde = '';
  if (J.tueur?.actif && C.mort.corde && !C.mort.cordeReprise) { C.mort.cordeReprise = true; J.tueur.cordes++; corde = ' Tu récupères ta corde.'; }
  for (const c of C.main) { (J.vus[c] ??= []).includes(a.victime) || J.vus[c].push(a.victime); }
  const texte = `Sur le corps de ${ctx.name(a.victime)} : ${C.main.map(c => `« ${nom(g, c)} »`).join(', ')}.`;
  const suspects = C.mort.suspects ? ` Le meurtrier est l'un de ces personnages : ${C.mort.suspects.map(c => nom(g, c)).join(', ')}.` : '';
  (J.notes ??= []).unshift({ t: ctx.now(), salle: C.mort.salle, texte: texte + suspects });
  return { ok: true, msg: `🔍 ${texte}${suspects}${corde}` };
}

// ---------- actions des joueurs ----------
// Une partie lancée avant l'arrivée des complices : chaque joueur sans complice en reçoit un.
function completerComplices(g) {
  const pids = Object.keys(g.joueurs);
  for (const p of pids) {
    const J = g.joueurs[p];
    J.comp ??= { debloque: false, jeu: false, grenier: false, choix: null, fait: false };
    if (!J.complice) { const autres = pids.filter(x => x !== p && !g.joueurs[x].mort); if (autres.length) J.complice = pick(autres); }
  }
}
export function playerAction(ctx, g, p, a) {
  const J = g.joueurs[p];
  if (!J) return err('Tu ne joues pas à cette partie.');
  if (ctx.cfg.complices && !J.comp) completerComplices(g);
  if (a.type === 'cocher') { // fiche de détective sur le téléphone : barrer / débarrer une carte
    if (!ctx.cfg.ficheNumerique) return err('La fiche de détective se fait sur papier.');
    if (!g.cartes[a.carte]) return err('Carte inconnue.');
    J.coches = (J.coches || []).includes(a.carte) ? J.coches.filter(c => c !== a.carte) : [...(J.coches || []), a.carte];
    return { ok: true };
  }
  if (g.finished) return err("L'enquête est terminée.");
  if (g.phase === 'intro') return err("L'enquête n'a pas encore commencé.");
  if (g.phase === 'panne') { // il faut d'abord réparer : taper le code affiché sur la tablette de sa salle
    if (a.type !== 'panne') return err('Les plombs ont sauté : rejoins ta salle et tape le code de la tablette.');
    const P = g.panne;
    if (P.entres.includes(p)) return err('Tu as déjà réparé ta salle : attends les autres.');
    const c = String(a.code ?? '').trim();
    if (c !== P.codes[p]) {
      const autre = Object.keys(P.codes).find(x => P.codes[x] === c && P.salles[x] === P.salles[p]);
      return err(autre ? 'Ce code est celui de quelqu\'un d\'autre dans la salle : prends le tien.' : 'Mauvais code : regarde la tablette de ta salle.');
    }
    P.entres.push(p);
    J.salle = P.salles[p];
    if (P.entres.length >= Object.keys(g.joueurs).length) { commencer(ctx, g); return ok('Le courant est revenu !'); }
    return ok(`Réparé ! Plus que ${Object.keys(g.joueurs).length - P.entres.length} joueur(s)…`);
  }
  if (J.mort) return err('Tu as été assassiné : reste où tu es, les enquêteurs vont te trouver.');
  const now = ctx.now();

  if (a.type === 'entrer') { // QR code scanné (ou code tapé) : le joueur est dans cette salle
    const code = String(a.code ?? '').trim();
    const w = fenetre(ctx, g, now);
    const fenetres = [codesDe(g, w), codesDe(g, w - 1)];
    let s = null;
    const fixe = i => ctx.cfg.liensSalles !== false && code === codeFixe(g, i); // liens permanents des salles (copiés par l'admin)
    if (a.salle != null) { const i = Number(a.salle); if (fenetres.some(c => c[i] === code) || fixe(i)) s = i; } else {
      for (const c of fenetres) { const i = c.indexOf(code); if (i >= 0) { s = i; break; } }
    }
    if (s == null) return err('Code de salle incorrect ou expiré : scanne à nouveau la tablette.');
    const change = J.salle !== `s${s}`;
    if (change && (g.menaces || []).some(m => m.etat === 'attente' && m.a === p)) return err('Tu es menacé : donne une carte avant de partir.');
    if (change && J.assomme > now) return err(`Tu es immobilisé (assommé ou mains liées) : tu ne peux pas quitter la salle avant ${Math.ceil((J.assomme - now) / 1000)} s.`);
    if (J.quitteA && J.salle !== `s${s}`) return err(`Tu quittes ta salle dans ${Math.ceil((J.quitteA - now) / 1000)} s : attends la fin du chrono.`);
    let oubli = '';
    if (J.salle && J.salle !== `s${s}`) { // il fallait d'abord appuyer sur « Quitter la salle »
      oubli = nom(g, J.salle);
      J.bloque = now + (ctx.cfg.penaliteOubli ?? 30) * 1000;
    }
    if (change && J.salle) {
      quitteSalle(ctx, g, p);
      if (J.mort) return err('Tu te sens mal… tes jambes te lâchent. Tout devient noir.');
    }
    if (change) quitterSession(g, p);
    J.quitteA = 0;
    J.salle = `s${s}`;
    if (change) (J.histo ??= []).push(J.salle);
    if (J.tueur && !J.tueur.recrue && !J.tueur.arme && J.salle === J.tueur.cache) {
      J.tueur.arme = true; // le tueur retrouve son arme (rien ne s'affiche ailleurs)
      if (J.arme) { g.armesSol ??= {}; if (g.armesSol[J.salle] == null) g.armesSol[J.salle] = J.arme.i; J.arme = null; } // une seule arme à la fois : l'autre est posée
    }
    if (change && J.poison && --J.poison.restant <= 0) { // le poison agit : il ne le savait pas
      mettreAMort(ctx, g, J.poison.par, p, { poison: true });
      return err('Tu te sens mal… tes jambes te lâchent. Tout devient noir.');
    }
    // la salle de jeu et le grenier livrent leur info d'un coup de QR code, une fois les complices annoncés au Bureau
    let trace = '';
    if (change && ctx.cfg.complices && J.comp?.debloque) { const r = complice(ctx, g, p, { op: 'chercher' }); if (r.ok) trace = `\n${r.msg}`; }
    const piege = g.pieges?.[J.salle];
    if (change && piege && piege.par !== p && !J.tueur) { // la corde se resserre
      delete g.pieges[J.salle];
      mettreAMort(ctx, g, piege.par, p, { corde: true });
      return err('Une corde se resserre autour de ton cou…');
    }
    return oubli ? err(`Tu as oublié de quitter ${oubli} ! Immobilisé ${ctx.cfg.penaliteOubli ?? 30} s.${trace}`) : ok(`Tu es dans : ${nom(g, J.salle)}${trace}`);
  }

  if (a.type === 'quitter') { // « Quitter la salle » : obligatoire avant d'aller ailleurs
    if (!J.salle) return err('Tu n\'es dans aucune salle.');
    const delai = ctx.cfg.delaiQuitter ?? 10;
    if ((g.menaces || []).some(m => m.etat === 'attente' && m.a === p)) return err('Tu es menacé : donne une carte avant de partir.');
    if (J.assomme > now) return err(`Tu es immobilisé (assommé ou mains liées) : tu ne peux pas quitter la salle avant ${Math.ceil((J.assomme - now) / 1000)} s.`);
    if (J.quitteA) return ok(`Tu pars dans ${Math.ceil((J.quitteA - now) / 1000)} s…`);
    if (delai <= 0) { sortir(ctx, g, p); return ok('Tu as quitté la salle. Scanne la tablette de ta prochaine salle.'); }
    J.quitteA = now + delai * 1000; // il reste dans la salle (interrogeable, visible) jusqu'à la fin du chrono
    return ok(`Tu quittes la salle dans ${delai} s…`);
  }

  if (a.type === 'montrer') { // je réponds à une question : la carte que je montre
    const q = g.questions.find(x => x.id === a.q && x.a === p && x.etat === 'attente');
    if (!q) return err('Cette question n\'attend plus de réponse.');
    if (!aMontrer(g, q).includes(a.carte)) return err('Tu dois montrer une des cartes demandées (pas une carte déjà montrée à cette personne).');
    resoudre(ctx, g, q, a.carte);
    return ok(`Tu as montré « ${nom(g, a.carte)} ».`);
  }

  if (a.type === 'accuser') {
    if (J.accuse) return err('Tu as déjà accusé.');
    const { salle, perso, arme } = a;
    if (g.cartes[salle]?.type !== 'salle' || g.cartes[perso]?.type !== 'perso' || g.cartes[arme]?.type !== 'arme') return err('Choisis une salle, un personnage et une arme.');
    const juste = salle === g.solution.salle && perso === g.solution.perso && arme === g.solution.arme;
    // Le tueur qui s'accuse lui-même : juste, il devient tueur actif (en secret) ; seul son personnage juste : seconde chance.
    if (perso === J.perso && J.perso === g.solution.perso) {
      if (juste) {
        const autres = deType(g, 'salle').filter(x => x !== J.salle);
        J.tueur = { actif: true, cache: pick(autres.length ? autres : deType(g, 'salle')), arme: false, pret: 0, usage: null, cordes: armeTueur(ctx, g).type === 'piege' ? armeTueur(ctx, g).effet : 0, at: now };
        J.accuse = { salle, perso, arme, juste: true, tueur: true, at: now };
        return { ok: true, tueur: true, msg: `🩸 Un souvenir te revient… C'était toi. Tu as caché ${nom(g, g.solution.arme)} dans : ${nom(g, J.tueur.cache)}.` };
      }
      if (!J.secondeChance) {
        J.secondeChance = true;
        return err('Ton visage te dit quelque chose… mais le souvenir reste flou : l\'arme ou la salle ne colle pas. Tu as une seconde chance.');
      }
    }
    J.accuse = { salle, perso, arme, juste, at: now };
    if (juste) { terminer(ctx, g, p); return ok('Bravo, tu as résolu l\'enquête !'); }
    feed(g, ctx, `❌ ${qui(ctx, g, p)} a accusé à tort : ${nom(g, perso)}, ${nom(g, arme)}, ${nom(g, salle)}`);
    if (Object.values(g.joueurs).every(x => x.accuse || x.mort)) terminer(ctx, g);
    return err('Mauvaise accusation… Tu ne peux plus accuser, mais tu dois toujours répondre aux questions.');
  }

  if (a.type === 'corps') return trouverCorps(ctx, g, p, a);
  if (a.type === 'complice') return J.salle ? complice(ctx, g, p, a) : err('Scanne d\'abord le QR code de la salle où tu es.');
  if (a.type === 'donner') return donner(ctx, g, p, a.carte);
  if (J.bloque > now) return err(`Tu es immobilisé encore ${Math.ceil((J.bloque - now) / 1000)} s.`);
  if (!J.salle) return err('Scanne d\'abord le QR code de la salle où tu es.');
  if (a.type === 'tuer') return tuer(ctx, g, p, a.cible);
  if (a.type === 'piege') return poserPiege(ctx, g, p);
  if (a.type === 'ramasser') return ramasser(ctx, g, p);
  if (a.type === 'poserArme') return poserArme(ctx, g, p);
  if (a.type === 'viser') return viser(ctx, g, p, a.cible);

  if (a.type === 'indice') return indice(ctx, g, p);

  if (a.type?.startsWith('tache')) {
    const s = J.salle, se = g.sessions?.[s], t = tacheDe(ctx, g, s);
    if (!t) return err('Pas de tâche ici.');
    if (a.type === 'tacheReussie') { // tâche solo terminée sur le téléphone
      if (t.groupe) return err('Cette tâche se fait à plusieurs.');
      if (aIndice(ctx, g, p, s)) return err('Tu as déjà l\'indice de cette salle.');
      const textes = reussir(ctx, g, s, [p])[p] || [];
      return { ok: true, msg: textes.map(x => `💡 ${x}`).join('\n'), indice: textes[0] };
    }
    if (!t.groupe) return err('Cette tâche se fait seul.');
    const def = T.GROUPES[t.id];
    if (a.type === 'tacheLancer' || a.type === 'tacheRejoindre') {
      if (aIndice(ctx, g, p, s)) return err('Tu as déjà l\'indice de cette salle : laisse la place aux autres.');
      if (!se) { g.sessions[s] = { id: t.id, salle: s, joueurs: [p], etat: 'attente', data: null }; return ok(`Il faut ${def.n} joueurs : les autres de la salle peuvent rejoindre.`); }
      if (se.etat !== 'attente') return err('La tâche a déjà commencé.');
      if (se.joueurs.includes(p)) return err('Tu attends déjà.');
      se.joueurs.push(p);
      if (se.joueurs.length >= def.n) { se.etat = 'jeu'; se.data = { ...def.init(now, niveau(ctx)), nv: niveau(ctx) }; return ok("C'est parti !"); }
      return ok(`Encore ${def.n - se.joueurs.length} joueur(s).`);
    }
    if (a.type === 'tacheQuitter') { quitterSession(g, p); return ok('Tu as quitté la tâche.'); }
    if (a.type === 'tache') {
      if (!se || se.etat !== 'jeu' || !se.joueurs.includes(p)) return err('Tu ne participes pas à cette tâche.');
      const res = def.action(se.data, se.joueurs.indexOf(p), a, now);
      if (res === 'reussi') {
        const textes = reussir(ctx, g, s, se.joueurs)[p] || [];
        return { ok: true, msg: textes.map(x => `💡 ${x}`).join('\n'), indice: textes[0] };
      }
      return res ? err(res) : { ok: true };
    }
  }

  if (a.type === 'interroger') {
    const cible = a.cible;
    const C = g.joueurs[cible];
    if (!C || cible === p) return err('Choisis quelqu\'un à interroger.');
    if (C.salle !== J.salle || C.mort?.trouvePar.length) return err(`${ctx.name(cible)} n'est pas dans cette salle.`);
    if (J.last === cible) return err(`Tu viens d'interroger ${ctx.name(cible)} : interroge quelqu'un d'autre d'abord.`);
    if (now < J.nextAsk) return err(`Attends encore ${Math.ceil((J.nextAsk - now) / 1000)} s avant ta prochaine question.`);
    if (g.questions.some(q => q.de === p && q.etat === 'attente')) return err('Attends la réponse à ta question.');
    if (g.cartes[a.perso]?.type !== 'perso' || g.cartes[a.arme]?.type !== 'arme') return err('Choisis un personnage et une arme.');
    const q = { id: `q${g.questions.length + 1}`, de: p, a: cible, salle: J.salle, perso: a.perso, arme: a.arme, at: now, carte: null, etat: 'attente' };
    g.questions.push(q);
    J.last = cible;
    J.nextAsk = now + ctx.cfg.delaiQuestion * 1000;
    if (C.mort) return ok(`Question posée à ${ctx.name(cible)} : attends sa réponse.`); // sans réponse : il est mort, et personne ne le sait encore
    if (!enCommun(g, q).length) { resoudre(ctx, g, q, null); return ok(`${ctx.name(cible)} n'a aucune de ces cartes.`); }
    if (!aMontrer(g, q).length) { resoudre(ctx, g, q, null, true); return ok(`${ctx.name(cible)} ne peut te montrer que des cartes qu'il t'a déjà montrées : rien de nouveau.`); }
    return ok(`Question posée à ${ctx.name(cible)} : attends sa réponse.`);
  }
  return err('Action inconnue.');
}

// ---------- admin ----------
export function adminAction(ctx, g, a) {
  if (a.type === 'lancer') {
    if (g.phase !== 'intro') return err("L'enquête a déjà commencé.");
    lancer(ctx, g);
    return ok(g.phase === 'panne' ? 'Les plombs ont sauté !' : "L'enquête commence !");
  }
  if (a.type === 'commencer') { // forcer la fin de la panne (un joueur n'arrive pas à entrer son code)
    if (g.phase !== 'panne') return err('Pas de panne en cours.');
    commencer(ctx, g);
    return ok("L'enquête commence !");
  }
  if (a.type === 'finale') return finale(ctx, g) ? ok('Phase finale lancée.') : err("La phase finale n'est possible que pendant l'enquête.");
  if (a.type === 'terminer') {
    if (g.finished) return err('Déjà terminé.');
    terminer(ctx, g);
    return ok('Enquête terminée : la solution est révélée.');
  }
  if (a.type === 'personnage') { // pendant l'introduction : l'admin peut quand même changer le personnage d'un joueur (échange avec celui qui l'avait)
    const J = g.joueurs[a.pid];
    if (!J || g.cartes[a.perso]?.type !== 'perso') return err('Joueur ou personnage inconnu.');
    if (g.phase !== 'intro' || g.finished) return err("Les personnages ne se changent que pendant l'introduction.");
    const autre = Object.values(g.joueurs).find(x => x.perso === a.perso);
    if (autre) autre.perso = J.perso;
    J.perso = a.perso;
    return ok(`${ctx.name(a.pid)} est ${nom(g, a.perso)}.`);
  }
  if (a.type === 'debloquerComplices') { // l'admin annonce les complices à tous, sans passer par le Bureau
    completerComplices(g);
    let n = 0;
    for (const J of Object.values(g.joueurs)) if (!J.mort && !J.comp.debloque) { J.comp.debloque = true; (J.notes ??= []).unshift({ t: ctx.now(), salle: J.salle, texte: `🤝 ${texteComplice(ctx, g, Object.keys(g.joueurs).find(x => g.joueurs[x] === J), ctx.cfg.texteBureauComplice)}` }); n++; }
    return ok(`Complices annoncés à ${n} joueur${n > 1 ? 's' : ''}.`);
  }
  if (a.type === 'nouvelleTache') { // l'admin fait tirer une autre tâche à une salle (tâche bloquée, joueurs partis…)
    const n = Number(String(a.salle).slice(1));
    if (!g.taches?.[n]) return err('Salle inconnue.');
    delete g.sessions[`s${n}`];
    g.taches[n] = tirerTache(ctx, n, g.taches[n]);
    return ok(`${nom(g, `s${n}`)} : ${g.taches[n] ? T.nomTache(g.taches[n]) : 'pas de tâche (indice gratuit)'}`);
  }
  if (a.type === 'placer') { // l'admin place un joueur dans une salle (QR code qui ne passe pas)
    const J = g.joueurs[a.pid];
    if (!J || g.cartes[a.salle]?.type !== 'salle') return err('Joueur ou salle inconnu.');
    if (J.salle !== a.salle) { quitterSession(g, a.pid); (J.histo ??= []).push(a.salle); }
    J.quitteA = 0;
    J.salle = a.salle;
    return ok(`${ctx.name(a.pid)} est dans : ${nom(g, a.salle)}`);
  }
  return err('Action inconnue.');
}

// Rattrapage : un joueur ajouté en cours de partie reçoit un personnage libre et 3 cartes (doublons possibles).
const persosLibres = (ctx, g) => personnagesDe(ctx.cfg.personnages).filter(n => !deType(g, 'perso').some(c => g.cartes[c].nom === n));
// Un joueur peut-il rejoindre la partie en cours ? Seulement avec un personnage que personne ne joue.
export function peutRejoindre(ctx, g) {
  if (!g || g.finished) return { ok: false, msg: 'La partie est terminée.' };
  if (ctx.cfg.rejoindreEnCours === false) return { ok: false, msg: 'On ne peut plus rejoindre la partie.' };
  if (!persosLibres(ctx, g).length) return { ok: false, msg: 'Tous les personnages sont déjà joués.' };
  return { ok: true };
}
export function ajouterJoueur(ctx, g, p) {
  if (g.joueurs[p]) return err('Ce joueur est déjà dans la partie.');
  if (g.finished) return err('La partie est terminée.');
  const i = deType(g, 'perso').length;
  g.cartes[`p${i}`] = { id: `p${i}`, type: 'perso', nom: attribuer(ctx, [p], deType(g, 'perso').map(c => g.cartes[c].nom))[p] };
  if (femmesDe(ctx.cfg.personnages)[g.cartes[`p${i}`].nom.toLowerCase()]) (g.femmes ??= {})[`p${i}`] = true;
  const sol = new Set(Object.values(g.solution));
  // son personnage est une carte comme les autres : il la tient en main (sinon personne ne la détiendrait)
  const main = [`p${i}`, ...shuffle(Object.keys(g.cartes).filter(c => !sol.has(c) && c !== `p${i}`)).slice(0, 2)];
  g.joueurs[p] = { perso: `p${i}`, main, salle: null, indices: 0, pris: {}, accuse: null, nextAsk: 0, last: null, vus: {}, elimines: [], coches: [] };
  g.joueurs[p].comp = { debloque: false, jeu: false, grenier: false, choix: null, fait: false };
  const autres = Object.keys(g.joueurs).filter(x => x !== p && !g.joueurs[x].mort);
  if (autres.length) g.joueurs[p].complice = pick(autres); // l'autre n'a pas forcément ce nouveau joueur pour complice : l'échange se fait dans les deux sens
  if (g.panne && g.phase === 'panne') { g.panne.salles[p] = pick(deType(g, 'salle')); g.panne.codes[p] = String(Math.floor(1000 + Math.random() * 9000)); }
  return { ok: true, detail: nom(g, `p${i}`) };
}

// ---------- vues ----------
const carteVue = (g, id) => ({ id, ...g.cartes[id] });
function complicesVue(ctx, g, p) {
  const J = g.joueurs[p], C = J.complice && g.joueurs[J.complice];
  if (!ctx.cfg.complices || !J.comp?.debloque || !C) return null;
  const sa = sallesComp(ctx, g), pret = compPret(J), mutuel = C.complice === p, ici = peutSeRetrouver(g, p, J.complice) || peutSeRetrouver(g, J.complice, p);
  const peutDonner = peutSeRetrouver(g, p, J.complice);
  return {
    jeu: J.comp.jeu, grenier: J.comp.grenier, pret, mort: !!C.mort,
    chercher: !J.comp.jeu && J.salle === sa.jeu ? 'jeu' : !J.comp.grenier && J.salle === sa.grenier ? 'grenier' : null,
    nom: pret ? ctx.name(J.complice) : null, perso: pret ? nom(g, C.perso) : null,
    ici: peutDonner, mutuel, fait: J.comp.fait, monChoix: J.comp.choix ? carteVue(g, J.comp.choix) : null, sonChoix: !!C.comp?.choix,
    peutRecruter: !!J.tueur?.actif && !J.tueur.recrute && !C.tueur && ici,
    recrutement: J.tueur?.recrute === 'attente' ? 'attente' : J.tueur?.recrute === 'refuse' ? 'refuse' : J.tueur?.recrute ? 'accepte' : null, recrue: !!J.tueur?.recrue,
  };
}
function monArme(ctx, g, p, now) {
  const J = g.joueurs[p], A = J.arme, arm = armeJoueur(ctx, g, A.i), u = A.usage && A.usage.salle === J.salle ? A.usage : null;
  return {
    nom: nom(g, `a${A.i}`), type: arm.type, effet: arm.effet, reste: A.reste, max: arm.max, dispo: u ? Math.max(0, arm.max - u.n) : arm.max,
    pret: A.pret > now ? A.pret : 0, attente: u && u.last + arm.usage * 1000 > now ? u.last + arm.usage * 1000 : 0,
  };
}
function secretTueur(ctx, g, p, now) {
  const J = g.joueurs[p], T = J.tueur, arm = armeTueur(ctx, g, J) || { type: 'tranche', usage: 0, max: 1, recharge: 0, effet: 0 }, u = T.usage && T.usage.salle === J.salle ? T.usage : null;
  const vivants = Object.keys(g.joueurs).filter(x => x !== p && !g.joueurs[x].mort);
  const ici = vivants.filter(x => J.salle && g.joueurs[x].salle === J.salle);
  const cibles = (arm.type === 'tir' ? vivants.filter(x => g.joueurs[x].salle && J.salle && etageDe(ctx, g, g.joueurs[x].salle) === etageDe(ctx, g, J.salle)) : ici)
    .map(x => ({ pid: x, name: ctx.name(x), indices: g.joueurs[x].indices, assomme: g.joueurs[x].assomme > now, salle: arm.type === 'tir' && g.joueurs[x].salle !== J.salle ? nom(g, g.joueurs[x].salle) : '' }));
  return {
    arme: T.recrue ? (J.arme ? nom(g, `a${J.arme.i}`) : '') : nom(g, g.solution.arme), type: arm.type, cache: T.recrue ? '' : nom(g, T.cache), armeRecup: T.recrue ? !!J.arme : T.arme, recrue: !!T.recrue, victimes: T.victimes || 0,
    pret: T.pret > now ? T.pret : 0, attente: u && u.last + arm.usage * 1000 > now ? u.last + arm.usage * 1000 : 0, reste: u ? Math.max(0, arm.max - u.n) : arm.max,
    max: arm.max, cordes: T.cordes || 0, effet: arm.effet, piegeIci: !!g.pieges?.[J.salle], etage: J.salle ? etageDe(ctx, g, J.salle) : '', cibles,
  };
}
// Qui s'affiche dans une salle : les vivants, et les morts (dont le nom reste : personne ne sait encore qu'ils sont morts) ;
// leur nom n'est barré qu'une fois le corps trouvé.
const affiches = (g, s) => Object.keys(g.joueurs).filter(p => g.joueurs[p].salle === s);
const barre = (g, p) => !!g.joueurs[p].mort?.trouvePar.length;
const presents = (g, s) => Object.keys(g.joueurs).filter(p => g.joueurs[p].salle === s && !g.joueurs[p].mort);
const listes = g => ({ salles: deType(g, 'salle').map(id => carteVue(g, id)), persos: deType(g, 'perso').map(id => carteVue(g, id)), armes: deType(g, 'arme').map(id => carteVue(g, id)) });

function revelation(ctx, g) {
  if (!g.finished) return null;
  const tueur = Object.keys(g.joueurs).find(p => g.joueurs[p].perso === g.solution.perso);
  return {
    salle: carteVue(g, g.solution.salle), perso: carteVue(g, g.solution.perso), arme: carteVue(g, g.solution.arme),
    tueur: tueur ? ctx.name(tueur) : null,
    classement: classementDe(ctx, g),
  };
}
// Le gagnant d'abord, puis les autres selon les indices obtenus.
function classementDe(ctx, g) {
  return Object.keys(g.joueurs).map(p => ({ pid: p, name: ctx.name(p), perso: carteVue(g, g.joueurs[p].perso), indices: g.joueurs[p].indices, won: g.winner === p }))
    .sort((a, b) => b.won - a.won || b.indices - a.indices || a.name.localeCompare(b.name, 'fr'));
}

export function playerView(ctx, g, p) {
  const J = g.joueurs[p];
  if (!J) return { spectator: true, finished: g.finished };
  const now = ctx.now();
  // fiche de détective sur le téléphone, si l'admin l'a activée : remplie toute seule, barrable à la main
  const statut = id => (J.main.includes(id) ? 'main' : J.vus[id] ? 'vu' : J.elimines.includes(id) ? 'indice' : (J.coches || []).includes(id) ? 'coche' : '');
  const fiche = ctx.cfg.ficheNumerique ? Object.fromEntries(Object.keys(g.cartes).map(id => [id, { statut: statut(id), par: (J.vus[id] || []).map(ctx.name) }])) : null;
  const aRepondre = g.questions.filter(q => q.a === p && q.etat === 'attente').map(q => ({
    id: q.id, de: ctx.name(q.de), salle: nom(g, q.salle), perso: nom(g, q.perso), arme: nom(g, q.arme), fin: q.at + ctx.cfg.delaiReponse * 1000,
    choix: aMontrer(g, q).map(c => carteVue(g, c)),
  }));
  const mesQuestions = g.questions.filter(q => q.de === p).reverse().map(q => ({
    a: ctx.name(q.a), salle: nom(g, q.salle), perso: nom(g, q.perso), arme: nom(g, q.arme), etat: q.etat, carte: q.carte ? carteVue(g, q.carte) : null, rien: q.etat === 'repondue' && !q.carte && enCommun(g, q).length > 0,
  }));
  const max = maxSalle(ctx, g), ei = J.salle ? etatIndice(ctx, g, p, J.salle) : null;
  return {
    phase: g.phase, finished: g.finished, endsAt: g.endsAt, finaleAt: g.finaleAt,
    moi: carteVue(g, J.perso), main: J.main.map(c => carteVue(g, c)),
    salle: J.salle ? carteVue(g, J.salle) : null,
    presents: J.salle ? affiches(g, J.salle).filter(x => x !== p).map(x => ({ pid: x, name: ctx.name(x), dernier: J.last === x, barre: barre(g, x), ...(J.tueur && !g.joueurs[x].mort ? { indices: g.joueurs[x].indices } : {}) })) : [],
    mort: J.mort ? { salle: nom(g, J.mort.salle), victime: p, jeton: J.mort.jeton, trouve: J.mort.trouvePar.length } : null,
    panne: g.phase === 'panne' ? { salle: nom(g, g.panne.salles[p]), entre: g.panne.entres.includes(p), restants: Object.keys(g.joueurs).length - g.panne.entres.length } : null,
    bloque: J.bloque > now ? J.bloque : 0,
    quitteA: J.quitteA > now ? J.quitteA : 0,
    secondeChance: !!J.secondeChance,
    // panneau secret du tueur actif
    complice: complicesVue(ctx, g, p),
    propositionTueur: (() => { const q = J.comp?.propose && g.joueurs[J.comp.propose]; return q?.tueur?.recrute === 'attente' ? { de: ctx.name(J.comp.propose), ici: q.salle === J.salle } : null; })(),
    assomme: J.assomme > now ? J.assomme : 0, liens: J.assommeType || 'assomme',
    armeIci: J.salle && g.armesSol?.[J.salle] != null ? { nom: nom(g, `a${g.armesSol[J.salle]}`), type: typeJoueur(g, g.armesSol[J.salle]) } : null,
    monArme: J.arme ? monArme(ctx, g, p, now) : null,
    menace: (() => { const m = (g.menaces || []).find(x => x.etat === 'attente' && x.a === p); return m ? { de: ctx.name(m.de), fin: m.fin, main: cartesLibres(g, m.de, p).map(c => carteVue(g, c)) } : null; })(),
    menaceur: (() => { const m = (g.menaces || []).find(x => x.etat === 'attente' && x.de === p); return m ? { a: ctx.name(m.a), fin: m.fin } : null; })(),
    bruit: g.bruits?.[0] && now - g.bruits[0].t < 90e3 ? g.bruits[0] : null,
    secret: J.tueur ? secretTueur(ctx, g, p, now) : null,
    nextAsk: J.nextAsk > now ? J.nextAsk : 0,
    attente: g.questions.some(q => q.de === p && q.etat === 'attente'),
    indicesRestants: ei && (ei.etat === 'libre' || ei.etat === 'tache') ? 1 : 0,
    indice: ei ? { etat: ei.etat, pris: ei.c, max, reste: ei.reste || 0 } : null,
    tache: J.salle && ctx.cfg.taches && g.taches && !g.finished && (ei.etat === 'tache' || g.sessions?.[J.salle]?.joueurs.includes(p)) ? tacheVue(ctx, g, p, J.salle, now) : null,
    // tous les indices obtenus (la fiche de détective se fait sur papier)
    indices: J.indices, notes: (J.notes || []).map(n => ({ t: n.t, salle: n.salle ? nom(g, n.salle) : '', texte: n.texte })),
    aRepondre, mesQuestions, fiche, ...listes(g),
    accuse: J.accuse ? { juste: J.accuse.juste } : null,
    winner: g.winner ? ctx.name(g.winner) : null, gagne: g.winner === p,
    revelation: revelation(ctx, g),
    tueur: g.finished && J.perso === g.solution.perso,
  };
}

// Tâche de la salle vue par un joueur : la tâche du moment, et s'il y a lieu la tâche à plusieurs (attente ou en cours, avec son rôle).
function tacheVue(ctx, g, p, s, now) {
  const t = tacheDe(ctx, g, s);
  if (!t) return null;
  const base = { salle: s, id: t.id, groupe: t.groupe, nom: T.nomTache(t), aIndice: aIndice(ctx, g, p, s) };
  if (!t.groupe) return { ...base, consigne: T.SOLOS[t.id].consigne, params: t.params, cle: `${s}:${t.id}:${g.feed.length}` };
  const def = T.GROUPES[t.id], se = g.sessions[s];
  const v = { ...base, n: def.n, roles: def.roles, etat: se?.etat || 'libre', joueurs: (se?.joueurs || []).map(ctx.name), moi: !!se?.joueurs.includes(p) };
  if (se?.etat === 'jeu' && v.moi) {
    const role = se.joueurs.indexOf(p);
    Object.assign(v, { role, roleNom: def.roles[role], consigne: def.consignes[role], vue: def.vue(se.data, role, now), cle: `${s}:${t.id}:${se.joueurs.join(',')}` });
  }
  return v;
}

export function screenView(ctx, g) {
  return {
    phase: g.phase, finished: g.finished, endsAt: g.endsAt, finaleAt: g.finaleAt, debut: g.debut,
    intro: ctx.cfg.intro,
    salles: deType(g, 'salle').map(s => ({ ...carteVue(g, s), etage: etageDe(ctx, g, s), joueurs: affiches(g, s).map(p => ({ name: ctx.name(p), barre: barre(g, p) })) })),
    joueurs: Object.keys(g.joueurs).length,
    panne: g.phase === 'panne' ? { entres: g.panne.entres.length, total: Object.keys(g.joueurs).length } : null,
    feed: g.feed.slice(0, 14),
    winner: g.winner ? qui(ctx, g, g.winner) : null,
    revelation: revelation(ctx, g),
  };
}

export function adminView(ctx, g) {
  return {
    ...screenView(ctx, g),
    solution: { salle: nom(g, g.solution.salle), perso: nom(g, g.solution.perso), arme: nom(g, g.solution.arme) },
    tueur: (() => { const t = Object.keys(g.joueurs).find(p => g.joueurs[p].perso === g.solution.perso); return t ? ctx.name(t) : '—'; })(),
    ...listes(g),
    liste: Object.entries(g.joueurs).map(([p, J]) => ({
      pid: p, name: ctx.name(p), perso: carteVue(g, J.perso), main: J.main.map(c => nom(g, c)), salle: J.salle ? nom(g, J.salle) : null,
      panne: g.phase === 'panne' ? { salle: nom(g, g.panne.salles[p]), entre: g.panne.entres.includes(p) } : null,
      complice: J.complice ? ctx.name(J.complice) : null, comp: J.comp ? { debloque: J.comp.debloque, jeu: J.comp.jeu, grenier: J.comp.grenier, fait: J.comp.fait } : null,
      indices: J.indices, accuse: J.accuse ? (J.accuse.tueur ? 'tueur' : J.accuse.juste ? 'juste' : 'fausse') : null, mort: !!J.mort, tueurActif: !!J.tueur, victimes: J.tueur?.victimes || 0,
    })).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    attente: g.questions.filter(q => q.etat === 'attente').map(q => ({ de: ctx.name(q.de), a: ctx.name(q.a), salle: nom(g, q.salle) })),
    // indices des salles : écrits ou remplis au lancement avec la solution (réservé à l'admin)
    liensSalles: ctx.cfg.liensSalles === false ? [] : deType(g, 'salle').map((sl, n) => ({ n, nom: nom(g, sl), code: codeFixe(g, n) })),
    indicesSalles: (g.auto || []).map((auto, n) => ({ salle: nom(g, `s${n}`), propre: !!g.propres?.includes(`s${n}`), rangPropre: g.proprePos?.[`s${n}`] ?? null, indices: auto.map((a, k) => ({ texte: String(g.indicesSalle?.[n]?.[k] ?? '').trim() || a.texte, ecrit: !!String(g.indicesSalle?.[n]?.[k] ?? '').trim() })) })),
    taches: (g.taches || []).map((_, n) => { const s = `s${n}`, t = tacheDe(ctx, g, s), se = g.sessions[s]; return { salle: s, nomSalle: nom(g, s), nom: t ? T.nomTache(t) : 'Aucune : indice gratuit', groupe: !!t?.groupe, aucune: !t, etat: se?.etat || 'libre', joueurs: (se?.joueurs || []).map(ctx.name) }; }),
  };
}

// Tablette d'une salle : son nom, son code du moment (dans le QR code) et qui est là.
export function salleView(ctx, g, n) {
  const s = `s${n}`;
  if (!g.cartes[s]) return { inconnue: true };
  const w = fenetre(ctx, g);
  const rot = ctx.cfg.rotationQr * 1000;
  return {
    nom: g.cartes[s].nom, n, phase: g.phase, finished: g.finished,
    code: g.phase === 'intro' || g.phase === 'panne' || g.finished ? null : codesDe(g, w)[n],
    // panne : les codes des joueurs envoyés dans cette salle (sans nom), à taper sur leur téléphone
    panne: g.phase === 'panne' ? { codes: Object.keys(g.panne.salles).filter(x => g.panne.salles[x] === s && !g.panne.entres.includes(x)).map(x => g.panne.codes[x]).sort(), repare: Object.keys(g.panne.salles).filter(x => g.panne.salles[x] === s).every(x => g.panne.entres.includes(x)) } : null,
    change: rot > 0 ? (w + 1) * rot : 0,
    joueurs: affiches(g, s).map(p => ({ name: ctx.name(p), barre: barre(g, p) })),
    tache: (() => {
      const t = ctx.cfg.taches && g.taches && !g.finished && g.phase !== 'intro' ? tacheDe(ctx, g, s) : null;
      if (!t) return null;
      const se = g.sessions[s], def = t.groupe ? T.GROUPES[t.id] : null;
      return { nom: T.nomTache(t), groupe: t.groupe, n: def?.n || 1, etat: se?.etat || 'libre', joueurs: (se?.joueurs || []).map(ctx.name), tablette: se?.etat === 'jeu' && def.tablette ? def.tablette(se.data) : null };
    })(),
  };
}

export function results(ctx, g) {
  return classementDe(ctx, g).map(r => ({ pid: r.pid, name: r.name, indices: r.indices, won: r.won }));
}
