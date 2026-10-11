/* Manette (téléphone) : rejoindre la soirée puis jouer. */

const socket = io();
surveillerConnexion(socket);

const app = document.getElementById('app');
const CLE = 'soiree-jeux:joueur';
const stock = {
  lire() { try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch { return {}; } },
  ecrire(v) { try { localStorage.setItem(CLE, JSON.stringify(v)); } catch { /* navigation privée */ } },
  effacer() { try { localStorage.removeItem(CLE); } catch { /* idem */ } },
};

let S = null;
let erreurInscription = null;
let carteTenue = false; // carte secrète maintenue appuyée (Imposteur)
let dernierBuzzMoi = false;

/* ---------- Connexion ---------- */

socket.on('connect', () => {
  const memo = stock.lire();
  if (memo.id) rejoindre(memo.id, memo.nom);
});

function rejoindre(id, nom) {
  socket.emit('rejoindre', { id, nom }, (rep) => {
    if (rep?.erreur) {
      erreurInscription = rep.erreur;
      if (id) stock.effacer();
      S = { inscrit: false };
      return rendre();
    }
    erreurInscription = null;
    stock.ecrire({ id: rep.id, nom: rep.nom });
    garderEcranAllume();
  });
}

socket.on('etat', (etat) => {
  recuA = Date.now();
  // Ne pas écraser le formulaire si on attend la réponse à une reconnexion.
  if (!etat.inscrit && S?.inscrit === false && document.querySelector('form.rejoindre')) return;
  S = etat;
  rendre();
});

socket.on('retire', () => {
  stock.effacer();
  S = { inscrit: false };
  erreurInscription = 'Tu as été retiré·e de la soirée.';
  rendre();
});

socket.on('remplace', () => {
  app.innerHTML = '<div class="centre"><p class="grosse-icone">📱</p><p>Ta manette est ouverte sur un autre appareil.</p><button class="btn primaire" onclick="location.reload()">Reprendre ici</button></div>';
});

/* ---------- Rendu ---------- */

function rendre() {
  if (!S) return;
  if (!S.inscrit) {
    if (stock.lire().id && !erreurInscription) {
      app.innerHTML = '<p class="chargement">Reconnexion…</p>';
      return;
    }
    return rendreInscription();
  }
  const moi = S.moi;
  app.innerHTML = `
    <header class="tete-manette" style="--c:${h(moi.couleur)}">
      <span class="rond"></span><strong>${h(moi.nom)}</strong>
      ${S.jeu ? `<span class="jeu-actuel">${S.jeu.icone} ${h(S.jeu.nom)}</span>` : ''}
      <span class="score">${moi.score} pt${Math.abs(moi.score) > 1 ? 's' : ''}</span>
    </header>
    <main class="ecran-manette">${contenu()}</main>`;
  if (carteTenue) document.querySelector('.carte-secrete')?.classList.add('visible');
}

function rendreInscription() {
  const memo = stock.lire();
  app.innerHTML = `
    <form class="rejoindre centre">
      <p class="grosse-icone">🎉</p>
      <h1>Soirée Jeux</h1>
      <label for="nom">Ton prénom</label>
      <input id="nom" name="nom" maxlength="16" autocomplete="given-name" placeholder="ex. Camille" value="${h(memo.nom || '')}" required>
      ${erreurInscription ? `<p class="alerte">${h(erreurInscription)}</p>` : ''}
      <button class="btn primaire geant" type="submit">Rejoindre</button>
    </form>`;
  const form = app.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nom = form.nom.value.trim();
    if (!nom) return;
    erreurInscription = null;
    rejoindre(null, nom);
  });
}

function contenu() {
  if (S.phase === 'fin') {
    return `<div class="centre"><p class="grosse-icone">🏁</p><h2>Fin de la soirée !</h2>
      <p>Tu termines avec <strong>${S.moi.score} points</strong>. Regarde le classement sur l'écran.</p></div>`;
  }
  if (!S.jeu) {
    return `<div class="centre"><p class="grosse-icone attente">👀</p><h2>Tu es dans la partie !</h2>
      <p>${S.phase === 'preparation' ? 'La soirée se prépare…' : 'Le prochain jeu arrive.'} Regarde le grand écran.</p></div>`;
  }
  const rendu = MANETTES[S.jeu.id];
  return rendu ? rendu(S.jeu.vue) : '<p class="centre">Regarde le grand écran.</p>';
}

function attente(texte, icone = '👀') {
  return `<div class="centre"><p class="grosse-icone attente">${icone}</p><p>${texte}</p></div>`;
}

/* ---------- Manettes par jeu ---------- */

