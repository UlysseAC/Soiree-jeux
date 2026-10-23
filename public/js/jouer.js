// Page téléphone des joueurs.
/* global SJ */
const app = document.getElementById('app');
const { esc, fmt, money } = SJ;
let V = null;
const pads = {};          // saisie en cours de chaque pavé
const ui = { weapon: null, target: null, alloc: {}, showArme: false, tab: 'parier', sel: null, mise: 100, inv: {} };

// /jouer?test : téléphone de test, pour incarner un joueur dans la simulation. Son identité est gardée à part
// (clé « sj-token-test ») : jouer la simulation ne change rien au vrai nom pris sur ce téléphone.
const TEL_TEST = new URLSearchParams(location.search).has('test');
const CLE_TOKEN = TEL_TEST ? 'sj-token-test' : 'sj-token';
if (TEL_TEST) document.body.insertAdjacentHTML('beforeend', '<div class="badge-test">Téléphone de test · simulation</div>');
// Jeu en pause (depuis l'admin) : grand panneau par-dessus tout.
// L'Enquête : un éclair quand l'admin lance l'enquête (passage de l'introduction à l'enquête).
let eqPhase = null;
SJ.sock.on('etat', v => {
  const ph = v.gameId === 'enquete' && v.game && !v.game.finished ? v.game.phase : null;
  if (eqPhase === 'intro' && (ph === 'enquete' || ph === 'panne')) SJ.foudre();
  eqPhase = ph;
});
SJ.sock.on('etat', v => {
  const el = document.getElementById('pause-jeu'), on = v.status === 'playing' && v.paused;
  if (on && !el) document.body.insertAdjacentHTML('beforeend', '<div id="pause-jeu" class="pause-jeu"><div class="pause-jeu-t">⏸ Pause</div><p>Le jeu reprend dans un instant.</p></div>');
  if (!on && el) el.remove();
});
function hello() {
  SJ.emit('hello', { role: 'joueur', token: SJ.store(CLE_TOKEN), test: TEL_TEST });
}
SJ.sock.on('connect', hello);
let autoJoin = false;
SJ.sock.on('etat', v => {
  // Le serveur ne nous connaît plus (il a redémarré) : on se réinscrit tout seul avec le même prénom.
  const nom = SJ.store('sj-nom');
  if (!v.me && nom && SJ.store(CLE_TOKEN) && !autoJoin) {
    autoJoin = true;
    SJ.emit('rejoindre', { name: nom }).then(r => { if (r.ok) { SJ.store(CLE_TOKEN, r.token); hello(); } });
    return;
  }
  reinscrire(v);
  const before = V;
  V = v;
  document.body.dataset.game = v.gameId;
  document.body.dataset.theme = v.gameId === 'minijeux' ? MJ_THEMES[v.game?.actif?.type] || '' : '';
  draw();
  buzz(before, v);
  eqEntrer();
});

// Le Mime : envoyer un essai (bouton ou touche Entrée), puis vider le champ en gardant le clavier ouvert.
function mmDeviner() {
  const el = document.getElementById('mm-essai');
  const v = (el?.value || '').trim();
  if (!v) return;
  ui.mmDraft = '';
  if (el) { el.value = ''; el.focus(); }
  act({ type: 'deviner', texte: v });
}
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'mm-essai') { e.preventDefault(); mmDeviner(); } });

async function act(a) {
  const r = await SJ.emit('joueur', a);
  SJ.toast(r);
  return r;
}

// Inscription perdue pendant un redémarrage du serveur (mise à jour) : le téléphone se réinscrit tout seul,
// dès que les inscriptions sont ouvertes.
let reinscription = false;
function reinscrire(v) {
  const lastBoot = SJ.store('sj-boot');
  SJ.store('sj-boot', v.boot);
  if (!v.me) return;
  let mine = null;
  try { mine = JSON.parse(SJ.store('sj-inscrit') || 'null'); } catch { /* rien */ }
  if (v.me.registered) { SJ.store('sj-inscrit', JSON.stringify({ game: v.gameId, session: v.sessionId })); return; }
  if (!mine) return;
  if (mine.game !== v.gameId || v.status === 'playing' || v.status === 'finished') { SJ.store('sj-inscrit', null); return; }
  if (lastBoot && lastBoot !== v.boot && !mine.pending) { mine.pending = true; SJ.store('sj-inscrit', JSON.stringify(mine)); }
  if (!mine.pending) { SJ.store('sj-inscrit', null); return; } // désinscrit par l'admin
  if (v.inscriptionsOpen && !reinscription) {
    reinscription = true;
    act({ type: 'inscription', on: true }).finally(() => { reinscription = false; });
  }
}

// Vibre quand quelque chose arrive au joueur.
function buzz(a, b) {
  const g0 = a?.game, g1 = b?.game;
  if (!g1) return;
  if (!g0?.duel && g1.duel) navigator.vibrate?.([80, 60, 80]);
  if (!g0?.monTour && g1.monTour) navigator.vibrate?.([300, 120, 300, 120, 500]);
  if (!g0?.block && g1.block) navigator.vibrate?.(400);
  if (g1.etat?.type === 'dragon' && g0?.etat?.moi && g1.etat.moi && g1.etat.moi.vies < g0.etat.moi.vies) navigator.vibrate?.([400, 100, 400]); // touché
  if (g1.etat?.type === 'mime' && g1.etat.role === 'mime' && g1.etat.dernier?.trouve && g1.etat.dernier.at !== g0?.etat?.dernier?.at) navigator.vibrate?.(150); // mot trouvé par le partenaire
  if (g0?.etat?.type === 'temple' && g0.etat.phase === 'choix' && g1.etat?.phase === 'resultat' && g1.etat.joueurs.find(p => p.nom === g1.nom)?.perdu) setTimeout(() => navigator.vibrate?.([500, 100, 500]), 2400); // piège ! (après le suspense)
  if (g0?.random?.stage !== 'hint' && g1.random?.stage === 'hint') { navigator.vibrate?.(150); ui.aideConfirm = false; }
  if (g0?.random?.attente && g1.random?.stage === 'hint' && !g1.random.attente) navigator.vibrate?.(150);
  if (g1.aRepondre?.length > (g0?.aRepondre?.length || 0)) navigator.vibrate?.([300, 100, 300]); // L'Enquête : on m'interroge
  if (g0?.attente && !g1.attente) navigator.vibrate?.(150); // L'Enquête : réponse à ma question
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
  const so = V.me?.soiree;
  const line = so ? `<p class="muted" style="margin:0;font-size:14px">🏆 Soirée : <strong style="color:var(--text)">${so.rank}<sup>e</sup></strong> sur ${so.count} · ${String(so.total).replace('.', ',')} pts${so.mult > 1 ? ` · bonus ×${String(so.mult).replace('.', ',')} (jeu raté)` : ''}</p>` : '';
  return `<header class="ph-head"><h1 class="ph-title">${esc(V.gameName)}</h1>${right}</header>${line}`;
}

