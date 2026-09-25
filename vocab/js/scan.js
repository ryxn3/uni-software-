// Reading vocabulary sheets: on-device OCR (Tesseract.js) or Claude vision,
// plus the heuristics that turn raw text into English/German pairs.

const HEADER_WORDS = /^(english|englisch|engl\.?|german|deutsch|dt\.?|vocabulary|vocab|vokabeln|word|words|wort|wörter|page|seite|unit|lektion|translation|übersetzung)$/i;

// ---------- Image helpers ----------

export async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    return img;
  }
}

// Upscale small photos, convert to grayscale and stretch contrast: Tesseract
// reads phone photos of paper far better this way.
async function preprocess(file) {
  const bmp = await loadBitmap(file);
  const w0 = bmp.width, h0 = bmp.height;
  const target = Math.max(1600, Math.min(2400, w0));
  const scale = Math.min(target / w0, 4000 / h0, 3);
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    d[i] = g; hist[g]++;
  }
  // Black and white points from the histogram. Text can be well under 1% of the
  // pixels, so the black point must never get close to the paper colour or the
  // letters bleed into blobs.
  const total = w * h;
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > total * 0.02) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > total * 0.02) { hi = i; break; } }
  lo = Math.max(0, Math.min(lo, hi - 140));
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  removeRuledLines(d, w, h);
  ctx.putImageData(img, 0, 0);
  return c;
}

// Local (Bradley) thresholding: an ink mask that ignores shadows and the faint
// print showing through from the back of the page.
function inkMask(d, w, h) {
  const integral = new Uint32Array((w + 1) * (h + 1)); // fits: 255 × 16M px < 2^32
  for (let y = 1; y <= h; y++) {
    let rowSum = 0;
    for (let x = 1; x <= w; x++) {
      rowSum += d[((y - 1) * w + (x - 1)) * 4];
      integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + rowSum;
    }
  }
  const r = Math.max(8, Math.round(Math.max(w, h) / 32));
  const out = new Uint8Array(w * h); // 1 = ink
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const area = (x1 - x0) * (y1 - y0);
      const total = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      out[y * w + x] = d[(y * w + x) * 4] * area < total * 0.8 ? 1 : 0;
    }
  }
  return out;
}

// Table grid lines touching the words make Tesseract skip whole rows. Letters
// never contain long straight runs, so erase every dark run longer than a few
// letter heights, horizontally and vertically.
function removeRuledLines(d, w, h) {
  const ink = inkMask(d, w, h);
  // Run length of ink through every pixel, horizontally and vertically
  const runH = new Uint16Array(w * h), runV = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!ink[y * w + x]) { x++; continue; }
      let e = x;
      while (e < w && ink[y * w + e]) e++;
      for (let k = x; k < e; k++) runH[y * w + k] = Math.min(65535, e - x);
      x = e;
    }
  }
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!ink[y * w + x]) { y++; continue; }
      let e = y;
      while (e < h && ink[e * w + x]) e++;
      for (let k = y; k < e; k++) runV[k * w + x] = Math.min(65535, e - y);
      y = e;
    }
  }
  // A ruled line is long in one direction and thin in the other; blurred or
  // bold text is never that thin, so it survives.
  const minH = Math.max(40, Math.round(w / 28));
  const minV = Math.max(40, Math.round(h / 30));
  const thin = Math.max(5, Math.round(Math.max(w, h) / 400));
  const erase = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!ink[i]) continue;
      if ((runH[i] >= minH && runV[i] <= thin) || (runV[i] >= minV && runH[i] <= thin)) {
        erase[i] = 1;
        // plus the anti-aliased fringe just outside the line
        if (y > 0) erase[i - w] = 1;
        if (y < h - 1) erase[i + w] = 1;
        if (x > 0) erase[i - 1] = 1;
        if (x < w - 1) erase[i + 1] = 1;
      }
    }
  }
  for (let i = 0; i < w * h; i++) if (erase[i]) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
}

async function toJpegBase64(file, maxSide = 2000) {
  const bmp = await loadBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9).split(',')[1];
}

