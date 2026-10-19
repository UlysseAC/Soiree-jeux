// Serveur de la soirée : pages web + temps réel (Socket.IO).
import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { creerGestion, CODE_ESPACE } from './espaces.js';
import edition from './edition.js';
import { GAMES } from './soiree.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.DATA_DIR || join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 3000;
// En ligne, pas de mot de passe par défaut : s'il manque, on en tire un au hasard (visible dans les logs).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (process.env.RENDER ? Math.random().toString(36).slice(2, 10) : 'soiree');

// Site à plusieurs soirées (pour les clients) : édition commerciale ou ESPACES=1. Sinon, une seule soirée, comme avant.
const MULTI = edition.espaces || process.env.ESPACES === '1';
const SUPER_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || (edition.superAvecAdmin ? ADMIN_PASSWORD : '');

// ---------- adresse pour les téléphones ----------
function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}
// En ligne (Render), l'adresse publique est fournie par l'hébergeur ; sinon, l'adresse de l'ordi sur le Wi-Fi.
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://${lanAddress()}:${PORT}`).replace(/\/$/, '');
const JOIN_URL = `${PUBLIC_URL}/jouer`;

// ---------- application ----------
const app = express();
const http = createServer(app);
// Messages compressés : l'état complet (réglages, classement…) se compresse très bien.
const io = new Server(http, { perMessageDeflate: { threshold: 1024 } });

// ---------- soirées (espaces) et persistance ----------
const espaces = await creerGestion({ dataDir: DATA, publicUrl: PUBLIC_URL, io, adminPassword: ADMIN_PASSWORD, multi: MULTI, infos: () => ({ enLigne: !!process.env.RENDER }) });
const defaut = espaces.defaut;
const storage = defaut.storage;

// Pages en plus de l'édition (version commerciale : présentation, réservations, guides…), avant les pages des jeux.
if (edition.extension) {
  const ext = await import(edition.extension);
  await ext.installer({ app, express, espaces, ADMIN_PASSWORD, DATA, ROOT, PUBLIC_URL });
}

const pub = join(ROOT, 'public');
app.use(express.static(pub, { extensions: ['html'] }));
app.get('/vendor/morphdom.js', (_, res) => res.sendFile(join(ROOT, 'node_modules/morphdom/dist/morphdom-umd.min.js')));
app.get('/', (_, res) => res.redirect('/jouer'));
app.get('/infos', (_, res) => res.json({ joinUrl: JOIN_URL, qr: defaut.liens.qr }));
app.get('/ping', (_, res) => res.type('text').send('ok'));
// QR code en SVG (tablettes de L'Enquête : il change toutes les 30 s, inutile de passer par le serveur de jeu)
app.get('/qr.svg', async (req, res) => {
  const d = String(req.query.d ?? '').slice(0, 300);
  if (!d) return res.status(400).end();
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=300').send(await QRCode.toString(d, { type: 'svg', margin: 1, color: { dark: '#17110c', light: '#ffffff' } }));
});
// Pages d'un espace client : les mêmes pages, sous /s/<code>/… (le code est relu par la page elle-même).
if (MULTI) {
  app.get('/s/:code/:page', (req, res, next) => (['jouer', 'ecran', 'admin', 'orga', 'salle'].includes(req.params.page) && CODE_ESPACE.test(req.params.code) ? res.sendFile(join(pub, `${req.params.page}.html`)) : next()));
  app.get('/s/:code', (req, res) => res.redirect(`/s/${req.params.code}/jouer`));
}

// Une erreur imprévue ne doit jamais arrêter le serveur en pleine soirée.
process.on('uncaughtException', e => console.error('Erreur imprévue :', e));
process.on('unhandledRejection', e => console.error('Erreur imprévue :', e));
// Mise à jour ou redémarrage : on sauvegarde toutes les soirées avant de s'arrêter, pour ne perdre aucun inscrit.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    setTimeout(() => process.exit(0), 5000).unref();
    await espaces.toutSauver();
    process.exit(0);
  });
}

