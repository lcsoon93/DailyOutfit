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

  // ---------- colore ----------
  const { LIN, toLab } = Segment;

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
  // Il calcolo vero (Segment.segment) gira in un Web Worker per non bloccare
  // l'interfaccia; se il worker non è disponibile gira nella pagina.
  let worker = null;
  let workerOk = typeof Worker !== 'undefined';
  let seq = 0;
  const pending = new Map();

  function segmentHere(job) {
    try {
      job.resolve(job.box ? Segment.segmentBox(job.data, job.w, job.h) : Segment.segment(job.data, job.w, job.h));
    } catch (err) {
      job.reject(err);
    }
  }

  function startWorker() {
    worker = new Worker('js/segment-worker.js');
    worker.onmessage = (e) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      pending.delete(e.data.id);
      if (e.data.error) segmentHere(job); // riprova nella pagina
      else job.resolve(e.data.result);
    };
    worker.onerror = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      workerOk = false;
      try { worker.terminate(); } catch { /* già chiuso */ }
      worker = null;
      const jobs = [...pending.values()];
      pending.clear();
      jobs.forEach(segmentHere);
    };
  }

  function runSegment(data, w, h, box = false) {
    return new Promise((resolve, reject) => {
      const job = { data, w, h, box, resolve, reject };
      if (workerOk) {
        try {
          if (!worker) startWorker();
          const id = ++seq;
          pending.set(id, job);
          worker.postMessage({ id, data, w, h, box });
          return;
        } catch {
          workerOk = false;
        }
      }
      // nella pagina: lascia prima disegnare l'indicatore di attesa
      setTimeout(() => segmentHere(job), 30);
    });
  }

  // Restituisce { mask, confidence } con una maschera (alfa = capo) della
  // dimensione della foto salvata, oppure null se lo sfondo non si distingue
  // dal capo. Con rect ({ x, y, w, h } in pixel della foto salvata) cerca il
  // capo solo dentro il riquadro: tutto quello che sta fuori è sfondo.
  async function autoMask(src, rect = null) {
    const img = await loadImage(src);
    const full = drawScaled(img, STORE_MAX);
    if (!rect && transparentShare(full) > 0.03) return { mask: alphaMask(full), confidence: 1 };

    let area = full;
    if (rect) {
      area = makeCanvas(rect.w, rect.h);
      ctxOf(area).drawImage(full, rect.x, rect.y, rect.w, rect.h, 0, 0, area.width, area.height);
    }
    const work = drawScaled(area, WORK_MAX);
    const w = work.width, h = work.height;
    const data = ctxOf(work).getImageData(0, 0, w, h).data;
    let res = null;
    if (rect) {
      // nel riquadro: prima il metodo per sfondi a fantasia, poi quello classico
      res = await runSegment(data, w, h, true);
      if (!res || res.confidence < 0.2) {
        const alt = await runSegment(data, w, h);
        if (alt && (!res || alt.confidence > res.confidence)) res = alt;
      }
    } else {
      res = await runSegment(data, w, h);
      // sfondo difficile (fantasia, colori simili al capo): seconda prova
      // con i colori del centro della foto contro quelli dei bordi. Il
      // risultato va comunque controllato, quindi l'affidabilità resta bassa.
      if (!res || res.confidence < 0.35) {
        const alt = await runSegment(data, w, h, true);
        if (alt && alt.confidence >= 0.5) res = { fg: alt.fg, confidence: 0.34 };
      }
    }
    if (!res) return null;
    const part = maskToCanvas(res.fg, w, h, area.width, area.height);
    if (!rect) return { mask: part, confidence: res.confidence, share: share(res.fg) };
    const mask = makeCanvas(full.width, full.height);
    ctxOf(mask).drawImage(part, rect.x, rect.y);
    return { mask, confidence: res.confidence, share: share(res.fg) };
  }

  function share(fg) {
    let k = 0;
    for (let i = 0; i < fg.length; i++) k += fg[i];
    return k / fg.length;
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
    autoMask, wandRegion: Segment.wandRegion, compose, encodeAlpha,
  };
})();
