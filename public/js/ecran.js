// Écran public (TV / vidéoprojecteur).
/* global SJ, Sons */
const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const { esc, fmt, money } = SJ;
let V = null;
// Fêtes déjà jouées : chaque victoire ou grand final ne déclenche qu'une seule pluie de confettis, une seule fois.
const celebrated = new Set();
let premierRendu = true; // une page ouverte ou rechargée sur un état déjà terminé ne refait pas la fête
function celebrate(key, ms, extra) {
  if (celebrated.has(key)) return;
  celebrated.add(key);
  if (premierRendu) return;
  SJ.confetti(ms);
  extra?.();
}

SJ.sock.on('connect', () => SJ.emit('hello', { role: 'ecran' }));
SJ.sock.on('etat', v => { V = v; document.body.dataset.game = v.gameId; draw(); });
SJ.sock.on('sfx', n => { if (n === 'boom') Sons.boom(); if (n === 'victoire') Sons.fanfare(); if (n === 'annonce') Sons.gong(); });

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
// QR code pour rejoindre : grand sur l'écran d'attente, petit dans un coin pendant les jeux.
function qrBlock(big) {
  const local = /^http:\/\/(\d+\.){3}\d+/.test(V.joinUrl || '');
  return `<div class="stack center" style="align-items:center;gap:1vh">
    <img class="qr" src="${V.qr}" alt="QR code pour rejoindre la soirée" style="${big ? '' : 'width:clamp(90px,8vw,130px)'}">
    <span class="mono muted" style="font-size:${big ? 'clamp(12px,1.1vw,18px)' : '11px'}">${esc(V.joinUrl)}</span>
    ${big && local ? '<span class="muted">Connecte-toi d\'abord au Wi-Fi</span>' : ''}</div>`;
}

