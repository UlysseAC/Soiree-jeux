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
SJ.sock.on('etat', v => {
  V = v; document.body.dataset.game = v.gameId;
  // Décor aztèque pendant un round du Temple (annonce, partie, résultats).
  const mjr = v.gameId === 'minijeux' && v.game ? v.game.actif || v.game.recent : null;
  document.body.dataset.theme = mjr?.type === 'temple' ? 'temple' : '';
  if (v.gameId === 'minijeux' && v.game) { tpSons(v.game); mimeSons(v.game); dragonSons(v.game); memoSons(v.game); }
  TempleCarte.maj(v.gameId === 'minijeux' ? v.game?.etat : null);
  DragonScene.maj(v.gameId === 'minijeux' ? v.game?.etat : null);
  draw();
});
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
// Le Temple aztèque : deux obstacles, puis le piège révélé (après un roulement de tambour), puis l'arrivée au temple.
const TP_DELAI = 2400; // suspense avant la révélation du piège (ms), le même que --tp-delai en CSS
const TP_PYRAMIDE = `<svg class="tp-pyr" viewBox="0 0 120 92" aria-hidden="true"><g fill="currentColor"><rect x="48" y="2" width="24" height="16" rx="1"/><rect x="38" y="18" width="44" height="14"/><rect x="27" y="32" width="66" height="14"/><rect x="16" y="46" width="88" height="14"/><rect x="4" y="60" width="112" height="16"/></g><rect x="55" y="7" width="10" height="11" fill="rgba(0,0,0,.45)"/><rect x="56" y="32" width="8" height="44" fill="rgba(0,0,0,.22)"/><path d="M0 80h120v4H0z" fill="currentColor" opacity=".5"/></svg>`;
const TP_FISSURE = `<svg class="tp-fissure" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M48 0 L52 14 L44 24 L55 33 L47 45 L53 60 M52 14 L66 20 L72 31 M44 24 L30 28 L24 40 M55 33 L70 42"/></svg>`;
const tpTorche = () => `<div class="tp-torche" aria-hidden="true"><span class="tp-flamme">🔥</span><span class="tp-baton"></span></div>`;
const tpDecor = () => `<div class="tp-deco" aria-hidden="true"><span class="tp-liane l1">🌿</span><span class="tp-liane l2">🍃</span><span class="tp-liane l3">🌿</span><span class="tp-liane r1">🌿</span><span class="tp-liane r2">🍃</span><span class="tp-liane r3">🌿</span></div>`;
function tpCoeurs(e, p) {
  if (!(p.vies > 0) && !p.perdu) return '☠️';
  const plein = p.vies; // déjà diminué : le cœur perdu s'affiche à part, et se brise après le suspense
  const casse = e.phase === 'resultat' && p.perdu ? '<span class="tp-c"><b>❤️</b><b>🖤</b></span>' : '';
  return '❤️'.repeat(Math.max(0, plein)) + casse + '<span class="tp-vide">' + '♥'.repeat(Math.max(0, e.viesMax - Math.max(0, plein) - (casse ? 1 : 0))) + '</span>';
}
function mjTemple(a, e) {
  const head = `<div class="mj-kicker">Round ${a.n} · ${esc(a.nom)} · étape ${e.etape} / ${e.total}</div>`;
  if (e.phase === 'arrivee' || e.phase === 'fini') {
    const arrives = e.joueurs.filter(p => p.vies > 0).sort((x, y) => y.vies - x.vies);
    const morts = e.joueurs.filter(p => !(p.vies > 0)).sort((x, y) => y.mort - x.mort);
    const or = arrives.length ? `<div class="tp-or" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<span style="left:${(i * 37) % 100}%;animation-delay:${((i * 7) % 18) / 6}s">${['🪙', '💰', '✨'][i % 3]}</span>`).join('')}</div>` : '';
    return `<div class="tp-scene tp-fin">${tpDecor()}${or}${head}
      <div class="tp-arrivee">${TP_PYRAMIDE}<div><div class="mj-round">Le temple !</div>
      <div class="sc-sub">${arrives.length ? `${arrives.length > 1 ? 'Ils arrivent' : 'Arrivée'} au temple et récupère${arrives.length > 1 ? 'nt' : ''} le trésor 💰` : 'Personne n\'a survécu au chemin… le trésor reste caché.'}</div></div></div>
      <div class="tp-joueurs">${arrives.map(p => `<div class="tp-j on"><strong>${esc(p.nom)}</strong><span>${tpCoeurs(e, p)}</span></div>`).join('')}
        ${morts.map(p => `<div class="tp-j mort"><strong>${esc(p.nom)}</strong><span>☠️ étape ${p.mort}</span></div>`).join('')}</div></div>`;
  }
  const rev = e.phase === 'resultat';
  const reste = e.fin - SJ.now();
  const perdus = e.joueurs.filter(p => p.perdu);
  const nomsPieges = (e.pieges || []).map(i => e.chemins[i]?.nom);
  const phrases = (e.pieges || []).map(i => e.messages?.[i]).filter(Boolean);
  const sub = !rev
    ? `<div class="sc-sub">À vos téléphones : quel passage ? · <strong class="mono tp-timer ${reste < 6000 ? 'urgent' : ''}" data-until="${e.fin}"></strong> · ${e.joueurs.filter(p => p.vies > 0 && p.choisi).length} / ${e.joueurs.filter(p => p.vies > 0).length} ont choisi</div>`
    : `<div class="sc-sub tp-swap"><span class="tp-avant">🥁 Le temple gronde… ${nomsPieges.length > 1 ? 'lesquels sont piégés' : 'lequel est piégé'} ?</span><span class="tp-apres">${phrases.length ? `<span class="tp-phrase">☠️ ${phrases.map(esc).join(' · ')}</span> ` : ''}${perdus.length ? `${perdus.map(p => esc(p.nom)).join(', ')} ${perdus.length > 1 ? 'perdent' : 'perd'} une vie !` : 'Personne n\'est tombé dans le piège !'}</span></div>`;
  const joueurs = `<div class="tp-joueurs">${e.joueurs.map((p, j) => `<div class="tp-j ${p.vies > 0 || p.perdu ? '' : 'mort'} ${p.perdu ? 'perdu' : ''}">${e.affichage === 'carte' ? `<i class="tp-tshirt" style="--tshirt:${TempleCarte.COULEURS[j % TempleCarte.COULEURS.length]}"></i>` : ''}<strong>${esc(p.nom)}</strong><span>${tpCoeurs(e, p)}</span>${!rev && p.vies > 0 ? `<em>${p.choisi ? '✓' : '…'}</em>` : ''}</div>`).join('')}</div>`;
  if (e.affichage === 'carte') { // la carte vue du dessus (dessinée par temple-carte.js)
    return `<div class="tp-scene ${rev ? 'tp-rev' : ''}">${tpDecor()}${head}${sub}
      <canvas id="tp-carte" class="tp-carte" width="1280" height="720" aria-label="Carte du chemin vers le temple"></canvas>${joueurs}</div>`;
  }
  // Première version : le chemin d'étapes, et un bloc de pierre par passage, entre deux torches
  const ici = e.etape - (e.phase === 'choix' ? 1 : 0);
  const chemin = `<div class="tp-chemin">${Array.from({ length: e.total }, (_, i) => `<span class="${i < ici ? 'fait' : i === e.etape - 1 ? 'ici' : ''}">${i === e.etape - 1 ? '<i>👣</i>' : ''}</span>`).join('')}${TP_PYRAMIDE}</div>`;
  const bloc = (c, i) => {
    const qui = rev ? e.joueurs.filter(p => p.choix === i) : [];
    const piege = rev && e.pieges.includes(i);
    return `<div class="tp-obs ${rev ? `revele ${piege ? 'piege' : 'sur'}` : ''}">${piege ? TP_FISSURE + '<div class="tp-debris" aria-hidden="true"><span>🪨</span><span>🪨</span><span>🪨</span></div>' : ''}
      <div class="tp-fl">${i + 1}</div><div class="tp-nom">${esc(c.nom)}</div>
      ${rev ? `<div class="tp-msg">${piege ? `☠️ ${esc(e.messages[i] || '')}` : '✓ Passage sûr'}</div><div class="tp-qui">${qui.map(p => `<span>${esc(p.nom)}</span>`).join('') || '<span class="muted">personne</span>'}</div>` : ''}</div>`;
  };
  return `<div class="tp-scene ${rev ? 'tp-rev' : ''}">${tpDecor()}${head}${chemin}${sub}
    <div class="tp-duel n${e.chemins.length}" style="grid-template-columns:auto repeat(${e.chemins.length}, minmax(0, 1fr)) auto">${tpTorche()}${e.chemins.map(bloc).join('')}${tpTorche()}</div>${joueurs}</div>`;
}
// Le Mime : préparation du duo, puis le mime (chrono, essais du devineur, mots trouvés).
function mjMime(a, e) {
  const head = `<div class="mj-kicker">Round ${a.n} · ${esc(a.nom)} · tour ${e.tour} / ${e.tours}</div>`;
  const c = e.cur;
  if (!c) return head;
  const team = i => MJ_TEAMS[i] ?? [`Duo ${i + 1}`, 'var(--accent)'];
  const [tn, tc] = team(c.equipe);
  const scores = `<div class="mm-scores">${a.equipes.map((t, i) => `<div class="mm-score ${i === c.equipe ? 'on' : ''}" style="--team:${team(i)[1]}"><span>${esc(team(i)[0])}</span><small>${t.map(esc).join(' + ')}</small><b>${e.score[i] ?? 0}</b></div>`).join('')}</div>`;
  if (e.phase === 'pret') {
    return `${head}<div class="mj-round" style="color:${tc}">${esc(tn)}</div>
      <div class="mm-roles"><span>🤫 <strong>${esc(c.mime)}</strong> mime</span><span>✍️ <strong>${esc(c.devine)}</strong> devine</span></div>
      <div class="sc-sub">Prêts ? Ça commence dans <strong class="mono" data-until="${e.fin}"></strong></div>${scores}`;
  }
  const reste = e.fin - SJ.now();
  const flash = e.dernier && e.dernier.tour === e.tour - 1 && SJ.now() - e.dernier.at < 3000 ? e.dernier : null;
  return `${head}
    <div class="mm-jeu"><div class="mm-chrono mono ${reste < 6000 ? 'urgent' : ''}" data-until="${e.fin}"></div>
      <div class="stack" style="gap:1vh"><div class="mm-roles"><span>🤫 <strong>${esc(c.mime)}</strong> mime</span><span>✍️ <strong>${esc(c.devine)}</strong> devine</span></div>
      <div class="mm-trouves" style="--team:${tc}"><b>${e.histo.filter(x => x.trouve).length}</b> trouvé${e.histo.filter(x => x.trouve).length > 1 ? 's' : ''} ce tour</div></div></div>
    ${flash ? `<div class="mm-flash ${flash.trouve ? 'ok' : 'passe'}">${flash.trouve ? `✓ ${esc(flash.mot)} !` : `⏭ Passé : ${esc(flash.mot)}`}</div>` : ''}
    <div class="mm-essais">${e.essais.map(x => `<span>${esc(x)}</span>`).join('')}</div>
    <div class="mm-histo">${e.histo.map(x => `<span class="${x.trouve ? 'ok' : ''}">${x.trouve ? '✓' : '⏭'} ${esc(x.mot)}</span>`).join('')}</div>
    ${scores}`;
}
// La Chasse au dragon : la scène en direct (dessinée par dragon-scene.js), et dessous les derniers événements.
function mjDragon(a, e) {
  const head = `<div class="mj-kicker">Round ${a.n} · ${esc(a.nom)}${e.phase === 'jeu' ? ` · fin dans <span class="mono" data-until="${e.fin}"></span>` : ''}</div>`;
  const msg = ev => {
    if (ev.type === 'tir') return ev.vers === 'dragon' ? `🎯 ${esc(ev.de)} touche le dragon !` : ev.touche ? `💥 ${esc(ev.de)} touche ${esc(ev.vers)} !` : `🔫 ${esc(ev.de)} tire sur ${esc(ev.vers)}… raté, à l'abri !`;
    if (ev.type === 'souffle') return ev.touches.length ? `🔥 Le dragon souffle : ${ev.touches.map(esc).join(', ')} ${ev.touches.length > 1 ? 'sont touchés' : 'est touché'} !` : '🔥 Le dragon souffle… personne à découvert !';
    if (ev.type === 'horsjeu') return `😵 ${esc(ev.nom)} est hors jeu`;
    if (ev.type === 'souffle-prepare') return '⚠️ Le dragon prend son souffle…';
    if (ev.type === 'fin') return { dragon: '🏆 Le dragon est vaincu !', survivant: '🏁 Plus qu\'un en jeu !', temps: '⏱️ Temps écoulé !' }[ev.raison];
    return '';
  };
  return `${head}<canvas id="dr-scene" class="dr-scene" width="1280" height="720" aria-label="La scène : le dragon et les joueurs derrière leurs murets"></canvas>
    <ul class="dr-fil">${e.events.slice(-3).reverse().map((ev, i) => `<li class="${i ? '' : 'neuf'}">${msg(ev)}</li>`).join('')}</ul>`;
}
let drDernier = 0;
function dragonSons(g) {
  const e = g.etat;
  if (!e || e.type !== 'dragon') { drDernier = 0; return; }
  const neufs = e.events.filter(ev => ev.id > drDernier);
  if (drDernier) for (const ev of neufs) {
    if (ev.type === 'tir') { Sons.pan(); if (ev.touche) setTimeout(() => Sons.coup(.6), 120); }
    if (ev.type === 'souffle-prepare') Sons.grondement();
    if (ev.type === 'souffle') Sons.boom();
    if (ev.type === 'fin') Sons.fanfare();
  }
  drDernier = Math.max(drDernier, ...e.events.map(ev => ev.id), 1);
}

