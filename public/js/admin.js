// Interface admin : décompte, inscriptions, suivi de partie et réglages des jeux.
/* global SJ */
const app = document.getElementById('app');
const { esc, fmt, money } = SJ;
let V = null;
let authed = false;
const ui = { tab: SJ.store('sj-admin-tab') || 'soiree', team: 'A', hideNames: false, parti: null };

async function login(pw) {
  const r = await SJ.emit('hello', { role: 'admin', password: pw });
  authed = r.ok;
  if (r.ok) SJ.store('sj-admin', pw); else { SJ.store('sj-admin', null); SJ.toast(r); }
  draw();
}
SJ.sock.on('connect', () => { const pw = SJ.store('sj-admin'); if (pw) login(pw); else draw(); });
SJ.sock.on('etat', v => { V = v; document.body.dataset.game = v.gameId; draw(); });

async function admin(a) {
  const r = await SJ.emit('admin', a);
  if (!r.ok || r.msg) SJ.toast(r);
  return r;
}
const jeu = action => admin({ type: 'jeu', action });

// Durées affichées en m:ss, stockées en secondes.
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
function parseDur(v) {
  const m = String(v).trim().match(/^(\d+)(?::(\d{1,2}))?$/);
  if (!m) return null;
  return m[2] === undefined ? Number(m[1]) * 60 : Number(m[1]) * 60 + Number(m[2]);
}

// Champ de réglage lié à un chemin de config. kind : text | num | dur | area | bool
function cfgInput(path, value, kind = 'text', { scope = 'jeu', label, width, ph = '' } = {}) {
  const id = 'c-' + scope + '-' + path.replace(/\./g, '-');
  const attrs = `id="${id}" data-cfg="${path}" data-kind="${kind}" data-scope="${scope}"${label ? '' : ` aria-label="${esc(path)}"`}`;
  let input;
  if (kind === 'area') input = `<textarea class="in" rows="2" ${attrs} placeholder="${esc(ph)}">${esc(value)}</textarea>`;
  else if (kind === 'bool') input = `<input type="checkbox" ${attrs} ${value ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--accent)">`;
  else input = `<input class="in" ${attrs} value="${esc(kind === 'dur' ? mmss(value) : value)}" placeholder="${esc(ph)}" ${kind !== 'text' ? 'inputmode="numeric"' : ''} style="${width ? `width:${width}` : ''}">`;
  return label ? `<label class="field"><span class="label">${esc(label)}</span>${input}</label>` : input;
}

app.addEventListener('change', e => {
  const el = e.target;
  if (!el.dataset.cfg) return;
  let value = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.kind === 'dur') { value = parseDur(value); if (value == null) return SJ.toast({ ok: false, msg: 'Durée au format minutes:secondes, ex. 4:30' }); }
  if (el.dataset.kind === 'num') value = Number(String(value).replace(',', '.'));
  admin({ type: 'config', scope: el.dataset.scope === 'soiree' ? 'soiree' : 'jeu', path: el.dataset.cfg, value });
});

