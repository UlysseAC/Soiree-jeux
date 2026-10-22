// L'Enquête — tâches des salles (voir docs/jeu5-taches.md). Il faut réussir la tâche d'une salle pour en recevoir l'indice.
// Une salle a une tâche du moment, tirée au hasard : sa tâche solo ou sa tâche à plusieurs (duo / trio).
// Les tâches solo se jouent entièrement sur le téléphone, qui annonce la réussite. Les tâches à plusieurs ont un état partagé
// ici (session) : chaque joueur y a un rôle, envoie ses actions, et le serveur décide de la réussite.

const hasard = (a, b) => a + Math.random() * (b - a);
const entier = (a, b) => Math.floor(hasard(a, b + 1));
const melange = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const borne = (x, a, b) => Math.max(a, Math.min(b, x));

// Tâches de chaque salle, dans l'ordre des salles des réglages (1re salle = Garage…).
export const SALLES = [
  { solo: 'pneus', groupe: 'roue' },
  { solo: 'billard', groupe: 'poker' },
  { solo: 'argenterie', groupe: 'table' },
  { solo: 'pendule', groupe: 'lampes' },
  { solo: 'fourneau', groupe: 'souffle' },
  { solo: 'machine', groupe: 'coffre' },
  { solo: 'tuyaux', groupe: 'vannes' },
  { solo: 'lit', groupe: 'volets' },
  { solo: 'malle', groupe: 'radio' },
  { solo: 'livres', groupe: 'porte' },
  { solo: 'potion', groupe: 'cuve' },
];

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
const ZONE_LAMPE = 12;
const cibleLampe = (d, now) => 100 + 45 * Math.sin((now - d.debut) / 2600 + d.phase);
const pressionCuve = (d, now) => Math.max(0, d.pression - 12 * (now - d.pressionAt) / 1000);
const hauteurCric = (d, now) => Math.max(0, d.cric - 18 * (now - d.cricAt) / 1000);
const code4 = () => String(entier(1000, 9999));
// écart sur la molette du coffre (0 à 99, qui fait le tour)
const ecartMolette = (a, b) => Math.min(Math.abs(a - b), 100 - Math.abs(a - b));

