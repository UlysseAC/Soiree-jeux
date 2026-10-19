// Gestion des espaces : l'espace par défaut (le site de base, toujours chargé) et, si le site accueille plusieurs
// soirées (ESPACES=1), les espaces des clients : créés par le super-admin, chargés à la première connexion,
// retirés de la mémoire après 30 min sans activité (leur sauvegarde reste).
import QRCode from 'qrcode';
import { makeStorage } from './stockage.js';
import { Espace, chiffrer, verifier } from './espace.js';
import { GAMES } from './soiree.js';
import edition from './edition.js';

// Jeux d'un espace : ceux achetés par le client (au moins un), dans l'ordre habituel.
export const JEUX = Object.keys(GAMES);
const jeuxValides = jeux => { const ok = JEUX.filter(id => Array.isArray(jeux) && jeux.includes(id)); return ok.length ? ok : null; };

export const CODE_ESPACE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/; // 3 à 40 caractères : minuscules, chiffres, tirets
const QR = { margin: 1, width: 360, color: { dark: '#17110c', light: '#f0e3c8' } };

async function liensDe(joinUrl) {
  return { joinUrl, qr: await QRCode.toDataURL(joinUrl, QR), qrTest: await QRCode.toDataURL(`${joinUrl}?test`, QR) };
}

export async function creerGestion({ dataDir, env = process.env, publicUrl, io = null, adminPassword, multi = false, infos = () => ({}) }) {
  // Espace par défaut : exactement le site d'avant (même sauvegarde, mêmes adresses, même mot de passe).
  const stDefaut = makeStorage(dataDir, env);
  const defaut = new Espace({
    code: '', storage: stDefaut, saved: await stDefaut.load(), io, infos,
    motDePasse: p => p === adminPassword,
    liens: await liensDe(`${publicUrl}/jouer`),
  });

  // Registre des espaces clients : code -> { code, nom, motDePasse (chiffré), jeux, creeLe }.
  const stRegistre = makeStorage(dataDir, env, { key: `${edition.prefixe}espaces`, fichier: 'espaces.json' });
  const registre = multi ? ((await stRegistre.load()) || { espaces: {} }) : { espaces: {} };
  const ouverts = new Map([['', defaut]]);
  const chargements = new Map();

  async function ouvrir(code = '') {
    code = String(code ?? '');
    if (ouverts.has(code)) return ouverts.get(code);
    const meta = multi && registre.espaces[code];
    if (!meta) return null;
    // deux appareils qui arrivent en même temps : un seul chargement
    if (!chargements.has(code)) {
      chargements.set(code, (async () => {
        const storage = makeStorage(dataDir, env, { key: `${edition.prefixe}espace:${code}`, fichier: `espaces/${code}.json` });
        const e = new Espace({
          code, nom: meta.nom, storage, saved: await storage.load(), io, infos, jeux: meta.jeux || null,
          motDePasse: p => verifier(p, registre.espaces[code]?.motDePasse),
          liens: await liensDe(`${publicUrl}/s/${code}/jouer`),
        });
        ouverts.set(code, e);
        chargements.delete(code);
        return e;
      })());
    }
    return chargements.get(code);
  }

  // source : d'où vient l'espace (ex. la demande de réservation qui l'a fait créer), pour s'y retrouver.
  function creer({ code, nom, motDePasse, jeux, source }) {
    if (!multi) return { ok: false, msg: 'Ce site n\'accueille qu\'une soirée.' };
    code = String(code ?? '').trim().toLowerCase();
    if (!CODE_ESPACE.test(code)) return { ok: false, msg: 'Code : 3 à 40 caractères, minuscules, chiffres et tirets (ex. mariage-lea).' };
    if (registre.espaces[code]) return { ok: false, msg: 'Ce code existe déjà.' };
    if (String(motDePasse ?? '').length < 6) return { ok: false, msg: 'Mot de passe admin : 6 caractères au moins.' };
    if (jeux !== undefined && !jeuxValides(jeux)) return { ok: false, msg: 'Choisis au moins un jeu.' };
    registre.espaces[code] = { code, nom: String(nom ?? '').trim().slice(0, 60) || code, motDePasse: chiffrer(motDePasse), jeux: jeuxValides(jeux) || [...JEUX], creeLe: Date.now(), ...(source ? { source: String(source).slice(0, 80) } : {}) };
    stRegistre.save(() => registre);
    return { ok: true, msg: `Espace « ${code} » créé.`, code };
  }

  // Changer les jeux d'un client (il en achète un autre) ou son mot de passe admin.
  function modifier({ code, jeux, motDePasse, nom }) {
    const meta = registre.espaces[String(code ?? '')];
    if (!meta) return { ok: false, msg: 'Espace introuvable.' };
    if (jeux !== undefined) {
      if (!jeuxValides(jeux)) return { ok: false, msg: 'Choisis au moins un jeu.' };
      meta.jeux = jeuxValides(jeux);
      const e = ouverts.get(meta.code);
      if (e) { e.soiree.autoriser(meta.jeux); e.broadcast(); }
    }
    if (motDePasse !== undefined) {
      if (String(motDePasse).length < 6) return { ok: false, msg: 'Mot de passe admin : 6 caractères au moins.' };
      meta.motDePasse = chiffrer(motDePasse);
    }
    if (nom !== undefined) meta.nom = String(nom).trim().slice(0, 60) || meta.code;
    stRegistre.save(() => registre);
    return { ok: true, msg: `Espace « ${meta.code} » modifié.` };
  }

  const liste = () => Object.values(registre.espaces).map(({ code, nom, jeux, creeLe, source }) => {
    const e = ouverts.get(code);
    return { code, nom, jeux: jeux || [...JEUX], creeLe, source: source || null, charge: !!e, appareils: e?.sockets.size || 0, statut: e?.soiree.sess.status || null };
  });

  function tick() { for (const e of ouverts.values()) e.tick(); }
  // Rafraîchit les vues (sans sauvegarder) ; seules celles qui ont changé partent sur le réseau.
  function rafraichir() { for (const e of ouverts.values()) e.broadcast(false); }

  // Retire de la mémoire les espaces clients inactifs (jamais l'espace par défaut), après avoir sauvegardé.
  async function menage(now = Date.now()) {
    for (const [code, e] of ouverts) {
      if (!code || !e.inactif(now)) continue;
      ouverts.delete(code);
      await e.flush();
    }
  }

  async function toutSauver() {
    await Promise.all([...ouverts.values()].map(e => e.flush()));
    if (multi) await stRegistre.flush(() => registre);
  }

  return { defaut, ouvrir, creer, modifier, liste, tick, rafraichir, menage, toutSauver, ouverts, multi };
}
