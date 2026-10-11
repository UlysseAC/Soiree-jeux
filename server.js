'use strict';
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const JEUX = require('./jeux');

const PORT = Number(process.env.PORT) || 3000;
const DOSSIER_DATA = path.join(__dirname, 'data');
const FICHIER_CONFIG = path.join(DOSSIER_DATA, 'config.json');
const COULEURS = ['#ff5d73', '#ffb347', '#ffe066', '#7bd389', '#4cc9f0', '#9b8cff', '#f78fd8', '#5ef2d6', '#ff8c42', '#c0f25e', '#b8c0ff', '#ff6fb5'];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ecran.html')));
app.get(['/m', '/manette'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'manette.html')));

/* ------------------------------------------------------------------ */
/* État global de la soirée                                            */
/* ------------------------------------------------------------------ */

const etat = {
  phase: 'preparation', // preparation → soiree → fin
  programme: [], // ids des jeux choisis, dans l'ordre
  reglages: {}, // { [jeuId]: { cle: valeur } }
  courant: -1, // index dans le programme, -1 = accueil de la soirée
  joueurs: new Map(), // id → { id, nom, couleur, score, connecte, socketId }
  jeu: null, // { id, instance }
};

const CATALOGUE = Object.values(JEUX).map(({ id, nom, icone, genre, description, minJoueurs, reglages }) => ({
  id, nom, icone, genre, description, minJoueurs, reglages,
}));

function reglagesParDefaut(jeu) {
  return Object.fromEntries(jeu.reglages.map((r) => [r.cle, r.defaut]));
}

function validerValeur(def, valeur) {
  switch (def.type) {
    case 'nombre': {
      let n = Number(valeur);
      if (!Number.isFinite(n)) return def.defaut;
      const pas = def.pas || 1;
      n = Math.round(n / pas) * pas;
      return Math.min(def.max, Math.max(def.min, n));
    }
    case 'choix': return def.options.some((o) => o.valeur === valeur) ? valeur : def.defaut;
    case 'interrupteur': return Boolean(valeur);
    case 'texte': return String(valeur ?? '').slice(0, def.max || 200);
    default: return def.defaut;
  }
}

function chargerConfig() {
  let brut = {};
  try {
    brut = JSON.parse(fs.readFileSync(FICHIER_CONFIG, 'utf8'));
  } catch { /* première utilisation */ }
  for (const jeu of Object.values(JEUX)) {
    const enregistres = (brut.reglages || {})[jeu.id] || {};
    const r = reglagesParDefaut(jeu);
    for (const def of jeu.reglages) if (def.cle in enregistres) r[def.cle] = validerValeur(def, enregistres[def.cle]);
    etat.reglages[jeu.id] = r;
  }
  etat.programme = Array.isArray(brut.programme)
    ? [...new Set(brut.programme.filter((id) => JEUX[id]))]
    : Object.keys(JEUX);
}

let minuteurSauvegarde = null;
function sauvegarder() {
  clearTimeout(minuteurSauvegarde);
  minuteurSauvegarde = setTimeout(() => {
    try {
      fs.mkdirSync(DOSSIER_DATA, { recursive: true });
      fs.writeFileSync(FICHIER_CONFIG, JSON.stringify({ reglages: etat.reglages, programme: etat.programme }, null, 2));
    } catch (e) {
      console.error('Sauvegarde impossible :', e.message);
    }
  }, 300);
}

/* ------------------------------------------------------------------ */
/* Joueurs                                                             */
/* ------------------------------------------------------------------ */

function joueursConnectes() {
  return [...etat.joueurs.values()].filter((j) => j.connecte).map(({ id, nom, couleur }) => ({ id, nom, couleur }));
}

function joueurPublic(j) {
  return { id: j.id, nom: j.nom, couleur: j.couleur, score: j.score, connecte: j.connecte };
}

function couleurLibre() {
  const prises = new Set([...etat.joueurs.values()].map((j) => j.couleur));
  return COULEURS.find((c) => !prises.has(c)) || COULEURS[etat.joueurs.size % COULEURS.length];
}

/* ------------------------------------------------------------------ */
/* Jeux                                                                */
/* ------------------------------------------------------------------ */

