// Mini-jeu « Le Quiz » : tout le monde joue, et c'est le mini-jeu où l'on peut gagner le plus de points.
// Une question, quatre réponses à choix, une seule bonne. Les questions sont écrites dans l'admin (Réglages du jeu) :
// un bloc par question, séparés par une ligne vide. La 1re ligne est la question, les 4 suivantes sont les réponses,
// et la bonne réponse commence par une étoile « * ».
// Points à chaque question, ajoutés en direct au classement des mini-jeux : le premier qui répond juste gagne 2 points,
// les autres bonnes réponses 1 point. Dernière question : 5 points au premier, 4 au 2e, 3 au 3e… (au moins 1 point).
// Classement du round : le plus de points, puis le plus de bonnes réponses, puis le plus rapide.
import { shuffle } from '../../util.js';

export const id = 'quiz';
export const pointsDirects = true; // les points sont donnés à chaque question, pas selon la place à la fin
export const label = 'Le Quiz';

export const defaults = {
  questions: '', // voir le format ci-dessus
  nombreQuestions: 0, // questions tirées au hasard dans la liste à chaque quiz (0 = toutes)
  tempsQuestion: 20, // secondes pour répondre
  tempsRevelation: 8, // secondes d'affichage de la bonne réponse
};

const LETTRES = ['A', 'B', 'C', 'D'];
const clampInt = (v, d, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || d)));

// Lit les questions écrites par l'admin. Renvoie { questions, erreurs } : erreurs = messages à afficher dans l'admin.
export function parseQuestions(texte) {
  const blocs = String(texte || '').replace(/\r/g, '').split(/\n\s*\n/).map(b => b.split('\n').map(l => l.trim()).filter(Boolean)).filter(b => b.length);
  const questions = [], erreurs = [];
  blocs.forEach((b, i) => {
    const n = i + 1;
    if (b.length !== 5) { erreurs.push(`Question ${n} : il faut une question et 4 réponses (${b.length - 1} réponse${b.length - 1 > 1 ? 's' : ''} trouvée${b.length - 1 > 1 ? 's' : ''}).`); return; }
    const [question, ...reps] = b;
    const bonnes = reps.map((r, k) => ({ k, bonne: r.startsWith('*') })).filter(x => x.bonne);
    if (bonnes.length !== 1) { erreurs.push(`Question ${n} : il faut exactement une bonne réponse marquée d'une étoile « * ».`); return; }
    // une question écrite deux fois n'est gardée qu'une fois
    if (questions.some(q => q.question.toLocaleLowerCase('fr') === question.slice(0, 200).toLocaleLowerCase('fr'))) return;
    questions.push({ question: question.slice(0, 200), reponses: reps.map(r => r.replace(/^\*/, '').trim().slice(0, 120)), bonne: bonnes[0].k });
  });
  if (!questions.length && !erreurs.length) erreurs.push('Aucune question pour le moment.');
  return { questions, erreurs };
}

export function start(ctx, g, r, sc) {
  // ordre aléatoire, chaque question une seule fois ; on n'en garde que le nombre réglé (0 = toutes)
  const n = Math.round(Number(sc.nombreQuestions)) || 0;
  const tirees = shuffle(parseQuestions(sc.questions).questions);
  const questions = n > 0 ? tirees.slice(0, n) : tirees;
  r.qz = { questions, k: -1, phase: null, fin: 0, debutQ: 0, reponses: [], score: {}, temps: {}, points: {}, gains: [], fini: false };
  for (const p of r.joueurs) { r.qz.score[p] = 0; r.qz.temps[p] = 0; r.qz.points[p] = 0; }
  if (!questions.length) r.qz.fini = true; else nextQuestion(ctx, r, sc);
}

function nextQuestion(ctx, r, sc) {
  const z = r.qz;
  z.k++;
  if (z.k >= z.questions.length) { z.phase = 'fini'; z.fini = true; return; }
  z.reponses[z.k] = {};
  z.phase = 'question';
  z.debutQ = ctx.now();
  z.fin = z.debutQ + clampInt(sc.tempsQuestion, 20, 5, 300) * 1000;
}

// Points d'une bonne réponse selon son rang (0 = le plus rapide).
export function pointsDe(rang, derniere) {
  return derniere ? Math.max(1, 5 - rang) : rang === 0 ? 2 : 1;
}

// Corrige la question en cours. Renvoie les points gagnés : { nom: points }.
function corriger(r) {
  const z = r.qz, q = z.questions[z.k], derniere = z.k === z.questions.length - 1;
  const justes = r.joueurs.map(p => ({ p, rep: z.reponses[z.k][p] })).filter(x => x.rep && x.rep.choix === q.bonne).sort((a, b) => a.rep.at - b.rep.at);
  const gains = {};
  justes.forEach(({ p, rep }, rang) => {
    z.score[p]++;
    z.temps[p] += rep.at - z.debutQ;
    gains[p] = pointsDe(rang, derniere);
    z.points[p] = (z.points[p] || 0) + gains[p];
  });
  z.gains[z.k] = gains;
  return gains;
}

