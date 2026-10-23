// L'Enquête — tâches des salles (voir docs/jeu5-taches.md). Il faut réussir la tâche d'une salle pour en recevoir l'indice.
// Une salle a une tâche du moment, tirée au hasard : sa tâche solo ou sa tâche à plusieurs (duo / trio).
// Les tâches solo se jouent entièrement sur le téléphone, qui annonce la réussite. Les tâches à plusieurs ont un état partagé
// ici (session) : chaque joueur y a un rôle, envoie ses actions, et le serveur décide de la réussite.

const hasard = (a, b) => a + Math.random() * (b - a);
const entier = (a, b) => Math.floor(hasard(a, b + 1));
const melange = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const borne = (x, a, b) => Math.max(a, Math.min(b, x));
// Difficulté réglée dans l'admin : 0 facile, 1 normal, 2 difficile. N(d, [facile, normal, difficile]).
export const NIVEAUX = { facile: 0, normal: 1, difficile: 2 };
const N = (d, t) => t[d.nv ?? 1];

// Tâches de chaque salle, dans l'ordre des salles des réglages (1re salle = Garage…).
export const SALLES = [
  { solo: 'pneus', groupe: 'roue' },
  { solo: 'billard', groupe: 'poker' },
  { solo: 'argenterie', groupe: 'table' },
  { solo: 'pendule', groupe: 'lampes' },
  { solo: 'fourneau', groupe: 'souffle' },
  { solo: 'machine', groupe: 'coffre' },
  { solo: 'tuyaux', groupe: 'canalisations' },
  { solo: 'lit', groupe: 'volets' },
  { solo: 'malle', groupe: 'radio' },
  { solo: 'livres', groupe: 'porte' },
  { solo: 'potion', groupe: 'cuve' },
];

// Tuyauterie : un chemin de l'entrée (à gauche) à la sortie (à droite), puis chaque tuyau est tourné de 1 à 3 quarts de tour.
const DIR = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // haut, droite, bas, gauche
const liensTuyau = k => (k.type === 'droit' ? [k.rot % 4, (k.rot + 2) % 4] : [k.rot % 4, (k.rot + 1) % 4]);
function eauTuyaux(d) {
  const { n, cases } = d, plein = [];
  let r = d.entree, c = 0, depuis = 3, ok = false;
  for (let pas = 0; pas < n * n + 1; pas++) {
    const l = liensTuyau(cases[r * n + c]);
    if (!l.includes(depuis) || plein.includes(r * n + c)) break;
    plein.push(r * n + c);
    const vers = l.find(x => x !== depuis);
    if (c === n - 1 && vers === 1 && r === d.sortie) { ok = true; break; }
    r += DIR[vers][0]; c += DIR[vers][1]; depuis = (vers + 2) % 4;
    if (r < 0 || c < 0 || r >= n || c >= n) break;
  }
  return { ok, plein };
}
function grilleTuyaux(n) {
  const entree = entier(0, n - 1);
  const essai = (r, c, vu, acc) => {
    if (c === n - 1 && Math.random() < 0.6 || acc.length > n * 3 && c === n - 1) return [...acc, [r, c]];
    for (const dd of melange([0, 1, 2, 3])) {
      const rr = r + DIR[dd][0], cc = c + DIR[dd][1];
      if (rr < 0 || cc < 0 || rr >= n || cc >= n || vu.has(rr * n + cc)) continue;
      vu.add(rr * n + cc);
      const res = essai(rr, cc, vu, [...acc, [r, c]]);
      if (res) return res;
      vu.delete(rr * n + cc);
    }
    return c === n - 1 ? [...acc, [r, c]] : null;
  };
  for (;;) {
    let chemin = null;
    while (!chemin) chemin = essai(entree, 0, new Set([entree * n]), []);
    const cases = Array.from({ length: n * n }, () => ({ type: Math.random() < 0.5 ? 'droit' : 'coude', rot: 0 }));
    const dirDe = (a, b) => DIR.findIndex(dd => a[0] + dd[0] === b[0] && a[1] + dd[1] === b[1]);
    chemin.forEach((cell, i) => {
      const avant = i === 0 ? 3 : dirDe(cell, chemin[i - 1]), apres = i === chemin.length - 1 ? 1 : dirDe(cell, chemin[i + 1]);
      const k = cases[cell[0] * n + cell[1]];
      if ((avant + 2) % 4 === apres) Object.assign(k, { type: 'droit', rot: avant % 2 });
      else Object.assign(k, { type: 'coude', rot: [0, 1, 2, 3].find(x => [x, (x + 1) % 4].includes(avant) && [x, (x + 1) % 4].includes(apres)) });
    });
    const d = { n, cases, entree, sortie: chemin[chemin.length - 1][0], sol: cases.map(k => k.rot) }; // sol : la bonne orientation de chaque tuyau
    cases.forEach(k => { k.rot = (k.rot + 1 + entier(0, 2)) % 4; });
    if (!eauTuyaux(d).ok) return d;
  }
}