io.on('connection', sock => {
  // Synchronisation d'horloge : le téléphone compare son heure à celle du serveur.
  sock.on('sync', (_, cb) => typeof cb === 'function' && cb(Date.now()));
  // L'espace de cet appareil (choisi au « hello ») ; sur le site de base, toujours l'espace par défaut.
  const esp = () => sock.data.espace ?? (MULTI ? null : defaut);
  sock.on('disconnect', () => sock.data.espace?.sortir(sock));

  sock.on('hello', async (h = {}, cb = () => {}) => {
    if (typeof cb !== 'function') cb = () => {};
    // site de base, ou espace déjà en mémoire : tout de suite ; sinon on le charge depuis sa sauvegarde
    const code = MULTI ? String(h.espace ?? '') : '';
    const E = espaces.ouverts.get(code) ?? await espaces.ouvrir(code);
    if (!E) return cb({ ok: false, msg: 'Soirée introuvable : vérifie l\'adresse.' });
    const role = h.role;
    if (role === 'admin' && !E.motDePasse(h.password)) return cb({ ok: false, msg: 'Mot de passe incorrect.' });
    // tablette d'une salle (L'Enquête) : elle affiche le code de la salle, donc protégée par le code orga
    if ((role === 'orga' || role === 'salle') && String(h.code) !== String(E.soiree.s.config.orgaCode)) return cb({ ok: false, msg: 'Code orga incorrect.' });
    if (!['admin', 'ecran', 'orga', 'joueur', 'salle'].includes(role)) return cb({ ok: false, msg: 'Rôle inconnu.' });
    if (sock.data.espace && sock.data.espace !== E) sock.data.espace.sortir(sock);
    sock.data.espace = E;
    E.entrer(sock);
    sock.data.role = role;
    sock.data.token = h.token;
    sock.data.salle = Math.max(0, Math.round(Number(h.salle)) || 0);
    sock.data.test = (role === 'ecran' || role === 'joueur') && !!h.test;
    for (const salle of sock.rooms) if (salle !== sock.id) sock.leave(salle);
    if (role === 'ecran') sock.join(`${E.salle}:${sock.data.test ? 'ecran-test' : 'ecran'}`);
    cb({ ok: true });
    E.envoyer(sock, true);
  });

  // Actions d'un appareil : refusées tant qu'il n'a pas rejoint une soirée.
  const avec = fn => (h = {}, cb = () => {}) => {
    if (typeof cb !== 'function') cb = () => {};
    const E = esp();
    if (!E) return cb({ ok: false, msg: 'Connexion en cours, réessaie.' });
    E.activite = Date.now();
    fn(E, h, cb);
  };

  sock.on('rejoindre', avec((E, h, cb) => {
    const r = E.src(sock).join(sock.data.token, h.name);
    if (r.ok) sock.data.token = r.token;
    cb(r);
    E.broadcast();
  }));

  sock.on('reprendre', avec((E, h, cb) => {
    const r = E.src(sock).reprendre(h.name, h.code);
    if (r.ok) sock.data.token = r.token;
    cb(r);
  }));

  sock.on('reclamer', avec((E, h, cb) => {
    let r;
    try { r = E.src(sock).claimMini(sock.data.token, h.nom); } catch (e) { console.error(e); r = { ok: false, msg: 'Erreur interne.' }; }
    if (r.ok) sock.data.token = r.token;
    cb(r);
    E.broadcast();
  }));

  const guard = (role, fn) => avec((E, a, cb) => {
    if (sock.data.role !== role) return cb({ ok: false, msg: 'Non autorisé.' });
    let r;
    try { r = fn(E, a); } catch (e) { console.error(e); r = { ok: false, msg: 'Erreur interne.' }; }
    cb(r ?? { ok: true });
    E.broadcast();
  });
  sock.on('jeuData', avec((E, q, cb) => {
    if (sock.data.role !== 'ecran' && sock.data.role !== 'admin') return cb(null);
    cb(E.src(sock).data(q));
  }));
  sock.on('joueur', guard('joueur', (E, a) => E.src(sock).player(sock.data.token, a)));
  sock.on('admin', guard('admin', (E, a) => (a.type === 'simulation' ? E.simulation(a) : E.soiree.admin(a))));
  sock.on('orga', guard('orga', (E, a) => E.soiree.orga(a)));
  // Téléphone de test : lancer (ou arrêter) le test d'un mini-jeu pour y jouer soi-même. Toujours à part, avec le mot de passe admin.
  sock.on('testMiniJeu', avec((E, h, cb) => {
    if (!E.motDePasse(h.password)) return cb({ ok: false, msg: 'Mot de passe admin incorrect.' });
    if (h.cmd !== 'stop' && !E.soiree.autorise('minijeux')) return cb({ ok: false, msg: 'Les mini-jeux ne sont pas inclus dans cette soirée.' });
    cb(h.cmd === 'stop' ? E.testeur.handle({ cmd: 'stop' }) : E.testeur.handle({ cmd: 'start', games: [`mini:${h.type}`], moi: Math.max(1, Math.min(10, Math.round(Number(h.moi)) || 1)), aPart: true }));
    E.broadcast();
  }));

  // Super-admin (site à plusieurs soirées) : liste et création des espaces des clients.
  sock.on('super', (h = {}, cb = () => {}) => {
    if (typeof cb !== 'function') return;
    if (!MULTI || !SUPER_PASSWORD) return cb({ ok: false, msg: 'Ce site n\'accueille qu\'une soirée.' });
    if (h.password !== SUPER_PASSWORD) return cb({ ok: false, msg: 'Mot de passe incorrect.' });
    if (h.cmd === 'creer') return cb(espaces.creer(h));
    if (h.cmd === 'modifier') return cb(espaces.modifier(h));
    cb({ ok: true, espaces: espaces.liste(), base: PUBLIC_URL, catalogue: Object.values(GAMES).map(m => ({ id: m.id, nom: m.name })) });
  });
});

