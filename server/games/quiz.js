// Jeu « Le Quiz » : le jeu final, tout le monde joue.
// Une question, quatre réponses à choix, une seule bonne réponse. Les questions sont écrites dans l'admin (onglet Réglages du jeu) :
// un bloc par question, séparés par une ligne vide. La première ligne est la question, les quatre suivantes sont les réponses,
// et la bonne réponse commence par une étoile « * ».
// Classement : le nombre de bonnes réponses ; à égalité, celui qui a répondu juste le plus vite passe devant.

export const id = 'quiz';
export const name = 'Le Quiz';
export const minPlayers = 1;

export function defaultConfig() {
  return {
    questions: '', // voir le format ci-dessus
    tempsQuestion: 20, // secondes pour répondre
    tempsRevelation: 8, // secondes d'affichage de la bonne réponse
  };
}

const LETTRES = ['A', 'B', 'C', 'D'];

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

const clampInt = (v, d, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || d)));

export function start(ctx, pids) {
  const cfg = ctx.cfg, { questions } = parseQuestions(cfg.questions);
  const now = ctx.now();
  const g = {
    questions, pids: pids.slice(), k: -1, phase: 'attente', fin: 0,
    score: Object.fromEntries(pids.map(p => [p, 0])), temps: Object.fromEntries(pids.map(p => [p, 0])),
    reponses: [], // reponses[k][pid] = { choix, at }
    finished: false, debut: now,
  };
  nextQuestion(ctx, g);
  return g;
}

function nextQuestion(ctx, g) {
  g.k++;
  if (g.k >= g.questions.length) { g.phase = 'fini'; g.finished = true; return; }
  g.reponses[g.k] = {};
  g.phase = 'question';
  g.debutQ = ctx.now();
  g.fin = ctx.now() + clampInt(ctx.cfg.tempsQuestion, 20, 5, 300) * 1000;
  ctx.sfx?.('annonce');
}

// Correction d'une question : points et temps pour chaque joueur qui a répondu juste.
function corriger(ctx, g) {
  const q = g.questions[g.k];
  for (const p of g.pids) {
    const rep = g.reponses[g.k][p];
    if (rep && rep.choix === q.bonne) { g.score[p]++; g.temps[p] += rep.at - g.debutQ; }
  }
}

export function tick(ctx, g) {
  if (!g || g.finished) return false;
  const now = ctx.now();
  if (g.phase === 'attente') { nextQuestion(ctx, g); return true; }
  if (g.phase === 'question' && (now >= g.fin || g.pids.every(p => g.reponses[g.k][p]))) {
    corriger(ctx, g);
    g.phase = 'revelation';
    g.fin = now + clampInt(ctx.cfg.tempsRevelation, 8, 2, 120) * 1000;
    return true;
  }
  if (g.phase === 'revelation' && now >= g.fin) { nextQuestion(ctx, g); return true; }
  return false;
}

const ok = msg => ({ ok: true, msg });
const err = msg => ({ ok: false, msg });

export function playerAction(ctx, g, p, a) {
  if (!g || g.phase !== 'question') return err("Ce n'est pas le moment de répondre.");
  if (!g.pids.includes(p)) return err('Tu ne participes pas au quiz.');
  if (a.type !== 'repondre') return err('Action inconnue.');
  if (g.reponses[g.k][p]) return err('Tu as déjà répondu.');
  const choix = Number(a.choix);
  if (!Number.isInteger(choix) || choix < 0 || choix > 3) return err('Choisis une réponse.');
  g.reponses[g.k][p] = { choix, at: ctx.now() };
  return ok('Réponse envoyée !');
}

export function adminAction(ctx, g, a) {
  if (a.type === 'suivant') {
    if (!g || g.finished) return err('Rien à passer.');
    // question → correction ; correction → question suivante (ou fin)
    if (g.phase === 'question') g.fin = ctx.now();
    else if (g.phase === 'revelation') g.fin = ctx.now();
    return ok('Étape suivante.');
  }
  return err('Action inconnue.');
}

// Classement : bonnes réponses, puis temps total des bonnes réponses (le plus rapide devant).
export function classement(g) {
  return g.pids.map(p => ({ pid: p, score: g.score[p], temps: g.temps[p] }))
    .sort((a, b) => b.score - a.score || a.temps - b.temps);
}

function rangs(g) {
  const out = {}, liste = classement(g);
  liste.forEach((x, i) => { out[x.pid] = i && liste[i - 1].score === x.score && liste[i - 1].temps === x.temps ? out[liste[i - 1].pid] : i + 1; });
  return out;
}

// Ce que l'écran affiche : la question et les réponses (sans la bonne réponse avant la correction), puis la correction.
export function screenView(ctx, g) {
  if (!g) return null;
  const q = g.questions[g.k] || null, revele = g.phase === 'revelation' || g.phase === 'fini';
  const v = {
    phase: g.phase, k: g.k, total: g.questions.length, fin: g.fin, finished: g.finished,
    question: q ? { texte: q.question, reponses: q.reponses.map((t, i) => ({ lettre: LETTRES[i], texte: t })) } : null,
    repondus: g.phase === 'question' ? Object.keys(g.reponses[g.k] || {}).length : null,
    participants: g.pids.length,
    classement: classement(g).slice(0, 10).map(x => ({ pid: x.pid, name: ctx.name(x.pid), score: x.score, rang: rangs(g)[x.pid] })),
  };
  if (revele && q) {
    const compte = q.reponses.map((_, i) => Object.values(g.reponses[g.k] || {}).filter(r => r.choix === i).length);
    v.correction = { bonne: q.bonne, lettre: LETTRES[q.bonne], compte };
  }
  return v;
}

export function playerView(ctx, g, p) {
  if (!g || !g.pids.includes(p)) return { spectator: true, finished: g?.finished ?? false, phase: g?.phase ?? null, fin: g?.fin ?? 0 };
  const q = g.questions[g.k] || null, rep = g.reponses[g.k]?.[p] || null, revele = g.phase === 'revelation' || g.phase === 'fini';
  return {
    phase: g.phase, k: g.k, total: g.questions.length, fin: g.fin, finished: g.finished,
    question: q && g.phase !== 'fini' ? { texte: q.question, reponses: q.reponses.map((t, i) => ({ lettre: LETTRES[i], texte: t })) } : null,
    maReponse: rep ? rep.choix : null,
    juste: revele && rep ? rep.choix === q?.bonne : null,
    bonne: revele && q ? { lettre: LETTRES[q.bonne], texte: q.reponses[q.bonne] } : null,
    score: g.score[p], rang: rangs(g)[p],
    participants: g.pids.length,
  };
}

export function adminView(ctx, g) {
  if (!g) return null;
  const q = g.questions[g.k] || null;
  return {
    ...screenView(ctx, g),
    questions: g.questions.map((x, i) => ({ n: i + 1, texte: x.question, bonne: LETTRES[x.bonne] })),
    bonne: q ? LETTRES[q.bonne] : null,
    manquants: g.phase === 'question' ? g.pids.filter(p => !g.reponses[g.k][p]).map(p => ctx.name(p)) : [],
  };
}

export function results(ctx, g) {
  if (!g) return [];
  return g.pids.map(p => ({ pid: p, name: ctx.name(p), score: g.score[p], temps: g.temps[p], won: rangs(g)[p] === 1 }));
}