function waiting() {
  if (V.gameId === 'minijeux') {
    return `<div style="flex:1;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5vw;align-items:center">
      <div class="stack" style="gap:3vh;min-width:0">
        <div class="label" style="font-size:18px">Bientôt</div><h1 class="sc-title" style="font-size:clamp(50px,8vw,130px)">${esc(V.gameName)}</h1>
        <p class="sc-sub">La journée n'a pas encore commencé.</p><p class="sc-sub muted">Scanne le QR code : dès l'ouverture, tu pourras choisir ton nom.</p></div>
      ${qrBlock(true)}</div>`;
  }
  if (V.status === 'idle' && !V.inscriptionsOpen) {
    return `<div style="flex:1;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5vw;align-items:center">
      <div class="stack" style="gap:3vh;min-width:0">
        <div class="label" style="font-size:18px">Prochain jeu</div><h1 class="sc-title" style="font-size:clamp(50px,8vw,130px)">${esc(V.gameName)}</h1>
        <p class="sc-sub">Scanne le QR code et entre ton prénom pour rejoindre la soirée.</p>
        <p class="sc-sub muted">Les inscriptions au jeu s'ouvriront sur ton téléphone.</p></div>
      ${qrBlock(true)}</div>`;
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
      ${qrBlock(true)}
    </div>`;
}

// ---------- jeu 4 : Les Mini-Jeux ----------
const hm = ts => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const MJ_TEAMS = [['Rouges', '#e7584f'], ['Bleus', '#5b9bf5'], ['Verts', '#43b8a6'], ['Jaunes', '#e5c13b'], ['Violets', '#a58cff'], ['Orange', '#f08a3c'], ['Roses', '#ec6fb5'], ['Gris', '#9aa1ae']];
// Joueurs d'un round : en équipes (« Rouges : Léa + Hugo  VS  Bleus : … ») ou en noms (chacun pour soi).
function mjPlayers(r) {
  if (!r.equipesNommees) return `<div class="mj-names">${r.joueurs.map(p => `<span>${esc(p)}</span>`).join('')}</div>`;
  return `<div class="mj-teams">${r.equipes.map((t, i) => { const [nom, c] = MJ_TEAMS[i] ?? [`Équipe ${i + 1}`, 'var(--accent)'];
    return `${i ? '<div class="mj-vs">VS</div>' : ''}<div class="mj-team" style="--t:${c}"><div class="mj-team-n">${esc(nom)}</div><div class="mj-names">${t.map(p => `<span>${esc(p)}</span>`).join('')}</div></div>`; }).join('')}</div>`;
}
// Joueurs du round avec leur « J'ai compris ».
function mjCompris(a) {
  return `<div class="mj-compris">${a.joueurs.map(p => `<span class="${a.compris.includes(p) ? 'on' : ''}">${a.compris.includes(p) ? '✓' : '…'} ${esc(p)}</span>`).join('')}</div>`;
}
// « La Définition » : écriture, vote, révélation.
// Le Temple aztèque : deux obstacles, puis le piège révélé, puis l'arrivée au temple.
function mjTemple(a, e) {
  const head = `<div class="mj-kicker">Round ${a.n} · ${esc(a.nom)} · étape ${e.etape} / ${e.total}</div>`;
  const coeurs = p => p.vies > 0 ? '❤️'.repeat(p.vies) + '<span class="tp-vide">' + '♥'.repeat(Math.max(0, e.viesMax - p.vies)) + '</span>' : '☠️';
  const chemin = `<div class="tp-chemin">${Array.from({ length: e.total }, (_, i) => `<span class="${i < e.etape - (e.phase === 'choix' ? 1 : 0) ? 'fait' : i === e.etape - 1 ? 'ici' : ''}"></span>`).join('')}<b>🏛️</b></div>`;
  if (e.phase === 'arrivee' || e.phase === 'fini') {
    const arrives = e.joueurs.filter(p => p.vies > 0).sort((x, y) => y.vies - x.vies);
    const morts = e.joueurs.filter(p => !(p.vies > 0)).sort((x, y) => y.mort - x.mort);
    return `${head}<div class="mj-round">🏛️ Le temple !</div>
      <div class="sc-sub">${arrives.length ? `${arrives.length > 1 ? 'Ils arrivent' : 'Arrivée'} au temple et récupère${arrives.length > 1 ? 'nt' : ''} le trésor 💰` : 'Personne n\'a survécu au chemin…'}</div>
      <div class="tp-joueurs">${arrives.map(p => `<div class="tp-j on"><strong>${esc(p.nom)}</strong><span>${coeurs(p)}</span></div>`).join('')}
        ${morts.map(p => `<div class="tp-j mort"><strong>${esc(p.nom)}</strong><span>☠️ étape ${p.mort}</span></div>`).join('')}</div>`;
  }
  const side = c => {
    const qui = e.phase === 'resultat' ? e.joueurs.filter(p => p.choix === c) : [];
    const piege = e.phase === 'resultat' && e.piege === c;
    return `<div class="tp-obs ${e.phase === 'resultat' ? (piege ? 'piege' : 'sur') : ''}"><div class="tp-fl">${c === 'gauche' ? '⬅' : '➡'}</div><div class="tp-nom">${esc(e[c])}</div>
      ${e.phase === 'resultat' ? `<div class="tp-msg">${piege ? `☠️ ${esc(e.message)}` : '✓ Passage sûr'}</div><div class="tp-qui">${qui.map(p => `<span>${esc(p.nom)}</span>`).join('') || '<span class="muted">personne</span>'}</div>` : ''}</div>`;
  };
  const sub = e.phase === 'choix'
    ? `À vos téléphones : quel passage ? · <strong class="mono" data-until="${e.fin}"></strong> · ${e.joueurs.filter(p => p.vies > 0 && p.choisi).length} / ${e.joueurs.filter(p => p.vies > 0).length} ont choisi`
    : e.joueurs.some(p => p.perdu) ? `${e.joueurs.filter(p => p.perdu).map(p => esc(p.nom)).join(', ')} ${e.joueurs.filter(p => p.perdu).length > 1 ? 'perdent' : 'perd'} une vie !` : 'Personne n\'est tombé dans le piège !';
  return `${head}${chemin}<div class="sc-sub">${sub}</div>
    <div class="tp-duel">${side('gauche')}<div class="tp-ou">ou</div>${side('droite')}</div>
    <div class="tp-joueurs">${e.joueurs.map(p => `<div class="tp-j ${p.vies > 0 ? '' : 'mort'} ${p.perdu ? 'perdu' : ''}"><strong>${esc(p.nom)}</strong><span>${coeurs(p)}</span>${e.phase === 'choix' && p.vies > 0 ? `<em>${p.choisi ? '✓' : '…'}</em>` : ''}</div>`).join('')}</div>`;
}

function mjDefinition(a, e) {
  const head = `<div class="mj-kicker">Round ${a.n} · ${esc(a.nom)} · manche ${e.manche} / ${e.total}</div>`;
  if (e.phase === 'ecriture') {
    return `${head}<div class="mj-round">Inventez une définition !</div>
      <div class="sc-sub">Chaque joueur a reçu un mot qui n'existe pas. Encore <strong class="mono" data-until="${e.fin}"></strong></div>
      <div class="mj-compris">${e.joueurs.map(p => `<span class="${e.ecrit.includes(p) ? 'on' : ''}">${e.ecrit.includes(p) ? '✓' : '✎'} ${esc(p)}</span>`).join('')}</div>
      <p class="sc-sub muted">Les autres : préparez-vous à deviner qui avait quel mot !</p>`;
  }
  const cards = `<div class="mj-cards">${e.cartes.map(c => `<div class="mj-card"><div class="mj-mot">${esc(c.mot)}</div><div class="mj-def">${esc(c.def)}</div>
    ${c.auteur ? `<div class="mj-auteur">${esc(c.auteur)} · <span class="p">${c.trouves} ${c.trouves > 1 ? 'ont trouvé' : 'a trouvé'}</span></div>` : ''}</div>`).join('')}</div>`;
  if (e.phase === 'vote') {
    return `${head}<div class="sc-sub">À vos téléphones : reliez chaque mot à ${e.joueurs.map(esc).join(', ')} · <strong class="mono" data-until="${e.fin}"></strong> · ${e.votants} / ${e.spectateurs} ont répondu</div>${cards}`;
  }
  return `${head}<div class="sc-sub">Les réponses !</div>${cards}`;
}
function mjSide(g, title = 'Classement de la journée') {
  const rows = g.classement.filter(r => r.points || g.faits).slice(0, 12);
  return `<aside class="mj-side"><div class="label" style="font-size:clamp(13px,1.1vw,18px)">${esc(title)}</div>
    ${rows.length ? `<ol class="mj-rank">${rows.map(r => `<li><span class="r">${r.rang}.</span><span>${esc(r.nom)}</span><span class="p">${r.points}</span></li>`).join('')}</ol>` : '<p class="muted" style="margin:0">Pas encore de points.</p>'}</aside>`;
}
function minijeux(g) {
  const pos = `Round ${Math.min(g.faits + (g.actif ? 1 : 0), g.total) || 1} / ${g.total}`;
  if (g.finished) {
    const [a, b, c] = g.classement;
    const step = (r, h, medal) => r ? `<div class="stack" style="align-items:center;gap:1vh;flex:1"><div style="font-size:clamp(40px,5vw,80px)">${medal}</div>
      <div style="font:800 clamp(26px,3.4vw,58px)/1 var(--display);text-transform:uppercase;text-align:center">${esc(r.nom)}</div><div class="mono" style="color:var(--accent);font-size:clamp(18px,2vw,32px)">${r.points} pts</div>
      <div style="width:100%;height:${h}vh;background:var(--accent-soft);border:1px solid var(--accent);border-radius:12px 12px 0 0"></div></div>` : '<div style="flex:1"></div>';
    celebrate(`mj:${V.sessionId || ''}:fin`, 9000, () => Sons.fanfare());
    return `<header class="sc-head"><h1 class="sc-title">${esc(V.gameName)} · podium</h1><div class="sc-sub muted">${g.faits} rounds joués</div></header>
      <div style="flex:1;display:flex;align-items:flex-end;gap:3vw;padding:0 6vw">${step(b, 22, '🥈')}${step(a, 34, '🥇')}${step(c, 14, '🥉')}</div>
      <div class="names" style="justify-content:center">${g.classement.slice(3, 18).map(r => `<span>${r.rang}. ${esc(r.nom)} · ${r.points}</span>`).join('')}</div>`;
  }
  let main;
  const a = g.actif;
  if (a && a.status === 'annonce') {
    main = `<div class="mj-kicker">Round ${a.n} · ${esc(a.format)} · venez devant l'écran !</div><div class="mj-round">${esc(a.nom)}</div>
      ${mjPlayers(a)}
      ${a.regles ? `<div class="mj-rules mj-rules-page">${esc(a.regles)}</div>` : ''}
      <div class="sc-sub">Le jeu commence quand chaque joueur a appuyé sur <strong>« J'ai compris »</strong> : ${a.compris.length} / ${a.joueurs.length}</div>
      ${mjCompris(a)}`;
  } else if (a && a.status === 'jeu' && g.etat?.type === 'definition') {
    main = mjDefinition(a, g.etat);
  } else if (a && a.status === 'jeu' && g.etat?.type === 'temple') {
    main = mjTemple(a, g.etat);
  } else if (a) {
    main = `<div class="mj-kicker">Round ${a.n} en cours · ${esc(a.format)} · <span class="mono" data-since="${a.debutAt}"></span></div><div class="mj-round">${esc(a.nom)}</div>
      ${mjPlayers(a)}
      ${a.regles ? `<div class="mj-rules">${esc(a.regles)}</div>` : ''}`;
  } else if (g.recent) {
    const r = g.recent;
    const list = r.equipes.map((t, i) => ({ t, i, ...(r.points?.[t[0]] || {}) })).sort((x, y) => (x.place ?? 99) - (y.place ?? 99));
    const who = x => r.equipesNommees ? `<span style="color:${MJ_TEAMS[x.i]?.[1] ?? 'var(--accent)'}">${esc(MJ_TEAMS[x.i]?.[0] ?? `Équipe ${x.i + 1}`)}</span> · ${x.t.map(esc).join(' + ')}` : esc(x.t[0]);
    main = `<div class="mj-kicker">Résultats du round ${r.n}</div><div class="mj-round">${esc(r.nom)}</div>
      <ol class="mj-results">${list.map(x => `<li><span>${x.place === 1 ? '🥇' : x.place === 2 ? '🥈' : x.place === 3 ? '🥉' : `${x.place}<sup>e</sup>`}</span><span>${who(x)}</span><span class="p">+${x.points ?? 0}</span></li>`).join('')}</ol>
      ${r.devineurs?.length ? `<div class="label" style="font-size:clamp(13px,1.1vw,18px);margin-top:2vh">Meilleurs devineurs</div>
        <ol class="mj-results mj-devineurs">${r.devineurs.slice(0, 5).map(x => `<li><span>${x.rang}<sup>${x.rang === 1 ? 'er' : 'e'}</sup></span><span>${esc(x.nom)} · ${x.bons} bonne${x.bons > 1 ? 's' : ''} réponse${x.bons > 1 ? 's' : ''}</span><span class="p">${r.bonus?.[x.nom] ? `+${r.bonus[x.nom]}` : ''}</span></li>`).join('')}</ol>` : ''}`;
  } else if (g.prochain) {
    const p = g.prochain;
    const first = g.faits === 0 && g.rounds.every(r => r.status === 'prevu' || r.status === 'saute');
    const upcoming = g.rounds.filter(r => r.status === 'prevu').slice(first ? 0 : 1, (first ? 0 : 1) + 4);
    main = `<div class="mj-kicker">${first ? 'La journée commence bientôt' : 'Prochain round'} · round ${p.n}</div>
      <div class="mj-round">${esc(p.nom)}</div>
      <div class="sc-sub">à <strong class="mono">${hm(p.at)}</strong> · dans <strong class="mono" data-until="${p.at}"></strong> · ${p.equipesNommees ? esc(p.format) : `${p.taille} joueur${p.taille > 1 ? 's' : ''}`} tirés au sort</div>
      ${first ? `<div class="grid-auto" style="grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:3vw">
          <div class="stack" style="gap:1.4vh"><p class="sc-sub" style="margin:0">Scanne le QR code et touche ton nom pour être prévenu quand c'est ton tour.</p>
          <div class="mj-people">${g.participants.map(x => `<span class="${x.connecte ? 'on' : ''}">${esc(x.nom)}</span>`).join('')}</div></div>${qrBlock(true)}</div>`
        : (p.regles ? `<div class="mj-rules">${esc(p.regles)}</div>` : '')}
      ${!first && upcoming.length ? `<div class="label" style="font-size:clamp(13px,1.1vw,18px)">Ensuite</div><ul class="mj-next">${upcoming.map(r => `<li><span class="t">${hm(r.at)}</span><span>Round ${r.n} · ${esc(r.nom)}</span></li>`).join('')}</ul>` : ''}`;
  } else {
    main = '<div class="mj-round">Fin des rounds</div>';
  }
  return `${head(`${pos} · ${g.inscrits} / ${g.participants.length} connectés`)}<div class="mj-grid"><section class="mj-main">${main}</section>${mjSide(g)}</div>`;
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
  return rankBoard(g.bettors, 'Les éliminés parient sur leur téléphone. Le classement apparaîtra ici.');
}

// Classement avec flèches ▲ ▼ (les lignes glissent au rendu, voir draw()).
function rankBoard(list, empty) {
  const now = Date.now();
  if (!list.length) return `<p class="muted">${empty}</p>`;
  return `<ol class="board" id="board">${list.map((b, i) => {
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

// ---------- jeu 3 : Le Grand Pari ----------
function gpNext(g) {
  const sp = g.sports[g.k];
  const now = SJ.now();
  const closed = now >= g.closeAt;
  const opt = g.options;
  let odds = '';
  if (sp.id === 'chevaux' && opt) odds = `<p class="muted" style="margin:0">Gains selon la place : ${opt.gains.filter(x => x > 0).map((x, i) => `${i + 1}<sup>er</sup> ×${String(x).replace('.', ',')}`).join(' · ')}</p>`;
  if (sp.id === 'foot' && opt) {
    const [A, B] = opt.equipes;
    odds = `<div class="row" style="gap:10px;font-size:clamp(16px,1.5vw,22px)"><span class="pill" style="background:${A.couleur};color:${A.bord}">${esc(A.nom)} ×${opt.coteVainqueur}</span>
      <span class="pill">Nul ${opt.odds ? '×' + String(opt.odds.nul).replace('.', ',') : '…'}</span><span class="pill" style="background:${B.couleur};color:${B.bord}">${esc(B.nom)} ×${opt.coteVainqueur}</span></div>`;
  }
  if (sp.id === 'boxe' && opt) odds = `<p class="muted" style="margin:0">${opt.boxeurs.length} combattants · 1<sup>er</sup> ×${opt.gains.premier} · top 3 ×${opt.gains.top3} · top ${opt.gains.n25} ×${String(opt.gains.top25).replace('.', ',')} · top ${opt.gains.n50} remboursé</p>`;
  const soon = !closed && g.closeAt - now < 30000;
  return `<div class="card" style="gap:1.4vh;padding:2.4vh 2vw">
      <div class="label" style="font-size:15px">${closed ? 'Paris fermés · départ dans' : soon ? 'Les paris ferment dans' : 'Prochain sport'}</div>
      <div style="font:400 clamp(34px,4.4vw,70px)/1 var(--display)">${sp.icon} ${esc(sp.name)}</div>
      <div class="sc-big" style="font-size:clamp(70px,11vw,170px);color:${closed || soon ? 'var(--danger)' : 'var(--text)'}"><span data-until="${closed ? sp.at : soon ? g.closeAt : sp.at}"></span></div>
      ${closed ? '' : `<div class="sc-sub">Pariez sur votre téléphone · <strong>${money(g.betsTotal)}</strong> misés (${g.betsCount} paris)</div>`}
      ${odds}
    </div>`;
}

function gpBlock(b) {
  if (!b || !b.items.length) return '';
  return `<div class="stack" style="gap:1vh"><div class="spread"><span class="label" style="font-size:14px">Investissements · fin au départ du sport</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px">${b.items.map(it => {
      const pa = Math.min(100, Math.round(it.total / it.needAmount * 100)), pi = Math.min(100, Math.round(it.investors / it.needInvestors * 100));
      const done = pa >= 100 && pi >= 100;
      return `<div class="card" style="gap:6px;${done ? 'border-color:var(--ok)' : ''}">
        <strong style="font-size:clamp(16px,1.4vw,22px)">${it.emoji} ${esc(it.nom)}</strong>
        <span class="muted" style="font-size:14px">Gain ×${String(it.gain).replace('.', ',')} · échec : ${it.remb} % rendus</span>
        <span class="label">${money(it.total)} / ${money(it.needAmount)}</span><div class="gauge"><i style="width:${pa}%"></i></div>
        <span class="label">${it.investors} / ${it.needInvestors} investisseurs</span><div class="gauge people"><i style="width:${pi}%"></i></div>
      </div>`;
    }).join('')}</div></div>`;
}

function grandpari(g) {
  const steps = g.sports.map((s, i) => `<span class="pill ${s.status === 'fini' ? 'ok' : i === g.k ? 'accent' : ''}" style="font-size:14px">${s.icon} ${esc(s.name)}${s.status === 'fini' ? ' ✓' : ''}</span>`).join('');
  let h = head(`<div class="row">${steps}</div>`);
  h += `<div class="tree-layout"><div class="stack" style="gap:2.4vh;min-width:0">${g.phase === 'entre' ? gpNext(g) + gpBlock(g.block) : ''}
      ${g.feed.length ? `<div class="feed" style="font-size:clamp(14px,1.3vw,20px)">${g.feed.slice(0, 3).map(f => `<div><span>${esc(f.text)}</span></div>`).join('')}</div>` : ''}</div>
    <aside class="stack" style="min-width:0"><div><h2 class="sc-title" style="font-size:clamp(22px,2vw,34px)">Les plus riches</h2><div class="label">Argent de chaque joueur</div></div>${rankBoard(g.richest, '')}</aside></div>`;
  if (g.finished && g.final) {
    h += `<div class="win"><div class="label" style="font-size:18px">${esc(V.gameName)}</div><h2>${esc(g.final[0].name)} est le plus riche !</h2>
      <p>${g.final.slice(0, 3).map((x, i) => `${['🥇', '🥈', '🥉'][i]} ${esc(x.name)} · ${money(x.value)}`).join('<br>')}</p></div>`;
  }
  return h;
}

// Film du sport en plein écran, rejoué depuis les données du serveur.
let replay = null, replayKey = null;
function gpOverlay(g) {
  if (!g.replay) return '';
  const key = g.replay.k + ':' + g.replay.startAt;
  if (key !== replayKey) {
    replayKey = key;
    replay = null;
    SJ.emit('jeuData', { k: g.replay.k }).then(d => { if (replayKey === key) replay = d; });
  }
  let res = '';
  if (g.phase === 'resultat' && g.result) {
    const r = g.result;
    let top = '';
    if (r.sport === 'foot') top = `<div class="sc-title" style="font-size:clamp(28px,3vw,48px)">${esc(r.equipes[0])} ${r.score[0]} - ${r.score[1]} ${esc(r.equipes[1])}</div>`;
    else top = `<div class="row" style="justify-content:center;gap:18px;font-size:clamp(18px,1.8vw,28px)">${r.podium.map((p, i) => `<span>${['🥇', '🥈', '🥉'][i]} <span style="display:inline-block;width:.8em;height:.8em;border-radius:3px;background:${p.couleur}"></span> ${esc(p.nom)}</span>`).join('')}</div>`;
    res = `<div class="gp-result">${top}
      ${g.bigWinners?.length ? `<div class="sc-sub">💰 ${g.bigWinners.map(w => `${esc(w.name)} <strong style="color:var(--ok)">+${money(w.gain)}</strong>`).join(' · ')}</div>` : '<div class="sc-sub muted">Personne n\'a gagné sur ce pari</div>'}</div>`;
  }
  return `<div class="sport-wrap"><canvas id="sportcv" width="1280" height="720"></canvas>${res}</div>`;
}
(function sportLoop() {
  const c = document.getElementById('sportcv');
  if (c && replay && V?.game?.replay) Sports.draw(c, replay, (SJ.now() - V.game.replay.startAt) / 1000);
  requestAnimationFrame(sportLoop);
})();

// ---------- classement de la soirée ----------
function soireeView(c, final) {
  const rows = c.rows;
  if (!rows.length) return '';
  const pts = x => String(Math.round(x * 10) / 10).replace('.', ',');
  if (final) {
    const [a, b, d] = rows;
    const step = (r, h, medal) => r ? `<div class="stack" style="align-items:center;gap:1vh;flex:1"><div style="font-size:clamp(40px,5vw,80px)">${medal}</div>
      <div style="font:400 clamp(26px,3.4vw,58px)/1 var(--display);text-align:center">${esc(r.name)}</div><div class="mono" style="color:var(--accent);font-size:clamp(18px,2vw,32px)">${pts(r.total)} pts</div>
      <div style="width:100%;height:${h}vh;background:var(--accent-soft);border:1px solid var(--accent);border-radius:12px 12px 0 0"></div></div>` : '<div style="flex:1"></div>';
    return `<header class="sc-head"><h1 class="sc-title">Champion de la soirée</h1><div class="sc-sub muted">${rows.length} joueurs</div></header>
      <div style="flex:1;display:flex;align-items:flex-end;gap:3vw;padding:0 6vw">${step(b, 22, '🥈')}${step(a, 34, '🥇')}${step(d, 14, '🥉')}</div>
      <div class="names" style="justify-content:center">${rows.slice(3, 15).map(r => `<span>${r.rank}. ${esc(r.name)} · ${pts(r.total)}</span>`).join('')}</div>`;
  }
  const now = Date.now();
  return `<header class="sc-head"><h1 class="sc-title">Classement de la soirée</h1><div class="sc-sub muted">${c.held.map(h => esc(h.name)).join(' · ')}</div></header>
    <ol class="board" id="board-soiree" style="columns:${rows.length > 12 ? 2 : 1};column-gap:3vw;display:block">${rows.slice(0, 24).map((r, i) => {
      const d = deltas['s:' + r.pid] && deltas['s:' + r.pid].until > now ? deltas['s:' + r.pid].d : 0;
      const cls = d > 0 ? 'up' : d < 0 ? 'down' : '';
      return `<li class="${cls}" data-pid="s:${r.pid}" style="break-inside:avoid;margin-bottom:8px;font-size:clamp(16px,1.5vw,24px)"><span class="rk">${i + 1}</span><span class="nm">${esc(r.name)}${r.mult > 1 ? ` <span class="muted" style="font-size:.7em">×${String(r.mult).replace('.', ',')}</span>` : ''}</span><span class="amt">${pts(r.total)} pts</span><span class="dl ${cls}">${d > 0 ? '▲ ' + d : d < 0 ? '▼ ' + -d : ''}</span></li>`;
    }).join('')}</ol>`;
}

// ---------- rendu ----------
function draw() {
  if (!V) return;
  const g = V.game;
  let html, ov = '';
  if (g && (V.status === 'playing' || V.status === 'finished')) {
    if (V.gameId === 'minijeux') html = minijeux(g);
    else if (V.gameId === 'chemin') html = chemin(g);
    else if (V.gameId === 'grandpari') {
      trackBettors(g.richest);
      html = grandpari(g);
      ov = gpOverlay(g);
    } else {
      trackBettors(g.bettors);
      html = duel(g);
      ov = duelOverlay(g);
    }
    const key = `${V.sessionId || ''}:${V.gameId}:${g.winner?.name ?? g.winner ?? g.final?.[0]?.name}`;
    if (g.finished && (g.winner || g.final)) celebrate(key, 7000);
  } else {
    html = waiting();
    Sons.marcher(false);
  }
  // Classement de la soirée : à la demande de l'admin, ou automatiquement 20 s après la fin d'un jeu (pendant 40 s).
  const since = V.status === 'finished' && V.finishedAt ? SJ.now() - V.finishedAt : -1;
  const mode = V.show || (since > 20000 && since < 60000 && V.gameId !== 'minijeux' ? 'classement' : null);
  if (mode && V.classement?.rows.length) {
    trackBettors(V.classement.rows.map(r => ({ pid: 's:' + r.pid })));
    ov = soireeView(V.classement, mode === 'final');
    if (mode === 'final') celebrate(`final:${V.classement.held?.length ?? 0}`, 9000, () => Sons.fanfare());
  }
  premierRendu = false;
  const before = {};
  document.querySelectorAll('#board li, #board-soiree li').forEach(li => { before[li.dataset.pid] = li.getBoundingClientRect().top; });
  SJ.render(app, html);
  // Petit QR code dans un coin pendant les jeux, pour ceux qui arrivent en retard.
  const mini = document.getElementById('qr-mini');
  const showMini = !ov && g && V.status === 'playing' && V.qr && !app.querySelector('img.qr');
  mini.hidden = !showMini;
  document.body.classList.toggle('with-qr', !!showMini);
  if (showMini && !mini.innerHTML) mini.innerHTML = `<img src="${V.qr}" alt="QR code pour rejoindre"><span>Rejoindre</span>`;
  overlay.hidden = !ov;
  if (ov) SJ.render(overlay, ov);
  // Classement des parieurs : les lignes glissent vers leur nouvelle place.
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('#board li, #board-soiree li').forEach(li => {
      const old = before[li.dataset.pid];
      if (old === undefined) return;
      const dy = old - li.getBoundingClientRect().top;
      if (dy) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 900, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }
  requestAnimationFrame(wires);
}
