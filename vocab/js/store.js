// Persistence in localStorage. Everything lives in one JSON document.

const KEY = 'vokabo.v1';

const DEFAULT_SETTINGS = {
  apiKey: '',
  scan: 'auto',
  sound: true,
  confetti: true,
  theme: 'auto',
  lastMode: 'write',
  direction: 'mix',
  length: '20',
  order: 'random',
  speak: false,
  strict: false,
  articles: false,
  crop: true,
};

function blank() {
  return { decks: [], sessions: [], settings: { ...DEFAULT_SETTINGS }, achievements: {}, counters: {} };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const d = JSON.parse(raw);
    return {
      decks: Array.isArray(d.decks) ? d.decks : [],
      sessions: Array.isArray(d.sessions) ? d.sessions : [],
      settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
      achievements: d.achievements && typeof d.achievements === 'object' ? d.achievements : {},
      counters: d.counters && typeof d.counters === 'object' ? d.counters : {},
    };
  } catch {
    return blank();
  }
}

export const db = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // Storage full or blocked (private mode): the app keeps working in memory.
  }
}

export function replaceAll(data) {
  const fresh = blank();
  db.decks = Array.isArray(data.decks) ? data.decks : fresh.decks;
  db.sessions = Array.isArray(data.sessions) ? data.sessions : fresh.sessions;
  db.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  db.achievements = data.achievements && typeof data.achievements === 'object' ? data.achievements : {};
  db.counters = data.counters && typeof data.counters === 'object' ? data.counters : {};
  save();
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function newWord(en, de) {
  return { id: uid(), en, de, stats: { seen: 0, correct: 0, wrong: 0, box: 0, time: 0, last: 0 } };
}

export function bump(counter, by = 1) {
  db.counters[counter] = (db.counters[counter] || 0) + by;
  save();
}

export function getDeck(id) {
  return db.decks.find((d) => d.id === id);
}