// ---------- onglet Soirée ----------
function soiree() {
  const statusLabel = { idle: 'En attente', countdown: V.paused ? 'Décompte en pause' : 'Décompte en cours', playing: 'Partie en cours', finished: 'Partie terminée' }[V.status];
  const clock = V.status === 'countdown' ? (V.paused ? fmt(V.remaining) : `<span data-until="${V.endsAt}"></span>`) : V.status === 'playing' ? '▶' : '—';
  return `<div class="grid-2">
    <div class="box">
      <h2>Jeu</h2>
      <div class="row">${V.games.map(g => `<button class="btn ${g.id === V.gameId ? 'primary' : ''}" data-act="choisirJeu" data-id="${g.id}">${esc(g.name)}</button>`).join('')}</div>
      <h2 style="margin-top:8px">Décompte</h2>
      <div class="clock">${clock}</div>
      <div class="row"><span class="pill accent">${statusLabel}</span><span class="pill ${V.inscriptionsOpen ? 'ok' : ''}">${V.inscriptionsOpen ? '● Inscriptions ouvertes' : 'Inscriptions fermées'}</span><span class="pill">${V.registeredCount} inscrits</span></div>
      ${V.message ? `<p class="muted" style="margin:0;color:var(--danger)">${esc(V.message)}</p>` : ''}
      <div class="grid-auto">
        ${cfgInput('decompte', V.config.decompte, 'dur', { scope: 'soiree', label: 'Décompte total (min:s)' })}
        ${cfgInput('inscriptions', V.config.inscriptions, 'dur', { scope: 'soiree', label: 'Inscriptions avant (min:s)' })}
      </div>
      <div class="row">
        <button class="btn primary" data-act="demarrer">▶ Démarrer le décompte</button>
        <button class="btn" data-act="pause" ${V.status === 'countdown' ? '' : 'disabled'}>${V.paused ? '▶ Reprendre' : '⏸ Pause'}</button>
${[[-300, '−5 min'], [-60, '−1 min'], [60, '+1 min'], [300, '+5 min']].map(([sec, l]) => `<button class="btn sm" data-act="ajuster" data-sec="${sec}" ${V.status === 'countdown' ? '' : 'disabled'}>${l}</button>`).join('')}
      </div>
      <div class="row">
        <button class="btn sm" data-act="inscriptions" data-v="open">Ouvrir les inscriptions</button>
        <button class="btn sm" data-act="inscriptions" data-v="closed">Fermer</button>
        <button class="btn sm" data-act="inscriptions" data-v="auto">Auto</button>
      </div>
      <div class="row">
        ${V.gameId === 'duel' && V.status !== 'playing' ? (() => {
          const n = V.registered.length, missing = V.registered.filter(p => !p.dossard).length;
          return `<button class="btn primary" data-act="lancerJeu" ${n >= 2 && !missing ? '' : 'disabled'} title="${missing ? `${missing} joueur(s) sans numéro` : ''}">▶ Tout lancer : ${n} joueurs${missing ? ` · ${missing} sans numéro` : ', tous numérotés'}</button>`;
        })() : `<button class="btn danger" data-act="lancerJeu" ${V.status === 'playing' ? 'disabled' : ''}>Lancer le jeu maintenant</button>`}
        <button class="btn sm" data-act="arreter">Arrêter</button>
        <button class="btn sm" data-act="reinitialiser" data-confirm="Tout remettre à zéro pour ce jeu (inscrits compris) ?">Réinitialiser</button>
      </div>
    </div>
    <div class="box">
      <h2>Inscrits (${V.registered.length})</h2>
      ${V.gameId === 'duel' && V.registered.length ? `<p class="muted" style="margin:0;font-size:14px">Saisis le numéro du maillot de chacun dès qu'il vient le chercher. ${V.registered.filter(p => !p.dossard).length ? `<strong style="color:var(--danger)">${V.registered.filter(p => !p.dossard).length} sans numéro.</strong>` : '<strong style="color:var(--ok)">Tout le monde a son numéro.</strong>'}</p>
        <div class="scroll"><table><thead><tr><th>Joueur</th><th>Maillot</th><th></th></tr></thead><tbody>${V.registered.map(p => `<tr><td>${esc(p.name)}</td>
          <td><input class="in" style="width:90px" inputmode="numeric" id="dos-${p.pid}" data-dossard="${p.pid}" value="${esc(p.dossard)}" aria-label="Maillot de ${esc(p.name)}"></td>
          <td><button class="btn sm" data-act="retirerInscrit" data-pid="${p.pid}" aria-label="Retirer ${esc(p.name)}">✕</button></td></tr>`).join('')}</tbody></table></div>` :
      V.registered.length ? `<div class="row">${V.registered.map(p => `<span class="pill">${esc(p.name)} <button class="btn sm" style="padding:0 6px;border:0;background:none" data-act="retirerInscrit" data-pid="${p.pid}" aria-label="Retirer ${esc(p.name)}">✕</button></span>`).join('')}</div>` : '<p class="muted" style="margin:0">Personne pour l\'instant.</p>'}
      <h2 style="margin-top:8px">Liens</h2>
      <div class="stack" style="gap:6px;font-size:14px">
        <div>📺 Écran public : <a href="/ecran" target="_blank" class="mono">${location.origin}/ecran</a></div>
        <div>📱 Joueurs : <a href="/jouer" target="_blank" class="mono">${location.origin}/jouer</a> (QR code sur l'écran)</div>
        <div>🛡 Orga safe zone : <a href="/orga" target="_blank" class="mono">${location.origin}/orga</a></div>
      </div>
      <div class="grid-auto">${cfgInput('orgaCode', V.config.orgaCode, 'text', { scope: 'soiree', label: 'Code orga' })}</div>
      <h2 style="margin-top:8px">Simulation</h2>
      <p class="muted" style="margin:0;font-size:14px">De faux joueurs jouent pour de vrai : regarde l'écran public. Tes réglages sont remis comme avant à la fin.</p>
      ${V.simulation?.running ? `<div class="row"><span class="pill accent">▶ ${esc(V.simulation.step)}</span><span class="muted">${V.simulation.bots} faux joueurs</span><button class="btn sm danger" data-act="simStop">Arrêter</button></div>` : `
      <div class="row"><label class="field" style="max-width:120px"><span class="label">Faux joueurs</span><input class="in" id="sim-n" inputmode="numeric" value="50"></label>
        <label class="field" style="max-width:220px"><span class="label">Jeux</span><select class="in" id="sim-jeux"><option value="chemin,grandpari,duel">Les 3 jeux (~25 min)</option>${V.games.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>
        <button class="btn primary" data-act="simStart" style="align-self:flex-end">▶ Lancer la simulation</button></div>
      ${V.simulation?.canErase ? `<div class="row"><span class="muted">${esc(V.simulation.step)}</span><button class="btn sm danger" data-act="simErase" data-confirm="Effacer les faux joueurs et leurs points ?">Effacer la simulation</button></div>` : ''}`}
      <h2 style="margin-top:8px">Sauvegarde des réglages</h2>
      <p class="muted" style="margin:0;font-size:14px">Tous les réglages (noms, indices, codes, armes, durées, primes, points) dans un fichier, pour les garder ou les remettre sur un autre serveur.</p>
      <div class="row"><button class="btn" data-act="exporter">⬇ Exporter les réglages</button>
        <label class="btn" style="cursor:pointer">⬆ Importer un fichier<input type="file" id="import-file" accept="application/json,.json" hidden></label></div>
      <h2 style="margin-top:8px">Noms des jeux</h2>
      <p class="muted" style="margin:0;font-size:14px">Affichés partout : écran public, téléphones, classement. Laisse vide pour revenir au nom d'origine.</p>
      <div class="grid-auto">${V.games.map((g, i) => cfgInput(`nomsJeux.${g.id}`, V.config.nomsJeux?.[g.id] ?? g.name, 'text', { scope: 'soiree', label: { chemin: 'Jeu de la chaîne et des détectives', duel: 'Jeu des cowboys', grandpari: 'Jeu des paris sportifs' }[g.id] || `Jeu ${i + 1}` })).join('')}</div>
    </div>
  </div>`;
}

// ---------- onglet Partie ----------
const nm = n => (ui.hideNames ? '•••' : esc(n));

function partieChemin(g) {
  const team = T => {
    const t = g.teams[T];
    return `<div class="box" style="background:var(--ink)">
      <div class="spread"><span class="pill ${T.toLowerCase()}">Équipe ${T}</span><span class="label">${t.progress} / ${t.total} étapes${t.skipped ? ` · ${t.skipped} sautée(s)` : ''}</span></div>
      ${t.protectUntil ? `<span class="pill safe">🦺 Gilet <span class="mono" data-until="${t.protectUntil}"></span></span>` : ''}
      <div class="scroll"><table><thead><tr><th>Étape</th><th>Joueur</th><th>Numéro</th><th>État</th></tr></thead><tbody>
      ${t.chain.map(c => `<tr><td class="mono">${c.step}</td><td>${nm(c.name)}</td><td class="mono">${c.numero ?? '—'}</td><td>${c.state === 'faite' ? '<span class="pill ok">✓</span>' : c.state ? `<span class="pill accent">${c.state}</span>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
      <div><span class="label">Détectives</span><p style="margin:4px 0 0">${t.detectives.map(d => `${nm(d.name)} ${d.inv}`).join(' · ') || '—'}</p></div>
      <button class="btn sm" data-jeu="validerEtape" data-team="${T}" data-confirm="Valider l'étape en cours de l'équipe ${T} ?">Débloquer l'étape en cours</button>
    </div>`;
  };
  const players = g.players.map(p => {
    const state = p.block ? `<span class="pill danger">${esc(p.block.label)}${p.block.until ? ` <span class="mono" data-until="${p.block.until}"></span>` : ''}</span>`
      : p.safeUntil ? `<span class="pill safe">🛡 <span class="mono" data-until="${p.safeUntil}"></span></span>`
      : p.immuneUntil ? `<span class="pill">Immunisé <span class="mono" data-until="${p.immuneUntil}"></span></span>` : '<span class="pill">En jeu</span>';
    const mates = g.players.filter(x => x.team === p.team && x.pid !== p.pid);
    const parti = ui.parti === p.pid
      ? `<select class="in" id="rempl-${p.pid}" style="width:auto"><option value="">Remplaçant…</option>${mates.map(x => `<option value="${x.pid}">${esc(x.name)}</option>`).join('')}</select>
         <button class="btn sm" data-jeu="remplacer" data-pid="${p.pid}">Remplacer</button><button class="btn sm danger" data-jeu="sauter" data-pid="${p.pid}" data-confirm="Sauter son étape ? L'équipe ne pourra plus gagner en finissant.">Sauter</button>`
      : `<button class="btn sm danger" data-parti="${p.pid}">Joueur parti</button>`;
    return `<tr><td>${nm(p.name)}</td><td><span class="pill ${p.team.toLowerCase()}">${p.team}</span></td><td>${p.role === 'random' ? 'Random' : 'Détective'}</td><td>${state}</td>
      <td class="nowrap"><div class="row">${p.safeUntil ? `<button class="btn sm" data-jeu="finSafe" data-pid="${p.pid}">Retirer safe zone</button>` : `<button class="btn sm" data-jeu="safe" data-pid="${p.pid}">🛡 Safe zone</button>`}
      ${p.block ? `<button class="btn sm" data-jeu="liberer" data-pid="${p.pid}">Libérer</button>` : ''}${parti}</div></td></tr>`;
  }).join('');
  return `<div class="spread"><div class="row"><span class="pill accent">${g.finished ? (g.winner ? `Équipe ${g.winner} gagne` : 'Terminée') : 'En cours'}</span>${g.finished ? '' : `<span class="muted">Fin au plus tard dans <span class="mono" data-until="${g.endsAt}"></span></span>`}</div>
      <div class="row"><button class="btn sm" data-act="masquer">${ui.hideNames ? 'Afficher les noms' : 'Masquer les noms'}</button><button class="btn sm danger" data-jeu="terminer" data-confirm="Terminer la partie maintenant ? L'équipe la plus avancée gagne.">Terminer la partie</button></div></div>
    <div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">${team('A')}${team('B')}</div>
    <div class="box"><h2>Joueurs</h2><div class="scroll"><table><thead><tr><th>Joueur</th><th>Équipe</th><th>Rôle</th><th>État</th><th>Actions</th></tr></thead><tbody>${players}</tbody></table></div></div>
    <div class="box"><h2>Fil des événements</h2>${g.feed.map(f => `<div class="muted" style="font-size:14px">${new Date(f.t).toLocaleTimeString('fr-FR')} · ${esc(f.text)}</div>`).join('') || '<p class="muted">Rien pour l\'instant.</p>'}</div>`;
}

function partieDuel(g) {
  const phase = { prep: 'Préparation : saisis les numéros', p1: `Tour ${g.round} (${g.roundType === 'sim' ? 'simultané' : 'duels un par un'})`, pause: 'Pause paris', p2: 'Face-à-face', done: 'Terminée' }[g.phase];
  let h = `<div class="spread"><div class="row"><span class="pill accent">${phase}</span><span class="muted">${g.alive.length} en lice sur ${g.total} · ${g.simRounds} tour(s) simultané(s) prévus</span>
      ${g.phase === 'pause' ? `<span class="pill">reprise <span class="mono" data-until="${g.pauseUntil}"></span></span>` : ''}
      ${g.phase === 'p1' ? `<span class="pill">fin du tour visée <span class="mono" data-until="${g.roundEndsAt}"></span></span><span class="pill">${g.queue} duel(s) en attente</span>` : ''}</div>
    <div class="row">
      ${g.phase === 'prep' ? '<button class="btn primary" data-jeu="lancer">▶ Lancer le premier tour</button>' : ''}
      ${g.phase === 'pause' ? '<button class="btn" data-jeu="passerPause">Passer la pause</button>' : ''}
      ${g.phase === 'p1' || g.phase === 'p2' ? '<button class="btn" data-jeu="duelSuivant">Lancer le prochain duel</button>' : ''}
      <button class="btn sm danger" data-jeu="terminer" data-confirm="Arrêter la partie ?">Arrêter</button></div></div>`;
  if (g.liveDuels.length) {
    h += `<div class="box"><h2>Duels en cours</h2><div class="scroll"><table><thead><tr><th>Duel</th><th>Dossards</th><th>Depuis</th><th>Arbitrage</th></tr></thead><tbody>${g.liveDuels.map(d => `<tr>
      <td>${esc(d.a.name)} ${SJ.hearts(d.a.lives, g.maxLives)} <span class="muted">contre</span> ${esc(d.b.name)} ${SJ.hearts(d.b.lives, g.maxLives)}</td>
      <td class="mono">${esc(d.a.num)} · ${esc(d.b.num)}</td><td class="mono" data-since="${d.startedAt}"></td>
      <td class="nowrap"><div class="row"><button class="btn sm" data-jeu="forcer" data-duel="${d.id}" data-winner="${d.a.pid}">${esc(d.a.name)} gagne</button><button class="btn sm" data-jeu="forcer" data-duel="${d.id}" data-winner="${d.b.pid}">${esc(d.b.name)} gagne</button><button class="btn sm" data-jeu="rejouer" data-duel="${d.id}">Rejouer</button></div></td></tr>`).join('')}</tbody></table></div></div>`;
  }
  const missing = g.players.filter(p => !p.num).length;
  h += `<div class="box"><div class="spread"><h2>Joueurs et dossards</h2>${missing ? `<span class="pill danger">${missing} numéro(s) manquant(s)</span>` : '<span class="pill ok">Tous les numéros sont saisis</span>'}</div>
    <div class="scroll"><table><thead><tr><th>Joueur</th><th>Dossard</th><th>Vies</th><th>État</th><th>Prime</th><th>Paris</th></tr></thead><tbody>${g.players.map(p => `<tr>
      <td>${esc(p.name)}</td>
      <td><input class="in" style="width:80px" inputmode="numeric" id="num-${p.pid}" data-num="${p.pid}" value="${esc(p.num)}" aria-label="Dossard de ${esc(p.name)}"></td>
      <td>${p.alive ? SJ.hearts(p.lives, g.maxLives) : ''}</td>
      <td>${p.alive ? `En jeu · ${p.wins} victoire(s)` : `<span class="muted">Éliminé ${esc(p.elimLabel || '')}</span>`}</td>
      <td class="mono">${p.prime ? money(p.prime) : ''}</td><td class="mono">${p.hasBet ? money(p.bet) : p.alive ? '' : '<span class="muted">pas encore parié</span>'}</td></tr>`).join('')}</tbody></table></div></div>`;
  return h;
}

function partieGrandPari(g) {
  const sp = g.sports[g.k];
  const phase = { entre: `Prochain : ${sp.icon} ${sp.name}`, sport: `${sp.icon} ${sp.name} en cours`, resultat: 'Résultats', fini: 'Partie terminée' }[g.phase];
  let h = `<div class="spread"><div class="row"><span class="pill accent">${esc(phase)}</span>
      ${g.phase === 'entre' ? `<span class="muted">départ dans <span class="mono" data-until="${sp.at}"></span> · paris fermés à <span class="mono" data-until="${g.closeAt}"></span></span>` : ''}
      ${g.oddsPending ? '<span class="pill">Cotes du foot en calcul…</span>' : ''}</div>
    <div class="row">
      <button class="btn primary" data-jeu="lancerSport" ${g.phase === 'entre' ? '' : 'disabled'} data-confirm="Lancer le sport maintenant ? Les paris et investissements se ferment.">▶ Lancer le sport maintenant</button>
      ${[[-300, '−5 min'], [-60, '−1 min'], [60, '+1 min'], [300, '+5 min']].map(([sec, l]) => `<button class="btn sm" data-jeu="decaler" data-sec="${sec}" ${g.phase === 'entre' ? '' : 'disabled'}>${l}</button>`).join('')}
      <button class="btn sm danger" data-jeu="terminer" data-confirm="Terminer la partie maintenant ?">Terminer</button></div></div>`;
  h += `<div class="box"><h2>Programme</h2><div class="scroll"><table><thead><tr><th>Sport</th><th>Départ</th><th>Paris</th><th>État</th></tr></thead><tbody>${g.sports.map((s, k) => `<tr>
      <td>${s.icon} ${esc(s.name)}</td><td class="mono">${new Date(s.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
      <td class="mono">${g.sportBets[k].count} · ${money(g.sportBets[k].total)}</td><td>${{ avenir: '', encours: '<span class="pill accent">en cours</span>', fini: '<span class="pill ok">✓</span>' }[s.status]}</td></tr>`).join('')}</tbody></table></div></div>`;
  if (g.block) {
    h += `<div class="box"><h2>Investissements du bloc ${g.block.k + 1}</h2><div class="scroll"><table><thead><tr><th>Investissement</th><th>Montant</th><th>Investisseurs</th><th>Gain / remboursé</th><th>État</th></tr></thead><tbody>${g.block.items.map(it => `<tr>
      <td>${it.emoji} ${esc(it.nom)}</td><td class="mono">${money(it.total)} / ${money(it.needAmount)}</td><td class="mono">${it.investors} / ${it.needInvestors}</td>
      <td class="mono">×${it.gain} · ${it.remb} %</td><td>${it.status === 'reussi' ? '<span class="pill ok">réussi</span>' : it.status === 'echoue' ? '<span class="pill danger">échoué</span>' : '<span class="pill">ouvert</span>'}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  h += `<div class="box"><h2>Joueurs (${g.players.length})</h2><div class="scroll"><table><thead><tr><th>#</th><th>Joueur</th><th>Argent</th><th>Misé sur ce sport</th></tr></thead><tbody>${g.players.map((p, i) => `<tr>
      <td class="mono">${i + 1}</td><td>${esc(p.name)}</td><td class="mono">${money(p.wallet)}</td><td class="mono">${p.bets ? money(p.bets) : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  if (g.odds) {
    const o = g.odds, eq = V.gameConfig.foot.equipes;
    h += `<div class="box"><h2>Cotes du foot (calculées)</h2><p class="muted" style="margin:0">Nul ×${o.nul} · Buts : ${o.buts.map((c, k) => `${k === 4 ? '4+' : k} ×${c}`).join(' · ')}</p>
      <p class="muted" style="margin:0">Buteurs : ${eq.flatMap((T, ti) => T.joueurs.map((j, i) => `${esc(j.nom)} ×${o.buteur[ti][i]}`)).join(' · ')}</p></div>`;
  }
  return h;
}

function partie() {
  if (!V.game) return `<div class="box"><p class="muted" style="margin:0">Aucune partie en cours. Lance le décompte dans l'onglet Soirée.</p></div>`;
  return V.gameId === 'chemin' ? partieChemin(V.game) : V.gameId === 'grandpari' ? partieGrandPari(V.game) : partieDuel(V.game);
}

// ---------- onglet Classement ----------
function classementTab() {
  const c = V.classement, k = V.config.classement;
  const pts = x => (x == null ? '—' : String(x).replace('.', ','));
  const shown = { classement: 'Classement affiché', final: 'Grand final affiché' }[V.show] || 'Rien d\'affiché';
  let h = `<div class="spread"><div class="row"><span class="pill accent">${shown}</span><span class="muted">Jeux comptés : ${c.held.map(x => esc(x.name)).join(', ') || 'aucun pour l\'instant'}</span></div>
    <div class="row"><button class="btn" data-act="afficherClassement" data-mode="classement">📊 Afficher le classement</button>
      <button class="btn primary" data-act="afficherClassement" data-mode="final">🏆 Grand final</button>
      <button class="btn sm" data-act="afficherClassement" data-mode="">Masquer</button></div></div>`;
  h += `<div class="box"><h2>Classement de la soirée</h2><div class="scroll"><table><thead><tr><th>#</th><th>Joueur</th>${c.held.map(x => `<th>${esc(x.name)} <span class="muted">/${x.max}</span></th>`).join('')}<th>Bonus jeu raté</th><th>Bonus manuel</th><th>Total</th></tr></thead><tbody>
    ${c.rows.map(r => `<tr><td class="mono">${r.rank}</td><td>${esc(r.name)}</td>${c.held.map(x => `<td class="mono">${pts(r.games[x.id])}</td>`).join('')}
      <td class="mono">${r.mult > 1 ? '×' + pts(r.mult) : ''}</td>
      <td class="nowrap"><div class="row"><button class="btn sm" data-act="bonus" data-pid="${r.pid}" data-delta="-5">−5</button><span class="mono">${r.bonus || 0}</span><button class="btn sm" data-act="bonus" data-pid="${r.pid}" data-delta="5">+5</button></div></td>
      <td class="mono"><strong>${pts(r.total)}</strong></td></tr>`).join('') || `<tr><td colspan="${5 + c.held.length}" class="muted">Le classement se remplit à la fin de chaque jeu.</td></tr>`}
    </tbody></table></div>
    <div class="row"><select class="in" id="bonus-pid" style="width:auto"><option value="">Bonus pour…</option>${V.people.map(p => `<option value="${p.pid}">${esc(p.name)}</option>`).join('')}</select>
      <input class="in" id="bonus-val" inputmode="numeric" placeholder="points" style="width:100px"><button class="btn sm" data-act="bonusLibre">Ajouter</button></div></div>
  <div class="box"><h2>Points</h2><div class="grid-auto">
    ${cfgInput('classement.chemin.gagnant', k.chemin.gagnant, 'num', { scope: 'soiree', label: 'Le Chemin : équipe gagnante' })}
    ${cfgInput('classement.chemin.perdant', k.chemin.perdant, 'num', { scope: 'soiree', label: 'Le Chemin : équipe perdante' })}
    ${cfgInput('classement.grandpari.max', k.grandpari.max, 'num', { scope: 'soiree', label: 'Grand Pari : 1er' })}
    ${cfgInput('classement.grandpari.min', k.grandpari.min, 'num', { scope: 'soiree', label: 'Grand Pari : dernier' })}
    ${cfgInput('classement.duel.max', k.duel.max, 'num', { scope: 'soiree', label: 'Duel : 1er' })}
    ${cfgInput('classement.duel.min', k.duel.min, 'num', { scope: 'soiree', label: 'Duel : dernier' })}
    ${cfgInput('classement.bonusMax', k.bonusMax, 'num', { scope: 'soiree', label: 'Bonus jeu raté (max)' })}
  </div><p class="muted" style="margin:0;font-size:14px">Bonus jeu raté = points max des jeux joués à la soirée ÷ points max des jeux joués par le joueur, plafonné. Égalités : jeux gagnés, puis résultat au Duel.</p>
  <button class="btn sm danger" data-act="reinitialiserSoiree" data-confirm="Remettre à zéro le classement de la soirée ?" style="align-self:flex-start">Remettre le classement à zéro</button></div>`;
  return h;
}

// ---------- onglet Réglages ----------
function reglagesChemin(c) {
  const T = ui.team;
  const rows = c.teams[T].steps.map((s, i) => `<tr><td class="mono">${i + 1}</td>
    <td>${i === 0 ? '<span class="muted">départ</span>' : cfgInput(`teams.${T}.steps.${i}.numero`, s.numero, 'text', { width: '80px', ph: 'auto' })}</td>
    <td>${cfgInput(`teams.${T}.steps.${i}.indice`, s.indice, 'area')}</td>
    <td>${cfgInput(`teams.${T}.steps.${i}.code`, s.code, 'text', { width: '90px' })}</td>
    <td>${cfgInput(`teams.${T}.steps.${i}.longue`, s.longue, 'bool')}</td></tr>`).join('');
  const finalRow = `<tr style="background:var(--accent-soft)"><td class="mono">15<br><span class="pill accent" style="margin-top:4px">commune</span></td>
    <td>${cfgInput(`teams.${T}.finalNumero`, c.teams[T].finalNumero, 'text', { width: '80px', ph: 'auto' })}</td>
    <td>${cfgInput('final.indice', c.final.indice, 'area')}</td><td>${cfgInput('final.code', c.final.code, 'text', { width: '90px' })}</td><td>${cfgInput('final.longue', c.final.longue, 'bool')}</td></tr>`;
  const arme = (k, label, d, r) => `<tr><td>${label}</td><td>${cfgInput(`armes.${k}.code`, c.armes[k].code, 'text', { width: '90px' })}</td>
    <td>${d ? cfgInput(`armes.${k}.duree`, c.armes[k].duree, 'dur', { width: '80px' }) : '<span class="muted">—</span>'}</td>
    <td>${r ? cfgInput(`armes.${k}.recharge`, c.armes[k].recharge, 'dur', { width: '80px' }) : '<span class="muted">—</span>'}</td></tr>`;
  const cles = TT => c.cles[TT].map((k, i) => `<tr><td class="mono">${TT}${i + 1}</td><td>${cfgInput(`cles.${TT}.${i}.code`, k.code, 'text', { width: '90px' })}</td><td>${cfgInput(`cles.${TT}.${i}.lieu`, k.lieu, 'text', { ph: 'ex. dans la théière' })}</td></tr>`).join('');
  return `<div class="box">
      <div class="spread"><h2>Étapes</h2><div class="row"><button class="btn sm ${T === 'A' ? 'primary' : ''}" data-team-tab="A">Équipe A</button><button class="btn sm ${T === 'B' ? 'primary' : ''}" data-team-tab="B">Équipe B</button></div></div>
      <p class="muted" style="margin:0;font-size:14px">Numéro vide = tiré au hasard (4 chiffres). Avec moins de joueurs, les étapes jouées sont 1, 2, 3… puis la 15. Les réglages sont enregistrés dès que tu quittes un champ.</p>
      <div class="scroll"><table><thead><tr><th>Étape</th><th>Numéro reçu</th><th>Indice affiché</th><th>Code physique</th><th>Longue</th></tr></thead><tbody>${rows}${finalRow}</tbody></table></div>
    </div>
    <div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
      <div class="box"><h2>Armes</h2><div class="scroll"><table><thead><tr><th>Arme</th><th>Code</th><th>Durée effet</th><th>Recharge</th></tr></thead><tbody>
        ${arme('pistolet', '🔫 Pistolet', 1, 1)}${arme('fumigene', '💨 Fumigène', 1, 1)}${arme('menottes', '⛓️ Menottes (1 fois)', 0, 0)}${arme('loupe', '🔍 Loupe', 0, 1)}${arme('gilet', '🦺 Gilet', 1, 1)}${arme('voyance', '🔮 Voyance', 0, 0)}
      </tbody></table></div></div>
      <div class="box"><h2>Antidotes</h2>
        <div class="grid-auto">${cfgInput('bandage.code', c.bandage.code, 'text', { label: '🩹 Code bandage' })}${cfgInput('bandage.reduction', c.bandage.reduction, 'dur', { label: 'Retire (min:s)' })}${cfgInput('bandage.lieu', c.bandage.lieu, 'text', { label: 'Lieu (pour la voyance)' })}</div>
        <div class="grid-auto">${cfgInput('antiFumigene.code', c.antiFumigene.code, 'text', { label: '🌬 Code antidote fumigène' })}${cfgInput('antiFumigene.fraction', c.antiFumigene.fraction, 'num', { label: 'Retire (fraction, ex. 0.33)' })}${cfgInput('antiFumigene.lieu', c.antiFumigene.lieu, 'text', { label: 'Lieu' })}</div>
        <h3>Clés des menottes (chaque code sert une fois)</h3>
        <div class="scroll"><table><thead><tr><th></th><th>Code</th><th>Lieu (pour la voyance)</th></tr></thead><tbody>${cles('A')}${cles('B')}</tbody></table></div>
      </div>
    </div>
    <div class="box"><h2>Règles</h2><div class="grid-auto">
      ${cfgInput('dureeMax', c.dureeMax, 'dur', { label: 'Durée max de partie' })}
      ${cfgInput('immunite', c.immunite, 'dur', { label: 'Immunité après attaque' })}
      ${cfgInput('safeZone.duree', c.safeZone.duree, 'dur', { label: 'Safe zone : durée' })}
      ${cfgInput('safeZone.lieu', c.safeZone.lieu, 'text', { label: 'Safe zone : lieu' })}
      ${cfgInput('erreursNumero', c.erreursNumero, 'num', { label: 'Erreurs de numéro avant blocage' })}
      ${cfgInput('blocageErreurs', c.blocageErreurs, 'dur', { label: 'Blocage après erreurs' })}
    </div></div>`;
}

function reglagesDuel(c) {
  const n = (p, l) => cfgInput(p, c[p], 'num', { label: l });
  const d = (p, l) => cfgInput(p, c[p], 'dur', { label: l });
  return `<div class="box"><h2>Déroulé</h2><div class="grid-auto">
      ${n('vies', 'Vies en phase 1')}${n('phase2', 'Joueurs en face-à-face')}${n('erreursFaceAFace', 'Erreurs permises (face-à-face)')}
      ${n('duelsMax', 'Duels en même temps (après les tours simultanés)')}${d('tempsTir', 'Temps pour tirer')}${n('seuilSimultane', 'Plus de tour simultané sous')}
      ${d('delaiMin', 'Délai entre duels : min')}${d('delaiMax', 'Délai entre duels : max')}${d('pasMin', 'Bruits de pas : min')}${d('pasMax', 'Bruits de pas : max')}${d('pauseFaceAFace', 'Pause paris (face-à-face)')}
    </div>
    <h3>Tours simultanés selon le nombre d'inscrits</h3>
    <div class="grid-auto">${cfgInput('simultanes.t1', c.simultanes.t1, 'num', { label: '1 tour à partir de' })}${cfgInput('simultanes.t2', c.simultanes.t2, 'num', { label: '2 tours à partir de' })}${cfgInput('simultanes.t3', c.simultanes.t3, 'num', { label: '3 tours à partir de' })}</div>
    <h3>Durées par tour (phase 1)</h3>
    <div class="scroll"><table><thead><tr><th>Tour</th>${c.dureesTours.map((_, i) => `<th>${i + 1}${i === c.dureesTours.length - 1 ? '+' : ''}</th>`).join('')}</tr></thead><tbody>
      <tr><td>Durée max</td>${c.dureesTours.map((v, i) => `<td>${cfgInput(`dureesTours.${i}`, v, 'dur', { width: '70px' })}</td>`).join('')}</tr>
      <tr><td>Pause paris après</td>${c.pauses.map((v, i) => `<td>${cfgInput(`pauses.${i}`, v, 'dur', { width: '70px' })}</td>`).join('')}</tr>
    </tbody></table></div></div>
    <div class="box"><h2>Primes et paris</h2><div class="grid-auto">
      ${n('primeTour', 'Par tour survécu')}${n('bonusDeuxVies', 'Bonus 2 vies en face-à-face')}${n('primeQuart', 'Éliminé en quart')}${n('primeDemi', 'Éliminé en demie')}
      ${n('primeFinaliste', 'Finaliste')}${n('primeVainqueur', 'Vainqueur')}${n('jetons', 'Jetons de pari')}${n('parisMax', 'Joueurs max par pari')}${n('coefPari', 'Bonus par duel gagné (ex. 0.3)')}
    </div></div>`;
}

function reglagesGrandPari(c) {
  const d = (p, v, l) => cfgInput(p, v, 'dur', { label: l });
  const n = (p, v, l) => cfgInput(p, v, 'num', { label: l });
  const team = (T, ti) => `<div class="box" style="background:var(--ink)">
      <div class="grid-auto">${cfgInput(`foot.equipes.${ti}.nom`, T.nom, 'text', { label: `Équipe ${ti + 1}` })}${cfgInput(`foot.equipes.${ti}.couleur`, T.couleur, 'text', { label: 'Couleur maillot' })}${cfgInput(`foot.equipes.${ti}.bord`, T.bord, 'text', { label: 'Couleur bordure' })}</div>
      <div class="scroll"><table><thead><tr><th>Poste</th><th>Nom</th><th>Attaque (0–1)</th><th>Défense (0–1)</th></tr></thead><tbody>${T.joueurs.map((j, i) => `<tr>
        <td>${['Gardien', 'Défenseur', 'Milieu', 'Attaquant', 'Attaquant'][i]}</td><td>${cfgInput(`foot.equipes.${ti}.joueurs.${i}.nom`, j.nom)}</td>
        <td>${cfgInput(`foot.equipes.${ti}.joueurs.${i}.attaque`, j.attaque, 'num', { width: '70px' })}</td><td>${cfgInput(`foot.equipes.${ti}.joueurs.${i}.defense`, j.defense, 'num', { width: '70px' })}</td></tr>`).join('')}</tbody></table></div></div>`;
  return `<div class="box"><h2>Général</h2><div class="grid-auto">
      ${n('argentDepart', c.argentDepart, 'Argent de départ ($)')}${d('intervalle', c.intervalle, 'Temps entre deux sports')}${d('fermeture', c.fermeture, 'Paris fermés avant le départ')}
      ${d('resultats', c.resultats, 'Affichage des résultats')}${n('miseMin', c.miseMin, 'Mise minimum ($)')}</div></div>
    <div class="box"><h2>🏇 Course de chevaux</h2><div class="grid-auto">${d('chevaux.duree', c.chevaux.duree, 'Durée')}${n('chevaux.tours', c.chevaux.tours, 'Nombre de tours')}</div>
      <div class="scroll"><table><thead><tr><th>Place</th>${c.chevaux.noms.map((_, i) => `<th>${i + 1}</th>`).join('')}</tr></thead><tbody>
        <tr><td>Cheval n°</td>${c.chevaux.noms.map((v, i) => `<td>${cfgInput(`chevaux.noms.${i}`, v, 'text', { width: '110px' })}</td>`).join('')}</tr>
        <tr><td>Gain si ${'<br>'}arrivé à cette place</td>${c.chevaux.gains.map((v, i) => `<td>${cfgInput(`chevaux.gains.${i}`, v, 'num', { width: '70px' })}</td>`).join('')}</tr></tbody></table></div></div>
    <div class="box"><h2>⚽ Match de foot</h2><div class="grid-auto">${d('foot.duree', c.foot.duree, 'Durée')}${n('foot.coteVainqueur', c.foot.coteVainqueur, 'Cote vainqueur')}${n('foot.marge', c.foot.marge, 'Marge de la banque (0.1 = 10 %)')}</div>
      <div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(380px,1fr))">${c.foot.equipes.map(team).join('')}</div></div>
    <div class="box"><h2>🥊 Battle royale</h2><div class="grid-auto">${d('boxe.duree', c.boxe.duree, 'Durée du combat')}${n('boxe.premier', c.boxe.premier, 'Gain si 1er')}${n('boxe.top3', c.boxe.top3, 'Gain si top 3')}${n('boxe.top25', c.boxe.top25, 'Gain si top 25 %')}${n('boxe.top50', c.boxe.top50, 'Gain si top 50 %')}</div></div>
    <div class="box"><h2>📈 Investissements</h2>
      <h3>Nombre par bloc selon les inscrits</h3><div class="grid-auto">${n('invest.seuils.min', c.invest.seuils.min, 'Moins de 10')}${n('invest.seuils.t10', c.invest.seuils.t10, '10 à 19')}${n('invest.seuils.t20', c.invest.seuils.t20, '20 à 34')}${n('invest.seuils.t35', c.invest.seuils.t35, '35 et plus')}</div>
      <h3>Catalogue (tirés au hasard à chaque bloc)</h3>
      <div class="scroll"><table><thead><tr><th></th><th>Nom</th><th>Gain si réussi</th><th>% des joueurs à convaincre</th><th>$ requis par joueur</th><th>% remboursé si échec</th></tr></thead><tbody>${c.invest.catalogue.map((it, i) => `<tr>
        <td>${cfgInput(`invest.catalogue.${i}.emoji`, it.emoji, 'text', { width: '50px' })}</td><td>${cfgInput(`invest.catalogue.${i}.nom`, it.nom)}</td>
        <td>${cfgInput(`invest.catalogue.${i}.gain`, it.gain, 'num', { width: '70px' })}</td><td>${cfgInput(`invest.catalogue.${i}.investisseurs`, it.investisseurs, 'num', { width: '70px' })}</td>
        <td>${cfgInput(`invest.catalogue.${i}.parJoueur`, it.parJoueur, 'num', { width: '80px' })}</td><td>${cfgInput(`invest.catalogue.${i}.remboursement`, it.remboursement, 'num', { width: '70px' })}</td></tr>`).join('')}</tbody></table></div></div>`;
}

function reglages() {
  const c = V.gameConfig;
  return `<p class="muted" style="margin:0">Réglages de : <strong>${esc(V.gameName)}</strong>. Pour régler un autre jeu, choisis-le dans l'onglet Soirée.</p>` +
    (V.gameId === 'chemin' ? reglagesChemin(c) : V.gameId === 'grandpari' ? reglagesGrandPari(c) : reglagesDuel(c));
}

// Alertes visibles dans tous les onglets.
function alerts() {
  const out = [];
  if (V.gameId === 'duel') {
    const missing = V.game ? V.game.players.filter(p => !p.num).map(p => p.name) : V.registered.filter(p => !p.dossard).map(p => p.name);
    if (missing.length) out.push(`👕 <strong>${missing.length} joueur${missing.length > 1 ? 's' : ''} sans numéro de maillot</strong> : ${missing.slice(0, 12).map(esc).join(', ')}${missing.length > 12 ? '…' : ''}`);
  }
  if (V.enLigne && !V.sauvegardeEnLigne) out.push('💾 <strong>Sauvegarde en ligne non activée</strong> : si le serveur redémarre, la partie et les joueurs sont perdus. Ajoute Upstash (voir le guide).');
  return out.map(t => `<div class="card danger" style="flex-direction:row;align-items:center">${t}</div>`).join('');
}

// ---------- rendu ----------
function draw() {
  if (!authed) {
    if (!document.getElementById('pw')) {
      SJ.render(app, `<div class="box" style="max-width:380px;margin:10vh auto"><h2>Admin de la soirée</h2>
        <form id="login" class="stack"><label class="field"><span class="label">Mot de passe</span><input class="in" id="pw" type="password" autocomplete="current-password"></label><button class="btn primary">Entrer</button></form></div>`);
    }
    return;
  }
  if (!V) return;
  const tabs = [['soiree', 'Soirée'], ['partie', 'Partie en cours'], ['reglages', 'Réglages du jeu'], ['classement', 'Classement']];
  const body = ui.tab === 'partie' ? partie() : ui.tab === 'reglages' ? reglages() : ui.tab === 'classement' ? classementTab() : soiree();
  SJ.render(app, alerts() + `<div class="spread"><h1 class="sc-title" style="font-size:34px">${esc(V.gameName)}</h1>
    <nav class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${ui.tab === k}">${l}</button>`).join('')}</nav></div>${body}`);
}

app.addEventListener('submit', e => { if (e.target.id === 'login') { e.preventDefault(); login(document.getElementById('pw').value); } });

// Confirmation intégrée à la page : un 2e clic dans les 3 s confirme.
let armed = null;
function confirmed(el) {
  if (!el.dataset.confirm) return true;
  if (armed === el.dataset.confirm + (el.dataset.pid || el.dataset.team || '')) { armed = null; return true; }
  armed = el.dataset.confirm + (el.dataset.pid || el.dataset.team || '');
  SJ.toast({ ok: false, msg: el.dataset.confirm + ' Clique encore pour confirmer.' });
  setTimeout(() => { armed = null; }, 3000);
  return false;
}

app.addEventListener('click', e => {
  const t = e.target.closest('[data-tab],[data-act],[data-jeu],[data-team-tab],[data-parti]');
  if (!t) return;
  if (t.dataset.tab) { ui.tab = t.dataset.tab; SJ.store('sj-admin-tab', ui.tab); return draw(); }
  if (t.dataset.teamTab) { ui.team = t.dataset.teamTab; return draw(); }
  if (t.dataset.parti) { ui.parti = ui.parti === t.dataset.parti ? null : t.dataset.parti; return draw(); }
  if (!confirmed(t)) return;
  const a = t.dataset.act;
  if (a === 'masquer') { ui.hideNames = !ui.hideNames; return draw(); }
  if (a === 'choisirJeu') return admin({ type: 'choisirJeu', gameId: t.dataset.id });
  if (a === 'ajuster') return admin({ type: 'ajuster', sec: Number(t.dataset.sec) });
  if (a === 'inscriptions') return admin({ type: 'inscriptions', value: t.dataset.v });
  if (a === 'retirerInscrit') return admin({ type: 'retirerInscrit', pid: t.dataset.pid });
  if (a === 'bonus') return admin({ type: 'bonus', pid: t.dataset.pid, delta: Number(t.dataset.delta) });
  if (a === 'bonusLibre') {
    const pid = document.getElementById('bonus-pid').value, delta = Number(document.getElementById('bonus-val').value);
    if (!pid || !delta) return SJ.toast({ ok: false, msg: 'Choisis un joueur et un nombre de points.' });
    return admin({ type: 'bonus', pid, delta });
  }
  if (a === 'afficherClassement') return admin({ type: 'afficherClassement', mode: t.dataset.mode });
  if (a === 'simStart') return admin({ type: 'simulation', cmd: 'start', n: Number(document.getElementById('sim-n').value), games: document.getElementById('sim-jeux').value.split(',') });
  if (a === 'simStop') return admin({ type: 'simulation', cmd: 'stop' });
  if (a === 'simErase') return admin({ type: 'simulation', cmd: 'effacer' });
  if (a === 'exporter') {
    const blob = new Blob([JSON.stringify(V.fullConfig, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `reglages-soiree-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    return SJ.toast({ ok: true, msg: 'Réglages exportés.' });
  }
  if (a) return admin({ type: a });
  const j = t.dataset.jeu;
  const action = { type: j, pid: t.dataset.pid, team: t.dataset.team, duel: t.dataset.duel, winner: t.dataset.winner, sec: t.dataset.sec };
  if (j === 'remplacer') {
    action.remplacant = document.getElementById('rempl-' + t.dataset.pid)?.value;
    if (!action.remplacant) return SJ.toast({ ok: false, msg: 'Choisis un remplaçant.' });
  }
  jeu(action).then(r => { if (r.ok && (j === 'remplacer' || j === 'sauter')) { ui.parti = null; draw(); } });
});

// Import d'un fichier de réglages.
app.addEventListener('change', async e => {
  if (e.target.id !== 'import-file' || !e.target.files[0]) return;
  try {
    const config = JSON.parse(await e.target.files[0].text());
    await admin({ type: 'importerReglages', config });
  } catch { SJ.toast({ ok: false, msg: 'Ce fichier n\'est pas un fichier de réglages.' }); }
  e.target.value = '';
});

// Maillots saisis pendant les inscriptions.
app.addEventListener('change', e => {
  const pid = e.target.dataset.dossard;
  if (pid) admin({ type: 'dossard', pid, value: e.target.value });
});

// Dossards du duel : enregistrés en quittant le champ.
app.addEventListener('change', e => {
  const pid = e.target.dataset.num;
  if (pid) jeu({ type: 'num', pid, value: e.target.value });
});