function joinScreen() {
  return `<header class="ph-head"><h1 class="ph-title">Soirée jeux</h1></header>
    <div class="card"><p style="font-size:18px">Bienvenue ! Écris ton prénom pour participer aux jeux.</p>
      <p class="muted" style="font-size:14px">S'il y a deux fois le même prénom, ajoute l'initiale de ton nom.</p></div>
    <form id="join" class="stack">
      <label class="field"><span class="label">Ton prénom</span><input class="in" id="nom" name="nom" autocomplete="given-name" maxlength="24" required style="font-size:20px"></label>
      <button class="btn primary big">Rejoindre</button>
    </form>
    ${ui.reprise ? `<form id="reprise" class="card stack"><p style="margin:0;font-size:18px">Tu étais déjà inscrit sur un autre téléphone ?</p>
      <p class="muted" style="margin:0;font-size:14px">Demande ton code à l'organisateur, puis écris ton prénom et ce code.</p>
      <label class="field"><span class="label">Ton prénom</span><input class="in" id="reprise-nom" maxlength="24" required></label>
      <label class="field"><span class="label">Code</span><input class="in" id="reprise-code" inputmode="numeric" maxlength="4" required style="font-size:24px;letter-spacing:.2em"></label>
      <button class="btn primary">Retrouver mon compte</button></form>`
    : '<button class="btn sm" data-act="reprise" style="align-self:center">J\'étais déjà inscrit sur un autre téléphone</button>'}`;
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
    if (V.gameId === 'duel') body += me.dossard
      ? `<div class="card center"><span class="label">Ton numéro de maillot</span><div class="huge mono" style="color:var(--accent)">${esc(me.dossard)}</div><p class="muted">Enfile ton maillot, le numéro dans le dos, et garde-le caché des autres.</p></div>`
      : `<div class="card center" style="border-color:var(--accent)"><p style="font-size:22px">👕 Va chercher ton maillot auprès de l'admin !</p><p class="muted">Ton numéro est dans le dos : garde-le caché des autres.</p></div>`;
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
  const label = `<span class="label">Étape ${r.step === 15 ? r.total : r.step} / ${r.total}${r.step === 15 ? ' · dernière étape' : ''}</span>`;
  if (r.stage === 'hint' && r.attente) {
    return `<div class="card danger">${label}<p style="font-size:18px"><strong>⏳ Pénalité</strong> : ton coéquipier a utilisé l'indice bonus.</p><p>Ton indice arrive dans <span class="mono" style="font-size:26px" data-until="${r.attente}"></span></p></div>`;
  }
  if (r.stage === 'hint') {
    const min = r.penalite ? SJ.fmt(r.penalite * 1000) : '';
    const aide = r.aide
      ? `<div class="card safe"><span class="label" style="color:var(--safe)">💡 Indice bonus</span><p style="font-size:18px;white-space:pre-wrap">${esc(r.aide)}</p>${min ? `<p class="muted" style="margin:0">Le prochain joueur attendra ${min} avant de voir son indice.</p>` : ''}</div>`
      : !r.aideDispo ? ''
      : ui.aideConfirm
        ? `<div class="card"><p><strong>Utiliser l'indice bonus ?</strong></p><p class="muted">${min ? `Pénalité : le joueur à qui tu donneras le numéro attendra <strong>${min}</strong> avant de voir son indice.` : 'Pas de pénalité à la dernière étape.'}</p>
           <div class="row"><button class="btn primary" data-act="aide">Oui, voir l'indice bonus</button><button class="btn" data-act="aideNon">Non</button></div></div>`
        : `<button class="btn" data-act="aideAsk" style="align-self:flex-start">💡 Bloqué ? Indice bonus${min ? ` (pénalité ${min})` : ''}</button>`;
    return `<div class="card accent">${label}<p style="font-size:19px;white-space:pre-wrap">${esc(r.indice) || '<span class="muted">(indice non renseigné)</span>'}</p></div>
      ${aide}
      ${r.longue ? `<div class="card safe"><strong>🛡 Épreuve longue</strong><p>Tu peux te mettre en safe zone : va voir l'orga dans ${esc(r.safeLieu)}.</p></div>` : ''}
      <div class="label">Code trouvé</div>${pad('code')}`;
  }
  if (r.stage === 'sent') {
    return `<div class="card accent"><span class="label" style="color:var(--accent)">✓ Code correct</span><p>Va voir discrètement</p><div class="bigname">${esc(r.next.name)}</div><p>et donne-lui le numéro</p><div class="bignum">${esc(r.next.numero)}</div></div>
      ${r.penalite ? `<p class="muted" style="margin:0">💡 Tu as utilisé l'indice bonus : ${esc(r.next.name)} attendra ${SJ.fmt(r.penalite * 1000)} avant de voir son indice.</p>` : ''}
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
    h += `<div class="card ${g.iWon ? 'accent' : ''} center"><div class="huge">🏆</div><p style="font-size:22px">${g.iWon ? 'Tu remportes le duel !' : g.winner ? `${esc(g.winner)} remporte le duel` : 'Partie terminée'}</p><p class="muted">Ta prime : ${money(g.prime)}</p></div>`;
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
    h += g.num
      ? `<div class="card center"><span class="label">Ton numéro de maillot</span><div class="huge mono" style="color:var(--accent)">${esc(g.num)}</div></div>`
      : `<div class="card center" style="border-color:var(--accent)"><p style="font-size:22px">👕 Va chercher ton maillot auprès de l'admin !</p></div>`;
    if (g.phase === 'pause') h += `<div class="card"><p>Pause paris : reprise dans <strong class="mono" data-until="${g.pauseUntil}"></strong></p></div>`;
    else if (g.phase === 'prep') h += `<div class="card"><p style="font-size:18px">${g.num ? 'Enfile ton maillot, le numéro dans le dos.' : 'L\'admin va te donner ton maillot et noter ton numéro.'}</p><p class="muted">Les duels commencent bientôt.</p></div>`;
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

// ---------- jeu 3 : Le Grand Pari ----------
const dec = x => String(x).replace('.', ',');
function gpOptions(g) {
  const o = g.options, sp = g.sport;
  const row = (sel, left, cote) => `<button type="button" data-sel="${sel}" aria-pressed="${ui.sel === sel}"><span>${left}</span><span class="mono" style="color:var(--accent)">${cote}</span></button>`;
  const sw = c => `<span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${c};vertical-align:-2px;margin-right:8px"></span>`;
  if (sp.id === 'chevaux') {
    return `<p class="muted" style="margin:0;font-size:14px">Gains : ${o.gains.map((x, i) => `${i + 1}<sup>e</sup> ×${dec(x)}`).slice(0, 4).join(' · ')}…</p>
      <div class="list">${o.chevaux.map(h => row(`cheval:${h.i}`, `${sw(h.couleur)}<strong>${esc(h.nom)}</strong> <span class="muted">n°${h.i + 1}</span>`, `×${dec(o.gains[0])}`)).join('')}</div>`;
  }
  if (sp.id === 'foot') {
    const [A, B] = o.equipes, od = o.odds;
    const c = v => (v ? '×' + dec(v) : '…');
    return `<div class="label">Vainqueur</div><div class="list">
        ${row('vainqueur:0', `<strong>${esc(A.nom)}</strong>`, '×' + dec(o.coteVainqueur))}
        ${row('nul', 'Match nul', c(od?.nul))}
        ${row('vainqueur:1', `<strong>${esc(B.nom)}</strong>`, '×' + dec(o.coteVainqueur))}</div>
      <div class="label">Buteur (marque au moins un but)</div><div class="list">
        ${[A, B].flatMap((T, ti) => T.joueurs.map((j, i) => row(`buteur:${ti}:${i}`, `${esc(j)} <span class="muted">· ${esc(T.nom)}</span>`, c(od?.buteur[ti][i])))).join('')}</div>
      <div class="label">Nombre de buts dans le match</div><div class="list">
        ${[0, 1, 2, 3, 4].map(k => row(`buts:${k}`, k === 4 ? '4 buts ou plus' : `${k} but${k > 1 ? 's' : ''}`, c(od?.buts[k]))).join('')}</div>
      ${o.oddsPending ? '<p class="muted" style="margin:0;font-size:14px">Cotes en cours de calcul…</p>' : ''}`;
  }
  const gn = o.gains;
  return `<p class="muted" style="margin:0;font-size:14px">1<sup>er</sup> ×${dec(gn.premier)} · top 3 ×${dec(gn.top3)} · top ${gn.n25} ×${dec(gn.top25)} · top ${gn.n50} ×${dec(gn.top50)} · sinon perdu</p>
    <div class="list" style="max-height:340px;overflow:auto">${o.boxeurs.map(b => row(`boxeur:${b.i}`, `${sw(b.couleur)}<strong>${esc(b.nom)}</strong>${b.nom === V.me.name ? ' <span class="muted">(toi)</span>' : ''}`, `jusqu'à ×${dec(gn.premier)}`)).join('')}</div>`;
}

function selLabel(g, sel) {
  const o = g.options, [kind, x, y] = sel.split(':');
  if (kind === 'cheval') return o.chevaux[x].nom;
  if (kind === 'vainqueur') return `victoire ${o.equipes[x].nom}`;
  if (kind === 'nul') return 'match nul';
  if (kind === 'buteur') return `${o.equipes[x].joueurs[y]} marque`;
  if (kind === 'buts') return x === '4' ? '4 buts ou plus' : `${x} but${x > 1 ? 's' : ''}`;
  if (kind === 'boxeur') return o.boxeurs[x].nom;
  return '';
}

function miseBox(id, value, max) {
  return `<div class="row" style="flex-wrap:nowrap"><input class="in mono" type="number" inputmode="numeric" min="${V.game.miseMin}" max="${max}" step="10" id="${id}" data-mise="${id}" value="${value}" style="font-size:22px">
    <button type="button" class="btn sm" data-add="${id}" data-v="50">+50</button><button type="button" class="btn sm" data-add="${id}" data-v="all">Tout</button></div>`;
}

function gpParier(g) {
  const sp = g.sport;
  if (!g.open) {
    if (g.phase === 'entre') return `<div class="card"><p style="font-size:18px">Paris fermés pour ${sp.icon} ${esc(sp.name)}.</p><p class="muted">Départ dans <span class="mono" data-until="${sp.at}"></span>.</p></div>`;
    return `<div class="card"><p>Les paris du prochain sport ouvriront après les résultats.</p></div>`;
  }
  let h = `<div class="card accent"><div class="spread"><strong style="font-size:20px">${sp.icon} ${esc(sp.name)}</strong><span class="pill accent">ferme dans <span class="mono" data-until="${sp.closeAt}"></span></span></div></div>`;
  h += gpOptions(g);
  if (ui.sel) {
    h += `<div class="card accent" style="position:sticky;bottom:10px"><span class="label">Ta mise sur : ${esc(selLabel(g, ui.sel))}</span>${miseBox('mise', ui.mise, g.wallet)}
      <button class="btn primary big" data-act="gpParier">Parier ${money(ui.mise || 0)}</button></div>`;
  }
  return h;
}

function gpInvestir(g) {
  const b = g.block;
  if (!b || b.settled || g.phase !== 'entre') return `<div class="card"><p>Pas d'investissement ouvert en ce moment.</p><p class="muted">Un nouveau bloc ouvre après chaque sport.</p></div>`;
  return `<p class="muted" style="margin:0">Chaque investissement doit atteindre son montant <strong>et</strong> son nombre d'investisseurs avant le départ du sport (<span class="mono" data-until="${b.until}"></span>). Convaincs tes potes !</p>` +
    b.items.map(it => {
      const pa = Math.min(100, Math.round(it.total / it.needAmount * 100)), pi = Math.min(100, Math.round(it.investors / it.needInvestors * 100));
      const v = ui.inv[it.id] ?? 100;
      return `<div class="card"><div class="spread"><strong style="font-size:18px">${it.emoji} ${esc(it.nom)}</strong><span class="pill accent">×${dec(it.gain)}</span></div>
        <span class="muted" style="font-size:14px">Si ça échoue : ${it.remb} % remboursés</span>
        <span class="label">${money(it.total)} / ${money(it.needAmount)}</span><div class="gauge"><i style="width:${pa}%"></i></div>
        <span class="label">${it.investors} / ${it.needInvestors} investisseurs</span><div class="gauge people"><i style="width:${pi}%"></i></div>
        ${it.mine ? `<p style="color:var(--accent)">Tu as investi ${money(it.mine)}</p>` : ''}
        ${miseBox('inv-' + it.id, v, g.wallet)}<button class="btn" data-invest="${it.id}">Investir ${money(v)}</button></div>`;
    }).join('');
}

function gpMesParis(g) {
  if (!g.bets.length) return `<div class="card"><p class="muted">Aucun pari pour l'instant.</p></div>`;
  return `<div class="list">${g.bets.map(b => `<div class="li"><span>${b.icon} ${esc(b.label)}<br><span class="muted" style="font-size:13px">mise ${money(b.mise)}</span></span>
    <span class="mono" style="color:${b.payout == null ? 'var(--muted)' : b.payout > 0 ? 'var(--ok)' : 'var(--danger)'}">${b.payout == null ? 'en cours' : b.payout > 0 ? '+' + money(b.payout) : 'perdu'}</span></div>`).join('')}</div>`;
}

function grandpari(g) {
  let h = head(`<span class="pill accent mono" style="font-size:16px">💰 ${money(g.wallet)}</span>`);
  if (g.finished) {
    const diff = g.final.wallet - g.final.start;
    return h + `<div class="card accent center"><div class="huge">${g.final.rank === 1 ? '🏆' : '🏁'}</div><p style="font-size:22px">${g.final.rank}<sup>e</sup> sur ${g.count}</p>
      <div class="bignum" style="color:var(--accent)">${money(g.final.wallet)}</div><p class="muted">${diff >= 0 ? 'Gagné' : 'Perdu'} : ${money(Math.abs(diff))} depuis le début</p></div>` + gpMesParis(g);
  }
  h += `<p class="muted" style="margin:0">${g.rank}<sup>e</sup> plus riche sur ${g.count}</p>`;
  if (g.phase === 'sport') {
    h += `<div class="card accent center"><p style="font-size:22px">${g.sport.icon} ${esc(g.sport.name)} en cours</p><p class="muted">Regarde l'écran !</p>
      ${g.fighter ? `<p style="font-size:18px">Tu combats ! Ta couleur : <span style="display:inline-block;width:22px;height:22px;border-radius:6px;background:${g.fighter.couleur};vertical-align:-5px"></span></p>` : ''}</div>`;
  }
  if (g.phase === 'resultat' && g.lastGain != null) {
    h += `<div class="card ${g.lastGain >= 0 ? 'accent' : 'danger'} center"><p style="font-size:20px">${g.lastGain >= 0 ? `Tu gagnes ${money(g.lastGain)} !` : `Tu perds ${money(-g.lastGain)}`}</p></div>`;
  }
  const tabs = [['parier', 'Parier'], ['investir', 'Investir'], ['paris', `Mes paris (${g.bets.length})`]];
  h += `<nav class="tabs" style="justify-content:stretch">${tabs.map(([k, l]) => `<button role="tab" style="flex:1" data-tab="${k}" aria-selected="${ui.tab === k}">${l}</button>`).join('')}</nav>`;
  h += ui.tab === 'investir' ? gpInvestir(g) : ui.tab === 'paris' ? gpMesParis(g) : gpParier(g);
  return h;
}

// ---------- jeu 5 : L'Enquête ----------
const EQ_ICONES = { salle: '🚪', perso: '👤', arme: '🗡' };
const eqCarte = c => `<span class="eq-carte" data-type="${c.type}">${EQ_ICONES[c.type]} ${esc(c.nom)}</span>`;
const eqOptions = (liste, val, vide) => `<option value="">${vide}</option>${liste.map(c => `<option value="${c.id}" ${c.id === val ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}`;

// QR code d'une tablette scanné : /jouer?salle=3&c=4821 → le téléphone entre dans la salle (une seule fois).
const EQ_SCAN = (() => { const q = new URLSearchParams(location.search); return q.has('c') ? { salle: q.get('salle'), code: q.get('c') } : null; })();
let eqScan = EQ_SCAN;
let eqCorps = (() => { const q = new URLSearchParams(location.search); return q.has('corps') ? { victime: q.get('corps'), c: q.get('k') } : null; })();
function eqEntrer() {
  if (eqCorps && V?.gameId === 'enquete' && V.game && !V.game.spectator && V.game.phase !== 'intro') {
    const c = eqCorps;
    eqCorps = null;
    history.replaceState(null, '', location.pathname + (TEL_TEST ? '?test' : ''));
    act({ type: 'corps', ...c }).then(() => { ui.eqTab = 'indices'; draw(); });
    return;
  }
  if (!eqScan || V?.gameId !== 'enquete' || !V.game || V.game.spectator) return;
  const s = eqScan;
  eqScan = null;
  history.replaceState(null, '', location.pathname + (TEL_TEST ? '?test' : ''));
  if (V.game.phase === 'intro' || V.game.finished) return; // trop tôt ou trop tard : le code ne vaut plus rien
  act({ type: 'entrer', salle: s.salle, code: s.code }).then(r => { if (r.ok) { ui.eqTab = 'salle'; ui.eqCode = false; draw(); } });
}
PAD_ACTIONS.salle = v => act({ type: 'entrer', code: v }).then(r => { if (r.ok) { ui.eqCode = false; draw(); } });

function eqRepondre(g) {
  return g.aRepondre.map(q => `<div class="card accent eq-urgent"><p style="margin:0;font-size:18px">❓ <strong>${esc(q.de)}</strong> t'interroge dans ${esc(q.salle)} :</p>
    <p style="margin:0">« ${esc(q.perso)}, avec ${esc(q.arme)}, dans ${esc(q.salle)} ? »</p>
    <div class="label">Montre-lui une de ces cartes (lui seul la verra)</div>
    <div class="eq-choix">${q.choix.map(c => `<button class="btn big" data-eqmontrer="${q.id}" data-carte="${c.id}">${eqCarte(c)}</button>`).join('')}</div>
    <p class="muted" style="margin:0;font-size:13px">Sinon, une carte au hasard dans <span class="mono" data-until="${q.fin}"></span></p></div>`).join('');
}

function eqSalle(g) {
  let h = '';
  if (!g.salle) {
    h += `<div class="card center"><p style="font-size:18px;margin:0">📷 Scanne le QR code de la tablette de la salle où tu es.</p>
      <p class="muted" style="margin:0">Ou tape le code à 4 chiffres affiché dessous :</p></div>${pad('salle', 'Entrer')}`;
    return h;
  }
  h += `<div class="card"><div class="row" style="justify-content:space-between"><span style="font-size:20px">📍 <strong>${esc(g.salle.nom)}</strong></span>${g.quitteA ? `<span class="pill">🚪 Départ dans <span class="mono" data-until="${g.quitteA}"></span></span>` : '<button class="btn sm" data-act="eqQuitter">🚪 Quitter la salle</button>'}</div>
    <p class="muted" style="margin:0;font-size:13px">Avant d'aller ailleurs, appuie sur « Quitter la salle » (sinon tu seras immobilisé).</p>
    <div class="label">Avec toi</div><div class="pions">${g.presents.map(p => `<span class="pion">${esc(p.name)}</span>`).join('') || '<span class="muted">Personne</span>'}</div></div>`;
  // indice de la salle : par sa tâche (si l'admin a activé les tâches), sinon en le demandant à la tablette
  if (g.tache) h += eqTache(g.tache);
  else h += g.indicesRestants
    ? `<button class="btn big" data-act="eqIndice">💡 Demander un indice à la salle${g.indicesRestants > 1 ? ` (${g.indicesRestants})` : ''}</button>`
    : '<p class="muted center" style="margin:0">💡 Indice de cette salle déjà pris.</p>';
  // question
  const libres = g.presents.filter(p => !p.dernier);
  if (!libres.some(p => p.pid === ui.eqCible)) ui.eqCible = null;
  let bloque = '';
  if (g.attente) bloque = 'Attends la réponse à ta question…';
  else if (g.nextAsk) bloque = `Prochaine question dans <span class="mono" data-until="${g.nextAsk}"></span>`;
  h += `<div class="card"><strong>🗣 Interroger quelqu'un</strong>
    ${g.presents.length ? `<p class="muted" style="margin:0;font-size:14px">1. Clique sur la personne à interroger · 2. Choisis un personnage et une arme</p><div class="pions">${g.presents.map(p => `<button class="pion choix" data-eqcible="${p.pid}" aria-pressed="${ui.eqCible === p.pid}" ${p.dernier ? 'disabled title="Tu viens de l\'interroger"' : ''}>${ui.eqCible === p.pid ? '✓ ' : ''}${esc(p.name)}</button>`).join('')}</div>
    <select class="in" id="eq-perso">${eqOptions(g.persos, ui.eqPerso, 'Personnage…')}</select>
    <select class="in" id="eq-arme">${eqOptions(g.armes, ui.eqArme, 'Arme…')}</select>
    <p class="muted" style="margin:0;font-size:14px">Lieu : ${esc(g.salle.nom)} (la salle où tu es)</p>
    ${bloque ? `<p class="center" style="margin:0">${bloque}</p>` : `<button class="btn primary big" data-act="eqInterroger" ${ui.eqCible && ui.eqPerso && ui.eqArme ? '' : 'disabled'}>${!ui.eqCible ? 'Clique d\'abord sur la personne à interroger' : !ui.eqPerso || !ui.eqArme ? 'Choisis un personnage et une arme' : 'Poser la question'}</button>`}`
    : '<p class="muted" style="margin:0">Personne d\'autre dans cette salle.</p>'}</div>`;
  return h;
}

// Tâche de la salle : solo (bouton « Commencer »), ou à plusieurs (lancer, rejoindre, jouer son rôle).
function eqTache(t) {
  const titre = `<div class="row" style="justify-content:space-between"><strong>🛠 ${esc(t.nom)}</strong><span class="pill">${t.groupe ? (t.n === 3 ? '👥 Trio' : '👥 Duo') : '👤 Solo'}</span></div>`;
  if (t.aIndice) return `<div class="card">${titre}<p class="muted" style="margin:0">✓ Tu as l'indice de cette salle. Va dans une autre salle !</p></div>`;
  if (!t.groupe) {
    const lance = ui.tacheLancee === t.cle;
    return `<div class="card accent">${titre}<p style="margin:0">${esc(t.consigne)}</p>
      ${lance ? `<div id="tache-zone" class="tz" data-keep="${esc(t.cle)}"></div>` : '<button class="btn primary big" data-act="eqTacheGo">▶ Commencer la tâche</button>'}
      <p class="muted" style="margin:0;font-size:13px">Réussis-la pour recevoir l'indice de la salle.</p></div>`;
  }
  const qui = t.joueurs.length ? t.joueurs.map(esc).join(', ') : '';
  if (t.etat === 'jeu' && t.moi) {
    return `<div class="card accent">${titre}<p style="margin:0">Ton rôle : <strong>${esc(t.roleNom)}</strong> — ${esc(t.consigne)}</p>
      <div id="tache-zone" class="tz" data-keep="${esc(t.cle)}"></div>
      <button class="btn sm" data-act="eqTacheQuitter" style="align-self:flex-start">Abandonner</button></div>`;
  }
  if (t.etat === 'jeu') return `<div class="card">${titre}<p class="muted" style="margin:0">Tâche en cours : ${qui}. Attends qu'ils aient fini, ou va dans une autre salle.</p></div>`;
  if (t.etat === 'attente') {
    return `<div class="card accent">${titre}<p style="margin:0">Il faut ${t.n} joueurs : ${t.joueurs.length} / ${t.n} (${qui}).</p>
      ${t.moi ? '<p class="muted" style="margin:0">Attends qu\'un autre joueur de la salle rejoigne…</p><button class="btn sm" data-act="eqTacheQuitter" style="align-self:flex-start">Quitter</button>'
        : '<button class="btn primary big" data-act="eqTacheRejoindre">🤝 Rejoindre la tâche</button>'}</div>`;
  }
  return `<div class="card accent">${titre}<p style="margin:0">Cette tâche se fait à ${t.n} : ${t.roles.map(esc).join(' · ')}. Seul, trouve des partenaires ou change de salle.</p>
    <button class="btn primary big" data-act="eqTacheLancer">▶ Lancer la tâche</button></div>`;
}

function eqJournal(g) {
  let h = '';
  h += `<div class="label">Mes indices (${g.notes.length})</div>${g.notes.length ? `<div class="list">${g.notes.map(n => `<div class="li" style="flex-direction:column;align-items:flex-start;gap:2px"><span>💡 ${esc(n.texte)}</span><span class="muted" style="font-size:13px">${esc(n.salle)} · ${hm(n.t)}</span></div>`).join('')}</div>` : '<p class="muted" style="margin:0">Aucun indice pour l\'instant : demande-en un à la tablette d\'une salle.</p>'}`;
  if (g.mesQuestions.length) {
    h += `<div class="label">Mes questions (${g.mesQuestions.length})</div><div class="list">${g.mesQuestions.map(q => `<div class="li"><span>${esc(q.a)} · ${esc(q.perso)}, ${esc(q.arme)}, ${esc(q.salle)}</span>
      <span>${q.etat === 'attente' ? '<span class="muted">…</span>' : q.carte ? eqCarte(q.carte) : q.etat === 'annulee' ? '<span class="muted">—</span>' : '<span class="muted">aucune carte</span>'}</span></div>`).join('')}</div>`;
  }
  return h;
}

const EQ_STATUTS = { main: ['✋', 'ma carte'], vu: ['👁', 'vue'], indice: ['💡', 'indice'], coche: ['✗', 'barrée'] };
function eqFiche(g) {
  const groupe = (titre, liste) => `<div class="label">${titre}</div><div class="list eq-fiche">${liste.map(c => {
    const f = g.fiche[c.id] || {}, st = EQ_STATUTS[f.statut];
    return `<button data-eqcocher="${c.id}" class="${f.statut ? 'barre' : ''}"><span>${eqCarte(c)}</span><span class="muted">${st ? `${st[0]} ${st[1]}${f.par?.length ? ` (${esc(f.par.join(', '))})` : ''}` : ''}</span></button>`;
  }).join('')}</div>`;
  return `<p class="muted" style="margin:0;font-size:14px">Clique sur une carte pour la barrer à la main. ✋ ta carte · 👁 montrée par quelqu'un · 💡 éliminée par un indice.</p>`
    + groupe('Personnages', g.persos) + groupe('Armes', g.armes) + groupe('Salles', g.salles);
}

// Le tueur actif : un panneau discret (fermé par défaut) avec sa cachette, son arme, et les victimes possibles de sa salle.
function eqSecret(g) {
  const t = g.secret;
  if (!ui.eqSecret) return '<button class="btn sm" data-act="eqSecret" style="align-self:flex-end">🌀 Souvenirs</button>';
  let h = `<div class="card danger"><div class="row" style="justify-content:space-between"><strong>🩸 C'était toi.</strong><button class="btn sm" data-act="eqSecret">Cacher</button></div>
    <p class="muted" style="margin:0;font-size:13px">Continue de faire semblant d'enquêter. Personne ne doit voir cet écran.</p>`;
  if (!t.armeRecup) h += `<p style="margin:0">Tu as caché <strong>${esc(t.arme)}</strong> dans : <strong>${esc(t.cache)}</strong>. Va scanner cette salle pour la récupérer.</p>`;
  else if (t.recharge) h += `<p style="margin:0">${esc(t.arme)} : prêt dans <span class="mono" data-until="${t.recharge}"></span>.</p>`;
  else if (!g.salle) h += `<p style="margin:0">${esc(t.arme)} est prêt. Scanne une salle pour trouver une victime.</p>`;
  else if (!g.presents.length) h += `<p style="margin:0">${esc(t.arme)} est prêt, mais tu es seul dans la salle.</p>`;
  else h += `<p style="margin:0">${esc(t.arme)} est prêt. Victime dans cette salle :</p><div class="pions">${[...g.presents].sort((a, b) => (b.indices || 0) - (a.indices || 0)).map(p => `<button class="pion choix" data-act="eqTuer" data-cible="${esc(p.pid)}" data-nom="${esc(p.name)}">🔪 ${esc(p.name)} <small class="pion-perso">${p.indices || 0} 💡</small></button>`).join('')}</div>`;
  if (t.victimes) h += `<p class="muted" style="margin:0">Victimes : ${t.victimes}</p>`;
  return h + '</div>';
}

function eqAccuser(g) {
  if (g.accuse?.juste) return '<div class="card center"><p style="margin:0">Tu as déjà fait ton accusation.</p></div>';
  if (g.accuse) return `<div class="card danger center"><p style="font-size:20px;margin:0">❌ Ton accusation était fausse.</p><p class="muted" style="margin:0">Tu ne peux plus accuser, mais continue de répondre aux questions.</p></div>`;
  const a = ui.eqAcc || {};
  return `<div class="card"><p style="margin:0">Tu penses avoir trouvé ? <strong>Une seule accusation</strong> par joueur : si elle est juste, tu gagnes l'enquête ; sinon, tu ne pourras plus accuser.</p>
    ${g.secondeChance ? '<p class="muted" style="margin:0">Ton premier essai t\'a laissé un souvenir flou : tu as eu ta seconde chance.</p>' : ''}
    <select class="in" id="eq-acc-perso">${eqOptions(g.persos, a.perso, 'Qui ?')}</select>
    <select class="in" id="eq-acc-arme">${eqOptions(g.armes, a.arme, 'Avec quoi ?')}</select>
    <select class="in" id="eq-acc-salle">${eqOptions(g.salles, a.salle, 'Où ?')}</select>
    <button class="btn primary big" data-act="eqAccuser" ${a.perso && a.arme && a.salle ? '' : 'disabled'}>⚖️ J'accuse !</button></div>`;
}

function enquete(g) {
  app.className = 'phone';
  let h = head(`<span class="pion">👤 ${esc(g.moi.nom)}</span>`);
  const main = `<div class="label">Mes cartes (personne d'autre ne les a… sauf peut-être un joueur)</div><div class="eq-main">${g.main.map(eqCarte).join('')}</div>`;
  if (g.finished) {
    const r = g.revelation;
    h += `<div class="card accent center">${g.gagne ? '<div class="huge">🏆</div><p style="font-size:22px;margin:0">Tu as résolu l\'enquête !</p>' : g.winner ? `<p style="font-size:20px;margin:0">🏆 ${esc(g.winner)} a résolu l'enquête.</p>` : '<p style="font-size:20px;margin:0">Personne n\'a trouvé…</p>'}
      ${r ? `<div class="label">La vérité</div><p style="font-size:18px;margin:0">${eqCarte(r.perso)} avec ${eqCarte(r.arme)} dans ${eqCarte(r.salle)}</p>` : ''}
      ${g.tueur ? '<p style="font-size:20px;margin:0">🔪 C\'était toi le tueur… sans le savoir !</p>' : r?.tueur ? `<p class="muted" style="margin:0">Le tueur était ${esc(r.tueur)}.</p>` : ''}
      <p class="muted" style="margin:0">${g.indices} indice${g.indices > 1 ? 's' : ''} obtenu${g.indices > 1 ? 's' : ''}</p></div>`;
    return h + main + eqJournal(g);
  }
  if (g.phase === 'panne') {
    const P = g.panne;
    PAD_ACTIONS.panne = v => act({ type: 'panne', code: v });
    return h + `<div class="card danger center"><div class="huge">⚡</div><p style="font-size:20px;margin:0">Les plombs ont sauté !</p>
      ${P.entre ? `<p style="margin:0">✓ Tu as réparé ta salle. Plus que <strong>${P.restants}</strong> joueur(s)…</p>`
        : `<p style="margin:0">Va dans : <strong style="font-size:24px">${esc(P.salle)}</strong></p><p class="muted" style="margin:0">Tape le code affiché sur la tablette de cette salle.</p>${pad('panne', 'Réparer')}`}</div>`;
  }
  if (g.phase === 'intro') return h + `<div class="card center"><p style="font-size:20px;margin:0">Tu es <strong>${esc(g.moi.nom)}</strong>.</p><p class="muted" style="margin:0">Regarde l'écran : l'enquête va commencer.</p></div>` + main;
  h += `<div class="row" style="justify-content:space-between"><span class="muted">⏳ <span class="mono" data-until="${g.endsAt}"></span></span>${g.phase === 'finale' ? '<span class="pill accent">⚡ Phase finale : indices doublés</span>' : ''}</div>`;
  if (g.mort) {
    const lien = `${location.origin}${SJ.base}/jouer?corps=${encodeURIComponent(g.mort.victime)}&k=${encodeURIComponent(g.mort.jeton)}`;
    return h + `<div class="card danger center"><div class="huge">💀</div><p style="font-size:22px;margin:0">Tu as été assassiné dans : ${esc(g.mort.salle)}.</p>
      <p style="margin:0">Reste où tu es, sans rien dire. Quand on te trouve, montre ce QR code : les enquêteurs le scannent pour fouiller tes poches (tes cartes).</p>
      <img class="tz-qr-corps" src="/qr.svg?d=${encodeURIComponent(lien)}" alt="QR code du corps" width="280" height="280">
      <p class="muted" style="margin:0">Corps fouillé ${g.mort.trouve} fois.</p></div>`;
  }
  if (g.bloque) h += `<div class="card danger center"><p style="margin:0;font-size:18px">⛔ Immobilisé encore <span class="mono" data-until="${g.bloque}"></span></p><p class="muted" style="margin:0">Tu as oublié d'appuyer sur « Quitter la salle ».</p></div>`;
  if (g.secret) h += eqSecret(g);
  h += eqRepondre(g);
  ui.eqTab ??= 'salle';
  const tabs = [['salle', g.salle ? '📍 Salle' : '📷 Salle'], ['indices', `💡 Indices (${g.notes.length})`], ...(g.fiche ? [['fiche', '📋 Fiche']] : []), ['accuser', '⚖️ Accuser']];
  if (ui.eqTab === 'fiche' && !g.fiche) ui.eqTab = 'salle';
  h += `<nav class="tabs" style="justify-content:stretch">${tabs.map(([k, l]) => `<button role="tab" style="flex:1" data-eqtab="${k}" aria-selected="${ui.eqTab === k}">${l}</button>`).join('')}</nav>`;
  h += ui.eqTab === 'indices' ? eqJournal(g) : ui.eqTab === 'fiche' ? eqFiche(g) : ui.eqTab === 'accuser' ? eqAccuser(g) : eqSalle(g) + main;
  return h;
}
app.addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'eq-perso') ui.eqPerso = e.target.value;
  else if (id === 'eq-arme') ui.eqArme = e.target.value;
  else if (id.startsWith('eq-acc-')) (ui.eqAcc ??= {})[id.slice(7)] = e.target.value;
  else return;
  draw();
});
app.addEventListener('click', e => {
  const t = e.target.closest('[data-eqtab],[data-eqcible],[data-eqmontrer],[data-eqcocher],[data-act^="eq"]');
  if (!t) return;
  if (t.dataset.eqtab) { ui.eqTab = t.dataset.eqtab; return draw(); }
  if (t.dataset.eqcible) { ui.eqCible = t.dataset.eqcible; return draw(); }
  if (t.dataset.eqcocher) return act({ type: 'cocher', carte: t.dataset.eqcocher });
  if (t.dataset.eqmontrer) return act({ type: 'montrer', q: t.dataset.eqmontrer, carte: t.dataset.carte });
  const a = t.dataset.act;
  if (a === 'eqQuitter') act({ type: 'quitter' });
  if (a === 'eqSecret') { ui.eqSecret = !ui.eqSecret; draw(); }
  if (a === 'eqTuer') {
    const nomV = t.dataset.nom;
    if (!confirm(`Assassiner ${nomV} ?`)) return;
    act({ type: 'tuer', cible: t.dataset.cible }).then(() => { ui.eqSecret = false; draw(); });
  }
  if (a === 'eqIndice') act({ type: 'indice' });
  if (a === 'eqTacheGo') { ui.tacheLancee = V.game.tache?.cle; draw(); }
  if (a === 'eqTacheLancer') act({ type: 'tacheLancer' });
  if (a === 'eqTacheRejoindre') act({ type: 'tacheRejoindre' });
  if (a === 'eqTacheQuitter') act({ type: 'tacheQuitter' });
  if (a === 'eqInterroger') act({ type: 'interroger', cible: ui.eqCible, perso: ui.eqPerso, arme: ui.eqArme }).then(r => { if (r.ok) { ui.eqCible = null; draw(); } });
  if (a === 'eqAccuser') {
    const c = ui.eqAcc || {}, n = id => [...V.game.persos, ...V.game.armes, ...V.game.salles].find(x => x.id === id)?.nom;
    if (!confirm(`Accuser : ${n(c.perso)}, avec ${n(c.arme)}, dans ${n(c.salle)} ?\nTu n'as droit qu'à une seule accusation.`)) return;
    act({ type: 'accuser', ...c });
  }
});