// Sons du Mime : gong au début du mime, petite flûte pour un mot trouvé, coup sourd pour un mot passé, tambour à la fin.
let mmPrec = null, mmSec = null;
function mimeSons(g) {
  const e = g.etat;
  if (!e || e.type !== 'mime') { mmPrec = null; return; }
  const now = { n: g.actif?.n, tour: e.tour, phase: e.phase, at: e.dernier?.at || 0 };
  const p = mmPrec;
  if (p && p.n === now.n) {
    if (now.phase === 'mime' && p.phase === 'pret') Sons.gong();
    else if (now.at !== p.at && now.tour === p.tour && e.dernier) (e.dernier.trouve ? Sons.flute([784, 1047]) : Sons.coup(.5));
    if (now.tour !== p.tour) Sons.boom();
  }
  mmPrec = now;
  const sec = Math.ceil((e.fin - SJ.now()) / 1000);
  if (e.phase === 'mime' && sec <= 5 && sec > 0 && sec !== mmSec) Sons.coup(.4);
  mmSec = sec;
}

// Sons du Temple, au changement d'étape (pas au premier affichage de la page).
let tpCle = null, tpSec = null;
function tpSons(g) {
  const e = g.etat;
  if (!e || e.type !== 'temple') { tpCle = null; return; }
  const cle = `${g.actif?.n}:${e.etape}:${e.phase}`;
  if (tpCle && cle !== tpCle) {
    if (e.phase === 'choix') Sons.pierre();
    if (e.phase === 'resultat') {
      Sons.tambour(TP_DELAI / 1000);
      const perdu = e.joueurs.some(p => p.perdu);
      setTimeout(() => (perdu ? Sons.boom() : Sons.flute([784, 988])), TP_DELAI);
    }
    if (e.phase === 'arrivee') { Sons.flute(); setTimeout(() => Sons.fanfare(), 900); }
  }
  tpCle = cle;
  // Les 5 dernières secondes du choix : un coup de tambour par seconde.
  const sec = Math.ceil((e.fin - SJ.now()) / 1000);
  if (e.phase === 'choix' && sec <= 5 && sec > 0 && sec !== tpSec) Sons.coup(.45);
  tpSec = sec;
}

