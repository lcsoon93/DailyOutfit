// Scontorno dei capi: toglie lo sfondo dalla foto e ritaglia al capo.
// Usa un modello di segmentazione che gira nel browser (la prima volta
// scarica ~80 MB, poi resta in cache); se non è disponibile ripiega su un
// ritaglio semplice basato sul colore dei bordi.
const Cutout = (() => {
  const LIB = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';
  const MAX = 900;
  let lib;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function toCanvas(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  }

  // Ritaglia al riquadro del capo (pixel non trasparenti) con un piccolo
  // margine. Restituisce null se il capo occupa troppo poco o tutta l'immagine:
  // segno che lo scontorno non è riuscito.
  function trim(canvas) {
    const { width: w, height: h } = canvas;
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1, kept = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] < 40) continue;
        kept++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    const ratio = kept / (w * h);
    if (ratio < 0.03 || ratio > 0.97) return null;
    const pad = 4;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    const cw = maxX - minX + 1, ch = maxY - minY + 1;
    const scale = Math.min(1, MAX / Math.max(cw, ch));
    const out = document.createElement('canvas');
    out.width = Math.round(cw * scale); out.height = Math.round(ch * scale);
    out.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, out.width, out.height);
    return out;
  }

  async function withModel(src, onProgress) {
    if (!lib) lib = import(LIB).catch((err) => { lib = null; throw err; });
    const mod = await lib;
    const removeBackground = mod.removeBackground || mod.default;
    const blob = await removeBackground(src, {
      model: 'isnet_fp16',
      output: { format: 'image/png' },
      progress: (key, current, total) => {
        if (onProgress && /fetch/.test(key) && total) onProgress(current / total);
      },
    });
    const url = URL.createObjectURL(blob);
    try {
      return toCanvas(await loadImage(url));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Ripiego: flood fill dai bordi, solo se i bordi sono abbastanza uniformi.
  async function withBorderColor(src) {
    const canvas = toCanvas(await loadImage(src));
    const { width: w, height: h } = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const im = ctx.getImageData(0, 0, w, h);
    const d = im.data;

    const border = [];
    for (let x = 0; x < w; x += 2) border.push(x * 4, ((h - 1) * w + x) * 4);
    for (let y = 0; y < h; y += 2) border.push(y * w * 4, (y * w + w - 1) * 4);
    const mean = [0, 1, 2].map((c) => border.reduce((s, i) => s + d[i + c], 0) / border.length);
    const spread = Math.sqrt(border.reduce((s, i) => s + [0, 1, 2].reduce((t, c) => t + (d[i + c] - mean[c]) ** 2, 0), 0) / border.length);
    if (spread > 28) return null;

    const tol = Math.max(32, spread * 2.5) * 1.7;
    const near = (p) => Math.abs(d[p] - mean[0]) + Math.abs(d[p + 1] - mean[1]) + Math.abs(d[p + 2] - mean[2]) < tol;
    const bg = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
    while (stack.length) {
      const i = stack.pop();
      if (bg[i] || !near(i * 4)) continue;
      bg[i] = 1;
      const x = i % w;
      if (x > 0) stack.push(i - 1);
      if (x < w - 1) stack.push(i + 1);
      if (i >= w) stack.push(i - w);
      if (i < w * (h - 1)) stack.push(i + w);
    }
    for (let i = 0; i < w * h; i++) {
      if (bg[i]) d[i * 4 + 3] = 0;
      else if ((i % w && bg[i - 1]) || bg[i + 1] || bg[i - w] || bg[i + w]) d[i * 4 + 3] = 150; // bordo morbido
    }
    ctx.putImageData(im, 0, 0);
    return canvas;
  }

  // Restituisce un PNG trasparente ritagliato al capo, o null.
  async function make(src, onProgress) {
    let canvas = null;
    try {
      canvas = trim(await withModel(src, onProgress));
    } catch (err) {
      console.warn('Scontorno con il modello non disponibile, uso il metodo semplice', err);
    }
    if (!canvas) {
      const simple = await withBorderColor(src);
      canvas = simple && trim(simple);
    }
    return canvas ? canvas.toDataURL('image/png') : null;
  }

  return { make };
})();