// ---------- jeu 4 : Les Mini-Jeux ----------
const hm = ts => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const MJ_TEAMS = ['Rouges', 'Bleus', 'Verts', 'Jaunes', 'Violets', 'Orange', 'Roses', 'Gris'];
const liste = arr => arr.length <= 1 ? (arr[0] || '') : `${arr.slice(0, -1).join(', ')} et ${arr.at(-1)}`;
// « Tu joues avec Hugo contre Tom et Inès » ; « Tu joues seul contre… » ; « Avec Tom, Inès » (chacun pour soi).
function mjAvecQui(t) {
  if (!t.equipesNommees) return `Avec ${esc(liste(t.joueurs.filter(p => p !== V.game.nom))) || 'personne d\'autre'}`;
  const adv = (t.adversaires || []).map(e => liste(e)).join(', puis ');
  const team = `<strong>${esc(MJ_TEAMS[t.equipe] ?? `Équipe ${t.equipe + 1}`)}</strong>`;
  return t.coequipiers?.length ? `Équipe ${team} : tu joues avec ${esc(liste(t.coequipiers))} contre ${esc(adv)}` : `Équipe ${team} : tu joues seul contre ${esc(adv)}`;
}
// « La Définition » sur le téléphone : le joueur écrit, les autres relient les mots aux joueurs.
// La Chasse au dragon, sur le téléphone, à l'horizontale : à gauche (pouce gauche) les cibles, à droite (pouce droit)
// Viser en haut, Tirer au milieu, Recharger en bas. On ne choisit une cible qu'en visant ; Tirer est grisé si on est caché
// ou sans balles. Le jeu se suit sur l'écran.
let drMinuteur = null;
function mjDragon(e) {
  const m = e.moi;
  if (!m) return `<div class="card"><p style="font-size:18px">🐉 La chasse au dragon a commencé. Regarde l'écran !</p></div>`;
  if (e.phase === 'fini') return `<div class="card center"><p style="font-size:20px">Partie terminée !</p><p class="muted">Regarde le classement sur l'écran.</p></div>`;
  if (m.horsJeu) return `<div class="card center"><div class="huge" style="font-size:44px">😵</div><p style="font-size:18px">Tu es hors jeu.</p><p class="muted">Regarde la fin de la partie sur l'écran.</p></div>`;
  const now = SJ.now(), vise = m.action === 'vise', recharge = m.action === 'recharge';
  const pret = vise && now >= m.pretA;
  // le bouton Tirer s'allume tout seul au bout de la seconde de visée
  clearTimeout(drMinuteur);
  if (vise && !pret) drMinuteur = setTimeout(draw, m.pretA - now + 30);
  if (recharge) drMinuteur = setTimeout(draw, Math.max(0, m.finRecharge - now) + 30);
  const balles = '▮'.repeat(m.balles) + '▯'.repeat(Math.max(0, e.chargeur - m.balles));
  const cibles = [
    ...e.joueurs.filter(j => j.equipe !== m.equipe).map(j => ({ id: j.nom, label: j.nom, possible: !j.horsJeu })),
    ...(e.dragon.pv > 0 ? [{ id: 'dragon', label: '🐉 Dragon', possible: true }] : []),
  ];
  const etat = recharge ? '🔄 Tu recharges…' : vise ? (pret ? '🎯 Visée prête' : 'Vise… garde ta cible 1 s') : m.action === 'cache' ? '🪵 À l\'abri' : '⚠️ Debout !';
  const progres = recharge ? `<div class="dr-prog"><div id="dr-prog-${m.finRecharge}" style="animation-duration:${Math.max(0, m.finRecharge - now)}ms"></div></div>`
    : vise && !pret ? `<div class="dr-prog"><div id="dr-vise-${m.pretA}" style="animation-duration:${Math.max(0, m.pretA - now)}ms"></div></div>` : '';
  return `<div class="dr-tourne card center"><p style="font-size:18px">🔄 Tourne ton téléphone à l'horizontale pour jouer.</p></div>
    <div class="dr-tel">
      <div class="dr-haut"><span>${'❤️'.repeat(m.vies)}</span><span class="dr-balles mono" aria-label="${m.balles} balles">${balles}</span><strong>${etat}</strong></div>
      ${progres}
      <div class="dr-corps">
        <div class="dr-cibles">
          <span class="label dr-titre">Cible</span>
          ${cibles.map(c => `<button class="btn big dr-cible-btn ${m.cible === c.id ? 'on' : ''}" data-act="drCibler" data-cible="${esc(c.id)}" aria-pressed="${m.cible === c.id}" ${vise && c.possible ? '' : 'disabled'}>${esc(c.label)}</button>`).join('')}
        </div>
        <div class="dr-actions">
          <button class="btn primary big dr-act" data-act="${m.action === 'cache' ? 'drViser' : 'drCacher'}">${m.action === 'cache' ? '🎯 Viser' : '🪵 Se cacher'}</button>
          <button class="btn primary big dr-act" data-act="drTirer" ${pret && m.balles > 0 ? '' : 'disabled'}>${m.balles <= 0 ? 'Chargeur vide' : '🔫 Tirer'}</button>
          <button class="btn big dr-act" data-act="drRecharger" ${recharge || m.balles >= e.chargeur ? 'disabled' : ''}>🔄 Recharger</button>
        </div>
      </div>
    </div>`;
}