// « Qu'est-ce qui a changé ? » : la scène à mémoriser, le noir, la scène avec un objet en moins, puis la réponse.
function mjDisparu(a, e) {
  const head = `<div class="mj-kicker">Round ${a.n} · ${esc(a.nom)} · manche ${e.manche} / ${e.total}</div>`;
  const tuile = (o, cls = '') => o ? `<div class="me-obj ${cls}"><span class="me-emoji">${esc(o.emoji || '❔')}</span><span class="me-nom">${esc(o.nom)}</span></div>` : '<div class="me-obj vide" aria-label="case vide"></div>';
  const grille = (objs, f = tuile) => `<div class="me-grille" style="--n:${Math.ceil(Math.sqrt(objs.length * 1.6))}">${objs.map(o => f(o)).join('')}</div>`;
  if (e.phase === 'memorise') return `${head}<div class="mj-round">Regardez bien !</div><div class="sc-sub">${e.scene.length} objets · encore <strong class="mono" data-until="${e.fin}"></strong></div>${grille(e.scene)}`;
  if (e.phase === 'noir') return `${head}<div class="me-noir">🙈 Fermez les yeux…</div>`;
  if (e.phase === 'question') {
    return `${head}<div class="mj-round">Qu'est-ce qui a disparu ?</div>
      <div class="sc-sub">À vos téléphones ! · <strong class="mono" data-until="${e.fin}"></strong> · ${e.repondu} / ${e.joueurs.length} ont répondu</div>${grille(e.apres)}`;
  }
  // révélation : l'objet disparu revient à sa place (ou s'affiche à part si les objets ont été mélangés)
  const trou = e.apres.indexOf(null);
  const retour = trou >= 0 ? e.apres.map((o, i) => (i === trou ? e.manquant : o)) : [...e.apres, e.manquant];
  const qui = e.reponses.map(x => `<li class="${x.juste ? 'ok' : ''}"><span>${x.juste ? '✓' : '✗'}</span><strong>${esc(x.nom)}</strong><span class="muted">${x.juste ? `${(x.temps / 1000).toFixed(1)} s` : esc(x.objet)}</span><b>+${x.points}</b></li>`).join('');
  return `${head}<div class="mj-round me-titre">C'était ${esc(e.manquant.emoji)} ${esc(e.manquant.nom)} !</div>
    <div class="me-rev"><div>${grille(retour, o => tuile(o, o?.nom === e.manquant.nom ? 'revient' : ''))}</div>
      <ol class="me-qui">${qui || '<li class="muted">Personne n\'a répondu.</li>'}</ol></div>`;
}
let meCle = null;
function memoSons(g) {
  const e = g.etat;
  if (!e || e.type !== 'disparu') { meCle = null; return; }
  const cle = `${g.actif?.n}:${e.manche}:${e.phase}`;
  if (meCle && cle !== meCle) { if (e.phase === 'question') Sons.gong(); if (e.phase === 'revelation') Sons.flute([659, 784, 1047]); }
  meCle = cle;
}

