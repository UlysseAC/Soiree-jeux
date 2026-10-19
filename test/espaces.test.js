// Plusieurs soirées sur un même site (espaces) : chacune isolée ; le site de base garde une seule soirée, comme avant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';
import { creerGestion } from '../server/espaces.js';
import { chiffrer, verifier } from '../server/espace.js';
import edition from '../server/edition.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => mkdtempSync(join(tmpdir(), 'espaces-'));
const sansEnLigne = {}; // pas d'Upstash dans les tests

test('mot de passe d\'un espace : chiffré, vérifié', () => {
  const c = chiffrer('secret123');
  assert.ok(!c.includes('secret123'));
  assert.equal(verifier('secret123', c), true);
  assert.equal(verifier('autre', c), false);
  assert.equal(verifier('secret123', ''), false);
});

test('gestion : espaces séparés, sauvegardés à part, retirés de la mémoire quand inactifs, rechargés ensuite', async () => {
  const dataDir = tmp();
  const G = await creerGestion({ dataDir, env: sansEnLigne, publicUrl: 'http://x', adminPassword: 'base', multi: true });
  assert.equal(G.creer({ code: 'Mariage Léa', motDePasse: 'abcdef' }).ok, false, 'code invalide');
  assert.equal(G.creer({ code: 'mariage-lea', nom: 'Mariage', motDePasse: 'abc' }).ok, false, 'mot de passe trop court');
  assert.equal(G.creer({ code: 'mariage-lea', nom: 'Mariage', motDePasse: 'abcdef' }).ok, true);
  assert.equal(G.creer({ code: 'anniv-tom', nom: 'Anniv', motDePasse: 'ghijkl' }).ok, true);
  assert.equal(G.creer({ code: 'anniv-tom', motDePasse: 'ghijkl' }).ok, false, 'déjà pris');
  assert.equal(await G.ouvrir('inconnu'), null);
  const [a, b] = await Promise.all([G.ouvrir('mariage-lea'), G.ouvrir('anniv-tom')]);
  assert.equal(await G.ouvrir('mariage-lea'), a, 'un seul chargement');
  assert.equal(a.motDePasse('abcdef'), true);
  assert.equal(a.motDePasse('ghijkl'), false, 'pas le mot de passe d\'un autre espace');
  assert.equal(G.defaut.motDePasse('base'), true);
  assert.equal(a.liens.joinUrl, 'http://x/s/mariage-lea/jouer');
  assert.equal(G.defaut.liens.joinUrl, 'http://x/jouer', 'le site de base garde ses adresses');
  a.soiree.join(undefined, 'Léa');
  b.soiree.join(undefined, 'Tom');
  G.defaut.soiree.join(undefined, 'Moi');
  const noms = e => Object.values(e.soiree.s.people).map(p => p.name);
  assert.deepEqual([noms(a), noms(b), noms(G.defaut)], [['Léa'], ['Tom'], ['Moi']], 'chacun sa soirée');
  // inactif depuis plus de 30 min : retiré de la mémoire (après sauvegarde), puis rechargé tel quel
  await G.menage(Date.now() + 31 * 60e3);
  assert.equal(G.ouverts.has('mariage-lea'), false);
  assert.equal(G.ouverts.has(''), true, 'l\'espace par défaut reste toujours');
  const a2 = await G.ouvrir('mariage-lea');
  assert.notEqual(a2, a);
  assert.deepEqual(noms(a2), ['Léa'], 'rechargé depuis sa sauvegarde');
  // le registre survit à un redémarrage
  await G.toutSauver();
  const G2 = await creerGestion({ dataDir, env: sansEnLigne, publicUrl: 'http://x', adminPassword: 'base', multi: true });
  assert.deepEqual(G2.liste().map(e => e.code).sort(), ['anniv-tom', 'mariage-lea']);
  assert.equal((await G2.ouvrir('anniv-tom')).motDePasse('ghijkl'), true);
});

test('site de base : aucun espace client possible', async () => {
  const G = await creerGestion({ dataDir: tmp(), env: sansEnLigne, publicUrl: 'http://x', adminPassword: 'base' });
  assert.equal(G.creer({ code: 'mariage-lea', motDePasse: 'abcdef' }).ok, false);
  assert.equal(await G.ouvrir('mariage-lea'), null);
  assert.equal(await G.ouvrir(''), G.defaut);
});