const MOTS = ['TELEGRAMME', 'MAJORDOME', 'CHANDELIER', 'GRAMOPHONE', 'LIMOUSINE', 'CHARLESTON', 'MONOCLE', 'CIGARILLO', 'BIBLIOTHEQUE', 'TESTAMENT'];

// ---------- tâches solo : nom, consigne, paramètres tirés par le serveur ----------
export const SOLOS = {
  pneus: { nom: 'Pression des pneus', consigne: 'Tape pour pomper ; garde l\'aiguille dans la zone verte 3 s.' },
  billard: { nom: 'Ranger les boules de billard', consigne: 'Glisse chaque boule dans le trou de son numéro.' },
  argenterie: { nom: 'Polir l\'argenterie', consigne: 'Frotte le plateau avec le doigt jusqu\'à ce qu\'il brille.' },
  pendule: { nom: 'Remonter la pendule', consigne: 'Fais des cercles pour tendre le ressort jusqu\'au vert… sans dépasser !' },
  fourneau: { nom: 'Fourneau à charbon', consigne: 'Glisse vers le haut pour pelleter ; garde le feu dans le rouge 3 s.' },
  machine: { nom: 'Machine à écrire', consigne: 'Recopie le mot avant la fin du temps.', params: () => ({ mot: MOTS[entier(0, MOTS.length - 1)] }) },
  tuyaux: { nom: 'Réparer la tuyauterie', consigne: 'Touche les tuyaux pour les faire pivoter jusqu\'à ce que l\'eau coule.' },
  lit: { nom: 'Faire le lit', consigne: 'Glisse le doigt sur chaque pli pour lisser le drap.' },
  malle: { nom: 'Épousseter la malle', consigne: 'Frotte la malle jusqu\'à ce qu\'elle soit propre.' },
  livres: { nom: 'Les encyclopédies', consigne: 'Fais glisser les tomes pour les remettre dans l\'ordre I à VI.' },
  potion: { nom: 'Préparer la potion', consigne: 'Maintiens « Verser » et relâche pile sur la ligne rouge.' },
};

// ---------- tâches à plusieurs ----------
// init() : état partagé ; action(d, role, a, now) : 'reussi' | message | undefined ; tick(d, now) : 'reussi' ou rien ;
// vue(d, role, now) : ce que voit le joueur de ce rôle (0, 1, 2) ; tablette(d) : affichage sur la tablette de la salle.
const COULEURS_CARTES = ['♠', '♥', '♦', '♣'];
const VALEURS = ['A', 'R', 'D', 'V', '10', '9', '8', '7'];
const JEU = COULEURS_CARTES.flatMap(c => VALEURS.map(v => v + c));
const OBJETS = ['🍴 Fourchette', '🔪 Couteau', '🥄 Cuillère', '🍷 Verre', '🧻 Serviette'];
const PLACES = ['à gauche de l\'assiette', 'à droite de l\'assiette', 'au-dessus de l\'assiette', 'en haut à droite', 'sur l\'assiette'];

