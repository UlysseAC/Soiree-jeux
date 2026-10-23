// Interface admin : décompte, inscriptions, suivi de partie et réglages des jeux.
/* global SJ */
const app = document.getElementById('app');
const { esc, fmt, money } = SJ;
let V = null;
let authed = false;
const ui = { tab: SJ.store('sj-admin-tab') || 'soiree', team: 'A', hideNames: false, parti: null, reglJeu: null };
// Jeu dont on affiche les réglages (peut être un autre que le jeu en cours).
let cfgGame = null;

async function login(pw) {
  const r = await SJ.emit('hello', { role: 'admin', password: pw });
  authed = r.ok;
  if (r.ok) SJ.store('sj-admin', pw); else { SJ.store('sj-admin', null); SJ.toast(r); }
  draw();
}
SJ.sock.on('connect', () => { const pw = SJ.store('sj-admin'); if (pw) login(pw); else draw(); });
SJ.sock.on('etat', v => { V = v; document.body.dataset.game = v.gameId; keepCopy(); draw(); });

// Copie des réglages dans ce navigateur : si le serveur repart de zéro, on les remet en un clic.
function localCopy() {
  try { return JSON.parse(SJ.store('sj-admin-reglages') || 'null'); } catch { return null; }
}
function keepCopy() {
  if (!V.fullConfig || !V.reglagesMaj || V.simulation?.running) return;
  const c = localCopy();
  if (c && c.at === V.reglagesMaj) return;
  SJ.store('sj-admin-reglages', JSON.stringify({ at: V.reglagesMaj, config: V.fullConfig }));
}

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
  const game = scope === 'jeu' ? cfgGame : '';
  const id = 'c-' + scope + (game ? '-' + game : '') + '-' + path.replace(/\./g, '-');
  const attrs = `id="${id}" data-cfg="${path}" data-kind="${kind}" data-scope="${scope}"${game ? ` data-game="${game}"` : ''}${label ? '' : ` aria-label="${esc(path)}"`}`;
  let input;
  if (kind === 'area') input = `<textarea class="in" rows="2" ${attrs} placeholder="${esc(ph)}">${esc(value)}</textarea>`;
  else if (kind === 'bool') input = `<input type="checkbox" ${attrs} ${value ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--accent)">`;
  else input = `<input class="in" ${attrs} value="${esc(kind === 'dur' ? mmss(value) : value)}" placeholder="${esc(ph)}" ${kind !== 'text' ? 'inputmode="numeric"' : ''} style="${width ? `width:${width}` : ''}">`;
  return label ? `<label class="field"><span class="label">${esc(label)}</span>${input}</label>` : input;
}

// Enregistrement d'un réglage : en quittant le champ, et pour les textes déjà pendant la frappe.
const typing = new Map();
async function saveCfg(el) {
  clearTimeout(typing.get(el)?.t);
  typing.delete(el);
  let value = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.kind === 'dur') { value = parseDur(value); if (value == null) return SJ.toast({ ok: false, msg: 'Durée au format minutes:secondes, ex. 4:30' }); }
  if (el.dataset.kind === 'num') value = Number(String(value).replace(',', '.'));
  const r = await admin({ type: 'config', scope: el.dataset.scope === 'soiree' ? 'soiree' : 'jeu', gameId: el.dataset.game || undefined, path: el.dataset.cfg, value });
  const cur = document.getElementById(el.id) || el;
  cur.classList.remove('saving');
  if (r.ok) { cur.classList.add('saved'); setTimeout(() => cur.classList.remove('saved'), 1500); }
  // Mini-Jeux : les heures sont celles du fuseau de ce navigateur.
}
app.addEventListener('change', e => { if (e.target.dataset.cfg) saveCfg(e.target); if (e.target.id === 'reprise-pid') ui.reprisePid = e.target.value; if (e.target.id === 'ajout-pid') ui.ajoutPid = e.target.value; });
app.addEventListener('input', e => {
  const el = e.target;
  if (!el.dataset.cfg || !['text', 'area'].includes(el.dataset.kind)) return;
  el.classList.add('saving');
  clearTimeout(typing.get(el)?.t);
  typing.set(el, { t: setTimeout(() => saveCfg(el), 700) });
});
// Page fermée ou téléphone verrouillé en pleine frappe : on enregistre tout de suite.
const flushCfg = () => { for (const el of [...typing.keys()]) saveCfg(el); };
addEventListener('pagehide', flushCfg);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushCfg(); });

// ---------- programme de la soirée ----------
const nomJeu = id => V.games.find(g => g.id === id)?.name ?? id;
// Jeux simulables ensemble (hors mini-jeux), parmi ceux de la soirée.
const simTrois = () => ['chemin', 'grandpari', 'duel'].filter(id => V.games.some(g => g.id === id));

function programme() {
  const prog = V.programme, started = V.soiree?.started;
  const autres = V.games.filter(g => !prog.includes(g.id));
  const idx = prog.indexOf(V.gameId);
  const suivant = idx >= 0 ? prog[idx + 1] : prog[0];
  const etat = id => id === V.gameId
    ? `<span class="pill accent">${{ idle: 'jeu actuel', countdown: 'décompte', playing: '▶ en cours', finished: 'terminé' }[V.status]}</span>`
    : V.joues.includes(id) ? '<span class="pill ok">✓ joué</span>' : '';
  const lignes = prog.map((id, i) => `<div class="stack" style="gap:6px;padding:8px 0;border-bottom:1px solid var(--line)">
    <div class="row"><span class="mono muted">${i + 1}.</span><strong>${esc(nomJeu(id))}</strong>${etat(id)}</div>
    <div class="row">
      ${id !== V.gameId ? `<button class="btn sm" data-act="choisirJeu" data-id="${id}" ${V.status === 'playing' ? 'disabled' : ''}>Choisir</button>` : ''}
      <button class="btn sm" data-regler="${id}">⚙ Régler</button>
      <button class="btn sm" data-prog="monter" data-id="${id}" ${i === 0 ? 'disabled' : ''} aria-label="Monter">↑</button>
      <button class="btn sm" data-prog="descendre" data-id="${id}" ${i === prog.length - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button>
      <button class="btn sm" data-prog="retirer" data-id="${id}" aria-label="Retirer ${esc(nomJeu(id))} de la soirée">✕</button>
    </div></div>`).join('');
  return `<div class="spread"><h2>${started ? 'Soirée en cours' : 'Programme de la soirée'}</h2>
      ${started && idx >= 0 ? `<span class="pill accent">Jeu ${idx + 1} / ${prog.length}</span>` : ''}</div>
    <p class="muted" style="margin:0;font-size:14px">${started
      ? 'Tu peux encore ajouter, retirer ou réordonner les jeux, et changer leurs réglages.'
      : 'Choisis les jeux de ce soir et leur ordre, règle chacun avec « ⚙ Régler », puis démarre la soirée.'}</p>
    ${prog.length ? `<div>${lignes}</div>` : '<p class="muted" style="margin:0">Aucun jeu choisi.</p>'}
    ${autres.length ? `<div class="row"><span class="muted">Ajouter :</span>${autres.map(g => `<button class="btn sm" data-prog="ajouter" data-id="${g.id}">+ ${esc(g.name)}</button>
      <button class="btn sm" data-regler="${g.id}" aria-label="Régler ${esc(g.name)}">⚙</button>`).join('')}</div>` : ''}
    <div class="row">${started
      ? `${suivant ? `<button class="btn primary" data-act="jeuSuivant" ${V.status === 'playing' ? 'disabled title="Termine d\'abord la partie en cours"' : ''}>Jeu suivant : ${esc(nomJeu(suivant))} ▶</button>`
          : '<span class="muted">Dernier jeu : affiche le grand final dans l\'onglet Classement.</span>'}
         <button class="btn sm" data-act="terminerSoiree" data-confirm="Terminer la soirée ? Le classement reste visible.">Terminer la soirée</button>`
      : `<button class="btn primary" data-act="demarrerSoiree" ${prog.length ? '' : 'disabled'} data-confirm="Démarrer la soirée ? Le classement repart de zéro.">▶ Démarrer la soirée</button>`}</div>`;
}

function changerProgramme(action, id) {
  const p = [...V.programme], i = p.indexOf(id);
  if (action === 'ajouter' && i < 0) p.push(id);
  if (action === 'retirer' && i >= 0) p.splice(i, 1);
  if (action === 'monter' && i > 0) [p[i - 1], p[i]] = [p[i], p[i - 1]];
  if (action === 'descendre' && i >= 0 && i < p.length - 1) [p[i + 1], p[i]] = [p[i], p[i + 1]];
  return admin({ type: 'programme', ids: p });
}