// Classement : [{ nom, points, score, temps }] du meilleur au moins bon.
export function classement(r) {
  const z = r.qz;
  return r.joueurs.map(p => ({ nom: p, points: z.points[p] || 0, score: z.score[p] || 0, temps: z.temps[p] || 0 }))
    .sort((a, b) => b.points - a.points || b.score - a.score || a.temps - b.temps);
}

// Places par index de joueur (chacun pour soi : index = équipe), ex æquo si mêmes points, bonnes réponses et temps.
function places(r) {
  const liste = classement(r), out = {};
  liste.forEach((x, i) => {
    const y = liste[i - 1], same = i && y.points === x.points && y.score === x.score && y.temps === x.temps;
    out[r.joueurs.indexOf(x.nom)] = same ? out[r.joueurs.indexOf(liste[i - 1].nom)] : i + 1;
  });
  return out;
}

// Appelé régulièrement. Renvoie { changed, points?, places? } : points à chaque correction, places quand le quiz est fini.
export function tick(ctx, g, r, sc) {
  const z = r?.qz;
  if (!z || z.fini) return { changed: false };
  const now = ctx.now();
  if (z.phase === 'question' && (now >= z.fin || r.joueurs.every(p => z.reponses[z.k][p]))) {
    const points = corriger(r);
    z.phase = 'revelation';
    z.fin = now + clampInt(sc.tempsRevelation, 8, 2, 120) * 1000;
    return { changed: true, points };
  }
  if (z.phase === 'revelation' && now >= z.fin) {
    nextQuestion(ctx, r, sc);
    return { changed: true, places: z.fini ? places(r) : undefined };
  }
  return { changed: false };
}

const ok = msg => ({ ok: true, msg });
const err = msg => ({ ok: false, msg });

export function playerAction(ctx, g, r, nom, a) {
  const z = r.qz;
  if (!z || z.phase !== 'question') return err("Ce n'est pas le moment de répondre.");
  if (!r.joueurs.includes(nom)) return err('Tu ne joues pas ce round.');
  if (a.type !== 'repondre') return err('Action inconnue.');
  if (z.reponses[z.k][nom]) return err('Tu as déjà répondu.');
  const choix = Number(a.choix);
  if (!Number.isInteger(choix) || choix < 0 || choix > 3) return err('Choisis une réponse.');
  z.reponses[z.k][nom] = { choix, at: ctx.now() };
  return ok('Réponse envoyée !');
}

export function adminAction(ctx, g, r, a) {
  if (a.type === 'suivant') {
    if (!r.qz || r.qz.fini) return err('Rien à passer.');
    r.qz.fin = ctx.now();
    return ok('Étape suivante.');
  }
  return err('Action inconnue.');
}

// Ce que chacun voit. Pendant la question, personne ne voit la bonne réponse ; la correction arrive ensuite.
export function view(ctx, g, r, as, nom) {
  const z = r.qz;
  if (!z) return null;
  const q = z.questions[z.k] || null, revele = z.phase === 'revelation' || z.phase === 'fini';
  const v = {
    type: id, k: z.k, total: z.questions.length, phase: z.phase, fin: z.fin, derniere: z.k === z.questions.length - 1,
    question: q && z.phase !== 'fini' ? { texte: q.question, reponses: q.reponses.map((t, i) => ({ lettre: LETTRES[i], texte: t })) } : null,
    repondus: z.phase === 'question' ? Object.keys(z.reponses[z.k] || {}).length : null,
    participants: r.joueurs.length,
    classement: classement(r).map(x => ({ nom: x.nom, points: x.points, score: x.score, rang: places(r)[r.joueurs.indexOf(x.nom)] })),
  };
  if (revele && q) {
    v.correction = { bonne: q.bonne, lettre: LETTRES[q.bonne], compte: q.reponses.map((_, i) => Object.values(z.reponses[z.k] || {}).filter(x => x.choix === i).length),
      gains: Object.entries(z.gains[z.k] || {}).map(([nom, points]) => ({ nom, points })).sort((a, b) => b.points - a.points) };
  }
  if (as === 'admin' && q) v.manquants = z.phase === 'question' ? r.joueurs.filter(p => !z.reponses[z.k][p]) : [];
  if (as === 'joueur' && r.joueurs.includes(nom)) {
    const rep = z.reponses[z.k]?.[nom] || null;
    Object.assign(v, { maReponse: rep ? rep.choix : null, juste: revele && rep && q ? rep.choix === q.bonne : null, score: z.score[nom] || 0,
      points: z.points[nom] || 0, gain: revele ? z.gains[z.k]?.[nom] || 0 : null });
    if (revele && q) v.bonne = { lettre: LETTRES[q.bonne], texte: q.reponses[q.bonne] };
  }
  return v;
}

// Un joueur remplacé : ses points déjà gagnés restent à lui dans le classement des mini-jeux ; le remplaçant repart de zéro.
export function renommer(r, ancien, nouveau) {
  const z = r?.qz;
  if (!z) return;
  for (const obj of [z.score, z.temps, z.points]) { delete obj[ancien]; obj[nouveau] = 0; }
  const cur = z.reponses[z.k];
  if (cur) delete cur[ancien];
}
