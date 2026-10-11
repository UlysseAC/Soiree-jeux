'use strict';
/**
 * Simulation d'une soirée complète : un écran + 4 téléphones virtuels.
 * Lancer avec `npm test` (démarre un serveur temporaire sur le port 3999).
 */
process.env.PORT = process.env.PORT || '3999';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { io } = require('socket.io-client');

const CONFIG = path.join(__dirname, '..', 'data', 'config.json');
const sauvegardeConfig = fs.existsSync(CONFIG) ? fs.readFileSync(CONFIG) : null;
const { demarrer, server } = require('../server');
const URL = `http://localhost:${process.env.PORT}`;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function client(role) {
  const s = io(URL, { query: role ? { role } : {}, forceNew: true });
  s.etat = null;
  s.on('etat', (e) => { s.etat = e; });
  return s;
}

async function attendre(condition, message, delai = 3000) {
  const debut = Date.now();
  while (Date.now() - debut < delai) {
    if (condition()) return;
    await pause(20);
  }
  throw new Error(`Délai dépassé : ${message}`);
}

(async () => {
  await demarrer();
  await pause(200);

  const ecran = client('ecran');
  await attendre(() => ecran.etat, 'état écran');
  assert.strictEqual(ecran.etat.phase, 'preparation');

  // --- Préparation : réglages + programme ---
  ecran.emit('reglage', { jeuId: 'imposteur', cle: 'dureeDiscussion', valeur: 31 }); // arrondi au pas de 15 → 30
  ecran.emit('reglage', { jeuId: 'buzzer', cle: 'pointsBonne', valeur: 3 });
  ecran.emit('reglage', { jeuId: 'buzzer', cle: 'pointsBonne', valeur: 999 }); // borné à 10
  ecran.emit('reglage', { jeuId: 'mimes', cle: 'mode', valeur: 'nimportequoi' }); // invalide → défaut
  ecran.emit('programme', ['mimes', 'imposteur', 'buzzer', 'inconnu']);
  await attendre(() => ecran.etat.programme[0] === 'mimes' && ecran.etat.reglages.buzzer.pointsBonne === 10, 'programme');
  assert.deepStrictEqual(ecran.etat.programme, ['mimes', 'imposteur', 'buzzer']);
  assert.strictEqual(ecran.etat.reglages.imposteur.dureeDiscussion, 30);
  assert.strictEqual(ecran.etat.reglages.buzzer.pointsBonne, 10);
  assert.strictEqual(ecran.etat.reglages.mimes.mode, 'aleatoire');
  ecran.emit('reglage', { jeuId: 'buzzer', cle: 'pointsBonne', valeur: 2 });

  // --- Joueurs ---
  const noms = ['Alice', 'Bruno', 'Chloé', 'David'];
  const tels = noms.map(() => client());
  const ids = [];
  for (const [i, t] of tels.entries()) {
    const rep = await new Promise((r) => t.emit('rejoindre', { nom: noms[i] }, r));
    assert.ok(rep.id, `inscription ${noms[i]}`);
    ids.push(rep.id);
  }
  const doublon = await new Promise((r) => client().emit('rejoindre', { nom: 'alice' }, r));
  assert.ok(doublon.erreur, 'prénom déjà pris refusé');
  await attendre(() => ecran.etat.joueurs.filter((j) => j.connecte).length === 4, '4 joueurs');

  // --- Soirée ---
  ecran.emit('soiree:demarrer');
  await attendre(() => ecran.etat.phase === 'soiree' && ecran.etat.courant === -1, 'soirée démarrée');

  // 1) Mimes
  ecran.emit('soiree:aller', 0);
  await attendre(() => ecran.etat.jeu?.id === 'mimes', 'mimes lancé');
  const quiJoue = ecran.etat.jeu.vue.prochain.nom;
  const telMime = tels[noms.indexOf(quiJoue)];
  await attendre(() => telMime.etat?.jeu?.vue?.monTour, 'tour du mime');
  telMime.emit('jeu:action', { action: 'commencer' });
  await attendre(() => telMime.etat.jeu.vue.phase === 'tour', 'tour démarré');
  const autre = tels.find((t) => t !== telMime);
  await attendre(() => autre.etat.jeu.vue.phase === 'tour', 'les autres voient le tour');
  assert.strictEqual(autre.etat.jeu.vue.mot, undefined, 'les autres ne voient pas le mot');
  assert.strictEqual(JSON.stringify(ecran.etat.jeu.vue).includes(telMime.etat.jeu.vue.mot), false, "l'écran ne montre pas le mot");
  telMime.emit('jeu:action', { action: 'trouve', donnees: { i: 0 } });
  telMime.emit('jeu:action', { action: 'trouve', donnees: { i: 0 } }); // double appui ignoré
  await attendre(() => telMime.etat.jeu.vue.i === 1, 'mot suivant');
  telMime.emit('jeu:action', { action: 'passer', donnees: { i: 1 } });
  await attendre(() => telMime.etat.jeu.vue.i === 2, 'mot passé');
  ecran.emit('jeu:action', { action: 'arreter' });
  await attendre(() => ecran.etat.jeu.vue.phase === 'fin', 'fin du tour');
  assert.strictEqual(ecran.etat.jeu.vue.nbTrouves, 1);
  assert.strictEqual(ecran.etat.joueurs.find((j) => j.nom === quiJoue).score, 1);

  // Réglage modifié en pleine soirée : pris en compte au tour suivant
  ecran.emit('reglage', { jeuId: 'mimes', cle: 'passes', valeur: 0 });
  ecran.emit('jeu:action', { action: 'suivant' });
  await attendre(() => ecran.etat.jeu.vue.phase === 'attente' && ecran.etat.reglages.mimes.passes === 0, 'joueur suivant');
  ecran.emit('jeu:action', { action: 'commencer' });
  await attendre(() => ecran.etat.jeu.vue.phase === 'tour', 'tour 2');
  assert.strictEqual(ecran.etat.jeu.vue.passesRestantes, 0, 'nouveau réglage appliqué');

  // 2) Imposteur
  ecran.emit('soiree:aller', 1);
  await attendre(() => ecran.etat.jeu?.id === 'imposteur', 'imposteur lancé');
  ecran.emit('jeu:action', { action: 'distribuer' });
  await attendre(() => tels.every((t) => t.etat.jeu?.vue?.phase === 'revelation'), 'révélation');
  const imposteurs = tels.filter((t) => t.etat.jeu.vue.role.imposteur);
  assert.strictEqual(imposteurs.length, 1, 'un imposteur');
  const motsCivils = new Set(tels.filter((t) => !t.etat.jeu.vue.role.imposteur).map((t) => t.etat.jeu.vue.role.mot));
  assert.strictEqual(motsCivils.size, 1, 'les civils ont le même mot');
  tels.forEach((t) => t.emit('jeu:action', { action: 'vu' }));
  await attendre(() => ecran.etat.jeu.vue.phase === 'discussion', 'discussion auto');
  assert.ok(ecran.etat.jeu.vue.chrono.reste <= 30000);
  ecran.emit('jeu:action', { action: 'pause' });
  await attendre(() => ecran.etat.jeu.vue.chrono?.enPause, 'pause');
  ecran.emit('jeu:action', { action: 'vote' });
  await attendre(() => ecran.etat.jeu.vue.phase === 'vote', 'vote');
  const idImposteur = ids[tels.indexOf(imposteurs[0])];
  tels.forEach((t, i) => {
    const cible = ids[i] === idImposteur ? ids.find((x) => x !== idImposteur) : idImposteur;
    t.emit('jeu:action', { action: 'voter', donnees: { cible } });
  });
  await attendre(() => ecran.etat.jeu.vue.phase === 'resultat', 'résultat auto');
  assert.strictEqual(ecran.etat.jeu.vue.resultat.gagnants, 'civils');
  await attendre(() => tels.every((t) => t.etat.jeu.vue.resultat), 'résultat manettes');
  assert.ok(tels.filter((t) => t !== imposteurs[0]).every((t) => t.etat.jeu.vue.resultat.gagne));

  // 3) Buzzer
  ecran.emit('soiree:aller', 2);
  await attendre(() => ecran.etat.jeu?.id === 'buzzer', 'buzzer lancé');
  tels[0].emit('jeu:action', { action: 'buzz' }); // fermé : ignoré
  ecran.emit('jeu:action', { action: 'ouvrir' });
  await attendre(() => tels[1].etat.jeu.vue.phase === 'ouvert', 'buzzers ouverts');
  tels[1].emit('jeu:action', { action: 'buzz' });
  tels[2].emit('jeu:action', { action: 'buzz' });
  await attendre(() => ecran.etat.jeu.vue.phase === 'buzze', 'buzz');
  assert.strictEqual(ecran.etat.jeu.vue.buzzeur.nom, 'Bruno', 'le premier gagne');
  ecran.emit('jeu:action', { action: 'faux' });
  await attendre(() => ecran.etat.jeu.vue.phase === 'ouvert', 'réouvert');
  assert.deepStrictEqual(ecran.etat.jeu.vue.exclus, ['Bruno']);
  tels[1].emit('jeu:action', { action: 'buzz' }); // bloqué
  tels[2].emit('jeu:action', { action: 'buzz' });
  await attendre(() => ecran.etat.jeu.vue.buzzeur?.nom === 'Chloé', 'Chloé buzze');
  const avant = ecran.etat.joueurs.find((j) => j.nom === 'Chloé').score;
  ecran.emit('jeu:action', { action: 'correct' });
  await attendre(() => ecran.etat.jeu.vue.phase === 'ferme', 'question suivante');
  assert.strictEqual(ecran.etat.joueurs.find((j) => j.nom === 'Chloé').score, avant + 2);

  // --- Programme modifié en pleine soirée ---
  ecran.emit('programme', ['buzzer', 'mimes']);
  await attendre(() => ecran.etat.programme[0] === 'buzzer', 'programme modifié');
  assert.strictEqual(ecran.etat.courant, 0, 'le jeu en cours garde sa place');
  ecran.emit('programme', ['mimes']);
  await attendre(() => ecran.etat.programme.length === 1, 'jeu en cours retiré');
  assert.strictEqual(ecran.etat.jeu, null);
  assert.strictEqual(ecran.etat.courant, -1);

  // --- Reconnexion d'un téléphone ---
  tels[3].disconnect();
  await attendre(() => ecran.etat.joueurs.find((j) => j.nom === 'David').connecte === false, 'déconnexion');
  const retour = client();
  const rep = await new Promise((r) => retour.emit('rejoindre', { id: ids[3], nom: 'David' }, r));
  assert.strictEqual(rep.id, ids[3]);
  await attendre(() => ecran.etat.joueurs.find((j) => j.nom === 'David').connecte, 'reconnexion');

  // --- Fin ---
  ecran.emit('soiree:terminer');
  await attendre(() => ecran.etat.phase === 'fin', 'fin');
  await attendre(() => retour.etat?.phase === 'fin', 'fin manette');

  // Persistance des réglages
  await pause(400);
  const enregistre = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  assert.strictEqual(enregistre.reglages.buzzer.pointsBonne, 2);

  console.log('✅ Simulation complète réussie');
  if (sauvegardeConfig) fs.writeFileSync(CONFIG, sauvegardeConfig);
  else fs.rmSync(CONFIG, { force: true });
  [ecran, ...tels, retour].forEach((s) => s.disconnect());
  server.close();
  process.exit(0);
})().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