// La Définition et L'Anecdote (même déroulement) : écriture, puis les spectateurs relient chaque carte à un joueur, puis les réponses.
function mjDefinition(a, e) {
  const A = e.type === 'anecdote';
  const head = `<div class="mj-kicker">Round ${a.n} · ${esc(a.nom)} · manche ${e.manche} / ${e.total}</div>`;
  if (e.phase === 'ecriture') {
    return `${head}<div class="mj-round">${A ? 'Racontez une anecdote !' : 'Inventez une définition !'}</div>
      <div class="sc-sub">${A ? 'Chaque joueur écrit sur son téléphone une anecdote vraie sur lui.' : 'Chaque joueur a reçu un mot qui n\'existe pas.'} Encore <strong class="mono" data-until="${e.fin}"></strong></div>
      <div class="mj-compris">${e.joueurs.map(p => `<span class="${e.ecrit.includes(p) ? 'on' : ''}">${e.ecrit.includes(p) ? '✓' : '✎'} ${esc(p)}</span>`).join('')}</div>
      <p class="sc-sub muted">Les autres : préparez-vous à deviner ${A ? 'qui a vécu quoi' : 'qui avait quel mot'} !</p>`;
  }
  const titre = c => (A ? `Anecdote ${esc(c.mot)}` : esc(c.mot));
  const cards = `<div class="mj-cards ${A ? 'mj-anecdotes' : ''}">${e.cartes.map(c => `<div class="mj-card"><div class="mj-mot">${titre(c)}</div><div class="mj-def">${esc(c.def)}</div>
    ${c.auteur ? `<div class="mj-auteur">${esc(c.auteur)} · <span class="p">${c.trouves} ${A ? (c.trouves > 1 ? 'l\'ont reconnu' : 'l\'a reconnu') : (c.trouves > 1 ? 'ont trouvé' : 'a trouvé')}</span></div>` : ''}</div>`).join('')}</div>`;
  if (e.phase === 'vote') {
    return `${head}<div class="sc-sub">À vos téléphones : reliez chaque ${A ? 'anecdote' : 'mot'} à ${e.joueurs.map(esc).join(', ')} · <strong class="mono" data-until="${e.fin}"></strong> · ${e.votants} / ${e.spectateurs} ont répondu</div>${cards}`;
  }
  return `${head}<div class="sc-sub">Les réponses !${A ? ' Le moins reconnu gagne.' : ''}</div>${cards}`;
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
  } else if (a && a.status === 'jeu' && (g.etat?.type === 'definition' || g.etat?.type === 'anecdote')) {
    main = mjDefinition(a, g.etat);
  } else if (a && a.status === 'jeu' && g.etat?.type === 'temple') {
    main = mjTemple(a, g.etat);
  } else if (a && a.status === 'jeu' && g.etat?.type === 'mime') {
    main = mjMime(a, g.etat);
  } else if (a && a.status === 'jeu' && g.etat?.type === 'disparu') {
    main = mjDisparu(a, g.etat);
  } else if (a && a.status === 'jeu' && g.etat?.type === 'dragon') {
    main = mjDragon(a, g.etat);
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
  if (document.getElementById('tp-carte')) TempleCarte.demarrer();
  if (document.getElementById('dr-scene')) DragonScene.demarrer();
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
