// Jeu 5 — L'Enquête : un Cluedo grandeur nature. Voir docs/jeu5-enquete.md.
// Après un dîner, tout le monde est amnésique et un cadavre est dans la maison. Une salle, un personnage et une arme
// forment la solution (personne ne les a). Chaque joueur est un personnage (une couleur) et reçoit 3 cartes ; le joueur
// dont le personnage est dans la solution est le tueur… sans le savoir. On se déplace de salle en salle en scannant le
// QR code de la tablette ; dans une salle, on interroge un joueur présent ou on demande un indice à la tablette.
import { createHmac, randomBytes } from 'node:crypto';
import { shuffle } from '../util.js';

export const id = 'enquete';
export const name = "L'Enquête";
export const minPlayers = 2;

// Couleur de chaque personnage, dans l'ordre de la liste des personnages.
export const COULEURS = ['#e7584f', '#4f8fe7', '#5cc47a', '#f0c93a', '#a678e8', '#e0833d', '#ef7fb8', '#ece6d9', '#2b2b2b', '#9aa1ae', '#8b5a2b', '#3cc8c8', '#d4af37', '#c0c6cf'];

export function defaultConfig() {
  return {
    salles: ['Cuisine', 'Salon', 'Salle à manger', 'Bibliothèque', 'Bureau', 'Chambre', 'Salle de bain', 'Entrée', 'Jardin', 'Cave', 'Grenier'].join('\n'),
    personnages: ['Rouge', 'Bleu', 'Vert', 'Jaune', 'Violet', 'Orange', 'Rose', 'Blanc', 'Noir', 'Gris', 'Marron', 'Turquoise', 'Doré', 'Argent'].join('\n'),
    armes: ['Couteau', 'Corde', 'Chandelier', 'Revolver', 'Poison', 'Clé anglaise', 'Matraque'].join('\n'),
    intro: "Vous vous réveillez autour de la table du dîner. Personne ne se souvient de rien.\nDans la maison, un corps.\nPersonne n'a pu entrer ni sortir : le coupable est l'un d'entre vous… et il ne le sait peut-être pas lui-même.",
    dureeMax: 7200, // durée maximale de l'enquête (s)
    finaleApres: 5400, // la phase finale commence au bout de ce temps (s) ; 0 = seulement à la main
    delaiQuestion: 30, // entre deux questions d'un même joueur (s)
    delaiReponse: 60, // le joueur interrogé a ce temps pour choisir la carte ; ensuite, une carte au hasard (s)
    rotationQr: 30, // le QR code des tablettes change toutes les … s ; 0 = fixe
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
const TYPES = { s: 'salle', p: 'perso', a: 'arme' };

// Cartes de la partie : salles s0…, personnages p0… (autant que de joueurs), armes a0….
function cartesDe(cfg, n) {
  const salles = lignes(cfg.salles, 20), armes = lignes(cfg.armes, 20), persos = lignes(cfg.personnages, 30);
  while (persos.length < n) persos.push(`Personnage ${persos.length + 1}`);
  const c = {};
  salles.forEach((nom, i) => { c[`s${i}`] = { id: `s${i}`, type: 'salle', nom }; });
  persos.slice(0, n).forEach((nom, i) => { c[`p${i}`] = { id: `p${i}`, type: 'perso', nom, couleur: COULEURS[i % COULEURS.length] }; });
  armes.forEach((nom, i) => { c[`a${i}`] = { id: `a${i}`, type: 'arme', nom }; });
  return c;
}
const deType = (g, t) => Object.values(g.cartes).filter(c => c.type === t).map(c => c.id);
const nom = (g, id) => g.cartes[id]?.nom ?? '?';

// Distribution : chaque carte (hors solution) une fois, puis les doublons, 2 joueurs au plus par carte,
// jamais deux fois la même carte au même joueur ; chacun reçoit `parJoueur` cartes.
export function distribuer(cartes, pids, parJoueur = 3) {
  const total = pids.length * parJoueur;
  const tas = shuffle(cartes).slice(0, total);
  if (total > cartes.length) tas.push(...shuffle(cartes).slice(0, Math.min(cartes.length, total - cartes.length)));
  const mains = Object.fromEntries(pids.map(p => [p, []]));
  for (const c of tas) {
    const libres = pids.filter(p => mains[p].length < parJoueur && !mains[p].includes(c));
    if (!libres.length) continue;
    const min = Math.min(...libres.map(p => mains[p].length));
    mains[pick(libres.filter(p => mains[p].length === min))].push(c);
  }
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
const qui = (ctx, g, p) => `${ctx.name(p)} (${nom(g, g.joueurs[p].perso)})`;

// ---------- départ ----------
export function start(ctx, pids) {
  const cfg = ctx.cfg;
  const ordre = shuffle(pids);
  const g = {
    phase: 'intro', // intro | enquete | finale ; puis finished
    debut: 0, endsAt: 0, finaleAt: 0,
    secret: randomBytes(16).toString('hex'),
    cartes: cartesDe(cfg, pids.length),
    joueurs: {}, // pid -> { perso, main, salle, indices, pris: { salle: n }, accuse, nextAsk, last, vus: { carte: [pid] }, elimines: [], coches: [] }
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
  feed(g, ctx, "🔎 L'enquête commence !");
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
  feed(g, ctx, winner ? `🏆 ${qui(ctx, g, winner)} a résolu l'enquête !` : "🕯 Fin de l'enquête : la vérité est révélée.");
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
  // Indice à recouper : k cartes dont au plus une est dans la solution (une fois sur deux). Rien n'est barré sur la fiche.
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

function indice(ctx, g, p) {
  const J = g.joueurs[p];
  const s = J.salle;
  const max = g.phase === 'finale' ? ctx.cfg.indicesFinale : ctx.cfg.indicesParSalle;
  const deja = J.pris[s] || 0;
  if (deja >= max) return err(g.phase === 'finale' ? 'Tu as déjà pris tes indices dans cette salle.' : `Tu as déjà pris ${max > 1 ? 'tes indices' : "l'indice"} de cette salle.${ctx.cfg.indicesFinale > max ? ' Il y en aura un autre pendant la phase finale.' : ''}`);
  const ecrits = String(ctx.cfg.indices?.[Number(s.slice(1))] ?? '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const modeles = String(ctx.cfg.modeles ?? '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const brut = ecrits[deja] ?? (modeles.length ? pick(modeles) : "« {carte} » n'a rien à voir avec le crime.");
  // phase finale : un indice automatique donne deux cartes au lieu d'une
  const r = remplir(g, p, brut, g.phase === 'finale' ? 2 : 1);
  J.pris[s] = deja + 1;
  J.indices++;
  for (const c of r.elimines) if (!J.elimines.includes(c)) J.elimines.push(c);
  (J.notes ??= []).unshift({ t: ctx.now(), salle: s, texte: r.texte });
  return { ok: true, msg: `💡 ${r.texte}`, indice: r.texte };
}

// ---------- actions des joueurs ----------
export function playerAction(ctx, g, p, a) {
  const J = g.joueurs[p];
  if (!J) return err('Tu ne joues pas à cette partie.');
  if (a.type === 'cocher') { // fiche de détective : cocher / décocher une carte
    if (!g.cartes[a.carte]) return err('Carte inconnue.');
    J.coches = J.coches.includes(a.carte) ? J.coches.filter(c => c !== a.carte) : [...J.coches, a.carte];
    return { ok: true };
  }
  if (g.finished) return err("L'enquête est terminée.");
  if (g.phase === 'intro') return err("L'enquête n'a pas encore commencé.");
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
    J.salle = `s${s}`;
    return ok(`Tu es dans : ${nom(g, J.salle)}`);
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
    J.accuse = { salle, perso, arme, juste, at: now };
    if (juste) { terminer(ctx, g, p); return ok('Bravo, tu as résolu l\'enquête !'); }
    feed(g, ctx, `❌ ${qui(ctx, g, p)} a accusé à tort : ${nom(g, perso)}, ${nom(g, arme)}, ${nom(g, salle)}`);
    if (Object.values(g.joueurs).every(x => x.accuse)) terminer(ctx, g);
    return err('Mauvaise accusation… Tu ne peux plus accuser, mais tu dois toujours répondre aux questions.');
  }

  if (!J.salle) return err('Scanne d\'abord le QR code de la salle où tu es.');

  if (a.type === 'indice') return indice(ctx, g, p);

  if (a.type === 'interroger') {
    const cible = a.cible;
    const C = g.joueurs[cible];
    if (!C || cible === p) return err('Choisis quelqu\'un à interroger.');
    if (C.salle !== J.salle) return err(`${ctx.name(cible)} n'est pas dans cette salle.`);
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
  if (a.type === 'placer') { // l'admin place un joueur dans une salle (QR code qui ne passe pas)
    const J = g.joueurs[a.pid];
    if (!J || g.cartes[a.salle]?.type !== 'salle') return err('Joueur ou salle inconnu.');
    J.salle = a.salle;
    return ok(`${ctx.name(a.pid)} est dans : ${nom(g, a.salle)}`);
  }
  return err('Action inconnue.');
}

// Rattrapage : un joueur ajouté en cours de partie reçoit une couleur et 3 cartes (doublons possibles).
export function ajouterJoueur(ctx, g, p) {
  if (g.joueurs[p]) return err('Ce joueur est déjà dans la partie.');
  if (g.finished) return err('La partie est terminée.');
  const pris = new Set(Object.values(g.joueurs).map(j => j.perso));
  let i = 0;
  while (pris.has(`p${i}`) && g.cartes[`p${i}`]) i++;
  if (!g.cartes[`p${i}`]) g.cartes[`p${i}`] = { id: `p${i}`, type: 'perso', nom: lignes(ctx.cfg.personnages, 30)[i] || `Personnage ${i + 1}`, couleur: COULEURS[i % COULEURS.length] };
  const sol = new Set(Object.values(g.solution));
  const main = shuffle(Object.keys(g.cartes).filter(c => !sol.has(c))).slice(0, 3);
  g.joueurs[p] = { perso: `p${i}`, main, salle: null, indices: 0, pris: {}, accuse: null, nextAsk: 0, last: null, vus: {}, elimines: [], coches: [] };
  return { ok: true, detail: nom(g, `p${i}`) };
}

// ---------- vues ----------
const carteVue = (g, id) => ({ id, ...g.cartes[id] });
const presents = (g, s) => Object.keys(g.joueurs).filter(p => g.joueurs[p].salle === s);
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
  const statut = id => (J.main.includes(id) ? 'main' : J.vus[id] ? 'vu' : J.elimines.includes(id) ? 'indice' : J.coches.includes(id) ? 'coche' : '');
  const fiche = Object.fromEntries(Object.keys(g.cartes).map(id => [id, { statut: statut(id), par: (J.vus[id] || []).map(ctx.name) }]));
  const aRepondre = g.questions.filter(q => q.a === p && q.etat === 'attente').map(q => ({
    id: q.id, de: ctx.name(q.de), salle: nom(g, q.salle), perso: nom(g, q.perso), arme: nom(g, q.arme), fin: q.at + ctx.cfg.delaiReponse * 1000,
    choix: enCommun(g, q).map(c => carteVue(g, c)),
  }));
  const mesQuestions = g.questions.filter(q => q.de === p).slice(-8).reverse().map(q => ({
    a: ctx.name(q.a), salle: nom(g, q.salle), perso: nom(g, q.perso), arme: nom(g, q.arme), etat: q.etat, carte: q.carte ? carteVue(g, q.carte) : null,
  }));
  const max = g.phase === 'finale' ? ctx.cfg.indicesFinale : ctx.cfg.indicesParSalle;
  return {
    phase: g.phase, finished: g.finished, endsAt: g.endsAt, finaleAt: g.finaleAt,
    moi: carteVue(g, J.perso), main: J.main.map(c => carteVue(g, c)),
    salle: J.salle ? carteVue(g, J.salle) : null,
    presents: J.salle ? presents(g, J.salle).filter(x => x !== p).map(x => ({ pid: x, name: ctx.name(x), perso: carteVue(g, g.joueurs[x].perso), dernier: J.last === x })) : [],
    nextAsk: J.nextAsk > now ? J.nextAsk : 0,
    attente: g.questions.some(q => q.de === p && q.etat === 'attente'),
    indicesRestants: J.salle ? Math.max(0, max - (J.pris[J.salle] || 0)) : 0,
    indices: J.indices, notes: (J.notes || []).slice(0, 20),
    aRepondre, mesQuestions, fiche, ...listes(g),
    accuse: J.accuse ? { juste: J.accuse.juste } : null,
    winner: g.winner ? ctx.name(g.winner) : null, gagne: g.winner === p,
    revelation: revelation(ctx, g),
    tueur: g.finished && J.perso === g.solution.perso,
  };
}

export function screenView(ctx, g) {
  return {
    phase: g.phase, finished: g.finished, endsAt: g.endsAt, finaleAt: g.finaleAt, debut: g.debut,
    intro: ctx.cfg.intro,
    salles: deType(g, 'salle').map(s => ({ ...carteVue(g, s), joueurs: presents(g, s).map(p => ({ name: ctx.name(p), couleur: g.cartes[g.joueurs[p].perso].couleur })) })),
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
      indices: J.indices, accuse: J.accuse ? (J.accuse.juste ? 'juste' : 'fausse') : null,
    })).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    attente: g.questions.filter(q => q.etat === 'attente').map(q => ({ de: ctx.name(q.de), a: ctx.name(q.a), salle: nom(g, q.salle) })),
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
    joueurs: presents(g, s).map(p => ({ name: ctx.name(p), couleur: g.cartes[g.joueurs[p].perso].couleur })),
  };
}

export function results(ctx, g) {
  return classementDe(ctx, g).map(r => ({ pid: r.pid, name: r.name, indices: r.indices, won: r.won }));
}