// Tick rapide : le « FEU ! » du face-à-face doit partir au bon moment.
setInterval(() => {
  try { espaces.tick(); } catch (e) { console.error('Erreur pendant le jeu :', e); }
}, 40);
// Rafraîchit aussi les vues chaque seconde (disponibilités, recharges, résultats affichés).
setInterval(() => espaces.rafraichir(), 1000);
// Retire de la mémoire les soirées clientes inactives (leur sauvegarde reste).
if (MULTI) setInterval(() => espaces.menage().catch(e => console.error('Ménage des espaces :', e)), 60e3);

http.listen(PORT, '0.0.0.0', () => {
  console.log('\n  🎲 Soirée jeux prête !\n');
  console.log(`  Téléphones (QR code sur l'écran) : ${JOIN_URL}`);
  console.log(`  Écran public : ${PUBLIC_URL}/ecran`);
  console.log(`  Admin        : ${PUBLIC_URL}/admin   (mot de passe : ${process.env.ADMIN_PASSWORD ? 'celui de ADMIN_PASSWORD' : ADMIN_PASSWORD})`);
  console.log(`  Orga         : ${PUBLIC_URL}/orga\n`);
  if (MULTI) console.log(`  Plusieurs soirées : ${PUBLIC_URL}/s/<code>/…   (super-admin : ${PUBLIC_URL}/super${SUPER_PASSWORD ? '' : ', mot de passe SUPER_ADMIN_PASSWORD manquant'})\n`);
  console.log(storage.remote ? '  Sauvegarde : fichier local + en ligne (Upstash)\n' : '  Sauvegarde : fichier local (data/soiree.json)\n');
});