// Le Mime, sur le téléphone : celui qui mime voit le mot et peut passer ; celui qui devine écrit ses essais.
function mjMime(e) {
  const c = e.cur;
  if (!c) return '';
  let h = `<span class="label" style="text-align:center">Tour ${e.tour} / ${e.tours}${e.phase !== 'fini' ? ` · <strong class="mono" data-until="${e.fin}"></strong>` : ''}</span>`;
  const trouves = e.histo.filter(x => x.trouve).length;
  const essais = e.essais.length ? `<div class="mm-essais-tel">${e.essais.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : '';
  if (e.role === 'mime') {
    if (e.phase === 'pret') return h + `<div class="card turn center"><div class="huge" style="font-size:40px">🤫 À toi de mimer !</div><p style="font-size:18px">Mets-toi face à <strong>${esc(c.devine)}</strong>. Pas un bruit !</p></div>
      <button class="btn primary big" data-act="mmPret">C'est parti !</button>`;
    const flash = e.dernier && e.dernier.tour === e.tour - 1 && SJ.now() - e.dernier.at < 3000 ? e.dernier : null;
    if (flash) h += `<div class="card center" style="border-color:${flash.trouve ? 'var(--ok)' : 'var(--line)'}"><strong style="font-size:20px;color:${flash.trouve ? 'var(--ok)' : 'var(--muted)'}">${flash.trouve ? `✓ Trouvé : ${esc(flash.mot)} !` : `⏭ Passé : ${esc(flash.mot)}`}</strong></div>`;
    return h + `<div class="card turn center"><span class="label">Mime</span><div class="mm-mot">${esc(e.mot || '…')}</div><p class="muted">Sans un bruit ! · ${trouves} trouvé${trouves > 1 ? 's' : ''}</p></div>
      <button class="btn big" data-act="mmPasser">Passer au mot suivant ⏭</button>
      ${essais ? `<div class="card"><span class="label">${esc(c.devine)} a proposé</span>${essais}</div>` : ''}`;
  }
  if (e.role === 'devine') {
    if (e.phase === 'pret') return h + `<div class="card turn center"><div class="huge" style="font-size:40px">✍️ À toi de deviner !</div><p style="font-size:18px"><strong>${esc(c.mime)}</strong> va mimer. Écris ce que tu devines, autant de fois que tu veux.</p></div>`;
    return h + `<div class="card turn center"><p style="font-size:18px;margin:0">Que mime <strong>${esc(c.mime)}</strong> ?</p><p class="muted" style="margin:0">${trouves} trouvé${trouves > 1 ? 's' : ''} · accents et petites fautes acceptés</p></div>
      <input class="in" id="mm-essai" autocomplete="off" autocapitalize="off" maxlength="60" style="font-size:22px;padding:14px" placeholder="Ta réponse…" value="${esc(ui.mmDraft || '')}">
      <button class="btn primary big" data-act="mmDeviner">Valider</button>${essais}`;
  }
  return h + `<div class="card"><p style="font-size:18px">🤫 <strong>${esc(c.mime)}</strong> mime pour <strong>${esc(c.devine)}</strong>.</p><p class="muted">Regarde l'écran, et pas un mot !</p></div>`;
}

