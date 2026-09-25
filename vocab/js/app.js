import { db, save, replaceAll, uid, newWord, getDeck } from './store.js';
import { ocrImage, aiScan, pairsFromText } from './scan.js';

// ---------- Tiny helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a) => a[(Math.random() * a.length) | 0];
const sum = (a) => a.reduce((x, y) => x + y, 0);
const avg = (a) => (a.length ? sum(a) / a.length : 0);
const pct = (x) => `${Math.round(x * 100)}%`;
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
function clock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
function niceDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function ago(t) {
  if (!t) return 'never';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- Constants ----------
const MODES = {
  write: { emoji: '⌨️', name: 'Type it', desc: 'See a word, type its translation. English or German at random.' },
  choice: { emoji: '🎯', name: 'Multiple choice', desc: 'Pick the right translation out of four options.' },
  match: { emoji: '🧩', name: 'Match pairs', desc: 'Tap the English and German words that belong together.' },
  build: { emoji: '🔤', name: 'Letter builder', desc: 'Build the translation from scrambled letter tiles.' },
  flash: { emoji: '🃏', name: 'Flashcards', desc: 'Flip each card and rate yourself honestly.' },
  mix: { emoji: '🎲', name: 'Mixed challenge', desc: 'Typing, multiple choice and letters, shuffled together.' },
  sprint: { emoji: '⚡', name: '60s Sprint', desc: 'Answer as many as you can before the clock runs out.' },
};
const TYPE_NAMES = { write: 'Typing', choice: 'Choice', build: 'Letters', flash: 'Flashcard', match: 'Match' };
const FLAG = { en: '🇬🇧', de: '🇩🇪' };
const LANG = { en: 'English', de: 'German' };
const SPRINT_MS = 60000;

const SAMPLE = [
  ['house', 'das Haus'], ['to travel', 'reisen'], ['beautiful', 'schön'], ['the weather', 'das Wetter'],
  ['to remember', 'sich erinnern'], ['journey, trip', 'die Reise'], ['always', 'immer'], ['tired', 'müde'],
  ['the key', 'der Schlüssel'], ['to explain', 'erklären'], ['difficult', 'schwierig'], ['the friendship', 'die Freundschaft'],
  ['to decide', 'entscheiden'], ['the kitchen', 'die Küche'], ['surprised', 'überrascht'], ['the bridge', 'die Brücke'],
  ['to be afraid', 'Angst haben'], ['the tree', 'der Baum'], ['quickly', 'schnell'], ['the neighbour', 'der Nachbar, die Nachbarin'],
];

// ---------- Theme, sound, speech ----------
function applyTheme() {
  const t = db.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

let audioCtx = null;
function sound(kind) {
  if (!db.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = { good: [659, 988], bad: [196, 147], tap: [520], done: [523, 659, 784, 1047] }[kind] || [440];
    const now = audioCtx.currentTime;
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = kind === 'bad' ? 'sawtooth' : 'sine';
      o.frequency.value = f;
      const t = now + i * (kind === 'done' ? 0.11 : 0.09);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(kind === 'bad' ? 0.06 : 0.14, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'tap' ? 0.08 : 0.22));
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.25);
    });
  } catch { /* audio unavailable */ }
}

// Native plugins, present only inside the Android app
const native = window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins : null;

function speak(text, lang) {
  if (native?.TextToSpeech) {
    native.TextToSpeech.stop().catch(() => {});
    native.TextToSpeech.speak({ text: String(text).replace(/\(.*?\)/g, ''), lang: lang === 'de' ? 'de-DE' : 'en-GB', rate: 0.95 })
      .catch(() => toast('Text-to-speech is not available on this device'));
    return;
  }
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(String(text).replace(/\(.*?\)/g, ''));
  u.lang = lang === 'de' ? 'de-DE' : 'en-GB';
  const v = speechSynthesis.getVoices().find((x) => x.lang.startsWith(lang === 'de' ? 'de' : 'en'));
  if (v) u.voice = v;
  u.rate = 0.95;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ---------- Answer checking ----------
function norm(s, requireArticles) {
  let x = String(s).toLowerCase().normalize('NFC');
  x = x.replace(/\(.*?\)|\[.*?\]/g, ' ');
  x = x.replace(/[.,!?¡¿"“”„'’‘`´:…]/g, '');
  x = x.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  x = x.replace(/\bsth\b/g, 'something').replace(/\bsb\b/g, 'somebody').replace(/\betw\b/g, 'etwas').replace(/\bjdn\b/g, 'jemanden').replace(/\bjdm\b/g, 'jemandem');
  x = x.replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!requireArticles) x = x.replace(/^(der|die|das|den|dem|des|ein|eine|einen|to|the|a|an) /, '');
  return x;
}
function alternatives(answer) {
  const parts = String(answer).split(/\s*[,;/]\s*/).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [String(answer)];
}
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
function checkAnswer(given, answer, opts) {
  const g = norm(given, opts.articles);
  if (!g) return 'bad';
  const alts = [answer, ...alternatives(answer)];
  let best = Infinity, bestLen = 0;
  for (const alt of alts) {
    const a = norm(alt, opts.articles);
    if (!a) continue;
    if (g === a) return 'good';
    const d = lev(g, a);
    if (d < best) { best = d; bestLen = a.length; }
  }
  if (!opts.strict) {
    const tol = bestLen >= 8 ? 2 : bestLen >= 4 ? 1 : 0;
    if (best <= tol) return 'warn';
  }
  return 'bad';
}

// ---------- Router ----------
const ui = {
  view: 'home',
  deckId: null,
  mode: db.settings.lastMode || 'write',
  draft: null,
  game: null,
  last: null,
  charts: {},
  scanCancel: false,
};

function show(view) {
  ui.view = view;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  $$('.navbtn').forEach((b) => b.classList.toggle('active', b.dataset.go === view || (view !== 'stats' && b.dataset.go === 'home')));
  document.body.dataset.view = view;
  window.scrollTo(0, 0);
  if (view === 'home') renderHome();
  if (view === 'stats') renderStats();
}

// ---------- Home ----------
function dayStreak() {
  const days = new Set(db.sessions.map((s) => dayKey(s.endedAt)));
  let n = 0;
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function deckMastery(deck) {
  if (!deck.words.length) return 0;
  return avg(deck.words.map((w) => Math.min(5, w.stats?.box || 0) / 5));
}

function renderHome() {
  const words = sum(db.decks.map((d) => d.words.length));
  const time = sum(db.sessions.map((s) => s.durationMs || 0));
  $('#home-kpis').innerHTML = [
    ['🔥', dayStreak(), 'day streak'],
    ['📚', words, 'words saved'],
    ['🎮', db.sessions.length, 'rounds played'],
    ['⏱️', niceDuration(time), 'time practised'],
  ].map(([i, v, l]) => `<div class="kpi"><strong>${i} ${esc(v)}</strong><span>${l}</span></div>`).join('');

  const useAi = db.settings.scan === 'ai' || (db.settings.scan === 'auto' && db.settings.apiKey);
  $('#scan-method-note').textContent = useAi
    ? 'Scanning with Claude AI (API key set in settings).'
    : 'Photos are read on your device with free text recognition. For handwriting, add a Claude API key in settings.';

  const list = $('#deck-list');
  if (!db.decks.length) {
    list.innerHTML = `<div class="card empty" style="grid-column:1/-1"><p><strong>No decks yet.</strong></p><p>Upload a photo of your vocabulary sheet above, or add the sample deck to try things out.</p></div>`;
    return;
  }
  const decks = [...db.decks].sort((a, b) => (b.lastPlayed || b.created) - (a.lastPlayed || a.created));
  list.innerHTML = decks.map((d) => {
    const m = deckMastery(d);
    const sample = d.words.slice(0, 4).map((w) => w.en).join(' · ');
    return `<article class="deck" data-id="${d.id}">
      <div class="deck-top">
        <h3>${esc(d.name)}</h3>
        <button class="row-del" data-act="delete" title="Delete deck" aria-label="Delete deck">🗑</button>
      </div>
      <div class="deck-meta"><span class="pill">${d.words.length} words</span><span class="pill">${pct(m)} mastered</span><span class="pill">🕒 ${ago(d.lastPlayed)}</span></div>
      <div class="deck-sample">${esc(sample)}</div>
      <div class="mastery" title="Mastery ${pct(m)}"><div style="width:${m * 100}%"></div></div>
      <div class="deck-actions">
        <button class="btn primary" data-act="play">Practise</button>
        <button class="btn" data-act="edit">Edit</button>
      </div>
    </article>`;
  }).join('');
}

$('#deck-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('.deck').dataset.id;
  const deck = getDeck(id);
  if (!deck) return;
  if (btn.dataset.act === 'play') openSetup(id);
  if (btn.dataset.act === 'edit') openEditor({ deckId: id, name: deck.name, rows: deck.words.map((w) => ({ id: w.id, en: w.en, de: w.de })), images: [] });
  if (btn.dataset.act === 'delete' && confirm(`Delete “${deck.name}”? Its session history is kept in your stats.`)) {
    db.decks = db.decks.filter((d) => d.id !== id);
    save();
    renderHome();
    toast('Deck deleted');
  }
});

$('#btn-sample').addEventListener('click', () => {
  const deck = { id: uid(), name: 'Sample · Everyday words', created: Date.now(), lastPlayed: 0, words: SAMPLE.map(([en, de]) => newWord(en, de)) };
  db.decks.push(deck);
  save();
  renderHome();
  toast('Sample deck added');
});

// ---------- Upload & scan ----------
const dz = $('#dropzone');
['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
dz.addEventListener('drop', (e) => {
  const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (files.length) startScan(files);
  else toast('Please drop image files');
});
$('#file-input').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) startScan(f); });
$('#camera-input').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) startScan(f); });
document.addEventListener('paste', (e) => {
  if (ui.view !== 'home' || !$('#modal-paste').hidden) return;
  const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (files.length) { e.preventDefault(); startScan(files); }
});