function mancheePoker() {
  const cartes = melange(JEU);
  const table = cartes.slice(0, 5);
  // chaque main : 4 cartes hors table + 1 carte de la table (différente pour les deux joueurs)
  const [d0, d1] = melange([0, 1, 2, 3, 4]);
  return { table, mains: [melange([...cartes.slice(5, 9), table[d0]]), melange([...cartes.slice(9, 13), table[d1]])], doubles: [table[d0], table[d1]], trouve: [false, false] };
}
const nouveauSouffle = now => ({ debut: now, fenetre: now + hasard(6000, 11000) });
const zoneLampe = d => N(d, [18, 12, 8]), dureeLampe = d => N(d, [6, 10, 14]);
const cibleLampe = (d, now) => 100 + 45 * Math.sin((now - d.debut) / 2600 + d.phase);
const zoneTemp = d => N(d, [[55, 80], [60, 75], [64, 72]]), zonePression = d => N(d, [[45, 75], [50, 70], [55, 66]]);
const pressionCuve = (d, now) => Math.max(0, d.pression - 12 * (now - d.pressionAt) / 1000);
const chuteCric = d => N(d, [12, 18, 24]);
const hauteurCric = (d, now) => Math.max(0, d.cric - chuteCric(d) * (now - d.cricAt) / 1000);
const code4 = () => String(entier(1000, 9999));
// écart sur la molette du coffre (0 à 99, qui fait le tour)
const ecartMolette = (a, b) => Math.min(Math.abs(a - b), 100 - Math.abs(a - b));

