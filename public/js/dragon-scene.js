// La Chasse au dragon : la scène en direct sur l'écran d'affichage, vue de face.
// Le dragon au fond, au centre ; les joueurs devant, chacun derrière son muret en bois.
// À l'abri, on ne voit que le haut de sa tête ; quand il vise ou recharge, il se lève. Une ligne de visée relie chaque tireur
// à sa cible (pointillée pendant la seconde de visée, pleine quand il peut tirer). Les tirs, les touches et le souffle du dragon s'animent.
const DragonScene = (() => {
  const W = 1280, H = 720, SOL = 560, DRAGON = [640, 250];
  const COULEURS = ['#e7584f', '#5b9bf5', '#f2c53d', '#b07cf0'];
  const EQUIPES = ['#e7584f', '#5b9bf5'];
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let E = null, ctx = null, boucle = false;

  function maj(etat) { E = etat?.type === 'dragon' ? etat : null; }
  function demarrer() { if (!boucle) { boucle = true; requestAnimationFrame(frame); } }
  function frame() {
    const cv = document.getElementById('dr-scene');
    if (!cv || !E) { boucle = false; return; }
    if (!ctx || ctx.canvas !== cv) ctx = cv.getContext('2d');
    try { dessiner(); } catch (e) { console.error(e); }
    requestAnimationFrame(frame);
  }

  const n = () => E.joueurs.length;
  const posX = i => W / 2 + (i - (n() - 1) / 2) * (W / (n() + .4));
  const couleur = (p, i) => (E.equipes ? EQUIPES[p.equipe] : COULEURS[i % COULEURS.length]);
  const etat = nom => E.etats.find(x => x.nom === nom) || {};
  const debout = st => st.action === 'vise' || st.action === 'recharge';
  const tete = (i, st) => [posX(i), debout(st) ? SOL - 98 : SOL - 14];
  const recents = (type, ms) => E.events.filter(e => e.type === type && SJ.now() - e.at < ms);
  // point visé : le dragon, ou la tête du joueur ciblé (où qu'elle soit)
  function pointCible(cible) {
    if (cible === 'dragon') return DRAGON;
    const i = E.joueurs.findIndex(p => p.nom === cible);
    return i < 0 ? DRAGON : tete(i, etat(cible));
  }
  function arme(i, st) { // le bout du pistolet, dans la direction de la cible
    const [x, y] = tete(i, st), [tx, ty] = pointCible(st.cible), a = Math.atan2(ty - (y + 30), tx - x);
    return [x + Math.cos(a) * 46, y + 30 + Math.sin(a) * 46, a];
  }

  function dessiner() {
    const t = performance.now() / 1000, now = SJ.now();
    const souffle = recents('souffle', 1400)[0];
    const secousse = calme ? 0 : E.dragon.prepare ? 3 : souffle && now - souffle.at < 500 ? 9 : 0;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.translate((Math.random() - .5) * secousse, (Math.random() - .5) * secousse);
    decor(t);
    dragon(t, now);
    if (souffle) feu(now - souffle.at, souffle);
    // lignes de visée (sous les personnages)
    E.joueurs.forEach((p, i) => { const st = etat(p.nom); if (st.action === 'vise' && st.cible) visee(i, st, couleur(p, i), now >= st.pretA, t); });
    E.joueurs.forEach((p, i) => poste(p, i, t, now));
    tirs(now);
    barre();
    if (E.dragon.prepare) alerte(t);
    ctx.restore();
  }

  function decor(t) {
    const ciel = ctx.createLinearGradient(0, 0, 0, SOL);
    ciel.addColorStop(0, '#171126'); ciel.addColorStop(.7, '#3b1d2b'); ciel.addColorStop(1, '#5a2a24');
    ctx.fillStyle = ciel; ctx.fillRect(-20, -20, W + 40, SOL + 20);
    ctx.fillStyle = 'rgba(255,240,220,.6)';
    for (let k = 0; k < 40; k++) { const x = (k * 167) % W, y = (k * 97) % 260; ctx.globalAlpha = .3 + .3 * Math.sin(t * 1.5 + k); ctx.fillRect(x, y, 2, 2); }
    ctx.globalAlpha = 1;
    // ruines de château en silhouette
    ctx.fillStyle = '#24141d';
    ctx.beginPath(); ctx.moveTo(-20, SOL);
    for (const [x, y] of [[0, 330], [90, 330], [90, 300], [120, 300], [120, 330], [200, 330], [230, 390], [1050, 390], [1080, 330], [1160, 330], [1160, 300], [1190, 300], [1190, 330], [1300, 330]]) ctx.lineTo(x, y);
    ctx.lineTo(1300, SOL); ctx.closePath(); ctx.fill();
    // sol pavé en perspective
    const sol = ctx.createLinearGradient(0, SOL - 140, 0, H);
    sol.addColorStop(0, '#4a3a33'); sol.addColorStop(1, '#2a211d');
    ctx.fillStyle = sol; ctx.fillRect(-20, SOL - 140, W + 40, H);
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) { const y = SOL - 140 + k * k * 8 + k * 14; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let k = -8; k <= 8; k++) { ctx.beginPath(); ctx.moveTo(W / 2 + k * 40, SOL - 140); ctx.lineTo(W / 2 + k * 160, H); ctx.stroke(); }
  }

  function dragon(t, now) {
    const touche = recents('tir', 300).some(e => e.vers === 'dragon');
    const vaincu = E.dragon.pv <= 0;
    const s = vaincu ? .9 : 1 + (calme ? 0 : Math.sin(t * 2) * .03 + (E.dragon.prepare ? .08 + Math.sin(t * 14) * .03 : 0));
    ctx.save(); ctx.translate(...DRAGON); ctx.scale(s, s);
    if (vaincu) ctx.rotate(Math.PI / 2);
    if (E.dragon.prepare) { const g = ctx.createRadialGradient(0, 0, 20, 0, 0, 220); g.addColorStop(0, 'rgba(255,140,40,.55)'); g.addColorStop(1, 'rgba(255,140,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 220, 0, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 175, 150, 26, 0, 0, 7); ctx.fill();
    ctx.font = '300px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; // un emoji prend l'opacité de la couleur de remplissage
    if (vaincu) ctx.filter = 'grayscale(.8)';
    if (touche) ctx.filter = 'brightness(2.2)';
    ctx.fillText('🐉', 0, 10);
    ctx.filter = 'none';
    ctx.restore();
    for (const e of recents('tir', 900).filter(e => e.vers === 'dragon')) { // « −1 » qui s'envole
      const d = (now - e.at) / 900;
      ctx.globalAlpha = 1 - d; ctx.fillStyle = '#ffd34d'; ctx.font = 'bold 44px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('−1', DRAGON[0] + 120, DRAGON[1] - 60 - d * 50); ctx.globalAlpha = 1;
    }
  }

  function feu(ms, souffle) { // le souffle descend du dragon et balaie le premier rang
    const d = ms / 1400, a = Math.sin(clamp(d, 0, 1) * Math.PI);
    const g = ctx.createLinearGradient(0, DRAGON[1] + 40, 0, SOL + 20);
    g.addColorStop(0, `rgba(255,210,80,${.85 * a})`); g.addColorStop(.6, `rgba(255,110,30,${.7 * a})`); g.addColorStop(1, `rgba(200,40,20,${.4 * a})`);
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(DRAGON[0] - 30, DRAGON[1] + 50); ctx.lineTo(DRAGON[0] + 30, DRAGON[1] + 50);
    ctx.lineTo(W + 40, SOL - 10 - 40 * Math.sin(d * 20)); ctx.lineTo(-40, SOL - 10 - 40 * Math.cos(d * 20)); ctx.closePath(); ctx.fill();
    ctx.font = '48px serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    for (let k = 0; k < 9; k++) { ctx.globalAlpha = a; ctx.fillText('🔥', 80 + k * 140 + Math.sin(d * 9 + k) * 20, SOL - 60 - (k % 2) * 30); }
    ctx.globalAlpha = 1;
  }

  function visee(i, st, coul, pret, t) {
    const [x, y] = arme(i, st), [tx, ty] = pointCible(st.cible);
    ctx.save();
    ctx.strokeStyle = coul; ctx.lineWidth = pret ? 4 : 2.5; ctx.globalAlpha = pret ? .9 : .6;
    if (!pret) ctx.setLineDash([10, 10]);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo((x + tx) / 2, Math.min(y, ty) - 60, tx, ty); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    // le viseur sur la cible : il se resserre pendant la seconde de visée
    const r = pret ? 24 + Math.sin(t * 8) * 3 : 34;
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tx, ty, r, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx - r - 8, ty); ctx.lineTo(tx - r + 8, ty); ctx.moveTo(tx + r - 8, ty); ctx.lineTo(tx + r + 8, ty);
    ctx.moveTo(tx, ty - r - 8); ctx.lineTo(tx, ty - r + 8); ctx.moveTo(tx, ty + r - 8); ctx.lineTo(tx, ty + r + 8); ctx.stroke();
    ctx.restore();
  }

  function poste(p, i, t, now) {
    const st = etat(p.nom), x = posX(i), coul = couleur(p, i);
    const touche = recents('tir', 700).some(e => e.vers === p.nom && e.touche) || recents('souffle', 1200).some(e => e.touches.includes(p.nom));
    const flash = touche && Math.floor(now / 90) % 2;
    // le personnage (derrière le muret)
    if (!p.horsJeu) {
      const [hx, hy] = tete(i, st);
      ctx.save();
      if (flash) ctx.globalAlpha = .35;
      if (debout(st)) {
        ctx.fillStyle = coul; ctx.beginPath(); ctx.roundRect(hx - 30, hy + 18, 60, 80, 14); ctx.fill(); // t-shirt
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.stroke();
        if (st.action === 'vise' && st.cible) { // bras tendu et pistolet vers la cible
          const [gx, gy, a] = arme(i, st);
          ctx.strokeStyle = '#d9a877'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx + Math.cos(a) * 14, hy + 34); ctx.lineTo(gx - Math.cos(a) * 14, gy - Math.sin(a) * 14); ctx.stroke();
          ctx.save(); ctx.translate(gx, gy); ctx.rotate(a); ctx.fillStyle = '#2b2b33'; ctx.fillRect(-16, -6, 26, 12); ctx.fillRect(-14, 0, 8, 14); ctx.restore();
        } else { // recharge : il remplit son chargeur
          ctx.fillStyle = '#2b2b33'; ctx.fillRect(hx - 12, hy + 52, 24, 14);
          const d = clamp(1 - (st.finRecharge - now) / 2000, 0, 1);
          ctx.strokeStyle = '#f2c53d'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(hx, hy - 52, 16, -Math.PI / 2, -Math.PI / 2 + d * Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#f2c53d'; ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'center'; ctx.fillText('↻', hx, hy - 51);
        }
      }
      ctx.fillStyle = '#d9a877'; ctx.beginPath(); ctx.arc(hx, hy, 20, 0, 7); ctx.fill(); // tête
      ctx.fillStyle = '#5a3b1f'; ctx.beginPath(); ctx.ellipse(hx, hy - 12, 28, 7, 0, 0, 7); ctx.fill(); ctx.fillRect(hx - 15, hy - 30, 30, 18); // chapeau
      ctx.fillStyle = coul; ctx.fillRect(hx - 15, hy - 17, 30, 5);
      ctx.restore();
    }
    // le muret
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - 92, SOL + 70, 190, 10);
    for (let k = 0; k < 5; k++) { ctx.fillStyle = k % 2 ? '#7a4e25' : '#8a5a2c'; ctx.fillRect(x - 90 + k * 36, SOL, 34, 76); }
    ctx.fillStyle = '#5b3a1c'; ctx.fillRect(x - 94, SOL - 6, 188, 10); ctx.fillRect(x - 94, SOL + 34, 188, 7);
    if (touche) { ctx.font = '54px serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; const [hx, hy] = tete(i, st); ctx.fillText('💥', hx + 30, hy - 30); }
    if (p.horsJeu) { ctx.font = '52px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('😵', x, SOL - 26); }
    // étiquette : nom, vies, balles, dégâts au dragon
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(10,8,12,.8)'; ctx.beginPath(); ctx.roundRect(x - 104, SOL + 86, 208, 64, 10); ctx.fill();
    ctx.strokeStyle = coul; ctx.lineWidth = 3; ctx.stroke();
    ctx.globalAlpha = p.horsJeu ? .5 : 1;
    ctx.fillStyle = '#f4efe6'; ctx.font = 'bold 26px system-ui'; ctx.fillText(p.nom, x, SOL + 106, 196);
    ctx.font = '20px system-ui';
    ctx.fillText(p.horsJeu ? 'hors jeu' : `${'❤️'.repeat(p.vies)}  ${'▮'.repeat(st.balles || 0)}${'▯'.repeat(Math.max(0, E.chargeur - (st.balles || 0)))}  🐉${p.degats}`, x, SOL + 134, 196);
    ctx.globalAlpha = 1;
  }

  function tirs(now) {
    for (const e of recents('tir', 400)) {
      const i = E.joueurs.findIndex(p => p.nom === e.de);
      if (i < 0) continue;
      const st = { ...etat(e.de), action: 'vise', cible: e.vers };
      const [x, y] = arme(i, st), [tx, ty] = pointCible(e.vers), d = (now - e.at) / 400;
      ctx.globalAlpha = 1 - d;
      ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (tx - x) * Math.min(1, d * 3), y + (ty - y) * Math.min(1, d * 3)); ctx.stroke();
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(x, y, 14 * (1 - d), 0, 7); ctx.fill(); // éclair au bout du pistolet
      if (!e.touche && e.vers !== 'dragon') { ctx.font = 'bold 26px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#f2c53d'; ctx.fillText('PAF ! à l\'abri', tx, SOL - 50 - d * 30); }
      ctx.globalAlpha = 1;
    }
  }

  function barre() {
    const w = 460, x = W / 2 - w / 2, y = 26, pv = Math.max(0, E.dragon.pv / E.dragon.max);
    ctx.fillStyle = 'rgba(10,8,12,.75)'; ctx.beginPath(); ctx.roundRect(x - 6, y - 6, w + 12, 40, 20); ctx.fill();
    const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#c4372a'); g.addColorStop(1, '#f08a3c');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, w * pv, 28, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`🐉 ${E.dragon.pv} / ${E.dragon.max}`, W / 2, y + 15);
  }

  function alerte(t) {
    ctx.save();
    ctx.globalAlpha = .75 + Math.sin(t * 12) * .25;
    ctx.font = 'bold 40px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(10,8,12,.75)'; const w = ctx.measureText('⚠️ Le dragon prend son souffle… À L\'ABRI !').width + 50;
    ctx.fillRect(W / 2 - w / 2, 88, w, 60);
    ctx.fillStyle = '#ffb347'; ctx.fillText('⚠️ Le dragon prend son souffle… À L\'ABRI !', W / 2, 119);
    ctx.restore();
  }

  return { maj, demarrer };
})();