async function startScan(files) {
  ui.scanCancel = false;
  show('scan');
  const urls = files.map((f) => URL.createObjectURL(f));
  const wantsAi = db.settings.scan === 'ai' || (db.settings.scan === 'auto' && db.settings.apiKey);
  if (db.settings.scan === 'ai' && !db.settings.apiKey) toast('No API key set — using on-device scanning instead');
  const all = [];
  let swappedAny = false;
  for (let i = 0; i < files.length; i++) {
    if (ui.scanCancel) return;
    $('#scan-img').src = urls[i];
    $('#scan-title').textContent = files.length > 1 ? `Reading page ${i + 1} of ${files.length}…` : 'Reading your sheet…';
    const onProgress = (p, label) => {
      if (label) $('#scan-status').textContent = label;
      const frac = p == null ? 0.1 : 0.1 + p * 0.9;
      $('#scan-bar').style.width = `${((i + frac) / files.length) * 100}%`;
    };
    try {
      let res;
      if (wantsAi && db.settings.apiKey) {
        try {
          res = await aiScan(files[i], db.settings.apiKey, onProgress);
        } catch (err) {
          console.error(err);
          toast(`Claude scan failed (${err.message || err}). Falling back to on-device OCR.`, 4200);
          res = await ocrImage(files[i], onProgress);
        }
      } else {
        res = await ocrImage(files[i], onProgress);
      }
      if (res.swapped) swappedAny = true;
      all.push(...res.pairs);
      $('#scan-count').textContent = `${all.length} word pairs found so far`;
    } catch (err) {
      console.error(err);
      toast(`Could not read image ${i + 1}: ${err.message || err}`, 4200);
    }
  }
  if (ui.scanCancel) return;
  $('#scan-bar').style.width = '100%';
  const name = `Scanned ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  openEditor({ deckId: null, name, rows: all.length ? all : [{ en: '', de: '' }], images: urls, fromScan: true });
  if (!all.length) toast('No word pairs found. Try a sharper, straight photo — or type them in below.', 5000);
  else {
    const unsure = all.filter((p) => p.unsure).length;
    toast(`Found ${all.length} word pairs${swappedAny ? ' (columns swapped so English is on the left)' : ''}.${unsure ? ` ${unsure} highlighted row${unsure > 1 ? 's' : ''} may be misread.` : ' Give them a quick check!'}`, 4500);
  }
}
$('#btn-scan-cancel').addEventListener('click', () => { ui.scanCancel = true; show('home'); });

// Paste & manual
function openModal(id) { $(id).hidden = false; }
function closeModals() { $$('.modal').forEach((m) => { m.hidden = true; if (m.classList.contains('lightbox')) m.remove(); }); }
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-close]') || e.target.classList.contains('modal')) closeModals();
});
$('#btn-paste').addEventListener('click', () => { openModal('#modal-paste'); setTimeout(() => $('#paste-text').focus(), 50); });
$('#btn-paste-ok').addEventListener('click', () => {
  const { pairs, swapped } = pairsFromText($('#paste-text').value);
  if (!pairs.length) { toast('No pairs found — put one pair per line, like “house - das Haus”'); return; }
  closeModals();
  $('#paste-text').value = '';
  openEditor({ deckId: null, name: 'My word list', rows: pairs, images: [], fromScan: true });
  toast(`${pairs.length} pairs imported${swapped ? ' (columns swapped)' : ''}`);
});
$('#btn-manual').addEventListener('click', () => openEditor({ deckId: null, name: '', rows: [{ en: '', de: '' }, { en: '', de: '' }, { en: '', de: '' }], images: [], fromScan: true }));

// ---------- Editor ----------
function openEditor(draft) {
  ui.draft = draft;
  show('edit');
  $('#edit-title').textContent = draft.deckId ? 'Edit deck' : 'Check your words';
  $('#deck-name').value = draft.name;
  const sel = $('#save-target');
  $('#save-target-wrap').hidden = !!draft.deckId || !db.decks.length;
  sel.innerHTML = `<option value="">New deck</option>` + db.decks.map((d) => `<option value="${d.id}">Add to “${esc(d.name)}”</option>`).join('');
  const imgs = $('#edit-images');
  imgs.innerHTML = draft.images.map((u) => `<img src="${u}" alt="Uploaded page" />`).join('');
  $('.edit-layout').classList.toggle('no-images', !draft.images.length);
  renderRows();
}

function renderRows() {
  const rows = ui.draft.rows;
  $('#word-rows').innerHTML = rows.map((r, i) => `<tr data-i="${i}" class="${r.unsure ? 'unsure' : ''}" title="${r.unsure ? 'The scanner wasn’t sure about this row — please check it' : ''}">
      <td>${i + 1}</td>
      <td><input data-k="en" value="${esc(r.en)}" placeholder="English" class="${r.en.trim() ? '' : 'missing'}" /></td>
      <td><input data-k="de" value="${esc(r.de)}" placeholder="Deutsch" class="${r.de.trim() ? '' : 'missing'}" /></td>
      <td><button class="row-del" title="Remove" aria-label="Remove row">✕</button></td>
    </tr>`).join('');
  updateCount();
}
function updateCount() {
  const n = ui.draft.rows.filter((r) => r.en.trim() && r.de.trim()).length;
  const unsure = ui.draft.rows.filter((r) => r.unsure).length;
  $('#word-count').textContent = `${n} word${n === 1 ? '' : 's'}${unsure ? ` · ${unsure} to check` : ''}`;
}
$('#word-rows').addEventListener('input', (e) => {
  const inp = e.target.closest('input');
  if (!inp) return;
  const i = +inp.closest('tr').dataset.i;
  ui.draft.rows[i][inp.dataset.k] = inp.value;
  if (ui.draft.rows[i].unsure) { delete ui.draft.rows[i].unsure; inp.closest('tr').classList.remove('unsure'); updateCount(); }
  inp.classList.toggle('missing', !inp.value.trim());
  updateCount();
});
$('#word-rows').addEventListener('click', (e) => {
  if (!e.target.closest('.row-del')) return;
  const i = +e.target.closest('tr').dataset.i;
  ui.draft.rows.splice(i, 1);
  if (!ui.draft.rows.length) ui.draft.rows.push({ en: '', de: '' });
  renderRows();
});
$('#word-rows').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const tr = e.target.closest('tr');
  const i = +tr.dataset.i;
  if (e.target.dataset.k === 'en') { tr.querySelector('[data-k="de"]').focus(); return; }
  if (i === ui.draft.rows.length - 1) addRow();
  else $(`#word-rows tr[data-i="${i + 1}"] [data-k="en"]`).focus();
});
function addRow() {
  ui.draft.rows.push({ en: '', de: '' });
  renderRows();
  const last = $('#word-rows tr:last-child [data-k="en"]');
  last.focus();
  last.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
$('#btn-add-row').addEventListener('click', addRow);
$('#btn-swap').addEventListener('click', () => {
  ui.draft.rows = ui.draft.rows.map((r) => ({ ...r, en: r.de, de: r.en }));
  renderRows();
  toast('Columns swapped');
});
$('#btn-dedupe').addEventListener('click', () => {
  const seen = new Set();
  const before = ui.draft.rows.length;
  ui.draft.rows = ui.draft.rows.filter((r) => {
    const k = `${r.en.trim().toLowerCase()}|${r.de.trim().toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  renderRows();
  toast(`${before - ui.draft.rows.length} duplicate(s) removed`);
});
$('#btn-clear-empty').addEventListener('click', () => {
  ui.draft.rows = ui.draft.rows.filter((r) => r.en.trim() && r.de.trim());
  if (!ui.draft.rows.length) ui.draft.rows.push({ en: '', de: '' });
  renderRows();
});
$('#edit-images').addEventListener('click', (e) => {
  if (e.target.tagName !== 'IMG') return;
  const m = document.createElement('div');
  m.className = 'modal lightbox';
  m.innerHTML = `<div><img src="${e.target.src}" alt="Uploaded page, enlarged" /></div>`;
  document.body.appendChild(m);
});
$('#btn-edit-cancel').addEventListener('click', () => show('home'));

function saveDraft() {
  const d = ui.draft;
  const rows = d.rows.map((r) => ({ ...r, en: r.en.trim(), de: r.de.trim() })).filter((r) => r.en && r.de);
  if (!rows.length) { toast('Add at least one word with both English and German'); return null; }
  const name = $('#deck-name').value.trim() || 'My vocabulary';
  let deck;
  if (d.deckId) {
    deck = getDeck(d.deckId);
    const byId = new Map(deck.words.map((w) => [w.id, w]));
    deck.name = name;
    deck.words = rows.map((r) => {
      const w = r.id && byId.get(r.id);
      if (w) { w.en = r.en; w.de = r.de; return w; }
      return newWord(r.en, r.de);
    });
  } else if ($('#save-target').value && !$('#save-target-wrap').hidden) {
    deck = getDeck($('#save-target').value);
    const keys = new Set(deck.words.map((w) => `${w.en.toLowerCase()}|${w.de.toLowerCase()}`));
    let added = 0;
    for (const r of rows) {
      const k = `${r.en.toLowerCase()}|${r.de.toLowerCase()}`;
      if (!keys.has(k)) { deck.words.push(newWord(r.en, r.de)); keys.add(k); added++; }
    }
    toast(`${added} new word(s) added to “${deck.name}”`);
  } else {
    deck = { id: uid(), name, created: Date.now(), lastPlayed: 0, words: rows.map((r) => newWord(r.en, r.de)) };
    db.decks.push(deck);
  }
  save();
  return deck;
}
$('#btn-edit-save').addEventListener('click', () => { const deck = saveDraft(); if (deck) { toast('Deck saved'); show('home'); } });
$('#btn-edit-practice').addEventListener('click', () => { const deck = saveDraft(); if (deck) openSetup(deck.id); });

// ---------- Setup ----------
function modeCards(current, compact, justPlayed) {
  return Object.entries(MODES).map(([k, m]) => `<button class="mode ${k === current && !compact ? 'on' : ''}" data-mode="${k}">
      ${justPlayed === k ? '<span class="badge">just played</span>' : ''}
      <div class="emoji">${m.emoji}</div><strong>${m.name}</strong><span>${m.desc}</span>
    </button>`).join('');
}

function setSeg(sel, v) { $$(`${sel} button`).forEach((b) => b.classList.toggle('on', b.dataset.v === v)); }
function segVal(sel) { return $(`${sel} button.on`)?.dataset.v; }
$$('.seg').forEach((seg) => seg.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $$('button', seg).forEach((x) => x.classList.toggle('on', x === b));
  seg.dispatchEvent(new CustomEvent('segchange', { detail: b.dataset.v }));
}));

function openSetup(deckId) {
  ui.deckId = deckId;
  const deck = getDeck(deckId);
  if (!deck) return show('home');
  show('setup');
  $('#setup-deck-name').textContent = deck.name;
  $('#setup-deck-count').textContent = `${deck.words.length} words · ${pct(deckMastery(deck))} mastered`;
  $('#mode-grid').innerHTML = modeCards(ui.mode, false);
  const s = db.settings;
  setSeg('#opt-direction', s.direction);
  setSeg('#opt-length', s.length);
  setSeg('#opt-order', s.order);
  $('#opt-speak').checked = s.speak;
  $('#opt-strict').checked = s.strict;
  $('#opt-articles').checked = s.articles;
  $('#opt-length-wrap').hidden = ui.mode === 'sprint';
}
$('#mode-grid').addEventListener('click', (e) => {
  const b = e.target.closest('.mode');
  if (!b) return;
  ui.mode = b.dataset.mode;
  $$('#mode-grid .mode').forEach((x) => x.classList.toggle('on', x === b));
  $('#opt-length-wrap').hidden = ui.mode === 'sprint';
});
$('#mode-grid').addEventListener('dblclick', (e) => { if (e.target.closest('.mode')) $('#btn-start').click(); });

function readOptions() {
  const s = db.settings;
  s.direction = segVal('#opt-direction');
  s.length = segVal('#opt-length');
  s.order = segVal('#opt-order');
  s.speak = $('#opt-speak').checked;
  s.strict = $('#opt-strict').checked;
  s.articles = $('#opt-articles').checked;
  s.lastMode = ui.mode;
  save();
  return { direction: s.direction, length: s.length, order: s.order, speak: s.speak, strict: s.strict, articles: s.articles };
}
$('#btn-start').addEventListener('click', () => startGame(ui.deckId, ui.mode, readOptions()));

// ---------- Game ----------
const promptOf = (q) => (q.dir === 'en-de' ? q.word.en : q.word.de);
const answerOf = (q) => (q.dir === 'en-de' ? q.word.de : q.word.en);
const fromLang = (q) => (q.dir === 'en-de' ? 'en' : 'de');
const toLang = (q) => (q.dir === 'en-de' ? 'de' : 'en');
const buildTarget = (q) => alternatives(answerOf(q))[0].replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
const buildable = (q) => { const t = buildTarget(q); return t.length >= 2 && t.length <= 18; };

function weakness(w) {
  const s = w.stats || {};
  const acc = s.seen ? s.correct / s.seen : 0.5;
  return (s.box || 0) * 2 + acc * 3 + Math.random() * 1.5;
}

function makeQuestion(word, mode, opts) {
  const dir = opts.direction === 'mix' ? (Math.random() < 0.5 ? 'en-de' : 'de-en') : opts.direction;
  const q = { word, dir, type: mode };
  if (mode === 'mix') q.type = pick(['write', 'choice', 'build', 'write']);
  if (mode === 'sprint') q.type = 'choice';
  if (q.type === 'build' && !buildable(q)) q.type = mode === 'build' ? 'write' : 'choice';
  return q;
}

function startGame(deckId, mode, opts, onlyIds = null) {
  const deck = getDeck(deckId);
  if (!deck) return show('home');
  let words = deck.words.filter((w) => w.en && w.de && (!onlyIds || onlyIds.includes(w.id)));
  if (!words.length) { toast('This deck has no words yet'); return; }
  if (mode === 'match' && words.length < 2) mode = 'write';
  words = opts.order === 'weak' ? [...words].sort((a, b) => weakness(a) - weakness(b)) : shuffle(words);
  if (mode !== 'sprint' && !onlyIds && opts.length !== 'all') words = words.slice(0, Math.min(+opts.length, words.length));
  if (opts.order === 'weak') words = shuffle(words);

  ui.mode = mode;
  const g = {
    deckId, deck, mode, opts, words,
    queue: [], idx: 0, items: [], streak: 0, bestStreak: 0,
    startedAt: Date.now(), t0: performance.now(), done: false, onlyIds,
    pool: deck.words.filter((w) => w.en && w.de),
  };
  if (mode === 'match') {
    g.rounds = [];
    for (let i = 0; i < words.length; i += 5) g.rounds.push(words.slice(i, i + 5));
    // Avoid a lonely single-pair last round
    if (g.rounds.length > 1 && g.rounds[g.rounds.length - 1].length === 1) g.rounds[g.rounds.length - 2].push(g.rounds.pop()[0]);
    g.round = 0;
  } else {
    g.queue = words.map((w) => makeQuestion(w, mode, opts));
  }
  ui.game = g;
  hideFeedback();
  show('play');
  clearInterval(ui.timer);
  ui.timer = setInterval(tick, 250);
  tick();
  if (mode === 'match') renderMatchRound();
  else renderQuestion();
}

function tick() {
  const g = ui.game;
  if (!g || g.done) return;
  const el = performance.now() - g.t0;
  const t = $('#play-timer');
  if (g.mode === 'sprint') {
    const left = SPRINT_MS - el;
    t.textContent = `⏳ ${clock(left)}`;
    t.classList.toggle('hot', left < 10000);
    $('#play-bar').style.width = `${Math.min(100, (el / SPRINT_MS) * 100)}%`;
    if (left <= 0) finishGame();
  } else {
    t.textContent = `⏱ ${clock(el)}`;
    t.classList.remove('hot');
  }
}

function updateProgress() {
  const g = ui.game;
  $('#play-streak').textContent = `🔥 ${g.streak}`;
  if (g.mode === 'sprint') return;
  const total = g.mode === 'match' ? g.words.length : g.queue.length;
  $('#play-bar').style.width = `${(g.items.length / total) * 100}%`;
}

function applyStats(word, result, timeMs) {
  const s = (word.stats = word.stats || { seen: 0, correct: 0, wrong: 0, box: 0, time: 0, last: 0 });
  const snap = { ...s };
  s.seen++;
  s.time = (s.time || 0) + timeMs;
  s.last = Date.now();
  if (result === 'bad') { s.wrong++; s.box = Math.max(0, (s.box || 0) - 2); } else { s.correct++; s.box = Math.min(5, (s.box || 0) + (result === 'good' ? 1 : 0.5)); }
  return snap;
}

function record(q, result, given, extra = {}) {
  const g = ui.game;
  const timeMs = Math.round(performance.now() - (q.shownAt || performance.now()));
  const snap = applyStats(q.word, result, timeMs);
  const prevStreak = g.streak;
  g.streak = result === 'bad' ? 0 : g.streak + 1;
  g.bestStreak = Math.max(g.bestStreak, g.streak);
  const item = {
    wordId: q.word.id, dir: q.dir, type: q.type, prompt: promptOf(q), answer: answerOf(q),
    given, result, timeMs, hinted: !!q.hinted, snap, prevStreak, ...extra,
  };
  g.items.push(item);
  save();
  updateProgress();
  if (result === 'bad') sound('bad'); else sound('good');
  return item;
}

function next() {
  const g = ui.game;
  if (!g || g.done) return;
  // Enter on a focused Continue button fires both click and keydown: only advance once
  const cur = g.queue[g.idx];
  if (cur && !cur.answered) return;
  hideFeedback();
  g.idx++;
  if (g.mode === 'sprint' && g.idx >= g.queue.length) {
    g.queue.push(...shuffle(g.words).map((w) => makeQuestion(w, 'sprint', g.opts)));
  }
  if (g.idx >= g.queue.length) return finishGame();
  renderQuestion();
}

function kicker(q, text) {
  return `<div class="q-kicker"><span class="q-type">${TYPE_NAMES[q.type]}</span>${text}</div>`;
}
function promptCard(q) {
  return `<div class="prompt-card"><span class="flag">${FLAG[fromLang(q)]}</span><div class="prompt-word">${esc(promptOf(q))}</div>
    <button class="speak" data-speak title="Listen" aria-label="Listen">🔊</button></div>`;
}

function renderQuestion() {
  const g = ui.game;
  const q = g.queue[g.idx];
  const stage = $('#play-stage');
  updateProgress();
  if (q.type === 'write') renderWrite(q, stage);
  else if (q.type === 'choice') renderChoice(q, stage);
  else if (q.type === 'build') renderBuild(q, stage);
  else if (q.type === 'flash') renderFlash(q, stage);
  stage.firstElementChild?.animate?.([{ opacity: 0, transform: 'translateX(18px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'ease-out' });
  $('[data-speak]', stage)?.addEventListener('click', () => speak(promptOf(q), fromLang(q)));
  q.shownAt = performance.now();
  if (g.opts.speak) speak(promptOf(q), fromLang(q));
}

// --- Type it ---
function renderWrite(q, stage) {
  const target = toLang(q);
  stage.innerHTML = `<div>
    ${kicker(q, `Translate into ${LANG[target]} ${FLAG[target]}`)}
    ${promptCard(q)}
    <input class="answer-input" id="answer" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Type in ${LANG[target]}…" lang="${target}" />
    <div class="hint-line" id="hint-line"></div>
    ${target === 'de' ? `<div class="umlauts">${['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'].map((c) => `<button data-ch="${c}" tabindex="-1">${c}</button>`).join('')}</div>` : ''}
    <div class="q-actions">
      <div class="row-wrap"><button class="btn ghost" id="btn-hint">💡 Hint</button><button class="btn ghost" id="btn-skip">Skip</button></div>
      <button class="btn primary big" id="btn-check">Check</button>
    </div></div>`;
  const input = $('#answer');
  setTimeout(() => input.focus(), 30);
  q.hintLevel = 0;
  $$('.umlauts button', stage).forEach((b) => b.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const s = input.selectionStart ?? input.value.length, en = input.selectionEnd ?? s;
    input.value = input.value.slice(0, s) + b.dataset.ch + input.value.slice(en);
    input.setSelectionRange(s + 1, s + 1);
    input.focus();
  }));
  $('#btn-hint').addEventListener('click', () => {
    const t = buildTarget(q);
    q.hintLevel = Math.min(t.length, q.hintLevel + 1);
    q.hinted = true;
    $('#hint-line').textContent = [...t].map((c, i) => (i < q.hintLevel || c === ' ' ? c : '_')).join(' ');
    input.focus();
  });
  $('#btn-skip').addEventListener('click', () => submitWrite(q, true));
  $('#btn-check').addEventListener('click', () => submitWrite(q));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submitWrite(q); }
  });
}

function submitWrite(q, skipped = false) {
  if (q.answered) return;
  const input = $('#answer');
  const given = skipped ? '' : input.value.trim();
  if (!skipped && !given) { input.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 250 }); return; }
  q.answered = true;
  const result = skipped ? 'bad' : checkAnswer(given, answerOf(q), ui.game.opts);
  input.classList.add(result);
  input.disabled = true;
  const item = record(q, result, given, { skipped });
  const ans = `<span class="fb-body-answer">${esc(answerOf(q))}</span>`;
  if (result === 'good') {
    showFeedback('good', pick(['Correct!', 'Nice!', 'Great job!', 'Excellent!', 'Richtig!']), alternatives(answerOf(q)).length > 1 ? `Meaning: ${ans}` : '');
  } else if (result === 'warn') {
    showFeedback('warn', 'Almost! Watch the spelling', `Correct: ${ans}`, item);
  } else {
    showFeedback('bad', skipped ? 'Skipped' : 'Not quite', `Correct answer: ${ans}${given ? `<div class="tiny">You wrote: ${esc(given)}</div>` : ''}`, given ? item : null);
  }
}

// --- Multiple choice ---
function distractors(q, n) {
  const g = ui.game;
  const correctKey = norm(answerOf(q), true);
  const target = answerOf(q);
  const seen = new Set([correctKey]);
  const cands = [];
  for (const w of shuffle(g.pool)) {
    if (w.id === q.word.id) continue;
    const t = q.dir === 'en-de' ? w.de : w.en;
    const k = norm(t, true);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    cands.push({ t, score: Math.abs(t.length - target.length) + Math.random() * 6 });
  }
  return cands.sort((a, b) => a.score - b.score).slice(0, n).map((c) => c.t);
}

function renderChoice(q, stage) {
  const target = toLang(q);
  const opts = shuffle([answerOf(q), ...distractors(q, 3)]);
  q.options = opts;
  stage.innerHTML = `<div>
    ${kicker(q, `Choose the ${LANG[target]} translation ${FLAG[target]}`)}
    ${promptCard(q)}
    <div class="choices">${opts.map((o, i) => `<button class="choice" data-i="${i}"><span class="num">${i + 1}</span><span>${esc(o)}</span></button>`).join('')}</div>
  </div>`;
  $$('.choice', stage).forEach((b) => b.addEventListener('click', () => submitChoice(q, +b.dataset.i)));
}

function submitChoice(q, i) {
  if (q.answered) return;
  q.answered = true;
  const chosen = q.options[i];
  const ok = chosen === answerOf(q);
  $$('.choice').forEach((b, j) => {
    b.disabled = true;
    if (q.options[j] === answerOf(q)) b.classList.add('good');
    else if (j === i) b.classList.add('bad');
  });
  record(q, ok ? 'good' : 'bad', chosen);
  const g = ui.game;
  if (g.mode === 'sprint') {
    setTimeout(() => { if (ui.game === g && !g.done) next(); }, ok ? 450 : 1100);
    return;
  }
  if (ok) showFeedback('good', pick(['Correct!', 'Nice!', 'Spot on!', 'Sehr gut!']), '');
  else showFeedback('bad', 'Not quite', `Correct answer: <span class="fb-body-answer">${esc(answerOf(q))}</span>`);
}

// --- Letter builder ---
function renderBuild(q, stage) {
  const target = buildTarget(q);
  const letters = [...target];
  const pool = toLang(q) === 'de' ? 'eenrstaihdulgmcobäüö' : 'eetaoinsrhldcumfpgwyb';
  const decoys = Array.from({ length: target.length > 10 ? 3 : 2 }, () => pick([...pool]));
  let tiles = shuffle([...letters, ...decoys]);
  for (let tries = 0; tiles.join('') === target && tries < 5; tries++) tiles = shuffle(tiles);
  q.tiles = tiles.map((c, i) => ({ c, i, used: false }));
  q.built = [];
  stage.innerHTML = `<div>
    ${kicker(q, `Build the ${LANG[toLang(q)]} word ${FLAG[toLang(q)]}`)}
    ${promptCard(q)}
    <div class="build-answer" id="build-answer"></div>
    <div class="tiles-pool" id="tiles-pool">${q.tiles.map((t) => `<button class="tile ${t.c === ' ' ? 'space' : ''}" data-i="${t.i}">${t.c === ' ' ? '␣' : esc(t.c)}</button>`).join('')}</div>
    <div class="q-actions">
      <div class="row-wrap"><button class="btn ghost" id="btn-clear">Clear</button><button class="btn ghost" id="btn-skip">Skip</button></div>
      <button class="btn primary big" id="btn-check">Check</button>
    </div></div>`;
  $('#tiles-pool').addEventListener('click', (e) => { const b = e.target.closest('.tile'); if (b) useTile(q, +b.dataset.i); });
  $('#build-answer').addEventListener('click', (e) => { const b = e.target.closest('.tile'); if (b) unuseTile(q, +b.dataset.i); });
  $('#btn-clear').addEventListener('click', () => { while (q.built.length) unuseTile(q, q.built[q.built.length - 1]); });
  $('#btn-skip').addEventListener('click', () => submitBuild(q, true));
  $('#btn-check').addEventListener('click', () => submitBuild(q));
}
function drawBuilt(q) {
  $('#build-answer').innerHTML = q.built.map((i) => { const c = q.tiles[i].c; return `<button class="tile ${c === ' ' ? 'space' : ''}" data-i="${i}">${c === ' ' ? '␣' : esc(c)}</button>`; }).join('');
  $$('#tiles-pool .tile').forEach((b) => b.classList.toggle('used', q.tiles[+b.dataset.i].used));
}
function useTile(q, i) {
  if (q.answered || q.tiles[i].used) return;
  q.tiles[i].used = true;
  q.built.push(i);
  sound('tap');
  drawBuilt(q);
}
function unuseTile(q, i) {
  if (q.answered) return;
  q.tiles[i].used = false;
  q.built = q.built.filter((x) => x !== i);
  drawBuilt(q);
}
function buildKey(q, key) {
  if (key === 'Backspace') { if (q.built.length) unuseTile(q, q.built[q.built.length - 1]); return true; }
  if (key === 'Enter') { submitBuild(q); return true; }
  if (key.length !== 1) return false;
  const base = (c) => c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const t = q.tiles.find((x) => !x.used && x.c === key)
    || q.tiles.find((x) => !x.used && x.c.toLowerCase() === key.toLowerCase())
    || q.tiles.find((x) => !x.used && base(x.c) === base(key));
  if (t) useTile(q, t.i);
  return true;
}
function submitBuild(q, skipped = false) {
  if (q.answered) return;
  const given = q.built.map((i) => q.tiles[i].c).join('');
  if (!skipped && !given) return;
  q.answered = true;
  const ok = !skipped && norm(given, true) === norm(buildTarget(q), true);
  $('#build-answer').classList.add(ok ? 'good' : 'bad');
  record(q, ok ? 'good' : 'bad', given, { skipped });
  if (ok) showFeedback('good', pick(['Correct!', 'Perfect spelling!', 'Nice!']), '');
  else showFeedback('bad', skipped ? 'Skipped' : 'Not quite', `Correct answer: <span class="fb-body-answer">${esc(answerOf(q))}</span>`);
}

// --- Flashcards ---
function renderFlash(q, stage) {
  stage.innerHTML = `<div>
    ${kicker(q, 'Do you know it? Tap the card to flip')}
    <div class="flashcard" id="flashcard" role="button" tabindex="0" aria-label="Flip card">
      <div class="flash-inner">
        <div class="flash-face"><span class="flag">${FLAG[fromLang(q)]}</span><div class="prompt-word">${esc(promptOf(q))}</div><span class="tiny muted">Tap or press space to flip</span></div>
        <div class="flash-face back"><span class="flag">${FLAG[toLang(q)]}</span><div class="prompt-word">${esc(answerOf(q))}</div><span class="tiny muted">${esc(promptOf(q))}</span></div>
      </div>
    </div>
    <div class="flash-actions">
      <button class="btn big nope" id="btn-nope">✗ Didn’t know <span class="tiny muted">(1)</span></button>
      <button class="btn big knew" id="btn-knew">✓ Knew it <span class="tiny muted">(2)</span></button>
    </div></div>`;
  $('#flashcard').addEventListener('click', () => flipCard(q));
  $('#btn-nope').addEventListener('click', () => gradeFlash(q, false));
  $('#btn-knew').addEventListener('click', () => gradeFlash(q, true));
}
function flipCard(q) {
  const c = $('#flashcard');
  c.classList.toggle('flipped');
  if (!q.flipped) { q.flipped = true; q.flipAt = performance.now(); if (ui.game.opts.speak) speak(answerOf(q), toLang(q)); }
}
function gradeFlash(q, knew) {
  if (q.answered) return;
  if (!q.flipped) { flipCard(q); return; }
  q.answered = true;
  record(q, knew ? 'good' : 'bad', knew ? '(knew it)' : '(didn’t know)');
  setTimeout(next, 250);
}

// --- Match pairs ---
function renderMatchRound() {
  const g = ui.game;
  const words = g.rounds[g.round];
  g.match = { sel: null, left: words.length, mistakes: new Set(), lastAt: performance.now() };
  const left = shuffle(words), right = shuffle(words);
  const stage = $('#play-stage');
  stage.innerHTML = `<div>
    <div class="q-kicker"><span class="q-type">Match</span>Tap the matching pairs <span class="pill">Round ${g.round + 1} / ${g.rounds.length}</span></div>
    <div class="match-grid">
      <div class="match-col">${left.map((w) => `<button class="mtile" data-side="en" data-id="${w.id}">${esc(w.en)}</button>`).join('')}</div>
      <div class="match-col">${right.map((w) => `<button class="mtile" data-side="de" data-id="${w.id}">${esc(w.de)}</button>`).join('')}</div>
    </div></div>`;
  stage.firstElementChild.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 260 });
  stage.querySelector('.match-grid').addEventListener('click', (e) => { const b = e.target.closest('.mtile'); if (b) tapMatch(b); });
  updateProgress();
}
function tapMatch(b) {
  const g = ui.game;
  const m = g.match;
  if (b.classList.contains('done')) return;
  if (g.opts.speak) speak(b.textContent, b.dataset.side);
  if (!m.sel || m.sel.dataset.side === b.dataset.side) {
    m.sel?.classList.remove('sel');
    m.sel = b === m.sel ? null : b;
    m.sel?.classList.add('sel');
    return;
  }
  const a = m.sel;
  m.sel = null;
  a.classList.remove('sel');
  if (a.dataset.id === b.dataset.id) {
    const word = g.words.find((w) => w.id === a.dataset.id);
    const q = { word, dir: a.dataset.side === 'en' ? 'en-de' : 'de-en', type: 'match', shownAt: m.lastAt };
    m.lastAt = performance.now();
    record(q, m.mistakes.has(word.id) ? 'bad' : 'good', m.mistakes.has(word.id) ? '(mismatched first)' : (a.dataset.side === 'en' ? word.de : word.en));
    [a, b].forEach((x) => { x.classList.add('good'); setTimeout(() => x.classList.add('done'), 280); });
    m.left--;
    if (!m.left) {
      setTimeout(() => {
        if (ui.game !== g || g.done) return;
        g.round++;
        if (g.round >= g.rounds.length) finishGame();
        else renderMatchRound();
      }, 550);
    }
  } else {
    m.mistakes.add(a.dataset.id);
    m.mistakes.add(b.dataset.id);
    g.streak = 0;
    $('#play-streak').textContent = '🔥 0';
    sound('bad');
    [a, b].forEach((x) => { x.classList.remove('bad'); void x.offsetWidth; x.classList.add('bad'); setTimeout(() => x.classList.remove('bad'), 450); });
  }
}

// --- Feedback bar ---
function showFeedback(kind, title, body, overridable = null) {
  const fb = $('#feedback');
  fb.className = `feedback show ${kind}`;
  $('#fb-title').textContent = title;
  $('#fb-body').innerHTML = body;
  $('#btn-override').hidden = !overridable;
  ui.overrideItem = overridable;
  ui.fbShownAt = performance.now();
  setTimeout(() => $('#btn-continue').focus({ preventScroll: true }), 30);
}
function hideFeedback() {
  $('#feedback').className = 'feedback';
}
$('#btn-continue').addEventListener('click', () => next());
$('#btn-override').addEventListener('click', () => {
  const it = ui.overrideItem;
  const g = ui.game;
  if (!it || !g) return;
  const wasWrong = it.result === 'bad';
  const word = g.pool.find((w) => w.id === it.wordId);
  word.stats = { ...it.snap };
  applyStats(word, 'good', it.timeMs);
  it.result = 'good';
  it.overridden = true;
  g.streak = it.prevStreak + 1;
  g.bestStreak = Math.max(g.bestStreak, g.streak);
  // Remember the typed answer as an accepted alternative
  const key = it.dir === 'en-de' ? 'de' : 'en';
  if (wasWrong && it.given && !alternatives(word[key]).some((a) => norm(a, true) === norm(it.given, true))) {
    word[key] = `${word[key]}, ${it.given}`;
  }
  save();
  $('#answer')?.classList.remove('bad', 'warn');
  $('#answer')?.classList.add('good');
  showFeedback('good', 'Counted as correct', wasWrong ? `“${esc(it.given)}” is now accepted for this word.` : '');
});

$('#btn-quit').addEventListener('click', () => {
  const g = ui.game;
  if (!g) return show('home');
  if (!g.items.length) { endTimers(); ui.game = null; openSetup(g.deckId); return; }
  if (confirm('End this round now? You will see the results for the answers so far.')) finishGame();
});

function endTimers() { clearInterval(ui.timer); }

// ---------- Finish & results ----------
function finishGame() {
  const g = ui.game;
  if (!g || g.done) return;
  g.done = true;
  endTimers();
  hideFeedback();
  const endedAt = Date.now();
  const items = g.items;
  const good = items.filter((i) => i.result !== 'bad').length;
  const times = items.map((i) => i.timeMs);
  const session = {
    id: uid(), deckId: g.deckId, deckName: g.deck.name, mode: g.mode, direction: g.opts.direction,
    startedAt: g.startedAt, endedAt, durationMs: endedAt - g.startedAt,
    total: items.length, correct: good, accuracy: items.length ? good / items.length : 0,
    avgMs: Math.round(avg(times)), bestStreak: g.bestStreak,
    xp: items.reduce((x, i) => x + (i.result === 'good' ? (i.hinted ? 5 : 10) : i.result === 'warn' ? 6 : 0) + (i.result !== 'bad' && i.timeMs < 3000 ? 2 : 0), 0) + g.bestStreak * 2,
    items: items.map(({ snap, prevStreak, ...rest }) => rest),
  };
  if (session.total) {
    db.sessions.push(session);
    if (db.sessions.length > 400) db.sessions = db.sessions.slice(-400);
    g.deck.lastPlayed = endedAt;
    save();
  }
  ui.last = session;
  ui.lastGame = g;
  show('results');
  renderResults(session);
  sound('done');
  if (session.total && session.accuracy >= 0.8 && db.settings.confetti) confetti();
}

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function alpha(hex, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  return m ? `#${m[1]}${Math.round(a * 255).toString(16).padStart(2, '0')}` : hex;
}
function chartTheme() {
  return {
    text: cssVar('--text-2'), muted: cssVar('--muted'), grid: cssVar('--grid'), surface: cssVar('--surface'),
    accent: cssVar('--accent'), good: cssVar('--good'), warn: cssVar('--warn'), bad: cssVar('--bad'),
  };
}
function makeChart(key, canvas, config) {
  if (!window.Chart) return;
  ui.charts[key]?.destroy();
  const c = chartTheme();
  Chart.defaults.color = c.text;
  Chart.defaults.font.family = '"Plus Jakarta Sans", system-ui, sans-serif';
  Chart.defaults.font.weight = 600;
  Chart.defaults.plugins.tooltip.backgroundColor = cssVar('--text');
  Chart.defaults.plugins.tooltip.titleColor = cssVar('--bg');
  Chart.defaults.plugins.tooltip.bodyColor = cssVar('--bg');
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.displayColors = false;
  ui.charts[key] = new Chart(canvas, config);
}
function axes(c, { yPct = false, ySuffix = '', xGrid = false } = {}) {
  return {
    x: { grid: { display: xGrid, color: c.grid }, border: { display: false }, ticks: { color: c.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
    y: {
      beginAtZero: true, max: yPct ? 100 : undefined, grid: { color: c.grid }, border: { display: false },
      ticks: { color: c.muted, callback: (v) => `${v}${yPct ? '%' : ySuffix}`, maxTicksLimit: 6 },
    },
  };
}

function renderResults(s) {
  const c = chartTheme();
  const items = s.items;
  const good = items.filter((i) => i.result === 'good').length;
  const warn = items.filter((i) => i.result === 'warn').length;
  const bad = items.filter((i) => i.result === 'bad').length;
  const acc = s.accuracy;
  $('#res-acc').textContent = s.total ? pct(acc) : '—';
  $('#res-mode').textContent = `${MODES[s.mode].emoji} ${MODES[s.mode].name} · ${s.deckName}`;
  $('#res-headline').textContent = !s.total ? 'Round ended' : acc >= 0.95 ? 'Perfect run! 🏆' : acc >= 0.8 ? 'Great job! 🎉' : acc >= 0.6 ? 'Good effort! 💪' : 'Keep practising! 📚';
  $('#res-sub').textContent = s.total
    ? `${s.correct} of ${s.total} right in ${niceDuration(s.durationMs)}.${bad ? ` ${bad} word${bad > 1 ? 's' : ''} to review.` : ' Not a single mistake!'}`
    : 'No answers were given.';

  const prev = db.sessions.filter((x) => x.deckId === s.deckId && x.id !== s.id && x.endedAt < s.endedAt).slice(-1)[0];
  const delta = prev ? Math.round((acc - prev.accuracy) * 100) : null;
  const sorted = [...items].sort((a, b) => a.timeMs - b.timeMs);
  const fast = sorted[0], slow = sorted[sorted.length - 1];
  const tiles = [
    ['🎯', 'Accuracy', s.total ? pct(acc) : '—', delta == null ? 'first time on this deck' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs last time`],
    ['✅', 'Correct', s.correct, warn ? `${warn} with small typos` : `${good} perfect`],
    ['❌', 'Mistakes', bad, bad ? 'practise them below' : 'flawless'],
    ['⏱️', 'Total time', clock(s.durationMs), niceDuration(s.durationMs)],
    ['⚡', 'Avg per answer', s.total ? secs(s.avgMs) : '—', prev ? `last time ${secs(prev.avgMs)}` : 'response time'],
    ['🐇', 'Fastest', fast ? secs(fast.timeMs) : '—', fast ? fast.prompt : ''],
    ['🐢', 'Slowest', slow ? secs(slow.timeMs) : '—', slow ? slow.prompt : ''],
    ['🔥', 'Best streak', s.bestStreak, 'in a row'],
    ['⭐', 'XP earned', `+${s.xp}`, `${sum(db.sessions.map((x) => x.xp || 0))} XP total`],
  ];
  if (s.mode === 'sprint') tiles.splice(3, 0, ['🏁', 'Answers / min', (s.total / (SPRINT_MS / 60000)).toFixed(0), 'sprint speed']);
  $('#res-tiles').innerHTML = tiles.map(([i, l, v, sub]) => `<div class="tile-stat"><span class="ico">${i}</span> <span>${l}</span><strong>${esc(v)}</strong><small title="${esc(sub)}">${esc(sub)}</small></div>`).join('');

  $('#res-modes').innerHTML = modeCards(null, true, s.mode);
  $('#btn-mistakes').disabled = !items.some((i) => i.result !== 'good');

  // Donut
  makeChart('donut', $('#chart-donut'), {
    type: 'doughnut',
    data: {
      labels: ['Correct', 'Typo', 'Wrong'],
      datasets: [{ data: s.total ? [good, warn, bad] : [0, 0, 1], backgroundColor: s.total ? [c.good, c.warn, c.bad] : [c.grid], borderColor: c.surface, borderWidth: 3, hoverOffset: 4 }],
    },
    options: { cutout: '74%', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: !!s.total } }, animation: { animateRotate: true, duration: 900 } },
  });

  // Time per answer
  $('#legend-time').innerHTML = `<span><i style="background:${c.good}"></i>Correct</span><span><i style="background:${c.warn}"></i>Typo</span><span><i style="background:${c.bad}"></i>Wrong</span>`;
  const colorOf = (r) => (r === 'good' ? c.good : r === 'warn' ? c.warn : c.bad);
  makeChart('time', $('#chart-time'), {
    type: 'bar',
    data: {
      labels: items.map((_, i) => i + 1),
      datasets: [{ data: items.map((i) => +(i.timeMs / 1000).toFixed(2)), backgroundColor: items.map((i) => colorOf(i.result)), borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 28, categoryPercentage: 0.9, barPercentage: 0.9 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (ctx) => { const it = items[ctx[0].dataIndex]; return `${it.prompt} → ${it.answer}`; },
            label: (ctx) => { const it = items[ctx.dataIndex]; return [`${secs(it.timeMs)} · ${it.result === 'good' ? 'correct' : it.result === 'warn' ? 'typo' : 'wrong'}`, it.given && it.result !== 'good' ? `You: ${it.given}` : ''].filter(Boolean); },
          },
        },
      },
      scales: axes(c, { ySuffix: 's' }),
    },
  });

  // Deck history
  const hist = db.sessions.filter((x) => x.deckId === s.deckId).slice(-20);
  makeChart('history', $('#chart-history'), {
    type: 'line',
    data: {
      labels: hist.map((x) => new Date(x.endedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })),
      datasets: [{
        data: hist.map((x) => Math.round(x.accuracy * 100)),
        borderColor: c.accent, backgroundColor: c.accent, borderWidth: 2, tension: 0.3,
        pointRadius: hist.map((x) => (x.id === s.id ? 7 : 4)), pointBorderColor: c.surface, pointBorderWidth: 2, pointHoverRadius: 8,
        fill: { target: 'origin', above: alpha(c.accent, 0.12) },
      }],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: (ctx) => { const x = hist[ctx[0].dataIndex]; return `${MODES[x.mode]?.name || x.mode} · ${new Date(x.endedAt).toLocaleString()}`; }, label: (ctx) => { const x = hist[ctx.dataIndex]; return `${ctx.parsed.y}% · ${x.correct}/${x.total} · ${secs(x.avgMs)} avg`; } } },
      },
      scales: axes(c, { yPct: true }),
    },
  });

  // Breakdown by direction and question type
  const groups = [];
  const add = (label, arr) => { if (arr.length) groups.push({ label, n: arr.length, acc: arr.filter((i) => i.result !== 'bad').length / arr.length }); };
  add('🇬🇧 → 🇩🇪', items.filter((i) => i.dir === 'en-de'));
  add('🇩🇪 → 🇬🇧', items.filter((i) => i.dir === 'de-en'));
  const types = [...new Set(items.map((i) => i.type))];
  if (types.length > 1) types.forEach((t) => add(TYPE_NAMES[t], items.filter((i) => i.type === t)));
  makeChart('direction', $('#chart-direction'), {
    type: 'bar',
    data: { labels: groups.map((x) => x.label), datasets: [{ data: groups.map((x) => Math.round(x.acc * 100)), backgroundColor: c.accent, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22 }] },
    options: {
      indexAxis: 'y', maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.x}% correct · ${groups[ctx.dataIndex].n} answers` } } },
      scales: {
        x: { beginAtZero: true, max: 100, grid: { color: c.grid }, border: { display: false }, ticks: { color: c.muted, callback: (v) => `${v}%` } },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: c.text } },
      },
    },
  });

  // Answer list
  $('#res-answers').innerHTML = items.length ? items.map((i) => `<div class="ans ${i.result}">
      <span class="mark">${i.result === 'good' ? '✓' : i.result === 'warn' ? '≈' : '✗'}</span>
      <span>${esc(i.prompt)} → ${i.result !== 'good' && i.given && !i.given.startsWith('(') ? `<span class="given">${esc(i.given)}</span>` : ''}<strong>${esc(i.answer)}</strong>${i.hinted ? ' <span class="tiny muted">💡</span>' : ''}</span>
      <span class="t">${secs(i.timeMs)}</span></div>`).join('') : '<p class="muted">No answers.</p>';
}

