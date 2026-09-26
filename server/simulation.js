// Simulation depuis l'admin : de faux joueurs jouent les jeux, à un rythme qu'on peut suivre sur l'écran public.
// Les réglages sont remis comme avant à la fin ; « Effacer la simulation » retire les faux joueurs et leurs points.

const PRENOMS = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé', 'Tom', 'Sarah', 'Nico', 'Jade', 'Yanis', 'Emma', 'Louis', 'Nora', 'Rose', 'Hamza', 'Lou', 'Ethan', 'Clara', 'Victor', 'Eva',
  'Mehdi', 'Alice', 'Camille', 'Enzo', 'Julie', 'Sami', 'Anaïs', 'Lucas', 'Noah', 'Paul', 'Léna', 'Gabin', 'Oscar', 'Mila', 'Jules', 'Iris', 'Nathan', 'Lola', 'Samuel', 'Romy',
  'Adam', 'Zoé', 'Théo', 'Manon', 'Rayan', 'Lina', 'Karim', 'Maëlys', 'Arthur', 'Charlotte', 'Axel', 'Nina', 'Liam', 'Jeanne', 'Sacha', 'Léon', 'Agathe', 'Marius', 'Ambre', 'Hugo B.'];
const ARMES = { pistolet: '9301', fumigene: '9302', menottes: '9303', loupe: '9304', gilet: '9305', voyance: '9306' };
const codeOf = (T, label) => (label === 15 ? '9999' : `9${T === 'A' ? 1 : 2}${String(label).padStart(2, '0')}`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const pick = a => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);
const clone = o => JSON.parse(JSON.stringify(o));

export class Simulation {
  constructor(soiree, broadcast) {
    this.so = soiree;
    this.broadcast = broadcast;
    this.running = false;
    this.step = '';
    this.bots = [];
    this.backup = null;
  }

  status() {
    return { running: this.running, step: this.step, bots: this.bots.length, canErase: !!this.backup && !this.running };
  }

  admin(a) {
    const r = this.so.admin(a);
    this.broadcast();
    return r;
  }
  cfg(path, value) { return this.admin({ type: 'config', path, value }); }
  act(bot, a) {
    try { this.so.player(bot.token, a); } catch (e) { console.error('Simulation :', e); }
    this.broadcast();
  }
  view(bot) { return this.so.playerView(bot.token).game; }

  handle(a) {
    if (a.cmd === 'start') {
      if (this.running) return { ok: false, msg: 'Une simulation est déjà en cours.' };
      if (this.so.sess.status === 'playing') return { ok: false, msg: 'Une vraie partie est en cours : arrête-la d\'abord.' };
      const n = Math.max(4, Math.min(60, Number(a.n) || 50));
      const games = (a.games?.length ? a.games : ['chemin', 'grandpari', 'duel']).filter(g => ['chemin', 'grandpari', 'duel'].includes(g));
      this.run(n, games).catch(e => { console.error('Simulation :', e); this.step = 'Erreur : ' + e.message; this.finish(); });
      return { ok: true, msg: `Simulation lancée avec ${n} faux joueurs. Regarde l'écran public !` };
    }
    if (a.cmd === 'stop') {
      if (!this.running) return { ok: false, msg: 'Pas de simulation en cours.' };
      this.running = false;
      return { ok: true, msg: 'Simulation arrêtée.' };
    }
    if (a.cmd === 'effacer') {
      if (this.running) return { ok: false, msg: 'Arrête d\'abord la simulation.' };
      this.erase();
      return { ok: true, msg: 'Faux joueurs et points de la simulation effacés.' };
    }
    return { ok: false, msg: 'Commande inconnue.' };
  }

  async run(n, games) {
    const s = this.so.s;
    this.running = true;
    this.backup = this.backup ?? { config: clone(s.config), history: clone(s.history), bonus: clone(s.bonus), show: s.show };
    this.admin({ type: 'afficherClassement', mode: null });
    // Faux joueurs
    this.bots = [];
    for (let i = 0; i < n; i++) {
      let name = PRENOMS[i] ?? `Joueur ${i + 1}`;
      let r = this.so.join(undefined, name);
      if (!r.ok) r = this.so.join(undefined, `${name} ${i + 1}`);
      if (!r.ok) continue;
      s.people[r.pid].bot = true;
      this.bots.push({ pid: r.pid, token: r.token, name: s.people[r.pid].name });
    }
    this.broadcast();
    for (const g of games) {
      if (!this.running) break;
      await this.game(g);
    }
    if (this.running) {
      this.step = 'Grand final';
      this.admin({ type: 'afficherClassement', mode: 'final' });
      await this.wait(30000);
    }
    this.finish();
  }