// Le Temple aztèque, sur le téléphone : je choisis un passage, ou je regarde si je ne joue pas.
function mjTemple(e) {
  const coeurs = (v, max) => '❤️'.repeat(Math.max(0, v)) + '🖤'.repeat(Math.max(0, max - Math.max(0, v)));
  let h = `<span class="label" style="text-align:center">Étape ${e.etape} / ${e.total}${e.phase === 'choix' ? ` · <strong class="mono" data-until="${e.fin}"></strong>` : ''}</span>`;
  if (e.phase === 'arrivee' || e.phase === 'fini') {
    if (e.mesVies === undefined) return h + '<div class="card"><p>Regarde l\'écran : qui arrive au temple ?</p></div>';
    return h + (e.mesVies > 0
      ? `<div class="card accent center"><div class="huge" style="font-size:40px">🏛️ 💰</div><p style="font-size:20px">Tu arrives au temple avec ${coeurs(e.mesVies, e.viesMax)}</p></div>`
      : `<div class="card center"><div class="huge" style="font-size:40px">☠️</div><p style="font-size:18px">Éliminé à l'étape ${e.monMort}.</p></div>`);
  }
  if (e.mesVies === undefined) { // je ne joue pas
    return h + `<div class="card"><p style="font-size:18px">${e.phase === 'choix' ? `${e.chemins.map(c => esc(c.nom)).join(', ')} ? Les joueurs choisissent…` : `Piégé : ${e.pieges.map(i => esc(e.chemins[i].nom)).join(', ')} !`}</p><p class="muted">Regarde l'écran !</p></div>`;
  }
  const moi = e.joueurs.find(p => p.nom === V.game.nom);
  // Le cœur perdu ne se brise qu'après le suspense de la révélation.
  const vies = e.phase === 'resultat' && moi?.perdu
    ? '❤️'.repeat(Math.max(0, e.mesVies)) + '<span class="tp-c"><b>❤️</b><b>🖤</b></span>' + '🖤'.repeat(Math.max(0, e.viesMax - Math.max(0, e.mesVies) - 1))
    : coeurs(e.mesVies, e.viesMax);
  const ji = e.joueurs.findIndex(p => p.nom === V.game.nom), tshirt = TempleCarte.COULEURS[ji % TempleCarte.COULEURS.length];
  h += `<div class="card center"><span class="label">Tes vies</span><div style="font-size:32px;letter-spacing:4px">${vies}</div>
    ${e.affichage === 'carte' ? `<p class="muted tp-moi" style="margin:0;justify-content:center">Sur l'écran, ton explorateur a le t-shirt <i class="tp-tshirt" style="--tshirt:${tshirt};font-size:20px"></i> <strong>${TempleCarte.NOMS_COULEURS[ji % TempleCarte.NOMS_COULEURS.length]}</strong></p>` : ''}</div>`;
  if (e.mesVies <= 0 && !moi?.perdu) return h + `<div class="card center"><p style="font-size:18px">☠️ Éliminé à l'étape ${e.monMort}.</p><p class="muted">Regarde la suite sur l'écran.</p></div>`;
  if (e.phase === 'choix') {
    return h + `<div class="card"><p style="font-size:18px;margin:0">Quel passage prends-tu ?</p></div>
      <div class="tp-choix">${e.chemins.map((c, i) => `<button class="btn ${e.monChoix === i ? 'primary choisi' : ''}" data-act="tpChoisir" data-chemin="${i}"><span style="font-size:22px">${i + 1}</span>${esc(c.nom)}</button>`).join('')}</div>
      <p class="muted center" style="margin:0">${e.monChoix != null ? `✓ Tu passes par : <strong>${esc(e.chemins[e.monChoix]?.nom)}</strong>. Tu peux encore changer.` : 'Sans choix à la fin du temps, le hasard choisit pour toi.'}</p>`;
  }
  // Suspense : le passage tremble pendant 2,4 s, puis on découvre si c'était le piège.
  const monChemin = e.chemins[moi?.choix]?.nom || '', pieges = e.pieges.map(i => e.chemins[i].nom);
  const res = moi?.perdu
    ? `<div class="card center tp-apres piege" style="border-color:var(--danger)"><div class="huge" style="font-size:40px">☠️</div><p style="font-size:20px;color:var(--danger)"><strong>${esc(e.messages[moi.choix] || '')}</strong></p><p>${e.mesVies > 0 ? 'Tu perds une vie !' : 'Tu as perdu ta dernière vie…'}</p></div>`
    : `<div class="card accent center tp-apres"><div class="huge" style="font-size:40px">😮‍💨</div><p style="font-size:20px">✓ ${esc(monChemin)} : passage sûr !</p><p class="muted">${pieges.length > 1 ? 'Les pièges étaient' : 'Le piège était'} : ${pieges.map(esc).join(', ')}</p></div>`;
  return h + `<div class="tp-tel-swap"><div class="card center tp-avant"><div class="huge" style="font-size:44px">🥁</div><p style="font-size:18px">${esc(monChemin)}… le passage tremble…</p></div>${res}</div>`;
}

