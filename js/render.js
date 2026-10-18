// Render 2D dell'outfit: collage "flat lay" composto dalle foto dei capi,
// ritagliate dallo sfondo quando possibile.
const Render = (() => {
  const W = 800, H = 1000;
  const cutoutCache = new Map();

  // Rettangoli [x, y, w, h] in cui disporre ciascun capo.
  const SLOTS = {
    outerwear: [20, 60, 300, 440],
    layer: [490, 60, 290, 380],
    top: [220, 50, 360, 360],
    bottom: [240, 380, 320, 440],
    onepiece: [210, 50, 380, 720],
    shoes: [260, 800, 280, 170],
    accessory: [560, 500, 220, 240],
  };
  // Ordine di disegno: quello che sta "sotto" va per primo.
  const ORDER = ['outerwear', 'layer', 'bottom', 'onepiece', 'top', 'shoes', 'accessory'];

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Rimuove lo sfondo con un flood fill dai bordi, solo se i bordi sono
  // abbastanza uniformi da sembrare uno sfondo; poi ritaglia al contenuto.
  async function cutout(item) {
    if (cutoutCache.has(item.image)) return cutoutCache.get(item.image);
    const img = await loadImage(item.image);
    const w = img.width, h = img.height;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const im = ctx.getImageData(0, 0, w, h);
    const d = im.data;

    const border = [];
    for (let x = 0; x < w; x += 2) border.push((x) * 4, ((h - 1) * w + x) * 4);
    for (let y = 0; y < h; y += 2) border.push((y * w) * 4, (y * w + w - 1) * 4);
    const mean = [0, 1, 2].map((c) => border.reduce((s, i) => s + d[i + c], 0) / border.length);
    const spread = Math.sqrt(border.reduce((s, i) => s + [0, 1, 2].reduce((t, c) => t + (d[i + c] - mean[c]) ** 2, 0), 0) / border.length);

    let result = { canvas, cut: false };
    if (spread < 28) {
      const tol = Math.max(32, spread * 2.5);
      const near = (p) => Math.abs(d[p] - mean[0]) + Math.abs(d[p + 1] - mean[1]) + Math.abs(d[p + 2] - mean[2]) < tol * 1.7;
      const bg = new Uint8Array(w * h);
      const stack = [];
      for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
      for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
      while (stack.length) {
        const i = stack.pop();
        if (bg[i] || !near(i * 4)) continue;
        bg[i] = 1;
        const x = i % w, y = (i / w) | 0;
        if (x > 0) stack.push(i - 1);
        if (x < w - 1) stack.push(i + 1);
        if (y > 0) stack.push(i - w);
        if (y < h - 1) stack.push(i + w);
      }
      let minX = w, minY = h, maxX = -1, maxY = -1, kept = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (bg[i]) { d[i * 4 + 3] = 0; continue; }
          kept++;
          // bordo morbido: pixel adiacenti allo sfondo semitrasparenti
          if ((x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w])) d[i * 4 + 3] = 140;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
      // se il ritaglio ha tolto quasi tutto o quasi niente, meglio la foto intera
      const ratio = kept / (w * h);
      if (ratio > 0.05 && ratio < 0.95) {
        ctx.putImageData(im, 0, 0);
        const out = document.createElement('canvas');
        out.width = maxX - minX + 1; out.height = maxY - minY + 1;
        out.getContext('2d').drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
        result = { canvas: out, cut: true };
      }
    }
    cutoutCache.set(item.image, result);
    return result;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function collage(items, canvas) {
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#f7f3ee');
    bg.addColorStop(1, '#ece5dc');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const sorted = [...items].sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category));
    for (const item of sorted) {
      const [sx, sy, sw, sh] = SLOTS[item.category] || SLOTS.accessory;
      const { canvas: src, cut } = await cutout(item);
      const scale = Math.min(sw / src.width, sh / src.height);
      const dw = src.width * scale, dh = src.height * scale;
      const dx = sx + (sw - dw) / 2, dy = sy + (sh - dh) / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(60, 40, 20, .22)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 8;
      if (cut) {
        ctx.drawImage(src, dx, dy, dw, dh);
      } else {
        // foto non ritagliabile: cartolina con angoli arrotondati
        roundRect(ctx, dx, dy, dw, dh, 16);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.clip();
        ctx.drawImage(src, dx, dy, dw, dh);
      }
      ctx.restore();
    }
    return canvas;
  }

  return { collage };
})();
