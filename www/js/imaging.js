// Elaborazione delle foto dei capi, senza intelligenza artificiale e tutta
// sul dispositivo: scontorno automatico basato sui colori dello sfondo,
// correzione di luce e dominante di colore, ritaglio al capo.
const Imaging = (() => {
  const STORE_MAX = 1280;  // lato massimo della foto salvata
  const WORK_MAX = 640;    // lato massimo su cui calcolare lo scontorno automatico
  const CUTOUT_MAX = 1000; // lato massimo dell'immagine scontornata

  // ---------- canvas e immagini ----------
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  const ctxOf = (c) => c.getContext('2d', { willReadFrequently: true });

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('immagine non leggibile'));
      img.src = src;
    });
  }

  function drawScaled(source, max) {
    const w = source.naturalWidth || source.width, h = source.naturalHeight || source.height;
    const s = Math.min(1, max / Math.max(w, h));
    const c = makeCanvas(w * s, h * s);
    const ctx = ctxOf(c);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, c.width, c.height);
    return c;
  }

  let webpSupported;
  // WebP con trasparenza dove supportato (molto più leggero del PNG), altrimenti PNG.
  function encodeAlpha(c, quality = 0.9) {
    if (webpSupported === undefined) webpSupported = makeCanvas(1, 1).toDataURL('image/webp').startsWith('data:image/webp');
    return webpSupported ? c.toDataURL('image/webp', quality) : c.toDataURL('image/png');
  }

  function transparentShare(c) {
    const d = ctxOf(c).getImageData(0, 0, c.width, c.height).data;
    let t = 0;
    for (let p = 3; p < d.length; p += 16) if (d[p] < 250) t++;
    return t / (d.length / 16);
  }

  // Legge il file scelto dall'utente e lo salva ridimensionato. Le foto con
  // sfondo già trasparente (PNG/WebP) restano tali e lo scontorno è già fatto.
  async function fromFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const c = drawScaled(img, STORE_MAX);
      if (/png|webp/.test(file.type) && transparentShare(c) > 0.03) {
        return { image: c.toDataURL('image/png'), transparent: true };
      }
      const flat = makeCanvas(c.width, c.height);
      const ctx = ctxOf(flat);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, flat.width, flat.height);
      ctx.drawImage(c, 0, 0);
      return { image: flat.toDataURL('image/jpeg', 0.88), transparent: false };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---------- colore: sRGB → CIELAB ----------
  const LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  const labF = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

  function toLab(data, n) {
    const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = LIN[data[p]], g = LIN[data[p + 1]], b = LIN[data[p + 2]];
      const fx = labF((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
      const fy = labF(r * 0.2126 + g * 0.7152 + b * 0.0722);
      const fz = labF((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
      L[i] = 116 * fy - 16;
      A[i] = 500 * (fx - fy);
      B[i] = 200 * (fy - fz);
    }
    return { L, A, B };
  }

  const dE = (lab, i, j) => Math.hypot(lab.L[i] - lab.L[j], lab.A[i] - lab.A[j], lab.B[i] - lab.B[j]);
  const dEc = (lab, i, c) => Math.hypot(lab.L[i] - c.l, lab.A[i] - c.a, lab.B[i] - c.b);

  // Sfocatura leggera 3×3: riduce grana e texture prima dell'analisi.
  function boxBlur(data, w, h) {
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const p = (yy * w + xx) * 4;
            r += data[p]; g += data[p + 1]; b += data[p + 2]; k++;
          }
        }
        const p = (y * w + x) * 4;
        out[p] = r / k; out[p + 1] = g / k; out[p + 2] = b / k; out[p + 3] = 255;
      }
    }
    return out;
  }

  // Intensità dei bordi: differenza di colore con i pixel vicini.
  function gradient(lab, w, h) {
    const n = w * h;
    const gr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i % w;
      const r = x < w - 1 ? dE(lab, i, i + 1) : 0;
      const d = i < n - w ? dE(lab, i, i + w) : 0;
      gr[i] = Math.max(r, d);
    }
    return gr;
  }

  // ---------- modello dello sfondo ----------
  // Raggruppa i colori del bordo della foto (k-means): uno sfondo reale ha
  // spesso più toni (parquet, piastrelle, lenzuolo con pieghe).
  function backgroundClusters(lab, w, h) {
    const band = Math.max(2, Math.round(Math.min(w, h) * 0.02));
    const samples = [];
    for (let y = 0; y < h; y++) {
      for (let x = (y % 2); x < w; x += 2) {
        if (x >= band && x < w - band && y >= band && y < h - band) continue;
        samples.push(y * w + x);
      }
    }

    const centers = [];
    const mid = samples[samples.length >> 1];
    centers.push({ l: lab.L[mid], a: lab.A[mid], b: lab.B[mid] });
    while (centers.length < 6) {
      let far = -1, farD = 0;
      for (let s = 0; s < samples.length; s += 3) {
        const i = samples[s];
        let d = Infinity;
        for (const c of centers) d = Math.min(d, dEc(lab, i, c));
        if (d > farD) { farD = d; far = i; }
      }
      if (farD < 8) break;
      centers.push({ l: lab.L[far], a: lab.A[far], b: lab.B[far] });
    }

    const assign = new Int8Array(samples.length);
    for (let iter = 0; iter < 8; iter++) {
      const sum = centers.map(() => ({ l: 0, a: 0, b: 0, n: 0 }));
      samples.forEach((i, s) => {
        let best = 0, bestD = Infinity;
        centers.forEach((c, k) => {
          const d = dEc(lab, i, c);
          if (d < bestD) { bestD = d; best = k; }
        });
        assign[s] = best;
        const t = sum[best];
        t.l += lab.L[i]; t.a += lab.A[i]; t.b += lab.B[i]; t.n++;
      });
      sum.forEach((t, k) => {
        if (t.n) centers[k] = { l: t.l / t.n, a: t.a / t.n, b: t.b / t.n };
      });
    }

    return centers.map((c, k) => {
      let n = 0, sq = 0;
      samples.forEach((i, s) => {
        if (assign[s] !== k) return;
        n++;
        sq += dEc(lab, i, c) ** 2;
      });
      return { ...c, share: n / samples.length, spread: n ? Math.sqrt(sq / n) : 0 };
    }).filter((c) => c.share > 0);
  }

  // Fa crescere lo sfondo dai bordi della foto. Un pixel è sfondo se ha il
  // colore di uno dei gruppi di sfondo, oppure se prosegue senza salti di
  // colore un'area già di sfondo (ombre morbide, luce non uniforme).
  function growBackground(lab, w, h, clusters, local, follow) {
    const n = w * h;
    const g = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (const c of clusters) best = Math.min(best, dEc(lab, i, c) / c.tol);
      g[i] = best;
    }
    const bg = new Uint8Array(n);
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    const seed = (i) => { if (!bg[i] && g[i] <= 1) { bg[i] = 1; queue[tail++] = i; } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    // la continuità si misura su 2 pixel: un'ombra cambia piano, il bordo
    // (anche sfocato) di un capo cambia in fretta
    const grow = (i, j, back) => {
      if (bg[j]) return;
      if (g[j] <= 1 || (g[j] <= follow && dE(lab, back, j) <= local * 1.5)) { bg[j] = 1; queue[tail++] = j; }
    };
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      if (x > 0) grow(i, i - 1, x < w - 1 ? i + 1 : i);
      if (x < w - 1) grow(i, i + 1, x > 0 ? i - 1 : i);
      if (i >= w) grow(i, i - w, i < n - w ? i + w : i);
      if (i < n - w) grow(i, i + w, i >= w ? i - w : i);
    }

    // zone chiuse (piastrelle tra le fughe, sfondo dentro il manico di una
    // borsa) quasi tutte del colore dello sfondo: sono sfondo anche loro
    const seen = new Uint8Array(n);
    for (let s = 0; s < n; s++) {
      if (bg[s] || seen[s]) continue;
      let qh = 0, qt = 0, like = 0;
      queue[qt++] = s;
      seen[s] = 1;
      while (qh < qt) {
        const i = queue[qh++];
        if (g[i] <= 1) like++;
        const x = i % w;
        if (x > 0 && !bg[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; queue[qt++] = i - 1; }
        if (x < w - 1 && !bg[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; queue[qt++] = i + 1; }
        if (i >= w && !bg[i - w] && !seen[i - w]) { seen[i - w] = 1; queue[qt++] = i - w; }
        if (i < n - w && !bg[i + w] && !seen[i + w]) { seen[i + w] = 1; queue[qt++] = i + w; }
      }
      if (like >= qt * 0.9) for (let k = 0; k < qt; k++) bg[queue[k]] = 1;
    }
    return bg;
  }

  // Valuta un'ipotesi di scontorno: un buon contorno passa sui bordi veri
  // della foto ed è compatto (non sfilacciato in tante strisce).
  function scoreMask(fg, w, h, grad, parts, bgLike) {
    const n = w * h;
    let area = 0, perim = 0, edge = 0, like = 0;
    for (let i = 0; i < n; i++) {
      if (!fg[i]) continue;
      area++;
      if (bgLike[i]) like++;
      const x = i % w;
      const border = (x > 0 && !fg[i - 1]) || (x < w - 1 && !fg[i + 1]) || (i >= w && !fg[i - w]) || (i < n - w && !fg[i + w]);
      if (!border) continue;
      perim++;
      // il bordo vero può cadere a 1 px dal contorno della maschera
      let m = grad[i];
      if (x > 0) m = Math.max(m, grad[i - 1]);
      if (x < w - 1) m = Math.max(m, grad[i + 1]);
      if (i >= w) m = Math.max(m, grad[i - w]);
      if (i < n - w) m = Math.max(m, grad[i + w]);
      edge += m;
    }
    const share = area / n;
    if (share < 0.03 || share > 0.95 || !perim) return null;
    const meanEdge = edge / perim;
    const roundness = (perim * perim) / (4 * Math.PI * area); // 1 = cerchio, alto = frastagliato
    const fragmented = 1 + 0.15 * Math.max(0, parts - 2); // un paio di scarpe sono 2 parti
    // un "capo" fatto soprattutto di colori del bordo è probabilmente sfondo
    const made = 1 - 0.8 * (like / area);
    return { share, meanEdge, parts, value: (meanEdge / Math.sqrt(Math.max(1, roundness / 6)) / fragmented) * made };
  }

  // ---------- operazioni sulle maschere (1 = capo, 0 = sfondo) ----------
  function morph(mask, w, h, erode) {
    const out = new Uint8Array(mask.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = erode ? 1 : 0;
        for (let dy = -1; dy <= 1 && v === (erode ? 1 : 0); dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            const m = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : mask[yy * w + xx];
            if (erode && !m) { v = 0; break; }
            if (!erode && m) { v = 1; break; }
          }
        }
        out[y * w + x] = v;
      }
    }
    return out;
  }

  // Tiene solo le parti grandi del capo (toglie macchioline isolate) ma
  // conserva pezzi separati di dimensione simile, come un paio di scarpe.
  function keepLargeParts(mask, w, h, info = {}) {
    const n = w * h;
    const label = new Int32Array(n);
    const queue = new Int32Array(n);
    const areas = [0];
    for (let s = 0; s < n; s++) {
      if (!mask[s] || label[s]) continue;
      const id = areas.length;
      let head = 0, tail = 0, area = 0;
      queue[tail++] = s;
      label[s] = id;
      while (head < tail) {
        const i = queue[head++];
        area++;
        const x = i % w;
        if (x > 0 && mask[i - 1] && !label[i - 1]) { label[i - 1] = id; queue[tail++] = i - 1; }
        if (x < w - 1 && mask[i + 1] && !label[i + 1]) { label[i + 1] = id; queue[tail++] = i + 1; }
        if (i >= w && mask[i - w] && !label[i - w]) { label[i - w] = id; queue[tail++] = i - w; }
        if (i < n - w && mask[i + w] && !label[i + w]) { label[i + w] = id; queue[tail++] = i + w; }
      }
      areas.push(area);
    }
    const largest = Math.max(0, ...areas);
    const min = Math.max(largest * 0.04, n * 0.002);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (label[i] && areas[label[i]] >= min) out[i] = 1;
    info.parts = areas.filter((a) => a >= min).length;
    return out;
  }

  // Porta una maschera binaria a piena risoluzione con bordi morbidi.
  function maskToCanvas(mask, w, h, outW, outH) {
    const small = makeCanvas(w, h);
    const sctx = ctxOf(small);
    const im = sctx.createImageData(w, h);
    for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
      im.data[p] = im.data[p + 1] = im.data[p + 2] = 255;
      im.data[p + 3] = mask[i] ? 255 : 0;
    }
    sctx.putImageData(im, 0, 0);
    const big = makeCanvas(outW, outH);
    const bctx = ctxOf(big);
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(small, 0, 0, outW, outH);
    // stringe la sfumatura: bordo netto ma non seghettato, senza alone di sfondo
    const data = bctx.getImageData(0, 0, outW, outH);
    const d = data.data;
    for (let p = 3; p < d.length; p += 4) d[p] = Math.max(0, Math.min(255, (d[p] - 150) * 2.4 + 128));
    bctx.putImageData(data, 0, 0);
    return big;
  }

  // ---------- scontorno automatico ----------
  // Prova più ipotesi (quali toni del bordo sono sfondo, quanto essere
  // tolleranti) e tiene quella con il contorno migliore. Restituisce
  // { mask, confidence } con una maschera (alfa = capo) della dimensione
  // dell'immagine, oppure null se lo sfondo non si distingue dal capo.
  async function autoMask(src) {
    const img = await loadImage(src);
    const full = drawScaled(img, STORE_MAX);
    if (transparentShare(full) > 0.03) return { mask: alphaMask(full), confidence: 1 };

    const work = drawScaled(full, WORK_MAX);
    const w = work.width, h = work.height, n = w * h;
    const lab = toLab(boxBlur(ctxOf(work).getImageData(0, 0, w, h).data, w, h), n);
    const grad = gradient(lab, w, h);

    // rumore dello sfondo: intensità tipica dei "bordi" lungo il perimetro
    const band = [];
    for (let x = 0; x < w; x += 2) band.push(grad[w + x], grad[(h - 2) * w + x]);
    for (let y = 0; y < h; y += 2) band.push(grad[y * w + 1], grad[y * w + w - 2]);
    band.sort((p, q) => p - q);
    const noise = band[band.length >> 1] || 0;
    const local = Math.min(9, Math.max(3, 2 + 1.6 * noise));

    const clusters = backgroundClusters(lab, w, h);
    // pixel con un colore presente sul bordo (anche raro, come le fughe)
    const bgLike = new Uint8Array(n);
    const all = clusters.filter((c) => c.share >= 0.03);
    for (let i = 0; i < n; i++) {
      for (const c of all) {
        if (dEc(lab, i, c) <= Math.max(6, 4 + 1.5 * c.spread)) { bgLike[i] = 1; break; }
      }
    }
    let best = null;
    // ipotesi: quali toni del bordo sono sfondo (anche quelli rari, come le
    // fughe delle piastrelle?), quanta tolleranza sul colore, quanto seguire
    // le sfumature (ombre) partendo dallo sfondo
    for (const minShare of [0.03, 0.12]) {
      const chosen = clusters.filter((c) => c.share >= minShare);
      if (!chosen.length || (minShare > 0.03 && chosen.length === clusters.length)) continue;
      for (const scale of [0.7, 1.2]) {
        const model = chosen.map((c) => ({ ...c, tol: Math.min(18, Math.max(6, 4 + 1.5 * c.spread)) * scale }));
        for (const follow of [1.6, 2.5]) {
          const bg = growBackground(lab, w, h, model, local, follow);
          let fg = new Uint8Array(n);
          for (let i = 0; i < n; i++) fg[i] = bg[i] ? 0 : 1;
          fg = morph(morph(fg, w, h, true), w, h, false); // apertura: via sfilacci e puntini
          const info = {};
          fg = keepLargeParts(fg, w, h, info);
          const score = scoreMask(fg, w, h, grad, info.parts, bgLike);
          if (score && (!best || score.value > best.score.value)) best = { fg, score };
        }
      }
    }
    if (!best) return null;

    // affidabilità: quanto il contorno trovato è più netto del rumore di
    // fondo; un risultato spezzato in molte parti è sospetto
    let confidence = Math.max(0, Math.min(1, (best.score.meanEdge / (noise + 1) - 1.5) / 4));
    if (best.score.parts > 3) confidence *= 0.3;
    return { mask: maskToCanvas(best.fg, w, h, full.width, full.height), confidence };
  }

  function alphaMask(c) {
    const m = makeCanvas(c.width, c.height);
    const ctx = ctxOf(m);
    ctx.drawImage(c, 0, 0);
    const data = ctx.getImageData(0, 0, m.width, m.height);
    const d = data.data;
    for (let p = 0; p < d.length; p += 4) d[p] = d[p + 1] = d[p + 2] = 255;
    ctx.putImageData(data, 0, 0);
    return m;
  }

  // ---------- bacchetta magica (editor) ----------
  // Seleziona l'area collegata al punto toccato con colore simile.
  function wandRegion(lab, w, h, sx, sy, tolerance) {
    const n = w * h;
    const s = sy * w + sx;
    let l = 0, a = 0, b = 0, k = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = sx + dx, y = sy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        l += lab.L[i]; a += lab.A[i]; b += lab.B[i]; k++;
      }
    }
    const c = { l: l / k, a: a / k, b: b / k };
    const sel = new Uint8Array(n);
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    sel[s] = 1;
    queue[tail++] = s;
    const grow = (i, j) => {
      if (sel[j]) return;
      const d = dEc(lab, j, c);
      if (d <= tolerance || (d <= tolerance * 1.8 && dE(lab, i, j) <= 4)) { sel[j] = 1; queue[tail++] = j; }
    };
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      if (x > 0) grow(i, i - 1);
      if (x < w - 1) grow(i, i + 1);
      if (i >= w) grow(i, i - w);
      if (i < n - w) grow(i, i + w);
    }
    return morph(sel, w, h, false); // allarga di 1 px per non lasciare aloni
  }

  // ---------- ritocco: luce e dominante di colore ----------
  // Schiarisce le foto scure (senza mai scurire né "bruciare" i bianchi) e,
  // se lo sfondo tolto era bianco o grigio ma con una dominante (luce gialla
  // di casa), corregge la dominante usando lo sfondo come riferimento neutro.
  function enhanceLut(d, alphaAt) {
    const hist = new Uint32Array(256);
    let fgN = 0;
    const bgSum = [0, 0, 0];
    let bgN = 0;
    for (let p = 0; p < d.length; p += 16) {
      const a = alphaAt(p);
      if (a > 128) {
        hist[Math.round(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2])]++;
        fgN++;
      } else if (a < 20) {
        bgSum[0] += LIN[d[p]]; bgSum[1] += LIN[d[p + 1]]; bgSum[2] += LIN[d[p + 2]];
        bgN++;
      }
    }
    if (!fgN) return null;

    let acc = 0, p99 = 255;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= fgN * 0.99) { p99 = v; break; }
    }
    const gain = Math.min(1.25, Math.max(1, 240 / Math.max(1, p99)));

    let wb = [1, 1, 1];
    if (bgN > 50) {
      const m = bgSum.map((s) => s / bgN);
      const gray = (m[0] + m[1] + m[2]) / 3;
      const toS = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255;
      const bgRgb = m.map(toS);
      const lab = toLab(new Uint8ClampedArray([...bgRgb, 255]), 1);
      const chroma = Math.hypot(lab.A[0], lab.B[0]);
      if (lab.L[0] > 45 && chroma > 3 && chroma < 22) {
        wb = m.map((v) => Math.min(1.2, Math.max(0.85, 1 + ((gray / Math.max(1e-4, v)) - 1) * 0.75)));
      }
    }

    // LUT per canale: correzione in luce lineare, poi ritorno a sRGB
    return [0, 1, 2].map((ch) => {
      const lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) {
        const lin = Math.min(1, LIN[v] * wb[ch]);
        const s = lin <= 0.0031308 ? 12.92 * lin : 1.055 * lin ** (1 / 2.4) - 0.055;
        lut[v] = Math.round(Math.min(255, s * 255 * gain));
      }
      return lut;
    });
  }

  // ---------- composizione del capo scontornato ----------
  // Applica maschera e ritocco, ritaglia al capo e restituisce l'immagine
  // finale da usare in armadio e nel collage.
  async function compose(src, maskSrc, { enhance = true } = {}) {
    const img = await loadImage(src);
    const c = drawScaled(img, STORE_MAX);
    const ctx = ctxOf(c);
    let mask = null;
    if (maskSrc) {
      mask = makeCanvas(c.width, c.height);
      ctxOf(mask).drawImage(maskSrc instanceof HTMLCanvasElement ? maskSrc : await loadImage(maskSrc), 0, 0, c.width, c.height);
    }

    const data = ctx.getImageData(0, 0, c.width, c.height);
    const d = data.data;
    const md = mask ? ctxOf(mask).getImageData(0, 0, c.width, c.height).data : null;
    if (enhance) {
      const lut = enhanceLut(d, (p) => (md ? md[p + 3] : 255));
      if (lut) {
        for (let p = 0; p < d.length; p += 4) {
          d[p] = lut[0][d[p]]; d[p + 1] = lut[1][d[p + 1]]; d[p + 2] = lut[2][d[p + 2]];
        }
      }
    }
    if (md) for (let p = 3; p < d.length; p += 4) d[p] = Math.min(d[p], md[p]);
    ctx.putImageData(data, 0, 0);
    if (!md) return { canvas: c, dataUrl: encodeAlpha(c) };

    // ritaglio al riquadro del capo
    let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] < 12) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return null;
    const pad = 2;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(c.width - 1, maxX + pad); maxY = Math.min(c.height - 1, maxY + pad);
    const cw = maxX - minX + 1, chh = maxY - minY + 1;
    const s = Math.min(1, CUTOUT_MAX / Math.max(cw, chh));
    const out = makeCanvas(cw * s, chh * s);
    const octx = ctxOf(out);
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(c, minX, minY, cw, chh, 0, 0, out.width, out.height);
    return { canvas: out, dataUrl: encodeAlpha(out) };
  }

  return {
    STORE_MAX, makeCanvas, ctxOf, loadImage, drawScaled, fromFile, toLab,
    autoMask, wandRegion, compose, encodeAlpha,
  };
})();