// ---------- onglet Soirée ----------
function soiree() {
  const statusLabel = { idle: 'En attente', countdown: V.paused ? 'Décompte en pause' : 'Décompte en cours', playing: V.paused ? 'Jeu en pause' : 'Partie en cours', finished: 'Partie terminée' }[V.status];
  const clock = V.status === 'countdown' ? (V.paused ? fmt(V.remaining) : `<span data-until="${V.endsAt}"></span>`) : V.status === 'playing' ? (V.paused ? '⏸' : '▶') : '—';
  return `<div class="grid-2">
    <div class="box">
      ${programme()}
      <h2 style="margin-top:8px">Décompte : ${esc(V.gameName)}</h2>
      <div class="clock">${clock}</div>
      <div class="row"><span class="pill accent">${statusLabel}</span><span class="pill ${V.inscriptionsOpen ? 'ok' : ''}">${V.inscriptionsOpen ? '● Inscriptions ouvertes' : 'Inscriptions fermées'}</span><span class="pill">${V.registeredCount} inscrits</span></div>
      ${V.message ? `<p class="muted" style="margin:0;color:var(--danger)">${esc(V.message)}</p>` : ''}
      <div class="grid-auto">
        ${cfgInput('decompte', V.config.decompte, 'dur', { scope: 'soiree', label: 'Décompte total (min:s)' })}
        ${cfgInput('inscriptions', V.config.inscriptions, 'dur', { scope: 'soiree', label: 'Inscriptions avant (min:s)' })}
      </div>
      <div class="row">
        <button class="btn primary" data-act="demarrer">▶ Démarrer le décompte</button>
        <button class="btn" data-act="pause" ${V.status === 'countdown' || V.status === 'playing' ? '' : 'disabled'}>${V.paused ? '▶ Reprendre' : '⏸ Pause'}</button>
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
          <td><button class="btn sm" data-act="retirerInscrit" data-pid="${p.pid}" data-confirm="Retirer ${esc(p.name)} des inscrits ?" aria-label="Retirer ${esc(p.name)}">✕</button></td></tr>`).join('')}</tbody></table></div>` :
      V.registered.length ? `<div class="row">${V.registered.map(p => `<span class="pill">${esc(p.name)} <button class="btn sm" style="padding:0 6px;border:0;background:none" data-act="retirerInscrit" data-pid="${p.pid}" data-confirm="Retirer ${esc(p.name)} des inscrits ?" aria-label="Retirer ${esc(p.name)}">✕</button></span>`).join('')}</div>` : '<p class="muted" style="margin:0">Personne pour l\'instant.</p>'}
      ${V.status === 'playing' ? `<h2 style="margin-top:8px">Ajouter à la partie en cours</h2>
      <p class="muted" style="margin:0;font-size:14px">Quelqu'un n'est pas dans la partie alors qu'il devait jouer ? Ajoute-le : au Chemin, il entre comme détective (la chaîne ne change pas) ; au Grand Pari, il reçoit l'argent de départ ; au Duel, seulement avant les premiers duels.</p>
      <div class="row"><select class="in" id="ajout-pid" style="width:auto;min-width:180px"><option value="">Choisis le joueur</option>${V.people.filter(p => !V.registered.some(r => r.pid === p.pid)).map(p => `<option value="${p.pid}" ${ui.ajoutPid === p.pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <button class="btn" data-act="ajouterEnCours">Ajouter à la partie</button></div>` : ''}
      ${V.journal?.length ? `<h2 style="margin-top:8px">Désinscriptions et ajouts</h2>
      <div class="stack" style="gap:2px;font-size:14px">${V.journal.map(j => `<div><span class="mono muted">${new Date(j.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span> · <strong>${esc(j.nom)}</strong> · ${esc(j.jeu)} : ${esc(j.quoi)}</div>`).join('')}</div>` : ''}
      <h2 style="margin-top:8px">Joueur sur un autre téléphone</h2>
      <p class="muted" style="margin:0;font-size:14px">Quelqu'un a changé de téléphone ou de navigateur et ne retrouve plus son compte ? Donne-lui un code : sur son téléphone, il touche « J'étais déjà inscrit sur un autre téléphone », puis écrit son prénom et le code. Il retrouve son inscription, son rôle et ses points.</p>
      <div class="row"><select class="in" id="reprise-pid" style="width:auto;min-width:180px"><option value="">Choisis le joueur</option>${V.people.map(p => `<option value="${p.pid}" ${ui.reprisePid === p.pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <button class="btn" data-act="codeReprise">Donner un code</button></div>
      ${ui.reprise ? `<p style="margin:0;font-size:20px">Code pour <strong>${esc(ui.reprise.name)}</strong> : <strong class="mono" style="font-size:28px">${ui.reprise.code}</strong> <span class="muted" style="font-size:14px">(valable 10 min, une fois)</span></p>` : ''}
      <h2 style="margin-top:8px">Liens</h2>
      <div class="stack" style="gap:6px;font-size:14px">
        <div>📺 Écran public : <a href="${SJ.base}/ecran" target="_blank" class="mono">${location.origin}${SJ.base}/ecran</a></div>
        <div>📱 Joueurs : <a href="${SJ.base}/jouer" target="_blank" class="mono">${location.origin}${SJ.base}/jouer</a> (QR code sur l'écran)</div>
        <div>🛡 Orga safe zone : <a href="${SJ.base}/orga" target="_blank" class="mono">${location.origin}${SJ.base}/orga</a></div>
      </div>
      <div class="grid-auto">${cfgInput('orgaCode', V.config.orgaCode, 'text', { scope: 'soiree', label: 'Code orga' })}</div>
      <h2 style="margin-top:8px">Simulation</h2>
      <p class="muted" style="margin:0;font-size:14px">De faux joueurs jouent pour de vrai : regarde l'écran public. Tes réglages sont remis comme avant à la fin.
        Pendant une vraie partie, la simulation tourne à part, sans rien toucher : regarde-la sur l'<a href="${SJ.base}/ecran?test" target="_blank" rel="noopener">écran de test</a>.
        <strong>Joueurs incarnés</strong> : autant de places sont gardées pour de vrais téléphones. Seulement pour le test d'un mini-jeu : ouvre <span class="mono">/jouer?test</span> sur ton téléphone (ou scanne le QR code de l'écran de test) et prends un nom « Incarné 1, 2… » ; la partie attend tes téléphones.</p>
      ${V.simulation?.running ? `<div class="row"><span class="pill accent">▶ ${esc(V.simulation.step)}</span><span class="muted">${V.simulation.bots} faux joueurs</span><button class="btn sm danger" data-act="simStop">Arrêter</button></div>` : `
      <div class="row"><label class="field" style="max-width:120px"><span class="label">Faux joueurs</span><input class="in" id="sim-n" inputmode="numeric" value="50"></label>
        <label class="field" style="max-width:150px"><span class="label">Joueurs incarnés (mini-jeu)</span><input class="in" id="sim-moi" inputmode="numeric" value="0"></label>
        <label class="field" style="max-width:220px"><span class="label">Jeux</span><select class="in" id="sim-jeux">${simTrois().length > 1 ? `<option value="${simTrois().join(',')}">${simTrois().length === 3 ? 'Les 3 jeux (~25 min)' : 'Les jeux de la soirée'}</option>` : ''}${V.games.filter(g => g.id !== 'minijeux').map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}${V.games.some(g => g.id === 'minijeux') ? `<optgroup label="Tester un mini-jeu (faux joueurs, quelques minutes)">${[["definition", "La Définition"], ["anecdote", "L'Anecdote"], ["temple", "Le Temple aztèque"], ["mime", "Le Mime"], ["dragon", "La Chasse au dragon"], ["disparu", "Qu'est-ce qui a changé ?"], ["quiz", "Le Quiz"]].map(([v, l]) => `<option value="mini:${v}">${l}</option>`).join('')}</optgroup>` : ''}</select></label>
        <button class="btn primary" data-act="simStart" style="align-self:flex-end">▶ Lancer la simulation</button></div>
      ${V.simulation?.canErase ? `<div class="row"><span class="muted">${esc(V.simulation.step)}</span><button class="btn sm danger" data-act="simErase" data-confirm="Effacer les faux joueurs et leurs points ?">Effacer la simulation</button></div>` : ''}`}
      <h2 style="margin-top:8px">Sauvegarde des réglages</h2>
      <p class="muted" style="margin:0;font-size:14px">Tous les réglages (noms, indices, codes, armes, durées, primes, points) dans un fichier, pour les garder ou les remettre sur un autre serveur.</p>
      <div class="row"><button class="btn" data-act="exporter">⬇ Exporter les réglages</button>
        <label class="btn" style="cursor:pointer">⬆ Importer un fichier<input type="file" id="import-file" accept="application/json,.json" hidden></label></div>
      <h2 style="margin-top:8px">Noms des jeux</h2>
      <p class="muted" style="margin:0;font-size:14px">Affichés partout : écran public, téléphones, classement. Laisse vide pour revenir au nom d'origine.</p>
      <div class="grid-auto">${V.games.map((g, i) => cfgInput(`nomsJeux.${g.id}`, V.config.nomsJeux?.[g.id] ?? g.name, 'text', { scope: 'soiree', label: { chemin: 'Jeu de la chaîne et des détectives', duel: 'Jeu des cowboys', grandpari: 'Jeu des paris sportifs', minijeux: 'Journée de mini-jeux', enquete: 'Cluedo grandeur nature' }[g.id] || `Jeu ${i + 1}` })).join('')}</div>
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
      ${t.chain.map(c => `<tr><td class="mono">${c.step}</td><td>${nm(c.name)}</td><td class="mono">${c.numero ?? '—'}</td><td>${c.state === 'faite' ? '<span class="pill ok">✓</span>' : c.state ? `<span class="pill accent">${c.state}</span>` : ''}${c.aide ? ' <span title="Indice bonus utilisé">💡</span>' : ''}</td></tr>`).join('')}
      </tbody></table></div>
      <div><span class="label">Détectives</span><p style="margin:4px 0 0">${t.detectives.map(d => `${nm(d.name)} ${d.inv}`).join(' · ') || '—'}</p></div>
      ${t.debloquer ? `<button class="btn sm" data-jeu="validerEtape" data-team="${T}" data-confirm="${esc(t.debloquer)} ?">🔓 ${esc(t.debloquer)}</button>` : ''}
    </div>`;
  };
  const players = g.players.map(p => {
    const state = p.block ? `<span class="pill danger">${esc(p.block.label)}${p.block.until ? ` <span class="mono" data-until="${p.block.until}"></span>` : ''}</span>`
      : p.safeUntil ? `<span class="pill safe">🛡 <span class="mono" data-until="${p.safeUntil}"></span></span>`
      : p.immuneUntil ? `<span class="pill">Immunisé <span class="mono" data-until="${p.immuneUntil}"></span></span>` : '<span class="pill">En jeu</span>';
    const mates = g.players.filter(x => x.team === p.team && x.pid !== p.pid);
    const parti = ui.parti === p.pid
      ? `<select class="in" id="rempl-${p.pid}" style="width:auto"><option value="auto">Répartir entre les autres randoms</option>${mates.map(x => `<option value="${x.pid}">${esc(x.name)}</option>`).join('')}</select>
         <button class="btn sm" data-jeu="remplacer" data-pid="${p.pid}">Remplacer</button><button class="btn sm danger" data-jeu="sauter" data-pid="${p.pid}" data-confirm="Sauter son étape ? L'équipe ne pourra plus gagner en finissant.">Sauter</button>`
      : `<button class="btn sm danger" data-parti="${p.pid}">Joueur parti</button>`;
    return `<tr><td>${nm(p.name)}${p.panne ? ` <span class="pill ${p.panne.entre ? 'ok' : ''}">${p.panne.entre ? '✓' : '⏳'} ${esc(p.panne.salle)}</span>` : ''}</td><td><span class="pill ${p.team.toLowerCase()}">${p.team}</span></td><td>${p.role === 'random' ? 'Random' : 'Détective'}</td><td>${state}</td>
      <td class="nowrap"><div class="row">${p.safeUntil ? `<button class="btn sm" data-jeu="finSafe" data-pid="${p.pid}">Retirer safe zone</button>` : `<button class="btn sm" data-jeu="safe" data-pid="${p.pid}">🛡 Safe zone</button>`}
      ${p.block ? `<button class="btn sm" data-jeu="liberer" data-pid="${p.pid}">Libérer</button>` : ''}${parti}</div></td></tr>`;
  }).join('');
  return `<div class="spread"><div class="row"><span class="pill accent">${g.finished ? (g.winner ? `Équipe ${g.winner} gagne` : 'Terminée') : 'En cours'}</span>${g.finished ? '' : `<span class="muted">Fin au plus tard dans <span class="mono" data-until="${g.endsAt}"></span></span>`}</div>
      <div class="row"><button class="btn sm" data-act="masquer">${ui.hideNames ? 'Afficher les noms' : 'Masquer les noms'}</button><button class="btn sm danger" data-jeu="terminer" data-confirm="Terminer la partie maintenant ? L'équipe la plus avancée gagne.">Terminer la partie</button></div></div>
    <div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">${team('A')}${team('B')}</div>
    <div class="box"><h2>Joueurs</h2><div class="scroll"><table><thead><tr><th>Joueur</th><th>Équipe</th><th>Rôle</th><th>État</th><th>Actions</th></tr></thead><tbody>${players}</tbody></table></div></div>
    <div class="box"><h2>Historique des étapes</h2><p class="muted" style="margin:0;font-size:14px">Qui a validé quelle étape, et chaque action de l'admin (débloquer, remplacer, sauter).</p>
      <div style="max-height:320px;overflow:auto">${ui.hideNames ? '<p class="muted">Masqué (noms cachés).</p>' : (g.histo || []).map(h => `<div style="font-size:14px"><span class="mono muted">${new Date(h.t).toLocaleTimeString('fr-FR')}</span> <span class="pill ${h.team.toLowerCase()}">${h.team}</span> ${esc(h.text)}</div>`).join('') || '<p class="muted">Rien pour l\'instant.</p>'}</div></div>
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
  // Pause de n'importe quel jeu en cours : le temps s'arrête (chronos, tours, attaques…), puis reprend où il en était.
  const pause = V.status === 'playing' ? `<div class="box${V.paused ? ' accent' : ''}"><div class="spread"><strong>${V.paused ? '⏸ Jeu en pause : le temps est arrêté' : 'Partie en cours'}</strong>
    <button class="btn ${V.paused ? 'primary' : ''}" data-act="pause">${V.paused ? '▶ Reprendre' : '⏸ Pause'}</button></div></div>` : '';
  return pause + partieJeu();
}
function partieJeu() {
  if (V.gameId === 'minijeux') return partieMiniJeux(V.game);
  if (!V.game) return `<div class="box"><p class="muted" style="margin:0">Aucune partie en cours. Lance le décompte dans l'onglet Soirée.</p></div>`;
  return V.gameId === 'chemin' ? partieChemin(V.game) : V.gameId === 'grandpari' ? partieGrandPari(V.game) : V.gameId === 'enquete' ? partieEnquete(V.game) : partieDuel(V.game);
}

// ---------- jeu 5 : L'Enquête ----------
const eqLignes = t => String(t || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const eqTablettes = n => `<div class="row" style="flex-wrap:wrap">${Array.from({ length: n }, (_, i) => `<a class="btn sm" href="${SJ.base}/salle?n=${i}" target="_blank" rel="noopener">Tablette ${i + 1}</a>`).join('')}</div>
  <p class="muted" style="margin:0;font-size:14px">Ouvre chaque lien sur la tablette de sa salle (le code orga est demandé une fois : ${esc(V.config.orgaCode)}). Le QR code change toutes les ${esc(V.fullConfig.games.enquete.rotationQr)} s : une photo du QR code ne marche pas longtemps.</p>`;
// Test des tâches : un lien (et son QR code) vers la page qui fait jouer les 22 tâches sans lancer de partie.
function eqTestTaches() {
  const url = `${location.origin}${SJ.base}/test-taches`;
  return `<div class="box"><h2>🧪 Tester les tâches</h2>
    <p class="muted" style="margin:0;font-size:14px">Joue les 22 tâches à la suite, sans lancer de partie : scanne ce QR code avec ton téléphone (code orga : ${esc(V.config.orgaCode)}). Pour une tâche à plusieurs, tu joues tous les rôles sur le même appareil.</p>
    <div class="row" style="flex-wrap:wrap;align-items:center"><img src="/qr.svg?d=${encodeURIComponent(url)}" alt="QR code du test des tâches" width="150" height="150" style="background:#fff;border-radius:8px"><a class="btn primary" href="${url}" target="_blank" rel="noopener">🧪 Ouvrir le test</a></div></div>`;
}
// Liens permanents des salles : une ligne par salle, à copier-coller dans un message pour que chacun clique sur sa salle.
function eqLiensSalles(g) {
  if (!g.liensSalles?.length) return '';
  const base = `${location.origin}${SJ.base}/jouer`;
  const texte = g.liensSalles.map(l => `${l.nom} : ${base}?salle=${l.n}&c=${l.code}`).join('\n');
  return `<div class="box"><div class="spread"><h2>🔗 Liens des salles</h2><button class="btn primary" data-act="copierLiens">📋 Copier</button></div>
    <p class="muted" style="margin:0;font-size:14px">Un lien par salle, valable pour cette partie : un joueur qui clique dessus entre dans la salle, sans scanner la tablette. Attention : quiconque a le lien peut entrer dans la salle sans y être (tu peux désactiver ces liens dans les réglages).</p>
    <textarea class="in" id="eq-liens" rows="${g.liensSalles.length + 1}" readonly style="font-size:13px;white-space:pre">${esc(texte)}</textarea></div>`;
}
function partieEnquete(g) {
  const phase = g.finished ? 'Terminée' : { intro: 'Introduction (texte à l\'écran)', panne: '⚡ Panne de courant', enquete: 'Enquête en cours', finale: '⚡ Phase finale' }[g.phase];
  let h = `<div class="spread"><div class="row"><span class="pill accent">${phase}</span>${g.endsAt && !g.finished ? `${g.panne ? `<span class="muted">⚡ Panne : ${g.panne.entres} / ${g.panne.total} salles réparées</span>` : ''}<span class="muted">fin dans <span class="mono" data-until="${g.endsAt}"></span>${g.finaleAt && g.phase === 'enquete' ? ` · phase finale dans <span class="mono" data-until="${g.finaleAt}"></span>` : ''}</span>` : ''}</div>
    <div class="row">
      ${g.phase === 'intro' && !g.finished ? '<button class="btn primary" data-jeu="lancer">▶ Lancer l\'enquête</button>' : ''}
      ${g.phase === 'panne' ? '<button class="btn primary" data-jeu="commencer" data-confirm="Rétablir le courant et commencer sans attendre les joueurs restants ?">💡 Rétablir le courant maintenant</button>' : ''}
      ${g.phase === 'enquete' && !g.finished ? '<button class="btn" data-jeu="finale" data-confirm="Lancer la phase finale (indices doublés) ?">⚡ Phase finale</button>' : ''}
      ${!g.finished ? '<button class="btn sm danger" data-jeu="terminer" data-confirm="Terminer l\'enquête et révéler la solution ?">Terminer</button>' : ''}</div></div>`;
  // Tout ce qui donnerait un avantage (solution, tueur, personnages, cartes) reste caché, même ici, jusqu'à « Révéler » :
  // l'organisateur peut jouer. « Révéler » ne change que cette page d'admin, jamais l'écran ni les téléphones.
  const vu = ui.eqSolution || g.finished;
  h += `<div class="box${vu ? ' accent' : ''}"><div class="spread"><h2>🔒 Secrets de l'enquête</h2>
      ${g.finished ? '' : ui.eqSolution ? '<button class="btn sm" data-act="eqSolution">Cacher</button>' : '<button class="btn sm" data-act="eqSolution" data-confirm="Révéler la solution, les personnages et les cartes sur cette page d\'admin seulement ?">👁 Révéler (admin seulement)</button>'}</div>
    ${vu ? `<p style="margin:0;font-size:18px">${esc(g.solution.perso)} · ${esc(g.solution.arme)} · ${esc(g.solution.salle)}</p><p class="muted" style="margin:0">Le tueur (sans le savoir) : <strong>${esc(g.tueur)}</strong></p>
      <div class="scroll"><table><thead><tr><th>Salle</th><th>Indice 1</th><th>Indice 2</th><th>Indice 3</th></tr></thead><tbody>${(g.indicesSalles || []).map(r => `<tr><td>${esc(r.salle)}${r.propre ? ' <span class="pill accent">trop propre</span>' : ''}</td>${r.indices.map(x => `<td>${x.ecrit ? '' : '<span class="muted" title="rempli automatiquement">🎲 </span>'}${esc(x.texte)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : '<p class="muted" style="margin:0">Solution, tueur, personnages et cartes des joueurs sont cachés, pour que tu puisses jouer sans avantage. « Révéler » ne les montre que sur cette page (deux clics), jamais sur l\'écran ni les téléphones.</p>'}</div>`;
  const taches = V.gameConfig?.taches !== false;
  h += `<div class="box"><div class="spread"><h2>🛠 Tâches des salles</h2><button class="btn ${taches ? 'primary' : ''}" data-act="eqTaches">${taches ? 'Activées · revenir à l\'indice gratuit' : 'Indice gratuit · activer les tâches'}</button></div>
    <p class="muted" style="margin:0;font-size:14px">${taches ? 'Il faut réussir la tâche d\'une salle pour recevoir son indice.' : 'Les joueurs demandent l\'indice à la tablette, sans tâche.'} Ça change tout de suite. Tâches salle par salle : onglet Réglages des jeux.</p>
    ${taches ? (() => { const c = V.fullConfig.games.enquete; cfgGame = 'enquete'; const champs = `<div class="grid-auto">${eqDifficulte(c)}${cfgInput('chanceSolo', c.chanceSolo, 'num', { label: 'Chance d\'avoir la tâche solo (%)' })}</div>`; cfgGame = null; return champs; })() : ''}
    ${taches && g.taches?.length ? `<div class="scroll"><table><thead><tr><th>Salle</th><th>Tâche du moment</th><th>État</th><th></th></tr></thead><tbody>${g.taches.map(t => `<tr><td>${esc(t.nomSalle)}</td><td>${esc(t.nom)} <span class="muted">${t.aucune ? '' : t.groupe ? '(à plusieurs)' : '(solo)'}</span></td>
      <td class="muted">${t.etat === 'libre' ? '' : `${t.etat === 'jeu' ? 'en cours' : 'en attente'} : ${t.joueurs.map(nm).join(', ')}`}</td><td><button class="btn sm" data-jeu="nouvelleTache" data-salle="${t.salle}" data-confirm="Faire tirer une autre tâche à cette salle ?">Autre tâche</button></td></tr>`).join('')}</tbody></table></div>` : ''}</div>`;
  const fiche = !!V.gameConfig?.ficheNumerique;
  h += `<div class="box"><div class="spread"><h2>📋 Fiche de détective</h2><button class="btn ${fiche ? 'primary' : ''}" data-act="eqFiche">${fiche ? 'Sur le téléphone · passer au papier' : 'Sur papier · mettre sur le téléphone'}</button></div>
    <p class="muted" style="margin:0;font-size:14px">${fiche ? 'Les joueurs ont un onglet « Fiche » qui se remplit tout seul (leurs cartes, les cartes montrées, les indices) et où ils barrent des cartes.' : 'Pas de fiche sur le téléphone : les joueurs la font sur papier. Ils gardent l\'onglet « Indices » avec tous leurs indices et leurs questions.'} Ça change tout de suite, même en pleine partie.</p></div>`;
  h += eqLiensSalles(g);
  h += eqTestTaches();
  h += `<div class="box"><h2>Tablettes des salles</h2>${eqTablettes(g.salles.length)}</div>`;
  if (g.attente.length) h += `<div class="box"><h2>Questions en attente de réponse</h2>${g.attente.map(q => `<p style="margin:0">${esc(q.de)} → ${esc(q.a)} <span class="muted">(${esc(q.salle)})</span></p>`).join('')}</div>`;
  h += `<div class="box"><h2>Enquêteurs (${g.liste.length})</h2><div class="scroll"><table><thead><tr><th>Joueur</th><th>Personnage</th><th>Cartes</th><th>Salle</th><th>Indices</th><th>Accusation</th></tr></thead><tbody>${g.liste.map(p => `<tr>
      <td>${nm(p.name)}</td><td>${!vu ? '<span class="muted">•••</span>' : g.phase === 'intro' && !g.finished ? `<select class="in" data-eqperso="${p.pid}" style="width:auto">${g.persos.map(x => `<option value="${x.id}" ${x.id === p.perso.id ? 'selected' : ''}>${esc(x.nom)}</option>`).join('')}</select>` : esc(p.perso.nom)}</td><td class="muted">${vu ? p.main.map(esc).join(', ') : '•••'}</td>
      <td><select class="in" data-eqplacer="${p.pid}" style="width:auto">${p.salle ? '' : '<option value="">—</option>'}${g.salles.map(s => `<option value="${s.id}" ${s.nom === p.salle ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}</select></td>
      <td class="mono">${p.indices}</td><td>${p.mort ? '<span class="pill danger">💀 assassiné</span> ' : ''}${p.accuse === 'fausse' ? '<span class="pill danger">fausse</span>' : p.accuse === 'juste' ? '<span class="pill ok">juste</span>' : p.accuse === 'tueur' && vu ? `<span class="pill danger">🔪 tueur actif · ${p.victimes} victime(s)</span>` : p.accuse === 'tueur' ? '<span class="pill">a accusé</span>' : ''}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted" style="margin:0;font-size:14px">Un QR code ne passe pas ? Choisis la salle du joueur ici.</p></div>`;
  h += `<div class="box"><h2>En direct</h2><div class="feed">${g.feed.map(f => `<div><time>${hhmm(f.t)}</time><span>${esc(f.text)}</span></div>`).join('')}</div></div>`;
  return h;
}
app.addEventListener('change', e => { const pid = e.target.dataset.eqplacer; if (pid && e.target.value) jeu({ type: 'placer', pid, salle: e.target.value }); });
app.addEventListener('change', e => { const pid = e.target.dataset.eqperso; if (pid) jeu({ type: 'personnage', pid, perso: e.target.value }); });

// Personnages : un nom par ligne, attribués au hasard aux joueurs au lancement.
function eqPersos(c) {
  const noms = String(c.personnages || '').split(/\r?\n/).map(l => l.split('=').pop().trim()).filter(Boolean);
  const n = Math.max(14, noms.length + 2);
  return `<div class="stack" style="gap:6px">${Array.from({ length: n }, (_, i) => `<input class="in" data-eqnom id="eq-perso-${i}" value="${esc(noms[i] || '')}" placeholder="Personnage ${i + 1}" maxlength="40">`).join('')}</div>`;
}
// Enregistrés ensemble, une ligne par personnage rempli.
async function eqSauverNoms(el) {
  const out = [];
  for (let i = 0; document.getElementById(`eq-perso-${i}`); i++) {
    const n = document.getElementById(`eq-perso-${i}`).value.trim().replace(/=/g, '');
    if (n) out.push(n);
  }
  const r = await admin({ type: 'config', scope: 'jeu', gameId: 'enquete', path: 'personnages', value: out.join('\n') });
  if (r.ok) { el.classList.add('saved'); setTimeout(() => el.classList.remove('saved'), 1500); }
}
app.addEventListener('change', e => { if (e.target.dataset.eqnom != null) eqSauverNoms(e.target); });

// Tâches de chaque salle, dans l'ordre des salles (les mêmes que SALLES dans server/games/taches.js).
const EQ_TACHES = [['Pression des pneus', 'Changer la roue', 2], ['Ranger les boules de billard', 'La table de poker truquée', 2], ['Polir l\'argenterie', 'Dresser la table', 2], ['Remonter la pendule', 'Les lampes à pétrole', 2],
  ['Fourneau à charbon', 'Le soufflé', 2], ['Machine à écrire', 'Le coffre-fort', 2], ['Réparer la tuyauterie', 'Réparer les canalisations', 2], ['Faire le lit', 'Fermer les lourds volets', 2],
  ['Épousseter la malle', 'La radio à galène', 2], ['Les encyclopédies', 'La porte secrète', 3], ['Préparer la potion', 'La cuve de stérilisation', 3]];
const eqDifficulte = c => `<label class="field"><span class="label">Difficulté des tâches</span><select class="in" id="c-jeu-enquete-difficulte" data-cfg="difficulte" data-kind="text" data-scope="jeu" data-game="enquete">${[['facile', 'Facile'], ['normal', 'Normal'], ['difficile', 'Difficile']].map(([k, l]) => `<option value="${k}" ${c.difficulte === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
function eqReglagesTaches(c, salles) {
  return `<div class="box"><h2>🛠 Tâches des salles</h2><div class="grid-auto">
      ${cfgInput('taches', c.taches, 'bool', { label: 'Tâches pour obtenir les indices (sinon indice gratuit)' })}
      ${eqDifficulte(c)}
      ${cfgInput('chanceSolo', c.chanceSolo, 'num', { label: 'Chance d\'avoir la tâche solo (%)' })}
    </div>
    <p class="muted" style="margin:0;font-size:14px">Difficulté : facile = zones plus larges, moins de temps à tenir, moins de manches ; difficile = l'inverse. Une salle sans aucune tâche cochée donne son indice gratuitement. Les changements comptent pour les prochaines tâches tirées.</p>
    <div class="scroll"><table><thead><tr><th>Salle</th><th>Tâche solo</th><th>Tâche à plusieurs</th></tr></thead><tbody>${EQ_TACHES.map(([solo, groupe, n], i) => `<tr><td>${esc(salles[i] || `Salle ${i + 1}`)}</td>
      <td><label class="row" style="gap:8px">${cfgInput(`tachesSolo.${i}`, c.tachesSolo?.[i] !== false, 'bool')} ${esc(solo)}</label></td>
      <td><label class="row" style="gap:8px">${cfgInput(`tachesGroupe.${i}`, c.tachesGroupe?.[i] !== false, 'bool')} ${esc(groupe)} <span class="muted">(${n === 3 ? 'trio' : 'duo'})</span></label></td></tr>`).join('')}</tbody></table></div></div>`;
}

// Même logique que le serveur (server/games/enquete.js) pour libeller l'effet de chaque arme.
const eqTypeArme = n => { const x = String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); return /poison/.test(x) ? 'poison' : /corde/.test(x) ? 'piege' : /revolver|fusil|pistolet/.test(x) ? 'tir' : /chandelier|matraque|club|anglaise|marteau/.test(x) ? 'assomme' : 'tranche'; };
const EQ_EFFETS = { tranche: ['Tue en un coup une personne de la salle', null], assomme: ['1er coup : assomme, 2e coup : tue (la salle ne se quitte plus)', 'Durée assommé'], piege: ['Piège pour le prochain qui entre (corde à récupérer sur le cadavre)', 'Nombre de cordes'], poison: ['Tue dans 0 à N salles visitées, sans que la victime le sache', 'N : salles max'], tir: ['Tue n\'importe qui du même étage ; le coup de feu indique l\'étage', null] };
const EQ_EFFETS_J = { menace: ['Menace : la personne doit donner une carte, sans rien en retour', null], assomme: ['Assomme : la personne ne peut plus quitter la salle', 'Durée assommé'], corde: ['Lie les mains : la personne ne peut plus quitter la salle', 'Durée mains liées'], poison: ['Poison (même salle) : le prochain indice de la personne est illisible', null] };
const eqTypeJoueur = n => ({ tranche: 'menace', tir: 'menace', assomme: 'assomme', piege: 'corde', poison: 'poison' })[eqTypeArme(n)];
function eqReglagesArmes(c) {
  const armes = eqLignes(c.armes), ligne = (i, qui, nomArme) => {
    const t = qui === 'tueur' ? eqTypeArme(nomArme) : eqTypeJoueur(nomArme), ef = (qui === 'tueur' ? EQ_EFFETS : EQ_EFFETS_J)[t][1], r = `armesReglages.${i}.${qui}`, v = c.armesReglages[i]?.[qui] || {};
    const duree = qui === 'joueur' ? t === 'assomme' || t === 'corde' : t === 'assomme';
    return `<div class="muted" style="font-size:13px;margin-top:6px"><strong>${qui === 'tueur' ? '🩸 Le tueur (arme du crime)' : '🧑 Un joueur (arme ramassée)'}</strong> : ${esc((qui === 'tueur' ? EQ_EFFETS : EQ_EFFETS_J)[t][0])}</div>
      <div class="grid-auto">${cfgInput(`${r}.usage`, v.usage, 'dur', { label: 'Délai entre deux victimes (même salle)' })}${cfgInput(`${r}.max`, v.max, 'num', { label: 'Victimes max. par salle' })}${cfgInput(`${r}.recharge`, v.recharge, 'dur', { label: 'Rechargement après avoir quitté la salle' })}${ef ? cfgInput(`${r}.effet`, v.effet, duree ? 'dur' : 'num', { label: ef }) : ''}${qui === 'joueur' ? cfgInput(`${r}.nombre`, v.nombre, 'num', { label: t === 'corde' ? 'Cordes (utilisations avant de se casser)' : 'Utilisations avant de se casser' }) : ''}</div>`;
  };
  return armes.map((a, i) => `<div class="box" style="background:var(--ink)"><h3 style="margin:0">${i + 1}. ${esc(a)}</h3>${ligne(i, 'tueur', a)}${ligne(i, 'joueur', a)}</div>`).join('');
}

function reglagesEnquete(c) {
  const salles = eqLignes(c.salles);
  const d = (p, l) => cfgInput(p, c[p], 'dur', { label: l });
  const n = (p, l) => cfgInput(p, c[p], 'num', { label: l });
  return `<div class="box"><h2>Histoire</h2><label class="field"><span class="label">Texte d'introduction affiché à l'écran (une ligne = un paragraphe)</span><textarea class="in" rows="7" id="c-jeu-enquete-intro" data-cfg="intro" data-kind="area" data-scope="jeu" data-game="enquete">${esc(c.intro)}</textarea></label></div>
    <div class="box"><h2>Salles, personnages, armes</h2><div class="grid-auto">
      <label class="field"><span class="label">Salles (une par ligne) · ${salles.length}</span><textarea class="in" rows="12" id="c-jeu-enquete-salles" data-cfg="salles" data-kind="area" data-scope="jeu" data-game="enquete">${esc(c.salles)}</textarea></label>
      <div class="field"><span class="label">Personnages · ${String(c.personnages || '').split(/\r?\n/).filter(l => l.trim()).length}</span>${eqPersos(c)}</div>
      <label class="field"><span class="label">Armes (une par ligne) · ${eqLignes(c.armes).length}</span><textarea class="in" rows="12" id="c-jeu-enquete-armes" data-cfg="armes" data-kind="area" data-scope="jeu" data-game="enquete">${esc(c.armes)}</textarea></label>
    </div><p class="muted" style="margin:0;font-size:14px">Au lancement, chaque joueur reçoit un personnage au hasard (autant de personnages en jeu que de joueurs : écris-en au moins autant que d'invités). Seul le joueur voit son personnage ; l'écran montre seulement les prénoms. Pendant l'introduction, tu peux encore changer le personnage d'un joueur (onglet Partie en cours).</p></div>
    <div class="box"><h2>Solution</h2><div class="grid-auto">
      ${cfgInput('solution.perso', c.solution.perso, 'text', { label: 'Personnage (le tueur)', ph: 'au hasard' })}${cfgInput('solution.arme', c.solution.arme, 'text', { label: 'Arme', ph: 'au hasard' })}${cfgInput('solution.salle', c.solution.salle, 'text', { label: 'Salle', ph: 'au hasard' })}
    </div><p class="muted" style="margin:0;font-size:14px">Vide = tiré au hasard (à garder vide si tu joues : tu ne la connaîtras pas). Sinon le nom exact d'une ligne des listes (utile si tes indices écrits parlent de la solution).</p></div>
    ${eqReglagesTaches(c, salles)}
    <div class="box"><h2>Temps et règles</h2><div class="grid-auto">
      ${cfgInput('ficheNumerique', c.ficheNumerique, 'bool', { label: 'Fiche de détective sur le téléphone (sinon papier)' })}
      ${d('dureeMax', 'Durée max de l\'enquête')}
      ${cfgInput('panne', c.panne, 'bool', { label: 'Début : panne de courant (chacun répare une salle)' })}${cfgInput('rejoindreEnCours', c.rejoindreEnCours, 'bool', { label: 'Joueurs : rejoindre la partie en cours (personnage libre)' })}${cfgInput('liensSalles', c.liensSalles, 'bool', { label: 'Liens permanents des salles (à copier dans Partie en cours)' })}${d('delaiQuitter', 'Chrono « Quitter la salle » (reste dans la salle)')}${d('penaliteOubli', 'Immobilisé si on oublie « Quitter la salle »')}${d('finaleApres', 'Phase finale au bout de (0:00 = à la main)')}${d('delaiQuestion', 'Délai entre deux questions')}${d('delaiReponse', 'Temps pour montrer une carte')}
      ${n('rotationQr', 'QR code changé toutes les … s (0 = fixe)')}${n('indicesParSalle', 'Indices par salle et par joueur')}${n('indicesFinale', 'Indices par salle en phase finale (3 au plus)')}
    </div></div>
    <div class="box"><h2>Indices des salles</h2>
      <p class="muted" style="margin:0;font-size:14px">Écris jusqu'à <strong>3 indices par salle</strong>. Un joueur les reçoit un par un : le <strong>1er</strong> en réussissant la tâche de la salle ; le <strong>2e</strong> en réussissant une nouvelle tâche dans cette salle après être passé dans <strong>1 autre salle</strong> ; le <strong>3e</strong> se demande sans tâche, après <strong>2 autres salles</strong>. À côté de chaque indice : la chance (en %) qu'il soit donné <strong>en premier</strong>, puis la chance qu'il soit donné <strong>en deuxième</strong> (le troisième est celui qui reste). Un joueur ne reçoit jamais deux fois le même indice, ni un indice qui cite une carte qu'il a déjà (cartes en main, montrées ou éliminées). Un emplacement vide est <strong>rempli automatiquement au lancement</strong> avec un vrai fait tiré de la solution : tu les vois dans l'onglet Partie en cours, après « Révéler ».
      Dans un texte : <span class="mono">{carte}</span> = une carte qui n'est pas dans la solution (et que le joueur ne connaît pas encore), <span class="mono">{perso}</span>, <span class="mono">{arme}</span>, <span class="mono">{salle}</span> = idem pour un type ; en phase finale, chacun de ces repères donne deux cartes.
      Indice à recouper : <span class="mono">{3salle}</span>, <span class="mono">{3arme}</span>, <span class="mono">{3perso}</span>, <span class="mono">{3carte}</span> = 3 cartes dont au plus une est dans la solution.</p>
      <div class="grid-auto">${cfgInput('sallesPropres', c.sallesPropres, 'num', { label: 'Salles « trop propres » (indice général)' })}</div>
      <label class="field"><span class="label">Indice général d'une salle « trop propre » (donné en premier dans ces salles, il élimine la salle)</span><textarea class="in" rows="2" id="c-jeu-enquete-textePropre" data-cfg="textePropre" data-kind="area" data-scope="jeu" data-game="enquete">${esc(c.textePropre)}</textarea></label>
      <label class="field"><span class="label">Indices de secours (une ligne = un modèle, tiré au hasard quand un joueur n'a plus d'indice disponible)</span><textarea class="in" rows="3" id="c-jeu-enquete-modeles" data-cfg="modeles" data-kind="area" data-scope="jeu" data-game="enquete">${esc(c.modeles)}</textarea></label>
      ${c.indicesSalles.map((is, i) => `<div class="box" style="background:var(--ink)"><h3 style="margin:0">${i + 1}. ${esc(salles[i] || '(pas de salle)')}</h3>
        <div class="muted" style="display:grid;grid-template-columns:1fr 80px 80px;gap:8px;font-size:12px"><span>Indice</span><span>% 1er</span><span>% 2e</span></div>
        ${[0, 1, 2].map(k => `<div style="display:grid;grid-template-columns:1fr 80px 80px;gap:8px;align-items:start">${cfgInput(`indicesSalles.${i}.textes.${k}`, is.textes[k], 'area', { ph: 'vide = rempli automatiquement' })}${cfgInput(`indicesSalles.${i}.p1.${k}`, is.p1[k], 'num')}${cfgInput(`indicesSalles.${i}.p2.${k}`, is.p2[k], 'num')}</div>`).join('')}</div>`).join('')}
    </div>
    ${eqTestTaches()}
    <div class="box"><h2>Étages des salles</h2><p class="muted" style="margin:0;font-size:14px">Les armes à feu tuent n'importe qui du même étage, et le coup de feu indique cet étage à tout le monde. Écris le nom de l'étage de chaque salle.</p>
      <div class="grid-auto">${salles.map((nomSalle, i) => cfgInput(`etages.${i}`, c.etages[i] ?? c.etages[0], 'text', { label: `${i + 1}. ${nomSalle}` })).join('')}</div></div>
    <div class="box"><h2>Armes</h2><p class="muted" style="margin:0;font-size:14px">Pour chaque arme : le délai entre deux victimes dans la même salle, le nombre maximum de victimes par passage dans une salle, le délai de rechargement une fois la salle quittée, et son effet. Le <strong>tueur</strong> n'a que l'arme du crime (une fois son rôle découvert). Les <strong>joueurs</strong> ramassent des armes qui apparaissent dans les salles ou qu'ils gagnent en réussissant une tâche, et s'en servent les uns contre les autres (un seul à la fois).</p>
      <div class="grid-auto">${cfgInput('armesJoueurs', c.armesJoueurs, 'bool', { label: 'Armes pour les joueurs' })}${cfgInput('chanceArmeTache', c.chanceArmeTache, 'num', { label: 'Chance (%) de trouver une arme en réussissant une tâche' })}${d('apparitionArme', 'Une arme apparaît dans une salle toutes les …')}${d('delaiMenace', 'Temps pour donner une carte (menace)')}</div>${eqReglagesArmes(c)}</div>
    <div class="box"><h2>Tablettes</h2>${eqTablettes(salles.length)}</div>`;
}

// ---------- jeu 4 : Les Mini-Jeux ----------
const MJ_SLOTS = ['mj1', 'mj2', 'mj3', 'mj4', 'mj5', 'mj6', 'mj7'];
const MJ_TYPE_NOMS = { manuel: 'Manuel', definition: 'La Définition', temple: 'Le Temple aztèque', mime: 'Le Mime', dragon: 'La Chasse au dragon', anecdote: 'L\'Anecdote', disparu: 'Qu\'est-ce qui a changé ?', quiz: 'Le Quiz' };
const hhmm = ts => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
// Même logique que le serveur (server/games/minijeux.js) pour prévisualiser avant d'ouvrir la journée.
function mjRoster(c) {
  const seen = new Set(), out = [];
  for (const line of String(c.joueurs || '').split(/\r?\n/)) {
    const n = line.trim().replace(/\s+/g, ' ').slice(0, 24);
    const k = n.toLocaleLowerCase('fr');
    if (!n || seen.has(k)) continue;
    seen.add(k); out.push(n);
  }
  return out;
}
// Salves : « 3, 3 » -> [3, 3] (comme côté serveur).
const mjSalves = c => String(c.salves || '').split(/[,;\s]+/).map(x => Math.round(Number(x))).filter(x => x > 0).slice(0, 20);
const MJ_A_QUATRE = ['definition', 'anecdote', 'temple', 'mime', 'dragon']; // toujours 4 joueurs
function mjProgram(c) {
  const sv = mjSalves(c);
  const n = Math.max(1, Math.min(60, sv.length ? sv.reduce((a, b) => a + b, 0) : Math.round(Number(c.rounds) || 1)));
  const chosen = String(c.programme || '').split(',').map(s => s.trim()).filter(s => MJ_SLOTS.includes(s));
  const act = MJ_SLOTS.filter(s => c.jeux[s]?.actif);
  const fill = act.length ? act : MJ_SLOTS;
  return Array.from({ length: n }, (_, i) => chosen[i] ?? fill[i % fill.length]);
}
// Format d'équipes (même règle que le serveur) : « 2v2 » -> [2, 2] ; vide = chacun pour soi.
function mjFormat(f) {
  const t = String(f || '').toLowerCase().replace(/\s+/g, '').replace(/vs|contre|x/g, 'v');
  if (!/^\d{1,2}(v\d{1,2})+$/.test(t)) return null;
  const sizes = t.split('v').map(Number);
  return sizes.some(n => n < 1 || n > 10) || sizes.length > 8 ? null : sizes;
}
const mjFormatLabel = sizes => (!sizes ? 'Chacun pour soi' : sizes.every(n => n === 1) ? `Chacun pour soi (${sizes.length})` : sizes.join(' contre '));
const MJ_TEAMS = ['Rouges', 'Bleus', 'Verts', 'Jaunes', 'Violets', 'Orange', 'Roses', 'Gris'];
// Format réel d'un mini-jeu (comme côté serveur) : Le Mime = des duos, les autres jeux automatiques = chacun pour soi.
const mjFmt = (c, s) => { const j = c.jeux[s] || {}; return j.type === 'dragon' ? (j.equipesDragon === '2v2' ? [2, 2] : [1, 1, 1, 1]) : j.type === 'mime' ? [2, 2] : MJ_AUTO.includes(j.type) ? null : mjFormat(j.format); };
const mjSize = (c, s, total) => {
  if (MJ_A_QUATRE.includes(c.jeux[s]?.type)) return Math.min(4, total);
  const f = mjFmt(c, s);
  if (f) return Math.min(f.reduce((a, b) => a + b, 0), total);
  return Number(c.jeux[s]?.joueurs) > 0 ? Math.min(Number(c.jeux[s].joueurs), total) : total;
};

function reglagesMiniJeux(c) {
  const names = mjRoster(c), prog = mjProgram(c);
  const slots = prog.reduce((t, s) => t + mjSize(c, s, names.length), 0);
  const per = names.length ? slots / names.length : 0;
  const sv = mjSalves(c);
  const salveDe = i => { let k = 0, n = 0; for (const x of sv) { n += x; k++; if (i < n) return k; } return k; };
  const at = i => (sv.length ? (i === 0 ? `+${Math.round(Number(c.premier))} min` : `Salve ${salveDe(i)}`) : `+${Math.round(Number(c.premier) + i * Number(c.intervalle))} min`);
  const rows = prog.map((s, i) => `<tr><td class="mono">${i + 1}</td><td class="mono">${at(i)}</td>
    <td><select class="in" data-mj-prog="${i}" style="width:auto;min-width:200px">${MJ_SLOTS.map(x => `<option value="${x}" ${x === s ? 'selected' : ''}>${esc(c.jeux[x].nom)}${c.jeux[x].actif ? '' : ' (non utilisé)'}</option>`).join('')}</select></td>
    <td>${MJ_A_QUATRE.includes(c.jeux[s].type) ? (c.jeux[s].type === 'mime' ? '2 contre 2' : '4 joueurs') : mjFmt(c, s) ? mjFormatLabel(mjFmt(c, s)) : Number(c.jeux[s].joueurs) > 0 ? `${mjSize(c, s, names.length)} joueur${mjSize(c, s, names.length) > 1 ? 's' : ''}` : 'Tout le monde'}</td></tr>`).join('');
  const jeux = MJ_SLOTS.map((s, i) => `<div class="box" style="background:var(--ink)">
      <div class="spread"><h3 style="margin:0">Mini-jeu ${i + 1}</h3><label class="row" style="gap:8px">${cfgInput(`jeux.${s}.actif`, c.jeux[s].actif, 'bool')}<span>Utilisé pour « remplir automatiquement »</span></label></div>
      <div class="grid-auto">${cfgInput(`jeux.${s}.nom`, c.jeux[s].nom, 'text', { label: 'Nom' })}
        ${MJ_AUTO.includes(c.jeux[s].type) ? '' : `<label class="field"><span class="label">Format</span><input class="in" list="mj-formats" id="c-jeu-jeux-${s}-format" data-cfg="jeux.${s}.format" data-kind="text" data-scope="jeu" value="${esc(c.jeux[s].format)}" placeholder="vide = chacun pour soi"><span class="muted" style="font-size:13px">${c.jeux[s].format && !mjFormat(c.jeux[s].format) ? '<span style="color:var(--danger)">Format non reconnu : écris par exemple 2v2, 3v1 ou 1v1v1v1.</span>' : mjFormatLabel(mjFormat(c.jeux[s].format))}</span></label>`}
        ${mjFmt(c, s) || MJ_A_QUATRE.includes(c.jeux[s].type) ? '' : cfgInput(`jeux.${s}.joueurs`, c.jeux[s].joueurs, 'num', { label: 'Joueurs par round (0 = tout le monde)' })}
        ${cfgInput(`jeux.${s}.duree`, c.jeux[s].duree, 'dur', { label: 'Durée indicative (min:s)' })}${c.jeux[s].type === 'quiz' ? '' : cfgInput(`jeux.${s}.points`, c.jeux[s].points, 'text', { label: 'Points par place (1er, 2e, 3e…)', ph: '10, 6, 3, 1' })}</div>
      <div class="grid-auto"><label class="field"><span class="label">Type de mini-jeu</span><select class="in" id="c-jeu-jeux-${s}-type" data-cfg="jeux.${s}.type" data-kind="text" data-scope="jeu">${[['manuel', 'Manuel (tu saisis les places)'], ['definition', 'La Définition'], ['temple', 'Le Temple aztèque'], ['mime', 'Le Mime (en duos)'], ['dragon', 'La Chasse au dragon'], ['anecdote', 'L\'Anecdote'], ['disparu', 'Qu\'est-ce qui a changé ? (mémoire)'], ['quiz', 'Le Quiz (tout le monde joue)']].map(([v, l]) => `<option value="${v}" ${c.jeux[s].type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      ${c.jeux[s].type === 'definition' ? mjDefinitionReglages(c, s) : c.jeux[s].type === 'temple' ? mjTempleReglages(c, s) : c.jeux[s].type === 'mime' ? mjMimeReglages(c, s) : c.jeux[s].type === 'dragon' ? mjDragonReglages(c, s) : c.jeux[s].type === 'anecdote' ? mjAnecdoteReglages(c, s) : c.jeux[s].type === 'disparu' ? mjDisparuReglages(c, s) : c.jeux[s].type === 'quiz' ? mjQuizReglages(c, s) : ''}
      <label class="field"><span class="label">Page de règles affichée sur l'écran avant le jeu</span>
        <textarea class="in" rows="6" id="c-jeu-jeux-${s}-regles" data-cfg="jeux.${s}.regles" data-kind="area" data-scope="jeu" placeholder="Explique le mini-jeu : ce que font les joueurs, comment on gagne… Les joueurs appuient sur « J'ai compris » pour lancer le jeu.">${esc(c.jeux[s].regles)}</textarea></label>
    </div>`).join('');
  return `<p class="muted" style="margin:0;font-size:14px">Les participants, les noms, les règles et les points s'appliquent tout de suite. Les horaires, le nombre de rounds et le programme sont fixés à l'ouverture de la journée.</p>
    <div class="box"><h2>Participants (${names.length})</h2>
      <p class="muted" style="margin:0;font-size:14px">Un nom par ligne. Chaque participant scanne le QR code de l'écran et touche son nom. Les textes sont enregistrés pendant que tu écris.</p>
      <textarea class="in" rows="10" id="c-jeu-joueurs" data-cfg="joueurs" data-kind="area" data-scope="jeu" placeholder="Léa&#10;Hugo&#10;Inès…">${esc(c.joueurs)}</textarea>
    </div>
    <div class="box"><h2>Journée</h2>
      <div class="grid-auto">${cfgInput('premier', c.premier, 'num', { label: 'Premier round, X min après l\'ouverture' })}${sv.length ? '' : cfgInput('intervalle', c.intervalle, 'num', { label: 'Puis un round toutes les (min)' }) + cfgInput('rounds', c.rounds, 'num', { label: 'Nombre de rounds' })}${cfgInput('roundsParJoueur', c.roundsParJoueur, 'num', { label: 'Rounds au plus par joueur (sans le quiz)' })}
        ${cfgInput('salves', c.salves ?? '', 'text', { label: 'Salves (rounds par salve, ex. 3, 3 ; vide = sans salves)', ph: '3, 3' })}${sv.length ? cfgInput('battement', c.battement, 'num', { label: 'Battement entre deux rounds (min)' }) + cfgInput('pause', c.pause, 'num', { label: 'Pause entre deux salves (min)' }) : ''}
        ${cfgInput('inscriptions', c.inscriptions, 'dur', { label: 'Inscription des spectateurs après le tirage' })}
        ${sv.length ? '' : cfgInput('annonce', c.annonce, 'dur', { label: 'Annonce des joueurs avant le round' })}${cfgInput('resultats', c.resultats, 'dur', { label: 'Résultats affichés pendant' })}</div>
      <p style="margin:0">→ Premier round <strong>${esc(c.premier)} min</strong> après l'ouverture, ${sv.length ? `puis ${sv.length} salve${sv.length > 1 ? 's' : ''} (${sv.join(' + ')} rounds) : <strong>${esc(c.battement)} min</strong> entre la fin d'un round et le tirage du suivant, <strong>${esc(c.pause)} min</strong> de pause entre deux salves.` : `puis un toutes les <strong>${esc(c.intervalle)} min</strong>.`}${names.length ? ` Chaque participant jouera environ <strong>${Math.floor(per)}${Math.ceil(per) !== Math.floor(per) ? ` à ${Math.ceil(per)}` : ''} round${Math.ceil(per) > 1 ? 's' : ''}</strong>.` : ' Ajoute des participants pour voir combien de rounds chacun jouera.'}</p>
    </div>
    <div class="box"><div class="spread"><h2>Programme des rounds</h2><button class="btn sm" data-mj="auto" data-confirm="Remplacer le programme par les mini-jeux utilisés, en boucle ?">Remplir automatiquement</button></div>
      <div class="scroll"><table><thead><tr><th>Round</th><th>Heure prévue</th><th>Mini-jeu</th><th>Joueurs</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>
    <h2 style="margin-top:8px">Les ${MJ_SLOTS.length} mini-jeux</h2>
    <p class="muted" style="margin:0;font-size:14px">Format : laisse vide pour « chacun pour soi » (avec le nombre de joueurs), ou écris des équipes : <strong>1v1v1v1</strong> (4 joueurs, chacun pour soi), <strong>2v2</strong>, <strong>3v1</strong>, 2v2v2… Les points se donnent par place d'équipe : chaque membre reçoit les points de son équipe.</p>
    <datalist id="mj-formats"><option value="1v1"><option value="1v1v1"><option value="1v1v1v1"><option value="2v2"><option value="3v1"><option value="2v1"><option value="3v3"><option value="2v2v2"><option value="4v4"></datalist>
    ${jeux}`;
}

const MJ_AUTO = ['definition', 'temple', 'mime', 'dragon', 'anecdote', 'disparu', 'quiz']; // mini-jeux joués sur les téléphones : chacun pour soi

// Réglages propres à « La Chasse au dragon ».
function mjDragonReglages(c, s) {
  const j = c.jeux[s];
  return `<div class="box" style="gap:10px">
    <p class="muted" style="margin:0;font-size:14px">Jeu de tir, sans violence, qui se suit en direct sur l'écran. Chacun est à l'abri derrière son muret ; son téléphone sert de manette, à l'horizontale : Viser (il se lève et prend une cible, qu'il choisit parmi les adversaires et le dragon), Tirer (après 1 s sur la même cible), Recharger, Se cacher (la même case que Viser). Debout, il peut être touché. Le dragon attaque régulièrement (annoncé 2 s avant) et touche ceux qui sont debout. Fin : dragon vaincu, un seul joueur ou une équipe encore en jeu, ou temps écoulé. Les survivants passent devant, selon leurs dégâts sur le dragon ; puis les éliminés, le dernier éliminé devant.</p>
    <div class="grid-auto"><label class="field"><span class="label">Équipes</span><select class="in" id="c-jeu-jeux-${s}-equipesDragon" data-cfg="jeux.${s}.equipesDragon" data-kind="text" data-scope="jeu">${[['chacun', 'Chacun pour soi (4 joueurs)'], ['2v2', '2 contre 2']].map(([v, l]) => `<option value="${v}" ${j.equipesDragon === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${cfgInput(`jeux.${s}.viesTir`, j.viesTir, 'num', { label: 'Vies par joueur' })}${cfgInput(`jeux.${s}.pvDragon`, j.pvDragon, 'num', { label: 'Vie du dragon (touches)' })}${cfgInput(`jeux.${s}.dureeTir`, j.dureeTir, 'dur', { label: 'Durée maximale' })}</div>
    <div class="grid-auto">${cfgInput(`jeux.${s}.chargeur`, j.chargeur, 'num', { label: 'Balles par chargeur' })}${cfgInput(`jeux.${s}.tempsRecharge`, j.tempsRecharge, 'dur', { label: 'Temps pour recharger' })}
      ${cfgInput(`jeux.${s}.attaqueMin`, j.attaqueMin, 'dur', { label: 'Attaque du dragon : au plus tôt' })}${cfgInput(`jeux.${s}.attaqueMax`, j.attaqueMax, 'dur', { label: 'au plus tard' })}</div>
  </div>`;
}
function mjDragonPartie(e) {
  const ACT = { cache: '🪵 à l\'abri', vise: '🎯 vise', recharge: '🔄 recharge', horsjeu: '😵 hors jeu' };
  const rows = e.etats.map(x => { const p = e.joueurs.find(j => j.nom === x.nom); return `<tr><td><strong>${esc(x.nom)}</strong></td><td>${'❤️'.repeat(p.vies)}${p.horsJeu ? '😵' : ''}</td><td>${ACT[x.action]}${x.cible ? ` ${esc(x.cible)}` : ''}</td><td class="mono">${x.balles}</td><td class="mono">${p.degats}</td></tr>`; }).join('');
  return `<div class="box" style="background:var(--ink)"><div class="spread"><strong>🐉 Dragon : ${e.dragon.pv} / ${e.dragon.max}</strong>${e.phase === 'jeu' ? `<span class="pill accent">fin dans <span class="mono" data-until="${e.fin}"></span> · attaque dans <span class="mono" data-until="${e.attaque}"></span></span>` : ''}</div>
    <div class="scroll"><table><thead><tr><th>Joueur</th><th>Vies</th><th>En ce moment</th><th>Balles</th><th>Dégâts au dragon</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${e.phase === 'jeu' ? '<div><button class="btn sm" data-mj="suivant" data-confirm="Arrêter la partie maintenant ?">Arrêter la partie</button></div>' : ''}</div>`;
}

// Réglages propres au « Mime » : les mots à mimer et les temps (toujours 2 duos).
function mjMimeReglages(c, s) {
  const j = c.jeux[s];
  const mots = String(j.motsMime || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  return `<div class="box" style="gap:10px">
    <p class="muted" style="margin:0;font-size:14px">Toujours 4 joueurs, en 2 duos. Dans chaque duo, l'un mime le mot affiché sur son téléphone, sans un bruit ; l'autre écrit ce qu'il devine (accents et petites fautes acceptés). Celui qui mime peut passer au mot suivant. Chacun mime à son tour ; le duo qui a fait trouver le plus de mots gagne.</p>
    <label class="field"><span class="label">Mots à mimer (un par ligne) · ${mots.length}</span>
      <textarea class="in" rows="10" id="c-jeu-jeux-${s}-motsMime" data-cfg="jeux.${s}.motsMime" data-kind="area" data-scope="jeu" placeholder="Girafe&#10;Pompier&#10;Brosse à dents…">${esc(j.motsMime)}</textarea>
      <span class="muted" style="font-size:13px">Un mot ne revient jamais dans le même round ; dans la journée, les mots déjà sortis reviennent en dernier.</span></label>
    <div class="grid-auto">${cfgInput(`jeux.${s}.tempsMime`, j.tempsMime, 'dur', { label: 'Temps pour mimer (chacun)' })}${cfgInput(`jeux.${s}.tempsPret`, j.tempsPret, 'dur', { label: 'Temps pour se préparer' })}</div>
  </div>`;
}
function mjMimePartie(e, a) {
  const phase = { pret: 'Préparation', mime: 'Mime en cours', fini: 'Terminé' }[e.phase];
  const team = i => esc(MJ_TEAMS[i] ?? `Duo ${i + 1}`);
  return `<div class="box" style="background:var(--ink)"><div class="spread"><strong>Tour ${e.tour} / ${e.tours} · ${phase}</strong>${e.phase !== 'fini' ? `<span class="pill accent"><span class="mono" data-until="${e.fin}"></span></span>` : ''}</div>
    ${e.cur ? `<p style="margin:0">${team(e.cur.equipe)} : <strong>${esc(e.cur.mime)}</strong> mime, <strong>${esc(e.cur.devine)}</strong> devine${e.mot ? ` · mot : <strong class="mono">${esc(e.mot)}</strong>` : ''}${e.essais.length ? ` · essais : ${e.essais.map(esc).join(', ')}` : ''}</p>` : ''}
    <p style="margin:0">${a.equipes.map((_, i) => `${team(i)} : <strong>${e.score[i] ?? 0}</strong>`).join(' · ')}</p>
    ${e.phase !== 'fini' ? '<div><button class="btn sm" data-mj="suivant">Passer à l\'étape suivante</button></div>' : ''}</div>`;
}

// Décors de la carte du Temple (même règle que le serveur) : choisi en fin de ligne, sinon deviné d'après le nom.
const TP_DECORS = { eau: '🌊 eau (pont de bois)', tunnel: '🪨 tunnel', jungle: '🌴 jungle', marais: '🟤 marais', pierre: '🗿 pierre', volcan: '🌋 volcan', ravin: '⛰️ ravin', serpents: '🐍 serpents', liane: '🌿 liane (saut au-dessus d\'un ravin)', escalade: '🧗 escalade' };
const TP_INDICES = [['volcan', /volcan|lave|feu|braise|cratere/], ['escalade', /escalad|paroi|grimp|falaise|muraille|rocher/], ['eau', /pont|riviere|fleuve|lac|crocod|cascade|\beau\b/],
  ['liane', /liane|balanc|tarzan/], ['ravin', /ravin|gouffre|precipice|abime|crevasse/], ['serpents', /serpent|vipere|cobra|python|reptile/],
  ['tunnel', /tunnel|grotte|couloir|caverne|souterrain/], ['marais', /marais|sable|boue|vase/], ['pierre', /escalier|statue|pierre|temple|salle/]];
const sansAccents = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function tpDecor(ligne) {
  const [nom, , choisi = ''] = ligne.split('|');
  const c = sansAccents(choisi).trim();
  if (TP_DECORS[c]) return { nom: nom.trim(), decor: c, choisi: true };
  return { nom: nom.trim(), decor: TP_INDICES.find(([, re]) => re.test(sansAccents(nom)))?.[0] || 'jungle', choisi: false, inconnu: c || '' };
}

// Chemins de chaque étape (même règle que le serveur) : « chemins:pièges » séparés par des virgules, la dernière valeur vaut pour la suite.
function tpPlan(j) {
  const plan = String(j.cheminsEtapes || '').split(/[,;\s]+/).filter(Boolean);
  return Array.from({ length: Math.max(1, Math.min(20, Number(j.etapes) || 5)) }, (_, k) => {
    const [n, p] = String(plan[Math.min(k + 1, plan.length) - 1] || '2:1').split(':').map(Number);
    const c = Math.max(2, Math.min(4, n || 2));
    return [c, Math.max(1, Math.min(c - 1, p || 1))];
  });
}
function tpPlanReglages(j, s) {
  const opt = (v, lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map(x => `<option value="${x}" ${x === v ? 'selected' : ''}>${x}</option>`).join('');
  return `<div class="field"><span class="label">Chemins à chaque étape</span>
    <div class="scroll"><table><thead><tr><th>Étape</th><th>Chemins</th><th>Dont piégés</th></tr></thead><tbody>${tpPlan(j).map(([c, p], k) => `<tr><td class="mono">${k + 1}</td>
      <td><select class="in" style="width:auto" data-tp-plan="${s}" data-k="${k}" data-quoi="chemins" aria-label="Chemins à l'étape ${k + 1}">${opt(c, 2, 4)}</select></td>
      <td><select class="in" style="width:auto" data-tp-plan="${s}" data-k="${k}" data-quoi="pieges" aria-label="Chemins piégés à l'étape ${k + 1}">${opt(p, 1, c - 1)}</select></td></tr>`).join('')}</tbody></table></div>
    <span class="muted" style="font-size:13px">Par exemple 2 chemins aux premières étapes, puis 3 ou 4 à partir de l'étape 3. Il reste toujours au moins un chemin sûr.</span></div>`;
}
app.addEventListener('change', e => {
  const sel = e.target.closest('[data-tp-plan]');
  if (!sel) return;
  const s = sel.dataset.tpPlan, plan = tpPlan(V.gameConfig.jeux[s]);
  const k = Number(sel.dataset.k), v = Number(sel.value);
  if (sel.dataset.quoi === 'chemins') plan[k] = [v, Math.min(plan[k][1], v - 1)]; else plan[k][1] = v;
  admin({ type: 'config', scope: 'jeu', path: `jeux.${s}.cheminsEtapes`, value: plan.map(([c, p]) => `${c}:${p}`).join(',') });
});

// Réglages propres au « Temple aztèque » : les obstacles (avec leur décor), les pièges, les étapes et les vies.
function mjTempleReglages(c, s) {
  const j = c.jeux[s];
  const obs = String(j.obstacles || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).map(tpDecor).filter(o => o.nom);
  return `<div class="box" style="gap:10px">
    <p class="muted" style="margin:0;font-size:14px">Jeu de chance. À chaque étape, 2 à 4 chemins (réglable plus bas) tirés de ta liste : chaque joueur en choisit un sur son téléphone. Un ou plusieurs chemins, au hasard, sont piégés et font perdre une vie. Ceux qui arrivent au temple avec le plus de vies gagnent ; les éliminés sont classés selon l'étape atteinte.</p>
    <label class="field"><span class="label">Obstacles (un par ligne) · ${obs.length}</span>
      <textarea class="in mono" rows="12" id="c-jeu-jeux-${s}-obstacles" data-cfg="jeux.${s}.obstacles" data-kind="area" data-scope="jeu" placeholder="Pont de bois | Le pont s'effondre ! | eau">${esc(j.obstacles)}</textarea>
      <span class="muted" style="font-size:13px">Écris <strong>nom | ce qui arrive si c'est le piège | décor</strong>. La phrase et le décor sont facultatifs : sans phrase, une phrase de la liste « Pièges » est tirée au hasard ; sans décor, il est deviné d'après le nom. Pour mettre un décor sans phrase : <span class="mono">Grotte aux chauves-souris | | tunnel</span>.${obs.length < 2 ? ' <span style="color:var(--danger)">Il faut au moins 2 obstacles.</span>' : ''}</span></label>
    <div class="field"><span class="label">Décors possibles</span><div class="row" style="flex-wrap:wrap;gap:6px">${Object.entries(TP_DECORS).map(([k, l]) => `<span class="pill" title="${k}">${esc(l)}</span>`).join('')}</div></div>
    <div class="field"><span class="label">Décor de chaque obstacle sur la carte</span>
      <div class="scroll"><table><tbody>${obs.map(o => `<tr><td>${esc(o.nom)}</td><td>${esc(TP_DECORS[o.decor])}</td><td class="muted" style="font-size:13px">${o.choisi ? 'choisi' : o.inconnu ? `<span style="color:var(--danger)">« ${esc(o.inconnu)} » n'existe pas : décor deviné</span>` : 'deviné d\'après le nom'}</td></tr>`).join('')}</tbody></table></div></div>
    <label class="field"><span class="label">Pièges (un par ligne)</span>
      <textarea class="in" rows="4" id="c-jeu-jeux-${s}-pieges" data-cfg="jeux.${s}.pieges" data-kind="area" data-scope="jeu" placeholder="Un serpent te mord !">${esc(j.pieges)}</textarea></label>
    <div class="grid-auto"><label class="field"><span class="label">Affichage sur l'écran</span><select class="in" id="c-jeu-jeux-${s}-affichageTemple" data-cfg="jeux.${s}.affichageTemple" data-kind="text" data-scope="jeu">${[['carte', 'Carte vue du dessus'], ['pierres', 'Blocs de pierre (première version)']].map(([v, l]) => `<option value="${v}" ${(j.affichageTemple || 'carte') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="grid-auto">${cfgInput(`jeux.${s}.etapes`, j.etapes, 'num', { label: 'Étapes jusqu\'au temple' })}${cfgInput(`jeux.${s}.vies`, j.vies, 'num', { label: 'Vies' })}
      ${cfgInput(`jeux.${s}.tempsChoix`, j.tempsChoix, 'dur', { label: 'Temps pour choisir' })}${cfgInput(`jeux.${s}.tempsPiege`, j.tempsPiege, 'dur', { label: 'Affichage du piège' })}</div>
    ${tpPlanReglages(j, s)}
  </div>`;
}
function mjTemplePartie(e) {
  const phase = { choix: 'Les joueurs choisissent', resultat: 'Piège révélé', arrivee: 'Arrivée au temple', fini: 'Terminé' }[e.phase];
  const coeurs = p => p.vies > 0 ? '❤️'.repeat(p.vies) + '🖤'.repeat(Math.max(0, e.viesMax - p.vies)) : `☠️ étape ${p.mort}`;
  const rows = e.joueurs.map(p => `<tr><td><strong>${esc(p.nom)}</strong></td><td>${coeurs(p)}</td><td>${e.phase === 'choix' ? (p.vies > 0 ? (p.choisi ? '✓ a choisi' : '<span class="muted">pas encore</span>') : '') : p.choix != null ? `${esc(e.chemins[p.choix]?.nom)}${p.auto ? ' <span class="muted">(au hasard)</span>' : ''}${p.perdu ? ' · <strong style="color:var(--danger)">−1</strong>' : ''}` : ''}</td></tr>`).join('');
  return `<div class="box" style="background:var(--ink)"><div class="spread"><strong>Étape ${e.etape} / ${e.total} · ${phase}</strong>${e.phase !== 'fini' ? `<span class="pill accent"><span class="mono" data-until="${e.fin}"></span></span>` : ''}</div>
    <p style="margin:0">${e.chemins.map(c => esc(c.nom)).join(' <span class="muted">·</span> ')}${e.pieges ? ` · ${e.pieges.length > 1 ? 'pièges' : 'piège'} : ${e.pieges.map(i => `<strong>${esc(e.chemins[i].nom)}</strong> (${esc(e.messages[i])})`).join(', ')}` : ''}</p>
    <div class="scroll"><table><thead><tr><th>Joueur</th><th>Vies</th><th>Choix</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${e.phase !== 'fini' ? '<div><button class="btn sm" data-mj="suivant">Passer à l\'étape suivante</button></div>' : ''}</div>`;
}

// Réglages propres à « La Définition » : les mots inventés et les temps.
function mjDefinitionReglages(c, s) {
  const j = c.jeux[s];
  const mots = String(j.mots || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const besoin = (Number(j.joueurs) || 4) * (Number(j.manches) || 3);
  return `<div class="box" style="gap:10px">
    <p class="muted" style="margin:0;font-size:14px">Chaque joueur reçoit un de ces mots sur son téléphone et le définit à l'oral ; les mots s'affichent sur l'écran. Ensuite, ceux qui ne jouent pas relient chaque mot à son joueur. Celui qu'on a relié le plus souvent à son mot gagne ; les 3 meilleurs devineurs gagnent 3, 2 et 1 points. Format : chacun pour soi, avec le nombre de joueurs choisi.</p>
    <label class="field"><span class="label">Mots inventés (un par ligne) · ${mots.length} mot${mots.length > 1 ? 's' : ''}</span>
      <textarea class="in" rows="8" id="c-jeu-jeux-${s}-mots" data-cfg="jeux.${s}.mots" data-kind="area" data-scope="jeu" placeholder="Florpidoux&#10;Gramouille&#10;Zétrabule…">${esc(j.mots)}</textarea>
      ${mots.length < besoin ? `<span style="color:var(--danger);font-size:13px">Il faut au moins ${besoin} mots pour une partie (joueurs × manches) sans répéter de mot.</span>` : '<span class="muted" style="font-size:13px">Les mots déjà sortis dans la journée ne reviennent qu\'une fois tous les autres utilisés.</span>'}</label>
    <div class="grid-auto">${cfgInput(`jeux.${s}.manches`, j.manches, 'num', { label: 'Manches' })}
      ${cfgInput(`jeux.${s}.tempsParole`, j.tempsParole, 'dur', { label: 'Temps de parole par joueur' })}${cfgInput(`jeux.${s}.tempsVote`, j.tempsVote, 'dur', { label: 'Temps pour deviner' })}${cfgInput(`jeux.${s}.tempsRevelation`, j.tempsRevelation, 'dur', { label: 'Affichage des réponses' })}${cfgInput(`jeux.${s}.bonusDevineurs`, j.bonusDevineurs ?? '3, 2, 1', 'text', { label: 'Points des meilleurs devineurs (1er, 2e, 3e…)', ph: '3, 2, 1' })}</div>
    <p class="muted" style="margin:0;font-size:13px">Les spectateurs sont classés selon leurs bonnes réponses : le premier tiers (ex æquo compris) gagne ce bonus. 0 = pas de bonus.</p>
  </div>`;
}

// Réglages propres à « Qu'est-ce qui a changé ? » : la liste d'objets, les manches et les temps.
function mjDisparuReglages(c, s) {
  const j = c.jeux[s];
  const n = String(j.objets || '').split(/\r?\n/).filter(x => x.trim()).length;
  const max = (Number(j.objetsDepart) || 6) + ((Number(j.manchesMemo) || 5) - 1) * (Number(j.objetsPlus) || 0);
  return `<div class="box" style="gap:10px">
    <p class="muted" style="margin:0;font-size:14px">Jeu de mémoire. L'écran montre une scène d'objets, l'efface, puis la remontre avec un objet en moins. Sur son téléphone, chacun choisit l'objet disparu parmi 4 (les 3 autres n'étaient pas dans la scène). Bonne réponse : 100 points, plus jusqu'à 50 pour la rapidité. Le meilleur total gagne.</p>
    <label class="field"><span class="label">Objets (un par ligne, avec un emoji devant si tu veux) · ${n}</span>
      <textarea class="in" rows="8" id="c-jeu-jeux-${s}-objets" data-cfg="jeux.${s}.objets" data-kind="area" data-scope="jeu" placeholder="🍎 Pomme&#10;🎸 Guitare">${esc(j.objets)}</textarea>
      ${n < max + 3 ? `<span style="color:var(--danger);font-size:13px">Il faut au moins ${max + 3} objets (${max} dans la scène de la dernière manche, plus 3 propositions fausses).</span>` : '<span class="muted" style="font-size:13px">Les objets sont tirés au hasard à chaque manche.</span>'}</label>
    <div class="grid-auto">${cfgInput(`jeux.${s}.manchesMemo`, j.manchesMemo, 'num', { label: 'Manches' })}${cfgInput(`jeux.${s}.objetsDepart`, j.objetsDepart, 'num', { label: 'Objets à la 1re manche' })}${cfgInput(`jeux.${s}.objetsPlus`, j.objetsPlus, 'num', { label: 'Objets en plus par manche' })}
      ${cfgInput(`jeux.${s}.tempsMemo`, j.tempsMemo, 'dur', { label: 'Temps pour mémoriser' })}${cfgInput(`jeux.${s}.tempsReponse`, j.tempsReponse, 'dur', { label: 'Temps pour répondre' })}${cfgInput(`jeux.${s}.melangeDes`, j.melangeDes, 'num', { label: 'Objets mélangés à partir de la manche (0 = jamais)' })}</div>
  </div>`;
}
function mjDisparuPartie(e) {
  const phase = { memorise: 'Les joueurs mémorisent', noir: 'Écran noir', question: 'Les joueurs répondent', revelation: 'Réponse affichée', fini: 'Terminé' }[e.phase];
  return `<div class="box" style="background:var(--ink)"><div class="spread"><strong>Manche ${e.manche} / ${e.total} · ${phase}</strong>${e.phase !== 'fini' ? `<span class="pill accent"><span class="mono" data-until="${e.fin}"></span></span>` : ''}</div>
    <p style="margin:0">Objet disparu : <strong>${esc(e.manquantAdmin.emoji)} ${esc(e.manquantAdmin.nom)}</strong> · ${e.repondu} / ${e.joueurs.length} ont répondu</p>
    <p style="margin:0">${e.joueurs.map(p => `${esc(p)} : <strong>${e.scores[p] || 0}</strong>`).join(' · ')}</p>
    ${e.phase !== 'fini' ? '<div><button class="btn sm" data-mj="suivant">Passer à l\'étape suivante</button></div>' : ''}</div>`;
}

// Réglages propres à « L'Anecdote » : rien à écrire à l'avance, seulement les manches et les temps.
function mjAnecdoteReglages(c, s) {
  const j = c.jeux[s];
  return `<div class="box" style="gap:10px">
    <p class="muted" style="margin:0;font-size:14px">Chaque joueur écrit sur son téléphone une anecdote vraie sur lui. Les anecdotes s'affichent sur l'écran (A, B, C…) ; ceux qui ne jouent pas relient chaque anecdote à un joueur. Le joueur qu'on a le moins souvent reconnu gagne ; les 3 meilleurs devineurs gagnent 3, 2 et 1 points. Format : chacun pour soi, avec le nombre de joueurs choisi.</p>
    <div class="grid-auto">${cfgInput(`jeux.${s}.manches`, j.manches, 'num', { label: 'Manches' })}
      ${cfgInput(`jeux.${s}.tempsEcriture`, j.tempsEcriture, 'dur', { label: 'Temps pour écrire' })}${cfgInput(`jeux.${s}.tempsVote`, j.tempsVote, 'dur', { label: 'Temps pour deviner' })}${cfgInput(`jeux.${s}.tempsRevelation`, j.tempsRevelation, 'dur', { label: 'Affichage des réponses' })}${cfgInput(`jeux.${s}.bonusDevineurs`, j.bonusDevineurs ?? '3, 2, 1', 'text', { label: 'Points des meilleurs devineurs (1er, 2e, 3e…)', ph: '3, 2, 1' })}</div>
    <p class="muted" style="margin:0;font-size:13px">Les spectateurs sont classés selon leurs bonnes réponses : le premier tiers (ex æquo compris) gagne ce bonus. 0 = pas de bonus.</p>
  </div>`;
}

// Panneau d'un round « La Définition » en cours : tout est visible pour l'organisateur.
function mjDefinitionPartie(e) {
  const A = e.type === 'anecdote';
  const phase = { ecriture: 'Les joueurs écrivent leur anecdote', oral: 'Les joueurs définissent leur mot à l\'oral', vote: A ? 'Les spectateurs relient les anecdotes' : 'Les spectateurs relient les mots', revelation: 'Réponses affichées', fini: 'Terminé' }[e.phase];
  const rows = e.joueurs.map(p => `<tr><td><strong>${esc(p)}</strong></td><td class="mono">${esc(e.admin.mots[p] || '')}</td><td>${A ? (e.admin.defs[p] ? esc(e.admin.defs[p]) : '<span class="muted">pas encore</span>') : '<span class="muted">à l\'oral</span>'}</td>
    <td class="mono">${e.cartes?.find(c => c.auteur === p)?.trouves ?? ''}</td><td class="mono">${e.totaux?.[p] ?? ''}</td></tr>`).join('');
  return `<div class="box" style="background:var(--ink)"><div class="spread"><strong>Manche ${e.manche} / ${e.total} · ${phase}</strong>${e.phase !== 'fini' ? `<span class="pill accent"><span class="mono" data-until="${e.fin}"></span></span>` : ''}</div>
    <p class="muted" style="margin:0;font-size:14px">${A ? `${e.ecrit.length} / ${e.joueurs.length} anecdotes · ` : ''}${e.votants} / ${e.spectateurs} spectateurs ont voté</p>
    <div class="scroll"><table><thead><tr><th>Joueur</th><th>${A ? 'Carte' : 'Mot'}</th><th>${A ? 'Anecdote' : 'Définition'}</th><th>Trouvé (manche)</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${e.devineurs?.length ? `<p class="muted" style="margin:0;font-size:14px">Meilleurs devineurs : ${e.devineurs.map(x => `${esc(x.nom)} (${x.bons})`).join(' · ')}</p>` : ''}
    ${e.phase !== 'fini' ? '<div><button class="btn sm" data-mj="suivant">Passer à l\'étape suivante</button></div>' : ''}</div>`;
}

function partieMiniJeux(g) {
  if (!g) {
    const c = V.gameConfig, names = mjRoster(c);
    return `<div class="box"><h2>La journée n'est pas encore ouverte</h2>
      <p style="margin:0">${names.length} participant${names.length > 1 ? 's' : ''} · ${mjProgram(c).length} rounds, le premier ${esc(c.premier)} min après l'ouverture.</p>
      <p class="muted" style="margin:0;font-size:14px">Ouvre la journée dès que les participants arrivent : ils pourront choisir leur nom sur leur téléphone. Le premier round est annoncé ${Math.round(c.annonce / 60)} min avant ${esc(c.debut)}.</p>
      <button class="btn primary" data-mj="ouvrir" ${names.length ? '' : 'disabled'}>Ouvrir la journée</button>
      ${names.length ? '' : '<p class="muted" style="margin:0">Ajoute d\'abord les participants dans l\'onglet « Réglages du jeu ».</p>'}</div>`;
  }
  const opts = (list, exclude) => list.filter(p => !exclude.includes(p.nom)).map(p => `<option value="${esc(p.nom)}">${esc(p.nom)} · ${p.joues} round${p.joues > 1 ? 's' : ''}${p.connecte ? '' : ' · sans téléphone'}</option>`).join('');
  const byPlays = [...g.joueurs].sort((a, b) => a.joues - b.joues || a.nom.localeCompare(b.nom, 'fr'));
  // Places par équipe (une équipe = un joueur en « chacun pour soi »).
  const placesFor = r => { ui.places ??= {}; ui.places[r.n] ??= Object.fromEntries(r.equipes.map((t, i) => [i, r.points?.[t[0]]?.place ?? i + 1])); return ui.places[r.n]; };
  const teamLabel = (r, i) => (r.equipesNommees ? MJ_TEAMS[i] ?? `Équipe ${i + 1}` : '');
  const placeSelect = (r, i) => `<label class="row" style="gap:6px">Place <select class="in" style="width:auto" data-mj-place="${r.n}" data-equipe="${i}">${r.equipes.map((_, k) => `<option value="${k + 1}" ${placesFor(r)[i] === k + 1 ? 'selected' : ''}>${k + 1}</option>`).join('')}</select></label>`;
  // Pendant un mini-jeu automatique en cours, on peut seulement remplacer un joueur (il reprend son mot).
  const lock = r => r.status === 'jeu' && r.type !== 'manuel';
  const playerRow = (r, p) => { const i = r.joueurs.indexOf(p); return `<div class="row" style="flex-wrap:wrap">
      <strong style="min-width:120px">${esc(p)}</strong>
      <select class="in" style="width:auto;max-width:260px" id="mj-rempl-${r.n}-${i}"><option value="">Remplacer par…</option>${opts(byPlays, r.joueurs)}</select>
      <button class="btn sm" data-mj="remplacer" data-n="${r.n}" data-i="${i}">Remplacer</button>
      ${lock(r) ? '' : `<button class="btn sm danger" data-mj="retirer" data-n="${r.n}" data-joueur="${esc(p)}" data-confirm="Retirer ${esc(p)} de ce round sans le remplacer ?">Retirer</button>`}
      ${r.status === 'annonce' ? (r.compris.includes(p) ? '<span class="pill ok">✓ compris</span>' : '<span class="pill">pas encore compris</span>') : ''}</div>`; };
  const places = r => r.status === 'jeu' && r.type === 'manuel';
  const playersEditor = r => r.equipesNommees
    ? r.equipes.map((t, i) => `<div class="box" style="background:var(--ink);gap:8px"><div class="spread"><strong>${esc(teamLabel(r, i))}</strong>${places(r) ? placeSelect(r, i) : ''}</div>${t.map(p => playerRow(r, p)).join('')}</div>`).join('')
    : r.equipes.map((t, i) => `<div class="row" style="flex-wrap:wrap;gap:12px">${places(r) ? placeSelect(r, i) : ''}${playerRow(r, t[0])}</div>`).join('');
  let now = '';
  const a = g.actif;
  if (a) {
    now = `<div class="box" style="border-color:var(--accent)">
      <div class="spread"><h2>Round ${a.n} · ${esc(a.nom)} <span class="muted" style="font-weight:400">· ${esc(a.format)}</span></h2><span class="pill accent">${a.status === 'annonce' ? `Commence dans <span class="mono" data-until="${a.startAt}"></span>` : `En cours depuis <span class="mono" data-since="${a.debutAt}"></span>`}</span></div>
      ${a.status === 'annonce' ? `<p style="margin:0">Le jeu commence quand tous les joueurs ont appuyé sur « J'ai compris » : <strong>${a.compris.length} / ${a.joueurs.length}</strong>${a.joueurs.filter(p => !a.compris.includes(p)).length ? ` · en attente : ${a.joueurs.filter(p => !a.compris.includes(p)).map(esc).join(', ')}` : ''}</p>` : ''}
      ${a.status === 'jeu' && (g.etat?.type === 'definition' || g.etat?.type === 'anecdote') ? mjDefinitionPartie(g.etat) : a.status === 'jeu' && g.etat?.type === 'temple' ? mjTemplePartie(g.etat) : a.status === 'jeu' && g.etat?.type === 'mime' ? mjMimePartie(g.etat, a) : a.status === 'jeu' && g.etat?.type === 'dragon' ? mjDragonPartie(g.etat) : a.status === 'jeu' && g.etat?.type === 'disparu' ? mjDisparuPartie(g.etat) : a.status === 'jeu' && g.etat?.type === 'quiz' ? mjQuizPartie(g.etat) : ''}
      ${playersEditor(a)}
      ${lock(a) ? '' : `<div class="row" style="flex-wrap:wrap"><select class="in" style="width:auto" id="mj-ajout-${a.n}"><option value="">Ajouter un joueur…</option>${opts(byPlays, a.joueurs)}</select><button class="btn sm" data-mj="ajouter" data-n="${a.n}">Ajouter</button></div>`}
      <div class="row" style="flex-wrap:wrap">${a.status === 'annonce' ? '<button class="btn primary" data-mj="commencer" data-confirm="Commencer sans attendre que tout le monde ait compris ?">Commencer maintenant</button>' : a.type === 'manuel' ? `<button class="btn primary" data-mj="resultats" data-n="${a.n}">Valider les résultats</button>` : ''}
        <button class="btn sm danger" data-mj="passer" data-n="${a.n}" data-confirm="Sauter ce round ? Personne ne marque de points.">Sauter ce round</button></div>
      ${a.status === 'jeu' && a.type === 'manuel' ? `<p class="muted" style="margin:0;font-size:14px">Donne une place à chaque ${a.equipesNommees ? 'équipe' : 'joueur'} (ex æquo possibles), puis valide : les points sont ajoutés et le round suivant sera annoncé à son heure.</p>` : ''}
    </div>`;
  } else if (g.attente?.raison === 'limite') {
    // tous les connectés ont atteint la limite : l'admin décide
    now = `<div class="box accent"><h2>⏳ Round ${g.attente.n} · ${esc(g.attente.nom)} en attente</h2>
      <p style="margin:0">Tous les joueurs connectés ont déjà joué <strong>${g.attente.max} rounds</strong> (la limite). Le round partira tout seul si de nouveaux joueurs se connectent. Sinon, à toi de décider :</p>
      <div class="row" style="flex-wrap:wrap"><button class="btn primary" data-mj="forcer">Jouer quand même (au-delà de la limite)</button>
        <button class="btn danger" data-mj="passer" data-n="${g.attente.n}" data-confirm="Sauter ce round ?">Sauter ce round</button></div>
      <p class="muted" style="margin:0;font-size:14px">Tu peux aussi monter « Rounds au plus par joueur » dans les réglages : le round partira alors tout seul.</p></div>`;
  } else if (g.prochain) {
    const p = g.prochain;
    now = `<div class="box"><div class="spread"><h2>Prochain : round ${p.n} · ${esc(p.nom)}</h2><span class="pill">${hhmm(p.at)} · annonce à ${hhmm(p.at - V.gameConfig.annonce * 1000)}</span></div>
      <p class="muted" style="margin:0">${p.taille} joueur${p.taille > 1 ? 's' : ''} seront tirés au sort parmi ceux qui ont le moins joué.</p>
      <div><button class="btn" data-mj="annoncer">Tirer au sort et annoncer maintenant</button></div></div>`;
  }
  const etat = { prevu: '', annonce: '<span class="pill accent">annoncé</span>', jeu: '<span class="pill accent">en cours</span>', fini: '<span class="pill ok">✓</span>', saute: '<span class="pill">sauté</span>' };
  const rounds = g.rounds.map(r => {
    const edit = ui.mjEdit === r.n && r.status === 'fini';
    const team = (t, i) => `${r.equipesNommees ? `<strong>${esc(teamLabel(r, i))}</strong> ` : ''}${t.map(esc).join(' + ')}`;
    const res = r.equipes.map((t, i) => `${team(t, i)}${r.points?.[t[0]] ? ` (${r.points[t[0]].place}<sup>e</sup>, ${r.points[t[0]].points} pts)` : ''}`).join(r.equipesNommees ? ' <span class="muted">vs</span> ' : ' · ');
    const choix = `<select class="in" style="width:auto;max-width:240px" data-mj-jeu="${r.n}">${MJ_SLOTS.map(s => `<option value="${s}" ${s === r.jeu ? 'selected' : ''}>${esc(V.gameConfig.jeux[s]?.nom || s)} · ${MJ_TYPE_NOMS[V.gameConfig.jeux[s]?.type] || 'Manuel'}</option>`).join('')}</select>`;
    return `<tr><td class="mono">${r.n}</td><td class="mono">${hhmm(r.at)}</td><td>${r.status === 'prevu' ? choix : esc(r.nom)}<br><span class="muted" style="font-size:13px">${esc(r.format)}</span></td><td>${edit ? r.equipes.map((t, i) => `<div class="row" style="gap:8px">${team(t, i)} ${placeSelect(r, i)}</div>`).join('') + `<button class="btn sm primary" data-mj="resultats" data-n="${r.n}">Enregistrer</button>` : r.joueurs.length ? res : '<span class="muted">—</span>'}</td>
      <td>${etat[r.status]}${r.status === 'fini' && !edit ? ` <button class="btn sm" data-mj="corriger" data-n="${r.n}">Corriger</button>` : ''}${r.status === 'prevu' ? ` <button class="btn sm" data-mj="passer" data-n="${r.n}" data-confirm="Sauter le round ${r.n} ?">Sauter</button>` : ''}</td></tr>`;
  }).join('');
  const joueurs = g.joueurs.map(p => `<tr><td class="mono">${p.rang}</td><td>${esc(p.nom)}</td><td>${p.connecte ? `<span class="pill ok">📱 connecté</span> <button class="btn sm" data-mj="liberer" data-nom="${esc(p.nom)}" data-confirm="Libérer le nom de ${esc(p.nom)} ? Il pourra le reprendre sur un autre téléphone.">Libérer</button>` : '<span class="pill">pas encore</span>'}</td><td class="mono">${p.joues}</td><td class="mono">${p.points}</td></tr>`).join('');
  return `<div class="spread"><div class="row"><span class="pill accent">${g.finished ? 'Journée terminée' : `${g.faits} / ${g.total} rounds joués`}</span><span class="muted">un round toutes les ${Math.round(g.spacing / 60000)} min · ${g.inscrits} / ${g.participants.length} téléphones connectés</span></div>
      ${g.finished ? '' : `<div class="row"><button class="btn sm" data-mj="decaler" data-sec="-300">−5 min</button><button class="btn sm" data-mj="decaler" data-sec="300">+5 min</button><button class="btn sm danger" data-mj="terminer" data-confirm="Terminer la journée maintenant ? Les rounds restants sont annulés.">Terminer la journée</button></div>`}</div>
    ${now}
    ${a ? '' : `<div class="box"><div class="spread"><h2>Lancer un mini-jeu maintenant</h2><span class="muted">hors programme</span></div>
      <p class="muted" style="margin:0;font-size:14px">Les joueurs inscrits sur leur téléphone sont tirés au sort. Pas besoin d'attendre l'ordre du programme.</p>
      <div class="row" style="flex-wrap:wrap"><select class="in" style="width:auto" id="mj-lancer">${MJ_SLOTS.map(s => `<option value="${s}">${esc(V.gameConfig.jeux[s]?.nom || s)} · ${MJ_TYPE_NOMS[V.gameConfig.jeux[s]?.type] || 'Manuel'}</option>`).join('')}</select>
        <button class="btn primary" data-mj="lancerMaintenant" ${g.finished ? 'disabled' : ''}>▶ Lancer maintenant</button></div></div>`}
    <div class="box"><h2>Programme</h2><div class="scroll"><table><thead><tr><th>Round</th><th>Heure</th><th>Mini-jeu</th><th>Joueurs</th><th>État</th></tr></thead><tbody>${rounds}</tbody></table></div></div>
    <div class="box"><div class="spread"><h2>Participants</h2><span class="muted">Chacun devrait jouer ${g.attendu.min}${g.attendu.max !== g.attendu.min ? ` à ${g.attendu.max}` : ''} rounds</span></div>
      <div class="scroll"><table><thead><tr><th>Rang</th><th>Nom</th><th>Téléphone</th><th>Rounds</th><th>Points</th></tr></thead><tbody>${joueurs}</tbody></table></div></div>`;
}

// Actions des Mini-Jeux.
app.addEventListener('click', async e => {
  const t = e.target.closest('[data-mj]');
  if (!t || t.disabled) return;
  if (!confirmed(t)) return;
  const a = t.dataset.mj, n = Number(t.dataset.n);
  if (a === 'auto') return admin({ type: 'config', scope: 'jeu', path: 'programme', value: '' });
  if (a === 'ouvrir') return admin({ type: 'lancerJeu' });
  if (a === 'corriger') { ui.mjEdit = n; if (ui.places) delete ui.places[n]; return draw(); }
  if (a === 'remplacer') {
    const nouveau = document.getElementById(`mj-rempl-${n}-${t.dataset.i}`)?.value;
    if (!nouveau) return SJ.toast({ ok: false, msg: 'Choisis un remplaçant.' });
    const r = V.game.rounds.find(x => x.n === n);
    const res = await jeu({ type: 'remplacer', n, ancien: r.joueurs[Number(t.dataset.i)], nouveau });
    if (res.ok && ui.places) delete ui.places[n];
    return;
  }
  if (a === 'ajouter') {
    const nouveau = document.getElementById(`mj-ajout-${n}`)?.value;
    if (!nouveau) return SJ.toast({ ok: false, msg: 'Choisis un joueur.' });
    const res = await jeu({ type: 'ajouter', n, nouveau });
    if (res.ok && ui.places) delete ui.places[n];
    return;
  }
  if (a === 'retirer') { const res = await jeu({ type: 'retirer', n, ancien: t.dataset.joueur }); if (res.ok && ui.places) delete ui.places[n]; return; }
  if (a === 'resultats') {
    const res = await jeu({ type: 'resultats', n, places: ui.places?.[n] || {} });
    if (res.ok) { ui.mjEdit = null; delete ui.places[n]; draw(); }
    return;
  }
  if (a === 'liberer') return jeu({ type: 'liberer', nom: t.dataset.nom });
  if (a === 'decaler') return jeu({ type: 'decaler', sec: Number(t.dataset.sec) });
  if (a === 'suivant') return jeu({ type: 'suivant' });
  if (a === 'lancerMaintenant') return jeu({ type: a, slot: document.getElementById('mj-lancer')?.value });
  return jeu({ type: a, n });
});
app.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.mjPlace) { ui.places ??= {}; (ui.places[t.dataset.mjPlace] ??= {})[t.dataset.equipe] = Number(t.value); return; }
  if (t.dataset.mjJeu) return admin({ type: 'jeu', action: { type: 'changerJeu', n: Number(t.dataset.mjJeu), slot: t.value } });
  if (t.dataset.mjProg != null) {
    const i = Number(t.dataset.mjProg), prog = mjProgram(V.gameConfig);
    prog[i] = t.value;
    admin({ type: 'config', scope: 'jeu', path: 'programme', value: prog.join(',') });
    // Le programme est aussi appliqué au round déjà prévu, si la journée est ouverte.
    if (V.game?.rounds?.[i]?.status === 'prevu') admin({ type: 'jeu', action: { type: 'changerJeu', n: i + 1, slot: t.value } });
  }
});

// ---------- onglet Classement ----------
function classementTab() {
  const c = V.classement, k = V.config.classement;
  const pts = x => (x == null ? '—' : String(x).replace('.', ','));
  const shown = { classement: 'Classement affiché', final: 'Grand final affiché' }[V.show] || 'Rien d\'affiché';
  let h = `<div class="spread"><div class="row"><span class="pill accent">${shown}</span><span class="muted">Jeux comptés : ${c.held.map(x => esc(x.name)).join(', ') || 'aucun pour l\'instant'}</span></div>
    <div class="row"><button class="btn" data-act="afficherClassement" data-mode="classement">📊 Afficher le classement</button>
      <button class="btn primary" data-act="afficherClassement" data-mode="final">🏆 Grand final</button>
      <button class="btn sm" data-act="afficherClassement" data-mode="">Masquer</button>
      <button class="btn" data-act="roulette" ${V.people.length < 2 ? 'disabled' : ''} title="Tire un nom au sort parmi les personnes connectées">🎰 Roulette</button></div></div>`;
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
    ${k.enquete ? `${cfgInput('classement.enquete.max', k.enquete.max, 'num', { scope: 'soiree', label: 'L\'Enquête : 1er' })}${cfgInput('classement.enquete.min', k.enquete.min, 'num', { scope: 'soiree', label: 'L\'Enquête : dernier' })}` : ''}
    ${cfgInput('classement.bonusMax', k.bonusMax, 'num', { scope: 'soiree', label: 'Bonus jeu raté (max)' })}
  </div><p class="muted" style="margin:0;font-size:14px">Bonus jeu raté = points max des jeux joués à la soirée ÷ points max des jeux joués par le joueur, plafonné. Égalités : jeux gagnés, puis résultat au Duel.</p>
  ${V.soirees?.length ? `<div><h2>Soirées précédentes</h2>${V.soirees.map((s, i) => `<p class="muted" style="margin:0;font-size:14px">Soirée ${i + 1} · ${new Date(s.fin).toLocaleDateString('fr-FR')} · ${s.parties} partie${s.parties > 1 ? 's' : ''} · ${s.top.length ? s.top.map((r, k) => `${k + 1}. ${esc(r.name)} (${r.total})`).join(' · ') : 'pas de points'}</p>`).join('')}</div>` : ''}
  <div class="row"><button class="btn primary" data-act="nouvelleSoiree" data-confirm="Commencer une nouvelle soirée ? Le classement actuel est archivé et repart de zéro.">Nouvelle soirée</button>
  <button class="btn sm danger" data-act="reinitialiserSoiree" data-confirm="Remettre à zéro le classement de la soirée sans l'archiver ?">Remettre le classement à zéro</button></div></div>`;
  return h;
}

// ---------- onglet Réglages ----------
function reglagesChemin(c) {
  const T = ui.team;
  const rows = c.teams[T].steps.map((s, i) => `<tr><td class="mono">${i + 1}</td>
    <td>${i === 0 ? '<span class="muted">départ</span>' : cfgInput(`teams.${T}.steps.${i}.numero`, s.numero, 'text', { width: '80px', ph: 'auto' })}</td>
    <td>${cfgInput(`teams.${T}.steps.${i}.indice`, s.indice, 'area')}</td>
    <td>${cfgInput(`teams.${T}.steps.${i}.aide`, s.aide, 'area', { ph: 'vide = pas d\'indice bonus' })}</td>
    <td>${cfgInput(`teams.${T}.steps.${i}.code`, s.code, 'text', { width: '90px' })}</td>
    <td>${cfgInput(`teams.${T}.steps.${i}.longue`, s.longue, 'bool')}</td></tr>`).join('');
  const finalRow = `<tr style="background:var(--accent-soft)"><td class="mono">15<br><span class="pill accent" style="margin-top:4px">commune</span></td>
    <td>${cfgInput(`teams.${T}.finalNumero`, c.teams[T].finalNumero, 'text', { width: '80px', ph: 'auto' })}</td>
    <td>${cfgInput('final.indice', c.final.indice, 'area')}</td><td>${cfgInput('final.aide', c.final.aide, 'area', { ph: 'vide = pas d\'indice bonus' })}</td><td>${cfgInput('final.code', c.final.code, 'text', { width: '90px' })}</td><td>${cfgInput('final.longue', c.final.longue, 'bool')}</td></tr>`;
  const arme = (k, label, d, r) => `<tr><td>${label}</td><td>${cfgInput(`armes.${k}.code`, c.armes[k].code, 'text', { width: '90px' })}</td>
    <td>${d ? cfgInput(`armes.${k}.duree`, c.armes[k].duree, 'dur', { width: '80px' }) : '<span class="muted">—</span>'}</td>
    <td>${r ? cfgInput(`armes.${k}.recharge`, c.armes[k].recharge, 'dur', { width: '80px' }) : '<span class="muted">—</span>'}</td></tr>`;
  const cles = TT => c.cles[TT].map((k, i) => `<tr><td class="mono">${TT}${i + 1}</td><td>${cfgInput(`cles.${TT}.${i}.code`, k.code, 'text', { width: '90px' })}</td><td>${cfgInput(`cles.${TT}.${i}.lieu`, k.lieu, 'text', { ph: 'ex. dans la théière' })}</td></tr>`).join('');
  return `<div class="box">
      <div class="spread"><h2>Étapes</h2><div class="row"><button class="btn sm ${T === 'A' ? 'primary' : ''}" data-team-tab="A">Équipe A</button><button class="btn sm ${T === 'B' ? 'primary' : ''}" data-team-tab="B">Équipe B</button></div></div>
      <p class="muted" style="margin:0;font-size:14px">Numéro vide = tiré au hasard (4 chiffres). Indice bonus : le joueur bloqué peut le voir, mais le joueur suivant attend la pénalité avant de voir son indice. Avec moins de joueurs, les étapes jouées sont 1, 2, 3… puis la 15. Les textes sont enregistrés pendant que tu écris (cadre vert = enregistré).</p>
      <div class="scroll"><table><thead><tr><th>Étape</th><th>Numéro reçu</th><th>Indice affiché</th><th>Indice bonus</th><th>Code physique</th><th>Longue</th></tr></thead><tbody>${rows}${finalRow}</tbody></table></div>
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
      ${cfgInput('penaliteIndice', c.penaliteIndice, 'dur', { label: 'Pénalité indice bonus (joueur suivant)' })}
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

// Quiz (mini-jeu) : même règle que le serveur (server/games/minijeux/quiz.js).
function quizLire(texte) {
  const blocs = String(texte || '').replace(/\r/g, '').split(/\n\s*\n/).map(b => b.split('\n').map(l => l.trim()).filter(Boolean)).filter(b => b.length);
  const ok = [], erreurs = [];
  blocs.forEach((b, i) => {
    const n = i + 1;
    if (b.length !== 5) return erreurs.push(`Question ${n} : il faut une question et 4 réponses (${b.length - 1} trouvée${b.length - 1 > 1 ? 's' : ''}).`);
    if (b.slice(1).filter(r => r.startsWith('*')).length !== 1) return erreurs.push(`Question ${n} : il faut exactement une bonne réponse marquée d'une étoile « * ».`);
    if (ok.some(q => q.toLocaleLowerCase('fr') === b[0].toLocaleLowerCase('fr'))) return erreurs.push(`Question ${n} : déjà écrite plus haut, elle ne compte qu'une fois.`);
    ok.push(b[0]);
  });
  return { ok, erreurs };
}
function mjQuizReglages(c, s) {
  const j = c.jeux[s];
  const { ok, erreurs } = quizLire(j.questions);
  return `<div class="box" style="gap:10px">
    <p class="muted" style="margin:0;font-size:14px">Tout le monde joue. Chaque question a quatre réponses, une seule est bonne. Écris un bloc par question, séparés par une ligne vide. La 1re ligne est la question, les 4 suivantes sont les réponses, et la bonne réponse commence par une étoile <span class="mono">*</span>. Points à chaque question, ajoutés en direct au classement : 2 points au premier qui répond juste, 1 point aux autres bonnes réponses. La dernière question vaut plus : 5 points au premier, 4 au 2e, 3 au 3e, 2 au 4e, puis 1.</p>
    <label class="field"><span class="label">Questions · ${ok.length} question${ok.length > 1 ? 's' : ''} valide${ok.length > 1 ? 's' : ''}</span>
      <textarea class="in mono" rows="16" id="c-jeu-jeux-${s}-questions" data-cfg="jeux.${s}.questions" data-kind="area" data-scope="jeu" placeholder="Quelle est la capitale de la France ?&#10;Lyon&#10;*Paris&#10;Marseille&#10;Lille">${esc(j.questions)}</textarea>
      ${erreurs.length ? `<div style="color:var(--danger);font-size:14px">${erreurs.map(esc).join('<br>')}</div>` : '<span class="muted" style="font-size:13px">Tout est bon.</span>'}</label>
    <div class="grid-auto">${cfgInput(`jeux.${s}.nombreQuestions`, j.nombreQuestions, 'num', { label: `Nombre de questions (sur ${ok.length}, 0 = toutes)` })}${cfgInput(`jeux.${s}.tempsQuestion`, j.tempsQuestion, 'dur', { label: 'Temps pour répondre' })}${cfgInput(`jeux.${s}.tempsRevelation`, j.tempsRevelation, 'dur', { label: 'Affichage de la bonne réponse' })}</div>
  </div>`;
}
function mjQuizPartie(e) {
  const q = e.question, phase = e.phase === 'question' ? `Réponses en cours : ${e.repondus} / ${e.participants}` : 'Bonne réponse affichée';
  return `<div class="box" style="background:var(--ink)"><div class="spread"><strong>Question ${e.k + 1} / ${e.total} · ${esc(q?.texte || '')}</strong>${e.phase === 'question' ? `<span class="pill accent"><span class="mono" data-until="${e.fin}"></span></span>` : ''}</div>
    <p style="margin:0">Bonne réponse : <strong>${esc(e.correction ? e.correction.lettre : '')}</strong> · ${phase}${e.manquants?.length ? ` · pas encore : ${e.manquants.map(esc).join(', ')}` : ''}</p>
    ${e.correction ? `<p class="muted" style="margin:0;font-size:14px">Points : ${e.correction.gains.length ? e.correction.gains.map(x => `${esc(x.nom)} +${x.points}`).join(' · ') : 'personne n\'a trouvé'}</p>` : ''}
    <div><button class="btn sm" data-mj="suivant">${e.phase === 'question' ? 'Afficher la bonne réponse' : 'Question suivante'}</button></div></div>`;
}

function reglages() {
  const id = V.games.some(g => g.id === ui.reglJeu) ? ui.reglJeu : V.gameId;
  const c = V.fullConfig.games[id];
  cfgGame = id;
  const note = id !== V.gameId
    ? 'Ce jeu n\'est pas le jeu actuel : tes changements serviront quand il sera lancé.'
    : V.status === 'playing'
      ? 'Partie en cours : les changements sont enregistrés tout de suite ; ceux utilisés au lancement de la partie serviront à la prochaine.'
      : 'Jeu actuel de la soirée.';
  const html = `<div class="row">${V.games.map(g => `<button class="btn ${g.id === id ? 'primary' : ''}" data-regler="${g.id}">${esc(g.name)}${g.id === V.gameId ? ' ●' : ''}${V.programme.includes(g.id) ? '' : ' <span class="muted">(pas au programme)</span>'}</button>`).join('')}</div>
    <p class="muted" style="margin:0">${note}</p>` +
    (id === 'chemin' ? reglagesChemin(c) : id === 'grandpari' ? reglagesGrandPari(c) : id === 'minijeux' ? reglagesMiniJeux(c) : id === 'enquete' ? reglagesEnquete(c) : reglagesDuel(c));
  cfgGame = null;
  return html;
}

// Alertes visibles dans tous les onglets.
function alerts() {
  const out = [];
  if (V.gameId === 'duel') {
    const missing = V.game ? V.game.players.filter(p => !p.num).map(p => p.name) : V.registered.filter(p => !p.dossard).map(p => p.name);
    if (missing.length) out.push(`👕 <strong>${missing.length} joueur${missing.length > 1 ? 's' : ''} sans numéro de maillot</strong> : ${missing.slice(0, 12).map(esc).join(', ')}${missing.length > 12 ? '…' : ''}`);
  }
  // Mini-Jeux : l'avant-dernier round doit être le détective (il égalise le nombre de rounds joués avant le quiz).
  if (V.gameId === 'minijeux' && V.gameConfig?.jeux) {
    const prog = V.game?.rounds ? V.game.rounds.filter(r => !r.hors).map(r => r.jeu) : mjProgram(V.gameConfig);
    const avant = prog[prog.length - 2];
    if (prog.length >= 2 && V.gameConfig.jeux[avant]?.type !== 'disparu') out.push(`🕵️ <span><strong>L'avant-dernier round n'est pas le détective</strong> (« Qu'est-ce qui a changé ? »). Mets-le en avant-dernier : il fait jouer tous ceux qui ont moins de ${esc(V.gameConfig.roundsParJoueur ?? 3)} rounds, avec des points doublés ou triplés, pour que tout le monde ait joué autant.</span>`);
  }
  const copy = !V.reglagesMaj && localCopy();
  if (copy) out.push(`♻️ <span><strong>Le serveur a perdu tes réglages</strong> (codes, indices, durées, noms des jeux). Ce navigateur en garde une copie du ${esc(new Date(copy.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}.</span>
    <button class="btn primary" data-act="restaurerCopie">Restaurer mes réglages</button><button class="btn" data-act="oublierCopie" data-confirm="Oublier la copie de ce navigateur ?">Ignorer</button>`);
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
  const tabs = [['soiree', 'Soirée'], ['partie', 'Partie en cours'], ['reglages', 'Réglages des jeux'], ['classement', 'Classement']];
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

app.addEventListener('click', async e => {
  const t = e.target.closest('[data-tab],[data-act],[data-jeu],[data-team-tab],[data-parti],[data-regler],[data-prog]');
  if (!t || t.disabled) return;
  if (t.dataset.tab) { ui.tab = t.dataset.tab; SJ.store('sj-admin-tab', ui.tab); return draw(); }
  if (t.dataset.regler) { ui.reglJeu = t.dataset.regler; ui.tab = 'reglages'; SJ.store('sj-admin-tab', ui.tab); return draw(); }
  if (t.dataset.prog) return changerProgramme(t.dataset.prog, t.dataset.id);
  if (t.dataset.teamTab) { ui.team = t.dataset.teamTab; return draw(); }
  if (t.dataset.parti) { ui.parti = ui.parti === t.dataset.parti ? null : t.dataset.parti; return draw(); }
  if (!confirmed(t)) return;
  const a = t.dataset.act;
  if (a === 'masquer') { ui.hideNames = !ui.hideNames; return draw(); }
  if (a === 'eqTaches') return admin({ type: 'config', scope: 'jeu', gameId: 'enquete', path: 'taches', value: V.gameConfig?.taches === false });
  if (a === 'eqFiche') return admin({ type: 'config', scope: 'jeu', gameId: 'enquete', path: 'ficheNumerique', value: !V.gameConfig?.ficheNumerique });
  if (a === 'eqSolution') { ui.eqSolution = !ui.eqSolution; return draw(); }
  if (a === 'choisirJeu') return admin({ type: 'choisirJeu', gameId: t.dataset.id });
  if (a === 'ajuster') return admin({ type: 'ajuster', sec: Number(t.dataset.sec) });
  if (a === 'inscriptions') return admin({ type: 'inscriptions', value: t.dataset.v });
  if (a === 'retirerInscrit') return admin({ type: 'retirerInscrit', pid: t.dataset.pid });
  if (a === 'ajouterEnCours') {
    if (!ui.ajoutPid) return SJ.toast({ ok: false, msg: 'Choisis le joueur.' });
    const r = await admin({ type: 'ajouterEnCours', pid: ui.ajoutPid });
    if (r.ok) ui.ajoutPid = null;
    return;
  }
  if (a === 'codeReprise') {
    if (!ui.reprisePid) return SJ.toast({ ok: false, msg: 'Choisis le joueur.' });
    const r = await admin({ type: 'codeReprise', pid: ui.reprisePid });
    if (r.ok) { ui.reprise = { name: r.name, code: r.code }; draw(); }
    return;
  }
  if (a === 'bonus') return admin({ type: 'bonus', pid: t.dataset.pid, delta: Number(t.dataset.delta) });
  if (a === 'bonusLibre') {
    const pid = document.getElementById('bonus-pid').value, delta = Number(document.getElementById('bonus-val').value);
    if (!pid || !delta) return SJ.toast({ ok: false, msg: 'Choisis un joueur et un nombre de points.' });
    return admin({ type: 'bonus', pid, delta });
  }
  if (a === 'afficherClassement') return admin({ type: 'afficherClassement', mode: t.dataset.mode });
  if (a === 'simStart') return admin({ type: 'simulation', cmd: 'start', n: Number(document.getElementById('sim-n').value), moi: Number(document.getElementById('sim-moi').value), games: document.getElementById('sim-jeux').value.split(',') });
  if (a === 'simStop') return admin({ type: 'simulation', cmd: 'stop' });
  if (a === 'simErase') return admin({ type: 'simulation', cmd: 'effacer' });
  if (a === 'restaurerCopie') {
    const c = localCopy();
    return c && admin({ type: 'importerReglages', config: c.config });
  }
  if (a === 'oublierCopie') { SJ.store('sj-admin-reglages', null); return draw(); }
  if (a === 'copierLiens') {
    const ta = document.getElementById('eq-liens');
    if (!ta) return;
    ta.select();
    try { await navigator.clipboard.writeText(ta.value); } catch { document.execCommand?.('copy'); }
    return SJ.toast({ ok: true, msg: 'Liens copiés : colle-les dans ton message.' });
  }
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
  const action = { type: j, pid: t.dataset.pid, team: t.dataset.team, duel: t.dataset.duel, winner: t.dataset.winner, sec: t.dataset.sec, salle: t.dataset.salle };
  if (j === 'remplacer') {
    action.remplacant = document.getElementById('rempl-' + t.dataset.pid)?.value;
    if (!action.remplacant) action.remplacant = 'auto';
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
// Le serveur n'envoie l'état que s'il change : on redessine quand même chaque seconde (tirage, couleurs du classement…).
setInterval(() => { if (V) draw(); }, 1000);