// ---------- OCR ----------

let workerPromise = null;
let progressHandler = () => {};

function getWorker() {
  if (!window.Tesseract) throw new Error('The text recognition library could not be loaded. Check your internet connection.');
  if (!workerPromise) {
    workerPromise = window.Tesseract.createWorker(['eng', 'deu'], 1, {
      // The Android app bundles worker, core and language data (see android-app/scripts/build-web.mjs)
      ...(window.VOKABO_LOCAL?.tesseract || {}),
      logger: (m) => progressHandler(m),
    }).catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

function collectLines(data) {
  if (data.lines && data.lines.length) return data.lines;
  const out = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) out.push(l);
  return out;
}

export async function ocrImage(file, onProgress) {
  progressHandler = (m) => {
    const labels = {
      'loading tesseract core': 'Loading text recognition',
      'initializing tesseract': 'Starting text recognition',
      'loading language traineddata': 'Downloading English + German language data',
      'initializing api': 'Getting ready',
      'recognizing text': 'Reading words',
    };
    onProgress(m.status === 'recognizing text' ? m.progress : null, labels[m.status] || m.status);
  };
  onProgress(null, 'Enhancing image');
  const canvas = await preprocess(file);
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
  const lines = collectLines(data);
  if (window.VOKABO_DEBUG) window.VOKABO_DEBUG = { lines, canvas };
  if (!lines.length && data.text) return pairsFromText(data.text);
  return pairsFromOcrLines(lines);
}

// ---------- Claude vision ----------

const AI_PROMPT = `This image is a vocabulary sheet for a student learning English and German.
Extract every vocabulary pair on it. For each pair give the English side and the German side exactly as written (keep articles such as "der/die/das" and "to" before verbs, keep alternative meanings separated by commas).
Ignore headings, page numbers, example sentences, phonetic transcriptions and notes.
If a pair is only partly legible, give your best reading.`;

export async function aiScan(file, apiKey, onProgress) {
  onProgress(null, 'Preparing image');
  const data = await toJpegBase64(file);
  onProgress(null, 'Loading Claude SDK');
  const { default: Anthropic } = await import('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk/+esm');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  onProgress(null, 'Claude is reading your sheet');
  const response = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            pairs: {
              type: 'array',
              items: {
                type: 'object',
                properties: { en: { type: 'string' }, de: { type: 'string' } },
                required: ['en', 'de'],
                additionalProperties: false,
              },
            },
          },
          required: ['pairs'],
          additionalProperties: false,
        },
      },
    },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
        { type: 'text', text: AI_PROMPT },
      ],
    }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude declined to read this image.');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const pairs = (json.pairs || [])
    .map((p) => ({ en: cleanSide(p.en || ''), de: cleanSide(p.de || '') }))
    .filter((p) => p.en || p.de);
  return { pairs, swapped: false };
}

// ---------- Parsing ----------

