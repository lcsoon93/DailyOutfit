// Render 2D dell'outfit: una tavola in stile rivista (formato 4:5) con i capi
// scontornati, disposti come indossati nella colonna principale e con giacca,
// maglione, accessori e scarpe nella colonna laterale.
const Render = (() => {
  const W = 1080, H = 1350, M = 64;
  const BODY = { x: M, y: 215, w: W - 2 * M, h: 975 };
  const COLORS = { bg: '#f6f2ec', arch: '#ece4d9', ink: '#2b2622', muted: '#8a8078', line: '#dcd3c8' };
  const SERIF = 'Georgia, "Times New Roman", serif';
  const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  // Peso verticale di ciascuna categoria nella sua colonna.
  const WEIGHT = { top: 1, bottom: 1.35, onepiece: 1, outerwear: 1.35, layer: 1.05, accessory: 0.7, shoes: 0.62 };
  const SIDE_ORDER = ['outerwear', 'layer', 'accessory', 'shoes'];

  const imageCache = new Map();
  function loadImage(src) {
    if (!imageCache.has(src)) {
      imageCache.set(src, new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      }));
    }
    return imageCache.get(src);
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

  // Altezza massima di una cella laterale: con pochi capi restano raggruppati
  // al centro invece di sparpagliarsi su tutta l'altezza.
  const SIDE_MAX = { outerwear: 470, layer: 400, accessory: 250, shoes: 210 };

  // Divide una colonna in celle proporzionali al peso dei capi.
  function stack(items, x, y, w, h, gap, maxH = {}) {
    const total = items.reduce((s, i) => s + (WEIGHT[i.category] || 1), 0);
    const free = h - gap * (items.length - 1);
    const heights = items.map((i) => Math.min(free * (WEIGHT[i.category] || 1) / total, maxH[i.category] || Infinity));
    let cy = y + (h - heights.reduce((s, v) => s + v, 0) - gap * (items.length - 1)) / 2;
    return items.map((item, n) => {
      const ch = heights[n];
      const cell = { item, x, y: cy, w, h: ch };
      cy += ch + gap;
      return cell;
    });
  }

  function layout(items) {
    const main = items.filter((i) => ['top', 'bottom', 'onepiece'].includes(i.category))
      .sort((a, b) => ['top', 'onepiece', 'bottom'].indexOf(a.category) - ['top', 'onepiece', 'bottom'].indexOf(b.category));
    const side = items.filter((i) => !main.includes(i))
      .sort((a, b) => SIDE_ORDER.indexOf(a.category) - SIDE_ORDER.indexOf(b.category));

    if (!side.length) {
      const w = 620;
      return { main: stack(main, (W - w) / 2, BODY.y, w, BODY.h, 0), side: [], arch: { x: (W - 700) / 2, w: 700 } };
    }
    const mainW = Math.round(BODY.w * 0.56);
    const gap = 36;
    return {
      main: stack(main, BODY.x, BODY.y, mainW, BODY.h, 0),
      side: stack(side, BODY.x + mainW + gap, BODY.y + 10, BODY.w - mainW - gap, BODY.h - 20, 28, SIDE_MAX),
      arch: { x: BODY.x - 10, w: mainW + 20 },
    };
  }

  // Disegna un capo dentro la sua cella. align: 'top' | 'bottom' | 'center'.
  async function drawItem(ctx, cell, align, inset = 0.92) {
    const { item } = cell;
    const useCutout = item.cutout && !item.noCutout;
    const img = await loadImage(useCutout ? item.cutout : item.image);
    const maxW = cell.w * inset, maxH = cell.h * inset;
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * scale, h = img.height * scale;
    const x = cell.x + (cell.w - w) / 2;
    const y = align === 'top' ? cell.y : align === 'bottom' ? cell.y + cell.h - h : cell.y + (cell.h - h) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(43, 32, 20, .20)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 18;
    if (useCutout) {
      ctx.drawImage(img, x, y, w, h);
    } else {
      // foto non scontornata: stampa con cornice bianca
      roundRect(ctx, x - 10, y - 10, w + 20, h + 20, 14);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      roundRect(ctx, x, y, w, h, 8);
      ctx.clip();
      ctx.drawImage(img, x, y, w, h);
    }
    ctx.restore();
  }

  function spaced(ctx, text, x, y, spacing) {
    // letter-spacing manuale: non tutti i browser supportano ctx.letterSpacing
    let cx = x;
    for (const ch of text) {
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + spacing;
    }
    return cx - spacing - x;
  }

  function spacedWidth(ctx, text, spacing) {
    return [...text].reduce((s, ch) => s + ctx.measureText(ch).width + spacing, -spacing);
  }

  function header(ctx, meta) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `600 20px ${SANS}`;
    ctx.textBaseline = 'alphabetic';
    const kicker = 'OUTFIT DEL GIORNO';
    spaced(ctx, kicker, M, 92, 5);

    const date = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
    const right = [meta.subtitle && meta.subtitle.toUpperCase(), date].filter(Boolean).join('  ·  ');
    spaced(ctx, right, W - M - spacedWidth(ctx, right, 3), 92, 3);

    ctx.fillStyle = COLORS.ink;
    ctx.font = `italic 58px ${SERIF}`;
    ctx.fillText(meta.title || 'Il tuo outfit', M - 2, 178);

    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(M, 112); ctx.lineTo(W - M, 112);
    ctx.stroke();
  }

  function footer(ctx, items) {
    const y = H - 92;
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(M, y - 34); ctx.lineTo(W - M, y - 34);
    ctx.stroke();

    // palette dei colori dell'outfit
    const seen = new Set();
    const swatches = items.map((i) => i.color).filter((c) => !seen.has(Colors.nearest(c).name) && seen.add(Colors.nearest(c).name));
    swatches.forEach((c, n) => {
      ctx.beginPath();
      ctx.arc(M + 18 + n * 46, y + 6, 17, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, .12)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // elenco dei capi
    ctx.fillStyle = COLORS.muted;
    ctx.font = `19px ${SANS}`;
    const x0 = M + swatches.length * 46 + 24;
    let names = items.map((i) => i.name || Colors.nearest(i.color).name).join('  ·  ');
    while (ctx.measureText(names).width > W - M - x0 - 170 && names.length > 4) names = names.slice(0, -2);
    if (names !== items.map((i) => i.name || Colors.nearest(i.color).name).join('  ·  ')) names = names.trimEnd() + '…';
    ctx.fillText(names, x0, y + 13);

    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 18px ${SANS}`;
    const brand = 'DAILYOUTFIT';
    spaced(ctx, brand, W - M - spacedWidth(ctx, brand, 4), y + 13, 4);
  }

  async function collage(items, canvas, meta = {}) {
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    const { main, side, arch } = layout(items);

    // arco morbido dietro la figura principale
    ctx.fillStyle = COLORS.arch;
    const ar = arch.w / 2;
    ctx.beginPath();
    ctx.moveTo(arch.x, BODY.y + BODY.h + 10);
    ctx.lineTo(arch.x, BODY.y + ar + 20);
    ctx.arc(arch.x + ar, BODY.y + ar + 20, ar, Math.PI, 0);
    ctx.lineTo(arch.x + arch.w, BODY.y + BODY.h + 10);
    ctx.closePath();
    ctx.fill();

    header(ctx, meta);

    // sopra e sotto si toccano come se fossero indossati
    for (const cell of [...main].reverse()) {
      const align = main.length === 1 ? 'center' : cell.item.category === 'top' ? 'bottom' : 'top';
      await drawItem(ctx, cell, align, main.length === 1 ? 0.9 : 0.94);
    }
    for (const cell of side) await drawItem(ctx, cell, 'center', 0.86);

    footer(ctx, items);
    return canvas;
  }

  return { collage };
})();
