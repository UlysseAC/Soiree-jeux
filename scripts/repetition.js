// Répétition générale : lance le serveur et joue une soirée complète avec de faux joueurs.
// Usage : npm run repetition            (20 joueurs)
//         npm run repetition -- 35      (35 joueurs)
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const N = Number(process.argv[2]) || 20;
const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRENOMS = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé', 'Tom', 'Sarah', 'Nico', 'Jade', 'Yanis', 'Emma', 'Louis', 'Nora', 'Rose', 'Hamza', 'Lou', 'Ethan', 'Clara', 'Victor', 'Eva',
  'Mehdi', 'Alice', 'Camille', 'Enzo', 'Julie', 'Sami', 'Anaïs', 'Lucas', 'Noah', 'Paul', 'Léna', 'Gabin', 'Oscar', 'Mila', 'Jules', 'Iris', 'Nathan', 'Lola', 'Samuel', 'Romy',
  'Adam', 'Zoé', 'Théo', 'Manon', 'Rayan', 'Lina', 'Karim', 'Maëlys', 'Arthur', 'Charlotte'];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const pick = a => a[Math.floor(Math.random() * a.length)];
const stats = { actions: 0, refus: 0, erreurs: [], jeux: [] };
const log = (...a) => console.log(`[${new Date().toLocaleTimeString('fr-FR')}]`, ...a);

// ---------- serveur ----------
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), DATA_DIR: mkdtempSync(join(tmpdir(), 'soiree-')), ADMIN_PASSWORD: 'repetition' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', d => { const t = String(d).trim(); if (t) stats.erreurs.push(`serveur : ${t.split('\n')[0]}`); });
await new Promise(r => server.stdout.on('data', d => { if (String(d).includes('prête')) r(); }));

function client(hello) {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { s, view: null };
  s.on('etat', v => { c.view = v; });
  c.emit = (ev, payload) => new Promise(res => s.timeout(8000).emit(ev, payload, (e, r) => {
    if (e) { stats.erreurs.push(`${ev} : pas de réponse`); return res({ ok: false }); }
    stats.actions++;
    if (r && r.ok === false) stats.refus++;
    if (r?.msg === 'Erreur interne.') stats.erreurs.push(`${ev} ${JSON.stringify(payload)} : erreur interne`);
    res(r);
  }));
  c.ready = new Promise(res => s.on('connect', async () => { await c.emit('hello', hello); res(); }));
  return c;
}

const admin = client({ role: 'admin', password: 'repetition' });
const ecran = client({ role: 'ecran' });
await Promise.all([admin.ready, ecran.ready]);
const A = a => admin.emit('admin', a);
const J = a => A({ type: 'jeu', action: a });
const cfg = (path, value) => A({ type: 'config', path, value });

// ---------- faux joueurs ----------
const bots = [];
for (let i = 0; i < N; i++) {
  const b = client({ role: 'joueur' });
  await b.ready;
  const r = await b.emit('rejoindre', { name: PRENOMS[i] ?? `Joueur ${i}` });
  await b.emit('hello', { role: 'joueur', token: r.token });
  b.name = PRENOMS[i];
  b.token = r.token;
  bots.push(b);
}
log(`${N} faux joueurs connectés`);

async function waitFor(cond, ms, label) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await sleep(250); }
  stats.erreurs.push(`délai dépassé : ${label}`);
  return false;
}

async function runGame(gameId, setup, botTurn, adminTurn, maxMs) {
  const t0 = Date.now();
  await A({ type: 'choisirJeu', gameId });
  await setup();
  await A({ type: 'inscriptions', value: 'open' });
  await waitFor(() => admin.view?.inscriptionsOpen, 3000, 'ouverture des inscriptions');
  // Quelques joueurs ratent un jeu, comme dans une vraie soirée.
  const skip = new Set(gameId === 'chemin' ? bots.slice(-2) : gameId === 'grandpari' ? bots.slice(0, 1) : []);
  for (const b of bots) if (!skip.has(b)) await b.emit('joueur', { type: 'inscription', on: true });
  const r = await A({ type: 'lancerJeu' });
  if (!r.ok) { stats.erreurs.push(`${gameId} : ${r.msg}`); return; }
  log(`${gameId} : partie lancée avec ${N - skip.size} joueurs`);
  let running = true;
  const loops = bots.map(async b => { while (running) { await sleep(300 + Math.random() * 700); if (b.view?.game && !b.view.game.spectator) await botTurn(b, b.view.game).catch(e => stats.erreurs.push(`${gameId} bot : ${e.message}`)); } });
  const ok = await waitFor(() => { adminTurn?.(); return admin.view?.status === 'finished'; }, maxMs, `fin de ${gameId}`);
  running = false;
  await Promise.all(loops);
  stats.jeux.push({ gameId, ok, duree: Math.round((Date.now() - t0) / 1000) });
  log(`${gameId} : ${ok ? 'terminé' : 'NON terminé'} en ${Math.round((Date.now() - t0) / 1000)} s`);
}

