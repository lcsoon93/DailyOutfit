// Riconoscimento del colore principale di un capo e regole di abbinamento.
const Colors = (() => {
  const PALETTE = [
    { name: 'Nero', hex: '#1c1c1c', neutral: true },
    { name: 'Bianco', hex: '#f4f4f2', neutral: true },
    { name: 'Grigio', hex: '#8c8c8c', neutral: true },
    { name: 'Grigio scuro', hex: '#4a4a4a', neutral: true },
    { name: 'Beige', hex: '#d8c4a0', neutral: true },
    { name: 'Cammello', hex: '#b08850', neutral: true },
    { name: 'Marrone', hex: '#6b4429', neutral: true },
    { name: 'Blu navy', hex: '#1f2a44', neutral: true },
    { name: 'Jeans', hex: '#4a6688', neutral: true },
    { name: 'Blu', hex: '#2456b5' },
    { name: 'Azzurro', hex: '#8fbbe6' },
    { name: 'Rosso', hex: '#c62828' },
    { name: 'Bordeaux', hex: '#6d1a2a' },
    { name: 'Rosa', hex: '#f2a7bd' },
    { name: 'Fucsia', hex: '#d81b7a' },
    { name: 'Arancione', hex: '#ef7d22' },
    { name: 'Giallo', hex: '#f2cf3a' },
    { name: 'Senape', hex: '#c99a2e' },
    { name: 'Verde', hex: '#2e8b57' },
    { name: 'Verde oliva', hex: '#6b6b2f' },
    { name: 'Verde salvia', hex: '#9caf88' },
    { name: 'Viola', hex: '#6a3d9a' },
    { name: 'Lilla', hex: '#c3a6d9' },
  ];

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  }

  function dist(a, b) {
    // distanza "redmean", più vicina alla percezione dell'occhio
    const rm = (a[0] + b[0]) / 2;
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
  }

  function nearest(hex) {
    const rgb = hexToRgb(hex);
    let best = PALETTE[0], bestD = Infinity;
    for (const p of PALETTE) {
      const d = dist(rgb, hexToRgb(p.hex));
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  function isNeutral(hex) {
    if (nearest(hex).neutral) return true;
    const [, s, l] = rgbToHsl(...hexToRgb(hex));
    return s < 0.15 || l < 0.12 || l > 0.92;
  }

  // Colore dominante dell'immagine, ignorando lo sfondo (stimato dai bordi).
  function dominant(img) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const px = (x, y) => {
      const i = (y * size + x) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };

    const border = [];
    for (let i = 0; i < size; i++) {
      border.push(px(i, 0), px(i, size - 1), px(0, i), px(size - 1, i));
    }
    const bg = border.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0])
      .map((v) => v / border.length);

    const buckets = new Map();
    // concentra il campionamento nella zona centrale, dove sta il capo
    for (let y = 8; y < size - 8; y++) {
      for (let x = 8; x < size - 8; x++) {
        const p = px(x, y);
        if (p[3] < 128) continue;
        if (dist(p, bg) < 60) continue;
        const key = (p[0] >> 4) + ',' + (p[1] >> 4) + ',' + (p[2] >> 4);
        const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        b.n++; b.r += p[0]; b.g += p[1]; b.b += p[2];
        buckets.set(key, b);
      }
    }
    let best = null;
    for (const b of buckets.values()) if (!best || b.n > best.n) best = b;
    if (!best) {
      // capo dello stesso colore dello sfondo: usa la media del centro
      const c = px(size / 2, size / 2);
      return rgbToHex(c[0], c[1], c[2]);
    }
    return rgbToHex(best.r / best.n, best.g / best.n, best.b / best.n);
  }

  // Punteggio di armonia tra due colori.
  function pairScore(a, b) {
    const na = isNeutral(a), nb = isNeutral(b);
    if (na && nb) return 1;
    if (na || nb) return 1.5;
    const [ha, sa] = rgbToHsl(...hexToRgb(a));
    const [hb, sb] = rgbToHsl(...hexToRgb(b));
    let dh = Math.abs(ha - hb);
    if (dh > 180) dh = 360 - dh;
    if (dh < 25) return 1.2;                      // tono su tono / analoghi
    if (dh > 150) return sa > 0.6 && sb > 0.6 ? 0.2 : 0.8; // complementari
    if (dh < 60) return 0.4;
    return -1.5;                                  // contrasto poco armonico
  }

  // Valuta la palette complessiva e restituisce punteggio + motivazione.
  function harmony(hexes) {
    let score = 0, pairs = 0;
    for (let i = 0; i < hexes.length; i++) {
      for (let j = i + 1; j < hexes.length; j++) {
        score += pairScore(hexes[i], hexes[j]);
        pairs++;
      }
    }
    const accents = new Set(hexes.filter((h) => !isNeutral(h)).map((h) => nearest(h).name));
    if (accents.size > 2) score -= (accents.size - 2) * 2;

    let reason;
    if (accents.size === 0) reason = 'Palette tutta neutra: sobria e sempre corretta.';
    else if (accents.size === 1) reason = `Base neutra con un punto di colore (${[...accents][0].toLowerCase()}).`;
    else if (accents.size === 2) reason = `Due colori protagonisti (${[...accents].join(' e ').toLowerCase()}) che dialogano tra loro.`;
    else reason = 'Combinazione colorata e audace.';

    return { score: pairs ? score / pairs : 0, reason };
  }

  return { PALETTE, nearest, isNeutral, dominant, harmony };
})();
