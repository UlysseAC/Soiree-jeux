// Simulation depuis l'admin : de faux joueurs jouent les jeux, à un rythme qu'on peut suivre sur l'écran public.
// Les réglages sont remis comme avant à la fin ; « Effacer la simulation » retire les faux joueurs et leurs points.
import { shuffle, normName } from './util.js';

const PRENOMS = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé', 'Tom', 'Sarah', 'Nico', 'Jade', 'Yanis', 'Emma', 'Louis', 'Nora', 'Rose', 'Hamza', 'Lou', 'Ethan', 'Clara', 'Victor', 'Eva',
  'Mehdi', 'Alice', 'Camille', 'Enzo', 'Julie', 'Sami', 'Anaïs', 'Lucas', 'Noah', 'Paul', 'Léna', 'Gabin', 'Oscar', 'Mila', 'Jules', 'Iris', 'Nathan', 'Lola', 'Samuel', 'Romy',
  'Adam', 'Zoé', 'Théo', 'Manon', 'Rayan', 'Lina', 'Karim', 'Maëlys', 'Arthur', 'Charlotte', 'Axel', 'Nina', 'Liam', 'Jeanne', 'Sacha', 'Léon', 'Agathe', 'Marius', 'Ambre', 'Hugo B.'];
const ARMES = { pistolet: '9301', fumigene: '9302', menottes: '9303', loupe: '9304', gilet: '9305', voyance: '9306' };
const codeOf = (T, label) => (label === 15 ? '9999' : `9${T === 'A' ? 1 : 2}${String(label).padStart(2, '0')}`);

// Tests des mini-jeux : nombre de faux joueurs et réglages courts (quelques minutes au total).
const MINI_NOMS = { definition: 'La Définition', anecdote: "L'Anecdote", temple: 'Le Temple aztèque', mime: 'Le Mime', dragon: 'La Chasse au dragon', disparu: "Qu'est-ce qui a changé ?", quiz: 'Le Quiz' };
const MINI_TESTS = {
  definition: { n: 6, reglages: { mots: 'Florpidoux\nGramouille\nZétrabule\nPinchaflor\nBrouscaille\nTirlipote', manches: 1, tempsOral: 40, tempsVote: 25, tempsRevelation: 8 } },
  anecdote: { n: 6, reglages: { manches: 1, tempsEcriture: 25, tempsVote: 25, tempsRevelation: 8 } },
  temple: { n: 5, reglages: { etapes: 3, tempsChoix: 12, tempsPiege: 5, cheminsEtapes: '2:1,3:1,4:2' } },
  mime: { n: 4, reglages: { tempsMime: 15, tempsPret: 3 } },
  dragon: { n: 4, reglages: { attaqueMin: 8, attaqueMax: 10, dureeTir: 90, pvDragon: 6 } },
  quiz: { n: 5, reglages: { tempsQuestion: 8, tempsRevelation: 4, questions: [1, 2, 3].map(k => `Question de test ${k} ?\nRéponse A\n*Réponse B\nRéponse C\nRéponse D`).join('\n\n') } },
  disparu: { n: 5, reglages: { manchesMemo: 2, objetsDepart: 4, objetsPlus: 1, tempsMemo: 6, tempsReponse: 12, melangeDes: 2 } },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const pick = a => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);
const clone = o => JSON.parse(JSON.stringify(o));

export class Simulation {
  // bacASable() crée une soirée séparée, jamais sauvegardée : la simulation y tourne quand une vraie partie est en cours.
  constructor(soiree, broadcast, bacASable = null) {
    this.reel = soiree;
    this.so = soiree;
    this.bacASable = bacASable;
    this.aPart = false;
    this.broadcast = broadcast;
    this.running = false;
    this.step = '';
    this.bots = [];
    // Serveur redémarré pendant (ou après) une simulation : on remet les vrais réglages et on efface les faux joueurs.
    if (this.backup) {
      soiree.s.config = clone(this.backup.config);
      this.erase();
      console.log('  Simulation interrompue : vrais réglages remis, faux joueurs effacés.');
    }
  }

  // Copie des vrais réglages gardée dans la sauvegarde : un redémarrage en pleine simulation ne les perd pas.
  get backup() { return this.so.s.simBackup ?? null; }
  set backup(v) { if (v) this.so.s.simBackup = v; else delete this.so.s.simBackup; }