/** Ce qu'un jeu peut utiliser : réglages en direct, joueurs, points, rafraîchissement. */
function contexte(jeuId) {
  return {
    reglages: () => ({ ...etat.reglages[jeuId] }),
    joueurs: joueursConnectes,
    joueur: (id) => {
      const j = etat.joueurs.get(id);
      return j ? { id: j.id, nom: j.nom, couleur: j.couleur, connecte: j.connecte } : null;
    },
    ajouterPoints: (id, n) => {
      const j = etat.joueurs.get(id);
      if (j && n) j.score += n;
    },
    maj: diffuser,
  };
}

function securise(fn, parDefaut = null) {
  try {
    return fn();
  } catch (e) {
    console.error('Erreur dans le jeu :', e);
    return parDefaut;
  }
}

function arreterJeu() {
  if (!etat.jeu) return;
  securise(() => etat.jeu.instance.detruire?.());
  etat.jeu = null;
}

function allerA(index) {
  arreterJeu();
  if (!Number.isInteger(index) || index < 0 || index >= etat.programme.length) {
    etat.courant = -1;
  } else {
    etat.courant = index;
    const jeu = JEUX[etat.programme[index]];
    etat.jeu = { id: jeu.id, instance: jeu.creer(contexte(jeu.id)) };
  }
  diffuser();
}

/* ------------------------------------------------------------------ */
/* Diffusion de l'état                                                 */
/* ------------------------------------------------------------------ */

let acces = { url: '', qr: '' };

function etatEcran() {
  return {
    phase: etat.phase,
    catalogue: CATALOGUE,
    programme: etat.programme,
    reglages: etat.reglages,
    courant: etat.courant,
    joueurs: [...etat.joueurs.values()].map(joueurPublic),
    acces,
    jeu: etat.jeu ? { id: etat.jeu.id, vue: securise(() => etat.jeu.instance.vueEcran(), {}) } : null,
  };
}

function etatManette(j) {
  const jeu = etat.jeu && JEUX[etat.jeu.id];
  return {
    inscrit: true,
    moi: joueurPublic(j),
    phase: etat.phase,
    jeu: jeu ? { id: jeu.id, nom: jeu.nom, icone: jeu.icone, vue: securise(() => etat.jeu.instance.vueManette(j.id), {}) } : null,
  };
}

let diffusionPrevue = false;
function diffuser() {
  if (diffusionPrevue) return;
  diffusionPrevue = true;
  setImmediate(() => {
    diffusionPrevue = false;
    io.to('ecrans').emit('etat', etatEcran());
    for (const j of etat.joueurs.values()) if (j.socketId) io.to(j.socketId).emit('etat', etatManette(j));
  });
}

/* ------------------------------------------------------------------ */
/* Connexions                                                          */
/* ------------------------------------------------------------------ */

io.on('connection', (socket) => {
  if (socket.handshake.query.role === 'ecran') brancherEcran(socket);
  else brancherManette(socket);
});