export const GROUPES = {
  roue: {
    nom: 'Changer la roue', n: 2, roles: ['Le cric', 'Les goujons'],
    consignes: ['Tape sans t\'arrêter pour garder la voiture levée.', 'Quand la voiture est levée, fais des cercles sur chaque goujon pour le visser (5).'],
    init: now => ({ cric: 0, cricAt: now, goujons: [0, 0, 0, 0, 0] }),
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
    vue: (d, role, now) => ({ cric: Math.round(hauteurCric(d, now)), cricAt: now, chute: 18, goujons: d.goujons }),
  },
  poker: {
    nom: 'La table de poker truquée', n: 2, roles: ['Joueur 1', 'Joueur 2'],
    consignes: ['Trouve la carte de ta main qui est aussi sur la table. 3 manches.', 'Trouve la carte de ta main qui est aussi sur la table. 3 manches.'],
    init: () => ({ manche: 1, ...mancheePoker() }),
    action(d, role, a) {
      if (a.op !== 'carte') return;
      if (d.trouve[role]) return;
      if (a.carte !== d.doubles[role]) return 'Pas celle-là !';
      d.trouve[role] = true;
      if (!d.trouve.every(Boolean)) return;
      if (d.manche >= 3) return 'reussi';
      Object.assign(d, { manche: d.manche + 1, ...mancheePoker() });
    },
    vue: (d, role) => ({ manche: d.manche, table: d.table, main: d.mains[role], trouve: d.trouve[role], autreTrouve: d.trouve[1 - role] }),
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
    consignes: ['La flamme = ton curseur + celui de ton partenaire. Gardez-la dans la zone 10 s : parlez-vous !', 'La flamme = ton curseur + celui de ton partenaire. Gardez-la dans la zone 10 s : parlez-vous !'],
    init: now => ({ debut: now, phase: hasard(0, 6), v: [30, 30], dans: 0, dernier: now }),
    action(d, role, a) { if (a.op === 'curseur') d.v[role] = borne(Number(a.v) || 0, 0, 100); },
    tick(d, now) {
      const ok = Math.abs(d.v[0] + d.v[1] - cibleLampe(d, now)) <= ZONE_LAMPE;
      d.dans = ok ? d.dans + (now - d.dernier) : 0;
      d.dernier = now;
      if (d.dans >= 10000) return 'reussi';
    },
    vue: (d, role, now) => ({ debut: d.debut, phase: d.phase, zone: ZONE_LAMPE, mien: d.v[role], flamme: d.v[0] + d.v[1], tenu: Math.floor(d.dans / 1000) }),
  },
  souffle: {
    nom: 'Le soufflé', n: 2, roles: ['Le minuteur', 'La porte du four'],
    consignes: ['Regarde le soufflé monter et crie « MAINTENANT ! » quand il est doré.', 'Tu ne vois que la porte du four : sors le soufflé quand ton partenaire crie.'],
    init: now => nouveauSouffle(now),
    action(d, role, a, now) {
      if (role !== 1 || a.op !== 'sortir') return;
      if (Math.abs(now - d.fenetre) <= 900) return 'reussi';
      const msg = now < d.fenetre ? 'Trop tôt, il est retombé !' : 'Trop tard, il a brûlé !';
      Object.assign(d, nouveauSouffle(now));
      return msg;
    },
    vue: (d, role) => (role === 0 ? { debut: d.debut, fenetre: d.fenetre } : { debut: d.debut }),
  },
  coffre: {
    nom: 'Le coffre-fort', n: 2, roles: ['La molette', 'L\'oreille'],
    consignes: ['Tourne la molette lentement ; arrête-toi quand ton partenaire dit « stop ».', 'Tu vois le « clic » quand la molette passe sur le bon chiffre : dis « stop » puis valide.'],
    init: () => ({ code: [entier(0, 99), entier(0, 99), entier(0, 99)], i: 0, molette: 50 }),
    action(d, role, a) {
      if (role === 0 && a.op === 'molette') { d.molette = ((Math.round(Number(a.v) || 0) % 100) + 100) % 100; return; }
      if (role === 1 && a.op === 'stop') {
        if (ecartMolette(d.molette, d.code[d.i]) > 2) return 'Raté : ce n\'était pas le bon chiffre.';
        d.i++;
        return d.i >= 3 ? 'reussi' : undefined;
      }
    },
    vue: (d, role) => (role === 0 ? { molette: d.molette, chiffre: d.i + 1 } : { clic: ecartMolette(d.molette, d.code[d.i]) <= 2, chiffre: d.i + 1 }),
  },
  vannes: {
    nom: 'Purger les canalisations', n: 2, roles: ['Vannes A', 'Vannes B'],
    consignes: ['Ouvre tes vannes dans l\'ordre 1, 2, 3, 4 avec ton partenaire : annoncez vos numéros !', 'Ouvre tes vannes dans l\'ordre 1, 2, 3, 4 avec ton partenaire : annoncez vos numéros !'],
    init: () => { const n = melange([1, 2, 3, 4]); return { a: [n.slice(0, 2).sort(), n.slice(2).sort()], ouvertes: 0 }; },
    action(d, role, a) {
      if (a.op !== 'ouvrir') return;
      const v = Number(a.v);
      if (!d.a[role].includes(v) || v <= d.ouvertes) return;
      if (v !== d.ouvertes + 1) { d.ouvertes = 0; return 'Mauvais ordre : la pression a tout refermé !'; }
      d.ouvertes = v;
      return v === 4 ? 'reussi' : undefined;
    },
    vue: (d, role) => ({ vannes: d.a[role], ouvertes: d.ouvertes }),
  },
  volets: {
    nom: 'Fermer les lourds volets', n: 2, roles: ['Battant gauche', 'Battant droit'],
    consignes: ['Comptez « 3, 2, 1 » et glissez en même temps pour claquer les volets. 3 fenêtres.', 'Comptez « 3, 2, 1 » et glissez en même temps pour claquer les volets. 3 fenêtres.'],
    init: () => ({ fenetre: 1, gestes: [0, 0] }),
    action(d, role, a, now) {
      if (a.op !== 'claquer') return;
      const t = Math.abs(Number(a.t) - now) < 5000 ? Number(a.t) : now; // heure du geste sur le téléphone (horloge synchronisée)
      d.gestes[role] = t;
      const autre = d.gestes[1 - role];
      if (!autre) return;
      if (Math.abs(t - autre) > 500) return Math.abs(t - autre) < 3000 ? 'Trop décalé : recommencez ensemble !' : undefined;
      d.gestes = [0, 0];
      if (d.fenetre >= 3) return 'reussi';
      d.fenetre++;
    },
    vue: d => ({ fenetre: d.fenetre }),
  },
  radio: {
    nom: 'La radio à galène', n: 2, roles: ['Fréquence grossière', 'Réglage fin'],
    consignes: ['Tourne le gros bouton ; ton partenaire voit l\'onde et te guide.', 'Toi seul vois l\'onde : guide ton partenaire, puis affine. Tenez 3 s.'],
    init: now => ({ cible: Math.round(hasard(10, 90) * 10) / 10, gros: 50, fin: 0, dans: 0, dernier: now }),
    action(d, role, a) {
      if (role === 0 && a.op === 'gros') d.gros = borne(Math.round(Number(a.v) || 0), 0, 100);
      if (role === 1 && a.op === 'fin') d.fin = borne(Math.round((Number(a.v) || 0) * 10) / 10, -5, 5);
    },
    tick(d, now) {
      const ok = Math.abs(d.gros + d.fin - d.cible) <= 0.4;
      d.dans = ok ? d.dans + (now - d.dernier) : 0;
      d.dernier = now;
      if (d.dans >= 3000) return 'reussi';
    },
    vue: (d, role) => (role === 0 ? { gros: d.gros } : { fin: d.fin, ecart: Math.round((d.gros + d.fin - d.cible) * 10) / 10, tenu: Math.floor(d.dans / 1000) }),
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
    consignes: ['Garde la température dans le vert avec le curseur.', 'Tape pour garder la pression dans le vert.', 'Quand les deux jauges tiennent 3 s dans le vert, tes partenaires voient chacun 2 chiffres : tape le code.'],
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
      const ok = d.temp >= 60 && d.temp <= 75 && pressionCuve(d, now) >= 50 && pressionCuve(d, now) <= 70;
      d.dans = ok ? d.dans + (now - d.dernier) : 0;
      d.dernier = now;
      if (d.dans >= 3000) d.code = code4();
    },
    vue: (d, role, now) => ({
      temp: d.temp, pression: Math.round(pressionCuve(d, now)), pressionAt: now, chute: 12, tenu: Math.floor(d.dans / 1000),
      ...(d.code && role < 2 ? { moitie: role === 0 ? d.code.slice(0, 2) : d.code.slice(2) } : {}), codeVisible: !!d.code,
    }),
  },
};

// Tâche de la salle n tirée au hasard (une fois sur deux, sa tâche à plusieurs).
export function tirer(n) {
  const def = SALLES[n % SALLES.length];
  return Math.random() < 0.5 ? { id: def.solo, groupe: false } : { id: def.groupe, groupe: true };
}
export const nomTache = t => (t.groupe ? GROUPES[t.id].nom : SOLOS[t.id].nom);