$('#btn-again').addEventListener('click', () => {
  const g = ui.lastGame;
  if (g) startGame(g.deckId, g.mode, g.opts, g.onlyIds);
});
$('#btn-mistakes').addEventListener('click', () => {
  const g = ui.lastGame;
  const ids = [...new Set(ui.last.items.filter((i) => i.result !== 'good').map((i) => i.wordId))];
  if (!ids.length) return;
  let mode = g.mode === 'sprint' ? 'write' : g.mode;
  if (mode === 'match' && ids.length < 2) mode = 'write';
  startGame(g.deckId, mode, g.opts, ids);
});
$('#res-modes').addEventListener('click', (e) => {
  const b = e.target.closest('.mode');
  if (!b || !ui.lastGame) return;
  db.settings.lastMode = b.dataset.mode;
  save();
  startGame(ui.lastGame.deckId, b.dataset.mode, ui.lastGame.opts);
});

// ---------- Stats ----------
function renderStats() {
  const sel = $('#stats-deck');
  const current = sel.value;
  sel.innerHTML = `<option value="">All decks</option>` + db.decks.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  sel.value = db.decks.some((d) => d.id === current) ? current : '';
  const deckId = sel.value;
  const sessions = db.sessions.filter((s) => !deckId || s.deckId === deckId);
  const decks = deckId ? [getDeck(deckId)] : db.decks;
  const words = decks.flatMap((d) => d.words);
  const c = chartTheme();

  const answers = sum(sessions.map((s) => s.total));
  const correct = sum(sessions.map((s) => s.correct));
  const time = sum(sessions.map((s) => s.durationMs));
  const mastered = words.filter((w) => (w.stats?.box || 0) >= 4).length;
  const best = sessions.reduce((b, s) => (s.total >= 5 && s.accuracy > (b?.accuracy ?? -1) ? s : b), null);
  const tiles = [
    ['🎮', 'Rounds', sessions.length],
    ['⏱️', 'Time practised', niceDuration(time)],
    ['🎯', 'Overall accuracy', answers ? pct(correct / answers) : '—'],
    ['📝', 'Answers given', answers],
    ['⚡', 'Avg answer time', answers ? secs(sum(sessions.map((s) => s.avgMs * s.total)) / answers) : '—'],
    ['🔥', 'Day streak', dayStreak()],
    ['🏅', 'Words mastered', `${mastered} / ${words.length}`],
    ['🏆', 'Best round', best ? pct(best.accuracy) : '—'],
  ];
  $('#stats-tiles').innerHTML = tiles.map(([i, l, v]) => `<div class="tile-stat"><span class="ico">${i}</span> <span>${l}</span><strong>${esc(v)}</strong></div>`).join('');

  $('#stats-empty').hidden = !!sessions.length;
  $('#stats-body').hidden = !sessions.length;
  if (!sessions.length) return;

  const recent = sessions.slice(-30);
  const labels = recent.map((s) => new Date(s.endedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
  const lineDs = (data) => ({ data, borderColor: c.accent, backgroundColor: c.accent, borderWidth: 2, tension: 0.3, pointRadius: 4, pointBorderColor: c.surface, pointBorderWidth: 2, pointHoverRadius: 7 });
  const sessTitle = (ctx) => { const s = recent[ctx[0].dataIndex]; return `${s.deckName} · ${MODES[s.mode]?.name || s.mode}`; };
  makeChart('acc', $('#chart-acc'), {
    type: 'line',
    data: { labels, datasets: [{ ...lineDs(recent.map((s) => Math.round(s.accuracy * 100))), fill: { target: 'origin', above: alpha(c.accent, 0.12) } }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: sessTitle, label: (ctx) => `${ctx.parsed.y}% · ${recent[ctx.dataIndex].correct}/${recent[ctx.dataIndex].total}` } } }, scales: axes(c, { yPct: true }) },
  });
  makeChart('speed', $('#chart-speed'), {
    type: 'line',
    data: { labels, datasets: [lineDs(recent.map((s) => +(s.avgMs / 1000).toFixed(2)))] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: sessTitle, label: (ctx) => `${ctx.parsed.y}s per answer` } } }, scales: axes(c, { ySuffix: 's' }) },
  });

  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
  const perDay = days.map((d) => sum(sessions.filter((s) => dayKey(s.endedAt) === dayKey(d)).map((s) => s.durationMs)) / 60000);
  makeChart('days', $('#chart-days'), {
    type: 'bar',
    data: { labels: days.map((d) => d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)), datasets: [{ data: perDay.map((m) => +m.toFixed(1)), backgroundColor: c.accent, borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 26 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (ctx) => days[ctx[0].dataIndex].toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }), label: (ctx) => `${ctx.parsed.y} min practised` } } }, scales: axes(c, { ySuffix: 'm' }) },
  });

  const modeRows = Object.keys(MODES).map((k) => {
    const ss = sessions.filter((s) => s.mode === k);
    const n = sum(ss.map((s) => s.total));
    return { k, rounds: ss.length, acc: n ? sum(ss.map((s) => s.correct)) / n : 0 };
  }).filter((r) => r.rounds);
  makeChart('modes', $('#chart-modes'), {
    type: 'bar',
    data: { labels: modeRows.map((r) => `${MODES[r.k].emoji} ${MODES[r.k].name}`), datasets: [{ data: modeRows.map((r) => Math.round(r.acc * 100)), backgroundColor: c.accent, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22 }] },
    options: {
      indexAxis: 'y', maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.x}% correct · ${modeRows[ctx.dataIndex].rounds} round(s)` } } },
      scales: { x: { beginAtZero: true, max: 100, grid: { color: c.grid }, border: { display: false }, ticks: { color: c.muted, callback: (v) => `${v}%` } }, y: { grid: { display: false }, border: { display: false } } },
    },
  });

  const wordRows = [...words].filter((w) => w.stats?.seen).sort((a, b) => (a.stats.box - b.stats.box) || (a.stats.correct / a.stats.seen - b.stats.correct / b.stats.seen)).slice(0, 150);
  $('#stats-words').innerHTML = wordRows.length ? wordRows.map((w) => {
    const s = w.stats;
    return `<tr><td>${esc(w.en)}</td><td>${esc(w.de)}</td><td>${s.seen}</td><td>${pct(s.correct / s.seen)}</td><td>${secs(s.time / s.seen)}</td>
      <td><span class="mini-mastery" title="${Math.round((s.box / 5) * 100)}%"><div style="width:${(s.box / 5) * 100}%"></div></span></td></tr>`;
  }).join('') : `<tr><td colspan="6" class="muted">No words practised yet.</td></tr>`;

  $('#stats-sessions').innerHTML = [...sessions].reverse().slice(0, 15).map((s) => `<div class="sess">
      <span><strong>${MODES[s.mode]?.emoji || ''} ${esc(MODES[s.mode]?.name || s.mode)}</strong> <span class="muted tiny">· ${esc(s.deckName)}</span></span>
      <span class="muted tiny hide-sm">${new Date(s.endedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      <span class="muted hide-sm">${clock(s.durationMs)}</span>
      <span class="acc" style="color:${s.accuracy >= 0.8 ? c.good : s.accuracy >= 0.5 ? c.warn : c.bad}">${pct(s.accuracy)}</span>
    </div>`).join('');
}
$('#stats-deck').addEventListener('change', renderStats);

// ---------- Settings ----------
function openSettings() {
  const s = db.settings;
  $('#set-key').value = s.apiKey;
  setSeg('#set-scan', s.scan);
  setSeg('#set-theme', s.theme);
  $('#set-sound').checked = s.sound;
  $('#set-confetti').checked = s.confetti;
  openModal('#modal-settings');
}
$('#btn-settings').addEventListener('click', openSettings);
$('#set-key').addEventListener('change', (e) => { db.settings.apiKey = e.target.value.trim(); save(); if (ui.view === 'home') renderHome(); });
$('#set-scan').addEventListener('segchange', (e) => { db.settings.scan = e.detail; save(); if (ui.view === 'home') renderHome(); });
$('#set-theme').addEventListener('segchange', (e) => {
  db.settings.theme = e.detail;
  save();
  applyTheme();
  if (ui.view === 'stats') renderStats();
  if (ui.view === 'results' && ui.last) renderResults(ui.last);
});
$('#set-sound').addEventListener('change', (e) => { db.settings.sound = e.target.checked; save(); });
$('#set-confetti').addEventListener('change', (e) => { db.settings.confetti = e.target.checked; save(); });
$('#btn-export').addEventListener('click', async () => {
  const { apiKey, ...settings } = db.settings;
  const json = JSON.stringify({ ...db, settings }, null, 2);
  const fileName = `vokabo-backup-${dayKey(Date.now())}.json`;
  if (native?.Filesystem && native?.Share) {
    try {
      const { uri } = await native.Filesystem.writeFile({ path: fileName, data: json, directory: 'CACHE', encoding: 'utf8' });
      await native.Share.share({ title: 'Vokabo backup', files: [uri] });
    } catch (err) {
      if (!/cancel/i.test(err?.message || '')) toast(`Export failed: ${err?.message || err}`);
    }
    return;
  }
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('#import-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.decks)) throw new Error('not a Vokabo backup');
    if (!confirm(`Import ${data.decks.length} deck(s) and ${data.sessions?.length || 0} session(s)? This replaces your current data.`)) return;
    data.settings = { ...data.settings, apiKey: db.settings.apiKey };
    replaceAll(data);
    applyTheme();
    closeModals();
    show('home');
    toast('Backup imported');
  } catch (err) {
    toast(`Import failed: ${err.message}`);
  }
});
$('#btn-reset').addEventListener('click', () => {
  if (!confirm('Delete all decks, stats and settings? This cannot be undone.')) return;
  replaceAll({});
  applyTheme();
  closeModals();
  show('home');
  toast('All data deleted');
});

// ---------- Global keys & nav ----------
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  e.preventDefault();
  if (ui.view === 'play' && ui.game && !ui.game.done && ui.game.items.length && !confirm('Leave this round? Your answers so far won’t be shown as a result.')) return;
  if (ui.view === 'play') { endTimers(); if (ui.game) ui.game.done = true; hideFeedback(); }
  show(go.dataset.go);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModals(); return; }
  if (ui.view !== 'play' || !ui.game || ui.game.done) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const g = ui.game;
  const fbOpen = $('#feedback').classList.contains('show');
  if (fbOpen) {
    if ((e.key === 'Enter' || e.key === ' ') && performance.now() - ui.fbShownAt > 120) { e.preventDefault(); next(); }
    return;
  }
  if (g.mode === 'match') return;
  const q = g.queue[g.idx];
  if (!q || q.answered) return;
  if (q.type === 'choice' && /^[1-4]$/.test(e.key)) { const i = +e.key - 1; if (i < q.options.length) submitChoice(q, i); }
  else if (q.type === 'flash') {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(q); }
    else if (e.key === '1' || e.key === 'ArrowLeft') gradeFlash(q, false);
    else if (e.key === '2' || e.key === 'ArrowRight') gradeFlash(q, true);
  } else if (q.type === 'build') {
    if (buildKey(q, e.key)) e.preventDefault();
  }
});

// ---------- Confetti ----------
function confetti() {
  const cv = $('#confetti');
  const ctx = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colors = ['#8b6dff', '#c05cff', '#34d36f', '#f5b83d', '#ff5c8a', '#4cc9ff'];
  const parts = Array.from({ length: 160 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 4,
    rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: pick(colors),
  }));
  const t0 = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
    }
    if (t - t0 < 2800) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}

// ---------- Android back button ----------
native?.App?.addListener('backButton', () => {
  const openModal = $$('.modal').find((m) => !m.hidden);
  if (openModal) return closeModals();
  if (ui.view === 'play') return $('#btn-quit').click();
  if (ui.view === 'scan') return $('#btn-scan-cancel').click();
  if (ui.view === 'edit') return show('home');
  if (ui.view === 'setup' || ui.view === 'results' || ui.view === 'stats') return show('home');
  native.App.exitApp();
});

// ---------- Boot ----------
applyTheme();
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (db.settings.theme !== 'auto') return;
  if (ui.view === 'stats') renderStats();
  if (ui.view === 'results' && ui.last) renderResults(ui.last);
});
if ('speechSynthesis' in window) speechSynthesis.getVoices();
show('home');