  finish() {
    if (this.so.sess.status === 'playing') this.admin({ type: 'arreter' });
    this.so.s.config = this.backup ? clone(this.backup.config) : this.so.s.config;
    this.running = false;
    this.step = this.step.startsWith('Erreur') ? this.step : 'Terminée';
    this.broadcast();
  }

  erase() {
    const s = this.so.s;
    const bots = new Set(Object.values(s.people).filter(p => p.bot).map(p => p.id));
    if (this.so.sess.game || this.so.sess.registered.some(p => bots.has(p))) this.admin({ type: 'reinitialiser' });
    for (const id of bots) delete s.people[id];
    if (this.backup) { s.history = this.backup.history; s.bonus = this.backup.bonus; s.show = this.backup.show; }
    this.backup = null;
    this.bots = [];
    this.step = '';
    this.broadcast();
  }

  // Attend en laissant tourner le jeu ; s'arrête si la simulation est stoppée.
  async wait(ms, until = () => false) {
    const end = Date.now() + ms;
    while (this.running && Date.now() < end && !until()) await sleep(500);
  }

  // Chaque faux joueur agit à son rythme pendant que la partie tourne.
  async play(turn) {
    const loops = this.bots.map(async b => {
      await sleep(rnd(0, 3000));
      while (this.running && this.so.sess.status === 'playing') {
        const g = this.view(b);
        if (g && !g.spectator) await turn(b, g);
        await sleep(rnd(1500, 4000));
      }
    });
    await Promise.all(loops);
  }

  async game(id) {
    const names = { chemin: 'Le Chemin', grandpari: 'Le Grand Pari', duel: 'Duel au Far West' };
    this.step = `${names[id]} : inscriptions`;
    this.admin({ type: 'choisirJeu', gameId: id });
    await this.setup(id);
    // Décompte court : on voit le QR code et la liste des inscrits se remplir.
    this.cfg('decompte', 75); this.cfg('inscriptions', 70);
    this.admin({ type: 'demarrer' });
    const skip = new Set(id === 'chemin' ? this.bots.slice(-3) : id === 'grandpari' ? this.bots.slice(0, 2) : []);
    let num = 10;
    for (const b of this.bots) {
      if (!this.running) return;
      if (skip.has(b)) continue;
      await sleep(rnd(300, 1100));
      this.act(b, { type: 'inscription', on: true });
      if (id === 'duel') this.admin({ type: 'dossard', pid: b.pid, value: String(num++) });
    }
    await this.wait(90000, () => this.so.sess.status === 'playing');
    this.step = `${names[id]} : partie en cours`;
    const adminLoop = (async () => {
      while (this.running && this.so.sess.status === 'playing') { this.drive(id); await sleep(1000); }
    })();
    await this.play((b, g) => this.turn(id, b, g));
    await adminLoop;
    // On laisse la victoire puis le classement s'afficher.
    this.step = `${names[id]} : terminé`;
    await this.wait(45000);
  }

  async setup(id) {
    const c = (p, v) => this.cfg(p, v);
    if (id === 'chemin') {
      for (const T of ['A', 'B']) for (let i = 0; i < 14; i++) { c(`teams.${T}.steps.${i}.code`, codeOf(T, i + 1)); c(`teams.${T}.steps.${i}.indice`, `Indice de l'étape ${i + 1} (simulation)`); }
      c('final.code', '9999'); c('final.indice', 'Dernière étape (simulation)');
      for (const [k, v] of Object.entries(ARMES)) c(`armes.${k}.code`, v);
      for (let i = 0; i < 5; i++) { c(`cles.A.${i}.code`, `951${i}`); c(`cles.B.${i}.code`, `952${i}`); }
      c('bandage.code', '9401'); c('antiFumigene.code', '9402');
      c('armes.pistolet.duree', 20); c('armes.fumigene.duree', 12); c('immunite', 15); c('dureeMax', 480);
    }
    if (id === 'duel') {
      c('delaiMin', 2); c('delaiMax', 5); c('tempsTir', 12); c('pauseFaceAFace', 12);
      for (let i = 0; i < 8; i++) { c(`pauses.${i}`, 12); c(`dureesTours.${i}`, 60); }
    }
    if (id === 'grandpari') { c('intervalle', 900); c('resultats', 12); c('fermeture', 15); }
  }