  status() {
    return { running: this.running, step: this.step, bots: this.bots.length, canErase: !!this.backup && !this.running && !this.aPart, aPart: this.aPart, tests: Object.entries(MINI_NOMS) };
  }
  // Soirée montrée sur l'écran de test (/ecran?test) : celle de la simulation à part, sinon la vraie.
  ecran() { return this.aPart ? this.so : this.reel; }
  tick() { return this.aPart ? this.so.tick() : false; }

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
      // Vraie partie en cours : la simulation tourne à part, sans toucher à la soirée ni à l'écran public.
      this.aPart = !!this.bacASable && (!!a.aPart || ['playing', 'countdown'].includes(this.reel.sess.status)); // aPart : lancé depuis un téléphone de test
      this.so = this.aPart ? this.bacASable() : this.reel;
      this.bots = [];
      // joueurs incarnés (test d'un mini-jeu seulement) : de vrais téléphones (/jouer?test) prennent la place de faux joueurs
      this.incarnes = String(a.games?.[0] || '').startsWith('mini:') ? Math.max(0, Math.min(10, Math.round(Number(a.moi)) || 0)) : 0;
      const ou = a.aPart ? 'Test indépendant de la soirée : suis-le sur l\'écran de test (adresse /ecran?test).' : this.aPart ? 'Une vraie partie est en cours : la simulation tourne à part. Ouvre l\'écran de test (adresse /ecran?test).' : 'Regarde l\'écran public !';
      if (String(a.games?.[0] || '').startsWith('mini:')) {
        const type = a.games[0].slice(5);
        if (!MINI_TESTS[type]) return { ok: false, msg: 'Mini-jeu inconnu.' };
        this.runMini(type).catch(e => { console.error('Simulation :', e); this.step = 'Erreur : ' + e.message; this.finish(); });
        const faux = Math.max(1, MINI_TESTS[type].n - this.incarnes), places = this.incarnes ? ` et ${this.incarnes} place${this.incarnes > 1 ? 's' : ''} à incarner (/jouer?test)` : '';
        return { ok: true, msg: `Test de « ${MINI_NOMS[type]} » lancé avec ${faux} faux joueurs${places}. ${ou}` };
      }
      const n = Math.max(4, Math.min(60, Number(a.n) || 50));
      const games = (a.games?.length ? a.games : ['chemin', 'grandpari', 'duel']).filter(g => ['chemin', 'grandpari', 'duel'].includes(g));
      this.run(n, games).catch(e => { console.error('Simulation :', e); this.step = 'Erreur : ' + e.message; this.finish(); });
      return { ok: true, msg: `Simulation lancée avec ${n} faux joueurs. ${ou}` };
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
  async play(turn, until = () => false) {
    const loops = this.bots.map(async b => {
      await sleep(rnd(0, 3000));
      while (this.running && this.so.sess.status === 'playing' && !until()) {
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
    this.admin({ type: 'config', scope: 'soiree', path: 'decompte', value: 75 });
    this.admin({ type: 'config', scope: 'soiree', path: 'inscriptions', value: 75 });
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

  // Test d'un mini-jeu : faux joueurs, un seul round du type choisi, réglages courts. Le vrai réglage est remis à la fin.
  async runMini(type) {
    this.debutAttente = Date.now();
    const s = this.so.s, T = MINI_TESTS[type];
    this.running = true;
    this.backup = this.backup ?? { config: clone(s.config), history: clone(s.history), bonus: clone(s.bonus), show: s.show };
    this.bots = [];
    const incarnes = Array.from({ length: this.incarnes }, (_, i) => `Incarné ${i + 1}`);
    for (let i = 0; i < Math.max(1, T.n - incarnes.length); i++) {
      let name = PRENOMS[i] ?? `Joueur ${i + 1}`;
      let r = this.so.join(undefined, name);
      if (!r.ok) r = this.so.join(undefined, `${name} ${i + 1}`);
      if (!r.ok) continue;
      s.people[r.pid].bot = true;
      this.bots.push({ pid: r.pid, token: r.token, name: s.people[r.pid].name });
    }
    this.broadcast();
    this.step = `${MINI_NOMS[type]} : inscriptions`;
    this.admin({ type: 'choisirJeu', gameId: 'minijeux' });
    const c = (path, value) => this.admin({ type: 'config', scope: 'jeu', path, value });
    c('joueurs', [...this.bots.map(b => b.name), ...incarnes].join('\n'));
    c('rounds', 1);
    c('premier', 60); // pas de tirage automatique : on annonce à la main quand les joueurs incarnés sont là
    c('programme', 'mj1');
    c('jeux.mj1.type', type);
    c('jeux.mj1.nom', MINI_NOMS[type]);
    c('jeux.mj1.joueurs', 0);
    c('inscriptions', 20); // inscription des spectateurs : 20 s dans un test
    for (const [k, v] of Object.entries(T.reglages)) c(`jeux.mj1.${k}`, v);
    this.admin({ type: 'lancerJeu' });
    // Chaque faux joueur prend son nom sur la liste, comme un vrai téléphone
    for (const b of this.bots) this.so.claimMini(b.token, b.name);
    this.broadcast();
    // on attend que chaque joueur incarné ait pris son nom « Incarné N » sur un téléphone de test (2 min au plus)
    const manquants = () => incarnes.filter(n => !this.so.sess.game?.claims?.[normName(n)]);
    while (this.running && manquants().length) {
      this.step = `En attente de ${manquants().length} joueur${manquants().length > 1 ? 's' : ''} incarné${manquants().length > 1 ? 's' : ''} : ouvre /jouer?test et prends « ${manquants()[0]} »`;
      this.broadcast();
      await this.wait(1000);
      if (Date.now() - this.debutAttente > 120000) break;
    }
    await sleep(500);
    this.admin({ type: 'jeu', action: { type: 'annoncer' } });
    this.step = `${MINI_NOMS[type]} : partie en cours`;
    const r = this.so.sess.game?.rounds?.[0];
    // « Incarné 1 » joue toujours : il prend la place d'un faux joueur tiré au sort
    if (incarnes.length && r?.joueurs && !r.joueurs.includes(incarnes[0])) {
      const bot = [...r.joueurs].reverse().find(n => this.bots.some(b => b.name === n));
      if (bot) {
        r.joueurs = r.joueurs.map(n => (n === bot ? incarnes[0] : n));
        r.equipes = r.equipes?.map(t => t.map(n => (n === bot ? incarnes[0] : n)));
        this.broadcast();
      }
    }
    const fini = () => r?.status === 'fini';
    // les faux joueurs jouent jusqu'à la fin du round, puis on attend la révélation
    await Promise.all([this.play((b, g) => this.miniTurn(type, b, g), fini), this.wait(240000, fini)]);
    await this.wait(20000, fini);
    this.step = `${MINI_NOMS[type]} : terminé`;
    await this.wait(12000);
    this.finish();
  }

  // Ce que fait un faux joueur à chaque tour. La triche (lire la bonne réponse côté serveur) ne sert qu'à tester l'affichage.
  miniTurn(type, b, g) {
    const now = Date.now(), e = g?.etat, m = g?.monTour;
    if (m?.status === 'annonce' && !m.compris?.includes(b.name)) return this.act(b, { type: 'compris' });
    if (!m && g?.actif?.status === 'annonce' && g.actif.inscrits && !g.inscrit) return this.act(b, { type: 'inscrire' }); // spectateur : s'inscrit pour deviner
    if (!e) return;
    const game = this.so.sess.game, round = game?.rounds?.find(x => x.status === 'jeu');
    const reponse = (a) => this.act(b, a);
    if (type === 'definition' || type === 'anecdote') {
      if (e.phase === 'ecriture' && e.monMot !== undefined && !e.maDef) return reponse({ type: 'ecrire', texte: `Une histoire inventée par ${b.name}` });
      if (e.phase === 'vote' && e.monMot === undefined && !e.mesLiens) {
        const perm = shuffle(e.joueurs);
        return reponse({ type: 'voter', liens: Object.fromEntries(e.cartes.map((c, i) => [c.mot, perm[i % perm.length]])) });
      }
    }
    if (type === 'temple' && e.mesVies > 0 && e.phase === 'choix' && e.monChoix == null) return reponse({ type: 'choisir', chemin: Math.floor(Math.random() * e.chemins.length) });
    if (type === 'mime') {
      if (e.role === 'mime' && e.phase === 'pret') return reponse({ type: 'pret' });
      if (e.role === 'mime' && e.phase === 'mime' && Math.random() < .05) return reponse({ type: 'passer' });
      if (e.role === 'devine' && e.phase === 'mime' && Math.random() < .35) {
        const bon = round?.mi?.mot;
        return reponse({ type: 'deviner', texte: Math.random() < .6 && bon ? bon : 'zzz' });
      }
    }
    if (type === 'dragon' && e.moi) {
      const mo = e.moi;
      if (mo.horsJeu) return;
      if (e.dragon?.prepare && mo.action !== 'cache') return reponse({ type: 'cacher' });
      if (mo.action === 'cache' && Math.random() < .3) return reponse({ type: 'viser' });
      if (mo.action === 'vise' && now >= mo.pretA && Math.random() < .5) return reponse({ type: 'tirer' });
      if (mo.action === 'vise' && Math.random() < .15) {
        const cibles = [...e.joueurs.filter(j => j.equipe !== mo.equipe && !j.horsJeu).map(j => j.nom), 'dragon'];
        return reponse({ type: 'cibler', cible: cibles[Math.floor(Math.random() * cibles.length)] });
      }
      if (mo.action === 'vise' && mo.balles <= 0) return reponse({ type: 'recharger' });
      if (mo.action === 'recharge' || mo.action === 'cache') return;
    }
    if (type === 'quiz' && e.phase === 'question' && e.maReponse == null && Math.random() < .8) return reponse({ type: 'repondre', choix: Math.floor(Math.random() * 4) });
    if (type === 'disparu' && e.phase === 'question' && e.moi && !e.moi.reponse) {
      const bon = round?.mem?.cur?.manquant?.nom;
      const i = Math.random() < .6 && bon ? e.choix.findIndex(o => o.nom === bon) : Math.floor(Math.random() * e.choix.length);
      return reponse({ type: 'repondre', choix: Math.max(0, i) });
    }
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