// ---------- Jeu 1 : Le Chemin ----------
const codeOf = (T, label) => (label === 15 ? '999' : `${T === 'A' ? 1 : 2}${String(label).padStart(2, '0')}`);
await runGame('chemin', async () => {
  for (const T of ['A', 'B']) for (let i = 0; i < 14; i++) await cfg(`teams.${T}.steps.${i}.code`, codeOf(T, i + 1));
  await cfg('final.code', '999');
  const armes = { pistolet: '301', fumigene: '302', menottes: '303', loupe: '304', gilet: '305', voyance: '306' };
  for (const [k, v] of Object.entries(armes)) await cfg(`armes.${k}.code`, v);
  for (const [k, v] of [['pistolet', 6], ['fumigene', 4], ['gilet', 4]]) await cfg(`armes.${k}.duree`, v);
  for (const k of ['pistolet', 'fumigene', 'loupe', 'gilet']) await cfg(`armes.${k}.recharge`, 5);
  for (let i = 0; i < 5; i++) { await cfg(`cles.A.${i}.code`, `50${i}`); await cfg(`cles.B.${i}.code`, `60${i}`); }
  await cfg('bandage.code', '401'); await cfg('antiFumigene.code', '402');
  await cfg('immunite', 3); await cfg('dureeMax', 300);
}, async (b, g) => {
  if (g.finished) return;
  if (g.block) {
    const codes = g.block.type === 'menottes' ? [0, 1, 2, 3, 4].map(i => `${g.team === 'A' ? 5 : 6}0${i}`) : [g.block.type === 'pistolet' ? '401' : '402'];
    if (Math.random() < .3) await b.emit('joueur', { type: 'antidote', value: pick(codes) });
    return;
  }
  const r = g.random;
  if (r?.stage === 'hint' && Math.random() < .5) await b.emit('joueur', { type: 'code', value: codeOf(g.team, r.step) });
  if ((r?.stage === 'waiting' || r?.stage === 'number') && Math.random() < .5) {
    const me = admin.view?.game?.teams[g.team].chain.find(c => c.name === b.name && c.state === 'attend son numéro');
    if (me) await b.emit('joueur', { type: 'numero', value: me.numero });
  }
  if (g.detective) {
    const have = new Set(g.detective.inv.map(w => w.id));
    for (const [k, v] of Object.entries({ pistolet: '301', fumigene: '302', menottes: '303', loupe: '304', gilet: '305', voyance: '306' })) if (!have.has(k) && Math.random() < .2) await b.emit('joueur', { type: 'arme', value: v });
    const ready = g.detective.inv.filter(w => !w.passive && !w.cd && !w.used);
    if (ready.length && Math.random() < .25) {
      const w = pick(ready);
      const t = pick(g.detective.targets.filter(x => !x.off));
      await b.emit('joueur', { type: 'attaque', arme: w.id, target: t?.id });
    }
  }
}, null, 6 * 60e3);

