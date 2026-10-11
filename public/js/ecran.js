/* Écran principal (la « console ») : préparation, soirée, réglages en direct. */

const socket = io({ query: { role: 'ecran' } });
surveillerConnexion(socket);

const app = document.getElementById('app');
const fond = document.getElementById('modale');

let S = null; // dernier état reçu du serveur
let modale = null; // { type: 'reglages', jeuId } | { type: 'programme' } | { type: 'scores' }

const GENRES = { physique: 'Physique', mixte: 'Mixte', numerique: 'Numérique' };

socket.on('etat', (etat) => {
  recuA = Date.now();
  const ancien = S;
  S = etat;
  jouerSons(ancien, etat);
  rendre();
  rendreModale();
});

const envoyer = (evenement, donnees) => socket.emit(evenement, donnees);
const actionJeu = (action, donnees) => socket.emit('jeu:action', { action, donnees });
const jeu = (id) => S.catalogue.find((j) => j.id === id);

/* ------------------------------------------------------------------ */
/* Rendu principal                                                     */
/* ------------------------------------------------------------------ */

function rendre() {
  if (S.phase === 'preparation') rendrePreparation();
  else if (S.phase === 'soiree') rendreSoiree();
  else rendreFin();
}

function valeurAffichee(def, v) {
  if (def.type === 'nombre') return `${v}${def.unite || ''}`;
  if (def.type === 'interrupteur') return v ? 'oui' : 'non';
  if (def.type === 'choix') {
    const o = def.options.find((x) => x.valeur === v);
    return o ? o.court || o.libelle : v;
  }
  return v;
}

function resumeReglages(j) {
  const r = S.reglages[j.id];
  return j.reglages.slice(0, 4).map((def) =>
    `<span class="puce">${h(def.court || def.libelle)} : <b>${h(valeurAffichee(def, r[def.cle]))}</b></span>`).join('');
}

function blocAcces(compact) {
  return `<div class="acces ${compact ? 'compact' : ''}">
    <img src="${S.acces.qr}" alt="QR code pour rejoindre">
    <div><strong>${compact ? 'Rejoindre' : 'Scannez pour rejoindre'}</strong><code>${h(S.acces.url)}</code></div>
  </div>`;
}

function listeProgramme(enSoiree) {
  if (!S.programme.length) return '<p class="vide">Aucun jeu choisi. Ajoute des jeux depuis le catalogue.</p>';
  const n = S.programme.length;
  return `<ol class="programme">${S.programme.map((id, i) => {
    const j = jeu(id);
    const actif = enSoiree && i === S.courant;
    return `<li class="${actif ? 'actif' : ''}">
      <span class="num">${i + 1}</span>
      <span class="nom">${j.icone} ${h(j.nom)}${actif ? ' <em>en cours</em>' : ''}</span>
      <span class="outils">
        ${enSoiree && !actif ? `<button class="mini" data-act="aller" data-v="${i}" title="Jouer maintenant">▶</button>` : ''}
        <button class="mini" data-act="reglages" data-v="${id}" title="Régler">⚙</button>
        <button class="mini" data-act="monter" data-v="${id}" title="Monter" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="mini" data-act="descendre" data-v="${id}" title="Descendre" ${i === n - 1 ? 'disabled' : ''}>↓</button>
        <button class="mini" data-act="basculer" data-v="${id}" title="Retirer de la soirée">✕</button>
      </span>
    </li>`;
  }).join('')}</ol>`;
}

function listeJoueurs(avecRetrait) {
  if (!S.joueurs.length) return '<p class="vide">Personne n’a encore rejoint.</p>';
  return `<div class="pastilles">${S.joueurs.map((j) =>
    avecRetrait
      ? `<span class="pastille-ret">${pastille(j)}<button class="mini" data-act="retirer-joueur" data-v="${j.id}" title="Retirer ${h(j.nom)}">✕</button></span>`
      : pastille(j)).join('')}</div>`;
}

/* ---------- Préparation ---------- */