function mjDefinition(e, t) {
  const k = `${(t || V.game.actif)?.n}:${e.manche}`;
  if (ui.mjK !== k) { ui.mjK = k; ui.mjDraft = null; ui.mjLiens = {}; }
  const timer = e.phase !== 'revelation' ? ` · <strong class="mono" data-until="${e.fin}"></strong>` : '';
  let h = `<span class="label" style="text-align:center">Manche ${e.manche} / ${e.total}${timer}</span>`;
  if (e.type === 'anecdote') return h + mjAnecdote(e);
  if (e.monMot !== undefined) { // je joue
    if (e.phase === 'oral') {
      const aMoi = e.parleur === V.game.nom, passe = e.parole.indexOf(V.game.nom) < e.tour;
      h += `<div class="card ${aMoi ? 'turn' : ''} center"><span class="label">Ton mot</span><div class="huge" style="font-size:40px;word-break:break-word">${esc(e.monMot)}</div>
        <p style="font-size:20px">${aMoi ? `🎤 <strong>À toi de parler !</strong> <span class="mono" data-until="${e.fin}"></span>` : passe ? '✓ Tu as parlé.' : `${esc(e.parleur)} parle… Prépare ta définition.`}</p>
        <p class="muted">Ce mot n'existe pas : invente sa définition et dis-la à voix haute quand c'est ton tour.</p></div>`;
    } else if (e.phase === 'vote') {
      h += `<div class="card center"><p style="font-size:18px">Les autres essaient de deviner qui avait quel mot…</p><p class="muted">Ton mot : <strong>${esc(e.monMot)}</strong></p></div>`;
    } else {
      const moi = e.cartes?.find(c => c.mot === e.monMot);
      h += `<div class="card accent center"><p style="font-size:18px"><strong>${moi?.trouves ?? 0}</strong> personne${(moi?.trouves ?? 0) > 1 ? 's ont' : ' a'} relié ton mot à toi</p><p class="muted">Total : ${e.totaux?.[V.game.nom] ?? 0}</p></div>`;
    }
    return h;
  }
  // je ne joue pas : je devine
  if (e.phase === 'oral' || e.phase === 'vote') {
    const pris = Object.values({ ...(e.mesLiens || {}), ...ui.mjLiens }).filter(Boolean);
    h += `<div class="card"><p style="font-size:18px">${e.phase === 'oral' ? 'Écoute les définitions et relie chaque mot (affiché à l\'écran) au joueur qui l\'a défini.' : 'Relie chaque mot au joueur qui l\'avait.'}</p>${e.phase === 'oral' ? `<p style="margin:0">🎤 <strong>${esc(e.parleur)}</strong> parle · <span class="mono" data-until="${e.fin}"></span></p><p class="muted" style="margin:0">Tu pourras encore corriger pendant le vote.</p>` : ''}</div><div class="mj-vote">${e.cartes.map(c => {
      const v = ui.mjLiens[c.mot] ?? e.mesLiens?.[c.mot] ?? '';
      return `<div class="card"><strong style="font-size:20px;color:var(--accent)">${esc(c.mot)}</strong>
        <select class="in" data-mj-lien="${esc(c.mot)}"><option value="">Qui avait ce mot ?</option>${e.joueurs.map(p => `<option value="${esc(p)}" ${v === p ? 'selected' : ''} ${v !== p && pris.includes(p) ? 'disabled' : ''}>${esc(p)}</option>`).join('')}</select></div>`;
    }).join('')}</div>
      <button class="btn primary big" data-act="mjVoter">${e.mesLiens ? 'Modifier mes réponses' : 'Envoyer mes réponses'}</button>
      ${e.mesLiens ? '<p class="muted center" style="margin:0">✓ Envoyées. Tu peux encore les modifier.</p>' : ''}`;
    return h;
  }
  return h + (e.bons != null ? `<div class="card accent center"><p style="font-size:20px">Tu as trouvé <strong>${e.bons}</strong> / ${e.cartes.length}</p><p class="muted">Total : ${e.mesBons} bonne${e.mesBons > 1 ? 's' : ''} réponse${e.mesBons > 1 ? 's' : ''}. Les 3 meilleurs devineurs gagnent 3, 2 et 1 points !</p></div>` : '<div class="card"><p>Regarde les réponses sur l\'écran !</p></div>');
}

// Le Quiz (mini-jeu) sur le téléphone : une réponse par question (4 boutons), puis juste ou faux.
function mjQuizTel(e) {
  const titre = `<span class="label" style="text-align:center">Question ${e.k + 1} / ${e.total}${e.phase === 'question' ? ` · <strong class="mono" data-until="${e.fin}"></strong>` : ''}</span>`;
  if (!e.question && !e.correction) return titre + `<div class="card"><p style="font-size:18px">Bientôt la première question…</p></div>`;
  if (e.phase === 'question' && e.maReponse == null) {
    return titre + `<div class="card"><p style="font-size:20px;margin:0">${esc(e.question.texte)}</p><p class="muted" style="margin:0">${e.derniere ? 'Dernière question : 5 points au plus rapide, puis 4, 3, 2, 1 !' : '2 points si tu es le plus rapide à répondre juste, sinon 1 point.'}</p></div>
      <div class="qz-boutons">${e.question.reponses.map((r, i) => `<button class="btn qz-btn" data-act="quizRepondre" data-choix="${i}"><span class="qz-lettre">${r.lettre}</span>${esc(r.texte)}</button>`).join('')}</div>`;
  }
  if (e.phase === 'question') return titre + `<div class="card center"><p style="font-size:18px">✓ Réponse envoyée. On attend les autres…</p><p class="muted">Tes points : ${e.points}</p></div>`;
  return titre + `<div class="card ${e.juste ? 'accent' : ''} center"><div class="huge" style="font-size:40px">${e.juste ? '✓' : e.maReponse == null ? '⏱️' : '✗'}</div>
    <p style="font-size:20px">${e.juste ? `Bonne réponse ! <strong>+${e.gain} point${e.gain > 1 ? 's' : ''}</strong>` : e.maReponse == null ? 'Pas de réponse.' : 'Raté.'}</p>
    <p class="muted">La bonne réponse : <strong>${esc(e.bonne?.lettre || '')} ${esc(e.bonne?.texte || '')}</strong></p><p>Tes points : <strong>${e.points}</strong></p></div>`;
}

// « Qu'est-ce qui a changé ? » sur le téléphone : regarder l'écran, puis choisir l'objet disparu parmi 4.
function mjDisparu(e) {
  let h = `<span class="label" style="text-align:center">Manche ${e.manche} / ${e.total}${e.phase === 'question' || e.phase === 'memorise' ? ` · <strong class="mono" data-until="${e.fin}"></strong>` : ''}</span>`;
  if (!e.moi) return h + '<div class="card"><p style="font-size:18px">🧠 Jeu de mémoire en cours : regarde l\'écran !</p></div>';
  if (e.phase === 'memorise') return h + `<div class="card turn center"><div class="huge" style="font-size:44px">👀</div><p style="font-size:20px">Regarde bien l'écran et retiens tous les objets !</p></div>`;
  if (e.phase === 'noir') return h + `<div class="card center"><div class="huge" style="font-size:44px">⏳</div><p style="font-size:18px">Prépare-toi…</p></div>`;
  if (e.phase === 'question') {
    if (e.moi.reponse) return h + `<div class="card center"><p style="font-size:18px">✓ Réponse envoyée : <strong>${esc(e.moi.reponse)}</strong></p><p class="muted">On attend les autres…</p></div>`;
    return h + `<div class="card"><p style="font-size:18px;margin:0">Qu'est-ce qui a disparu ?</p><p class="muted" style="margin:0">Une seule réponse : plus tu es rapide, plus tu gagnes de points.</p></div>
      <div class="me-choix">${e.choix.map((o, i) => `<button class="btn" data-act="meRepondre" data-choix="${i}"><span style="font-size:40px">${esc(o.emoji || '❔')}</span>${esc(o.nom)}</button>`).join('')}</div>`;
  }
  const m = e.moi;
  return h + (m.juste
    ? `<div class="card accent center"><div class="huge" style="font-size:40px">✓</div><p style="font-size:20px">Bravo ! +${m.points} points</p><p class="muted">Ton total : ${m.score}</p></div>`
    : `<div class="card center"><p style="font-size:20px">${m.reponse ? '✗ Raté' : 'Pas de réponse'} : c'était ${esc(e.manquant?.emoji || '')} <strong>${esc(e.manquant?.nom || '')}</strong></p><p class="muted">Ton total : ${m.score}</p></div>`);
}