const MANETTES = {
  imposteur(v) {
    if (v.phase === 'attente') return attente('Les rôles vont être distribués…', '🕵️');
    if (v.phase === 'spectateur') return attente('Tu regardes cette manche. Tu joueras la prochaine !');

    const role = v.role;
    const dosCarte = role.imposteur
      ? `<span class="role imposteur">🕵️ Tu es l'imposteur</span>
         ${role.categorie ? `<span class="indice">Catégorie : ${h(role.categorie)}</span>` : ''}
         <span class="indice">Bluffe pour ne pas te faire repérer !</span>`
      : `<span class="indice">Ton mot</span><span class="mot">${h(role.mot)}</span>`;
    const carte = `<button class="carte-secrete" data-tenir>
        <span class="face">🙈 Maintiens appuyé pour voir</span>
        <span class="dos">${dosCarte}</span>
      </button>`;

    if (v.phase === 'revelation') {
      return `${carte}${v.vu
        ? '<p class="info">✓ Attends que tout le monde ait vu.</p>'
        : '<button class="btn primaire geant" data-act="vu">J’ai vu</button>'}`;
    }
    if (v.phase === 'discussion') return `${carte}<p class="info">💬 Discussion en cours, suis le chrono sur l'écran.</p>`;
    if (v.phase === 'vote') {
      return `<h2>Qui est l'imposteur ?</h2>
        <div class="choix">${v.cibles.map((c) => `<button class="btn choix-joueur ${v.monVote === c.id ? 'choisi' : ''}"
          style="--c:${h(c.couleur)}" data-act="voter" data-cible="${c.id}">${h(c.nom)}</button>`).join('')}</div>
        <p class="info">${v.monVote ? '✓ Vote enregistré, tu peux encore changer.' : 'Touche un nom pour voter.'}</p>
        ${carte}`;
    }
    if (v.phase === 'resultat') {
      const r = v.resultat;
      return `<div class="centre"><p class="grosse-icone">${r.gagne ? '🎉' : '😢'}</p>
        <h2>${r.gagne ? 'Gagné !' : 'Perdu…'}</h2>
        <p>${r.etaisImposteur ? "Tu étais l'imposteur." : 'Tu étais civil.'}</p>
        <p>Mot des civils : <strong>${h(r.motCivil)}</strong>${r.motImposteur ? `<br>Mot de l'imposteur : <strong>${h(r.motImposteur)}</strong>` : ''}</p></div>`;
    }
    return '';
  },

  buzzer(v) {
    if (v.phase === 'buzze' && v.moi) {
      if (!dernierBuzzMoi) navigator.vibrate?.([80, 40, 80]);
      dernierBuzzMoi = true;
      return `<div class="gros-buzz moi">À toi !</div><p class="info">Donne ta réponse à voix haute.</p>`;
    }
    dernierBuzzMoi = false;
    if (v.exclu) return `<div class="gros-buzz inactif">🔒</div><p class="info">Bloqué·e jusqu'à la prochaine question.</p>`;
    if (v.phase === 'ouvert') return `<button class="gros-buzz actif" data-buzz>BUZZ</button><p class="info">Question ${v.question}</p>`;
    if (v.phase === 'buzze') return `<div class="gros-buzz inactif">✋</div><p class="info"><strong>${h(v.buzzeurNom)}</strong> a buzzé…</p>`;
    return `<div class="gros-buzz inactif">⏳</div><p class="info">Écoute la question ${v.question}…</p>`;
  },

  mimes(v) {
    if (v.phase === 'attente') {
      return v.monTour
        ? `<div class="centre"><h2>C'est ton tour !</h2><p>Mets-toi face aux autres. Les mots s'afficheront ici.</p>
             <button class="btn primaire geant" data-act="commencer">Go ▶</button></div>`
        : attente(`Au tour de <strong>${h(v.joueurNom || '…')}</strong>.`, '🎭');
    }
    if (v.phase === 'tour' && v.monTour) {
      return `<div class="mimes-tour">
        <div class="ligne-haut"><span class="mode">${v.mode.icone} ${h(v.mode.libelle)}</span>${htmlChrono(v.chrono, 'petit')}</div>
        <div class="mot-a-deviner">${h(v.mot)}</div>
        <div class="boutons-tour">
          <button class="btn danger grand" data-act="passer" data-i="${v.i}" ${v.passesRestantes ? '' : 'disabled'}>↷ Passer (${v.passesRestantes})</button>
          <button class="btn succes geant" data-act="trouve" data-i="${v.i}">✓ Trouvé</button>
        </div>
        <p class="info">${v.nbTrouves} trouvé${v.nbTrouves > 1 ? 's' : ''}${v.chrono?.enPause ? ' · ⏸ en pause' : ''}</p>
      </div>`;
    }
    if (v.phase === 'tour') return attente(`<strong>${h(v.joueurNom)}</strong> fait deviner en ${h(v.mode.libelle.toLowerCase())}. Devine à voix haute !`, v.mode.icone);
    return attente(v.monTour ? `Bravo, ${v.nbTrouves} mot${v.nbTrouves > 1 ? 's' : ''} trouvé${v.nbTrouves > 1 ? 's' : ''} !` : 'Fin du tour.', '⏰');
  },
};

/* ---------- Interactions ---------- */

function envoyerAction(action, donnees = {}) {
  socket.emit('jeu:action', { action, donnees });
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  if (act === 'voter') return envoyerAction('voter', { cible: el.dataset.cible });
  if (act === 'trouve' || act === 'passer') {
    el.disabled = true;
    return envoyerAction(act, { i: Number(el.dataset.i) });
  }
  envoyerAction(act);
});

// Buzz dès l'appui (plus réactif que le clic).
app.addEventListener('pointerdown', (e) => {
  const buzz = e.target.closest('[data-buzz]');
  if (buzz) {
    e.preventDefault();
    buzz.classList.add('enfonce');
    navigator.vibrate?.(30);
    envoyerAction('buzz');
    return;
  }
  const carte = e.target.closest('[data-tenir]');
  if (carte) {
    carteTenue = true;
    carte.classList.add('visible');
  }
});

function lacherCarte() {
  if (!carteTenue) return;
  carteTenue = false;
  document.querySelector('.carte-secrete')?.classList.remove('visible');
}
['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => app.addEventListener(t, lacherCarte));
app.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-tenir]')) e.preventDefault(); });

/* ---------- Écran toujours allumé ---------- */

let verrou = null;
async function garderEcranAllume() {
  try {
    if (!verrou && 'wakeLock' in navigator) {
      verrou = await navigator.wakeLock.request('screen');
      verrou.addEventListener('release', () => { verrou = null; });
    }
  } catch { /* non supporté ou refusé */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S?.inscrit) garderEcranAllume();
});