// ---------- Jeu 3 : Le Grand Pari (joué en 2e, comme prévu à la soirée) ----------
let lastLaunch = 0;
await runGame('grandpari', async () => {
  for (const [k, v] of [['intervalle', 900], ['fermeture', 3], ['resultats', 3], ['chevaux.duree', 15], ['foot.duree', 30], ['boxe.duree', 25]]) await cfg(k, v);
}, async (b, g) => {
  if (g.finished) return;
  b.bets = b.bets || {};
  if (g.open && !b.bets[g.k] && Math.random() < .5) {
    b.bets[g.k] = true;
    const o = g.options, mise = 50 + Math.floor(Math.random() * 5) * 50;
    if (g.sport.id === 'chevaux') await b.emit('joueur', { type: 'pari', bet: 'cheval', sel: Math.floor(Math.random() * 8), mise });
    else if (g.sport.id === 'foot') {
      const kind = pick(['vainqueur', 'nul', 'buteur', 'buts']);
      const sel = kind === 'vainqueur' ? pick([0, 1]) : kind === 'buteur' ? `${pick([0, 1])}:${pick([1, 2, 3, 4])}` : kind === 'buts' ? pick([0, 1, 2, 3, 4]) : null;
      await b.emit('joueur', { type: 'pari', bet: kind, sel, mise });
    } else await b.emit('joueur', { type: 'pari', bet: 'boxeur', sel: Math.floor(Math.random() * o.boxeurs.length), mise });
  }
  const it = g.block && !g.block.settled && g.phase === 'entre' ? pick(g.block.items) : null;
  if (it && !it.mine && Math.random() < .3) await b.emit('joueur', { type: 'investir', item: it.id, mise: 100 + Math.floor(Math.random() * 3) * 50 });
}, () => {
  const g = admin.view?.game;
  if (g?.phase === 'entre' && !g.oddsPending && Date.now() - lastLaunch > 12000) { lastLaunch = Date.now(); J({ type: 'lancerSport' }); }
}, 8 * 60e3);

// ---------- Jeu 2 : Duel au Far West (dernier jeu) ----------
await runGame('duel', async () => {
  for (const [k, v] of [['tempsTir', 8], ['delaiMin', 1], ['delaiMax', 2], ['pauseFaceAFace', 2], ['pasMin', 1], ['pasMax', 2]]) await cfg(k, v);
  for (let i = 0; i < 8; i++) { await cfg(`pauses.${i}`, 2); await cfg(`dureesTours.${i}`, 40); }
}, async (b, g) => {
  if (g.finished) return;
  const d = g.duel;
  if (d?.kind === 'num' && Math.random() < .5) {
    const live = admin.view?.game?.liveDuels.find(x => x.id === d.id);
    const opp = live && (live.a.name === b.name ? live.b : live.a);
    if (opp) await b.emit('joueur', { type: 'tir', value: Math.random() < .8 ? opp.num : '1' });
  }
  if (d?.kind === 'face') {
    if (d.status === 'fire' && !b.shot) { b.shot = true; await sleep(150 + Math.random() * 500); await b.emit('joueur', { type: 'gachette', t: Date.now() }); }
    if (d.status === 'steps') { b.shot = false; if (Math.random() < .03) await b.emit('joueur', { type: 'gachette', t: Date.now() }); }
  }
  if (g.bet && !g.bet.placed && g.bet.targets.length && Math.random() < .5) {
    const t = [...g.bet.targets].sort(() => Math.random() - .5).slice(0, 3);
    await b.emit('joueur', { type: 'pari', alloc: Object.fromEntries(t.map(x => [x.pid, 100])) });
  }
}, () => {
  const g = admin.view?.game;
  if (g?.phase === 'prep' && !g.numsDone) {
    g.numsDone = true;
    (async () => { let n = 10; for (const p of g.players) await J({ type: 'num', pid: p.pid, value: String(n++) }); await J({ type: 'lancer' }); })();
  }
}, 8 * 60e3);

// ---------- Classement ----------
await A({ type: 'afficherClassement', mode: 'final' });
await sleep(500);
const c = admin.view.classement;
log('Classement de la soirée :');
for (const r of c.rows.slice(0, 5)) log(`  ${r.rank}. ${r.name} · ${r.total} pts ${r.mult > 1 ? `(×${r.mult})` : ''}`);
const withBonus = c.rows.filter(r => r.mult > 1).length;

console.log('\n==== Bilan ====');
console.log(`Jeux : ${stats.jeux.map(j => `${j.gameId} ${j.ok ? '✓' : '✗'} (${j.duree} s)`).join(' · ')}`);
console.log(`Actions envoyées : ${stats.actions} (refusées par les règles : ${stats.refus})`);
console.log(`Classement : ${c.rows.length} joueurs, ${withBonus} avec bonus jeu raté, écran : ${ecran.view?.show}`);
console.log(stats.erreurs.length ? `ERREURS (${stats.erreurs.length}) :\n  ${[...new Set(stats.erreurs)].slice(0, 20).join('\n  ')}` : 'Aucune erreur.');
server.kill();
process.exit(stats.erreurs.length || stats.jeux.some(j => !j.ok) ? 1 : 0);
