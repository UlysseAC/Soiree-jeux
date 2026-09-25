// Écran public (TV / vidéoprojecteur).
/* global SJ, Sons */
const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const { esc, fmt, money } = SJ;
let V = null;
let celebrated = null;

SJ.sock.on('connect', () => SJ.emit('hello', { role: 'ecran' }));
SJ.sock.on('etat', v => { V = v; document.body.dataset.game = v.gameId; draw(); });
SJ.sock.on('sfx', n => { if (n === 'boom') Sons.boom(); if (n === 'victoire') Sons.fanfare(); });

const soundBtn = document.getElementById('sound');
soundBtn.addEventListener('click', async () => {
  await Sons.enable();
  soundBtn.hidden = true;
  SJ.keepAwake();
  document.documentElement.requestFullscreen?.().catch(() => {});
});

function head(right) {
  return `<header class="sc-head"><h1 class="sc-title">${esc(V.gameName)}</h1><div class="sc-sub muted">${right || ''}</div></header>`;
}

// ---------- avant le jeu ----------
function waiting() {
  if (V.status === 'idle' && !V.inscriptionsOpen) {
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3vh;text-align:center">
      <div class="label" style="font-size:18px">Prochain jeu</div><h1 class="sc-title" style="font-size:clamp(50px,9vw,140px)">${esc(V.gameName)}</h1>
      <p class="sc-sub muted">Le décompte va bientôt commencer</p></div>`;
  }
  const open = V.inscriptionsOpen;
  return `${head(`${V.registeredCount} inscrits`)}
    <div style="flex:1;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4vw;align-items:center">
      <div class="stack" style="gap:2vh;min-width:0">
        ${V.status === 'countdown' ? `<div class="label" style="font-size:16px">${V.paused ? 'Décompte en pause' : 'Début dans'}</div>
        <div class="sc-big">${V.paused ? fmt(V.remaining) : `<span data-until="${V.endsAt}"></span>`}</div>` : '<div class="sc-big" style="font-size:clamp(60px,9vw,140px)">Inscrivez-vous !</div>'}
        <div class="sc-sub">${open ? '<strong style="color:var(--accent)">Inscriptions ouvertes</strong> : scanne le QR code !' : `Inscriptions dans <strong class="mono" data-until="${V.inscriptionsAt}"></strong>`}</div>
        ${V.registered.length ? `<div class="names">${V.registered.map(n => `<span>${esc(n)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="stack center" style="align-items:center">
        <img class="qr" src="${V.qr}" alt="QR code pour rejoindre">
        <span class="mono muted" style="font-size:clamp(12px,1.1vw,18px)">${esc(V.joinUrl)}</span>
        <span class="muted">Connecte-toi d'abord au Wi-Fi</span>
      </div>
    </div>`;
}

// ---------- jeu 1 : Le Chemin ----------
function chemin(g) {
  const track = T => {
    const t = g.teams[T];
    const dots = Array.from({ length: t.total }, (_, i) => `<span class="${i < t.progress ? 'on' : ''}${i === t.progress && !g.finished ? ' cur' : ''}"></span>`).join('');
    return `<div class="track" style="color:var(--${T.toLowerCase()})">
      <div class="spread"><strong style="font:800 clamp(24px,2.6vw,42px) var(--display);text-transform:uppercase">Équipe ${T}</strong><span class="mono" style="font-size:clamp(20px,2vw,32px)">${t.progress} / ${t.total}</span></div>
      <div class="dots ${T.toLowerCase()}">${dots}</div></div>`;
  };
  let h = head(g.finished ? 'Partie terminée' : `Fin au plus tard dans <span class="mono" data-until="${g.endsAt}"></span>`);
  h += `<div style="flex:1;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:4vw;align-items:center">
    <div class="stack" style="gap:5vh">${track('A')}${track('B')}</div>
    <div class="stack"><div class="label">En direct</div><div class="feed">${g.feed.map(f => `<div><time>${new Date(f.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time><span>${esc(f.text)}</span></div>`).join('')}</div></div>
  </div>`;
  if (g.finished && g.winners) {
    h += `<div class="win"><div class="label" style="font-size:18px">${esc(V.gameName)} · terminé en ${fmt(g.winners.duration)}</div><h2>L'équipe ${g.winner} gagne !</h2>
      <div class="stack" style="gap:1vh"><span class="label">Le chemin</span><p>${g.winners.chain.map(esc).join(' · ')}</p></div>
      ${g.winners.detectives.length ? `<div class="stack" style="gap:1vh"><span class="label">Les détectives</span><p>${g.winners.detectives.map(esc).join(' · ')}</p></div>` : ''}</div>`;
  } else if (g.finished) {
    h += `<div class="win"><h2>Partie terminée</h2><p>Aucune équipe n'a gagné.</p></div>`;
  }
  return h;
}

// ---------- jeu 2 : Duel au Far West ----------
let lastOrder = [];
const deltas = {};
function trackBettors(list) {
  const order = list.map(b => b.pid);
  if (lastOrder.length && order.join() !== lastOrder.join()) {
    const until = Date.now() + 4500;
    order.forEach((p, i) => {
      const was = lastOrder.indexOf(p);
      if (was >= 0 && was !== i) deltas[p] = { d: was - i, until };
    });
  }
  const changed = order.join() !== lastOrder.join();
  lastOrder = order;
  return changed;
}

function duelTree(g) {
  const pr = g.primes;
  const cols = [];
  if (g.phase !== 'p2' && !g.bracket) {
    cols.push(`<div class="col"><div class="colhead"><b>En lice · ${g.alive.length}</b><span class="prime">${money(pr.tour)}<small>par tour</small></span></div>
      <div class="slots" style="justify-content:flex-start">${g.alive.map(p => `<div class="surv"><span>${esc(p.name)}</span>${SJ.hearts(p.lives, g.maxLives)}</div>`).join('')}</div></div>`);
    for (const R of g.rounds.slice(-1)) {
      cols.push(`<div class="col"><div class="colhead"><b>Tour ${R.n}</b><span class="prime">&nbsp;</span></div><div class="slots" style="justify-content:flex-start">${R.duels.map(d =>
        `<div class="m"><div class="p ${d.w ? (d.w === d.a ? 'won' : 'lost') : ''}"><span>${esc(d.a)}</span></div><div class="p ${d.w ? (d.w === d.b ? 'won' : 'lost') : ''}"><span>${esc(d.b)}</span></div></div>`).join('')}</div></div>`);
    }
  }
  const primeFor = { Quarts: pr.quart, Demies: pr.demi, Finale: pr.finaliste, Huitièmes: pr.quart };
  const rounds = g.bracket ? g.bracket.rounds : placeholderBracket(g.phase2Size);
  rounds.forEach((R, r) => {
    cols.push(`<div class="col" data-br="${r}"><div class="colhead"><b>${esc(R.name)}</b><span class="prime">${money(primeFor[R.name] ?? pr.quart)}<small>si éliminé</small></span></div>
      <div class="slots">${R.matches.map(m => {
        const P = x => x ? `<div class="p ${m.w ? (m.w === x.pid ? 'won' : 'lost') : ''}"><span>${esc(x.name)}</span></div>` : `<div class="p tbd"><span>${r === 0 && g.bracket ? '— qualifié d\'office' : '?'}</span></div>`;
        return `<div class="m${m.live ? ' live' : ''}">${P(m.a)}${P(m.b)}</div>`;
      }).join('')}</div></div>`);
  });
  const champ = g.finished && g.winner ? esc(g.winner.name) : '?';
  cols.push(`<div class="col" data-br="${rounds.length}"><div class="colhead"><b>Vainqueur</b><span class="prime">${money(pr.vainqueur)}</span></div><div class="slots"><div class="champ">${champ}</div></div></div>`);
  return `<div class="bracket-wrap"><div class="bracket" id="bracket"><svg id="wires" aria-hidden="true"></svg>${cols.join('')}</div></div>`;
}

function placeholderBracket(size) {
  const names = { 16: 'Huitièmes', 8: 'Quarts', 4: 'Demies', 2: 'Finale' };
  const out = [];
  for (let n = size; n >= 2; n /= 2) out.push({ name: names[n] ?? `${n} joueurs`, matches: Array.from({ length: n / 2 }, () => ({ a: null, b: null, w: null })) });
  return out;
}

function wires() {
  const br = document.getElementById('bracket'), svg = document.getElementById('wires');
  if (!br || !svg) return;
  const B = br.getBoundingClientRect();
  const cols = [...br.querySelectorAll('[data-br]')].map(c => [...c.querySelectorAll('.m, .champ')]);
  let out = '';
  for (let c = 0; c < cols.length - 1; c++) {
    cols[c].forEach((el, i) => {
      const tgt = cols[c + 1][i >> 1];
      if (!tgt) return;
      const a = el.getBoundingClientRect(), t = tgt.getBoundingClientRect();
      const x1 = a.right - B.left, y1 = a.top + a.height / 2 - B.top, x2 = t.left - B.left, y2 = t.top + t.height / 2 - B.top, mx = (x1 + x2) / 2;
      const done = el.querySelector('.p.won');
      out += `<path d="M${x1} ${y1}H${mx}V${y2}H${x2}" fill="none" stroke="${done ? 'var(--accent)' : 'var(--line)'}" stroke-width="${done ? 2 : 1.5}"/>`;
    });
  }
  svg.innerHTML = out;
}
addEventListener('resize', () => requestAnimationFrame(wires));

function board(g) {
  const now = Date.now();
  if (!g.bettors.length) return `<p class="muted">Les éliminés parient sur leur téléphone. Le classement apparaîtra ici.</p>`;
  return `<ol class="board" id="board">${g.bettors.map((b, i) => {
    const d = deltas[b.pid] && deltas[b.pid].until > now ? deltas[b.pid].d : 0;
    const cls = d > 0 ? 'up' : d < 0 ? 'down' : '';
    return `<li class="${cls}" data-pid="${b.pid}"><span class="rk">${i + 1}</span><span class="nm">${esc(b.name)}</span><span class="amt">${money(b.value)}</span><span class="dl ${cls}">${d > 0 ? '▲ ' + d : d < 0 ? '▼ ' + -d : ''}</span></li>`;
  }).join('')}</ol>`;
}

function duel(g) {
  const info = g.finished ? 'Partie terminée' : g.phase === 'prep' ? 'Mettez vos dossards !' : g.phase === 'p2' ? 'Face-à-face' : g.phase === 'p1' ? `Tour ${g.round} · ${g.alive.length} en lice` : `${g.alive.length} en lice`;
  let h = head(info);
  if (g.phase === 'pause') h += `<div class="pausebar"><span>Pause paris · les éliminés parient sur leur téléphone</span><span class="mono" data-until="${g.pauseUntil}"></span></div>`;
  h += `<div class="tree-layout">${duelTree(g)}<aside class="stack" style="min-width:0"><div><h2 class="sc-title" style="font-size:clamp(22px,2vw,34px)">Les parieurs</h2><div class="label">Gains des paris</div></div>${board(g)}</aside></div>`;
  if (g.finished && g.winner) h += `<div class="win"><div class="label" style="font-size:18px">${esc(V.gameName)}</div><h2>${esc(g.winner.name)} gagne !</h2><p>Prime : ${money(g.winner.prime)}</p></div>`;
  return h;
}

// Les duels recouvrent l'arbre en plein écran.
function duelOverlay(g) {
  const live = g.duels;
  if (!live.length || g.finished) { Sons.marcher(false); return ''; }
  const face = live.find(d => d.kind === 'face');
  if (face) {
    const now = SJ.now();
    const fire = face.status === 'fire' || (face.fireAt && now >= face.fireAt);
    Sons.marcher(face.status === 'steps' && !face.winner);
    let mid;
    if (face.winner) mid = `<div class="go" style="color:var(--accent);font-size:clamp(60px,9vw,150px)">${esc(face.winner === face.a.pid ? face.a.name : face.b.name)} gagne</div><div class="sc-sub muted">${esc(face.reason)}</div>`;
    else if (fire) mid = `<div class="go">FEU !</div>`;
    else mid = `<div class="steps">· pas · · pas · · pas ·</div><div class="label" style="font-size:16px">Ne tirez pas encore</div>`;
    return `<header class="sc-head"><h1 class="sc-title">${esc(face.title)}</h1><div class="sc-sub muted">Erreurs restantes · ${esc(face.a.name)} <b>${face.a.errors}</b> · ${esc(face.b.name)} <b>${face.b.errors}</b></div></header>
      <div class="fire"><div class="who">${esc(face.a.name)}<i>contre</i>${esc(face.b.name)}</div>${mid}</div>`;
  }
  Sons.marcher(false);
  if (g.roundType === 'sim' && g.roundDuels.length > 2) {
    const done = g.roundDuels.filter(d => d.w).length;
    return `<header class="sc-head"><h1 class="sc-title">Tour ${g.round} · tous en même temps</h1><div class="sc-sub muted"><b>${done}</b> duels terminés sur ${g.roundDuels.length}</div></header>
      <div class="ov-grid">${g.roundDuels.map(d => `<div class="sd${d.w ? ' done' : ''}"><span class="${d.w ? (d.w === d.a ? 'w' : 'l') : ''}">${esc(d.a)}</span><i>vs</i><span class="${d.w ? (d.w === d.b ? 'w' : 'l') : ''}">${esc(d.b)}</span></div>`).join('')}</div>`;
  }
  return `<div class="big-duels">${live.map(d => {
    const winner = d.winner ? (d.winner === d.a.pid ? d.a : d.b) : null;
    return `<div class="bd${winner ? ' done' : ''}"><div class="label" style="font-size:16px">${esc(d.title)}</div>
      <div class="vs">${esc(d.a.name)} ${SJ.hearts(d.a.lives, g.maxLives)}<i>contre</i>${esc(d.b.name)} ${SJ.hearts(d.b.lives, g.maxLives)}</div>
      ${winner ? `<div class="sc-sub" style="color:var(--accent)">${esc(winner.name)} gagne · ${esc(d.reason)}</div>` : `<div class="mono sc-sub" style="color:var(--accent)" data-since="${d.startedAt}"></div>`}</div>`;
  }).join('')}</div>`;
}

// ---------- rendu ----------
function draw() {
  if (!V) return;
  const g = V.game;
  let html, ov = '';
  if (g && (V.status === 'playing' || V.status === 'finished')) {
    if (V.gameId === 'chemin') html = chemin(g);
    else {
      trackBettors(g.bettors);
      html = duel(g);
      ov = duelOverlay(g);
    }
    const key = V.gameId + ':' + (g.winner?.name ?? g.winner);
    if (g.finished && g.winner && celebrated !== key) { celebrated = key; SJ.confetti(12000); }
  } else {
    html = waiting();
    Sons.marcher(false);
  }
  const before = {};
  document.querySelectorAll('#board li').forEach(li => { before[li.dataset.pid] = li.getBoundingClientRect().top; });
  SJ.render(app, html);
  overlay.hidden = !ov;
  if (ov) SJ.render(overlay, ov);
  // Classement des parieurs : les lignes glissent vers leur nouvelle place.
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('#board li').forEach(li => {
      const old = before[li.dataset.pid];
      if (old === undefined) return;
      const dy = old - li.getBoundingClientRect().top;
      if (dy) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 900, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }
  requestAnimationFrame(wires);
}