// ---------- le vrai serveur ----------
async function serveur(env) {
  const port = 4100 + Math.floor(Math.random() * 800);
  const p = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { PATH: process.env.PATH, PORT: String(port), DATA_DIR: tmp(), ADMIN_PASSWORD: 'base', PUBLIC_URL: `http://localhost:${port}`, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res, rej) => { p.stdout.on('data', d => String(d).includes('prête') && res()); p.on('exit', c => rej(new Error(`serveur arrêté (${c})`))); });
  const url = `http://localhost:${port}`;
  const socks = [];
  const appareil = async (hello) => {
    const s = io(url, { transports: ['websocket'] });
    socks.push(s);
    s.etats = [];
    s.on('etat', v => { s.etats.push(v); s.v = v; });
    s.em = (ev, d) => new Promise(r => s.emit(ev, d, r));
    await new Promise(r => s.on('connect', r));
    s.hello = hello ? await s.em('hello', hello) : null;
    for (let i = 0; i < 50 && s.hello?.ok && !s.v; i++) await attendre(20); // premier état reçu
    return s;
  };
  const fin = () => { for (const s of socks) s.close(); p.kill(); };
  return { url, appareil, fin };
}
const attendre = ms => new Promise(r => setTimeout(r, ms));

// (version commerciale : toujours plusieurs soirées, ce cas ne s'applique pas)
test('serveur, site de base : tout marche comme avant, pas d\'adresse /s/…', { skip: edition.espaces }, async () => {
  const S = await serveur({});
  try {
    const admin = await S.appareil({ role: 'admin', password: 'base' });
    assert.equal(admin.hello.ok, true);
    const tel = await S.appareil({ role: 'joueur' });
    assert.equal((await tel.em('rejoindre', { name: 'Léa' })).ok, true);
    await attendre(150);
    assert.deepEqual(admin.v.people.map(p => p.name), ['Léa']);
    assert.equal((await fetch(`${S.url}/s/mariage-lea/jouer`)).status, 404);
    assert.equal((await (await S.appareil()).em('super', { password: '' })).ok, false);
  } finally { S.fin(); }
});

test('serveur, plusieurs soirées : chaque espace ne voit et ne reçoit que sa soirée', async () => {
  const S = await serveur({ ESPACES: '1', SUPER_ADMIN_PASSWORD: 'super!' });
  try {
    const sup = await S.appareil();
    assert.equal((await sup.em('super', { password: 'mauvais' })).ok, false);
    assert.equal((await sup.em('super', { password: 'super!', cmd: 'creer', code: 'mariage-lea', nom: 'Mariage', motDePasse: 'motdepasseA' })).ok, true);
    assert.equal((await sup.em('super', { password: 'super!', cmd: 'creer', code: 'anniv-tom', nom: 'Anniv', motDePasse: 'motdepasseB' })).ok, true);
    assert.equal((await fetch(`${S.url}/s/mariage-lea/jouer`)).status, 200);

    assert.equal((await S.appareil({ role: 'admin', password: 'motdepasseB', espace: 'mariage-lea' })).hello.ok, false, 'mot de passe d\'un autre espace');
    assert.equal((await S.appareil({ role: 'joueur', espace: 'inconnu' })).hello.ok, false, 'espace inconnu');
    const adminA = await S.appareil({ role: 'admin', password: 'motdepasseA', espace: 'mariage-lea' });
    const adminB = await S.appareil({ role: 'admin', password: 'motdepasseB', espace: 'anniv-tom' });
    const adminBase = await S.appareil({ role: 'admin', password: 'base' });
    const ecranB = await S.appareil({ role: 'ecran', espace: 'anniv-tom' });
    assert.ok([adminA, adminB, adminBase].every(a => a.hello.ok));
    assert.equal(ecranB.v.joinUrl, `${S.url}/s/anniv-tom/jouer`, 'le QR code mène à la soirée du client');

    const telA = await S.appareil({ role: 'joueur', espace: 'mariage-lea' });
    await telA.em('rejoindre', { name: 'Léa' });
    const telB = await S.appareil({ role: 'joueur', espace: 'anniv-tom' });
    await telB.em('rejoindre', { name: 'Léa' });
    await attendre(200);
    const vusEcranB = ecranB.etats.length;
    const telA2 = await S.appareil({ role: 'joueur', espace: 'mariage-lea' });
    assert.equal((await telA2.em('rejoindre', { name: 'Hugo' })).ok, true);
    await attendre(200);
    assert.deepEqual(adminA.v.people.map(p => p.name), ['Hugo', 'Léa']);
    assert.deepEqual(adminB.v.people.map(p => p.name), ['Léa'], 'même prénom possible dans deux soirées différentes');
    assert.deepEqual(adminBase.v.people, [], 'le site de base ne voit rien');
    assert.equal(ecranB.etats.length, vusEcranB, 'rien n\'est envoyé à l\'écran d\'une autre soirée');

    // l'admin d'un espace ne pilote que sa soirée
    await adminA.em('admin', { type: 'choisirJeu', gameId: 'minijeux' });
    await attendre(150);
    assert.equal(adminA.v.gameId, 'minijeux');
    assert.notEqual(adminB.v.gameId, 'minijeux');

    const liste = await sup.em('super', { password: 'super!' });
    assert.deepEqual(liste.espaces.map(e => [e.code, e.appareils]).sort(), [['anniv-tom', 3], ['mariage-lea', 3]]);
  } finally { S.fin(); }
});

