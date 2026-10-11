import { randomBytes, randomInt } from 'node:crypto';

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function uid(n = 8) {
  return randomBytes(n).toString('hex');
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Nombre à `digits` chiffres, jamais dans `taken`.
export function randomCode(digits, taken = new Set()) {
  const lo = 10 ** (digits - 1), hi = 10 ** digits;
  for (;;) {
    const c = String(randomInt(lo, hi));
    if (!taken.has(c)) return c;
  }
}

// Codes tapés au pavé : on ne garde que les chiffres.
export function cleanCode(v) {
  return String(v ?? '').replace(/\D/g, '');
}

export function normName(s) {
  return String(s ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');
}

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (o[k] == null || typeof o[k] !== 'object') return false;
    o = o[k];
  }
  const last = keys.at(-1);
  if (!(last in o)) return false;
  const cur = o[last];
  if (typeof cur === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) return false;
    o[last] = n;
  } else if (typeof cur === 'boolean') {
    o[last] = Boolean(value);
  } else {
    o[last] = String(value ?? '');
  }
  return true;
}

// Fusionne une config sauvegardée dans la config par défaut (nouvelles clés gardées).
export function mergeDefaults(def, saved) {
  if (Array.isArray(def)) {
    if (!Array.isArray(saved)) return def;
    return saved.map((v, i) => mergeDefaults(def[i] ?? def[0], v));
  }
  if (def && typeof def === 'object') {
    const out = {};
    for (const k of Object.keys(def)) out[k] = saved && k in saved ? mergeDefaults(def[k], saved[k]) : def[k];
    return out;
  }
  if (saved === undefined || typeof saved !== typeof def) return def;
  return saved;
}