function rendrePreparation() {
  const cartes = S.catalogue.map((j) => {
    const inclus = S.programme.includes(j.id);
    return `<article class="carte ${inclus ? 'incluse' : ''}">
      <div class="carte-tete"><span class="icone">${j.icone}</span><span class="badge ${j.genre}">${GENRES[j.genre] || j.genre}</span></div>
      <h3>${h(j.nom)}</h3>
      <p>${h(j.description)}</p>
      <div class="puces">${resumeReglages(j)}</div>
      <div class="carte-actions">
        <button class="btn ${inclus ? 'choisi' : 'primaire'}" data-act="basculer" data-v="${j.id}">${inclus ? '✓ Dans la soirée' : '+ Ajouter'}</button>
        <button class="btn fantome" data-act="reglages" data-v="${j.id}">⚙ Régler</button>
      </div>
    </article>`;
  }).join('');

  app.innerHTML = `
    <header class="entete">
      <div>
        <h1>🎉 Soirée Jeux</h1>
        <p class="sous">Règle chaque jeu, choisis ceux de ce soir et leur ordre, puis lance la soirée.</p>
      </div>
      <button class="btn primaire grand" data-act="demarrer" ${S.programme.length ? '' : 'disabled'}>Démarrer la soirée ▶</button>
    </header>
    <div class="prep">
      <section class="catalogue">${cartes}</section>
      <aside class="panneau">
        <h2>Programme de la soirée <span class="compte">${S.programme.length}</span></h2>
        ${listeProgramme(false)}
        <h2>Joueurs <span class="compte">${S.joueurs.filter((j) => j.connecte).length}</span></h2>
        <p class="aide">Les joueurs peuvent déjà rejoindre avec leur téléphone.</p>
        ${blocAcces(true)}
        ${listeJoueurs(true)}
      </aside>
    </div>`;
}

/* ---------- Soirée ---------- */

function rendreSoiree() {
  const j = S.jeu ? jeu(S.jeu.id) : null;
  const n = S.programme.length;
  const suivant = S.courant + 1 < n ? jeu(S.programme[S.courant + 1]) : null;
  const titre = j
    ? `${j.icone} ${h(j.nom)} <span class="etape">${S.courant + 1} / ${n}</span>`
    : '🎉 Accueil de la soirée';
  const jeuRegle = j ? j.id : S.programme[0];

  app.innerHTML = `
    <header class="barre">
      <div class="titre-jeu">${titre}</div>
      <nav class="outils-barre">
        ${jeuRegle ? `<button class="btn fantome" data-act="reglages" data-v="${jeuRegle}">⚙ Réglages</button>` : ''}
        <button class="btn fantome" data-act="modale" data-v="programme">📋 Programme</button>
        <button class="btn fantome" data-act="modale" data-v="scores">🏆 Scores</button>
        <button class="btn fantome" data-act="plein-ecran" title="Plein écran">⛶</button>
        <button class="btn fantome" data-act="terminer">⏹ Terminer</button>
      </nav>
    </header>
    <div class="soiree">
      <main class="scene">${j ? rendreJeu(S.jeu) : rendreAccueil()}</main>
      <aside class="classement">
        <h2>Classement</h2>
        ${classement()}
        ${j ? blocAcces(true) : ''}
      </aside>
    </div>
    <footer class="navigation">
      <button class="btn fantome" data-act="aller" data-v="${S.courant - 1}" ${S.courant < 0 ? 'disabled' : ''}>◀ ${S.courant <= 0 ? 'Accueil' : 'Jeu précédent'}</button>
      ${suivant
        ? `<button class="btn primaire" data-act="aller" data-v="${S.courant + 1}">${S.courant < 0 ? 'Premier jeu' : 'Jeu suivant'} : ${suivant.icone} ${h(suivant.nom)} ▶</button>`
        : `<button class="btn primaire" data-act="terminer">Finir la soirée 🏁</button>`}
    </footer>`;
}

