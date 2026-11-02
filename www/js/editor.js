// Editor dello scontorno: si corregge a mano con il riquadro (si inquadra il
// capo e il resto della foto sparisce), la bacchetta (tocca lo sfondo e
// sparisce tutta l'area di colore simile), la gomma e il pennello
// "ripristina". Si zooma pizzicando e ci si sposta trascinando.
const CutoutEditor = (() => {
  const $ = UI.$;
  const dlg = $('#editor');
  const stage = $('#editor-stage');
  const view = $('#editor-canvas');
  const vctx = view.getContext('2d');
  const slider = $('#editor-slider');
  const sliderLabel = $('#editor-slider-label');
  const hint = $('#editor-hint');
  const sliderRow = $('#editor-slider-row');

  const HINTS = {
    box: 'Trascina un riquadro intorno al capo: tutto quello che sta fuori sparisce. Due dita per spostarti.',
    wand: 'Tocca lo sfondo per toglierlo. Trascina per spostarti, pizzica per ingrandire.',
    erase: 'Passa il dito sulle parti da togliere. Due dita per spostarti.',
    restore: 'Passa il dito sulle parti del capo da rimettere. Due dita per spostarti.',
  };
  const settings = { tool: 'wand', brush: 36, tol: 12 };
  const HISTORY = 12;
  let st = null;
  let pattern = null;

  function checker() {
    if (pattern) return pattern;
    const c = Imaging.makeCanvas(16, 16);
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 16, 16);
    x.fillStyle = '#e8e3dc';
    x.fillRect(0, 0, 8, 8);
    x.fillRect(8, 8, 8, 8);
    pattern = vctx.createPattern(c, 'repeat');
    return pattern;
  }

  // ---------- stato e disegno ----------
  function refreshFg() {
    const c = st.fg.getContext('2d');
    c.globalCompositeOperation = 'copy';
    c.drawImage(st.img, 0, 0);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(st.mask, 0, 0);
    c.globalCompositeOperation = 'source-over';
  }

  let frame = 0;
  function redraw({ fg = false } = {}) {
    if (fg) st.dirtyFg = true;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!st) return;
      if (st.dirtyFg) { refreshFg(); st.dirtyFg = false; }
      const { dpr } = st;
      vctx.setTransform(1, 0, 0, 1, 0, 0);
      vctx.fillStyle = checker();
      vctx.fillRect(0, 0, view.width, view.height);
      vctx.setTransform(dpr * st.s, 0, 0, dpr * st.s, dpr * st.tx, dpr * st.ty);
      vctx.imageSmoothingQuality = 'high';
      vctx.globalAlpha = 0.32;
      vctx.drawImage(st.ghost, 0, 0); // le parti tolte restano visibili, sbiadite e colorate
      vctx.globalAlpha = 1;
      vctx.drawImage(st.fg, 0, 0);
      if (st.box) drawBox(st.box);
      if (st.cursor && (settings.tool === 'erase' || settings.tool === 'restore')) {
        vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        vctx.beginPath();
        vctx.arc(st.cursor.sx, st.cursor.sy, settings.brush / 2, 0, Math.PI * 2);
        vctx.lineWidth = 3;
        vctx.strokeStyle = 'rgba(0,0,0,.45)';
        vctx.stroke();
        vctx.lineWidth = 1.5;
        vctx.strokeStyle = '#fff';
        vctx.stroke();
      }
    });
  }

  // riquadro in corso: fuori è scurito, il bordo è tratteggiato
  function drawBox(r) {
    const { dpr } = st;
    const x = st.tx + r.x * st.s, y = st.ty + r.y * st.s, w = r.w * st.s, h = r.h * st.s;
    vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    vctx.beginPath();
    vctx.rect(0, 0, st.vw, st.vh);
    vctx.rect(x, y, w, h);
    vctx.fillStyle = 'rgba(20, 17, 15, .55)';
    vctx.fill('evenodd');
    vctx.setLineDash([8, 6]);
    vctx.lineWidth = 2;
    vctx.strokeStyle = '#fff';
    vctx.strokeRect(x, y, w, h);
    vctx.setLineDash([]);
  }

  function resizeView() {
    const r = stage.getBoundingClientRect();
    st.dpr = window.devicePixelRatio || 1;
    st.vw = r.width;
    st.vh = r.height;
    view.width = Math.round(r.width * st.dpr);
    view.height = Math.round(r.height * st.dpr);
    view.style.width = `${r.width}px`;
    view.style.height = `${r.height}px`;
  }

  function fit() {
    const s = Math.min(st.vw / st.img.width, st.vh / st.img.height) * 0.92;
    st.fitS = s;
    st.s = s;
    st.tx = (st.vw - st.img.width * s) / 2;
    st.ty = (st.vh - st.img.height * s) / 2;
    redraw();
  }

  function zoomAt(sx, sy, factor) {
    const s = Math.min(st.fitS * 8, Math.max(st.fitS * 0.8, st.s * factor));
    const ix = (sx - st.tx) / st.s, iy = (sy - st.ty) / st.s;
    st.s = s;
    st.tx = sx - ix * s;
    st.ty = sy - iy * s;
    redraw();
  }

  // ---------- cronologia (solo il canale alfa, per non sprecare memoria) ----------
  function snapshot() {
    const d = Imaging.ctxOf(st.mask).getImageData(0, 0, st.mask.width, st.mask.height).data;
    const a = new Uint8Array(d.length / 4);
    for (let i = 0, p = 3; i < a.length; i++, p += 4) a[i] = d[p];
    return a;
  }
  function restoreAlpha(a) {
    const ctx = Imaging.ctxOf(st.mask);
    const data = ctx.createImageData(st.mask.width, st.mask.height);
    const d = data.data;
    for (let i = 0, p = 0; i < a.length; i++, p += 4) {
      d[p] = d[p + 1] = d[p + 2] = 255;
      d[p + 3] = a[i];
    }
    ctx.putImageData(data, 0, 0);
    redraw({ fg: true });
  }
  function pushHistory() {
    st.history.push(snapshot());
    if (st.history.length > HISTORY) st.history.shift();
    st.changed = true;
    updateUndo();
  }
  function undo() {
    const a = st.history.pop();
    if (a) restoreAlpha(a);
    updateUndo();
  }
  function updateUndo() {
    $('[data-editor="undo"]').disabled = !st.history.length;
  }

  // ---------- strumenti ----------
  function setTool(tool) {
    settings.tool = tool;
    dlg.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
    sliderRow.classList.toggle('off', tool === 'box');
    if (tool === 'wand') {
      sliderLabel.textContent = 'Tolleranza colore';
      slider.min = 4; slider.max = 40; slider.value = settings.tol;
    } else if (tool !== 'box') {
      sliderLabel.textContent = 'Dimensione pennello';
      slider.min = 8; slider.max = 90; slider.value = settings.brush;
    }
    hint.textContent = HINTS[tool];
    redraw();
  }

  function paint(a, b) {
    const ctx = Imaging.ctxOf(st.mask);
    ctx.save();
    ctx.globalCompositeOperation = settings.tool === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ctx.fillStyle = '#fff';
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = settings.brush / st.s;
    ctx.beginPath();
    if (a.x === b.x && a.y === b.y) {
      ctx.arc(a.x, a.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
    redraw({ fg: true });
  }

  function wand(p) {
    const w = st.img.width, h = st.img.height;
    const x = Math.round(p.x), y = Math.round(p.y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const ctx = Imaging.ctxOf(st.mask);
    const data = ctx.getImageData(0, 0, w, h);
    if (data.data[(y * w + x) * 4 + 3] < 128) {
      UI.toast('Questa zona è già tolta. Per rimetterla usa «Ripristina».');
      return;
    }
    if (!st.lab) st.lab = Imaging.toLab(Imaging.ctxOf(st.img).getImageData(0, 0, w, h).data, w * h);
    const sel = Imaging.wandRegion(st.lab, w, h, x, y, settings.tol);
    let count = 0;
    for (let i = 0; i < sel.length; i++) count += sel[i];
    if (count > sel.length * 0.9) {
      UI.toast('Così toglierei quasi tutta la foto: abbassa la tolleranza e riprova.');
      return;
    }
    pushHistory();
    const d = data.data;
    for (let i = 0; i < sel.length; i++) if (sel[i]) d[i * 4 + 3] = 0;
    ctx.putImageData(data, 0, 0);
    redraw({ fg: true });
  }

  function boxFrom(a, b) {
    const w = st.img.width, h = st.img.height;
    const cl = (v, max) => Math.max(0, Math.min(max, v));
    const x0 = cl(Math.min(a.x, b.x), w), x1 = cl(Math.max(a.x, b.x), w);
    const y0 = cl(Math.min(a.y, b.y), h), y1 = cl(Math.max(a.y, b.y), h);
    return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
  }

  // Cerca il capo solo dentro il riquadro; se non trova un contorno chiaro
  // tiene il riquadro intero (meglio un ritaglio pulito della foto intera).
  async function applyBox(r) {
    const w = st.img.width, h = st.img.height;
    if (r.w < w * 0.08 || r.h < h * 0.08) {
      UI.toast('Riquadro troppo piccolo: trascina il dito intorno a tutto il capo.');
      return;
    }
    UI.busy(true, 'Cerco il capo nel riquadro…');
    let res = null;
    try {
      res = await Imaging.autoMask(st.src, r);
    } catch {
      res = null;
    } finally {
      UI.busy(false);
    }
    if (!st) return;
    // un contorno che copre poco del riquadro (o quasi tutto) non è il capo
    const good = res && res.confidence >= 0.12 && res.share >= 0.2 && res.share <= 0.97;
    pushHistory();
    const ctx = Imaging.ctxOf(st.mask);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    if (good) {
      ctx.drawImage(res.mask, 0, 0);
    } else {
      ctx.fillStyle = '#fff';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();
    redraw({ fg: true });
    UI.toast(good
      ? 'Ho tolto lo sfondo nel riquadro. Ritocca con gomma o bacchetta se serve.'
      : 'Ho tenuto solo il riquadro. Se vuoi, rifinisci i bordi con la gomma.');
  }

  async function auto() {
    UI.busy(true, 'Cerco lo sfondo…');
    try {
      const res = await Imaging.autoMask(st.src);
      if (!res) {
        UI.toast('Non riesco a distinguere lo sfondo: usa la bacchetta o la gomma.');
        return;
      }
      pushHistory();
      const ctx = Imaging.ctxOf(st.mask);
      ctx.clearRect(0, 0, st.mask.width, st.mask.height);
      ctx.drawImage(res.mask, 0, 0, st.mask.width, st.mask.height);
      redraw({ fg: true });
    } finally {
      UI.busy(false);
    }
  }

  function reset() {
    pushHistory();
    const ctx = Imaging.ctxOf(st.mask);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, st.mask.width, st.mask.height);
    redraw({ fg: true });
  }

  // ---------- tocchi: un dito disegna (o sposta, con la bacchetta), due dita zoomano ----------
  function local(e) {
    const r = view.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  }
  const toImage = ({ sx, sy }) => ({ x: (sx - st.tx) / st.s, y: (sy - st.ty) / st.s });

  view.addEventListener('pointerdown', (e) => {
    if (!st) return;
    view.setPointerCapture(e.pointerId);
    const p = local(e);
    st.pointers.set(e.pointerId, p);
    if (st.pointers.size === 2) {
      // inizia lo zoom: annulla il tratto appena iniziato
      if (st.stroke) {
        const a = st.history.pop();
        if (a) restoreAlpha(a);
        updateUndo();
        st.stroke = null;
      }
      st.box = null;
      st.boxStart = null;
      const [a, b] = [...st.pointers.values()];
      st.pinch = { d: Math.hypot(a.sx - b.sx, a.sy - b.sy), mx: (a.sx + b.sx) / 2, my: (a.sy + b.sy) / 2, s: st.s, tx: st.tx, ty: st.ty };
      st.gesture = true;
      return;
    }
    if (st.pointers.size > 2) return;
    st.down = { ...p, moved: false, tx: st.tx, ty: st.ty };
    if (settings.tool === 'box') {
      st.boxStart = toImage(p);
      st.box = null;
    } else if (settings.tool !== 'wand') {
      pushHistory();
      const ip = toImage(p);
      st.stroke = { last: ip };
      st.cursor = p;
      paint(ip, ip);
    }
  });

  view.addEventListener('pointermove', (e) => {
    if (!st) return;
    const p = local(e);
    if (e.pointerType === 'mouse' && !st.pointers.size) {
      st.cursor = p;
      redraw();
      return;
    }
    if (!st.pointers.has(e.pointerId)) return;
    st.pointers.set(e.pointerId, p);
    if (st.pinch && st.pointers.size >= 2) {
      const [a, b] = [...st.pointers.values()];
      const d = Math.hypot(a.sx - b.sx, a.sy - b.sy);
      const mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
      const s = Math.min(st.fitS * 8, Math.max(st.fitS * 0.8, st.pinch.s * (d / Math.max(1, st.pinch.d))));
      const ix = (st.pinch.mx - st.pinch.tx) / st.pinch.s, iy = (st.pinch.my - st.pinch.ty) / st.pinch.s;
      st.s = s;
      st.tx = mx - ix * s;
      st.ty = my - iy * s;
      redraw();
      return;
    }
    if (!st.down || st.gesture) return;
    if (Math.hypot(p.sx - st.down.sx, p.sy - st.down.sy) > 6) st.down.moved = true;
    if (st.boxStart) {
      if (st.down.moved) {
        st.box = boxFrom(st.boxStart, toImage(p));
        redraw();
      }
    } else if (st.stroke) {
      const ip = toImage(p);
      paint(st.stroke.last, ip);
      st.stroke.last = ip;
      st.cursor = p;
    } else if (settings.tool === 'wand' && st.down.moved) {
      st.tx = st.down.tx + (p.sx - st.down.sx);
      st.ty = st.down.ty + (p.sy - st.down.sy);
      redraw();
    }
  });

  function pointerEnd(e) {
    if (!st || !st.pointers.has(e.pointerId)) return;
    const p = st.pointers.get(e.pointerId);
    st.pointers.delete(e.pointerId);
    if (st.pointers.size < 2) st.pinch = null;
    if (st.pointers.size) return;
    if (settings.tool === 'wand' && st.down && !st.down.moved && !st.gesture && e.type === 'pointerup') wand(toImage(p));
    const box = st.box;
    st.box = null;
    st.boxStart = null;
    if (settings.tool === 'box' && e.type === 'pointerup' && !st.gesture) {
      if (box) applyBox(box);
      else UI.toast('Trascina il dito in diagonale per disegnare il riquadro intorno al capo.');
    }
    st.down = null;
    st.stroke = null;
    st.gesture = false;
    if (e.pointerType !== 'mouse') st.cursor = null;
    redraw();
  }
  view.addEventListener('pointerup', pointerEnd);
  view.addEventListener('pointercancel', pointerEnd);
  view.addEventListener('pointerleave', (e) => {
    if (st && e.pointerType === 'mouse' && !st.pointers.size) { st.cursor = null; redraw(); }
  });
  view.addEventListener('wheel', (e) => {
    if (!st) return;
    e.preventDefault();
    const p = local(e);
    zoomAt(p.sx, p.sy, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  slider.addEventListener('input', () => {
    if (settings.tool === 'wand') settings.tol = Number(slider.value);
    else settings.brush = Number(slider.value);
    if (settings.tool !== 'wand' && st) {
      st.cursor = { sx: st.vw / 2, sy: st.vh / 2 };
      redraw();
    }
  });
  slider.addEventListener('change', () => { if (st) { st.cursor = null; redraw(); } });

  window.addEventListener('resize', () => {
    if (!st) return;
    resizeView();
    fit();
  });

  dlg.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tool], [data-editor]');
    if (!t || !st) return;
    if (t.dataset.tool) setTool(t.dataset.tool);
    const action = t.dataset.editor;
    if (action === 'undo') undo();
    if (action === 'fit') fit();
    if (action === 'auto') auto();
    if (action === 'reset') reset();
    if (action === 'done') finish(true);
    if (action === 'cancel') cancel();
  });

  async function cancel() {
    if (st.changed && !(await UI.ask({ title: 'Uscire senza salvare?', message: 'Le modifiche allo scontorno andranno perse.', ok: 'Esci', danger: true }))) return;
    finish(false);
  }

  function finish(save) {
    const { resolve, mask } = st;
    let result = null;
    if (save) {
      // maschera tutta piena = nessuno scontorno
      const a = snapshot();
      let full = true;
      for (let i = 0; i < a.length; i += 7) if (a[i] < 250) { full = false; break; }
      result = { mask: full ? null : mask.toDataURL('image/png') };
    }
    st = null;
    UI.close(dlg);
    resolve(result);
  }

  // Apre l'editor sulla foto (e sulla maschera di partenza, se c'è).
  // tool: strumento iniziale (di solito «box» quando lo scontorno è fallito).
  // Restituisce { mask } (dataURL PNG o null = nessuno scontorno) oppure
  // null se l'utente annulla.
  async function open(src, maskSrc, { tool } = {}) {
    const im = await Imaging.loadImage(src);
    const img = Imaging.drawScaled(im, Imaging.STORE_MAX);
    const w = img.width, h = img.height;
    const mask = Imaging.makeCanvas(w, h);
    const mctx = Imaging.ctxOf(mask);
    if (maskSrc) {
      mctx.drawImage(typeof maskSrc === 'string' ? await Imaging.loadImage(maskSrc) : maskSrc, 0, 0, w, h);
    } else {
      mctx.fillStyle = '#fff';
      mctx.fillRect(0, 0, w, h);
    }
    const ghost = Imaging.makeCanvas(w, h);
    const gctx = ghost.getContext('2d');
    gctx.drawImage(img, 0, 0);
    gctx.globalCompositeOperation = 'source-atop';
    gctx.fillStyle = 'rgba(180, 83, 47, 0.45)';
    gctx.fillRect(0, 0, w, h);

    st = {
      src, img, mask, ghost, fg: Imaging.makeCanvas(w, h), lab: null,
      history: [], pointers: new Map(), changed: false, s: 1, tx: 0, ty: 0,
    };
    refreshFg();
    UI.open(dlg, { onBack: cancel });
    setTool(tool || (settings.tool === 'box' ? 'wand' : settings.tool));
    updateUndo();
    return new Promise((resolve) => {
      st.resolve = resolve;
      requestAnimationFrame(() => {
        if (!st) return;
        resizeView();
        fit();
      });
    });
  }

  return { open };
})();