// « L'Anecdote » sur le téléphone : le joueur écrit une anecdote sur lui ; les autres relient chaque anecdote à son auteur.
function mjAnecdote(e) {
  if (e.monMot !== undefined) { // je joue
    if (e.phase === 'ecriture') {
      return `<div class="card turn center"><div class="huge" style="font-size:34px">✍️ Ton anecdote</div><p>Écris une anecdote vraie sur toi. Moins les autres te reconnaissent, mieux c'est !</p></div>
        <label class="field"><span class="label">Ton anecdote</span><textarea class="in" id="mj-def" rows="5" maxlength="300" style="font-size:18px" placeholder="Un jour, j'ai…">${esc(ui.mjDraft ?? e.maDef)}</textarea></label>
        <button class="btn primary big" data-act="mjEcrire">${e.maDef ? 'Modifier mon anecdote' : 'Envoyer mon anecdote'}</button>
        ${e.maDef ? '<p class="muted center" style="margin:0">✓ Envoyée. Tu peux encore la modifier.</p>' : ''}`;
    }
    if (e.phase === 'vote') return `<div class="card center"><p style="font-size:18px">Les autres essaient de deviner à qui est chaque anecdote… La tienne est l'<strong>anecdote ${esc(e.monMot)}</strong>.</p><p class="muted">Garde ton air innocent !</p></div>`;
    const moi = e.cartes?.find(c => c.mot === e.monMot), n = moi?.trouves ?? 0;
    return `<div class="card accent center"><p style="font-size:18px">${n ? `<strong>${n}</strong> personne${n > 1 ? 's t\'ont' : ' t\'a'} reconnu` : 'Personne ne t\'a reconnu ! 🕵️'}</p><p class="muted">Total : ${e.totaux?.[V.game.nom] ?? 0} · le moins reconnu gagne</p></div>`;
  }
  // je ne joue pas : je devine
  if (e.phase === 'ecriture') return `<div class="card"><p style="font-size:18px">${e.joueurs.map(esc).join(', ')} écrivent une anecdote sur eux.</p><p class="muted">Prépare-toi : tu vas deviner qui a vécu quoi !</p></div>`;
  if (e.phase === 'vote') {
    const pris = Object.values({ ...(e.mesLiens || {}), ...ui.mjLiens }).filter(Boolean);
    return `<div class="card"><p style="font-size:18px">Relie chaque anecdote à la personne qui l'a vécue.</p></div><div class="mj-vote">${e.cartes.map(c => {
      const v = ui.mjLiens[c.mot] ?? e.mesLiens?.[c.mot] ?? '';
      return `<div class="card"><strong style="font-size:18px;color:var(--accent)">Anecdote ${esc(c.mot)}</strong><p>${esc(c.def)}</p>
        <select class="in" data-mj-lien="${esc(c.mot)}"><option value="">À qui est cette anecdote ?</option>${e.joueurs.map(p => `<option value="${esc(p)}" ${v === p ? 'selected' : ''} ${v !== p && pris.includes(p) ? 'disabled' : ''}>${esc(p)}</option>`).join('')}</select></div>`;
    }).join('')}</div>
      <button class="btn primary big" data-act="mjVoter">${e.mesLiens ? 'Modifier mes réponses' : 'Envoyer mes réponses'}</button>
      ${e.mesLiens ? '<p class="muted center" style="margin:0">✓ Envoyées. Tu peux encore les modifier.</p>' : ''}`;
  }
  return e.bons != null ? `<div class="card accent center"><p style="font-size:20px">Tu as trouvé <strong>${e.bons}</strong> / ${e.cartes.length}</p><p class="muted">Total : ${e.mesBons} bonne${e.mesBons > 1 ? 's' : ''} réponse${e.mesBons > 1 ? 's' : ''}. Les 3 meilleurs devineurs gagnent 3, 2 et 1 points !</p></div>` : '<div class="card"><p>Regarde les réponses sur l\'écran !</p></div>';
}

function miniJeux() {
  const g = V.game;
  const title = `<header class="ph-head"><h1 class="ph-title">${esc(V.gameName)}</h1>${g?.nom ? `<span class="pill accent">${esc(g.nom)}</span>` : ''}</header>`;
  if (!g) {
    return title + `<div class="card"><p style="font-size:18px">La journée n'a pas encore commencé.</p><p class="muted">Garde cette page ouverte : dès l'ouverture, tu pourras choisir ton nom.</p></div>`;
  }
  if (g.claim) {
    const q = (ui.mjQ || '').toLocaleLowerCase('fr');
    const list = g.libres.filter(n => !q || n.toLocaleLowerCase('fr').includes(q));
    return title + `<div class="card"><p style="font-size:18px">Qui es-tu ? Touche ton nom.</p><p class="muted" style="font-size:14px">Tu seras prévenu ici quand ce sera ton tour de jouer.</p></div>
      ${g.libres.length > 12 ? `<input class="in" id="mj-q" placeholder="Cherche ton nom…" value="${esc(ui.mjQ || '')}" autocomplete="off" style="font-size:18px">` : ''}
      <div class="mj-claim">${list.map(n => `<button type="button" data-mj-nom="${esc(n)}">${esc(n)}</button>`).join('') || '<p class="muted">Aucun nom libre. Demande à l\'organisateur.</p>'}</div>`;
  }
  let h = title + `<p class="muted" style="margin:0;font-size:14px">🏆 ${g.rang}<sup>e</sup> sur ${g.sur} · ${g.points} pts · ${g.joues} round${g.joues > 1 ? 's' : ''} joué${g.joues > 1 ? 's' : ''} sur ${g.attendu.min}${g.attendu.max !== g.attendu.min ? ` à ${g.attendu.max}` : ''} prévus</p>`;
  if (g.finished) {
    h += `<div class="card accent center"><span class="label">Journée terminée</span><div class="huge">${g.rang}<sup style="font-size:.4em">e</sup></div><p>${g.points} points</p></div>`;
    if (g.podium) h += `<div class="card"><span class="label">Podium</span>${g.podium.map((r, i) => `<p>${['🥇', '🥈', '🥉'][i]} ${esc(r.nom)} · ${r.points} pts</p>`).join('')}</div>`;
    return h;
  }
  const t = g.monTour;
  if (t && t.status === 'annonce') {
    const ok = t.compris.includes(g.nom);
    h += `<div class="card turn center"><span class="label">Round ${t.n} · ${esc(t.nom)}</span><div class="huge">C'est ton tour !</div>
      ${t.type === 'anecdote' ? '<p style="font-size:18px">🤫 Ne dis à personne que tu joues ! Lis les règles ci-dessous.</p>' : `<p style="font-size:18px">Viens devant l'écran et lis les règles.</p><p class="muted">${esc(t.format)}</p><p>${mjAvecQui(t)}</p>`}</div>`;
    if (t.regles) h += `<div class="card"><span class="label">Règles</span><p style="white-space:pre-wrap">${esc(t.regles)}</p></div>`;
    const fin = t.inscrits ? `Le jeu commence à la fin des inscriptions des spectateurs, dans <strong class="mono" data-until="${t.inscriptionsFin}"></strong>.` : '';
    h += ok ? `<div class="card center"><p style="font-size:18px">✓ Compris !</p><p class="muted">${fin || `On attend les autres : ${t.compris.length} / ${t.joueurs.length}`}</p></div>`
      : `<button class="btn primary big" data-act="mjCompris">J'ai compris</button><p class="muted center" style="margin:0">${fin || 'Le jeu commence quand tous les joueurs ont appuyé.'}</p>`;
  } else if (t && (g.etat?.type === 'definition' || g.etat?.type === 'anecdote')) {
    h += mjDefinition(g.etat, t);
  } else if ((g.etat?.type === 'definition' || g.etat?.type === 'anecdote') && (!g.actif?.inscrits || g.inscrit)) {
    h += mjDefinition(g.etat);
  } else if (g.etat?.type === 'temple') {
    h += mjTemple(g.etat);
  } else if (g.etat?.type === 'mime') {
    h += mjMime(g.etat);
  } else if (g.etat?.type === 'quiz') {
    h += mjQuizTel(g.etat);
  } else if (g.etat?.type === 'disparu') {
    h += mjDisparu(g.etat);
  } else if (g.etat?.type === 'dragon') {
    h += mjDragon(g.etat);
  } else if (t) {
    h += `<div class="card turn center"><span class="label">Round ${t.n} · ${esc(t.nom)}</span><div class="huge" style="font-size:44px">À toi de jouer !</div><p>${mjAvecQui(t)}</p><p class="muted">Suis les consignes de l'écran.</p></div>`;
    if (t.regles) h += `<div class="card"><span class="label">Règles</span><p style="white-space:pre-wrap">${esc(t.regles)}</p></div>`;
  } else {
    if (g.actif?.tirage) h += `<div class="card turn center"><span class="label">Round ${g.actif.n} · ${esc(g.actif.nom)}</span><div class="huge" style="font-size:40px">🎰</div><p style="font-size:20px">Tirage au sort en cours : regarde l'écran !</p></div>`;
    // jeux avec spectateurs : 2 min pour s'inscrire après le tirage
    else if (g.actif?.status === 'annonce' && g.actif.inscrits) h += `<div class="card${g.inscrit ? '' : ' turn'} center"><span class="label">Round ${g.actif.n} · ${esc(g.actif.nom)}</span>
      <p>${g.actif.joueurs.map(esc).join(', ')} jouent.</p>
      ${g.inscrit ? '<p style="font-size:20px">✓ Inscrit : tu devineras pendant ce round !</p>' : '<p style="font-size:18px">Inscris-toi pour deviner et gagner un bonus.</p><button class="btn primary big" data-act="mjInscrire">Je m\'inscris pour deviner</button>'}
      <p class="muted">Fin des inscriptions dans <strong class="mono" data-until="${g.actif.inscriptionsFin}"></strong> · ${g.actif.inscrits.length} inscrit${g.actif.inscrits.length > 1 ? 's' : ''}</p></div>`;
    else if (g.actif?.inscrits && !g.inscrit && g.actif.status === 'jeu') h += `<div class="card"><span class="label">Round ${g.actif.n} en cours · ${esc(g.actif.nom)}</span><p>Tu n'es pas inscrit pour deviner ce round. Regarde l'écran !</p></div>`;
    else if (g.actif) h += `<div class="card"><span class="label">Round ${g.actif.n} en cours · ${esc(g.actif.nom)}</span><p>${g.actif.joueurs.map(esc).join(', ')} ${g.actif.joueurs.length > 1 ? 'jouent' : 'joue'}. Regarde l'écran !</p></div>`;
    if (g.prochain) h += `<div class="card"><span class="label">Prochain round</span><p style="font-size:20px"><strong class="mono">${hm(g.prochain.at)}</strong> · ${esc(g.prochain.nom)}</p>
      <p class="muted">${g.prochain.taille} joueur${g.prochain.taille > 1 ? 's' : ''} tirés au sort ${g.salves ? 'à cette heure' : `${Math.round(g.annonce / 60)} min avant`}. Garde cette page ouverte : ton téléphone vibrera si c'est toi.</p></div>`;
  }
  if (g.devine && !t) h += `<div class="card${g.devine.bonus ? ' accent' : ''}"><span class="label">Round ${g.devine.n} · tu devinais</span><p>${g.devine.bons} bonne${g.devine.bons > 1 ? 's' : ''} réponse${g.devine.bons > 1 ? 's' : ''} · ${g.devine.rang}<sup>${g.devine.rang === 1 ? 'er' : 'e'}</sup> sur ${g.devine.sur}${g.devine.bonus ? `, <strong>+${g.devine.bonus} pt${g.devine.bonus > 1 ? 's' : ''}</strong> 🎉` : ''}</p></div>`;
  if (g.dernier && !t) h += `<div class="card"><span class="label">Ton dernier round</span><p>Round ${g.dernier.n} · ${esc(g.dernier.nom)} : ${g.dernier.place === 1 ? '🥇 ' : ''}${g.dernier.place}<sup>e</sup>, +${g.dernier.points} pts</p></div>`;
  h += `<button class="btn sm" data-act="mjPasMoi" style="align-self:flex-start;margin-top:8px">Ce n'est pas moi</button>`;
  return h;
}