function rendreAccueil() {
  const premier = S.programme.length ? jeu(S.programme[0]) : null;
  return `<div class="accueil">
    ${blocAcces(false)}
    <div class="accueil-infos">
      <h2>Joueurs connectés : ${S.joueurs.filter((j) => j.connecte).length}</h2>
      ${listeJoueurs(true)}
      <h2>Au programme</h2>
      <ol class="programme-simple">${S.programme.map((id) => `<li>${jeu(id).icone} ${h(jeu(id).nom)}</li>`).join('')}</ol>
      ${premier ? `<button class="btn primaire geant" data-act="aller" data-v="0">C'est parti : ${premier.icone} ${h(premier.nom)} ▶</button>` : ''}
    </div>
  </div>`;
}

function classement() {
  if (!S.joueurs.length) return '<p class="vide">Aucun joueur.</p>';
  const tries = [...S.joueurs].sort((a, b) => b.score - a.score);
  return `<ol class="scores">${tries.map((j) => `<li class="${j.connecte ? '' : 'deconnecte'}">
    <i style="background:${h(j.couleur)}"></i><span>${h(j.nom)}</span><b>${j.score}</b></li>`).join('')}</ol>`;
}

/* ---------- Fin ---------- */

function rendreFin() {
  const tries = [...S.joueurs].sort((a, b) => b.score - a.score);
  const podium = tries.slice(0, 3);
  const medailles = ['🥇', '🥈', '🥉'];
  app.innerHTML = `
    <div class="fin">
      <h1>🏁 Fin de la soirée !</h1>
      <div class="podium">${podium.map((j, i) => `<div class="marche m${i + 1}" style="--c:${h(j.couleur)}">
        <span class="medaille">${medailles[i]}</span><strong>${h(j.nom)}</strong><span>${j.score} pts</span></div>`).join('')}</div>
      ${tries.length > 3 ? `<ol class="scores large" style="counter-reset: rang 3">${tries.slice(3).map((j) =>
        `<li><i style="background:${h(j.couleur)}"></i><span>${h(j.nom)}</span><b>${j.score}</b></li>`).join('')}</ol>` : ''}
      <div class="actions">
        <button class="btn fantome grand" data-act="reprendre">↩ Reprendre la soirée</button>
        <button class="btn primaire grand" data-act="preparation">Préparer une nouvelle soirée</button>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Rendu des jeux sur l'écran                                          */
/* ------------------------------------------------------------------ */

function rendreJeu({ id, vue }) {
  const rendu = RENDUS[id];
  return rendu ? rendu(vue) : `<p>Pas d'affichage pour le jeu « ${h(id)} ».</p>`;
}

const boutonPause = (chrono) => chrono
  ? `<button class="btn fantome" data-act="jeu" data-v="pause">${chrono.enPause ? '▶ Reprendre' : '⏸ Pause'}</button>` : '';

const RENDUS = {
  imposteur(v) {
    switch (v.phase) {
      case 'attente':
        return `<div class="grosse-icone">🕵️</div>
          <h2 class="titre-scene">L'Imposteur</h2>
          <p class="consigne">Chacun reçoit un mot secret sur son téléphone. Un imposteur se cache parmi vous…</p>
          ${v.message ? `<p class="alerte">${h(v.message)}</p>` : ''}
          <button class="btn primaire geant" data-act="jeu" data-v="distribuer">Distribuer les rôles (${v.nbJoueurs} joueurs)</button>`;
      case 'revelation':
        return `<p class="etiquette">Manche ${v.manche} · ${v.nbImposteurs} imposteur${v.nbImposteurs > 1 ? 's' : ''}</p>
          <h2 class="titre-scene">🤫 Regardez votre téléphone en cachette</h2>
          <p class="consigne">Maintenez la carte appuyée pour voir votre mot, puis appuyez sur « J'ai vu ».</p>
          <div class="pastilles grandes">${v.joueurs.map((j) => pastille(j, j.vu ? '✓' : '…')).join('')}</div>
          <div class="actions">
            <button class="btn primaire grand" data-act="jeu" data-v="discussion">Lancer la discussion</button>
            <button class="btn fantome" data-act="jeu" data-v="annuler">Annuler la manche</button>
          </div>`;
      case 'discussion':
        return `<p class="etiquette">Discussion · catégorie ${h(v.categorie)}</p>
          ${htmlChrono(v.chrono, 'geant')}
          <p class="consigne">Chacun à son tour dit un mot en lien avec son mot secret. <strong>${h(v.premier)}</strong> commence !</p>
          <div class="actions">
            ${boutonPause(v.chrono)}
            <button class="btn primaire grand" data-act="jeu" data-v="vote">Passer au vote</button>
          </div>`;
      case 'vote':
        return `<h2 class="titre-scene">🗳️ Votez sur votre téléphone</h2>
          <p class="consigne">Qui est l'imposteur ?</p>
          <div class="pastilles grandes">${v.joueurs.map((j) => pastille(j, j.aVote ? '✓' : '…')).join('')}</div>
          <div class="actions"><button class="btn primaire grand" data-act="jeu" data-v="reveler">Révéler maintenant</button></div>`;
      case 'resultat': {
        const r = v.resultat;
        const civils = r.gagnants === 'civils';
        const max = Math.max(1, ...r.votes.map((x) => x.voix));
        return `<div class="banniere ${civils ? 'succes' : 'danger'}">${civils ? "🎉 Les civils ont démasqué l'imposteur !" : "😈 L'imposteur s'en sort !"}</div>
          <p class="consigne">${r.elimine ? `<strong>${h(r.elimine)}</strong> a été éliminé·e.` : r.egalite ? 'Égalité : personne n’est éliminé.' : 'Personne n’a voté.'}
            Imposteur${r.imposteurs.length > 1 ? 's' : ''} : <strong>${r.imposteurs.map(h).join(', ')}</strong></p>
          <p class="mots-reveles">Mot des civils : <b>${h(r.motCivil)}</b>${r.motImposteur ? ` · Mot de l'imposteur : <b>${h(r.motImposteur)}</b>` : ''}</p>
          <div class="barres">${r.votes.map((x) => `<div class="barre-vote ${x.imposteur ? 'imposteur' : ''}">
            <span>${h(x.nom)}${x.imposteur ? ' 🕵️' : ''}</span>
            <div><i style="width:${(x.voix / max) * 100}%;background:${h(x.couleur)}"></i></div><b>${x.voix}</b></div>`).join('')}</div>
          <div class="actions"><button class="btn primaire geant" data-act="jeu" data-v="distribuer">Nouvelle manche</button></div>`;
      }
    }
    return '';
  },

  buzzer(v) {
    const msg = v.message ? `<p class="alerte ${v.message.type}">${h(v.message.texte)}</p>` : '';
    switch (v.phase) {
      case 'ferme':
        return `<p class="etiquette">Question ${v.question}</p>
          <h2 class="titre-scene">Le meneur lit la question…</h2>
          ${msg}
          <button class="btn primaire geant" data-act="jeu" data-v="ouvrir">Ouvrir les buzzers 🔔</button>`;
      case 'ouvert':
        return `<p class="etiquette">Question ${v.question}</p>
          <div class="buzz-ouvert">BUZZEZ !</div>
          ${msg}
          ${v.exclus.length ? `<p class="consigne">Bloqués : ${v.exclus.map(h).join(', ')}</p>` : ''}
          <div class="actions"><button class="btn fantome" data-act="jeu" data-v="suivante">Passer la question</button></div>`;
      case 'buzze':
        return `<p class="etiquette">Question ${v.question}</p>
          <div class="nom-geant" style="--c:${h(v.buzzeur?.couleur)}">${h(v.buzzeur?.nom)}</div>
          ${htmlChrono(v.chrono, 'moyen')}
          <div class="actions">
            <button class="btn succes geant" data-act="jeu" data-v="correct">✓ Bonne réponse (+${v.pointsBonne})</button>
            <button class="btn danger geant" data-act="jeu" data-v="faux">✗ Mauvaise réponse${v.penalite ? ` (−${v.penalite})` : ''}</button>
          </div>
          <div class="actions">
            ${boutonPause(v.chrono)}
            <button class="btn fantome" data-act="jeu" data-v="annuler">↺ Annuler le buzz</button>
          </div>`;
    }
    return '';
  },

  mimes(v) {
    switch (v.phase) {
      case 'attente': {
        const mode = v.mode === 'aleatoire'
          ? '🎲 Le mode (mime, dessin ou description) sera tiré au hasard.'
          : `${v.modes[v.mode].icone} ${h(v.modes[v.mode].libelle)} — ${h(v.modes[v.mode].consigne)}`;
        if (!v.prochain) return `<h2 class="titre-scene">En attente de joueurs…</h2>`;
        return `<p class="etiquette">Au tour de</p>
          <div class="nom-geant" style="--c:${h(v.prochain.couleur)}">${h(v.prochain.nom)}</div>
          <p class="consigne">${mode}</p>
          <p class="consigne">Prends ton téléphone et appuie sur « Go » quand tu es prêt·e.</p>
          ${v.message ? `<p class="alerte">${h(v.message)}</p>` : ''}
          <div class="actions">
            <button class="btn primaire grand" data-act="jeu" data-v="commencer">Démarrer le tour</button>
            <button class="btn fantome" data-act="jeu" data-v="passerJoueur">Passer ce joueur</button>
          </div>`;
      }
      case 'tour':
        return `<div class="mode-grand">${v.mode.icone} ${h(v.mode.libelle)}</div>
          <p class="consigne">${h(v.mode.consigne)}</p>
          ${htmlChrono(v.chrono, 'geant')}
          <p class="stats"><span>✓ ${v.nbTrouves} trouvé${v.nbTrouves > 1 ? 's' : ''}</span><span>↷ ${v.passesRestantes} passe${v.passesRestantes > 1 ? 's' : ''}</span></p>
          <p class="consigne"><strong style="color:${h(v.joueur.couleur)}">${h(v.joueur.nom)}</strong> fait deviner…</p>
          <div class="actions">${boutonPause(v.chrono)}<button class="btn fantome" data-act="jeu" data-v="arreter">Arrêter le tour</button></div>`;
      case 'fin':
        return `<h2 class="titre-scene">⏰ Fin du tour !</h2>
          <p class="consigne"><strong>${h(v.joueur.nom)}</strong> a fait deviner <strong>${v.nbTrouves}</strong> mot${v.nbTrouves > 1 ? 's' : ''} (+${v.points} pts)</p>
          <div class="deux-colonnes">
            <div><h3>Trouvés</h3><ul class="mots">${v.trouves.map((m) => `<li>✓ ${h(m)}</li>`).join('') || '<li class="vide">aucun</li>'}</ul></div>
            <div><h3>Passés</h3><ul class="mots passes">${v.passes.map((m) => `<li>↷ ${h(m)}</li>`).join('') || '<li class="vide">aucun</li>'}</ul></div>
          </div>
          <div class="actions"><button class="btn primaire geant" data-act="jeu" data-v="suivant">Joueur suivant ▶</button></div>`;
    }
    return '';
  },
};

/* ------------------------------------------------------------------ */
/* Modales : réglages, programme, scores                               */
/* ------------------------------------------------------------------ */

function ouvrirModale(m) {
  modale = m;
  fond.innerHTML = '';
  rendreModale();
}

function fermerModale() {
  modale = null;
  rendreModale();
}

function rendreModale() {
  if (!modale) {
    fond.hidden = true;
    fond.innerHTML = '';
    return;
  }
  fond.hidden = false;
  if (modale.type === 'reglages') {
    const dejaLa = fond.querySelector('.modale-reglages');
    if (dejaLa && dejaLa.dataset.jeu === modale.jeuId) return synchroniserReglages();
    fond.innerHTML = modaleReglages(modale.jeuId);
  } else if (modale.type === 'programme') {
    fond.innerHTML = modaleProgramme();
  } else if (modale.type === 'scores') {
    fond.innerHTML = modaleScores();
  }
}

function controleReglage(jeuId, def, valeur) {
  const attrs = `data-jeu="${jeuId}" data-cle="${def.cle}"`;
  if (def.type === 'nombre') {
    return `<div class="stepper">
      <button data-act="pas" ${attrs} data-delta="-1" aria-label="Moins">−</button>
      <output data-sync ${attrs}>${h(valeurAffichee(def, valeur))}</output>
      <button data-act="pas" ${attrs} data-delta="1" aria-label="Plus">+</button>
    </div>`;
  }
  if (def.type === 'choix') {
    return `<select data-reglage data-sync ${attrs}>${def.options.map((o) =>
      `<option value="${h(o.valeur)}" ${o.valeur === valeur ? 'selected' : ''}>${h(o.libelle)}</option>`).join('')}</select>`;
  }
  if (def.type === 'interrupteur') {
    return `<label class="interrupteur"><input type="checkbox" data-reglage data-sync ${attrs} ${valeur ? 'checked' : ''}><span></span></label>`;
  }
  return `<input type="text" data-reglage data-sync ${attrs} value="${h(valeur)}">`;
}

function modaleReglages(jeuId) {
  const j = jeu(jeuId);
  const r = S.reglages[jeuId];
  const inclus = S.programme.includes(jeuId);
  const enCours = S.phase === 'soiree' && S.jeu?.id === jeuId;
  return `<div class="modale modale-reglages" data-jeu="${jeuId}" role="dialog" aria-label="Réglages">
    <div class="onglets">${S.catalogue.map((x) =>
      `<button class="onglet ${x.id === jeuId ? 'actif' : ''}" data-act="reglages" data-v="${x.id}">${x.icone} ${h(x.nom)}</button>`).join('')}</div>
    <h2>${j.icone} Réglages · ${h(j.nom)}</h2>
    ${enCours ? '<p class="note">Jeu en cours : les changements s’appliquent dès la prochaine manche (les points tout de suite).</p>' : ''}
    <div class="champs">${j.reglages.map((def) =>
      `<div class="champ"><label>${h(def.libelle)}</label>${controleReglage(jeuId, def, r[def.cle])}</div>`).join('')}</div>
    <div class="pied">
      <button class="btn fantome" data-act="defaut" data-v="${jeuId}">Valeurs par défaut</button>
      <button class="btn fantome" data-act="basculer" data-v="${jeuId}"><span data-inclus>${inclus ? '✓ Dans la soirée' : '+ Ajouter à la soirée'}</span></button>
      <button class="btn primaire" data-act="fermer">Terminé</button>
    </div>
  </div>`;
}

/** Met à jour les champs ouverts sans reconstruire la modale (garde le focus). */
function synchroniserReglages() {
  const jeuId = modale.jeuId;
  const j = jeu(jeuId);
  const r = S.reglages[jeuId];
  fond.querySelectorAll('[data-sync]').forEach((el) => {
    const def = j.reglages.find((d) => d.cle === el.dataset.cle);
    if (!def || el === document.activeElement) return;
    const v = r[def.cle];
    if (el.tagName === 'OUTPUT') el.textContent = valeurAffichee(def, v);
    else if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  });
  const inclus = fond.querySelector('[data-inclus]');
  if (inclus) inclus.textContent = S.programme.includes(jeuId) ? '✓ Dans la soirée' : '+ Ajouter à la soirée';
}

function modaleProgramme() {
  const dispo = S.catalogue.filter((j) => !S.programme.includes(j.id));
  return `<div class="modale" role="dialog" aria-label="Programme">
    <h2>📋 Programme de la soirée</h2>
    <p class="note">Ajoute, retire ou réordonne les jeux, même en pleine soirée.</p>
    ${listeProgramme(S.phase === 'soiree')}
    ${dispo.length ? `<h3>Ajouter un jeu</h3><div class="dispo">${dispo.map((j) =>
      `<button class="btn fantome" data-act="basculer" data-v="${j.id}">+ ${j.icone} ${h(j.nom)}</button>`).join('')}</div>` : ''}
    <div class="pied"><button class="btn primaire" data-act="fermer">Terminé</button></div>
  </div>`;
}

function modaleScores() {
  const tries = [...S.joueurs].sort((a, b) => b.score - a.score);
  return `<div class="modale" role="dialog" aria-label="Scores">
    <h2>🏆 Scores</h2>
    <p class="note">Corrige un score à la main si besoin.</p>
    ${tries.length ? `<ul class="ajuste-scores">${tries.map((j) => `<li>
      ${pastille(j)}
      <span class="stepper">
        <button data-act="score" data-id="${j.id}" data-delta="-1">−</button>
        <output>${j.score}</output>
        <button data-act="score" data-id="${j.id}" data-delta="1">+</button>
      </span></li>`).join('')}</ul>` : '<p class="vide">Aucun joueur.</p>'}
    <div class="pied">
      <button class="btn fantome" data-act="scores-zero">Remettre à zéro</button>
      <button class="btn primaire" data-act="fermer">Terminé</button>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Interactions                                                        */
/* ------------------------------------------------------------------ */

function modifierProgramme(modifier) {
  const p = [...S.programme];
  modifier(p);
  envoyer('programme', p);
}

const ACTIONS = {
  jeu: (v) => actionJeu(v),
  aller: (v) => envoyer('soiree:aller', Number(v)),
  demarrer: () => envoyer('soiree:demarrer'),
  terminer: () => { if (confirm('Terminer la soirée et afficher le classement ?')) envoyer('soiree:terminer'); },
  reprendre: () => envoyer('soiree:reprendre'),
  preparation: () => envoyer('soiree:preparation'),
  reglages: (v) => ouvrirModale({ type: 'reglages', jeuId: v }),
  modale: (v) => ouvrirModale({ type: v }),
  fermer: () => fermerModale(),
  defaut: (v) => { envoyer('reglages:defaut', v); fond.innerHTML = ''; },
  basculer: (v) => modifierProgramme((p) => {
    const i = p.indexOf(v);
    if (i === -1) p.push(v);
    else if (!(S.phase === 'soiree' && S.jeu?.id === v) || confirm('Ce jeu est en cours. Le retirer du programme ?')) p.splice(i, 1);
  }),
  monter: (v) => modifierProgramme((p) => { const i = p.indexOf(v); if (i > 0) [p[i - 1], p[i]] = [p[i], p[i - 1]]; }),
  descendre: (v) => modifierProgramme((p) => { const i = p.indexOf(v); if (i >= 0 && i < p.length - 1) [p[i + 1], p[i]] = [p[i], p[i + 1]]; }),
  'retirer-joueur': (v) => {
    const j = S.joueurs.find((x) => x.id === v);
    if (j && confirm(`Retirer ${j.nom} de la soirée ?`)) envoyer('joueur:retirer', v);
  },
  'scores-zero': () => { if (confirm('Remettre tous les scores à zéro ?')) envoyer('scores:zero'); },
  'plein-ecran': () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  },
};

document.addEventListener('click', (e) => {
  if (e.target === fond) return fermerModale();
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled || !S) return;
  const act = el.dataset.act;

  if (act === 'pas') {
    const { jeu: jeuId, cle } = el.dataset;
    const def = jeu(jeuId).reglages.find((d) => d.cle === cle);
    const actuelle = S.reglages[jeuId][cle];
    const nouvelle = Math.min(def.max, Math.max(def.min, actuelle + Number(el.dataset.delta) * (def.pas || 1)));
    if (nouvelle === actuelle) return;
    S.reglages[jeuId][cle] = nouvelle; // affichage immédiat, le serveur confirme
    synchroniserReglages();
    envoyer('reglage', { jeuId, cle, valeur: nouvelle });
    return;
  }
  if (act === 'score') {
    envoyer('score:ajuster', { id: el.dataset.id, delta: Number(el.dataset.delta) });
    return;
  }
  ACTIONS[act]?.(el.dataset.v);
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-reglage]');
  if (!el) return;
  const valeur = el.type === 'checkbox' ? el.checked : el.value;
  envoyer('reglage', { jeuId: el.dataset.jeu, cle: el.dataset.cle, valeur });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modale) fermerModale();
});

/* ------------------------------------------------------------------ */
/* Sons                                                                */
/* ------------------------------------------------------------------ */

let audio = null;
function bip(frequences, duree = 0.15) {
  try {
    audio = audio || new AudioContext();
    const t0 = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'square';
    frequences.forEach((f, i) => osc.frequency.setValueAtTime(f, t0 + i * duree));
    gain.gain.setValueAtTime(0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + frequences.length * duree + 0.2);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + frequences.length * duree + 0.2);
  } catch { /* pas de son, tant pis */ }
}

function jouerSons(ancien, nouveau) {
  const a = ancien?.jeu;
  const n = nouveau.jeu;
  if (!n || !a || a.id !== n.id) return;
  if (n.id === 'buzzer' && n.vue.son && n.vue.numeroBuzz > a.vue.numeroBuzz) bip([880, 660]);
  const finDeChrono = (a.vue.chrono && !n.vue.chrono && a.vue.phase !== n.vue.phase);
  if (finDeChrono && n.id !== 'buzzer') bip([523, 392, 262], 0.2);
}
