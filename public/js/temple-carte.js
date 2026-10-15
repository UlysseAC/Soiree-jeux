// Le Temple aztèque : la carte vue du dessus, sur l'écran d'affichage.
// À chaque étape, deux chemins (haut = gauche, bas = droite) relient deux plateformes ; le décor de chaque chemin dépend de l'obstacle.
// Les explorateurs (t-shirt de couleur) marchent sur le chemin choisi ; le piège se déclenche après le suspense,
// ceux qui tombent réapparaissent à la plateforme suivante en clignotant (ou restent ☠️ s'ils n'ont plus de vie).
const TempleCarte = (() => {
  const W = 1280, H = 720, Y0 = 360, SEG = 560, X0 = 140;
  // Couleurs des t-shirts, dans l'ordre des joueurs du round (la même liste sert sur les téléphones)
  const COULEURS = ['#e7584f', '#5b9bf5', '#f2c53d', '#b07cf0', '#43b8a6', '#f08a3c', '#ec6fb5', '#f4f1e8', '#8bd450', '#4b5cd6'];
  const NOMS_COULEURS = ['rouge', 'bleu', 'jaune', 'violet', 'turquoise', 'orange', 'rose', 'blanc', 'vert', 'bleu foncé'];
  const PIEGE = 2.4; // secondes entre le début de la révélation et le déclenchement du piège (même suspense que le tambour)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), ease = x => x * x * (3 - 2 * x);
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let E = null, recu = 0, ctx = null, boucle = false;

  // ---------- géométrie ----------
  const nodeX = i => X0 + i * SEG;
  function pt(i, c, t) { // c : -1 = chemin du haut (gauche), +1 = chemin du bas (droite)
    const x0 = nodeX(i), x3 = nodeX(i + 1), dy = c * 190, u = 1 - t;
    const p = [[x0, Y0], [x0 + 150, Y0 + dy], [x3 - 150, Y0 + dy], [x3, Y0]];
    return [u*u*u*p[0][0] + 3*u*u*t*p[1][0] + 3*u*t*t*p[2][0] + t*t*t*p[3][0],
            u*u*u*p[0][1] + 3*u*u*t*p[1][1] + 3*u*t*t*p[2][1] + t*t*t*p[3][1]];
  }
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const LARGEUR = SEG * 21 + 800;
  const TOUFFES = Array.from({ length: 2400 }, () => [rnd() * LARGEUR - 400, rnd() * H, 4 + rnd() * 10, rnd()]);
  const ARBRES = Array.from({ length: 420 }, () => [rnd() * LARGEUR - 400, rnd() < .5 ? rnd() * 110 : H - rnd() * 110, 26 + rnd() * 26]);

  // ---------- état reçu du serveur ----------
  function maj(etat) { if (etat?.type === 'temple') { if (!E || E.phase !== etat.phase || E.etape !== etat.etape) recu = performance.now(); E = etat; } else E = null; }
  // temps écoulé dans la phase, en secondes (horloge du serveur via SJ.now)
  const depuisDebut = () => E?.debut ? (SJ.now() - E.debut) / 1000 : (performance.now() - recu) / 1000;

  function segment(i) { // ce qu'on sait du chemin i (0 = première étape)
    if (i < E.passees.length) return { ...E.passees[i], declenche: 9 };
    if (i === E.etape - 1) {
      const tt = depuisDebut();
      return { gauche: E.gauche, droite: E.droite, decorG: E.decorG, decorD: E.decorD, piege: E.piege,
        declenche: E.phase === 'resultat' && tt >= PIEGE ? tt - PIEGE : E.phase === 'arrivee' || E.phase === 'fini' ? 9 : -1 };
    }
    return null; // pas encore découvert
  }

  // ---------- dessin ----------
  function frame() {
    const cv = document.getElementById('tp-carte');
    if (!cv || !E) { boucle = false; return; }
    if (!ctx || ctx.canvas !== cv) ctx = cv.getContext('2d');
    try { dessiner(); } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  function demarrer() { if (!boucle) { boucle = true; requestAnimationFrame(frame); } }

  function dessiner() {
    const tt = depuisDebut(), k = E.etape - 1;
    // caméra : sur l'étape en cours ; au début d'une étape, elle glisse depuis la précédente
    const centre = i => nodeX(i) + SEG / 2;
    const glisse = E.phase === 'choix' && k > 0 ? ease(clamp(tt / 1.2, 0, 1)) : 1;
    let camX = (E.phase === 'arrivee' || E.phase === 'fini' ? nodeX(E.total) - 120 : centre(k - 1) + (centre(k) - centre(k - 1)) * glisse) - W / 2;
    const secousse = calme ? 0 : E.phase === 'resultat' && tt > 1.1 && tt < PIEGE ? (tt - 1.1) * 4 : E.phase === 'resultat' && tt >= PIEGE && tt < PIEGE + .4 ? 10 : 0;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.translate(-camX + (Math.random() - .5) * secousse, (Math.random() - .5) * secousse);
    sol(camX);
    for (let i = 0; i < E.total; i++) for (const c of [-1, 1]) chemin(i, c, !segment(i));
    for (let i = 0; i < E.total; i++) { const s = segment(i); if (s) for (const c of [-1, 1]) decor(i, c, s, false); }
    for (let i = 0; i <= E.total; i++) plateforme(i);
    temple(nodeX(E.total) + 150, Y0);
    persos(tt, k);
    for (let i = 0; i < E.total; i++) { const s = segment(i); if (s) for (const c of [-1, 1]) decor(i, c, s, true); }
    for (let i = k + 1; i < E.total; i++) for (const c of [-1, 1]) inconnu(i, c);
    if (E.phase === 'choix' || E.phase === 'resultat') panneaux(k);
    ctx.restore();
    if (E.phase === 'resultat' && tt >= PIEGE) bandeau(E.message || '');
  }

  function sol(camX) {
    ctx.fillStyle = '#1d3b24'; ctx.fillRect(camX - 50, -50, W + 100, H + 100);
    for (const [x, y, r, v] of TOUFFES) if (x > camX - 30 && x < camX + W + 30) { ctx.fillStyle = v < .5 ? '#234a2c' : '#183420'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    for (const [x, y, r] of ARBRES) if (x > camX - 60 && x < camX + W + 60) arbre(x, y, r);
  }
  function arbre(x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(x + 6, y + 8, r, 0, 7); ctx.fill();
    ctx.fillStyle = '#2d6b3a'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.fillStyle = '#3b8247'; ctx.beginPath(); ctx.arc(x - r * .25, y - r * .25, r * .6, 0, 7); ctx.fill();
  }
  function trace(i, c) { ctx.beginPath(); for (let n = 0; n <= 40; n++) { const [x, y] = pt(i, c, n / 40); n ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } }
  function chemin(i, c, flou) {
    ctx.save(); ctx.globalAlpha = flou ? .45 : 1; ctx.lineCap = 'round';
    trace(i, c); ctx.strokeStyle = '#6e5634'; ctx.lineWidth = 50; ctx.stroke();
    trace(i, c); ctx.strokeStyle = '#b89a63'; ctx.lineWidth = 40; ctx.stroke();
    ctx.setLineDash([2, 14]); trace(i, c); ctx.strokeStyle = 'rgba(80,60,30,.5)'; ctx.lineWidth = 30; ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }
  function inconnu(i, c) { // étape pas encore découverte : un buisson et un point d'interrogation
    const [x, y] = pt(i, c, .5);
    ctx.fillStyle = 'rgba(20,40,26,.85)'; ctx.beginPath(); ctx.arc(x, y, 40, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(241,231,207,.55)'; ctx.font = '34px Rye, Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', x, y + 2);
  }
  function plateforme(i) {
    const x = nodeX(i);
    ctx.fillStyle = '#5c5442'; ctx.beginPath(); ctx.arc(x, Y0, 56, 0, 7); ctx.fill();
    ctx.fillStyle = '#8a7e62'; ctx.beginPath(); ctx.arc(x, Y0, 48, 0, 7); ctx.fill();
    ctx.strokeStyle = '#e3b341'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(x, Y0, 38, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  function temple(x, y) {
    const tailles = [150, 118, 86, 54, 26], couleurs = ['#6b5a33', '#8a7340', '#a88c4a', '#c9a650', '#e3b341'];
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - 63, y - 63, 150, 150);
    tailles.forEach((s, i) => { ctx.fillStyle = couleurs[i]; ctx.fillRect(x - s / 2, y - s / 2, s, s); });
    for (let n = 0; n < 6; n++) { ctx.fillStyle = n % 2 ? '#6b5a33' : '#a88c4a'; ctx.fillRect(x - 135 + n * 10, y - 14, 5, 28); }
    ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💰', x, y);
  }
  function panneaux(k) {
    for (const [c, txt] of [[-1, E.gauche], [1, E.droite]]) {
      const [x, y] = pt(k, c, .5), py = y + c * 132;
      ctx.font = '22px Rye, Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(txt).width + 28;
      ctx.fillStyle = 'rgba(30,22,12,.88)'; ctx.fillRect(x - w / 2, py - 18, w, 36);
      ctx.strokeStyle = '#e3b341'; ctx.lineWidth = 2; ctx.strokeRect(x - w / 2, py - 18, w, 36);
      ctx.fillStyle = '#f1e7cf'; ctx.fillText(txt, x, py + 1);
    }
  }
  function bandeau(msg) {
    ctx.font = '34px Rye, Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.min(SEG - 150, ctx.measureText(msg).width + 56);
    // au centre, dans l'herbe entre les deux chemins (les panneaux sont en haut et en bas)
    ctx.fillStyle = 'rgba(10,8,5,.82)'; ctx.fillRect(W / 2 - w / 2, Y0 - 28, w, 56);
    ctx.fillStyle = '#ff8a7e'; ctx.fillText(msg, W / 2, Y0 + 1, SEG - 190);
  }

  // Ravin : une faille sombre qui coupe le chemin (sert aussi pour la liane)
  function faille() {
    ctx.fillStyle = '#3d3628'; ctx.beginPath();
    ctx.moveTo(-34, -120); ctx.lineTo(-18, -60); ctx.lineTo(-30, 0); ctx.lineTo(-16, 60); ctx.lineTo(-28, 120);
    ctx.lineTo(28, 120); ctx.lineTo(18, 60); ctx.lineTo(32, 0); ctx.lineTo(20, -60); ctx.lineTo(34, -120); ctx.closePath(); ctx.fill();
    const fond = ctx.createLinearGradient(-26, 0, 26, 0); fond.addColorStop(0, '#050403'); fond.addColorStop(.5, '#16110b'); fond.addColorStop(1, '#050403');
    ctx.fillStyle = fond; ctx.beginPath();
    ctx.moveTo(-24, -116); ctx.lineTo(-10, -60); ctx.lineTo(-22, 0); ctx.lineTo(-8, 60); ctx.lineTo(-20, 116);
    ctx.lineTo(20, 116); ctx.lineTo(10, 60); ctx.lineTo(24, 0); ctx.lineTo(12, -60); ctx.lineTo(24, -116); ctx.closePath(); ctx.fill();
  }
  function poussiere(d, r = 60) { if (d < 1.6) { ctx.fillStyle = `rgba(180,160,120,${.45 * (1 - d / 1.6)})`; ctx.beginPath(); ctx.arc(0, 0, r * .5 + d * r, 0, 7); ctx.fill(); } }
  // Point où la liane est accrochée (une grosse branche côté extérieur du chemin)
  const ancre = (i, c) => { const [x, y] = pt(i, c, .5); return [x, y + c * 78]; };

  function decor(i, c, s, dessus) {
    const cote = c < 0 ? 'gauche' : 'droite', style = c < 0 ? s.decorG : s.decorD;
    const depuis = s.piege === cote && s.declenche >= 0 ? s.declenche : -1, casse = depuis >= 0;
    const now = performance.now() / 1000;
    const [mx, my] = pt(i, c, .5);
    ctx.save(); ctx.translate(mx, my);
    if (style === 'eau' && !dessus) { // plan d'eau et pont de bois
      ctx.fillStyle = '#1f5d7a'; ctx.beginPath(); ctx.ellipse(0, 0, 70, 95, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#2f7da0'; ctx.beginPath(); ctx.ellipse(-8, -6, 52, 76, 0, 0, 7); ctx.fill();
      for (let n = -6; n <= 6; n++) {
        const tombe = casse ? clamp(depuis * 3 - Math.abs(n) * .15, 0, 1) : 0;
        if (tombe >= 1) continue;
        ctx.globalAlpha = 1 - tombe; ctx.fillStyle = n % 2 ? '#8a5a2c' : '#a06a34'; ctx.fillRect(n * 11 - 4, -24 + tombe * 30, 8, 48);
      }
      ctx.globalAlpha = 1;
      if (!casse) { ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-72, -26); ctx.lineTo(72, -26); ctx.moveTo(-72, 26); ctx.lineTo(72, 26); ctx.stroke(); }
      if (casse && depuis < 2) for (let n = 0; n < 3; n++) { ctx.strokeStyle = `rgba(220,240,255,${Math.max(0, .8 - depuis * .5 - n * .15)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 10 + depuis * 60 + n * 14, 0, 7); ctx.stroke(); }
    }
    if (style === 'tunnel') {
      if (!dessus) { for (const sx of [-1, 1]) { ctx.fillStyle = '#0b0906'; ctx.beginPath(); ctx.ellipse(sx * 78, 0, 14, 26, 0, 0, 7); ctx.fill(); } }
      else { // le rocher couvre le chemin : on ne voit pas qui est dedans
        const cr = casse ? clamp(depuis * 1.5, 0, 1) : 0;
        ctx.fillStyle = '#4a4136'; ctx.beginPath(); ctx.ellipse(0, 0, 82, 54 + cr * 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#5f5446'; ctx.beginPath(); ctx.ellipse(-10, -10, 60, 34, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#2e6b37'; for (const [x, y] of [[-40, -30], [30, -36], [50, 20], [-30, 30]]) { ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill(); }
        if (casse) {
          ctx.strokeStyle = '#120d07'; ctx.lineWidth = 3; ctx.beginPath();
          ctx.moveTo(-50, -10); ctx.lineTo(-10, 6); ctx.lineTo(20, -14); ctx.lineTo(56, 8); ctx.moveTo(-10, 6); ctx.lineTo(-4, 34); ctx.stroke();
          for (let n = 0; n < 7; n++) { const a = n * .9, d = 40 + cr * 60; ctx.fillStyle = '#6b6050'; ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d * .7, 7, 0, 7); ctx.fill(); }
          poussiere(depuis, 70);
        }
      }
    }
    if (style === 'jungle' && dessus) {
      for (const [x, y, r] of [[-60, -44, 30], [50, -50, 34], [-40, 48, 32], [64, 40, 28], [0, -64, 22]]) arbre(x, y, r);
      if (casse && depuis < 2.5) { // le léopard bondit sur le chemin
        const p = clamp(depuis * 2, 0, 1), lx = -90 + p * 90, ly = -70 + p * 70;
        ctx.fillStyle = '#d9a440'; ctx.beginPath(); ctx.ellipse(lx, ly, 26, 13, .7, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(lx + 20, ly + 18, 10, 0, 7); ctx.fill();
        ctx.fillStyle = '#3a2a14'; for (const [dx, dy] of [[-8, -4], [4, 2], [-2, 6], [10, -6], [-14, 4]]) { ctx.beginPath(); ctx.arc(lx + dx, ly + dy, 2.5, 0, 7); ctx.fill(); }
        ctx.strokeStyle = '#d9a440'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(lx - 22, ly - 12); ctx.quadraticCurveTo(lx - 40, ly - 30, lx - 30, ly - 44); ctx.stroke();
      }
    }
    if (style === 'marais' && !dessus) {
      ctx.fillStyle = '#4a4a22'; ctx.beginPath(); ctx.ellipse(0, 0, 80, 70, .3, 0, 7); ctx.fill();
      ctx.fillStyle = '#5d5a2a'; ctx.beginPath(); ctx.ellipse(-6, 4, 58, 48, .3, 0, 7); ctx.fill();
      for (let n = 0; n < (casse ? 10 : 5); n++) { ctx.strokeStyle = 'rgba(200,200,120,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(Math.cos(n * 2.1) * 34, Math.sin(n * 1.7) * 26, 3 + ((now * 1.6 + n * .37) % 1) * 6, 0, 7); ctx.stroke(); }
    }
    if (style === 'pierre' && !dessus) {
      for (let n = -5; n <= 5; n++) { ctx.fillStyle = n % 2 ? '#8a8270' : '#a39a84'; ctx.fillRect(n * 12 - 6, -22, 12, 44); }
      for (const sy of [-1, 1]) for (const x of [-50, 0, 50]) { ctx.fillStyle = '#6b6658'; ctx.fillRect(x - 9, sy * 42 - 9, 18, 18); ctx.fillStyle = '#8f8a7a'; ctx.fillRect(x - 6, sy * 42 - 6, 12, 12); }
      if (casse && depuis < 2.5) { const p = clamp(depuis * 3, 0, 1); ctx.fillStyle = '#cfc7b0';
        for (let n = -4; n <= 4; n++) for (const y of [-12, 4]) { ctx.beginPath(); ctx.moveTo(n * 14 - 4, y + 8); ctx.lineTo(n * 14, y + 8 - 14 * p); ctx.lineTo(n * 14 + 4, y + 8); ctx.fill(); } }
    }
    if (style === 'volcan') {
      if (!dessus) {
        ctx.fillStyle = '#2b2420'; ctx.beginPath(); ctx.ellipse(0, 0, 96, 84, .2, 0, 7); ctx.fill();
        const flot = casse ? clamp(depuis * 1.4, 0, 1) : 0, g = ctx.createRadialGradient(0, 0, 8, 0, 0, 72 + flot * 18);
        g.addColorStop(0, '#ffd34d'); g.addColorStop(.5, '#ff7a1a'); g.addColorStop(1, '#a8240c');
        ctx.globalAlpha = .85 + Math.sin(now * 3) * .15; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 72 + flot * 18, 58 + flot * 16, .2, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        for (let n = -2; n <= 2; n++) { // pierres de gué, englouties pendant l'éruption
          const coule = casse ? clamp(depuis * 2 - (2 - Math.abs(n)) * .2, 0, 1) : 0;
          if (coule >= 1) continue;
          ctx.globalAlpha = 1 - coule; ctx.fillStyle = '#3a312a'; ctx.beginPath(); ctx.ellipse(n * 28, Math.sin(n) * 4, 14 * (1 - coule * .5), 11 * (1 - coule * .5), 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#5a4d40'; ctx.beginPath(); ctx.ellipse(n * 28 - 3, Math.sin(n) * 4 - 3, 7, 5, 0, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (casse && depuis < 3) {
        ctx.globalAlpha = clamp(1 - depuis / 3, 0, 1);
        for (let n = 0; n < 10; n++) { const a = n * .63, d = depuis * (60 + (n % 3) * 30), h = Math.sin(clamp(depuis * 1.2, 0, 1) * Math.PI) * 50;
          ctx.fillStyle = n % 2 ? '#ffb02e' : '#ff5a1a'; ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d * .8 - h, 6 - (n % 3), 0, 7); ctx.fill(); }
        ctx.fillStyle = 'rgba(60,55,50,.5)'; for (let n = 0; n < 4; n++) { ctx.beginPath(); ctx.arc(-20 + n * 14, -30 - depuis * 30 - n * 8, 20 + depuis * 10, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1;
      } else if (!casse) {
        ctx.fillStyle = 'rgba(80,72,64,.35)'; for (let n = 0; n < 3; n++) { const v = (now * .4 + n / 3) % 1; ctx.beginPath(); ctx.arc(-30 + n * 30, -40 - v * 40, 8 + v * 12, 0, 7); ctx.fill(); }
      }
    }
    if (style === 'ravin' && !dessus) { // faille et arche de pierre étroite qui se brise
      faille();
      for (let n = -2; n <= 2; n++) {
        const chute = casse ? clamp(depuis * 2.2 - Math.abs(n) * .25, 0, 1) : 0;
        if (chute >= 1) continue;
        const e = 1 - chute * .7;
        ctx.globalAlpha = 1 - chute; ctx.fillStyle = n % 2 ? '#8a7e62' : '#9d9073'; ctx.fillRect(n * 11 - 5 * e, -15 * e + chute * 8, 10 * e, 30 * e);
      }
      ctx.globalAlpha = 1;
      if (casse) poussiere(depuis, 50);
    }
    if (style === 'liane') { // faille à franchir en se balançant au bout d'une liane accrochée à un grand arbre
      const ay = c * 78;
      if (!dessus) {
        faille();
        // bords du ravin : petites plateformes d'élan de chaque côté
        for (const sx of [-1, 1]) { ctx.fillStyle = '#9d8a62'; ctx.beginPath(); ctx.ellipse(sx * 46, 0, 14, 22, 0, 0, 7); ctx.fill(); }
      } else {
        // la liane pend de la branche ; quand le piège se déclenche, elle casse et seul un bout reste accroché
        const long = casse ? .3 : .65, bal = Math.sin(now * 1.5) * (casse ? 10 : 6);
        ctx.strokeStyle = '#4c7a2a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, ay); ctx.quadraticCurveTo(bal, ay * (1 - long / 2), bal * .6, ay * (1 - long)); ctx.stroke();
        arbre(0, ay + c * 26, 34); // le grand arbre (vu du dessus) au bout de la branche
        ctx.strokeStyle = '#5b3a1c'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, ay + c * 20); ctx.lineTo(0, ay); ctx.stroke();
      }
    }
    if (style === 'escalade') { // une paroi rocheuse en travers du chemin, à grimper avec une corde
      if (!dessus) {
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(14, -110, 40, 220); // ombre portée : la paroi est haute
        ctx.fillStyle = '#7a6a52'; ctx.fillRect(-40, -110, 60, 220);
        ctx.fillStyle = '#8f7e62'; for (let n = 0; n < 9; n++) ctx.fillRect(-40 + (n % 3) * 20, -110 + n * 24, 18, 20);
        ctx.fillStyle = '#5a4c38'; ctx.fillRect(14, -110, 6, 220);
        const prises = ['#e7584f', '#f2c53d', '#5b9bf5', '#8bd450'];
        for (let n = 0; n < 6; n++) { if (casse && n % 2 && depuis > .1 * n) continue; ctx.fillStyle = prises[n % 4]; ctx.beginPath(); ctx.arc(-30 + n * 9, (n % 2 ? -8 : 8), 4, 0, 7); ctx.fill(); }
        ctx.strokeStyle = '#d9c9a0'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]); ctx.beginPath(); ctx.moveTo(-60, 2); ctx.lineTo(40, 2); ctx.stroke(); ctx.setLineDash([]);
      } else if (casse && depuis < 2.4) { // des pierres dégringolent de la paroi
        for (let n = 0; n < 6; n++) {
          const d = clamp(depuis * 1.6 - n * .12, 0, 1), x = -24 + (n % 3) * 18, y = -60 + n * 10;
          if (d <= 0) continue;
          const z = (1 - d) * 40; // hauteur : plus la pierre est haute, plus elle est grosse et son ombre petite
          ctx.fillStyle = `rgba(0,0,0,${.3 * d})`; ctx.beginPath(); ctx.ellipse(x, y + 10, 8 * d, 5 * d, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#6b6050'; ctx.beginPath(); ctx.arc(x + z * .2, y - z, 7 + (1 - d) * 6, 0, 7); ctx.fill();
        }
        poussiere(depuis, 50);
      }
    }
    if (style === 'serpents') {
      const serpent = (x, y, a, long, phase, attaque) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.strokeStyle = '#3f8f2f'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath();
        for (let n = 0; n <= 14; n++) { const u = n / 14, px = -long * (1 - u), py = Math.sin(u * 9 + phase) * 6 * (1 - u * .6); n ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.stroke(); ctx.strokeStyle = '#d9c35a'; ctx.lineWidth = 2; ctx.setLineDash([3, 6]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#2f7a24'; ctx.beginPath(); ctx.ellipse(4, 0, 8, 6, 0, 0, 7); ctx.fill();
        if (attaque) { ctx.strokeStyle = '#e04848'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(18, -3); ctx.moveTo(11, 0); ctx.lineTo(18, 3); ctx.stroke(); }
        ctx.restore();
      };
      const nid = [[-40, -40, .3, 0], [30, -44, 2.6, 1.5], [-30, 42, -.4, 3], [44, 38, -2.8, 4.5]];
      if (!dessus) {
        ctx.fillStyle = '#3b3320'; ctx.beginPath(); ctx.ellipse(0, 0, 90, 64, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#4a4128'; ctx.beginPath(); ctx.ellipse(0, 0, 70, 22, 0, 0, 7); ctx.fill();
        if (!casse) for (const [x, y, a, ph] of nid) serpent(x, y, a, 40, now * 4 + ph, false);
      } else if (casse) {
        const p = clamp(depuis * 3, 0, 1);
        for (const [x, y, a, ph] of nid) serpent(x * (1 - p * .7), y * (1 - p * .7), a + (a > 0 ? .6 : -.5) * p, 40 + p * 10, now * 9 + ph, p > .5);
      }
    }
    ctx.restore();
  }

  // ---------- les explorateurs ----------
  function perso(x, y, j, alpha = 1, echelle = 1) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(echelle * 1.4, echelle * 1.4);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(3, 5, 15, 11, 0, 0, 7); ctx.fill();
    ctx.fillStyle = COULEURS[j % COULEURS.length]; ctx.beginPath(); ctx.ellipse(0, 0, 15, 10, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#d9a877'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill();
    ctx.fillStyle = '#5a3b1f'; ctx.beginPath(); ctx.arc(0, -1.5, 6, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.restore();
  }
  const embleme = (txt, x, y, alpha = 1) => { ctx.globalAlpha = alpha; ctx.font = '24px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y); ctx.globalAlpha = 1; };
  // Place de chacun sur une plateforme : petit groupe sur 2 colonnes (3 au-delà de 6 joueurs)
  function place(j, n) {
    const cols = n > 6 ? 3 : 2, rows = Math.ceil(n / cols), cx = j % cols, cy = Math.floor(j / cols);
    return [(cx - (cols - 1) / 2) * 30, (cy - (rows - 1) / 2) * 28];
  }
  function lieuMort(p) { // là où un joueur éliminé est tombé : au milieu du chemin piégé de l'étape de sa chute
    const e = p.mort - 1, s = segment(e);
    return s ? pt(e, s.piege === 'gauche' ? -1 : 1, .45) : [nodeX(e), Y0];
  }

  function persos(tt, k) {
    const n = E.joueurs.length, rev = E.phase === 'resultat', cur = segment(k);
    E.joueurs.forEach((p, j) => {
      const [px, py] = place(j, n);
      const tombeIci = rev && p.perdu; // tombé dans le piège à cette étape
      if (!(p.vies > 0) && !tombeIci) { const [x, y] = lieuMort(p); embleme('☠️', x + (j % 3 - 1) * 14, y); return; }
      if (E.phase === 'arrivee' || E.phase === 'fini') { perso(nodeX(E.total) + px, Y0 + py, j); return; }
      if (E.phase === 'choix') { // tout le monde attend sur la plateforme de départ de l'étape
        perso(nodeX(k) + px, Y0 + py + (calme ? 0 : Math.sin(performance.now() / 330 + j) * 1.5), j); return;
      }
      // révélation : départ, arrêt juste avant l'obstacle (suspense), puis le piège
      const c = p.choix === 'gauche' ? -1 : 1, style = c < 0 ? cur.decorG : cur.decorD;
      const rang = E.joueurs.filter((q, i) => i < j && q.choix === p.choix && (q.vies > 0 || q.perdu)).length, retard = rang * .06;
      const approche = (tt < 1.1 ? ease(tt / 1.1) * .4 : .4) - retard;
      if (tombeIci) {
        let x, y, alpha = 1, echelle = 1;
        [x, y] = pt(k, c, Math.max(0, approche));
        if (tt >= PIEGE) {
          const d = tt - PIEGE;
          const u = .4 - retard + clamp(d, 0, .35) * .3;
          [x, y] = pt(k, c, u);
          if (style === 'liane' && d < .45) { // il s'élance au bout de la liane… qui casse
            const [ax, ay] = ancre(k, c); ctx.strokeStyle = '#4c7a2a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(x, y); ctx.stroke();
            echelle = 1.25;
          } else { echelle = Math.max(0, 1 - (d - (style === 'liane' ? .45 : 0)) * 1.3); alpha = Math.max(0, 1 - d * 1.1); }
          if (tt >= PIEGE + 1.3) { // réapparition à la plateforme suivante, en clignotant ; ou ☠️ s'il n'a plus de vie
            if (!(p.vies > 0)) { const [mx, my] = pt(k, c, .45); embleme('☠️', mx + (rang - 1) * 14, my, clamp(tt - PIEGE - 1.3, 0, 1)); return; }
            const d2 = tt - PIEGE - 1.3;
            [x, y] = [nodeX(k + 1) + px, Y0 + py]; echelle = 1;
            alpha = d2 < 1.8 && Math.floor(d2 * 8) % 2 ? .15 : 1;
            if (d2 < 1.8) embleme('💔', x, y - 34 - d2 * 12, clamp(1.8 - d2, 0, 1));
          }
        }
        if (alpha > 0 && echelle > 0) perso(x, y, j, alpha, echelle);
        return;
      }
      // passage sûr : on traverse, puis on rejoint sa place sur la plateforme suivante
      const u = tt < 1.1 ? ease(tt / 1.1) * .4 : tt < PIEGE ? .4 : .4 + ease(clamp((tt - PIEGE) / 1.7, 0, 1)) * .6;
      let [x, y] = pt(k, c, clamp(u - retard * (1 - ease(clamp((tt - PIEGE - .6) / 1, 0, 1))), 0, 1));
      let echelle = 1;
      const uu = u - retard;
      if (style === 'liane' && uu > .42 && uu < .58) { const [ax, ay] = ancre(k, c); ctx.strokeStyle = '#4c7a2a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(x, y); ctx.stroke(); echelle = 1.3; }
      if (style === 'escalade' && uu > .44 && uu < .56) echelle = 1.15;
      const arr = ease(clamp((tt - PIEGE - 1.5) / .6, 0, 1));
      if (arr > 0) { x += (nodeX(k + 1) + px - x) * arr; y += (Y0 + py - y) * arr; }
      perso(x, y, j, 1, echelle);
    });
  }

  return { maj, demarrer, COULEURS, NOMS_COULEURS, PIEGE };
})();
