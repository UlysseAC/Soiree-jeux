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


export const SALLES_1930 = ['Garage', 'Salle de jeu', 'Salle à manger', 'Salon', 'Cuisine', 'Bureau', 'Salle de bains', 'Chambre', 'Grenier', 'Bibliothèque', 'Pharmacie'].join('\n');
// Ancienne liste par défaut (avant les tâches) : remplacée par celle du manoir si elle n'a pas été modifiée.
export const SALLES_AVANT = ['Cuisine', 'Salon', 'Salle à manger', 'Bibliothèque', 'Bureau', 'Chambre', 'Salle de bain', 'Entrée', 'Jardin', 'Cave', 'Grenier'].join('\n');

export function defaultConfig() {
  return {
    // Dans cet ordre : chaque salle a ses tâches (voir taches.js et docs/jeu5-taches.md).
    salles: SALLES_1930,
    // Une ligne par personnage ; chaque joueur en reçoit un au hasard.
    personnages: ['Le Majordome', 'La Comtesse', 'Le Docteur', 'Le Colonel', 'La Cantatrice', 'Le Professeur', 'La Gouvernante', 'Le Notaire', "L'Héritière", 'Le Jardinier', 'La Veuve', 'Le Chef cuisinier', "L'Aventurière", 'Le Pasteur'].join('\n'),
    armes: ['Couteau', 'Corde', 'Chandelier', 'Revolver', 'Poison', 'Clé anglaise', 'Matraque'].join('\n'),
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
    rechargeArme: 180, // le tueur actif doit attendre ce temps entre deux meurtres (s)
    penaliteOubli: 30, // immobilisé ce temps s'il scanne une autre salle sans avoir quitté la sienne (s)
    ficheNumerique: false, // fiche de détective sur le téléphone (sinon, sur papier)
    indicesParSalle: 1, // indices par joueur et par salle
    indicesFinale: 2, // pendant la phase finale
    // Solution : vide = tirée au hasard ; sinon le nom exact (utile si les indices écrits parlent de la solution).
    solution: { salle: '', perso: '', arme: '' },
    // Indices de chaque salle (une ligne = un indice, dans l'ordre). {carte} = une carte qui n'est pas dans la solution ;
    // {salle}, {perso}, {arme} = une salle, un personnage, une arme qui ne sont pas dans la solution.
    indices: Array.from({ length: 11 }, () => ''),
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
  return String(texte ?? '').split(/\r?\n/).map(l => l.split('=').pop().trim().slice(0, 40)).filter(Boolean).slice(0, 40);
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
  const salles = lignes(cfg.salles === SALLES_AVANT ? SALLES_1930 : cfg.salles, 20), armes = lignes(cfg.armes, 20);
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
  // Solution : celle fixée dans l'admin si elle existe, sinon au hasard.
  const fixe = (t, n) => deType(g, t).find(id => n && g.cartes[id].nom.toLowerCase() === String(n).trim().toLowerCase());
  g.solution = {
    salle: fixe('salle', cfg.solution?.salle) || pick(deType(g, 'salle')),
    perso: fixe('perso', cfg.solution?.perso) || pick(deType(g, 'perso')),
    arme: fixe('arme', cfg.solution?.arme) || pick(deType(g, 'arme')),
  };
  const sol = new Set(Object.values(g.solution));
  const mains = distribuer(Object.keys(g.cartes).filter(c => !sol.has(c)), ordre);
  ordre.forEach((p, i) => {
    g.joueurs[p] = { perso: `p${i}`, main: mains[p], salle: null, indices: 0, pris: {}, accuse: null, nextAsk: 0, last: null, vus: {}, elimines: [], coches: [] };
  });
  return g;
}

// L'admin lance l'enquête après le texte d'introduction.
function lancer(ctx, g) {
  const now = ctx.now();
  g.phase = 'enquete';
  g.debut = now;
  g.endsAt = now + ctx.cfg.dureeMax * 1000;
  g.finaleAt = ctx.cfg.finaleApres > 0 ? now + ctx.cfg.finaleApres * 1000 : 0;
  g.taches = Array.from({ length: g.nbSalles }, (_, n) => tirerTache(ctx, n));
  g.sessions = {};
  feed(g, ctx, "🔎 L'enquête commence !");
}

// ---------- tâches des salles ----------
const niveau = ctx => T.NIVEAUX[ctx.cfg.difficulte] ?? 1;
const activees = (ctx, n) => ({ solo: ctx.cfg.tachesSolo?.[n] !== false, groupe: ctx.cfg.tachesGroupe?.[n] !== false });
const paramsSolo = (ctx, id) => ({ ...(T.SOLOS[id].params ? T.SOLOS[id].params() : {}), niveau: niveau(ctx) });
function tirerTache(ctx, n) {
  const t = T.tirer(n, { ...activees(ctx, n), chanceSolo: Number(ctx.cfg.chanceSolo ?? 50) });
  return t && { ...t, params: t.groupe ? {} : paramsSolo(ctx, t.id) };
}
const maxSalle = (ctx, g) => (g.phase === 'finale' ? ctx.cfg.indicesFinale : ctx.cfg.indicesParSalle);
const aIndice = (ctx, g, p, s) => (g.joueurs[p].pris[s] || 0) >= maxSalle(ctx, g);
// Tâche de la salle pour les joueurs qui y sont : la tâche à plusieurs devient la solo s'il ne reste pas assez de joueurs sans l'indice.
function tacheDe(ctx, g, s) {
  const n = Number(s.slice(1));
  if (!g.taches || n >= g.taches.length) return null;
  const on = activees(ctx, n);
  // réglages changés dans l'admin : la salle retire une tâche permise (sauf pendant une tâche à plusieurs)
  let t = g.taches[n];
  if (!g.sessions[s] && (!t ? on.solo || on.groupe : !(t.groupe ? on.groupe : on.solo))) t = g.taches[n] = tirerTache(ctx, n);
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
    while (!aIndice(ctx, g, p, s)) { const r = indice(ctx, g, p, true); if (!r.ok) break; t.push(r.indice); }
    textes[p] = t;
  }
  const n = Number(s.slice(1));
  feed(g, ctx, `✅ ${pids.map(p => ctx.name(p)).join(' et ')} : tâche réussie (${nom(g, s)})`);
  delete g.sessions[s];
  g.taches[n] = tirerTache(ctx, n);
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
function resoudre(ctx, g, q, carte) {
  q.carte = carte;
  q.etat = 'repondue';
  const de = g.joueurs[q.de];
  if (carte) (de.vus[carte] ??= []).includes(q.a) || de.vus[carte].push(q.a);
  feed(g, ctx, `🗣 ${qui(ctx, g, q.de)} a interrogé ${qui(ctx, g, q.a)} dans ${nom(g, q.salle)} : ${carte ? 'une carte montrée' : 'aucune carte'}`);
}
const enCommun = (g, q) => g.joueurs[q.a].main.filter(c => [q.salle, q.perso, q.arme].includes(c));

export function tick(ctx, g) {
  if (g.finished || g.phase === 'intro') return false;
  const now = ctx.now();
  let changed = false;
  for (const q of g.questions) {
    if (q.etat === 'attente' && now >= q.at + ctx.cfg.delaiReponse * 1000) { resoudre(ctx, g, q, pick(enCommun(g, q))); changed = true; }
  }
  for (const [s, se] of Object.entries(g.sessions || {})) {
    const def = T.GROUPES[se.id];
    if (se.etat !== 'jeu' || !def.tick) continue;
    const avant = JSON.stringify(se.data.code ?? null);
    if (def.tick(se.data, now) === 'reussi') { reussir(ctx, g, s, se.joueurs); changed = true; } else if (JSON.stringify(se.data.code ?? null) !== avant) changed = true;
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
const listeNoms = noms => (noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}` : noms[0] || '…');
function remplir(g, p, texte, n) {
  const elimines = [];
  const prendre = type => {
    const libres = inconnues(g, p, type).filter(c => !elimines.includes(c));
    const pris = shuffle(libres).slice(0, n);
    elimines.push(...pris);
    return pris.length ? pris.map(c => nom(g, c)).join(' » et « ') : '…';
  };
  // Indice à recouper : k cartes dont au plus une est dans la solution (une fois sur deux). Ces cartes ne comptent pas comme éliminées.
  const groupe = (k, type) => {
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
    .replace(/\{(\d)(carte|salle|perso|arme)s?\}/g, (_, k, t) => groupe(Math.max(2, Number(k)), t === 'carte' ? null : t))
    .replace(/\{(carte|salle|perso|arme)\}/g, (_, k) => prendre(k === 'carte' ? null : k));
  return { texte: out, elimines };
}

function indice(ctx, g, p, parTache = false) {
  const J = g.joueurs[p];
  const s = J.salle;
  if (ctx.cfg.taches && !parTache && g.taches && tacheDe(ctx, g, s)) return err('Réussis la tâche de la salle pour obtenir son indice.');
  const max = g.phase === 'finale' ? ctx.cfg.indicesFinale : ctx.cfg.indicesParSalle;
  const deja = J.pris[s] || 0;
  if (deja >= max) return err(g.phase === 'finale' ? 'Tu as déjà pris tes indices dans cette salle.' : `Tu as déjà pris ${max > 1 ? 'tes indices' : "l'indice"} de cette salle.${ctx.cfg.indicesFinale > max ? ' Il y en aura un autre pendant la phase finale.' : ''}`);
  const ecrits = String(ctx.cfg.indices?.[Number(s.slice(1))] ?? '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const modeles = String(ctx.cfg.modeles ?? '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  // Le tueur (qui ne le sait pas encore) a des souvenirs plus précis : deux cartes innocentées à chaque indice automatique.
  const tueur = J.perso === g.solution.perso && !J.tueur;
  const brut = ecrits[deja] ?? (tueur ? 'Un souvenir précis te revient : « {carte} » n\'a rien à voir avec le crime.' : modeles.length ? pick(modeles) : "« {carte} » n'a rien à voir avec le crime.");
  // phase finale : un indice automatique donne deux cartes au lieu d'une
  const r = remplir(g, p, brut, g.phase === 'finale' || tueur ? 2 : 1);
  J.pris[s] = deja + 1;
  J.indices++;
  for (const c of r.elimines) if (!J.elimines.includes(c)) J.elimines.push(c);
  (J.notes ??= []).unshift({ t: ctx.now(), salle: s, texte: r.texte });
  return { ok: true, msg: `💡 ${r.texte}`, indice: r.texte };
}

// ---------- le tueur actif et les corps ----------
// Meurtre (règle de base, en attendant celle de chaque arme) : une victime vivante dans la même salle, puis un temps de recharge.
function tuer(ctx, g, p, cible) {
  const J = g.joueurs[p], C = g.joueurs[cible], now = ctx.now();
  if (!J.tueur?.actif) return err('Action inconnue.');
  if (!J.tueur.arme) return err(`Va d'abord chercher ${nom(g, g.solution.arme)} dans : ${nom(g, J.tueur.cache)}.`);
  if (now < J.tueur.recharge) return err(`Ton arme n'est pas prête : encore ${Math.ceil((J.tueur.recharge - now) / 1000)} s.`);
  if (!C || cible === p || C.mort) return err('Choisis une victime.');
  if (C.salle !== J.salle) return err(`${ctx.name(cible)} n'est pas dans ta salle.`);
  C.mort = { at: now, salle: J.salle, par: p, jeton: randomBytes(4).toString('hex'), trouvePar: [] };
  quitterSession(g, cible);
  for (const q of g.questions) if (q.etat === 'attente' && (q.a === cible || q.de === cible)) q.etat = 'annulee';
  J.tueur.recharge = now + (ctx.cfg.rechargeArme ?? 180) * 1000;
  J.tueur.victimes = (J.tueur.victimes || 0) + 1;
  // plus aucun innocent en vie : le tueur l'emporte
  if (Object.keys(g.joueurs).every(x => x === p || g.joueurs[x].mort)) terminer(ctx, g, p);
  return ok(`${ctx.name(cible)} ne se relèvera pas.`);
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
  for (const c of C.main) { (J.vus[c] ??= []).includes(a.victime) || J.vus[c].push(a.victime); }
  const texte = `Sur le corps de ${ctx.name(a.victime)} : ${C.main.map(c => `« ${nom(g, c)} »`).join(', ')}.`;
  (J.notes ??= []).unshift({ t: ctx.now(), salle: C.mort.salle, texte });
  return { ok: true, msg: `🔍 ${texte}` };
}

// ---------- actions des joueurs ----------
export function playerAction(ctx, g, p, a) {
  const J = g.joueurs[p];
  if (!J) return err('Tu ne joues pas à cette partie.');
  if (a.type === 'cocher') { // fiche de détective sur le téléphone : barrer / débarrer une carte
    if (!ctx.cfg.ficheNumerique) return err('La fiche de détective se fait sur papier.');
    if (!g.cartes[a.carte]) return err('Carte inconnue.');
    J.coches = (J.coches || []).includes(a.carte) ? J.coches.filter(c => c !== a.carte) : [...(J.coches || []), a.carte];
    return { ok: true };
  }
  if (g.finished) return err("L'enquête est terminée.");
  if (g.phase === 'intro') return err("L'enquête n'a pas encore commencé.");
  if (J.mort) return err('Tu as été assassiné : reste où tu es, les enquêteurs vont te trouver.');
  const now = ctx.now();

  if (a.type === 'entrer') { // QR code scanné (ou code tapé) : le joueur est dans cette salle
    const code = String(a.code ?? '').trim();
    const w = fenetre(ctx, g, now);
    const fenetres = [codesDe(g, w), codesDe(g, w - 1)];
    let s = null;
    if (a.salle != null) { const i = Number(a.salle); if (fenetres.some(c => c[i] === code)) s = i; } else {
      for (const c of fenetres) { const i = c.indexOf(code); if (i >= 0) { s = i; break; } }
    }
    if (s == null) return err('Code de salle incorrect ou expiré : scanne à nouveau la tablette.');
    let oubli = '';
    if (J.salle && J.salle !== `s${s}`) { // il fallait d'abord appuyer sur « Quitter la salle »
      oubli = nom(g, J.salle);
      J.bloque = now + (ctx.cfg.penaliteOubli ?? 30) * 1000;
    }
    if (J.salle !== `s${s}`) quitterSession(g, p);
    J.salle = `s${s}`;
    if (J.tueur && !J.tueur.arme && J.salle === J.tueur.cache) J.tueur.arme = true; // le tueur retrouve son arme (rien ne s'affiche ailleurs)
    return oubli ? err(`Tu as oublié de quitter ${oubli} ! Immobilisé ${ctx.cfg.penaliteOubli ?? 30} s.`) : ok(`Tu es dans : ${nom(g, J.salle)}`);
  }

  if (a.type === 'quitter') { // « Quitter la salle » : obligatoire avant d'aller ailleurs
    if (!J.salle) return err('Tu n\'es dans aucune salle.');
    const avant = nom(g, J.salle);
    quitterSession(g, p);
    J.salle = null;
    return ok(`Tu as quitté : ${avant}. Scanne la tablette de ta prochaine salle.`);
  }

  if (a.type === 'montrer') { // je réponds à une question : la carte que je montre
    const q = g.questions.find(x => x.id === a.q && x.a === p && x.etat === 'attente');
    if (!q) return err('Cette question n\'attend plus de réponse.');
    if (!enCommun(g, q).includes(a.carte)) return err('Tu dois montrer une des cartes demandées.');
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
        J.tueur = { actif: true, cache: pick(autres.length ? autres : deType(g, 'salle')), arme: false, recharge: 0, at: now };
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
  if (J.bloque > now) return err(`Tu es immobilisé encore ${Math.ceil((J.bloque - now) / 1000)} s.`);
  if (!J.salle) return err('Scanne d\'abord le QR code de la salle où tu es.');
  if (a.type === 'tuer') return tuer(ctx, g, p, a.cible);

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
    if (C.salle !== J.salle || C.mort) return err(`${ctx.name(cible)} n'est pas dans cette salle.`);
    if (J.last === cible) return err(`Tu viens d'interroger ${ctx.name(cible)} : interroge quelqu'un d'autre d'abord.`);
    if (now < J.nextAsk) return err(`Attends encore ${Math.ceil((J.nextAsk - now) / 1000)} s avant ta prochaine question.`);
    if (g.questions.some(q => q.de === p && q.etat === 'attente')) return err('Attends la réponse à ta question.');
    if (g.cartes[a.perso]?.type !== 'perso' || g.cartes[a.arme]?.type !== 'arme') return err('Choisis un personnage et une arme.');
    const q = { id: `q${g.questions.length + 1}`, de: p, a: cible, salle: J.salle, perso: a.perso, arme: a.arme, at: now, carte: null, etat: 'attente' };
    g.questions.push(q);
    J.last = cible;
    J.nextAsk = now + ctx.cfg.delaiQuestion * 1000;
    if (!enCommun(g, q).length) { resoudre(ctx, g, q, null); return ok(`${ctx.name(cible)} n'a aucune de ces cartes.`); }
    return ok(`Question posée à ${ctx.name(cible)} : attends sa réponse.`);
  }
  return err('Action inconnue.');
}

// ---------- admin ----------
export function adminAction(ctx, g, a) {
  if (a.type === 'lancer') {
    if (g.phase !== 'intro') return err("L'enquête a déjà commencé.");
    lancer(ctx, g);
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
  if (a.type === 'nouvelleTache') { // l'admin fait tirer une autre tâche à une salle (tâche bloquée, joueurs partis…)
    const n = Number(String(a.salle).slice(1));
    if (!g.taches?.[n]) return err('Salle inconnue.');
    delete g.sessions[`s${n}`];
    g.taches[n] = tirerTache(ctx, n);
    return ok(`${nom(g, `s${n}`)} : ${g.taches[n] ? T.nomTache(g.taches[n]) : 'pas de tâche (indice gratuit)'}`);
  }
  if (a.type === 'placer') { // l'admin place un joueur dans une salle (QR code qui ne passe pas)
    const J = g.joueurs[a.pid];
    if (!J || g.cartes[a.salle]?.type !== 'salle') return err('Joueur ou salle inconnu.');
    if (J.salle !== a.salle) quitterSession(g, a.pid);
    J.salle = a.salle;
    return ok(`${ctx.name(a.pid)} est dans : ${nom(g, a.salle)}`);
  }
  return err('Action inconnue.');
}

// Rattrapage : un joueur ajouté en cours de partie reçoit un personnage libre et 3 cartes (doublons possibles).
export function ajouterJoueur(ctx, g, p) {
  if (g.joueurs[p]) return err('Ce joueur est déjà dans la partie.');
  if (g.finished) return err('La partie est terminée.');
  const i = deType(g, 'perso').length;
  g.cartes[`p${i}`] = { id: `p${i}`, type: 'perso', nom: attribuer(ctx, [p], deType(g, 'perso').map(c => g.cartes[c].nom))[p] };
  const sol = new Set(Object.values(g.solution));
  const main = shuffle(Object.keys(g.cartes).filter(c => !sol.has(c))).slice(0, 3);
  g.joueurs[p] = { perso: `p${i}`, main, salle: null, indices: 0, pris: {}, accuse: null, nextAsk: 0, last: null, vus: {}, elimines: [], coches: [] };
  return { ok: true, detail: nom(g, `p${i}`) };
}

// ---------- vues ----------
const carteVue = (g, id) => ({ id, ...g.cartes[id] });
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
    choix: enCommun(g, q).map(c => carteVue(g, c)),
  }));
  const mesQuestions = g.questions.filter(q => q.de === p).reverse().map(q => ({
    a: ctx.name(q.a), salle: nom(g, q.salle), perso: nom(g, q.perso), arme: nom(g, q.arme), etat: q.etat, carte: q.carte ? carteVue(g, q.carte) : null,
  }));
  const max = g.phase === 'finale' ? ctx.cfg.indicesFinale : ctx.cfg.indicesParSalle;
  return {
    phase: g.phase, finished: g.finished, endsAt: g.endsAt, finaleAt: g.finaleAt,
    moi: carteVue(g, J.perso), main: J.main.map(c => carteVue(g, c)),
    salle: J.salle ? carteVue(g, J.salle) : null,
    presents: J.salle ? presents(g, J.salle).filter(x => x !== p).map(x => ({ pid: x, name: ctx.name(x), dernier: J.last === x, ...(J.tueur ? { indices: g.joueurs[x].indices } : {}) })) : [],
    mort: J.mort ? { salle: nom(g, J.mort.salle), victime: p, jeton: J.mort.jeton, trouve: J.mort.trouvePar.length } : null,
    bloque: J.bloque > now ? J.bloque : 0,
    secondeChance: !!J.secondeChance,
    // panneau secret du tueur actif
    secret: J.tueur ? { arme: nom(g, g.solution.arme), cache: nom(g, J.tueur.cache), armeRecup: J.tueur.arme, recharge: J.tueur.recharge > now ? J.tueur.recharge : 0, victimes: J.tueur.victimes || 0 } : null,
    nextAsk: J.nextAsk > now ? J.nextAsk : 0,
    attente: g.questions.some(q => q.de === p && q.etat === 'attente'),
    indicesRestants: J.salle ? Math.max(0, max - (J.pris[J.salle] || 0)) : 0,
    tache: J.salle && ctx.cfg.taches && g.taches && !g.finished ? tacheVue(ctx, g, p, J.salle, now) : null,
    // tous les indices obtenus (la fiche de détective se fait sur papier)
    indices: J.indices, notes: (J.notes || []).map(n => ({ t: n.t, salle: nom(g, n.salle), texte: n.texte })),
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
    salles: deType(g, 'salle').map(s => ({ ...carteVue(g, s), joueurs: presents(g, s).map(p => ({ name: ctx.name(p) })) })),
    joueurs: Object.keys(g.joueurs).length,
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
      indices: J.indices, accuse: J.accuse ? (J.accuse.tueur ? 'tueur' : J.accuse.juste ? 'juste' : 'fausse') : null, mort: !!J.mort, tueurActif: !!J.tueur, victimes: J.tueur?.victimes || 0,
    })).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    attente: g.questions.filter(q => q.etat === 'attente').map(q => ({ de: ctx.name(q.de), a: ctx.name(q.a), salle: nom(g, q.salle) })),
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
    code: g.phase === 'intro' || g.finished ? null : codesDe(g, w)[n],
    change: rot > 0 ? (w + 1) * rot : 0,
    joueurs: presents(g, s).map(p => ({ name: ctx.name(p) })),
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
