/* Petits outils partagés entre l'écran et la manette. */

/** Échappe du texte pour l'insérer dans du HTML. */
function h(texte) {
  return String(texte ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDuree(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Moment où le dernier état a été reçu : sert de référence aux chronos. */
let recuA = Date.now();

/** Le chrono passe au rouge sur les 10 dernières secondes (ou le dernier tiers si c'est court). */
function seuilUrgence(total) {
  return Math.min(10000, (total || 0) / 3);
}

/** Un chrono envoyé par le serveur ({ reste, total, enPause }) → HTML qui se met à jour seul. */
function htmlChrono(chrono, classe = '') {
  if (!chrono) return '';
  const fin = recuA + chrono.reste;
  const seuil = seuilUrgence(chrono.total);
  return `<span class="chrono ${classe} ${chrono.enPause ? 'en-pause' : ''} ${chrono.reste <= seuil ? 'urgent' : ''}"
    data-fin="${fin}" data-seuil="${seuil}" data-pause="${chrono.enPause ? 1 : 0}">${formatDuree(chrono.reste)}</span>`;
}

setInterval(() => {
  document.querySelectorAll('.chrono').forEach((el) => {
    if (el.dataset.pause === '1') return;
    const reste = Math.max(0, Number(el.dataset.fin) - Date.now());
    el.textContent = formatDuree(reste);
    el.classList.toggle('urgent', reste <= Number(el.dataset.seuil));
  });
}, 200);

function pastille(joueur, suffixe = '') {
  return `<span class="pastille ${joueur.connecte === false ? 'deconnecte' : ''}" style="--c:${h(joueur.couleur)}">
    <i></i>${h(joueur.nom)}${suffixe ? `<b>${suffixe}</b>` : ''}</span>`;
}

function surveillerConnexion(socket) {
  const bandeau = document.getElementById('hors-ligne');
  socket.on('connect', () => { bandeau.hidden = true; });
  socket.on('disconnect', () => { bandeau.hidden = false; });
}
