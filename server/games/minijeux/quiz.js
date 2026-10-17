// Mini-jeu « Le Quiz » : tout le monde joue, et c'est le mini-jeu où l'on peut gagner le plus de points.
// Une question, quatre réponses à choix, une seule bonne. Les questions sont écrites dans l'admin (Réglages du jeu) :
// un bloc par question, séparés par une ligne vide. La 1re ligne est la question, les 4 suivantes sont les réponses,
// et la bonne réponse commence par une étoile « * ».
// Classement du round : le plus de bonnes réponses, puis à égalité le plus rapide ; les points viennent des « points par place ».
export const id = 'quiz';
export const label = 'Le Quiz';

export const defaults = {
  questions: '', // voir le format ci-dessus
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
    questions.push({ question: question.slice(0, 200), reponses: reps.map(r => r.replace(/^\*/, '').trim().slice(0, 120)), bonne: bonnes[0].k });
  });
  if (!questions.length && !erreurs.length) erreurs.push('Aucune question pour le moment.');
  return { questions, erreurs };
}

export function start(ctx, g, r, sc) {
  const { questions } = parseQuestions(sc.questions);
  r.qz = { questions, k: -1, phase: null, fin: 0, debutQ: 0, reponses: [], score: {}, temps: {}, fini: false };
  for (const p of r.joueurs) { r.qz.score[p] = 0; r.qz.temps[p] = 0; }
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

function corriger(r) {
  const z = r.qz, q = z.questions[z.k];
  for (const p of r.joueurs) {
    const rep = z.reponses[z.k][p];
    if (rep && rep.choix === q.bonne) { z.score[p]++; z.temps[p] += rep.at - z.debutQ; }
  }
}

// Classement : [{ nom, score, temps }] du meilleur au moins bon.
export function classement(r) {
  return r.joueurs.map(p => ({ nom: p, score: r.qz.score[p], temps: r.qz.temps[p] }))
    .sort((a, b) => b.score - a.score || a.temps - b.temps);
}

// Places par index de joueur (chacun pour soi : index = équipe), ex æquo si même score et même temps.
function places(r) {
  const liste = classement(r), out = {};
  liste.forEach((x, i) => {
    const same = i && liste[i - 1].score === x.score && liste[i - 1].temps === x.temps;
    out[r.joueurs.indexOf(x.nom)] = same ? out[r.joueurs.indexOf(liste[i - 1].nom)] : i + 1;
  });
  return out;
}

// Appelé régulièrement. Renvoie { changed, places? } ; places quand le quiz est fini.
export function tick(ctx, g, r, sc) {
  const z = r?.qz;
  if (!z || z.fini) return { changed: false };
  const now = ctx.now();
  if (z.phase === 'question' && (now >= z.fin || r.joueurs.every(p => z.reponses[z.k][p]))) {
    corriger(r);
    z.phase = 'revelation';
    z.fin = now + clampInt(sc.tempsRevelation, 8, 2, 120) * 1000;
    return { changed: true };
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
    type: id, k: z.k, total: z.questions.length, phase: z.phase, fin: z.fin,
    question: q && z.phase !== 'fini' ? { texte: q.question, reponses: q.reponses.map((t, i) => ({ lettre: LETTRES[i], texte: t })) } : null,
    repondus: z.phase === 'question' ? Object.keys(z.reponses[z.k] || {}).length : null,
    participants: r.joueurs.length,
    classement: classement(r).map(x => ({ nom: x.nom, score: x.score, rang: places(r)[r.joueurs.indexOf(x.nom)] })),
  };
  if (revele && q) {
    v.correction = { bonne: q.bonne, lettre: LETTRES[q.bonne], compte: q.reponses.map((_, i) => Object.values(z.reponses[z.k] || {}).filter(x => x.choix === i).length) };
  }
  if (as === 'admin' && q) v.manquants = z.phase === 'question' ? r.joueurs.filter(p => !z.reponses[z.k][p]) : [];
  if (as === 'joueur' && r.joueurs.includes(nom)) {
    const rep = z.reponses[z.k]?.[nom] || null;
    Object.assign(v, { maReponse: rep ? rep.choix : null, juste: revele && rep && q ? rep.choix === q.bonne : null, score: z.score[nom] || 0 });
    if (revele && q) v.bonne = { lettre: LETTRES[q.bonne], texte: q.reponses[q.bonne] };
  }
  return v;
}

export function renommer(r, ancien, nouveau) {
  const z = r?.qz;
  if (!z) return;
  for (const obj of [z.score, z.temps]) if (ancien in obj) { obj[nouveau] = obj[ancien]; delete obj[ancien]; }
  for (const rep of z.reponses) if (rep && ancien in rep) { rep[nouveau] = rep[ancien]; delete rep[ancien]; }
}
