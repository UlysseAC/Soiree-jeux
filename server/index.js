// Serveur de la soirée : pages web + temps réel (Socket.IO).
import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { Soiree, restore } from './soiree.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.DATA_DIR || join(ROOT, 'data');
const FILE = join(DATA, 'soiree.json');
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'soiree';

// ---------- persistance ----------
mkdirSync(DATA, { recursive: true });
let saved = null;
if (existsSync(FILE)) {
  try { saved = JSON.parse(readFileSync(FILE, 'utf8')); } catch (e) { console.error('Sauvegarde illisible, on repart de zéro :', e.message); }
}
let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeFileSync(FILE + '.tmp', JSON.stringify(soiree.s));
    renameSync(FILE + '.tmp', FILE);
  }, 500);
}

// ---------- adresse pour les téléphones ----------
function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://${lanAddress()}:${PORT}`).replace(/\/$/, '');
const JOIN_URL = `${PUBLIC_URL}/jouer`;
const qr = await QRCode.toDataURL(JOIN_URL, { margin: 1, width: 360, color: { dark: '#17110c', light: '#f0e3c8' } });

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

// ---------- temps réel ----------
function viewFor(sock) {
  const d = sock.data;
  if (d.role === 'admin') return soiree.adminView();
  if (d.role === 'ecran') return { ...soiree.screenView(), joinUrl: JOIN_URL, qr };
  if (d.role === 'orga') return soiree.orgaView();
  return soiree.playerView(d.token);
}

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
    if (role === 'ecran') sock.join('ecran');
    cb({ ok: true });
    sock.emit('etat', viewFor(sock));
  });

  sock.on('rejoindre', (h = {}, cb = () => {}) => {
    const r = soiree.join(sock.data.token, h.name);
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
  sock.on('joueur', guard('joueur', a => soiree.player(sock.data.token, a)));
  sock.on('admin', guard('admin', a => soiree.admin(a)));
  sock.on('orga', guard('orga', a => soiree.orga(a)));
});

// Tick rapide : le « FEU ! » du face-à-face doit partir au bon moment.
setInterval(() => { if (soiree.tick()) broadcast(); }, 40);
// Rafraîchit aussi les vues chaque seconde (disponibilités, recharges, résultats affichés).
setInterval(() => broadcast(false), 1000);

http.listen(PORT, '0.0.0.0', () => {
  console.log('\n  🎲 Soirée jeux prête !\n');
  console.log(`  Téléphones (QR code sur l'écran) : ${JOIN_URL}`);
  console.log(`  Écran public : ${PUBLIC_URL}/ecran`);
  console.log(`  Admin        : ${PUBLIC_URL}/admin   (mot de passe : ${ADMIN_PASSWORD === 'soiree' ? 'soiree, change-le avec ADMIN_PASSWORD' : 'celui de ADMIN_PASSWORD'})`);
  console.log(`  Orga         : ${PUBLIC_URL}/orga\n`);
});
