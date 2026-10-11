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

  return { enable, on, marcher, boom, fanfare };
})();
