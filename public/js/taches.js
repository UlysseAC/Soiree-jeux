// L'Enquête — mini-jeux des tâches des salles, sur le téléphone (voir server/games/taches.js et docs/jeu5-taches.md).
// Chaque mini-jeu se dessine une fois dans sa zone (#tache-zone, gardée telle quelle par le rendu de la page) ;
// les tâches à plusieurs reçoivent ensuite l'état partagé à chaque mise à jour du serveur.
/* global SJ */
const Taches = (() => {
  const { esc } = SJ;
  let actif = null; // { cle, el, maj }

  // ---------- outils ----------
  const h = (html) => { const t = document.createElement('div'); t.innerHTML = html.trim(); return t.firstElementChild; };
  const borne = (x, a, b) => Math.max(a, Math.min(b, x));
  const vivant = el => el.isConnected;
  // difficulté réglée dans l'admin : niv(p, [facile, normal, difficile])
  const niv = (p, t) => t[p?.niveau ?? 1];
  // boucle d'animation qui s'arrête toute seule quand le mini-jeu disparaît
  function boucle(el, f) {
    let t0 = performance.now();
    const pas = t => { if (!vivant(el)) return; const dt = Math.min(0.1, (t - t0) / 1000); t0 = t; f(dt, t); requestAnimationFrame(pas); };
    requestAnimationFrame(pas);
  }
  const limiter = (f, ms) => { let dernier = 0, attente = null; return (...a) => { const now = Date.now(); clearTimeout(attente); if (now - dernier >= ms) { dernier = now; f(...a); } else attente = setTimeout(() => { dernier = Date.now(); f(...a); }, ms - (now - dernier)); }; };
  // jauge verticale avec une zone ; renvoie set(v)
  function jauge(parent, { zone, couleur = 'var(--ok)', titre = '' }) {
    const j = h(`<div class="tz-jauge"><div class="tz-zone" style="bottom:${zone[0]}%;height:${zone[1] - zone[0]}%;background:${couleur}"></div><div class="tz-niveau"></div><span class="tz-titre">${titre}</span></div>`);
    parent.appendChild(j);
    const niv = j.querySelector('.tz-niveau');
    return v => { niv.style.height = `${borne(v, 0, 100)}%`; j.classList.toggle('dedans', v >= zone[0] && v <= zone[1]); };
  }
  // temps passé dans une zone (remis à zéro dès qu'on en sort)
  function tenir(duree) { let t = 0; return (dedans, dt) => { t = dedans ? t + dt : 0; return t >= duree ? true : Math.floor(t * 10) / 10; }; }
  // angle parcouru par le doigt autour d'un centre (en tours, positif = sens des aiguilles)
  function tourner(zoneEl, f) {
    let prec = null;
    const angle = e => { const r = zoneEl.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
    zoneEl.addEventListener('pointerdown', e => { zoneEl.setPointerCapture(e.pointerId); prec = angle(e); });
    zoneEl.addEventListener('pointermove', e => {
      if (prec == null) return;
      const a = angle(e);
      let d = a - prec;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      prec = a;
      f(d / (2 * Math.PI));
    });
    const fin = () => { prec = null; };
    zoneEl.addEventListener('pointerup', fin);
    zoneEl.addEventListener('pointercancel', fin);
  }
  const msg = (el, texte, ok = false) => { const m = el.querySelector('.tz-msg'); if (m) { m.textContent = texte; m.className = `tz-msg ${ok ? 'ok' : ''}`; } };
  // frotter : un calque de saleté sur une image, effacé au doigt ; fin quand presque tout est propre
  function frotter(el, fin, { fond, salete, seuil = 0.92 }) {
    const box = h(`<div class="tz-frotte" style="background:${fond}"><canvas></canvas></div>`);
    el.appendChild(box);
    const cv = box.querySelector('canvas');
    const w = box.clientWidth || 300, hh = box.clientHeight || 220;
    cv.width = w; cv.height = hh;
    const c = cv.getContext('2d');
    c.fillStyle = salete; c.fillRect(0, 0, w, hh);
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(40,25,10,${Math.random() * 0.35})`; c.beginPath(); c.arc(Math.random() * w, Math.random() * hh, 2 + Math.random() * 7, 0, 7); c.fill(); }
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000'; // le doigt efface complètement la saleté
    let bas = false, fini = false;
    const gratter = e => { const r = cv.getBoundingClientRect(); c.beginPath(); c.arc((e.clientX - r.left) * w / r.width, (e.clientY - r.top) * hh / r.height, 24, 0, 7); c.fill(); };
    cv.addEventListener('pointerdown', e => { bas = true; cv.setPointerCapture(e.pointerId); gratter(e); });
    cv.addEventListener('pointermove', e => { if (bas) gratter(e); });
    cv.addEventListener('pointerup', () => { bas = false; });
    const verif = setInterval(() => {
      if (!vivant(el) || fini) return clearInterval(verif);
      const d = c.getImageData(0, 0, w, hh).data;
      let reste = 0, n = 0;
      for (let i = 3; i < d.length; i += 4 * 37) { n++; if (d[i] > 40) reste++; }
      const propre = 1 - reste / n;
      msg(el, `Propre à ${Math.floor(propre * 100)} %`);
      if (propre >= seuil) { fini = true; clearInterval(verif); fin(); }
    }, 300);
  }

  // ---------- tâches solo : f(el, params, fin) ----------
  const SOLOS = {
    pneus(el, p, fin) {
      el.append(h('<div class="tz-ligne"></div>'));
      const Z = niv(p, [[56, 82], [60, 78], [64, 74]]), DUR = niv(p, [2, 3, 4]);
      const set = jauge(el.firstChild, { zone: Z, titre: 'Pression' });
      const btn = h('<button class="btn primary big tz-gros">🛞 Pomper</button>');
      el.append(btn, h('<p class="tz-msg"></p>'));
      let v = 0;
      const t = tenir(DUR);
      btn.addEventListener('pointerdown', e => { e.preventDefault(); v = Math.min(100, v + 9); navigator.vibrate?.(15); });
      let fini = false;
      boucle(el, dt => {
        if (fini) return;
        v = Math.max(0, v - 14 * dt);
        set(v);
        const r = t(v >= Z[0] && v <= Z[1], dt);
        if (r === true) { fini = true; fin(); } else msg(el, r ? `Tiens bon… ${r.toFixed(1)} / ${DUR} s` : 'Monte l\'aiguille dans la zone verte.');
      });
    },
    billard(el, p, fin) {
      const box = h('<div class="tz-billard"></div>');
      el.append(box, h('<p class="tz-msg">Glisse chaque boule dans le trou de son numéro.</p>'));
      const W = (box.clientWidth || 320) - 16, col = i => 8 + (i % 4) * ((W - 60) / 3); // largeur utile (bordure de 8 px), boules de 44 px
      const trous = [1, 2, 3, 4, 5, 6, 7, 8].map((n, i) => ({ n, x: col(i), y: i < 4 ? 20 : 75 }));
      trous.forEach(t => box.append(h(`<div class="tz-trou" style="left:${t.x}px;top:${t.y}px">${t.n}</div>`)));
      const places = [];
      const ordre = [1, 2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5);
      ordre.forEach((n, i) => {
        const o = { x: col(i), y: 165 + Math.floor(i / 4) * 55 };
        const b = h(`<div class="tz-boule b${n}" style="left:${o.x}px;top:${o.y}px">${n}</div>`);
        box.append(b);
        let dx = 0, dy = 0, bouge = false;
        b.addEventListener('pointerdown', e => { if (places.includes(n)) return; bouge = true; b.setPointerCapture(e.pointerId); const r = b.getBoundingClientRect(); dx = e.clientX - r.left; dy = e.clientY - r.top; b.classList.add('prise'); });
        b.addEventListener('pointermove', e => { if (!bouge) return; const r = box.getBoundingClientRect(); b.style.left = `${e.clientX - r.left - dx}px`; b.style.top = `${e.clientY - r.top - dy}px`; });
        b.addEventListener('pointerup', () => {
          if (!bouge) return;
          bouge = false; b.classList.remove('prise');
          const t = trous.find(tt => tt.n === n), x = parseFloat(b.style.left), y = parseFloat(b.style.top);
          if (Math.hypot(x - t.x, y - t.y) < 34) {
            Object.assign(b.style, { left: `${t.x}px`, top: `${t.y}px` }); b.classList.add('rangee'); places.push(n); navigator.vibrate?.(20);
            if (places.length === 8) fin();
          } else Object.assign(b.style, { left: `${o.x}px`, top: `${o.y}px` });
        });
      });
    },
    argenterie(el, p, fin) {
      frotter(el, fin, { fond: 'radial-gradient(circle at 40% 35%, #ffffff, #c9ced6 45%, #8d939c 70%, #3a3127 71%)', salete: '#6b5a3e', seuil: niv(p, [0.85, 0.92, 0.96]) });
      el.append(h('<p class="tz-msg">Frotte !</p>'));
    },
    malle(el, p, fin) {
      frotter(el, fin, { fond: 'linear-gradient(#7a4b25, #5c3518) center/100% 100%, #5c3518', salete: '#b9ad97', seuil: niv(p, [0.85, 0.92, 0.96]) });
      el.append(h('<p class="tz-msg">Frotte !</p>'));
    },
    pendule(el, p, fin) {
      el.append(h('<div class="tz-ligne"><div class="tz-cadran">🕰️<small>tourne ici</small></div></div>'));
      const Z = niv(p, [[65, 90], [70, 88], [75, 85]]);
      const set = jauge(el.firstChild, { zone: Z, titre: 'Ressort' });
      const btn = h('<button class="btn primary big">C\'est remonté</button>');
      el.append(btn, h('<p class="tz-msg">Fais des cercles autour du cadran.</p>'));
      let v = 0;
      tourner(el.querySelector('.tz-cadran'), tours => {
        v = Math.max(0, v + tours * 100 / 6);
        if (v > 100) { v = 0; msg(el, '💥 Le ressort a cassé ! On recommence.'); navigator.vibrate?.(200); }
        set(v);
      });
      btn.addEventListener('click', () => (v >= Z[0] && v <= Z[1] ? fin() : msg(el, v < Z[0] ? 'Pas assez remonté.' : 'Trop !')));
      set(0);
    },
    fourneau(el, p, fin) {
      el.append(h('<div class="tz-ligne"><div class="tz-pelle">⛏️<small>glisse vers le haut</small></div></div>'));
      const Z = niv(p, [[70, 95], [75, 92], [79, 89]]), DUR = niv(p, [2, 3, 4]);
      const set = jauge(el.firstChild, { zone: Z, couleur: 'var(--danger)', titre: 'Chaleur' });
      el.append(h('<p class="tz-msg"></p>'));
      let v = 10, y0 = null, fini = false;
      const t = tenir(DUR), zone = el.querySelector('.tz-pelle');
      zone.addEventListener('pointerdown', e => { zone.setPointerCapture(e.pointerId); y0 = e.clientY; });
      zone.addEventListener('pointermove', e => { if (y0 != null && y0 - e.clientY > 60) { v = Math.min(100, v + 11); y0 = e.clientY; navigator.vibrate?.(15); } });
      zone.addEventListener('pointerup', () => { y0 = null; });
      boucle(el, dt => {
        if (fini) return;
        v = Math.max(0, v - 9 * dt); set(v);
        const r = t(v >= Z[0] && v <= Z[1], dt);
        if (r === true) { fini = true; fin(); } else msg(el, r ? `Garde le feu… ${r.toFixed(1)} / ${DUR} s` : 'Pellette pour amener le feu dans le rouge.');
      });
    },
    machine(el, p, fin) {
      const mot = p.mot || 'TELEGRAMME';
      const rangs = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'];
      const box = h(`<div class="tz-machine"><div class="tz-mot">${esc(mot)}</div><div class="tz-tape"></div><div class="tz-chrono"></div>${rangs.map(r => `<div class="tz-rang">${[...r].map(l => `<button class="tz-touche" data-l="${l}">${l}</button>`).join('')}</div>`).join('')}</div>`);
      el.append(box, h('<p class="tz-msg"></p>'));
      const TEMPS = niv(p, [45, 30, 20]) * 1000;
      let tape = '', fin0 = Date.now() + TEMPS, fini = false;
      const tapeEl = box.querySelector('.tz-tape');
      box.addEventListener('pointerdown', e => {
        const b = e.target.closest('[data-l]');
        if (!b || fini) return;
        e.preventDefault();
        if (b.dataset.l === mot[tape.length]) { tape += b.dataset.l; navigator.vibrate?.(10); } else { b.classList.add('faux'); setTimeout(() => b.classList.remove('faux'), 300); }
        tapeEl.textContent = tape;
        if (tape === mot) { fini = true; fin(); }
      });
      boucle(el, () => {
        if (fini) return;
        const reste = fin0 - Date.now();
        box.querySelector('.tz-chrono').textContent = `⏱ ${Math.max(0, Math.ceil(reste / 1000))} s`;
        if (reste <= 0) { tape = ''; tapeEl.textContent = ''; fin0 = Date.now() + TEMPS; msg(el, 'Trop lent : on recommence.'); }
      });
    },
    tuyaux(el, p, fin) {
      // grille 4 × 4 : un chemin de l'entrée (à gauche) à la sortie (à droite), tuyaux droits et coudés, puis tout est tourné au hasard
      const N = niv(p, [3, 4, 5]), D = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // N E S O
      let chemin = null;
      const entree = Math.floor(Math.random() * N);
      const essai = (r, c, vu, acc) => {
        if (c === N - 1 && Math.random() < 0.6 || acc.length > N * 3 && c === N - 1) return [...acc, [r, c]];
        const dirs = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        for (const d of dirs) { const rr = r + D[d][0], cc = c + D[d][1]; if (rr < 0 || cc < 0 || rr >= N || cc >= N || vu.has(rr * N + cc)) continue; vu.add(rr * N + cc); const res = essai(rr, cc, vu, [...acc, [r, c]]); if (res) return res; vu.delete(rr * N + cc); }
        return c === N - 1 ? [...acc, [r, c]] : null;
      };
      while (!chemin) chemin = essai(entree, 0, new Set([entree * N]), []);
      const sortie = chemin[chemin.length - 1][0];
      const cases = Array.from({ length: N * N }, () => ({ type: Math.random() < 0.5 ? 'droit' : 'coude', rot: 0 }));
      const dirDe = (a, b) => D.findIndex(d => a[0] + d[0] === b[0] && a[1] + d[1] === b[1]);
      chemin.forEach((cell, i) => {
        const avant = i === 0 ? 3 : dirDe(cell, chemin[i - 1]);
        const apres = i === chemin.length - 1 ? 1 : dirDe(cell, chemin[i + 1]);
        const k = cases[cell[0] * N + cell[1]];
        if ((avant + 2) % 4 === apres) Object.assign(k, { type: 'droit', rot: avant % 2 });
        else Object.assign(k, { type: 'coude', rot: [0, 1, 2, 3].find(r => new Set([r, (r + 1) % 4]).has(avant) && new Set([r, (r + 1) % 4]).has(apres)) });
      });
      cases.forEach(k => { k.rot = (k.rot + 1 + Math.floor(Math.random() * 3)) % 4; });
      const liens = k => (k.type === 'droit' ? [k.rot % 4, (k.rot + 2) % 4] : [k.rot % 4, (k.rot + 1) % 4]);
      const box = h(`<div class="tz-tuyaux" style="--n:${N}"></div>`);
      el.append(box, h('<p class="tz-msg">Fais couler l\'eau de 💧 jusqu\'à 🛁.</p>'));
      const dessin = k => (k.type === 'droit' ? '<path d="M50 0V100"/>' : '<path d="M50 0V50H100"/>');
      const rendre = () => {
        // eau : depuis l'entrée, on suit les tuyaux reliés
        const plein = new Set();
        let r = entree, c = 0, depuis = 3, ok = false;
        for (let pas = 0; pas < N * N + 1; pas++) {
          const k = cases[r * N + c], l = liens(k);
          if (!l.includes(depuis) || plein.has(r * N + c)) break;
          plein.add(r * N + c);
          const vers = l.find(x => x !== depuis);
          if (c === N - 1 && vers === 1 && r === sortie) { ok = true; break; }
          r += D[vers][0]; c += D[vers][1]; depuis = (vers + 2) % 4;
          if (r < 0 || c < 0 || r >= N || c >= N) break;
        }
        box.innerHTML = cases.map((k, i) => `<button class="tz-tuyau ${plein.has(i) ? 'eau' : ''}" data-i="${i}" style="transform:rotate(${k.rot * 90}deg)"><svg viewBox="0 0 100 100">${dessin(k)}</svg></button>`).join('')
          + `<span class="tz-entree" style="top:calc(${entree} * 100% / ${N} + 50% / ${N})">💧</span><span class="tz-sortie" style="top:calc(${sortie} * 100% / ${N} + 50% / ${N})">🛁</span>`;
        return ok;
      };
      rendre();
      box.addEventListener('click', e => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        cases[b.dataset.i].rot = (cases[b.dataset.i].rot + 1) % 4;
        if (rendre()) { box.style.pointerEvents = 'none'; setTimeout(fin, 500); }
      });
    },
    lit(el, p, fin) {
      const H = 240;
      const nb = niv(p, [3, 5, 7]), pas = (H - 40) / nb;
      const plis = [...Array(nb)].map((_, i) => ({ y: 20 + i * pas + Math.random() * Math.max(4, pas - 25), fait: false }));
      const box = h(`<div class="tz-lit" style="height:${H}px">${plis.map((pl, i) => `<div class="tz-pli" data-i="${i}" style="top:${pl.y}px"></div>`).join('')}</div>`);
      el.append(box, h('<p class="tz-msg">Glisse le doigt sur chaque pli, de bord à bord.</p>'));
      let trait = null;
      box.addEventListener('pointerdown', e => { box.setPointerCapture(e.pointerId); trait = {}; });
      box.addEventListener('pointermove', e => {
        if (!trait) return;
        const r = box.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = e.clientY - r.top;
        plis.forEach((pl, i) => { if (pl.fait || Math.abs(y - pl.y) > 22) return; const t = trait[i] ??= { min: x, max: x }; t.min = Math.min(t.min, x); t.max = Math.max(t.max, x); if (t.max - t.min > 0.7) { pl.fait = true; box.querySelector(`[data-i="${i}"]`).classList.add('lisse'); navigator.vibrate?.(20); } });
        if (plis.every(pl => pl.fait)) { trait = null; setTimeout(fin, 300); }
      });
      box.addEventListener('pointerup', () => { trait = null; });
    },
    livres(el, p, fin) {
      const nb = niv(p, [4, 6, 8]);
      const romains = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'].slice(0, nb);
      let ordre = romains.map((_, i) => i);
      while (ordre.every((x, i) => x === i)) ordre.sort(() => Math.random() - 0.5);
      const box = h(`<div class="tz-livres" style="grid-template-columns:repeat(${nb}, 1fr)"></div>`);
      el.append(box, h('<p class="tz-msg">Fais glisser un tome à sa place.</p>'));
      const rendre = (prisI = -1, x = 0) => {
        box.innerHTML = ordre.map((n, i) => `<div class="tz-livre ${i === prisI ? 'pris' : ''}" data-i="${i}" style="${i === prisI ? `transform:translateX(${x}px)` : ''}">${romains[n]}</div>`).join('');
      };
      rendre();
      let pris = -1, x0 = 0;
      box.addEventListener('pointerdown', e => { const b = e.target.closest('[data-i]'); if (!b) return; pris = Number(b.dataset.i); x0 = e.clientX; box.setPointerCapture(e.pointerId); rendre(pris, 0); });
      box.addEventListener('pointermove', e => {
        if (pris < 0) return;
        const larg = box.clientWidth / nb, dx = e.clientX - x0;
        const cible = borne(pris + Math.round(dx / larg), 0, nb - 1);
        if (cible !== pris) { const [l] = ordre.splice(pris, 1); ordre.splice(cible, 0, l); x0 += (cible - pris) * larg; pris = cible; }
        rendre(pris, e.clientX - x0);
      });
      box.addEventListener('pointerup', () => { pris = -1; rendre(); if (ordre.every((x, i) => x === i)) setTimeout(fin, 300); });
    },
    potion(el, p, fin) {
      const ligne = 55 + Math.random() * 30;
      const box = h(`<div class="tz-fiole"><div class="tz-liquide"></div><div class="tz-repere" style="bottom:${ligne}%"></div></div>`);
      const btn = h('<button class="btn primary big tz-gros">🧪 Maintenir pour verser</button>');
      el.append(box, btn, h('<p class="tz-msg">Relâche pile sur la ligne rouge.</p>'));
      let v = 0, verse = false, bloque = false;
      const liq = box.querySelector('.tz-liquide');
      btn.addEventListener('pointerdown', e => { e.preventDefault(); if (!bloque) verse = true; });
      const lacher = () => {
        if (!verse) return;
        verse = false;
        if (Math.abs(v - ligne) <= niv(p, [6, 3.5, 2])) { bloque = true; fin(); return; }
        bloque = true; msg(el, v < ligne ? 'Pas assez ! On vide et on recommence.' : 'Trop ! On vide et on recommence.');
        setTimeout(() => { v = 0; bloque = false; }, 900);
      };
      btn.addEventListener('pointerup', lacher);
      btn.addEventListener('pointerleave', lacher);
      boucle(el, dt => { if (verse) v = Math.min(100, v + 30 * dt); liq.style.height = `${v}%`; });
    },
  };

  // ---------- tâches à plusieurs : f(el, ctx) ; ctx = { role, vue, envoyer(op, données), surMaj(f) } ----------
  const local = (v, at, chute) => Math.max(0, v - chute * (SJ.now() - at) / 1000);
  const GROUPES = {
    roue(el, ctx) {
      if (ctx.role === 0) {
        el.append(h('<div class="tz-ligne"></div>'));
        const set = jauge(el.firstChild, { zone: [50, 100], titre: 'Voiture levée' });
        const btn = h('<button class="btn primary big tz-gros">🔧 Pomper le cric</button>');
        el.append(btn, h('<p class="tz-msg">Tape sans t\'arrêter !</p>'));
        btn.addEventListener('pointerdown', e => { e.preventDefault(); ctx.envoyer('pomper'); navigator.vibrate?.(15); });
        boucle(el, () => set(local(ctx.vue.cric, ctx.vue.cricAt, ctx.vue.chute)));
      } else {
        el.append(h('<div class="tz-ligne"><div class="tz-cadran">🔩<small>visse ici</small></div></div>'));
        const set = jauge(el.firstChild, { zone: [50, 100], titre: 'Voiture' });
        el.append(h('<div class="tz-goujons"></div>'), h('<p class="tz-msg"></p>'));
        let acc = 0;
        const envoyer = limiter(() => { if (acc > 0) { ctx.envoyer('visser', { q: Math.min(25, acc) }); acc = 0; } }, 150);
        tourner(el.querySelector('.tz-cadran'), t => { if (local(ctx.vue.cric, ctx.vue.cricAt, ctx.vue.chute) >= 50) { acc += Math.abs(t) * 60; envoyer(); } });
        boucle(el, () => {
          const haut = local(ctx.vue.cric, ctx.vue.cricAt, ctx.vue.chute);
          set(haut);
          el.querySelector('.tz-goujons').innerHTML = ctx.vue.goujons.map(g => `<span class="tz-goujon" style="--p:${g}%"></span>`).join('');
          msg(el, haut >= 50 ? 'Fais des cercles pour visser !' : '⚠️ La voiture est trop basse : ton partenaire doit pomper.');
        });
      }
    },
    poker(el, ctx) {
      const box = h('<div class="tz-poker"></div>');
      el.append(box, h('<p class="tz-msg"></p>'));
      const carte = c => `<span class="tz-carte ${/[♥♦]/.test(c) ? 'rouge' : ''}">${esc(c)}</span>`;
      const rendre = () => {
        const v = ctx.vue;
        box.innerHTML = `<div class="label">Manche ${v.manche} / ${v.manches || 3} · la table</div><div class="tz-cartes">${v.table.map(carte).join('')}</div>
          <div class="label">Ta main : quelle carte est aussi sur la table ?</div><div class="tz-cartes main">${v.main.map(c => `<button data-c="${esc(c)}">${carte(c)}</button>`).join('')}</div>`;
        msg(el, v.trouve ? (v.autreTrouve ? '' : '✓ Trouvé ! Attends ton partenaire…') : v.autreTrouve ? 'Ton partenaire a trouvé, à toi !' : '', v.trouve);
      };
      rendre();
      ctx.surMaj(rendre);
      box.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b && !ctx.vue.trouve) ctx.envoyer('carte', { carte: b.dataset.c }).then(r => { if (!r.ok) { b.classList.add('faux'); setTimeout(() => b.classList.remove('faux'), 500); } }); });
    },
    table(el, ctx) {
      const v = ctx.vue;
      if (ctx.role === 0) {
        el.append(h(`<div class="tz-plan"><p>Dicte ce plan à ton partenaire :</p>${v.plan.map((place, o) => `<div class="tz-planligne"><strong>${esc(v.objets[o])}</strong><span>${esc(v.places[place])}</span></div>`).join('')}</div>`));
        return;
      }
      let choisi = null;
      const box = h('<div class="tz-table"></div>');
      el.append(box, h('<button class="btn primary big" data-valider>Valider la table</button>'), h('<p class="tz-msg">Choisis un couvert, puis sa place.</p>'));
      const POS = ['gauche', 'droite', 'haut', 'hautdroite', 'centre'];
      const rendre = () => {
        const mes = ctx.vue.mesPlaces;
        box.innerHTML = `<div class="tz-assiette">${POS.map((pos, p) => { const o = mes.indexOf(p); return `<button class="tz-place ${pos}" data-p="${p}" title="${esc(v.places[p])}">${o >= 0 ? esc(v.objets[o].split(' ')[0]) : '·'}</button>`; }).join('')}</div>
          <div class="tz-objets">${v.objets.map((o, i) => `<button class="btn sm ${choisi === i ? 'primary' : ''}" data-o="${i}">${esc(o)}</button>`).join('')}</div>`;
      };
      rendre();
      ctx.surMaj(rendre);
      el.addEventListener('click', e => {
        const o = e.target.closest('[data-o]'), p = e.target.closest('[data-p]');
        if (o) { choisi = Number(o.dataset.o); rendre(); }
        if (p && choisi != null) { ctx.envoyer('placer', { objet: choisi, place: Number(p.dataset.p) }); choisi = null; }
        if (e.target.closest('[data-valider]')) ctx.envoyer('valider').then(r => { if (!r.ok) msg(el, r.msg); });
      });
    },
    lampes(el, ctx) {
      el.append(h('<div class="tz-ligne"><div class="tz-lampe"><div class="tz-lzone"></div><div class="tz-flamme"></div></div><input type="range" class="tz-vertical" min="0" max="100" value="30"></div>'), h('<p class="tz-msg"></p>'));
      const input = el.querySelector('input'), zone = el.querySelector('.tz-lzone'), flamme = el.querySelector('.tz-flamme');
      input.value = ctx.vue.mien;
      const envoyer = limiter(v => ctx.envoyer('curseur', { v }), 120);
      input.addEventListener('input', () => envoyer(Number(input.value)));
      boucle(el, () => {
        const v = ctx.vue, cible = 100 + 45 * Math.sin((SJ.now() - v.debut) / 2600 + v.phase);
        const total = v.flamme - v.mien + Number(input.value);
        zone.style.bottom = `${(cible - v.zone) / 2}%`; zone.style.height = `${v.zone}%`;
        flamme.style.height = `${borne(total / 2, 0, 100)}%`;
        flamme.classList.toggle('dedans', Math.abs(total - cible) <= v.zone);
        msg(el, `Gardez la flamme dans la zone : ${v.tenu} / ${v.duree || 10} s`);
      });
    },
    souffle(el, ctx) {
      if (ctx.role === 0) {
        el.append(h('<div class="tz-four"><div class="tz-souffle"></div></div>'), h('<p class="tz-msg"></p>'));
        const s = el.querySelector('.tz-souffle');
        boucle(el, () => {
          const v = ctx.vue, now = SJ.now(), p = (now - v.debut) / (v.fenetre - v.debut);
          s.style.height = `${borne(20 + p * 60, 20, 90)}%`;
          const marge = v.marge || 900, dore = Math.abs(now - v.fenetre) <= marge * 0.8, brule = now > v.fenetre + marge;
          s.className = `tz-souffle ${dore ? 'dore' : brule ? 'brule' : ''}`;
          msg(el, dore ? '🗣 MAINTENANT !' : brule ? 'Brûlé…' : 'Il monte… prépare-toi à crier.', dore);
        });
      } else {
        el.append(h('<div class="tz-four porte">🚪 Porte du four</div>'), h('<button class="btn primary big tz-gros">🧤 Sortir le soufflé</button>'), h('<p class="tz-msg">Attends que ton partenaire crie « maintenant ! ».</p>'));
        el.querySelector('button').addEventListener('click', () => ctx.envoyer('sortir').then(r => { if (!r.ok) SJ.toast(r); }));
      }
    },
    coffre(el, ctx) {
      if (ctx.role === 0) {
        el.append(h('<div class="tz-ligne"><div class="tz-cadran molette"><b>50</b><small>tourne</small></div></div>'), h('<p class="tz-msg"></p>'));
        let v = ctx.vue.molette;
        const b = el.querySelector('b');
        const envoyer = limiter(x => ctx.envoyer('molette', { v: x }), 100);
        tourner(el.querySelector('.tz-cadran'), t => { v = ((v + t * 40) % 100 + 100) % 100; b.textContent = Math.round(v) % 100; envoyer(Math.round(v) % 100); });
        boucle(el, () => msg(el, `Chiffre ${ctx.vue.chiffre} / ${ctx.vue.chiffres || 3} : tourne lentement, arrête-toi quand ton partenaire dit stop.`));
      } else {
        el.append(h('<div class="tz-voyant"></div>'), h('<button class="btn primary big tz-gros">✋ Stop ! C\'est ce chiffre</button>'), h('<p class="tz-msg"></p>'));
        const voyant = el.querySelector('.tz-voyant');
        el.querySelector('button').addEventListener('click', () => ctx.envoyer('stop').then(r => { if (!r.ok) SJ.toast(r); }));
        boucle(el, () => { voyant.classList.toggle('clic', ctx.vue.clic); voyant.textContent = ctx.vue.clic ? 'CLIC !' : '…'; msg(el, `Chiffre ${ctx.vue.chiffre} / ${ctx.vue.chiffres || 3}`); });
      }
    },
    vannes(el, ctx) {
      const box = h('<div class="tz-vannes"></div>');
      el.append(box, h('<p class="tz-msg"></p>'));
      const rendre = () => {
        const v = ctx.vue;
        box.innerHTML = v.vannes.map(n => `<button class="tz-vanne ${n <= v.ouvertes ? 'ouverte' : ''}" data-v="${n}">🔧<b>${n}</b></button>`).join('');
        msg(el, `Vannes ouvertes : ${v.ouvertes} / ${v.total || 4}. Annonce tes numéros !`);
      };
      rendre();
      ctx.surMaj(rendre);
      box.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) ctx.envoyer('ouvrir', { v: Number(b.dataset.v) }).then(r => { if (!r.ok) msg(el, r.msg); }); });
    },
    volets(el, ctx) {
      const box = h('<div class="tz-volets"><div class="battant g"></div><div class="battant d"></div><small>glisse ici</small></div>');
      el.append(box, h('<p class="tz-msg"></p>'));
      let x0 = null;
      box.addEventListener('pointerdown', e => { box.setPointerCapture(e.pointerId); x0 = e.clientX; });
      box.addEventListener('pointermove', e => {
        if (x0 == null || Math.abs(e.clientX - x0) < 70) return;
        x0 = null; box.classList.add('claque'); setTimeout(() => box.classList.remove('claque'), 300); navigator.vibrate?.(40);
        ctx.envoyer('claquer', { t: SJ.now() }).then(r => { if (!r.ok) msg(el, r.msg); });
      });
      box.addEventListener('pointerup', () => { x0 = null; });
      const rendre = () => msg(el, `Fenêtre ${ctx.vue.fenetre} / ${ctx.vue.fenetres || 3} : « 3, 2, 1 » et glissez ensemble !`);
      rendre(); ctx.surMaj(rendre);
    },
    radio(el, ctx) {
      if (ctx.role === 0) {
        el.append(h('<div class="tz-radio">📻<b></b></div>'), h('<input type="range" class="tz-large" min="0" max="100" step="1">'), h('<p class="tz-msg">Écoute ton partenaire : « plus haut », « plus bas »…</p>'));
        const input = el.querySelector('input'), b = el.querySelector('b');
        input.value = ctx.vue.gros; b.textContent = ctx.vue.gros;
        const envoyer = limiter(v => ctx.envoyer('gros', { v }), 120);
        input.addEventListener('input', () => { b.textContent = input.value; envoyer(Number(input.value)); });
      } else {
        el.append(h('<canvas class="tz-onde" width="320" height="120"></canvas>'), h('<input type="range" class="tz-large" min="-5" max="5" step="0.1">'), h('<p class="tz-msg"></p>'));
        const input = el.querySelector('input'), cv = el.querySelector('canvas'), c = cv.getContext('2d');
        input.value = ctx.vue.fin;
        const envoyer = limiter(v => ctx.envoyer('fin', { v }), 120);
        input.addEventListener('input', () => envoyer(Number(input.value)));
        boucle(el, (dt, t) => {
          const marge = ctx.vue.marge || 0.4, ecart = ctx.vue.ecart - ctx.vue.fin + Number(input.value), bruit = Math.min(1, Math.abs(ecart) / 8);
          c.clearRect(0, 0, 320, 120); c.strokeStyle = Math.abs(ecart) <= marge ? '#5cc47a' : '#e5a83b'; c.lineWidth = 3; c.beginPath();
          for (let x = 0; x <= 320; x += 4) c.lineTo(x, 60 + Math.sin(x / 18 + t / 200) * 30 * (1 - bruit) + (Math.random() - 0.5) * 70 * bruit);
          c.stroke();
          msg(el, Math.abs(ecart) <= marge ? `Parfait, ne bougez plus ! ${ctx.vue.tenu} / ${ctx.vue.duree || 3} s` : `L'onde est ${Math.abs(ecart) > 8 ? 'brouillée : guide ton partenaire' : 'presque nette : affine'}`);
        });
      }
    },
    porte(el, ctx) {
      if (ctx.role < 2) {
        const btn = h('<button class="tz-levier">⬇️<span>Maintiens appuyé</span></button>');
        el.append(btn, h('<p class="tz-msg"></p>'));
        const bas = v => { btn.classList.toggle('bas', v); ctx.envoyer('levier', { bas: v }); };
        btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture(e.pointerId); bas(true); navigator.vibrate?.(30); });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => btn.addEventListener(ev, () => btn.classList.contains('bas') && bas(false)));
        const rendre = () => msg(el, ctx.vue.leviers.every(Boolean) ? 'Les deux leviers sont baissés : le code est sur la tablette !' : 'Ne lâche pas ! Il faut les deux leviers baissés.', ctx.vue.leviers.every(Boolean));
        rendre(); ctx.surMaj(rendre);
      } else {
        el.append(h('<p class="tz-consigne">Le code apparaît sur la tablette de la salle quand les deux leviers sont baissés.</p>'), h('<div class="tz-code"><input class="in" inputmode="numeric" maxlength="4" placeholder="Code"><button class="btn primary">Valider</button></div>'), h('<p class="tz-msg"></p>'));
        const input = el.querySelector('input');
        el.querySelector('button').addEventListener('click', () => ctx.envoyer('code', { code: input.value }).then(r => { if (!r.ok) msg(el, r.msg); }));
        const rendre = () => { const n = ctx.vue.leviers.filter(Boolean).length; if (!el.querySelector('.tz-msg.ok')) msg(el, `Leviers baissés : ${n} / 2`); };
        rendre(); ctx.surMaj(rendre);
      }
    },
    cuve(el, ctx) {
      el.append(h('<div class="tz-ligne"></div>'));
      const ligne = el.firstChild;
      const setT = jauge(ligne, { zone: ctx.vue.zoneTemp || [60, 75], couleur: 'var(--danger)', titre: 'Temp.' });
      const setP = jauge(ligne, { zone: ctx.vue.zonePression || [50, 70], titre: 'Pression' });
      if (ctx.role === 0) {
        const input = h('<input type="range" class="tz-vertical" min="0" max="100">');
        ligne.append(input);
        input.value = ctx.vue.temp;
        const envoyer = limiter(v => ctx.envoyer('temp', { v }), 120);
        input.addEventListener('input', () => envoyer(Number(input.value)));
      } else if (ctx.role === 1) {
        const btn = h('<button class="btn primary big tz-gros">💨 Pomper</button>');
        el.append(btn);
        btn.addEventListener('pointerdown', e => { e.preventDefault(); ctx.envoyer('pomper'); navigator.vibrate?.(15); });
      } else {
        el.append(h('<div class="tz-code"><input class="in" inputmode="numeric" maxlength="4" placeholder="Code"><button class="btn primary">Valider</button></div>'));
        const input = el.querySelector('input');
        el.querySelector('.tz-code button').addEventListener('click', () => ctx.envoyer('code', { code: input.value }).then(r => { if (!r.ok) SJ.toast(r); }));
      }
      el.append(h('<p class="tz-msg"></p>'));
      boucle(el, () => {
        const v = ctx.vue, temp = ctx.role === 0 ? Number(ligne.querySelector('input').value) : v.temp;
        setT(temp); setP(local(v.pression, v.pressionAt, v.chute));
        if (v.moitie) msg(el, `Code : ${v.moitie}${ctx.role === 0 ? '··' : ''} ${ctx.role === 0 ? '(les 2 premiers chiffres)' : '(les 2 derniers chiffres)'} — dis-le au 3e joueur !`, true);
        else if (ctx.role === 2 && v.codeVisible) msg(el, 'Le code est apparu : demande les chiffres à tes partenaires !', true);
        else msg(el, `Gardez les deux jauges dans leur zone : ${v.tenu} / ${v.duree || 3} s`);
      });
    },
  };

  // Appelé après chaque rendu de la page : monte le mini-jeu dans sa zone, ou lui transmet le nouvel état.
  function apres(t, { lance, act }) {
    const el = document.getElementById('tache-zone');
    if (!el || !t) { actif = null; return; }
    const cle = el.dataset.keep;
    if (actif && actif.cle === cle && actif.el === el && el.firstChild) { if (t.vue) actif.maj(t.vue); return; }
    el.innerHTML = '';
    if (!t.groupe) {
      if (!lance) return;
      SOLOS[t.id]?.(el, t.params || {}, () => act({ type: 'tacheReussie' }));
      actif = { cle, el, maj: () => {} };
      return;
    }
    const abonnes = [];
    const ctx = {
      role: t.role, vue: t.vue,
      envoyer: (op, donnees = {}) => SJ.emit('joueur', { type: 'tache', op, ...donnees }).then(r => { if (r?.msg && r.indice) SJ.toast(r); return r || { ok: false }; }),
      surMaj: f => abonnes.push(f),
    };
    GROUPES[t.id]?.(el, ctx);
    actif = { cle, el, maj: vue => { ctx.vue = vue; abonnes.forEach(f => f(vue)); } };
  }
  return { apres };
})();
