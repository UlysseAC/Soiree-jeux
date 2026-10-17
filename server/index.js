// Serveur de la soirée : pages web + temps réel (Socket.IO).
import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { Soiree, restore } from './soiree.js';
import { makeStorage } from './stockage.js';
import { Simulation } from './simulation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.DATA_DIR || join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 3000;
// En ligne, pas de mot de passe par défaut : s'il manque, on en tire un au hasard (visible dans les logs).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (process.env.RENDER ? Math.random().toString(36).slice(2, 10) : 'soiree');

// ---------- persistance ----------
const storage = makeStorage(DATA);
const saved = await storage.load();
const save = () => storage.save(() => soiree.s);

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
const qr = await QRCode.toDataURL(JOIN_URL, { margin: 1, width: 360, color: { dark: '#17110c', light: '#f0e3c8' } });
// QR code de l'écran de test : il mène au téléphone de test (/jouer?test), pour incarner un joueur de la simulation.
const qrTest = await QRCode.toDataURL(`${JOIN_URL}?test`, { margin: 1, width: 360, color: { dark: '#17110c', light: '#f0e3c8' } });

// ---------- application ----------
const app = express();
const http = createServer(app);
const io = new Server(http);
const soiree = new Soiree(restore(saved), { onSfx: name => io.to('ecran').emit('sfx', name) });

const pub = join(ROOT, 'public');
app.use(express.static(pub, { extensions: ['html'] }));
app.get('/vendor/morphdom.js', (_, res) => res.sendFile(join(ROOT, 'node_modules/morphdom/dist/morphdom-umd.min.js')));
app.get('/', (_, res) => res.redirect('/jouer'));
app.get('/infos', (_, res) => res.json({ joinUrl: JOIN_URL, qr }));
app.get('/ping', (_, res) => res.type('text').send('ok'));

// ---------- temps réel ----------
function viewFor(sock) {
  const d = sock.data;
  if (d.role === 'admin') return { ...soiree.adminView(), simulation: sim.status(), sauvegardeEnLigne: storage.remote, enLigne: !!process.env.RENDER };
  if (d.role === 'ecran') return { ...(d.test ? sim.ecran() : soiree).screenView(), joinUrl: d.test ? `${JOIN_URL}?test` : JOIN_URL, qr: d.test ? qrTest : qr, test: !!d.test };
  if (d.role === 'orga') return soiree.orgaView();
  return src(sock).playerView(d.token);
}

// Écran et téléphones de test (?test) : ils suivent la soirée de la simulation quand elle tourne à part.
const src = sock => (sock.data.test ? sim.ecran() : soiree);

let pending = false;
function broadcast(persist = true) {
  if (persist) save();
  if (pending) return;
  pending = true;
  setImmediate(() => {
    pending = false;
    for (const sock of io.sockets.sockets.values()) if (sock.data.role) sock.emit('etat', viewFor(sock));
  });
}

// Pendant une vraie partie, la simulation tourne dans une soirée séparée (mêmes réglages, jamais sauvegardée),
// visible sur l'écran de test /ecran?test.
const sim = new Simulation(soiree, () => broadcast(), () => new Soiree(restore({ config: JSON.parse(JSON.stringify(soiree.s.config)) }), { onSfx: name => io.to('ecran-test').emit('sfx', name) }));

// Une erreur imprévue ne doit jamais arrêter le serveur en pleine soirée.
process.on('uncaughtException', e => console.error('Erreur imprévue :', e));
process.on('unhandledRejection', e => console.error('Erreur imprévue :', e));
// Mise à jour ou redémarrage : on sauvegarde avant de s'arrêter, pour ne perdre aucun inscrit.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    setTimeout(() => process.exit(0), 5000).unref();
    await storage.flush(() => soiree.s);
    process.exit(0);
  });
}

io.on('connection', sock => {
  // Synchronisation d'horloge : le téléphone compare son heure à celle du serveur.
  sock.on('sync', (_, cb) => typeof cb === 'function' && cb(Date.now()));

  sock.on('hello', (h = {}, cb = () => {}) => {
    const role = h.role;
    if (role === 'admin' && h.password !== ADMIN_PASSWORD) return cb({ ok: false, msg: 'Mot de passe incorrect.' });
    if (role === 'orga' && String(h.code) !== String(soiree.s.config.orgaCode)) return cb({ ok: false, msg: 'Code orga incorrect.' });
    if (!['admin', 'ecran', 'orga', 'joueur'].includes(role)) return cb({ ok: false, msg: 'Rôle inconnu.' });
    sock.data.role = role;
    sock.data.token = h.token;
    sock.data.test = (role === 'ecran' || role === 'joueur') && !!h.test;
    if (role === 'ecran') sock.join(sock.data.test ? 'ecran-test' : 'ecran');
    cb({ ok: true });
    sock.emit('etat', viewFor(sock));
  });

  sock.on('rejoindre', (h = {}, cb = () => {}) => {
    const r = src(sock).join(sock.data.token, h.name);
    if (r.ok) sock.data.token = r.token;
    cb(r);
    broadcast();
  });

  sock.on('reclamer', (h = {}, cb = () => {}) => {
    if (typeof cb !== 'function') return;
    let r;
    try { r = src(sock).claimMini(sock.data.token, h.nom); } catch (e) { console.error(e); r = { ok: false, msg: 'Erreur interne.' }; }
    if (r.ok) sock.data.token = r.token;
    cb(r);
    broadcast();
  });

  const guard = (role, fn) => (a = {}, cb = () => {}) => {
    if (sock.data.role !== role) return cb({ ok: false, msg: 'Non autorisé.' });
    let r;
    try { r = fn(a); } catch (e) { console.error(e); r = { ok: false, msg: 'Erreur interne.' }; }
    cb(r ?? { ok: true });
    broadcast();
  };
  sock.on('jeuData', (q = {}, cb = () => {}) => {
    if (sock.data.role !== 'ecran' && sock.data.role !== 'admin') return cb(null);
    cb((sock.data.test ? sim.ecran() : soiree).data(q));
  });
  sock.on('joueur', guard('joueur', a => src(sock).player(sock.data.token, a)));
  sock.on('admin', guard('admin', a => (a.type === 'simulation' ? sim.handle(a) : soiree.admin(a))));
  sock.on('orga', guard('orga', a => soiree.orga(a)));
});

// Tick rapide : le « FEU ! » du face-à-face doit partir au bon moment.
setInterval(() => {
  try { const vrai = soiree.tick(), test = sim.tick(); if (vrai || test) broadcast(); } catch (e) { console.error('Erreur pendant le jeu :', e); }
}, 40);
// Rafraîchit aussi les vues chaque seconde (disponibilités, recharges, résultats affichés).
setInterval(() => broadcast(false), 1000);

http.listen(PORT, '0.0.0.0', () => {
  console.log('\n  🎲 Soirée jeux prête !\n');
  console.log(`  Téléphones (QR code sur l'écran) : ${JOIN_URL}`);
  console.log(`  Écran public : ${PUBLIC_URL}/ecran`);
  console.log(`  Admin        : ${PUBLIC_URL}/admin   (mot de passe : ${process.env.ADMIN_PASSWORD ? 'celui de ADMIN_PASSWORD' : ADMIN_PASSWORD})`);
  console.log(`  Orga         : ${PUBLIC_URL}/orga\n`);
  console.log(storage.remote ? '  Sauvegarde : fichier local + en ligne (Upstash)\n' : '  Sauvegarde : fichier local (data/soiree.json)\n');
});
