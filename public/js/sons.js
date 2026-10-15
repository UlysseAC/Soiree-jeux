// Sons synthétisés (pas de fichiers audio) : bruits de pas, explosion, fanfare.
const Sons = (() => {
  let ac = null;
  function enable() {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    return ac.resume();
  }
  const on = () => !!ac && ac.state === 'running';

  function noise(dur, { freq = 800, q = 1, gain = .6, decay = dur } = {}) {
    if (!on()) return;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + decay);
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
  }

  // Un pas de botte : un coup sourd + le frottement.
  function pas() {
    noise(.12, { freq: 180, gain: .9, decay: .12 });
    setTimeout(() => noise(.06, { freq: 2200, gain: .12, decay: .06 }), 30);
  }

  let walking = null;
  function marcher(start) {
    if (start && !walking) {
      let i = 0;
      walking = setInterval(() => { pas(); i++; }, 620);
      pas();
    } else if (!start && walking) {
      clearInterval(walking);
      walking = null;
    }
  }

  function boom() { noise(.7, { freq: 900, gain: 1, decay: .7 }); }

  function fanfare() {
    if (!on()) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      const t = ac.currentTime + i * .16;
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(.25, t + .02);
      g.gain.exponentialRampToValueAtTime(.0001, t + (i === 3 ? .9 : .3));
      o.connect(g).connect(ac.destination);
      o.start(t); o.stop(t + 1);
    });
  }

  // Carillon d'annonce d'un round (Mini-Jeux) : deux notes.
  function gong() {
    if (!on()) return;
    [660, 880].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t = ac.currentTime + i * .28;
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(.3, t + .02);
      g.gain.exponentialRampToValueAtTime(.0001, t + 1.2);
      o.connect(g).connect(ac.destination);
      o.start(t); o.stop(t + 1.3);
    });
  }

  // Le Temple aztèque : roulement de tambour qui accélère (suspense), coup de tambour, pierre qui roule, flûte.
  function coup(gain = .8) { noise(.25, { freq: 140, gain, decay: .25 }); }
  function tambour(dur = 2.2) {
    if (!on()) return;
    let t = 0, gap = .22;
    while (t < dur) { const g = .35 + .5 * (t / dur); setTimeout(() => coup(g), t * 1000); t += gap; gap = Math.max(.06, gap * .88); }
  }
  function pierre() { noise(1.1, { freq: 110, q: 4, gain: .7, decay: 1.1 }); }
  function flute(notes = [587, 659, 784, 659]) {
    if (!on()) return;
    notes.forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t = ac.currentTime + i * .22;
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(.18, t + .04);
      g.gain.exponentialRampToValueAtTime(.0001, t + .5);
      o.connect(g).connect(ac.destination);
      o.start(t); o.stop(t + .55);
    });
  }

  return { enable, on, marcher, boom, fanfare, gong, coup, tambour, pierre, flute };
})();
