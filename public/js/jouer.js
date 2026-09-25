// Page téléphone des joueurs.
/* global SJ */
const app = document.getElementById('app');
const { esc, fmt, money } = SJ;
let V = null;
const pads = {};          // saisie en cours de chaque pavé
const ui = { weapon: null, target: null, alloc: {}, showArme: false };

function hello() {
  SJ.emit('hello', { role: 'joueur', token: SJ.store('sj-token') });
}
SJ.sock.on('connect', hello);
SJ.sock.on('etat', v => {
  const before = V;
  V = v;
  document.body.dataset.game = v.gameId;
  draw();
  buzz(before, v);
});

async function act(a) {
  const r = await SJ.emit('joueur', a);
  SJ.toast(r);
  return r;
}

// Vibre quand quelque chose arrive au joueur.
function buzz(a, b) {
  const g0 = a?.game, g1 = b?.game;
  if (!g1) return;
  if (!g0?.duel && g1.duel) navigator.vibrate?.([80, 60, 80]);
  if (!g0?.block && g1.block) navigator.vibrate?.(400);
  if (g0?.random?.stage !== 'hint' && g1.random?.stage === 'hint') navigator.vibrate?.(150);
}

// ---------- pavé numérique ----------
function pad(key, go = 'OK') {
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, go];
  return `<div class="codebox mono" id="cb-${key}">${esc(pads[key] || '')}&nbsp;</div>
    <div class="pad">${keys.map(k => `<button type="button" data-pad="${key}" data-k="${k}" class="${k === go ? 'go' : ''}">${k}</button>`).join('')}</div>`;
}
const PAD_ACTIONS = {
  code: v => act({ type: 'code', value: v }),
  numero: v => act({ type: 'numero', value: v }),
  arme: v => act({ type: 'arme', value: v }).then(r => { if (r.ok) ui.showArme = false; draw(); }),
  anti: v => act({ type: 'antidote', value: v }),
  tir: v => act({ type: 'tir', value: v }),
};
app.addEventListener('click', e => {
  const b = e.target.closest('[data-pad]');
  if (!b) return;
  const key = b.dataset.pad, k = b.dataset.k;
  let v = pads[key] || '';
  if (k === '⌫') v = v.slice(0, -1);
  else if (/^\d$/.test(k)) v = (v + k).slice(0, 8);
  else {
    if (!v) return SJ.toast({ ok: false, msg: 'Tape un code.' });
    PAD_ACTIONS[key]?.(v);
    v = '';
  }
  pads[key] = v;
  const box = document.getElementById('cb-' + key);
  if (box) box.innerHTML = esc(v) + '&nbsp;';
});

// ---------- écrans ----------
function head(right = '') {
  return `<header class="ph-head"><h1 class="ph-title">${esc(V.gameName)}</h1>${right}</header>`;
}

function joinScreen() {
  return `<header class="ph-head"><h1 class="ph-title">Soirée jeux</h1></header>
    <div class="card"><p style="font-size:18px">Bienvenue ! Écris ton prénom pour participer aux jeux.</p>
      <p class="muted" style="font-size:14px">S'il y a deux fois le même prénom, ajoute l'initiale de ton nom.</p></div>
    <form id="join" class="stack">
      <label class="field"><span class="label">Ton prénom</span><input class="in" id="nom" name="nom" autocomplete="given-name" maxlength="24" required style="font-size:20px"></label>
      <button class="btn primary big">Rejoindre</button>
    </form>`;
}

function waitingScreen() {
  const me = V.me;
  const counting = V.status === 'countdown';
  if (!counting && !V.inscriptionsOpen) {
    return head(`<span class="pill">${esc(me.name)}</span>`) + `<div class="card"><p style="font-size:18px">Pas de jeu pour l'instant.</p><p class="muted">Garde cette page ouverte : le prochain jeu s'affichera ici.</p></div>`;
  }
  let body = counting ? `<div class="card center"><span class="label">Début du jeu dans</span><div class="huge mono">${V.paused ? fmt(V.remaining) : `<span data-until="${V.endsAt}"></span>`}</div>${V.paused ? '<p class="muted">Décompte en pause</p>' : ''}</div>` : '';
  if (me.registered) {
    body += `<div class="card accent center"><p style="font-size:20px">✓ Tu es inscrit !</p><p class="muted">${V.registeredCount} inscrits pour l'instant.</p></div>`;
    if (V.inscriptionsOpen) body += `<button class="btn" data-act="desinscrire">Me désinscrire</button>`;
  } else if (V.inscriptionsOpen) {
    body += `<button class="btn primary big" data-act="inscrire">S'inscrire au jeu</button><p class="muted center" style="margin:0">${V.registeredCount} inscrits pour l'instant</p>`;
  } else {
    body += `<div class="card"><p>Les inscriptions ouvrent dans <strong class="mono" data-until="${V.inscriptionsAt}"></strong>.</p></div>`;
  }
  if (!counting) body = `<div class="card"><p style="font-size:18px">Prochain jeu : <strong>${esc(V.gameName)}</strong></p></div>` + body;
  return head(`<span class="pill">${esc(me.name)}</span>`) + body;
}