// ---------- rendu ----------
// Téléphone de test : lancer le test d'un mini-jeu d'ici, puis y jouer (le téléphone prend « Incarné 1 » tout seul).
function testPanel() {
  const s = V.simulation;
  if (!TEL_TEST || !s) return '';
  const lien = `<a class="muted" href="${SJ.base}/ecran?test" target="_blank" rel="noopener">📺 Ouvrir l'écran de test</a>`;
  if (s.running) return `<div class="card test-panel"><strong>🧪 Test en cours</strong><p class="muted" style="margin:0">${esc(s.step)}</p><button class="btn sm" data-act="testArreter">Arrêter le test</button>${lien}</div>`;
  ui.testType ??= s.tests[0]?.[0];
  return `<div class="card test-panel"><strong>🧪 Tester un mini-jeu</strong>
    <select class="in" id="test-type">${s.tests.map(([k, n]) => `<option value="${k}" ${k === ui.testType ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
    <select class="in" id="test-nb">${[1, 2, 3, 4, 5, 6].map(k => `<option value="${k}" ${k === (ui.testNb || 1) ? 'selected' : ''}>${k} vrai${k > 1 ? 's' : ''} joueur${k > 1 ? 's' : ''} (téléphones) avec les bots</option>`).join('')}</select>
    <button class="btn primary" data-act="testLancer">▶ Lancer et jouer</button>${lien}</div>`;
}
function draw() {
  if (!V) return;
  // test lancé d'ici : dès que la place « Incarné 1 » est libre, le téléphone la prend
  if (ui.autoIncarne && V.game?.claim && V.game.libres?.includes('Incarné 1')) {
    ui.autoIncarne = false;
    SJ.emit('reclamer', { nom: 'Incarné 1' }).then(r => { if (r.ok) { SJ.store(CLE_TOKEN, r.token); hello(); } });
  }
  // téléphone de test sans test en cours : seulement le panneau (pas les noms de la vraie soirée)
  if (TEL_TEST && !V.simulation?.running) { app.className = 'phone'; SJ.render(app, testPanel() + '<div class="card"><p style="font-size:18px">Aucun test en cours.</p><p class="muted">Choisis un mini-jeu et lance-le : ce téléphone y jouera comme un vrai joueur.</p></div>'); return; }
  if (V.gameId === 'minijeux') { app.className = 'phone'; SJ.render(app, testPanel() + miniJeux()); return; }
  if (!V.me) { app.className = 'phone'; if (!document.getElementById('join')) SJ.render(app, testPanel() + joinScreen()); return; }
  let html;
  if (V.game && !V.game.spectator) {
    html = V.gameId === 'chemin' ? chemin(V.game) : V.gameId === 'grandpari' ? grandpari(V.game) : V.gameId === 'enquete' ? enquete(V.game) : duel(V.game);
  } else if (V.status === 'playing' || V.status === 'finished') {
    app.className = 'phone';
    html = head() + `<div class="card"><p style="font-size:18px">${V.status === 'playing' ? 'Partie en cours.' : 'Partie terminée.'}</p><p class="muted">Tu n'es pas inscrit à ce jeu. Regarde l'écran !</p></div>`;
  } else {
    app.className = 'phone';
    html = waitingScreen();
  }
  SJ.render(app, testPanel() + html);
  if (V.gameId === 'enquete' && typeof Taches !== 'undefined') Taches.apres(V.game?.tache, { lance: ui.tacheLancee === V.game?.tache?.cle, act });
}

// Téléphone de test : lancer ou arrêter un test (mot de passe admin demandé une fois, gardé sur ce téléphone).
app.addEventListener('change', e => { if (e.target.id === 'test-type') ui.testType = e.target.value; if (e.target.id === 'test-nb') ui.testNb = Number(e.target.value); });
app.addEventListener('click', async e => {
  const t = e.target.closest('[data-act="testLancer"], [data-act="testArreter"]');
  if (!t) return;
  const password = SJ.store('sj-admin') || prompt('Mot de passe admin');
  if (!password) return;
  const lancer = t.dataset.act === 'testLancer';
  const r = await SJ.emit('testMiniJeu', lancer ? { password, type: ui.testType, moi: ui.testNb || 1 } : { password, cmd: 'stop' });
  SJ.toast(r);
  if (!r.ok) { if (/mot de passe/i.test(r.msg || '')) SJ.store('sj-admin', null); return; }
  SJ.store('sj-admin', password);
  if (lancer) { SJ.store(CLE_TOKEN, null); ui.autoIncarne = true; hello(); } // nouvelle identité de test pour ce test
});

// Mini-Jeux : le joueur touche son nom dans la liste.
app.addEventListener('click', async e => {
  const b = e.target.closest('[data-mj-nom]');
  if (!b) return;
  const r = await SJ.emit('reclamer', { nom: b.dataset.mjNom });
  SJ.toast(r);
  if (r.ok) { SJ.store(CLE_TOKEN, r.token); ui.mjQ = ''; hello(); }
});
app.addEventListener('input', e => {
  if (e.target.id === 'mj-q') { ui.mjQ = e.target.value; draw(); }
  if (e.target.id === 'mj-def') ui.mjDraft = e.target.value;
  if (e.target.id === 'mm-essai') ui.mmDraft = e.target.value;
});
app.addEventListener('change', e => { const m = e.target.dataset.mjLien; if (m != null) { ui.mjLiens[m] = e.target.value; draw(); } });

app.addEventListener('submit', async e => {
  if (e.target.id === 'reprise') {
    e.preventDefault();
    const name = document.getElementById('reprise-nom').value;
    const r = await SJ.emit('reprendre', { name, code: document.getElementById('reprise-code').value });
    SJ.toast(r);
    if (!r.ok) return;
    ui.reprise = false;
    SJ.store(CLE_TOKEN, r.token);
    SJ.store('sj-nom', name.trim());
    hello();
    return;
  }
  if (e.target.id !== 'join') return;
  e.preventDefault();
  const r = await SJ.emit('rejoindre', { name: document.getElementById('nom').value });
  if (!r.ok) return SJ.toast(r);
  SJ.store(CLE_TOKEN, r.token);
  SJ.store('sj-nom', document.getElementById('nom').value.trim());
  hello();
});

app.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-weapon],[data-target],[data-pick],[data-tab],[data-sel],[data-add],[data-invest]');
  if (!t) return;
  if (t.dataset.tab) { ui.tab = t.dataset.tab; return draw(); }
  if (t.dataset.sel) { ui.sel = ui.sel === t.dataset.sel ? null : t.dataset.sel; return draw(); }
  if (t.dataset.add) {
    const id = t.dataset.add, wallet = V.game.wallet;
    const cur = id === 'mise' ? ui.mise : ui.inv[id.slice(4)] ?? 100;
    const v = t.dataset.v === 'all' ? wallet : Math.min(wallet, (Number(cur) || 0) + 50);
    if (id === 'mise') ui.mise = v; else ui.inv[id.slice(4)] = v;
    return draw();
  }
  if (t.dataset.invest) {
    const id = t.dataset.invest;
    return act({ type: 'investir', item: id, mise: ui.inv[id] ?? 100 });
  }
  if (t.dataset.weapon) { ui.weapon = ui.weapon === t.dataset.weapon ? null : t.dataset.weapon; ui.target = null; return draw(); }
  if (t.dataset.target) { ui.target = t.dataset.target; return draw(); }
  if (t.dataset.pick) {
    const p = t.dataset.pick;
    if (p in ui.alloc) delete ui.alloc[p]; else ui.alloc[p] = 0;
    return draw();
  }
  const a = t.dataset.act;
  if (a === 'reprise') { ui.reprise = true; SJ.render(app, testPanel() + joinScreen()); return; }
  if (a === 'mjCompris') { act({ type: 'compris' }); return; }
  if (a === 'mjInscrire') { act({ type: 'inscrire' }); return; }
  if (a === 'meRepondre') { act({ type: 'repondre', choix: Number(t.dataset.choix) }); return; }
  if (a === 'quizRepondre') { act({ type: 'repondre', choix: Number(t.dataset.choix) }); return; }
  if (a === 'drViser') { act({ type: 'viser' }); return; }
  if (a === 'drCibler') { act({ type: 'cibler', cible: t.dataset.cible }); return; }
  if (a === 'drTirer') { act({ type: 'tirer' }); navigator.vibrate?.(40); return; }
  if (a === 'drRecharger') { act({ type: 'recharger' }); return; }
  if (a === 'drCacher') { act({ type: 'cacher' }); return; }
  if (a === 'mmPret') { act({ type: 'pret' }); return; }
  if (a === 'mmPasser') { act({ type: 'passer' }); return; }
  if (a === 'mmDeviner') { mmDeviner(); return; }
  if (a === 'tpChoisir') { act({ type: 'choisir', chemin: Number(t.dataset.chemin) }); return; }
  if (a === 'mjEcrire') { const v = document.getElementById('mj-def')?.value || ''; act({ type: 'ecrire', texte: v }).then(r => { if (r.ok) ui.mjDraft = null; }); return; }
  if (a === 'mjVoter') {
    const liens = { ...(V.game.etat?.mesLiens || {}), ...ui.mjLiens };
    act({ type: 'voter', liens }).then(r => { if (r.ok) ui.mjLiens = {}; });
    return;
  }
  if (a === 'mjPasMoi') { if (confirm('Changer de nom ? Tu pourras choisir le bon dans la liste.')) act({ type: 'pasMoi' }); return; }
  if (a === 'inscrire') act({ type: 'inscription', on: true });
  if (a === 'desinscrire') {
    if (!confirm('Tu ne joueras pas à ce jeu. Te désinscrire ?')) return;
    SJ.store('sj-inscrit', null);
    act({ type: 'inscription', on: false });
  }
  if (a === 'aideAsk') { ui.aideConfirm = true; draw(); }
  if (a === 'aideNon') { ui.aideConfirm = false; draw(); }
  if (a === 'aide') act({ type: 'aide' }).then(() => { ui.aideConfirm = false; draw(); });
  if (a === 'ouvrirArme') { ui.showArme = true; draw(); }
  if (a === 'fermerArme') { ui.showArme = false; draw(); }
  if (a === 'attaque') act({ type: 'attaque', arme: ui.weapon, target: ui.target }).then(r => { if (r.ok) { ui.target = null; draw(); } });
  if (a === 'parier') act({ type: 'pari', alloc: ui.alloc });
  if (a === 'gpParier') {
    const [kind, x, y] = ui.sel.split(':');
    const sel = kind === 'buteur' ? `${x}:${y}` : x;
    act({ type: 'pari', bet: kind, sel, mise: ui.mise }).then(r => { if (r.ok) { ui.sel = null; draw(); } });
  }
});

app.addEventListener('input', e => {
  const m = e.target.dataset.mise;
  if (m) {
    const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
    if (m === 'mise') ui.mise = v; else ui.inv[m.slice(4)] = v;
    const btn = m === 'mise' ? app.querySelector('[data-act=gpParier]') : app.querySelector(`[data-invest="${m.slice(4)}"]`);
    if (btn) btn.textContent = (m === 'mise' ? 'Parier ' : 'Investir ') + money(v);
    return;
  }
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
// Le serveur n'envoie l'état que s'il change : on redessine quand même chaque seconde (tirage, couleurs du classement…).
setInterval(() => { if (V) draw(); }, 1000);