function brancherEcran(socket) {
  socket.join('ecrans');
  socket.emit('etat', etatEcran());

  socket.on('reglage', ({ jeuId, cle, valeur } = {}) => {
    const def = JEUX[jeuId]?.reglages.find((r) => r.cle === cle);
    if (!def) return;
    etat.reglages[jeuId][cle] = validerValeur(def, valeur);
    sauvegarder();
    diffuser();
  });

  socket.on('reglages:defaut', (jeuId) => {
    if (!JEUX[jeuId]) return;
    etat.reglages[jeuId] = reglagesParDefaut(JEUX[jeuId]);
    sauvegarder();
    diffuser();
  });

  socket.on('programme', (liste) => {
    if (!Array.isArray(liste)) return;
    const idCourant = etat.courant >= 0 ? etat.programme[etat.courant] : null;
    etat.programme = [...new Set(liste.filter((id) => JEUX[id]))];
    if (idCourant) {
      const i = etat.programme.indexOf(idCourant);
      if (i === -1) {
        arreterJeu();
        etat.courant = -1;
      } else etat.courant = i;
    }
    sauvegarder();
    diffuser();
  });

  socket.on('soiree:demarrer', () => {
    if (!etat.programme.length) return;
    for (const j of etat.joueurs.values()) j.score = 0;
    arreterJeu();
    etat.courant = -1;
    etat.phase = 'soiree';
    diffuser();
  });

  socket.on('soiree:aller', (index) => {
    if (etat.phase === 'soiree') allerA(Number(index));
  });

  socket.on('soiree:terminer', () => {
    arreterJeu();
    etat.courant = -1;
    etat.phase = 'fin';
    diffuser();
  });

  socket.on('soiree:reprendre', () => {
    if (etat.phase !== 'fin') return;
    etat.phase = 'soiree';
    diffuser();
  });

  socket.on('soiree:preparation', () => {
    arreterJeu();
    etat.courant = -1;
    etat.phase = 'preparation';
    diffuser();
  });

  socket.on('jeu:action', ({ action, donnees } = {}) => {
    if (etat.jeu) securise(() => etat.jeu.instance.actionEcran(action, donnees || {}));
  });

  socket.on('score:ajuster', ({ id, delta } = {}) => {
    const j = etat.joueurs.get(id);
    if (!j || !Number.isFinite(delta)) return;
    j.score += Math.round(delta);
    diffuser();
  });

  socket.on('scores:zero', () => {
    for (const j of etat.joueurs.values()) j.score = 0;
    diffuser();
  });

  socket.on('joueur:retirer', (id) => {
    const j = etat.joueurs.get(id);
    if (!j) return;
    if (j.socketId) io.to(j.socketId).emit('retire');
    etat.joueurs.delete(id);
    diffuser();
  });
}

function brancherManette(socket) {
  socket.emit('etat', { inscrit: false, phase: etat.phase });

  socket.on('rejoindre', ({ id, nom } = {}, repondre = () => {}) => {
    nom = String(nom || '').trim().replace(/\s+/g, ' ').slice(0, 16);
    const memeNom = (n, saufId) => [...etat.joueurs.values()].find((x) => x.id !== saufId && x.nom.toLowerCase() === n.toLowerCase());

    let j = id && etat.joueurs.get(id);
    if (!j) {
      if (!nom) return repondre({ erreur: 'Choisis un prénom.' });
      const homonyme = memeNom(nom);
      if (homonyme && homonyme.connecte) return repondre({ erreur: 'Ce prénom est déjà pris.' });
      // Un joueur déconnecté du même nom reprend sa place (téléphone changé, cache vidé…).
      j = homonyme || { id: crypto.randomUUID(), nom, couleur: couleurLibre(), score: 0, connecte: false, socketId: null };
      etat.joueurs.set(j.id, j);
    } else if (nom && nom !== j.nom) {
      if (memeNom(nom, j.id)) return repondre({ erreur: 'Ce prénom est déjà pris.' });
      j.nom = nom;
    }

    if (j.socketId && j.socketId !== socket.id) {
      const ancien = io.sockets.sockets.get(j.socketId);
      ancien?.emit('remplace');
      ancien?.disconnect(true);
    }
    j.socketId = socket.id;
    j.connecte = true;
    socket.data.joueurId = j.id;
    repondre({ id: j.id, nom: j.nom });
    diffuser();
  });

  socket.on('jeu:action', ({ action, donnees } = {}) => {
    const id = socket.data.joueurId;
    if (!id || !etat.joueurs.has(id) || !etat.jeu) return;
    securise(() => etat.jeu.instance.actionManette(id, action, donnees || {}));
  });

  socket.on('disconnect', () => {
    const j = etat.joueurs.get(socket.data.joueurId);
    if (j && j.socketId === socket.id) {
      j.connecte = false;
      j.socketId = null;
      diffuser();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */
/* ------------------------------------------------------------------ */

function adresseLocale() {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const a of interfaces || []) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal) return a.address;
    }
  }
  return 'localhost';
}

async function demarrer() {
  chargerConfig();
  const url = process.env.URL_MANETTE || `http://${adresseLocale()}:${PORT}/m`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: '#14112b', light: '#ffffff' } });
  acces = { url, qr };
  server.listen(PORT, () => {
    console.log('\n🎉 Soirée Jeux prête !');
    console.log(`   Écran (console) : http://localhost:${PORT}`);
    console.log(`   Manettes        : ${url}\n`);
  });
}

if (require.main === module) demarrer();

module.exports = { demarrer, server };
