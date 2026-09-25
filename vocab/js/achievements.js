// Badges and XP levels. Every badge is derived from data the app already keeps
// (sessions, decks, word stats, a few counters), so they also unlock
// retroactively for things done before this feature existed.

const MODE_COUNT = 7;

function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function longestDayRun(sessions) {
  const days = [...new Set(sessions.map((s) => dayKey(s.endedAt)))]
    .map((k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m, d).getTime(); })
    .sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const t of days) {
    run = prev != null && Math.round((t - prev) / 86400000) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

// Facts about the player that the badges are checked against
export function playerFacts(db) {
  const s = db.sessions;
  const words = db.decks.flatMap((d) => d.words);
  const perDay = {};
  for (const x of s) perDay[dayKey(x.endedAt)] = (perDay[dayKey(x.endedAt)] || 0) + (x.durationMs || 0);
  const big = s.filter((x) => x.total >= 10);
  return {
    rounds: s.length,
    answers: s.reduce((n, x) => n + x.total, 0),
    xp: s.reduce((n, x) => n + (x.xp || 0), 0),
    bestStreak: Math.max(0, ...s.map((x) => x.bestStreak || 0)),
    perfect: big.some((x) => x.correct === x.total),
    quick: big.some((x) => x.accuracy >= 0.8 && x.avgMs < 2000),
    sprintBest: Math.max(0, ...s.filter((x) => x.mode === 'sprint').map((x) => x.total)),
    modes: new Set(s.map((x) => x.mode)).size,
    night: s.some((x) => new Date(x.endedAt).getHours() >= 22),
    early: s.some((x) => new Date(x.endedAt).getHours() < 7),
    comeback: s.some((x) => x.mistakes && x.total >= 3 && x.correct === x.total),
    dayRun: longestDayRun(s),
    bestDayMin: Math.max(0, ...Object.values(perDay)) / 60000,
    words: words.length,
    mastered: words.filter((w) => (w.stats?.box || 0) >= 4).length,
    decks: db.decks.length,
    scans: db.counters.scans || 0,
    shares: db.counters.shares || 0,
    imports: db.counters.imports || 0,
  };
}

const flag = (v) => [v ? 1 : 0, 1];

// progress(facts) → [current, target]
export const ACHIEVEMENTS = [
  { id: 'first', emoji: '🎉', name: 'First steps', desc: 'Finish your first round', progress: (f) => [f.rounds, 1] },
  { id: 'scanner', emoji: '📸', name: 'Scanner', desc: 'Scan a vocabulary sheet', progress: (f) => [f.scans, 1] },
  { id: 'perfect', emoji: '💯', name: 'Perfectionist', desc: 'Get 100% in a round of 10+ words', progress: (f) => flag(f.perfect) },
  { id: 'fire', emoji: '🔥', name: 'On fire', desc: '10 right answers in a row', progress: (f) => [f.bestStreak, 10] },
  { id: 'unstoppable', emoji: '☄️', name: 'Unstoppable', desc: '25 right answers in a row', progress: (f) => [f.bestStreak, 25] },
  { id: 'speed', emoji: '⚡', name: 'Speed demon', desc: '30 answers in one 60s Sprint', progress: (f) => [f.sprintBest, 30] },
  { id: 'quick', emoji: '🐇', name: 'Quick thinker', desc: 'Under 2s per answer with 80%+ right (10+ words)', progress: (f) => flag(f.quick) },
  { id: 'explorer', emoji: '🧭', name: 'Explorer', desc: 'Play every game mode', progress: (f) => [f.modes, MODE_COUNT] },
  { id: 'comeback', emoji: '💪', name: 'Comeback', desc: 'Get every word right in a “Practise mistakes” round', progress: (f) => flag(f.comeback) },
  { id: 'master25', emoji: '🏅', name: 'Word master', desc: 'Master 25 words', progress: (f) => [f.mastered, 25] },
  { id: 'master100', emoji: '👑', name: 'Vocab royalty', desc: 'Master 100 words', progress: (f) => [f.mastered, 100] },
  { id: 'collector', emoji: '📚', name: 'Collector', desc: 'Save 100 words', progress: (f) => [f.words, 100] },
  { id: 'librarian', emoji: '🗂️', name: 'Librarian', desc: 'Have 5 decks', progress: (f) => [f.decks, 5] },
  { id: 'habit', emoji: '📅', name: 'Good habit', desc: 'Practise 3 days in a row', progress: (f) => [f.dayRun, 3] },
  { id: 'week', emoji: '🗓️', name: 'Week warrior', desc: 'Practise 7 days in a row', progress: (f) => [f.dayRun, 7] },
  { id: 'month', emoji: '🏆', name: 'Unbreakable', desc: 'Practise 30 days in a row', progress: (f) => [f.dayRun, 30] },
  { id: 'gym', emoji: '🧠', name: 'Brain gym', desc: 'Give 500 answers', progress: (f) => [f.answers, 500] },
  { id: 'rocket', emoji: '🚀', name: 'Rocket brain', desc: 'Give 2,000 answers', progress: (f) => [f.answers, 2000] },
  { id: 'marathon', emoji: '⏱️', name: 'Marathon', desc: 'Practise 30 minutes in one day', progress: (f) => [Math.floor(f.bestDayMin), 30] },
  { id: 'owl', emoji: '🦉', name: 'Night owl', desc: 'Practise after 10 pm', progress: (f) => flag(f.night) },
  { id: 'bird', emoji: '🐦', name: 'Early bird', desc: 'Practise before 7 am', progress: (f) => flag(f.early) },
  { id: 'sharer', emoji: '🤝', name: 'Sharing is caring', desc: 'Share a deck with someone', progress: (f) => [f.shares, 1] },
  { id: 'team', emoji: '📥', name: 'Team player', desc: 'Import a deck from a friend', progress: (f) => [f.imports, 1] },
  { id: 'level10', emoji: '⭐', name: 'Rising star', desc: 'Reach level 10', progress: (f) => [levelInfo(f.xp).level, 10] },
];

// Level L starts at 50·L·(L−1) XP: 0, 100, 300, 600, 1000, …
export function levelInfo(xp) {
  let level = 1;
  while (50 * (level + 1) * level <= xp) level++;
  const start = 50 * level * (level - 1);
  const next = 50 * (level + 1) * level;
  return { level, xp, into: xp - start, span: next - start };
}

// Marks newly earned badges in db.achievements and returns them
export function unlockNew(db) {
  const facts = playerFacts(db);
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (db.achievements[a.id]) continue;
    const [cur, target] = a.progress(facts);
    if (cur >= target) {
      db.achievements[a.id] = Date.now();
      fresh.push(a);
    }
  }
  return fresh;
}
