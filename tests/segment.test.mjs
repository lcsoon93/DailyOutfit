import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const { Segment } = loadApp(['segment.js']);

// Foto sintetica: un "maglione" blu (corpo + maniche) su uno sfondo dato.
const W = 240, H = 300;
const inGarment = (x, y) => (x >= 70 && x < 170 && y >= 60 && y < 260)
  || (y >= 60 && y < 110 && x >= 30 && x < 210);

function photo(background) {
  const d = new Uint8ClampedArray(W * H * 4);
  const truth = new Uint8Array(W * H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let c;
      if (inGarment(x, y)) {
        truth[i] = 1;
        const n = (rnd() - 0.5) * 8; // grana del tessuto
        c = [32 + n, 40 + n, 72 + n];
      } else {
        c = background(x, y, rnd);
      }
      d.set([c[0], c[1], c[2], 255], i * 4);
    }
  }
  return { d, truth };
}

const plain = (x, y, rnd) => { const n = (rnd() - 0.5) * 6; return [236 + n, 232 + n, 222 + n]; };
// tovaglia a fiori fitti, con anche fiori blu scuro simili al capo
const COLORS = [[214, 60, 80], [240, 180, 40], [60, 140, 90], [250, 250, 250], [200, 120, 180], [34, 52, 108]];
const floral = (x, y) => {
  const cx = Math.floor(x / 16), cy = Math.floor(y / 16);
  const k = (cx * 7 + cy * 13 + ((cx * cy) % 5)) % COLORS.length;
  const dx = (x % 16) - 8, dy = (y % 16) - 8;
  return dx * dx + dy * dy < 36 ? COLORS[k] : [120, 150, 200];
};

function iou(fg, truth) {
  let inter = 0, union = 0;
  for (let i = 0; i < truth.length; i++) {
    if (fg[i] && truth[i]) inter++;
    if (fg[i] || truth[i]) union++;
  }
  return inter / union;
}

test('sfondo in tinta unita: lo scontorno classico trova il capo', () => {
  const { d, truth } = photo(plain);
  const res = Segment.segment(d, W, H);
  assert.ok(res, 'nessun risultato');
  assert.ok(iou(res.fg, truth) > 0.93, `IoU ${iou(res.fg, truth)}`);
  assert.ok(res.confidence > 0.5, `affidabilità ${res.confidence}`);
});

test('tovaglia a fiori: il metodo del riquadro separa il capo', () => {
  const { d, truth } = photo(floral);
  const res = Segment.segmentBox(d, W, H);
  assert.ok(res, 'nessun risultato');
  assert.ok(iou(res.fg, truth) > 0.85, `IoU ${iou(res.fg, truth)}`);
});

test('bacchetta: seleziona solo l\'area di colore simile collegata', () => {
  const { d, truth } = photo(plain);
  const lab = Segment.toLab(d, W * H);
  const sel = Segment.wandRegion(lab, W, H, 5, 5, 12);
  let bg = 0, garment = 0;
  for (let i = 0; i < truth.length; i++) if (sel[i]) (truth[i] ? garment++ : bg++);
  // solo il bordo di 1 px (allargato apposta contro gli aloni), non il capo
  assert.ok(garment < 1000, `ha preso ${garment} pixel del capo`);
  assert.ok(bg > (W * H - truth.reduce((a, b) => a + b, 0)) * 0.95);
});