test('jeux achetés : un client ne voit et ne lance que ses jeux ; on peut lui en ajouter', async () => {
  const G = await creerGestion({ dataDir: tmp(), env: sansEnLigne, publicUrl: 'http://x', adminPassword: 'base', multi: true });
  assert.equal(G.creer({ code: 'anniv-tom', motDePasse: 'abcdef', jeux: [] }).ok, false, 'au moins un jeu');
  assert.equal(G.creer({ code: 'anniv-tom', motDePasse: 'abcdef', jeux: ['minijeux', 'inconnu'] }).ok, true);
  const e = await G.ouvrir('anniv-tom');
  assert.deepEqual(e.soiree.jeux, ['minijeux']);
  assert.equal(e.soiree.sess.gameId, 'minijeux', 'la soirée se place sur un jeu acheté');
  assert.deepEqual(e.soiree.common().games.map(g => g.id), ['minijeux']);
  assert.deepEqual(e.soiree.s.config.programme, ['minijeux']);
  assert.equal(e.soiree.admin({ type: 'choisirJeu', gameId: 'chemin' }).ok, false);
  e.soiree.admin({ type: 'programme', ids: ['chemin', 'minijeux'] });
  assert.deepEqual(e.soiree.s.config.programme, ['minijeux']);
  assert.equal(e.simulation({ cmd: 'start', games: ['chemin'] }).ok, false, 'pas de simulation d\'un jeu non acheté');
  // le client achète Le Chemin en plus
  assert.equal(G.modifier({ code: 'anniv-tom', jeux: ['chemin', 'minijeux'] }).ok, true);
  assert.deepEqual(e.soiree.common().games.map(g => g.id), ['chemin', 'minijeux']);
  assert.equal(e.soiree.admin({ type: 'choisirJeu', gameId: 'chemin' }).ok, true);
  assert.deepEqual(G.liste()[0].jeux, ['chemin', 'minijeux']);
  G.creer({ code: 'resa', motDePasse: 'abcdef', source: '2026-10-19T10:00:00.000Z' });
  assert.equal(G.liste().find(x => x.code === 'resa').source, '2026-10-19T10:00:00.000Z', 'l\'espace garde sa demande de réservation');
  // par défaut (site de base, espace créé sans choix) : tous les jeux
  assert.deepEqual(G.defaut.soiree.jeux, ['chemin', 'duel', 'grandpari', 'minijeux', 'enquete']);
  G.creer({ code: 'tout', motDePasse: 'abcdef' });
  assert.deepEqual((await G.ouvrir('tout')).soiree.jeux, ['chemin', 'duel', 'grandpari', 'minijeux', 'enquete']);
});
