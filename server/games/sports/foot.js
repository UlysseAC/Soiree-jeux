// Match de foot 5 contre 5 : simulation enregistrée, rejouée par l'écran public.
import { makeRng } from './rng.js';

export const FIELD = { w: 1160, h: 520 };
const GY0 = FIELD.h / 2 - 38, GY1 = FIELD.h / 2 + 38;
const FORM = [[.04, .5], [.24, .3], [.24, .7], [.42, .38], [.45, .62]];
const DT = 0.02, FPS = 10;

// equipes : [{ nom, couleur, bord, joueurs: [{ nom, attaque, defense }] × 5 (le 1er est le gardien) }]
export function simulate({ equipes, duree }, seed, record = true) {
  const rng = makeRng(seed);
  const rnd = rng.range;
  const F = FIELD;
  const DUR = duree;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const goalX = ti => (ti ? 0 : F.w);
  const ownGoalX = ti => (ti ? F.w : 0);
  const fwd = ti => (ti ? -1 : 1);

  const players = [];
  equipes.forEach((T, ti) => T.joueurs.forEach((j, i) => {
    const [fx, fy] = FORM[i];
    const hx = (ti ? 1 - fx : fx) * F.w, hy = fy * F.h;
    players.push({ ti, i, n: j.nom, att: j.attaque, def: j.defense, hx, hy, x: hx, y: hy, vx: 0, vy: 0, stun: 0, slide: 0, sx: 0, sy: 0, cel: 0 });
  }));
  const S = {
    t: 0, players, ball: { x: F.w / 2, y: F.h / 2, z: 0, vx: 0, vy: 0, vz: 0, mode: 'dead', owner: null, to: null, out: null, kicker: null },
    score: [0, 0], shots: [0, 0], flash: null, pause: 0, decide: 0, duel: 0, last: 0, clock0: null, ko: null, goals: [], sp: null,
  };
  const frames = [], events = [];
  const ev = (type, data = {}) => { if (record) events.push({ t: Math.round(S.t * 100) / 100, type, ...data }); };
  const say = text => ev('say', { text });
  const pop = (text, x, y, c = '#f2c14e') => ev('pop', { text, x: Math.round(x), y: Math.round(y), c });
  const minute = () => (S.clock0 == null ? 0 : Math.min(90, Math.floor((S.t - S.clock0) / (DUR - S.clock0) * 90)));

  function give(p) { const b = S.ball; b.mode = 'owned'; b.owner = p; b.to = null; b.z = 0; b.vz = 0; S.last = p.ti; S.decide = rnd(.5, 1.2); S.duel = .35; }
  const mates = p => players.filter(q => q.ti === p.ti && q !== p);
  const opps = p => players.filter(q => q.ti !== p.ti);
  const nearestOpp = p => opps(p).filter(q => q.i > 0).sort((a, b) => dist(a, p) - dist(b, p))[0];

  // Coup d'envoi : chacun dans sa moitié, l'adversaire hors du rond central, décompte puis première passe.
  function kickoff(ti, instant) {
    const half = F.w / 2, spots = new Map();
    players.forEach(p => {
      let x = p.ti === 0 ? Math.min(p.hx, half - 16) : Math.max(p.hx, half + 16), y = p.hy;
      if (p.ti !== ti) { const dx = x - half, dy = y - F.h / 2, d = Math.hypot(dx, dy); if (d < 90) { x = half + (dx / d) * 90; y = F.h / 2 + (dy / d) * 90; } }
      spots.set(p, { x, y });
    });
    const k = players.find(p => p.ti === ti && p.i === 4), m = players.find(p => p.ti === ti && p.i === 3);
    spots.set(k, { x: half - fwd(ti) * 12, y: F.h / 2 });
    spots.set(m, { x: half - fwd(ti) * 70, y: F.h / 2 + 55 });
    players.forEach(p => { p.stun = p.slide = p.cel = 0; p.vx = p.vy = 0; p.run = null; p.dive = null; if (instant) { const q = spots.get(p); p.x = q.x; p.y = q.y; } });
    Object.assign(S.ball, { x: half, y: F.h / 2, z: 0, vx: 0, vy: 0, vz: 0, mode: 'dead', owner: null, to: null });
    S.ko = { ti, k, m, spots, until: S.t + 3.2 };
    ev('ko', { until: Math.round(S.ko.until * 100) / 100, first: S.clock0 == null });
  }

  function kick(from, tx, ty, speed, lob, mode) {
    const b = S.ball, dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1;
    b.mode = mode; b.owner = null; b.kicker = from; b.vx = dx / d * speed; b.vy = dy / d * speed; b.vz = lob ? Math.min(260, d * .55) : 0; S.last = from.ti;
  }
  // Un adversaire est-il sur la trajectoire de la passe ?
  function blocked(p, q) {
    const dx = q.x - p.x, dy = q.y - p.y, L = dx * dx + dy * dy || 1;
    return opps(p).some(o => {
      const k = Math.max(0, Math.min(1, ((o.x - p.x) * dx + (o.y - p.y) * dy) / L));
      return Math.hypot(p.x + dx * k - o.x, p.y + dy * k - o.y) < 20;
    });
  }
  // Passe : on cherche d'abord un coéquipier démarqué devant. Sans solution vers l'avant
  // et sans pression, le porteur préfère avancer balle au pied (renvoie false).
  function pass(p, forced) {
    const b = S.ball;
    const best = mates(p).filter(x => x.i > 0).map(x => {
      const ahead = (x.x - p.x) * fwd(p.ti);
      const open = Math.min(...opps(p).map(o => dist(o, x)));
      const score = ahead * 1.3 + Math.min(open, 140) * .6 - (blocked(p, x) ? 160 : 0) - (ahead < -30 ? 90 : 0) + rnd(0, 40);
      return { q: x, score, ahead };
    }).sort((a, c) => c.score - a.score)[0];
    if (!forced && (best.score < 40 || best.ahead < 10)) return false;
    const q = best.q;
    const through = best.ahead > 0 && rng() < .45 && (goalX(p.ti) - q.x) * fwd(p.ti) > 120;
    const tx = Math.max(20, Math.min(F.w - 20, q.x + (through ? fwd(p.ti) * 90 : 0))), ty = Math.max(20, Math.min(F.h - 20, q.y + (through ? rnd(-30, 30) : 0)));
    const long = dist(p, { x: tx, y: ty }) > 380;
    q.run = { x: tx, y: ty, until: S.t + 1.5 };
    kick(p, tx, ty, long ? 470 : 560, long, 'pass');
    b.to = q;
    say(through ? `${p.n} lance ${q.n} en profondeur !` : long ? `Long ballon de ${p.n} vers ${q.n}` : `${p.n} pour ${q.n}`);
    return true;
  }
  function shoot(p, header) {
    const keeper = players.find(q => q.ti !== p.ti && q.i === 0);
    const dGoal = Math.hypot(goalX(p.ti) - p.x, F.h / 2 - p.y);
    const q = p.att * (1 - dGoal / 700);
    const r = rng();
    const out = r < .1 + q * .3 ? 'but' : r < .62 ? 'arret' : r < .7 ? 'poteau' : 'cadre';
    const tx = goalX(p.ti);
    const ty = out === 'cadre' ? (rng() < .5 ? GY0 - rnd(20, 70) : GY1 + rnd(20, 70)) : out === 'poteau' ? (rng() < .5 ? GY0 : GY1) : rnd(GY0 + 8, GY1 - 8);
    kick(p, tx, ty, 820, header, 'shot');
    S.ball.out = out; S.ball.keeper = keeper; S.shots[p.ti]++;
    keeper.dive = { y: out === 'arret' ? ty : ty + (ty < F.h / 2 ? 40 : -40) * (rng() < .5 ? 1 : -1), t: S.t };
    ev('shot', { ti: p.ti });
    say(header ? `Tête de ${p.n} !` : `Frappe de ${p.n} !`);
  }
  // Coup de pied arrêté : le tireur va au point de reprise, les autres se replacent, puis il joue.
  function setPiece(type, ti, x, y) {
    const cands = players.filter(q => q.ti === ti && (type === 'six' ? q.i === 0 : q.i > 0));
    const taker = cands.sort((a, c) => dist(a, { x, y }) - dist(c, { x, y }))[0];
    players.forEach(p => { p.stun = 0; p.slide = 0; p.run = null; });
    Object.assign(S.ball, { x, y, z: 0, vx: 0, vy: 0, vz: 0, mode: 'dead', owner: null, to: null });
    S.last = ti;
    S.sp = { type, ti, taker, x, y, ready: S.t + (type === 'corner' ? 2.4 : type === 'touche' ? 1.4 : 1.2) };
    const label = { touche: 'TOUCHE', corner: 'CORNER', six: 'SIX MÈTRES' }[type];
    pop(label, Math.max(80, Math.min(F.w - 80, x)), Math.max(40, Math.min(F.h - 40, y + (y < F.h / 2 ? 40 : -40))), '#eef3ea');
    say(type === 'touche' ? `Touche pour ${equipes[ti].nom}` : type === 'corner' ? `Corner pour ${equipes[ti].nom} !` : `Six mètres pour ${equipes[ti].nom}`);
  }
  function corner(ti, y) { setPiece('corner', ti, goalX(ti) === 0 ? 2 : F.w - 2, y < F.h / 2 ? 2 : F.h - 2); }
  function goalKick(ti) { setPiece('six', ti, ownGoalX(ti) + fwd(ti) * 45, F.h / 2); }
  function playSetPiece() {
    const sp = S.sp, t = sp.taker, b = S.ball;
    S.sp = null;
    b.x = t.x; b.y = t.y;
    if (sp.type === 'corner') {
      kick(t, goalX(sp.ti) - fwd(sp.ti) * rnd(60, 120), F.h / 2 + rnd(-55, 55), 480, true, 'cross');
      say(`${t.n} tire le corner…`);
      return;
    }
    // Touche (à la main) ou six mètres : vers le coéquipier le mieux placé devant.
    const range = sp.type === 'touche' ? 280 : 620;
    const q = mates(t).filter(x => x.i > 0 && dist(x, t) < range).map(x => ({ x, s: (x.x - t.x) * fwd(t.ti) + Math.min(...opps(t).map(o => dist(o, x))) - (blocked(t, x) ? 150 : 0) }))
      .sort((a, c) => c.s - a.s)[0]?.x ?? mates(t).filter(x => x.i > 0).sort((a, c) => dist(a, t) - dist(c, t))[0];
    kick(t, q.x, q.y, sp.type === 'touche' ? 360 : 480, true, 'pass');
    b.to = q;
    say(sp.type === 'touche' ? `${t.n} effectue la touche vers ${q.n}` : `Dégagement de ${t.n} vers ${q.n}`);
  }

  function step(dt) {
    S.t += dt;
    const b = S.ball;
    if (S.flash) {
      if (S.t - S.flash.at > 3) { const ti = 1 - S.flash.ti; S.flash = null; kickoff(ti); }
      else players.forEach(p => { if (p.cel) { p.x += Math.cos(S.t * 3 + p.i) * 40 * dt; p.y += Math.sin(S.t * 3 + p.i) * 40 * dt; } });
      return;
    }
    if (S.ko) {
      const ko = S.ko;
      for (const p of players) { const q = ko.spots.get(p), dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy); if (d > 1) { const v = Math.min(d, 230 * dt); p.x += dx / d * v; p.y += dy / d * v; } }
      if (S.t >= ko.until) {
        S.ko = null;
        for (const p of players) { const q = ko.spots.get(p); p.x = q.x; p.y = q.y; }
        if (S.clock0 == null) { S.clock0 = S.t; ev('clock', { t0: Math.round(S.t * 100) / 100 }); }
        kick(ko.k, ko.m.x, ko.m.y, 300, false, 'pass'); b.to = ko.m;
        pop("COUP D'ENVOI", F.w / 2, F.h / 2 - 70, '#eef3ea'); say(`Coup d'envoi pour ${equipes[ko.ti].nom} !`);
      }
      return;
    }
    const holder = b.mode === 'owned' ? b.owner : null;
    const attTeam = S.sp ? S.sp.ti : holder ? holder.ti : S.last;
    const sp0 = S.sp;
    // Ballon libre : le joueur le plus proche de chaque équipe va le chercher.
    const loose = !holder && b.mode !== 'shot' && b.mode !== 'dead';
    const aim = { x: b.x + b.vx * .35, y: b.y + b.vy * .35 };
    const chaser = [0, 1].map(ti => {
      if (!loose) return null;
      if (b.mode === 'pass' && b.to && b.to.ti === ti && b.to.stun <= 0) return b.to;
      return players.filter(q => q.ti === ti && q.i > 0 && q.stun <= 0 && q.slide <= 0).sort((a, c) => dist(a, aim) - dist(c, aim))[0];
    });

    for (const p of players) {
      p.stun = Math.max(0, p.stun - dt);
      if (p.slide > 0) { p.slide -= dt; p.x += p.sx * dt; p.y += p.sy * dt; continue; }
      if (p.stun > 0) { p.vx *= .8; p.vy *= .8; continue; }
      let tx, ty, sp = 150;
      const push = (b.x / F.w - .5) * F.w * .45;
      if (sp0 && p === sp0.taker) {
        // le tireur se place sur la ligne (touche : juste derrière)
        tx = sp0.x; ty = sp0.type === 'touche' ? (sp0.y < F.h / 2 ? -6 : F.h + 6) : sp0.y; sp = 320;
        const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        if (d > 1) { const v = Math.min(d, sp * dt); p.x += dx / d * v; p.y += dy / d * v; }
        continue;
      } else if (sp0 && sp0.type === 'corner' && p.i > 0) {
        // corner : les attaquants entrent dans la surface, les défenseurs marquent
        const g = goalX(sp0.ti);
        tx = p.ti === sp0.ti ? g - fwd(sp0.ti) * (70 + (p.i % 2) * 60) : g - fwd(sp0.ti) * (45 + (p.i % 2) * 50);
        ty = F.h / 2 + (p.i - 2.5) * 38; sp = 190;
      } else if (sp0 && p.ti !== sp0.ti && p.i > 0 && Math.hypot(p.x - sp0.x, p.y - sp0.y) < 70) {
        // l'adversaire recule à distance réglementaire
        const dx = p.x - sp0.x, dy = p.y - sp0.y, d = Math.hypot(dx, dy) || 1;
        tx = sp0.x + dx / d * 80; ty = sp0.y + dy / d * 80; sp = 200;
      } else if (p.i === 0) {
        tx = ownGoalX(p.ti) + fwd(p.ti) * 22; ty = Math.max(GY0 - 10, Math.min(GY1 + 10, b.y)); sp = 170;
        if (p.dive && S.t - p.dive.t < .6) { ty = p.dive.y; sp = 420; }
        else if (loose && Math.abs(b.x - ownGoalX(p.ti)) < 130 && Math.abs(b.y - F.h / 2) < 140) { tx = aim.x; ty = aim.y; sp = 210; }
      } else if (loose && chaser[p.ti] === p) {
        tx = aim.x; ty = aim.y; sp = 205;
      } else if (p === holder) {
        tx = goalX(p.ti); ty = p.hy * .3 + F.h * .35 + Math.sin(S.t * 2.6 + p.i) * 70; sp = 135;
      } else if (p.ti === attTeam) {
        const run = p.run && p.run.until > S.t ? p.run : null;
        tx = run ? run.x : p.hx + push + fwd(p.ti) * (p.i >= 3 ? 110 : 40) + Math.sin(S.t * 1.7 + p.i * 2) * 50;
        ty = run ? run.y : p.hy + Math.cos(S.t * 1.3 + p.i) * 45; sp = run ? 190 : 160;
      } else {
        const presser = players.filter(q => q.ti === p.ti && q.i > 0).sort((a, c) => dist(a, b) - dist(c, b));
        if (presser[0] === p && !sp0) { tx = b.x; ty = b.y; sp = 175; }
        else if (presser[1] === p) { tx = (b.x + ownGoalX(p.ti)) / 2; ty = (b.y + F.h / 2) / 2; sp = 160; }
        else { tx = p.hx + push * .8; ty = p.hy * .7 + b.y * .3; sp = 140; }
      }
      tx = Math.max(8, Math.min(F.w - 8, tx)); ty = Math.max(8, Math.min(F.h - 8, ty));
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
      const want = Math.min(sp, d * 3);
      p.vx += (dx / d * want - p.vx) * Math.min(1, dt * 6); p.vy += (dy / d * want - p.vy) * Math.min(1, dt * 6);
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
      const a = players[i], c = players[j]; const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 22 && !a.slide && !c.slide) { const o = (22 - d) / 2; a.x -= dx / d * o; a.y -= dy / d * o; c.x += dx / d * o; c.y += dy / d * o; }
    }

    if (S.pause > 0) { S.pause -= dt; if (holder) { b.x = holder.x + fwd(holder.ti) * 10; b.y = holder.y; } return; }

    if (sp0) {
      const t = sp0.taker;
      const there = Math.hypot(t.x - sp0.x, t.y - (sp0.type === 'touche' ? (sp0.y < F.h / 2 ? -6 : F.h + 6) : sp0.y)) < 3;
      // touche : le ballon est tenu à deux mains au-dessus de la tête
      if (there) { b.x = t.x; b.y = t.y; b.z = sp0.type === 'touche' ? 22 : 0; }
      if (there && S.t >= sp0.ready) playSetPiece();
      return;
    }

    if (holder) {
      b.x = holder.x + fwd(holder.ti) * 11; b.y = holder.y + 3; b.z = Math.abs(Math.sin(S.t * 9)) * 3;
      const o = nearestOpp(holder);
      S.duel -= dt;
      if (o && dist(o, holder) < 30 && S.duel <= 0) {
        S.duel = .45;
        if (rng() < .3 + o.def * .35 - holder.att * .2) {
          o.slide = .3; const dx = holder.x - o.x, dy = holder.y - o.y, d = Math.hypot(dx, dy) || 1; o.sx = dx / d * 260; o.sy = dy / d * 260;
          holder.stun = .9;
          if (rng() < .15) { pop('FAUTE ! 🟨', holder.x, holder.y - 30, '#ef6b5b'); say(`Faute de ${o.n} sur ${holder.n}, carton jaune !`); S.pause = 1.2; give(holder); holder.stun = 0; return; }
          pop('TACLE !', o.x, o.y - 30); say(`Superbe tacle de ${o.n} !`);
          b.mode = 'free'; b.owner = null; b.vx = dx / d * -60 + rnd(-80, 80); b.vy = rnd(-120, 120); b.vz = 60; S.last = o.ti;
          return;
        } else if (rng() < .5) {
          o.stun = .9; pop(rng() < .3 ? 'PETIT PONT !' : 'CROCHET !', holder.x, holder.y - 30, '#5fd08a'); say(`${holder.n} efface ${o.n} !`);
        }
      }
      S.decide -= dt;
      if (S.decide <= 0) {
        const dGoal = Math.hypot(goalX(holder.ti) - holder.x, F.h / 2 - holder.y);
        const pressed = o && dist(o, holder) < 45;
        if (holder.i === 0) pass(holder, true);
        else if (dGoal < 230) shoot(holder, false);
        else if (dGoal < 360 && rng() < .3 + holder.att * .5) shoot(holder, false);
        else if (!pass(holder, pressed)) S.decide = rnd(.3, .6); // personne devant : il avance balle au pied
      }
      return;
    }

    b.x += b.vx * dt; b.y += b.vy * dt; b.z = Math.max(0, b.z + b.vz * dt); b.vz -= 520 * dt;
    if (b.z === 0 && b.vz < 0) b.vz = b.mode === 'free' ? -b.vz * .35 : 0;
    if (b.mode === 'free' || b.mode === 'pass') { b.vx *= 1 - dt * .9; b.vy *= 1 - dt * .9; }
    // Sortie sur le côté : touche pour l'équipe qui n'a pas touché le ballon en dernier.
    if (b.mode !== 'shot' && (b.y < 0 || b.y > F.h)) { setPiece('touche', 1 - S.last, Math.max(30, Math.min(F.w - 30, b.x)), b.y < 0 ? 0 : F.h); return; }
    // Sortie derrière le but : corner si un défenseur l'a touché en dernier, sinon six mètres.
    if (b.mode !== 'shot' && (b.x < 0 || b.x > F.w)) { const def = b.x < 0 ? 0 : 1; if (S.last === def) corner(1 - def, b.y); else goalKick(def); return; }

    if (b.mode === 'shot') {
      const k = b.keeper;
      if (b.out === 'arret' && Math.abs(b.x - k.x) < 18 && Math.abs(b.y - k.y) < 34) {
        pop('ARRÊT !', k.x, k.y - 34);
        if (rng() < .45) { say('Parade du gardien en corner !'); corner(1 - k.ti, b.y); } else { say('Le gardien capte le ballon'); give(k); S.decide = rnd(.6, 1); }
        return;
      }
      if (b.out === 'poteau' && (b.x <= 2 || b.x >= F.w - 2)) {
        pop('POTEAU !', b.x - fwd(S.last) * 40, b.y - 30, '#eef3ea'); say('Sur le poteau !!');
        b.mode = 'free'; b.vx = -b.vx * .4; b.vy = rnd(-150, 150); b.x = Math.max(3, Math.min(F.w - 3, b.x)); return;
      }
      if (b.x <= 0 || b.x >= F.w) {
        const ti = S.last;
        if (b.out === 'but') {
          S.score[ti]++;
          const min = Math.max(1, minute());
          S.flash = { ti, at: S.t };
          b.kicker.cel = 1;
          S.goals.push({ ti, n: b.kicker.n, min });
          ev('goal', { ti, n: b.kicker.n, min, score: [...S.score], y: Math.round(b.y) });
          say(`BUUUT de ${b.kicker.n} !`);
          b.mode = 'dead'; b.vx = b.vy = 0;
        } else if (b.out === 'arret') { pop('ARRÊT !', k.x, k.y - 34); say('Le gardien sort le ballon sur sa ligne !'); corner(ti, b.y); }
        else { pop('À CÔTÉ', b.x - fwd(ti) * 60, b.y, '#9db0a4'); say('Ça passe à côté !'); goalKick(1 - ti); }
      }
      return;
    }
    if (b.z < 14) {
      const cands = players.filter(p => (p.i > 0 || Math.abs(p.x - ownGoalX(p.ti)) < 130) && p.stun <= 0 && p !== b.kicker && dist(p, b) < (p === b.to ? 17 : 15));
      if (cands.length) {
        cands.sort((a, c) => dist(a, b) - dist(c, b)); const p = cands[0];
        if (b.mode === 'pass' && p.ti !== S.last) { pop('INTERCEPTION !', p.x, p.y - 30, '#6fb7ff'); say(`Interception de ${p.n} !`); }
        if (b.mode === 'cross' && p.ti === S.last && rng() < .65) { shoot(p, true); return; }
        give(p); return;
      }
    }
    if (b.mode === 'cross' && b.z < 30) {
      const p = players.filter(q => q.i > 0).sort((a, c) => dist(a, b) - dist(c, b))[0];
      if (dist(p, b) < 40) {
        if (p.ti === S.last) shoot(p, true);
        else { pop('DÉGAGÉ !', p.x, p.y - 30, '#9db0a4'); say(`${p.n} dégage de la tête`); b.mode = 'free'; b.vx = fwd(p.ti) * 380; b.vy = rnd(-150, 150); b.vz = 180; S.last = p.ti; }
        return;
      }
    }
    if (Math.hypot(b.vx, b.vy) < 25 && b.mode !== 'dead') b.mode = 'free';
  }

  kickoff(0, true);
  say('Les joueurs se mettent en place…');
  const every = Math.round(1 / FPS / DT);
  let n = 0;
  const snap = () => {
    // [x,y]×joueurs, x,y,z du ballon, masque « au sol » (tacle ou taclé), équipe en possession (-1 sinon)
    const f = [];
    let down = 0;
    players.forEach((p, i) => { f.push(Math.round(p.x), Math.round(p.y)); if (p.stun > 0 || p.slide > 0) down |= 1 << i; });
    const b = S.ball;
    f.push(Math.round(b.x), Math.round(b.y), Math.round(b.z), down, b.mode === 'owned' && b.owner ? b.owner.ti : -1);
    frames.push(f);
  };
  if (record) snap();
  while (S.t < DUR) {
    step(DT);
    if (record && ++n % every === 0) snap();
  }
  if (record) say('Coup de sifflet final !');
  const [a, b] = S.score;
  return {
    sport: 'foot', fps: FPS, duration: DUR,
    meta: {
      field: FIELD, goalY: [GY0, GY1],
      equipes: equipes.map(T => ({ nom: T.nom, couleur: T.couleur, bord: T.bord, joueurs: T.joueurs.map(j => j.nom) })),
    },
    frames, events,
    result: { score: [a, b], winner: a === b ? 'nul' : a > b ? 0 : 1, goals: S.goals, shots: S.shots },
  };
}

// Probabilités estimées en simulant beaucoup de matchs (sans enregistrer les images).
export function estimate(cfg, n, seed) {
  const cnt = { win: [0, 0], nul: 0, scorer: {}, total: {} };
  for (let k = 0; k < n; k++) {
    const r = simulate(cfg, seed + k * 7919, false).result;
    if (r.winner === 'nul') cnt.nul++; else cnt.win[r.winner]++;
    const t = Math.min(4, r.score[0] + r.score[1]);
    cnt.total[t] = (cnt.total[t] || 0) + 1;
    for (const n2 of new Set(r.goals.map(g => `${g.ti}:${g.n}`))) cnt.scorer[n2] = (cnt.scorer[n2] || 0) + 1;
  }
  return cnt;
}