export function cleanSide(s) {
  return String(s)
    .replace(/^\s*(\d{1,3}\s*[.)\]:]|[•·▪■◦*\-–—>])\s*/, '')
    .replace(/[|_]+$/g, '')
    .replace(/^["'„“”‚‘’]+|["'„“”‚‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;])/g, '$1')
    .trim();
}

const SEPARATORS = [
  /^(.+?)\s*(?:\t+| {3,})\s*(.+)$/,            // tabs / wide gaps (pasted tables)
  /^(.+?)\s+(?:[-–—=|→>]|->|=>|<->|↔)\s+(.+)$/, // " - " " = " " → "
  /^(.+?)\s*(?:=|→|->|=>|↔|\||;)\s*(.+)$/,      // "=" without spaces, ";"
  /^(.+?):\s+(.+)$/,                            // "word: Wort"
  /^(.+?) {2}(.+)$/,                            // two spaces
];

function splitBySeparator(text) {
  for (const re of SEPARATORS) {
    const m = text.match(re);
    if (m && /\p{L}/u.test(m[1]) && /\p{L}/u.test(m[2])) return [m[1], m[2]];
  }
  return null;
}

function valid(a, b) {
  if (!a || !b) return false;
  if (!/\p{L}/u.test(a) || !/\p{L}/u.test(b)) return false;
  if (HEADER_WORDS.test(a) && HEADER_WORDS.test(b)) return false;
  if (/^(unit|lektion|chapter|kapitel|page|seite|name|date|datum|klasse)\b/i.test(a)) return false;
  if (a.length > 80 || b.length > 80) return false;
  return true;
}

export function pairsFromText(text) {
  const pairs = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let parts = splitBySeparator(line);
    if (!parts) {
      // Last resort for "word, Wort" style lines
      const m = line.match(/^([^,]+),\s*(.+)$/);
      if (m) parts = [m[1], m[2]];
    }
    if (!parts) continue;
    const a = cleanSide(parts[0]), b = cleanSide(parts[1]);
    if (valid(a, b)) pairs.push({ en: a, de: b });
  }
  return orient(pairs);
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

// Grid lines and bullets that OCR reports as "words"
const NOISE_WORD = /^[|\[\]{}()<>_=~—–\-•·.,:;'"`*#\\/]+$/;

// Stand-alone marks that separate a word from its translation ("house – Haus")
const SEP_WORD = /^(?:[-–—=:|→>]|->|=>|<->|↔)$/;

function toWord(w) {
  const t = w.text.trim();
  return { t, x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1, h: w.bbox.y1 - w.bbox.y0, conf: w.confidence ?? 90, noise: NOISE_WORD.test(t), sep: SEP_WORD.test(t) };
}

// Tesseract sometimes returns each table column as its own block, so one visual
// row arrives as several "lines". Merge lines that share the same height band.
function buildRows(lines) {
  const items = lines
    .map((l) => {
      const words = (l.words || []).filter((w) => w.text && w.text.trim()).map(toWord);
      if (!words.some((w) => !w.noise)) return null;
      return { words, y0: Math.min(...words.map((w) => w.y0)), y1: Math.max(...words.map((w) => w.y1)) };
    })
    .filter(Boolean)
    .sort((a, b) => a.y0 - b.y0);
  const rows = [];
  for (const it of items) {
    const h = it.y1 - it.y0;
    const row = rows.find((r) => {
      const overlap = Math.min(r.y1, it.y1) - Math.max(r.y0, it.y0);
      const xClash = r.words.some((a) => it.words.some((b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0));
      return overlap > 0.5 * Math.min(h, r.y1 - r.y0) && !xClash;
    });
    if (row) {
      row.words.push(...it.words);
      row.y0 = Math.min(row.y0, it.y0);
      row.y1 = Math.max(row.y1, it.y1);
    } else rows.push({ ...it, words: [...it.words] });
  }
  for (const r of rows) r.words.sort((a, b) => a.x0 - b.x0);
  return rows.sort((a, b) => a.y0 - b.y0);
}

// Splits a row into cells wherever the space between two words is much wider
// than a normal word space.
function segmentRow(row, h) {
  const groups = [];
  let cur = [];
  let lastX1 = -Infinity;
  for (const w of row.words) {
    if (w.noise) {
      // A separator mark ends the cell; other specks are dropped
      if (w.sep && cur.length) { groups.push(cur); cur = []; }
      continue;
    }
    if (cur.length && w.x0 - lastX1 > h * 1.1) { groups.push(cur); cur = []; }
    cur.push(w);
    lastX1 = w.x1;
  }
  if (cur.length) groups.push(cur);
  return groups.map((ws) => ({
    words: ws,
    text: ws.map((w) => w.t).join(' '),
    x0: ws[0].x0,
    x1: ws[ws.length - 1].x1,
    conf: ws.reduce((s, w) => s + wordConf(w), 0) / ws.length,
  }));
}

// Tesseract sometimes scores perfectly read long words (German compounds like
// "Selbstbewusstsein") near 0. A clean run of letters with vowels is trusted anyway.
function wordConf(w) {
  const clean = /^[\p{L}'’-]{4,}[.,;!?]?$/u.test(w.t) && /[aeiouyäöü]/i.test(w.t);
  return clean ? Math.max(w.conf, 60) : w.conf;
}

// Specks, stray digits and single letters that OCR picks up at the start or end
// of a cell (bits of grid lines, page margins, punched holes). "a", "A" and "I"
// are kept because they are real words.
const EDGE_JUNK = /^(?:[^\p{L}\p{N}]+|\d{1,2}|[b-zB-HJ-Z]|[\p{L}]?[§©®°]+)$/u;
function stripEdgeJunk(t) {
  const parts = t.trim().split(/\s+/);
  while (parts.length > 1 && EDGE_JUNK.test(parts[0])) parts.shift();
  while (parts.length > 1 && EDGE_JUNK.test(parts[parts.length - 1])) parts.pop();
  return parts.join(' ');
}

// Signals used to pick the vocabulary columns out of tables that also carry
// numbers, word types or example sentences.
function columnProfile(cells) {
  const texts = cells.filter(Boolean).map((c) => c.text);
  const n = texts.length || 1;
  const avg = (f) => texts.reduce((s, t) => s + f(t), 0) / n;
  return {
    filled: texts.length,
    words: avg((t) => t.split(/\s+/).length),
    sentence: avg((t) => (/[.!?]$/.test(t) && t.split(/\s+/).length > 3 ? 1 : 0)),
    letters: avg((t) => (t.match(/\p{L}/gu) || []).length),
    de: avg(germanScore),
    en: avg(englishScore),
  };
}

function pickColumns(profiles) {
  const maxFilled = Math.max(...profiles.map((p) => p.filled));
  const cand = profiles
    .map((p, i) => ({ ...p, i }))
    .filter((p) => p.filled >= maxFilled * 0.5 && p.letters >= 2 && p.words <= 5 && p.sentence < 0.5);
  if (cand.length < 2) return null;
  if (cand.length === 2) return [cand[0].i, cand[1].i];
  // Prefer the most English-looking and the most German-looking columns, then
  // fall back to the two leftmost short-text columns.
  const byDe = [...cand].sort((a, b) => (b.de - b.en) - (a.de - a.en));
  const de = byDe[0];
  const en = byDe.filter((c) => c.i !== de.i).sort((a, b) => (b.en - b.de) - (a.en - a.de))[0];
  if (de.de - de.en > 0.3) return [en.i, de.i].sort((a, b) => a - b);
  return [cand[0].i, cand[1].i];
}

export function pairsFromOcrLines(lines) {
  const rows = buildRows(lines);
  if (!rows.length) return { pairs: [], swapped: false };
  const h = median(rows.flatMap((r) => r.words.map((w) => w.h)));
  // Cells with hardly any letters or very low confidence are specks, not words
  for (const r of rows) r.segs = segmentRow(r, h).filter((sg) => (sg.text.match(/\p{L}/gu) || []).length >= 2 && sg.conf >= 10);

  const multi = rows.filter((r) => r.segs.length >= 2);
  const pairs = [];
  const push = (a, b, conf) => {
    // A header row ("English | German") that got merged into the first word row
    const hasHeader = (t) => t.split(/\s+/).some((x) => HEADER_WORDS.test(x));
    if (hasHeader(a) && hasHeader(b)) {
      const strip = (t) => t.split(/\s+/).filter((x) => !HEADER_WORDS.test(x)).join(' ');
      a = strip(a); b = strip(b);
    }
    a = cleanSide(stripEdgeJunk(a.replace(/\s*[-–—=|:]\s*$/, '')));
    b = cleanSide(stripEdgeJunk(b.replace(/^\s*[-–—=|:]\s*/, '')));
    if (!valid(a, b) || conf < 45) return;
    // Short, shaky reads on both sides are almost always handwriting or specks
    const letters = (t) => (t.match(/\p{L}/gu) || []).length;
    if (conf < 70 && letters(a) <= 4 && letters(b) <= 4) return;
    pairs.push({ en: a, de: b, ...(conf < 70 ? { unsure: true } : {}) });
  };

  if (multi.length >= Math.max(2, rows.length * 0.3)) {
    // Table layout: find the column positions from the most common cell count
    // Only confidently read rows vote on the column count, so specks from the
    // table's surroundings can't outvote the real rows.
    const counts = {};
    const voters = multi.filter((r) => r.segs.every((sg) => sg.conf >= 60));
    for (const r of voters.length >= 2 ? voters : multi) counts[r.segs.length] = (counts[r.segs.length] || 0) + 1;
    const k = +Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    const model = multi.filter((r) => r.segs.length === k);
    // The table spans from its first to its last full row; titles and
    // instructions above it and footers below it are not vocabulary.
    const top = Math.min(...model.map((r) => r.y0)) - h * 2;
    const bottom = Math.max(...model.map((r) => r.y1)) + h * 2;
    const inTable = multi.filter((r) => r.y0 >= top && r.y1 <= bottom);
    const cols = Array.from({ length: k }, (_, i) => ({
      x0: median(model.map((r) => r.segs[i].x0)),
      x1: median(model.map((r) => r.segs[i].x1)),
    }));
    // Put every row's cells into the column they overlap most
    const grid = inTable.map((r) => {
      const cells = Array(k).fill(null);
      for (const s of r.segs) {
        let best = -1, bestOv = -Infinity;
        cols.forEach((c, i) => {
          const ov = Math.min(c.x1, s.x1) - Math.max(c.x0, s.x0) - Math.abs((c.x0 + c.x1) / 2 - (s.x0 + s.x1) / 2) * 0.01;
          if (ov > bestOv) { bestOv = ov; best = i; }
        });
        if (bestOv < -h) continue;
        cells[best] = cells[best] ? { ...cells[best], text: `${cells[best].text} ${s.text}`, conf: Math.min(cells[best].conf, s.conf) } : s;
      }
      return cells;
    });
    const pick = pickColumns(cols.map((_, i) => columnProfile(grid.map((g) => g[i]))));
    if (pick) {
      for (const g of grid) {
        const a = g[pick[0]], b = g[pick[1]];
        if (a && b) push(a.text, b.text, (a.conf + b.conf) / 2);
      }
      return orient(pairs);
    }
  }

  // List layout: "word - Wort" on each line
  for (const r of rows) {
    const real = r.words.filter((w) => !w.noise);
    const text = r.words.map((w) => w.t).join(' ');
    const conf = real.reduce((s, w) => s + wordConf(w), 0) / real.length;
    const parts = r.segs.length === 2 ? [r.segs[0].text, r.segs[1].text] : splitBySeparator(text);
    if (!r.segs.length) continue;
    if (parts) push(parts[0], parts[1], conf);
  }
  return orient(pairs);
}

// ---------- Language detection ----------

function germanScore(s) {
  let n = 0;
  if (/[äöüßÄÖÜ]/.test(s)) n += 2;
  if (/^(der|die|das|den|dem|ein|eine|einen|sich)\s/i.test(s)) n += 3;
  if (/(ung|keit|heit|lich|isch|chen|schaft)\b/i.test(s)) n += 1;
  if (/sch|tz|ck/i.test(s)) n += 0.5;
  if (/^[A-ZÄÖÜ]/.test(s) && !/\s/.test(s)) n += 0.3;
  if (/\b(jdn|jdm|etw)\b/i.test(s)) n += 2;
  return n;
}
function englishScore(s) {
  let n = 0;
  if (/^(to|the|a|an)\s/i.test(s)) n += 3;
  if (/\b(sth|sb|something|somebody|someone)\b/i.test(s)) n += 2;
  if (/(ing|tion|ness|ful|ly|th|w)\b/i.test(s)) n += 1;
  if (/^[a-z]/.test(s)) n += 0.3;
  return n;
}

export function orient(pairs) {
  let leftGerman = 0;
  for (const p of pairs) {
    leftGerman += germanScore(p.en) - englishScore(p.en) - (germanScore(p.de) - englishScore(p.de));
  }
  if (leftGerman > 0) {
    return { pairs: pairs.map((p) => ({ en: p.de, de: p.en })), swapped: true };
  }
  return { pairs, swapped: false };
}
