// Mini-jeu « Le Mime », en duos.
// Dans chaque duo, l'un mime un mot (affiché sur son téléphone) sans faire de bruit, l'autre écrit ce qu'il devine.
// Accents, majuscules et petites fautes d'orthographe ne comptent pas. Celui qui mime peut passer au mot suivant.
// Chacun mime 45 s (réglable), puis les rôles s'inversent. Le duo qui a fait trouver le plus de mots gagne.
import { shuffle } from '../../util.js';

export const id = 'mime';
export const label = 'Le Mime';

export const defaults = {
  motsMime: ['Girafe', 'Pompier', 'Brosse à dents', 'Parapluie', 'Kangourou', 'Guitare', 'Dentiste', 'Spaghetti', 'Surfeur', 'Pingouin',
    'Boxeur', 'Photographe', 'Escargot', 'Trampoline', 'Magicien', 'Hélicoptère', 'Vampire', 'Bowling', 'Ascenseur', 'Pêcheur',
    'Danseuse étoile', 'Machine à laver', 'Ski', 'Gorille', 'Chef d\'orchestre', 'Popcorn', 'Robot', 'Coiffeur', 'Statue', 'Ninja'].join('\n'),
  duos: 2,
  tempsMime: 45,
  tempsPret: 10,
};

// Le Mime se joue toujours en duos : le nombre de duos donne le format (2 duos = 2v2).
export const format = sc => Array(Math.max(1, Math.min(6, Math.round(Number(sc.duos) || 2)))).fill(2);

const clampInt = (v, d, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || d)));
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n);

export function wordsOf(sc) {
  const seen = new Set(), out = [];
  for (const line of String(sc.motsMime || '').split(/\r?\n/)) {
    const w = line.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!w || seen.has(norm(w))) continue;
    seen.add(norm(w));
    out.push(w);
  }
  return out;
}

// Comparaison tolérante : sans accents, sans majuscules, sans article au début, sans espaces ni ponctuation.
export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/^(le|la|les|l|un|une|des|du|de|d)\s+/, '').replace(/\s+/g, '');
}

// Distance d'édition (une lettre en trop, en moins, changée ou deux lettres inversées = 1).
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

// Juste si c'est le mot à une petite faute près : aucune faute sur les mots très courts, 1 jusqu'à 7 lettres, 2 au-delà.
export function correspond(essai, mot) {
  const a = norm(essai), b = norm(mot);
  if (!a || !b) return false;
  if (a === b) return true;
  const tolere = b.length <= 3 ? 0 : b.length <= 7 ? 1 : 2;
  // pluriel : « girafes » pour « girafe »
  return distance(a, b) <= tolere || distance(a.replace(/[sx]$/, ''), b.replace(/[sx]$/, '')) <= tolere;
}

// Mot suivant : jamais deux fois dans le même round, et d'abord ceux qui ont le moins servi dans la journée.
function nextMot(g, r, sc) {
  const m = r.mi;
  g.motsMimeUtilises ??= {};
  const pool = shuffle(wordsOf(sc).filter(w => !m.vus.includes(w))).sort((a, b) => (g.motsMimeUtilises[a] || 0) - (g.motsMimeUtilises[b] || 0));
  m.mot = pool[0] || null;
  m.essais = [];
  if (m.mot) { m.vus.push(m.mot); g.motsMimeUtilises[m.mot] = (g.motsMimeUtilises[m.mot] || 0) + 1; }
}

const cur = r => r.mi.tours[r.mi.tour];

function startTour(ctx, r, sc) {
  const m = r.mi;
  m.phase = 'pret';
  m.fin = ctx.now() + clampInt(sc.tempsPret, 10, 0, 120) * 1000;
  m.mot = null;
  m.essais = [];
}

export function start(ctx, g, r, sc) {
  // Ordre de passage : le premier de chaque duo mime, duo après duo, puis on inverse les rôles.
  const duos = r.equipes.map((t, i) => ({ t, i })).filter(x => x.t.length >= 2);
  const tours = [];
  for (const k of [0, 1]) for (const { t, i } of duos) tours.push({ equipe: i, mime: t[k], devine: t[1 - k] });
  r.mi = { tours, tour: 0, phase: null, fin: 0, mot: null, essais: [], vus: [], histo: [], dernier: null,
    score: Object.fromEntries(r.equipes.map((_, i) => [i, 0])) };
  if (tours.length) startTour(ctx, r, sc);
  else r.mi.phase = 'fini';
}