// ---------- jeu 1 : Le Chemin ----------
const WEAPON_HELP = {
  pistolet: 'Bloque la cible', menottes: 'Bloque jusqu\'à la clé · 1 fois', loupe: 'Révèle rôle et équipe',
  fumigene: 'Paralyse l\'équipe adverse', gilet: 'Protège ton équipe', voyance: 'Toujours active',
};

function chemin(g) {
  const T = g.team;
  const tag = `<div class="row"><span class="pill ${T === 'A' ? 'a' : 'b'}">Équipe ${T}</span><span class="pill">${g.role === 'random' ? 'Random' : 'Détective'}</span></div>`;
  if (g.finished) {
    const won = g.winner === T;
    return head() + tag + `<div class="card ${won ? 'accent' : ''} center"><div class="huge">${won ? '🏆' : '🏁'}</div><p style="font-size:22px">${g.winner ? `L'équipe ${g.winner} gagne !` : 'Partie terminée'}</p><p class="muted">${won ? 'Bravo à toute ton équipe !' : 'Merci d\'avoir joué.'}</p></div>`;
  }
  if (g.block) {
    app.className = 'phone blocked';
    const icon = { pistolet: '🔫', menottes: '⛓️', fumigene: '💨' }[g.block.type];
    const help = g.block.type === 'menottes' ? 'Trouve une clé et tape son code pour te libérer.'
      : g.block.antidoteUsed ? 'Tu as déjà utilisé un antidote.' : `Un ${g.block.type === 'pistolet' ? 'bandage' : 'antidote'} peut réduire le temps : tape son code.`;
    return head() + tag + `<div class="center stack" style="margin-top:10px"><div style="font-size:64px">${icon}</div>
      <div class="bigname" style="color:var(--danger)">${esc(g.block.label)} !</div>
      ${g.block.until ? `<p class="muted" style="margin:0">Tu ne peux rien faire pendant</p><div class="bignum" data-until="${g.block.until}"></div>` : ''}
      <p style="margin:0">${help}</p></div>
      <div class="label">Code antidote</div>${pad('anti')}`;
  }
  app.className = 'phone' + (g.safeUntil ? ' safezone' : '');
  let h = head() + tag;
  if (g.safeUntil) h += `<div class="card safe"><strong>🛡 Safe zone</strong><p>Personne ne peut t'attaquer pendant <span class="mono" data-until="${g.safeUntil}"></span>.</p></div>`;
  if (g.fumigeneArrive) h += `<div class="card danger"><strong>💨 Un fumigène arrive dans <span class="mono" data-until="${g.fumigeneArrive}"></span> !</strong><p>Trouve l'antidote.</p></div>`;
  else if (g.protectUntil) h += `<div class="card safe"><strong>🦺 Ton équipe est protégée</strong><p>Encore <span class="mono" data-until="${g.protectUntil}"></span></p></div>`;
  if (g.random) h += randomPart(g);
  if (g.detective) h += detectivePart(g);
  return h;
}

