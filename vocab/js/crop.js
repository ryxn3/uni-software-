// Crop & rotate step before scanning: drag the corners of a box around the
// word table so headings, handwriting and the facing page are left out.
import { loadBitmap } from './scan.js';

const MIN = 40; // smallest crop box, in screen pixels

function rotate(src, quarterTurns) {
  const t = ((quarterTurns % 4) + 4) % 4;
  if (!t) return src;
  const c = document.createElement('canvas');
  c.width = t % 2 ? src.height : src.width;
  c.height = t % 2 ? src.width : src.height;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((t * Math.PI) / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

export class Cropper {
  constructor(stage) {
    this.stage = stage;
    this.canvas = stage.querySelector('canvas');
    this.box = stage.querySelector('.crop-box');
    this.box.addEventListener('pointerdown', (e) => this.startDrag(e));
    window.addEventListener('resize', () => this.source && this.layout(false));
  }

  async load(file) {
    this.view = null;
    this.stage.classList.add('loading');
    this.original = await loadBitmap(file);
    this.stage.classList.remove('loading');
    this.turns = 0;
    this.source = this.original;
    this.layout(true);
  }

  rotate(dir) {
    this.turns += dir;
    this.source = rotate(this.original, this.turns);
    this.layout(true);
  }

  reset() {
    this.layout(true);
  }

  // Fit the photo into the stage and (optionally) put the box around all of it
  layout(resetBox) {
    const maxW = this.stage.clientWidth || window.innerWidth - 64;
    const maxH = Math.max(260, Math.min(window.innerHeight * 0.62, 900));
    const scale = Math.min(maxW / this.source.width, maxH / this.source.height);
    const w = Math.round(this.source.width * scale), h = Math.round(this.source.height * scale);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.getContext('2d').drawImage(this.source, 0, 0, w * dpr, h * dpr);
    const old = this.rect && this.view ? { x: this.rect.x / this.view.w, y: this.rect.y / this.view.h, w: this.rect.w / this.view.w, h: this.rect.h / this.view.h } : null;
    this.view = { w, h, scale };
    this.rect = resetBox || !old
      ? { x: 0, y: 0, w, h }
      : { x: old.x * w, y: old.y * h, w: old.w * w, h: old.h * h };
    this.draw();
  }

  draw() {
    const { x, y, w, h } = this.rect;
    const off = this.canvas.offsetLeft;
    Object.assign(this.box.style, { left: `${off + x}px`, top: `${this.canvas.offsetTop + y}px`, width: `${w}px`, height: `${h}px` });
  }

  startDrag(e) {
    e.preventDefault();
    if (!this.view) return;
    const handle = e.target.dataset.h || 'move';
    const start = { px: e.clientX, py: e.clientY, ...this.rect };
    const { w: W, h: H } = this.view;
    const move = (ev) => {
      const dx = ev.clientX - start.px, dy = ev.clientY - start.py;
      let { x, y, w, h } = start;
      if (handle === 'move') {
        x = Math.min(Math.max(0, x + dx), W - w);
        y = Math.min(Math.max(0, y + dy), H - h);
      } else {
        if (handle.includes('l')) { const nx = Math.min(Math.max(0, x + dx), x + w - MIN); w += x - nx; x = nx; }
        if (handle.includes('r')) w = Math.min(Math.max(MIN, w + dx), W - x);
        if (handle.includes('t')) { const ny = Math.min(Math.max(0, y + dy), y + h - MIN); h += y - ny; y = ny; }
        if (handle.includes('b')) h = Math.min(Math.max(MIN, h + dy), H - y);
      }
      this.rect = { x, y, w, h };
      this.draw();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  // The cropped area at full photo resolution, as a JPEG file
  async result(name) {
    if (!this.view) throw new Error('The photo is still loading');
    const s = this.view.scale;
    const x = Math.round(this.rect.x / s), y = Math.round(this.rect.y / s);
    const w = Math.max(1, Math.round(this.rect.w / s)), h = Math.max(1, Math.round(this.rect.h / s));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(this.source, x, y, w, h, 0, 0, w, h);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
    return new File([blob], name.replace(/\.\w+$/, '') + '-cropped.jpg', { type: 'image/jpeg' });
  }
}
