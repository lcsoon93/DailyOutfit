// Cuore dello scontorno automatico, senza intelligenza artificiale: solo
// calcoli sui pixel, senza DOM, così gira sia nella pagina sia in un Web
// Worker (js/segment-worker.js) e nei test di Node.
const Segment = (() => {
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

  // (Math.sqrt invece di Math.hypot: molto più veloce su milioni di pixel)
  const dE = (lab, i, j) => {
    const l = lab.L[i] - lab.L[j], a = lab.A[i] - lab.A[j], b = lab.B[i] - lab.B[j];
    return Math.sqrt(l * l + a * a + b * b);
  };
  const dEc = (lab, i, c) => {
    const l = lab.L[i] - c.l, a = lab.A[i] - c.a, b = lab.B[i] - c.b;
    return Math.sqrt(l * l + a * a + b * b);
  };

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

  // ---------- scontorno automatico ----------
  // Prova più ipotesi (quali toni del bordo sono sfondo, quanto essere
  // tolleranti) e tiene quella con il contorno migliore. Riceve i pixel RGBA
  // della foto rimpicciolita e restituisce { fg, confidence } (fg: 1 = capo)
  // oppure null se lo sfondo non si distingue dal capo.
  function segment(rgba, w, h) {
    const n = w * h;
    const lab = toLab(boxBlur(rgba, w, h), n);
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
    return { fg: best.fg, confidence };
  }

  // ---------- scontorno dentro un riquadro ----------
  // L'utente ha inquadrato il capo: i colori del bordo del riquadro sono
  // sfondo, quelli della zona centrale sono (soprattutto) capo. Si stimano
  // i due gruppi di colori, si assegna ogni pixel al più vicino e si
  // ripete raffinando i gruppi (come GrabCut, senza grafi). Funziona anche
  // su sfondi a fantasia, dove la crescita dai bordi non basta.
  function kmeans(lab, idx, k, iters = 6) {
    if (!idx.length) return [];
    const centers = [];
    const first = idx[idx.length >> 1];
    centers.push({ l: lab.L[first], a: lab.A[first], b: lab.B[first] });
    while (centers.length < k) {
      let far = -1, farD = 0;
      for (let s = 0; s < idx.length; s += 5) {
        let d = Infinity;
        for (const c of centers) d = Math.min(d, dEc(lab, idx[s], c));
        if (d > farD) { farD = d; far = idx[s]; }
      }
      if (farD < 6) break;
      centers.push({ l: lab.L[far], a: lab.A[far], b: lab.B[far] });
    }
    const n = centers.map(() => 0);
    for (let it = 0; it < iters; it++) {
      const sum = centers.map(() => ({ l: 0, a: 0, b: 0, n: 0 }));
      for (const i of idx) {
        let best = 0, bd = Infinity;
        for (let c = 0; c < centers.length; c++) {
          const d = dEc(lab, i, centers[c]);
          if (d < bd) { bd = d; best = c; }
        }
        const t = sum[best];
        t.l += lab.L[i]; t.a += lab.A[i]; t.b += lab.B[i]; t.n++;
      }
      sum.forEach((t, c) => { if (t.n) centers[c] = { l: t.l / t.n, a: t.a / t.n, b: t.b / t.n }; n[c] = t.n; });
    }
    return centers.map((c, i) => ({ ...c, w: n[i] / idx.length })).filter((c) => c.w > 0.01);
  }

  function nearestD(lab, i, centers) {
    let d = Infinity;
    for (const c of centers) d = Math.min(d, dEc(lab, i, c));
    return d;
  }

  function blurF(v, w, h, r) {
    const tmp = new Float32Array(v.length), out = new Float32Array(v.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, k = 0;
        for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) { s += v[y * w + xx]; k++; } }
        tmp[y * w + x] = s / k;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, k = 0;
        for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; k++; } }
        out[y * w + x] = s / k;
      }
    }
    return out;
  }

  // riempie i buchi chiusi piccoli (fiori dello sfondo rimasti dentro
  // il capo vengono invece tolti dall'apertura): tiene il collo e i
  // manici, che toccano lo sfondo esterno
  function fillHoles(fg, w, h, maxShare) {
    const n = w * h;
    const seen = new Uint8Array(n);
    const queue = new Int32Array(n);
    const out = fg.slice();
    for (let s = 0; s < n; s++) {
      if (fg[s] || seen[s]) continue;
      let head = 0, tail = 0, edge = false;
      queue[tail++] = s;
      seen[s] = 1;
      while (head < tail) {
        const i = queue[head++];
        const x = i % w;
        if (x === 0 || x === w - 1 || i < w || i >= n - w) edge = true;
        if (x > 0 && !fg[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; queue[tail++] = i - 1; }
        if (x < w - 1 && !fg[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; queue[tail++] = i + 1; }
        if (i >= w && !fg[i - w] && !seen[i - w]) { seen[i - w] = 1; queue[tail++] = i - w; }
        if (i < n - w && !fg[i + w] && !seen[i + w]) { seen[i + w] = 1; queue[tail++] = i + w; }
      }
      if (!edge && tail <= n * maxShare) for (let k = 0; k < tail; k++) out[queue[k]] = 1;
    }
    return out;
  }

  function segmentBox(rgba, w, h) {
    const n = w * h;
    const lab = toLab(boxBlur(rgba, w, h), n);
    const grad = gradient(lab, w, h);
    const band = Math.max(2, Math.round(Math.min(w, h) * 0.03));
    const bgIdx = [], fgIdx = [];
    const cx = w / 2, cy = h / 2;
    for (let y = 0; y < h; y += 2) {
      for (let x = (y >> 1) % 2; x < w; x += 2) {
        const i = y * w + x;
        if (x < band || y < band || x >= w - band || y >= h - band) bgIdx.push(i);
        else if (((x - cx) / (w * 0.3)) ** 2 + ((y - cy) / (h * 0.3)) ** 2 <= 1) fgIdx.push(i);
      }
    }
    let bgC = kmeans(lab, bgIdx, 8);
    let fgC = kmeans(lab, fgIdx, 5);
    // un colore del centro che è anche un colore importante del bordo è
    // sfondo (il muro bianco ai lati di un vestito stretto); resta capo se al
    // centro domina (un maglione blu su una tovaglia con qualche fiore blu)
    fgC = fgC.filter((c) => !bgC.some((b) => Math.sqrt((b.l - c.l) ** 2 + (b.a - c.a) ** 2 + (b.b - c.b) ** 2) < 12 && b.w >= c.w * 0.5));
    if (!fgC.length) return null;

    let fg = new Uint8Array(n);
    const ratio = new Float32Array(n);
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < n; i++) {
        const df = nearestD(lab, i, fgC), db = nearestD(lab, i, bgC);
        ratio[i] = Math.max(-1, Math.min(1, (db - df) / (db + df + 1)));
      }
      // vicinanza al centro: a parità di colore, il centro è capo
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const r = Math.hypot((x - cx) / (w / 2), (y - cy) / (h / 2));
          ratio[y * w + x] += 0.08 * (0.7 - r);
        }
      }
      const sm = blurF(ratio, w, h, Math.max(1, Math.round(Math.min(w, h) / 120)));
      for (let i = 0; i < n; i++) fg[i] = sm[i] > 0 ? 1 : 0;
      for (let x = 0; x < w; x++) { fg[x] = 0; fg[(h - 1) * w + x] = 0; }
      for (let y = 0; y < h; y++) { fg[y * w] = 0; fg[y * w + w - 1] = 0; }
      if (iter < 2) {
        const fi = [], bi = [];
        for (let i = 0; i < n; i += 3) (fg[i] ? fi : bi).push(i);
        const nf = kmeans(lab, fi, 5, 3), nb = kmeans(lab, bi, 8, 3);
        if (nf.length) fgC = nf;
        if (nb.length) bgC = nb;
      }
    }
    // apertura più decisa (via i fiori dello stesso colore del capo), poi pulizia
    for (let k = 0; k < 2; k++) fg = morph(fg, w, h, true);
    for (let k = 0; k < 2; k++) fg = morph(fg, w, h, false);
    const info = {};
    fg = keepLargeParts(fg, w, h, info);
    fg = fillHoles(fg, w, h, 0.02);

    let area = 0, perim = 0, edge = 0;
    for (let i = 0; i < n; i++) {
      if (!fg[i]) continue;
      area++;
      const x = i % w;
      if ((x > 0 && !fg[i - 1]) || (x < w - 1 && !fg[i + 1]) || (i >= w && !fg[i - w]) || (i < n - w && !fg[i + w])) {
        perim++;
        edge += grad[i];
      }
    }
    const share = area / n;
    if (share < 0.12 || share > 0.97 || !perim) return null;
    // affidabilità: separazione netta tra i due modelli di colore lungo il capo
    let sep = 0, k = 0;
    for (let i = 0; i < n; i += 7) { sep += Math.abs(ratio[i]); k++; }
    const roundness = (perim * perim) / (4 * Math.PI * area);
    let confidence = Math.max(0, Math.min(1, (sep / k - 0.15) * 2.5));
    if (info.parts > 3 || roundness > 12) confidence *= 0.4;
    return { fg, confidence };
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

  return { LIN, toLab, segment, segmentBox, wandRegion };
})();
