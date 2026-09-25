// Sharing decks between phones: a compact text code (also used inside QR
// codes), deck files, and reading QR codes back from photos.
import { loadBitmap } from './scan.js';

const PREFIX = 'VOKABO1:';

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toB64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function cleanDeck(name, words) {
  const list = (Array.isArray(words) ? words : [])
    .map((w) => (Array.isArray(w) ? w : [w?.en, w?.de]).map((x) => String(x ?? '').trim().slice(0, 120)))
    .filter(([en, de]) => en && de)
    .slice(0, 2000);
  if (!list.length) throw new Error('This deck has no words');
  return { name: String(name || 'Shared deck').trim().slice(0, 60) || 'Shared deck', words: list.map(([en, de]) => ({ en, de })) };
}

// Deck → "VOKABO1:<deflated JSON, base64url>"
export async function encodeDeck(deck) {
  const json = JSON.stringify({ n: deck.name, w: deck.words.map((w) => [w.en, w.de]) });
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  return PREFIX + toB64Url(packed);
}

// Finds a share code anywhere in the text (e.g. a forwarded chat message)
export function findCode(text) {
  const m = String(text).match(/VOKABO1:([A-Za-z0-9_-]+)/);
  return m ? m[0] : null;
}

export async function decodeDeck(text) {
  const code = findCode(text);
  if (!code) throw new Error('No Vokabo share code found');
  let raw;
  try {
    raw = await pipe(fromB64Url(code.slice(PREFIX.length)), new DecompressionStream('deflate-raw'));
  } catch {
    throw new Error('The share code is incomplete or damaged');
  }
  const data = JSON.parse(new TextDecoder().decode(raw));
  return cleanDeck(data.n, data.w);
}

// Deck files are small JSON documents; a share code inside any text file works too
export async function readDeckFile(file) {
  const text = await file.text();
  if (findCode(text)) return decodeDeck(text);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This is not a Vokabo deck file');
  }
  if (data.vokabo && Array.isArray(data.words)) return cleanDeck(data.name, data.words);
  throw new Error(Array.isArray(data.decks) ? 'This is a full backup — import it in Settings → Import backup' : 'This is not a Vokabo deck file');
}

export function deckFileContents(deck) {
  return JSON.stringify({ vokabo: 1, name: deck.name, words: deck.words.map((w) => [w.en, w.de]) }, null, 1);
}

export function deckFileName(deck) {
  const slug = deck.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck';
  return `${slug}.vokabo.json`;
}

export function deckAsText(deck) {
  return deck.words.map((w) => `${w.en} - ${w.de}`).join('\n');
}

// Returns an SVG string for the QR code, or null when the deck is too big
export function qrSvg(text) {
  if (!window.qrcode) return null;
  const qr = window.qrcode(0, 'L');
  try {
    qr.addData(text, 'Byte');
    qr.make();
  } catch {
    return null;
  }
  const n = qr.getModuleCount();
  const m = 3;
  let path = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + m} ${r + m}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" shape-rendering="crispEdges" role="img" aria-label="QR code for this deck"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

// Reads a QR code from a photo or screenshot, trying a few sizes because
// jsQR is picky about very large or very small codes.
export async function readQrFromImage(file) {
  if (!window.jsQR) throw new Error('QR reader not loaded');
  const bmp = await loadBitmap(file);
  for (const max of [1200, 800, 1800, 500]) {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const hit = window.jsQR(img.data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
    if (hit?.data) return hit.data;
  }
  throw new Error('No QR code found in that picture. Try again closer and straight on.');
}