  // Actions de l'« admin » pendant la partie.
  drive(id) {
    const g = this.so.sess.game;
    if (id === 'duel' && g?.phase === 'prep') this.admin({ type: 'jeu', action: { type: 'lancer' } });
    // Grand Pari : 50 s de paris et d'investissements entre deux sports, puis on lance.
    if (id === 'grandpari' && g) {
      if (g.phase !== 'entre') this.entreAt = null;
      else if (!this.entreAt) this.entreAt = Date.now();
      else if (Date.now() - this.entreAt > 50000 && !g.oddsPending) { this.entreAt = null; this.admin({ type: 'jeu', action: { type: 'lancerSport' } }); }
    }
  }

  async turn(id, b, g) {
    if (g.finished) return;
    if (id === 'chemin') {
      if (g.block) {
        const codes = g.block.type === 'menottes' ? [0, 1, 2, 3, 4].map(i => `95${g.team === 'A' ? 1 : 2}${i}`) : [g.block.type === 'pistolet' ? '9401' : '9402'];
        if (Math.random() < .25) this.act(b, { type: 'antidote', value: pick(codes) });
        return;
      }
      const r = g.random;
      if (r?.stage === 'hint' && Math.random() < .35) this.act(b, { type: 'code', value: codeOf(g.team, r.step) });
      if (r && (r.stage === 'waiting' || r.stage === 'number') && Math.random() < .4) {
        const me = this.so.adminView().game?.teams[g.team].chain.find(c => c.pid === b.pid && c.state === 'attend son numéro');
        if (me) this.act(b, { type: 'numero', value: me.numero });
      }
      if (g.detective) {
        const have = new Set(g.detective.inv.map(w => w.id));
        for (const [k, v] of Object.entries(ARMES)) if (!have.has(k) && Math.random() < .08) this.act(b, { type: 'arme', value: v });
        const ready = g.detective.inv.filter(w => !w.passive && !w.cd && !w.used);
        if (ready.length && Math.random() < .15) {
          const w = pick(ready), t = pick(g.detective.targets.filter(x => !x.off));
          if (t || !w.target) this.act(b, { type: 'attaque', arme: w.id, target: t?.id });
        }
      }
      return;
    }
    if (id === 'duel') {
      const d = g.duel;
      if (d?.kind === 'num') {
        await sleep(rnd(1500, 5000));
        const live = this.so.adminView().game?.liveDuels.find(x => x.id === d.id);
        const opp = live && (live.a.pid === b.pid ? live.b : live.a);
        if (opp && !live.winner) this.act(b, { type: 'tir', value: Math.random() < .8 ? opp.num : '1' });
      }
      if (d?.kind === 'face') {
        // réaction après « FEU ! » (et parfois un tir trop tôt)
        for (let k = 0; k < 40 && this.running; k++) {
          const cur = this.view(b)?.duel;
          if (!cur || cur.id !== d.id) break;
          if (cur.status === 'fire') { await sleep(rnd(180, 650)); this.act(b, { type: 'gachette', t: Date.now() }); break; }
          if (Math.random() < .004) { this.act(b, { type: 'gachette', t: Date.now() }); break; }
          await sleep(100);
        }
      }
      if (g.bet && !g.bet.placed && g.bet.targets.length && Math.random() < .5) {
        const t = [...g.bet.targets].sort(() => Math.random() - .5).slice(0, 1 + Math.floor(Math.random() * 3));
        this.act(b, { type: 'pari', alloc: Object.fromEntries(t.map((x, i) => [x.pid, i ? 100 : 300 - 100 * (t.length - 1)])) });
      }
      return;
    }
    // Grand Pari
    b.bets = b.bets || {};
    if (g.open && (b.bets[g.k] || 0) < 2 && Math.random() < .3) {
      b.bets[g.k] = (b.bets[g.k] || 0) + 1;
      const o = g.options, mise = 50 * (1 + Math.floor(Math.random() * 5));
      if (g.sport.id === 'chevaux') this.act(b, { type: 'pari', bet: 'cheval', sel: Math.floor(Math.random() * 8), mise });
      else if (g.sport.id === 'foot') {
        const kind = pick(['vainqueur', 'vainqueur', 'nul', 'buteur', 'buts']);
        const sel = kind === 'vainqueur' ? pick([0, 1]) : kind === 'buteur' ? `${pick([0, 1])}:${pick([3, 4, 4, 2])}` : kind === 'buts' ? pick([1, 2, 3, 4]) : null;
        this.act(b, { type: 'pari', bet: kind, sel, mise });
      } else this.act(b, { type: 'pari', bet: 'boxeur', sel: Math.floor(Math.random() * o.boxeurs.length), mise });
    }
    const it = g.block && !g.block.settled && g.phase === 'entre' ? pick(g.block.items) : null;
    if (it && !it.mine && Math.random() < .2) this.act(b, { type: 'investir', item: it.id, mise: 100 + 50 * Math.floor(Math.random() * 4) });
  }
}