function finMot(ctx, r, trouve, par) {
  const m = r.mi;
  if (!m.mot) return;
  const e = { tour: m.tour, equipe: cur(r).equipe, mot: m.mot, trouve, par: par || null, at: ctx.now() };
  m.histo.push(e);
  m.dernier = e;
  if (trouve) m.score[cur(r).equipe]++;
}

function places(r) {
  const out = {};
  r.equipes.forEach((_, i) => { out[i] = 1 + r.equipes.filter((__, j) => r.mi.score[j] > r.mi.score[i]).length; });
  return out;
}

export function tick(ctx, g, r, sc) {
  const m = r.mi, now = ctx.now();
  if (!m) return { changed: false };
  if (m.phase === 'fini') return { changed: true, places: places(r) };
  if (m.phase === 'pret' && now >= m.fin) {
    m.phase = 'mime';
    m.fin = now + clampInt(sc.tempsMime, 45, 5, 600) * 1000;
    nextMot(g, r, sc);
    return { changed: true };
  }
  if (m.phase === 'mime' && (now >= m.fin || !m.mot)) {
    finMot(ctx, r, false); // le mot en cours est dévoilé : temps écoulé
    if (m.tour + 1 < m.tours.length) { m.tour++; startTour(ctx, r, sc); return { changed: true }; }
    m.phase = 'fini';
    return { changed: true, places: places(r) };
  }
  return { changed: false };
}

const ok = msg => ({ ok: true, msg });
const err = msg => ({ ok: false, msg });

export function playerAction(ctx, g, r, nom, a, sc) {
  const m = r.mi;
  if (!m?.tours.length || m.phase === 'fini') return err("Ce n'est pas le moment.");
  const c = cur(r);
  if (a.type === 'pret') {
    if (nom !== c.mime) return err("C'est à celui qui mime de lancer.");
    if (m.phase !== 'pret') return err('Déjà parti !');
    m.fin = ctx.now();
    return ok("C'est parti !");
  }
  if (a.type === 'passer') {
    if (nom !== c.mime) return err('Seul celui qui mime peut passer.');
    if (m.phase !== 'mime' || !m.mot) return err("Ce n'est pas le moment.");
    finMot(ctx, r, false);
    nextMot(g, r, sc);
    return ok(m.mot ? 'Mot suivant !' : 'Plus de mots !');
  }
  if (a.type === 'deviner') {
    if (nom !== c.devine) return err("Ce n'est pas à toi de deviner.");
    if (m.phase !== 'mime' || !m.mot) return err("Ce n'est pas le moment.");
    const t = clip(a.texte, 60);
    if (!t) return err('Écris un mot.');
    if (correspond(t, m.mot)) {
      const trouve = m.mot;
      finMot(ctx, r, true, nom);
      nextMot(g, r, sc);
      return ok(`Bravo ! C'était « ${trouve} »`);
    }
    m.essais = [...m.essais, t].slice(-6);
    return err('Non… essaie encore !');
  }
  return err('Action inconnue.');
}

export function adminAction(ctx, g, r, a) {
  if (a.type === 'suivant') {
    if (!r.mi || r.mi.phase === 'fini') return err('Rien à passer.');
    r.mi.fin = ctx.now();
    return ok('Étape suivante.');
  }
  return err('Action inconnue.');
}

// Le mot en cours n'est visible que par celui qui mime (et l'admin). Les mots finis (trouvés, passés) sont dévoilés.
export function view(ctx, g, r, as, nom) {
  const m = r.mi;
  if (!m) return null;
  const c = m.tours[m.tour] || null;
  const v = {
    type: id, phase: m.phase, fin: m.fin, tour: m.tour + 1, tours: m.tours.length,
    cur: c, score: m.score, essais: m.essais,
    histo: m.histo.filter(e => e.tour === m.tour), dernier: m.dernier,
    trouves: Object.fromEntries(r.equipes.map((_, i) => [i, m.histo.filter(e => e.equipe === i && e.trouve).map(e => e.mot)])),
  };
  if (as === 'admin' || (as === 'joueur' && c && nom === c.mime && m.phase === 'mime')) v.mot = m.mot;
  if (as === 'joueur' && c) v.role = nom === c.mime ? 'mime' : nom === c.devine ? 'devine' : null;
  return v;
}

export function renommer(r, ancien, nouveau) {
  const m = r.mi;
  if (!m) return;
  for (const t of m.tours) for (const k of ['mime', 'devine']) if (t[k] === ancien) t[k] = nouveau;
  for (const e of m.histo) if (e.par === ancien) e.par = nouveau;
}