export const GROUPES = {
  roue: {
    nom: 'Changer la roue', n: 2, roles: ['Le cric', 'Les goujons'],
    consignes: ['Tape sans t\'arrêter pour garder la voiture levée.', 'Quand la voiture est levée, fais des cercles sur chaque goujon pour le visser.'],
    init: (now, nv) => ({ cric: 0, cricAt: now, goujons: Array([3, 5, 6][nv]).fill(0) }),
    action(d, role, a, now) {
      if (role === 0 && a.op === 'pomper') { d.cric = Math.min(100, hauteurCric(d, now) + 14); d.cricAt = now; return; }
      if (role === 1 && a.op === 'visser') {
        if (hauteurCric(d, now) < 50) return 'La voiture est trop basse !';
        const i = d.goujons.findIndex(x => x < 100);
        if (i < 0) return;
        d.goujons[i] = Math.min(100, d.goujons[i] + borne(Number(a.q) || 0, 0, 25));
        return d.goujons.every(x => x >= 100) ? 'reussi' : undefined;
      }
    },
    vue: (d, role, now) => ({ cric: Math.round(hauteurCric(d, now)), cricAt: now, chute: chuteCric(d), goujons: d.goujons }),
  },
  poker: {
    nom: 'La table de poker truquée', n: 2, roles: ['Joueur 1', 'Joueur 2'],
    consignes: ['Trouve la carte de ta main qui est aussi sur la table.', 'Trouve la carte de ta main qui est aussi sur la table.'],
    init: () => ({ manche: 1, ...mancheePoker() }),
    action(d, role, a) {
      if (a.op !== 'carte') return;
      if (d.trouve[role]) return;
      if (a.carte !== d.doubles[role]) return 'Pas celle-là !';
      d.trouve[role] = true;
      if (!d.trouve.every(Boolean)) return;
      if (d.manche >= N(d, [2, 3, 4])) return 'reussi';
      Object.assign(d, { manche: d.manche + 1, ...mancheePoker() });
    },
    vue: (d, role) => ({ manche: d.manche, manches: N(d, [2, 3, 4]), table: d.table, main: d.mains[role], trouve: d.trouve[role], autreTrouve: d.trouve[1 - role] }),
  },
  table: {
    nom: 'Dresser la table', n: 2, roles: ['Le plan', 'Les couverts'],
    consignes: ['Dicte le plan de table à ton partenaire.', 'Place les couverts comme ton partenaire te le dicte, puis valide.'],
    init: () => ({ plan: melange([0, 1, 2, 3, 4]), places: [null, null, null, null, null] }),
    action(d, role, a) {
      if (role !== 1) return;
      if (a.op === 'placer') {
        const o = Number(a.objet), p = Number(a.place);
        if (!(o >= 0 && o < 5 && p >= 0 && p < 5)) return;
        d.places = d.places.map(x => (x === p ? null : x));
        d.places[o] = p;
        return;
      }
      if (a.op === 'valider') {
        const bons = d.places.filter((p, o) => p === d.plan[o]).length;
        return bons === 5 ? 'reussi' : `${bons} sur 5 bien placés : demande le plan à nouveau.`;
      }
    },
    vue: (d, role) => ({ objets: OBJETS, places: PLACES, ...(role === 0 ? { plan: d.plan } : { mesPlaces: d.places }) }),
  },
  lampes: {
    nom: 'Les lampes à pétrole', n: 2, roles: ['Lampe de gauche', 'Lampe de droite'],
    consignes: ['La flamme = ton curseur + celui de ton partenaire. Gardez-la dans la zone : parlez-vous !', 'La flamme = ton curseur + celui de ton partenaire. Gardez-la dans la zone : parlez-vous !'],
    init: now => ({ debut: now, phase: hasard(0, 6), v: [30, 30], dans: 0, dernier: now }),
    action(d, role, a) { if (a.op === 'curseur') d.v[role] = borne(Number(a.v) || 0, 0, 100); },
    tick(d, now) {
      const ok = Math.abs(d.v[0] + d.v[1] - cibleLampe(d, now)) <= zoneLampe(d);
      d.dans = ok ? d.dans + (now - d.dernier) : 0;
      d.dernier = now;
      if (d.dans >= dureeLampe(d) * 1000) return 'reussi';
    },
    vue: (d, role, now) => ({ debut: d.debut, phase: d.phase, zone: zoneLampe(d), duree: dureeLampe(d), mien: d.v[role], flamme: d.v[0] + d.v[1], tenu: Math.floor(d.dans / 1000) }),
  },
  souffle: {
    nom: 'Le soufflé', n: 2, roles: ['Le minuteur', 'La porte du four'],
    consignes: ['Regarde le soufflé monter et crie « MAINTENANT ! » quand il est doré.', 'Tu ne vois que la porte du four : sors le soufflé quand ton partenaire crie.'],
    init: now => nouveauSouffle(now),
    action(d, role, a, now) {
      if (role !== 1 || a.op !== 'sortir') return;
      if (Math.abs(now - d.fenetre) <= N(d, [1300, 900, 600])) return 'reussi';
      const msg = now < d.fenetre ? 'Trop tôt, il est retombé !' : 'Trop tard, il a brûlé !';
      Object.assign(d, nouveauSouffle(now));
      return msg;
    },
    vue: (d, role) => (role === 0 ? { debut: d.debut, fenetre: d.fenetre, marge: N(d, [1300, 900, 600]) } : { debut: d.debut }),
  },
  coffre: {
    nom: 'Le coffre-fort', n: 2, roles: ['La molette', 'L\'oreille'],
    consignes: ['Tourne la molette lentement ; arrête-toi quand ton partenaire dit « stop ».', 'Tu vois le « clic » quand la molette passe sur le bon chiffre : dis « stop » puis valide.'],
    init: (now, nv) => ({ code: Array.from({ length: [2, 3, 4][nv] }, () => entier(0, 99)), i: 0, molette: 50 }),
    action(d, role, a) {
      if (role === 0 && a.op === 'molette') { d.molette = ((Math.round(Number(a.v) || 0) % 100) + 100) % 100; return; }
      if (role === 1 && a.op === 'stop') {
        if (ecartMolette(d.molette, d.code[d.i]) > N(d, [3, 2, 1])) return 'Raté : ce n\'était pas le bon chiffre.';
        d.i++;
        return d.i >= d.code.length ? 'reussi' : undefined;
      }
    },
    vue: (d, role) => (role === 0 ? { molette: d.molette, chiffre: d.i + 1, chiffres: d.code.length } : { clic: ecartMolette(d.molette, d.code[d.i]) <= N(d, [3, 2, 1]), chiffre: d.i + 1, chiffres: d.code.length }),
  },
  canalisations: {
    nom: 'Réparer les canalisations', n: 2, roles: ['Tuyaux de gauche', 'Tuyaux de droite'],
    consignes: ['Fais pivoter les tuyaux de ta moitié (à gauche) ; ton partenaire tourne l\'autre moitié. Faites couler l\'eau de 💧 à 🛁 !', 'Fais pivoter les tuyaux de ta moitié (à droite) ; ton partenaire tourne l\'autre moitié. Faites couler l\'eau de 💧 à 🛁 !'],
    init: (now, nv) => grilleTuyaux([3, 4, 5][nv]),
    action(d, role, a) {
      if (a.op !== 'tourner') return;
      const i = Math.floor(Number(a.i));
      if (!(i >= 0 && i < d.n * d.n)) return;
      if ((i % d.n < Math.ceil(d.n / 2) ? 0 : 1) !== role) return 'Ce tuyau est dans l\'autre moitié : c\'est à ton partenaire de le tourner.';
      d.cases[i].rot = (d.cases[i].rot + 1) % 4;
      return eauTuyaux(d).ok ? 'reussi' : undefined;
    },
    vue: (d, role) => ({ n: d.n, cases: d.cases, plein: eauTuyaux(d).plein, entree: d.entree, sortie: d.sortie, coupe: Math.ceil(d.n / 2) }),
  },
  volets: {
    nom: 'Fermer les lourds volets', n: 2, roles: ['Battant gauche', 'Battant droit'],
    consignes: ['Comptez « 3, 2, 1 » et glissez en même temps pour claquer les volets.', 'Comptez « 3, 2, 1 » et glissez en même temps pour claquer les volets.'],
    init: () => ({ fenetre: 1, gestes: [0, 0] }),
    action(d, role, a, now) {
      if (a.op !== 'claquer') return;
      const t = Math.abs(Number(a.t) - now) < 5000 ? Number(a.t) : now; // heure du geste sur le téléphone (horloge synchronisée)
      d.gestes[role] = t;
      const autre = d.gestes[1 - role];
      if (!autre) return;
      if (Math.abs(t - autre) > N(d, [700, 500, 350])) return Math.abs(t - autre) < 3000 ? 'Trop décalé : recommencez ensemble !' : undefined;
      d.gestes = [0, 0];
      if (d.fenetre >= N(d, [2, 3, 4])) return 'reussi';
      d.fenetre++;
    },
    vue: d => ({ fenetre: d.fenetre, fenetres: N(d, [2, 3, 4]) }),
  },
  radio: {
    nom: 'La radio à galène', n: 2, roles: ['Fréquence grossière', 'Réglage fin'],
    consignes: ['Tourne le gros bouton ; ton partenaire voit l\'onde et te guide.', 'Toi seul vois l\'onde : guide ton partenaire, puis affine et tenez l\'onde nette.'],
    init: now => ({ cible: Math.round(hasard(10, 90) * 10) / 10, gros: 50, fin: 0, dans: 0, dernier: now }),
    action(d, role, a) {
      if (role === 0 && a.op === 'gros') d.gros = borne(Math.round(Number(a.v) || 0), 0, 100);
      if (role === 1 && a.op === 'fin') d.fin = borne(Math.round((Number(a.v) || 0) * 10) / 10, -5, 5);
    },
    tick(d, now) {
      const ok = Math.abs(d.gros + d.fin - d.cible) <= N(d, [0.7, 0.4, 0.25]);
      d.dans = ok ? d.dans + (now - d.dernier) : 0;
      d.dernier = now;
      if (d.dans >= N(d, [2, 3, 4]) * 1000) return 'reussi';
    },
    vue: (d, role) => (role === 0 ? { gros: d.gros } : { fin: d.fin, ecart: Math.round((d.gros + d.fin - d.cible) * 100) / 100, tenu: Math.floor(d.dans / 1000), duree: N(d, [2, 3, 4]), marge: N(d, [0.7, 0.4, 0.25]) }),
  },
  porte: {
    nom: 'La porte secrète', n: 3, roles: ['Levier gauche', 'Levier droit', 'Le code'],
    consignes: ['Maintiens ton levier baissé (doigt appuyé) sans lâcher.', 'Maintiens ton levier baissé (doigt appuyé) sans lâcher.', 'Quand les deux leviers sont baissés, le code apparaît sur la tablette de la salle : tape-le.'],
    init: () => ({ leviers: [false, false], code: code4() }),
    action(d, role, a) {
      if (role < 2 && a.op === 'levier') { d.leviers[role] = !!a.bas; return; }
      if (role === 2 && a.op === 'code') {
        if (!d.leviers.every(Boolean)) return 'Les deux leviers doivent être baissés.';
        if (String(a.code).trim() !== d.code) return 'Mauvais code.';
        return 'reussi';
      }
    },
    vue: (d, role) => ({ leviers: d.leviers, ...(role < 2 ? { bas: d.leviers[role] } : {}) }),
    tablette: d => ({ code: d.leviers.every(Boolean) ? d.code : null, leviers: d.leviers }),
  },
  cuve: {
    nom: 'La cuve de stérilisation', n: 3, roles: ['Température', 'Pression', 'Le code'],
    consignes: ['Garde la température dans sa zone avec le curseur.', 'Tape pour garder la pression dans sa zone.', 'Quand les deux jauges tiennent dans leur zone, tes partenaires voient chacun 2 chiffres : tape le code.'],
    init: now => ({ temp: 20, derive: 0, pression: 0, pressionAt: now, dans: 0, dernier: now, code: null }),
    action(d, role, a, now) {
      if (role === 0 && a.op === 'temp') { d.temp = borne(Number(a.v) || 0, 0, 100); return; }
      if (role === 1 && a.op === 'pomper') { d.pression = Math.min(100, pressionCuve(d, now) + 10); d.pressionAt = now; return; }
      if (role === 2 && a.op === 'code') {
        if (!d.code) return 'Le code n\'est pas encore apparu.';
        return String(a.code).trim() === d.code ? 'reussi' : 'Mauvais code.';
      }
    },
    tick(d, now) {
      if (d.code) return;
      const [t0, t1] = zoneTemp(d), [p0, p1] = zonePression(d), pr = pressionCuve(d, now);
      const ok = d.temp >= t0 && d.temp <= t1 && pr >= p0 && pr <= p1;
      d.dans = ok ? d.dans + (now - d.dernier) : 0;
      d.dernier = now;
      if (d.dans >= N(d, [2, 3, 4]) * 1000) d.code = code4();
    },
    vue: (d, role, now) => ({
      temp: d.temp, pression: Math.round(pressionCuve(d, now)), pressionAt: now, chute: 12, tenu: Math.floor(d.dans / 1000), duree: N(d, [2, 3, 4]), zoneTemp: zoneTemp(d), zonePression: zonePression(d),
      ...(d.code && role < 2 ? { moitie: role === 0 ? d.code.slice(0, 2) : d.code.slice(2) } : {}), codeVisible: !!d.code,
    }),
  },
};

// Tâche de la salle n tirée au hasard parmi celles activées dans l'admin (solo : chanceSolo %) ; null si aucune.
export function tirer(n, { solo = true, groupe = true, chanceSolo = 50 } = {}) {
  const def = SALLES[n % SALLES.length];
  if (!solo && !groupe) return null;
  const prendreSolo = solo && (!groupe || Math.random() * 100 < chanceSolo);
  return prendreSolo ? { id: def.solo, groupe: false } : { id: def.groupe, groupe: true };
}
GROUPES.vannes = GROUPES.canalisations; // anciennes parties en cours
export const nomTache = t => (t.groupe ? GROUPES[t.id].nom : SOLOS[t.id].nom);
