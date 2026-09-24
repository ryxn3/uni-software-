// Reading vocabulary sheets: on-device OCR (Tesseract.js) or Claude vision,
// plus the heuristics that turn raw text into English/German pairs.

const HEADER_WORDS = /^(english|englisch|engl\.?|german|deutsch|dt\.?|vocabulary|vocab|vokabeln|word|words|wort|wörter|page|seite|unit|lektion|translation|übersetzung)$/i;

// ---------- Image helpers ----------

async function loadBitmap(file) {
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
  const target = Math.max(1600, Math.min(2600, w0));
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
  // 2% / 98% percentiles as black and white points
  const total = w * h;
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > total * 0.02) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > total * 0.02) { hi = i; break; } }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
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

// Finds the x position of the empty vertical band between two columns.
function findColumnSplit(rows) {
  const words = rows.flatMap((r) => r.words);
  if (words.length < 4) return null;
  const minX = Math.min(...words.map((w) => w.x0));
  const maxX = Math.max(...words.map((w) => w.x1));
  const span = maxX - minX;
  if (span < 50) return null;
  const B = 4;
  const n = Math.ceil(span / B) + 1;
  const cover = new Uint16Array(n);
  for (const r of rows) {
    const seen = new Uint8Array(n);
    for (const w of r.words) {
      for (let i = Math.floor((w.x0 - minX) / B); i <= Math.floor((w.x1 - minX) / B); i++) seen[i] = 1;
    }
    for (let i = 0; i < n; i++) cover[i] += seen[i];
  }
  const limit = Math.max(1, Math.floor(rows.length * 0.08));
  const from = Math.floor(n * 0.12), to = Math.ceil(n * 0.88);
  let best = null, start = -1;
  for (let i = from; i <= to; i++) {
    const empty = i < to && cover[i] <= limit;
    if (empty && start < 0) start = i;
    if (!empty && start >= 0) {
      const len = i - start;
      if (!best || len > best.len) best = { start, len };
      start = -1;
    }
  }
  const h = median(words.map((w) => w.h));
  if (!best || best.len * B < h * 1.2) return null;
  return minX + (best.start + best.len / 2) * B;
}

export function pairsFromOcrLines(lines) {
  const rows = lines
    .map((l) => ({
      words: (l.words || [])
        .filter((w) => w.text && w.text.trim() && (w.confidence ?? 100) > 15)
        .map((w) => ({ t: w.text.trim(), x0: w.bbox.x0, x1: w.bbox.x1, h: w.bbox.y1 - w.bbox.y0 })),
      text: (l.text || '').trim(),
    }))
    .filter((r) => r.words.length);

  const splitX = findColumnSplit(rows);
  const h = median(rows.flatMap((r) => r.words.map((w) => w.h)));
  const pairs = [];

  for (const r of rows) {
    const text = r.words.map((w) => w.t).join(' ');
    let parts = splitBySeparator(text);
    if (!parts && splitX != null) {
      const left = r.words.filter((w) => (w.x0 + w.x1) / 2 < splitX).map((w) => w.t).join(' ');
      const right = r.words.filter((w) => (w.x0 + w.x1) / 2 >= splitX).map((w) => w.t).join(' ');
      if (left && right) parts = [left, right];
    }
    if (!parts && r.words.length > 1) {
      let gi = -1, gap = 0;
      for (let i = 1; i < r.words.length; i++) {
        const g = r.words[i].x0 - r.words[i - 1].x1;
        if (g > gap) { gap = g; gi = i; }
      }
      if (gap > h * 1.3) parts = [r.words.slice(0, gi).map((w) => w.t).join(' '), r.words.slice(gi).map((w) => w.t).join(' ')];
    }
    if (!parts) continue;
    // A stray separator character left at the split boundary
    const a = cleanSide(parts[0].replace(/\s*[-–—=|:]\s*$/, ''));
    const b = cleanSide(parts[1].replace(/^\s*[-–—=|:]\s*/, ''));
    if (valid(a, b)) pairs.push({ en: a, de: b });
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