function randomPart(g) {
  const r = g.random;
  if (r.stage === 'hint') {
    return `<div class="card accent"><span class="label">Étape ${r.step === 15 ? r.total : r.step} / ${r.total}${r.step === 15 ? ' · dernière étape' : ''}</span><p style="font-size:19px;white-space:pre-wrap">${esc(r.indice) || '<span class="muted">(indice non renseigné)</span>'}</p></div>
      ${r.longue ? `<div class="card safe"><strong>🛡 Épreuve longue</strong><p>Tu peux te mettre en safe zone : va voir l'orga dans ${esc(r.safeLieu)}.</p></div>` : ''}
      <div class="label">Code trouvé</div>${pad('code')}`;
  }
  if (r.stage === 'sent') {
    return `<div class="card accent"><span class="label" style="color:var(--accent)">✓ Code correct</span><p>Va voir discrètement</p><div class="bigname">${esc(r.next.name)}</div><p>et donne-lui le numéro</p><div class="bignum">${esc(r.next.numero)}</div></div>
      <p class="muted" style="margin:0">Attention aux détectives adverses : ne te fais pas repérer.</p>`;
  }
  if (r.stage === 'done') return `<div class="card"><p style="font-size:18px">✓ Ta mission est terminée.</p><p class="muted">Aide ton équipe discrètement.</p></div>`;
  return `<div class="card"><p style="font-size:18px">Quelqu'un de ton équipe va venir te voir avec un numéro.</p><p class="muted">Tape-le ici pour recevoir ton indice.</p></div>
    ${g.lockUntil ? `<div class="card danger"><p>Trop d'erreurs : attends <span class="mono" data-until="${g.lockUntil}"></span></p></div>` : ''}
    <div class="label">Numéro reçu</div>${pad('numero')}`;
}

function detectivePart(g) {
  const d = g.detective;
  let h = `<div class="card"><span class="label">Tes coéquipiers détectives</span><p>${d.mates.length ? d.mates.map(esc).join(' · ') : 'Tu es le seul détective de ton équipe.'}</p></div>`;
  if (d.visions.length) h += `<div class="card safe"><span class="label" style="color:var(--safe)">🔮 Visions</span>${d.visions.map(x => `<p>${esc(x.text)}</p>`).join('')}</div>`;
  const usable = d.inv.filter(w => !w.passive);
  h += `<div class="label">Tes armes</div>`;
  if (!d.inv.length) h += `<p class="muted" style="margin:0">Aucune arme pour l'instant. Cherche-les dans la pièce !</p>`;
  else {
    h += `<div class="weapons">${d.inv.map(w => {
      const off = w.passive || w.cd || w.used;
      return `<button type="button" class="weapon${off ? ' off' : ''}" data-weapon="${w.id}" aria-pressed="${ui.weapon === w.id}" ${w.passive ? 'disabled' : ''}>
        <strong>${w.icon} ${esc(w.label)}</strong>
        <span class="muted">${w.used ? 'déjà utilisées' : w.cd ? `recharge <span class="mono" data-until="${w.cd}"></span>` : WEAPON_HELP[w.id]}</span></button>`;
    }).join('')}</div>`;
  }
  const W = usable.find(w => w.id === ui.weapon);
  if (W) {
    if (W.target) {
      h += `<div class="label">Qui vises-tu ?</div><div class="list" style="max-height:300px;overflow:auto">${d.targets.map(t =>
        `<button type="button" data-target="${t.id}" aria-pressed="${ui.target === t.id}" ${t.off ? 'disabled' : ''}><span>${esc(t.name)}</span><span class="muted">${t.off || (ui.target === t.id ? '●' : '')}</span></button>`).join('')}</div>`;
      const tn = d.targets.find(t => t.id === ui.target);
      h += `<button class="btn primary big" data-act="attaque" ${tn && !W.cd && !W.used ? '' : 'disabled'}>${W.icon} ${tn ? `${W.id === 'loupe' ? 'Observer' : 'Viser'} ${esc(tn.name)}` : 'Choisis une cible'}</button>`;
    } else {
      h += `<button class="btn primary big" data-act="attaque" ${W.cd ? 'disabled' : ''}>${W.icon} ${W.id === 'gilet' ? 'Protéger mon équipe' : 'Lancer le fumigène'}</button>`;
    }
  }
  if (d.notes.length) h += `<div class="card"><span class="label">🔍 Ce que tu sais</span>${d.notes.map(n => `<p>${esc(n.text)}</p>`).join('')}</div>`;
  h += ui.showArme
    ? `<div class="label">Code de l'arme trouvée</div>${pad('arme')}<button class="btn" data-act="fermerArme">Fermer</button>`
    : `<button class="btn" data-act="ouvrirArme">+ Entrer le code d'une arme</button>`;
  return h;
}

// ---------- jeu 2 : Duel au Far West ----------
function duel(g) {
  const lives = g.phase === 'p2' || !g.alive ? '' : SJ.hearts(g.lives, g.maxLives);
  let h = head(lives);
  app.className = 'phone';
  if (g.last && !g.duel) {
    h += g.last.won
      ? `<div class="card accent center"><p style="font-size:22px">🎯 Tu as gagné contre ${esc(g.last.opp)} !</p></div>`
      : `<div class="card danger center"><p style="font-size:22px">${g.last.reason === 'bon numéro' || g.last.reason === 'plus rapide' ? '🔫 Touché' : '💥 ' + esc(g.last.reason)}</p><p>${esc(g.last.opp)} gagne le duel.</p></div>`;
  }
  if (g.finished) {
    h += `<div class="card ${g.iWon ? 'accent' : ''} center"><div class="huge">🏆</div><p style="font-size:22px">${g.iWon ? 'Tu remportes le duel !' : `${esc(g.winner || '—')} remporte le duel`}</p><p class="muted">Ta prime : ${money(g.prime)}</p></div>`;
    if (g.bet) h += betPart(g);
    return h;
  }
  if (g.alive) {
    const d = g.duel;
    if (d && d.kind === 'num') {
      const opp = d.a.name === V.me.name ? d.b : d.a;
      return h + `<div class="card accent"><span class="label">Duel !</span><div class="bigname">${esc(opp.name)}</div><p class="muted">Tape le numéro dans son dos. Un mauvais numéro fait exploser ton pistolet.</p></div>${pad('tir', 'FEU')}`;
    }
    if (d && d.kind === 'face') {
      const opp = d.a.name === V.me.name ? d.b : d.a;
      return h + `<div class="card center"><p style="font-family:var(--display);font-size:26px">Face-à-face contre ${esc(opp.name)}</p><p class="muted">Erreurs restantes : <strong>${g.errors}</strong></p></div>
        <button class="trigger" id="trigger" type="button">TIRER</button>
        <p class="center muted" style="margin:0">Attends « FEU ! » sur l'écran. Trop tôt = ton pistolet explose.</p>`;
    }
    h += `<div class="card center"><span class="label">Ton dossard</span><div class="huge mono" style="color:var(--accent)">${esc(g.num || '?')}</div></div>`;
    if (g.phase === 'pause') h += `<div class="card"><p>Pause paris : reprise dans <strong class="mono" data-until="${g.pauseUntil}"></strong></p></div>`;
    else if (g.phase === 'prep') h += `<div class="card"><p style="font-size:18px">Mets ton dossard dans le dos.</p><p class="muted">Les duels commencent bientôt.</p></div>`;
    else h += `<div class="card"><p style="font-size:18px">Garde un œil sur l'écran.</p><p class="muted">Ton nom peut apparaître à tout moment. Cache bien ton dos !</p>${g.phase === 'p2' ? `<p class="muted">Erreurs de tir restantes : <strong>${g.errors}</strong></p>` : ''}</div>`;
    return h;
  }
  h += `<div class="card center"><div class="bigname" style="color:var(--text)">Éliminé</div><p class="muted">${esc(g.elimLabel || '')}</p><span class="label">Ta prime</span><div class="bignum" style="color:var(--accent)">+${money(g.prime)}</div></div>`;
  return h + betPart(g);
}

function betPart(g) {
  const b = g.bet;
  if (b.placed) {
    return `<div class="card center"><span class="label">Tes gains de paris</span><div class="bignum" style="color:var(--accent)">${money(b.value)}</div><p class="muted">${b.rank}ᵉ parieur sur ${b.count}</p></div>
      ${b.placed.map(x => `<div class="card" style="flex-direction:row;justify-content:space-between;align-items:center"><div><strong>${esc(x.name)}</strong> <span class="muted">· mise ${money(x.mise)}</span><p class="muted" style="font-size:14px">${x.wins} duel${x.wins > 1 ? 's' : ''} gagné${x.wins > 1 ? 's' : ''}${x.alive ? '' : ' · éliminé'}</p></div><span class="mono" style="color:var(--accent)">${money(x.value)}</span></div>`).join('')}`;
  }
  if (g.finished) return '';
  const chosen = Object.keys(ui.alloc).filter(p => b.targets.some(t => t.pid === p));
  const used = chosen.reduce((s, p) => s + (ui.alloc[p] || 0), 0);
  let h = `<div class="card"><span class="label">Parie sur les survivants</span><p>Répartis <strong>${money(b.jetons)}</strong> sur 1 à ${b.max} joueurs. Chaque duel qu'ils gagnent ensuite ajoute ${Math.round(b.coef * 100)} % à ta mise. Pari définitif.</p><p class="mono" style="color:var(--accent)">Reste : ${money(b.jetons - used)}</p></div>`;
  h += chosen.map(p => {
    const t = b.targets.find(x => x.pid === p);
    return `<div class="slider"><span><strong>${esc(t.name)}</strong> ${SJ.hearts(t.lives)}</span><span class="mono" style="color:var(--accent)">${money(ui.alloc[p])}</span>
      <input type="range" min="0" max="${b.jetons}" step="10" value="${ui.alloc[p]}" data-alloc="${p}" id="al-${p}" aria-label="Mise sur ${esc(t.name)}"></div>`;
  }).join('');
  h += `<div class="label">Choisis jusqu'à ${b.max} joueurs</div><div class="list" style="max-height:260px;overflow:auto">${b.targets.map(t =>
    `<button type="button" data-pick="${t.pid}" aria-pressed="${t.pid in ui.alloc}" ${!(t.pid in ui.alloc) && chosen.length >= b.max ? 'disabled' : ''}><span>${esc(t.name)} ${SJ.hearts(t.lives)}</span><span>${t.pid in ui.alloc ? '✓' : ''}</span></button>`).join('')}</div>`;
  h += `<button class="btn primary big" data-act="parier" ${used > 0 && used <= b.jetons ? '' : 'disabled'}>Valider mon pari (définitif)</button>`;
  return h;
}

// ---------- rendu ----------
function draw() {
  if (!V) return;
  if (!V.me) { app.className = 'phone'; if (!document.getElementById('join')) SJ.render(app, joinScreen()); return; }
  let html;
  if (V.game && !V.game.spectator) {
    html = V.gameId === 'chemin' ? chemin(V.game) : duel(V.game);
  } else if (V.status === 'playing' || V.status === 'finished') {
    app.className = 'phone';
    html = head() + `<div class="card"><p style="font-size:18px">${V.status === 'playing' ? 'Partie en cours.' : 'Partie terminée.'}</p><p class="muted">Tu n'es pas inscrit à ce jeu. Regarde l'écran !</p></div>`;
  } else {
    app.className = 'phone';
    html = waitingScreen();
  }
  SJ.render(app, html);
}

app.addEventListener('submit', async e => {
  if (e.target.id !== 'join') return;
  e.preventDefault();
  const r = await SJ.emit('rejoindre', { name: document.getElementById('nom').value });
  if (!r.ok) return SJ.toast(r);
  SJ.store('sj-token', r.token);
  hello();
});

app.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-weapon],[data-target],[data-pick]');
  if (!t) return;
  if (t.dataset.weapon) { ui.weapon = ui.weapon === t.dataset.weapon ? null : t.dataset.weapon; ui.target = null; return draw(); }
  if (t.dataset.target) { ui.target = t.dataset.target; return draw(); }
  if (t.dataset.pick) {
    const p = t.dataset.pick;
    if (p in ui.alloc) delete ui.alloc[p]; else ui.alloc[p] = 0;
    return draw();
  }
  const a = t.dataset.act;
  if (a === 'inscrire') act({ type: 'inscription', on: true });
  if (a === 'desinscrire') act({ type: 'inscription', on: false });
  if (a === 'ouvrirArme') { ui.showArme = true; draw(); }
  if (a === 'fermerArme') { ui.showArme = false; draw(); }
  if (a === 'attaque') act({ type: 'attaque', arme: ui.weapon, target: ui.target }).then(r => { if (r.ok) { ui.target = null; draw(); } });
  if (a === 'parier') act({ type: 'pari', alloc: ui.alloc });
});

app.addEventListener('input', e => {
  const p = e.target.dataset.alloc;
  if (!p) return;
  const jetons = V.game.bet.jetons;
  const others = Object.entries(ui.alloc).filter(([k]) => k !== p).reduce((s, [, v]) => s + v, 0);
  ui.alloc[p] = Math.min(Number(e.target.value), jetons - others);
  e.target.value = ui.alloc[p];
  draw();
});

// Gâchette : on note l'heure exacte de l'appui (horloge synchronisée avec le serveur).
app.addEventListener('pointerdown', e => {
  if (e.target.id !== 'trigger') return;
  e.preventDefault();
  const t = SJ.now();
  navigator.vibrate?.(60);
  act({ type: 'gachette', t });
});

SJ.keepAwake();
