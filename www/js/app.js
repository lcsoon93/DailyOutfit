// Interfaccia dell'app: benvenuto, schermate, armadio, generazione degli
// outfit, preferiti, profilo e backup.
(() => {
  const { $, el } = UI;
  const SINGULAR = { top: 'Maglia', bottom: 'Pantaloni', onepiece: 'Vestito', layer: 'Maglione', outerwear: 'Giacca', shoes: 'Scarpe', accessory: 'Accessorio' };

  const validProfile = (p) => Boolean(p && p.sex && Number(p.age) >= 3);
  const state = {
    items: [],
    favorites: [],
    profile: Store.get('profile', null),
    occasion: Store.get('lastOccasion', 'school'),
    weather: Store.get('lastWeather', 'mild'),
    filter: 'all',
    tab: 'today',
    current: null,
    queue: [],
    processing: false,
  };
  if (!validProfile(state.profile)) state.profile = null;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const displayName = (item) => item.name || SINGULAR[item.category] || 'Capo';
  const pictureOf = (item) => (item.cutout && !item.noCutout ? item.cutout : item.image);
  const hasCutout = (item) => Boolean(item.cutout && !item.noCutout);
  const needsReview = (item) => !item.demo && !item.noCutout && !item.reviewed &&
    (!item.cutout || (item.cutoutConfidence != null && item.cutoutConfidence < 0.35));

  // la chiave API dell'AI delle versioni precedenti non serve più: via dal telefono
  try { localStorage.removeItem('dailyoutfit.ai'); } catch { /* storage non disponibile */ }

  // ---------- navigazione ----------
  function show(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${tab}`));
    $('#fab-add').classList.toggle('hidden', tab !== 'wardrobe' || !state.items.length);
    if (tab === 'today') renderToday();
    if (tab === 'wardrobe') renderWardrobe();
    if (tab === 'favorites') renderFavorites();
    if (tab === 'profile') renderProfile();
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) {
      e.preventDefault();
      show(go.dataset.go);
      return;
    }
    const act = e.target.closest('[data-action]');
    if (!act) return;
    if (act.dataset.action === 'add') openAddSheet();
    if (act.dataset.action === 'demo') loadDemo();
  });

  function segmented(container, options, value, onPick) {
    container.replaceChildren(...options.map((o) => el('button', {
      type: 'button', role: 'radio', 'aria-checked': String(o.id === value),
      html: (o.icon ? Icons.svg(o.icon, 20) : '') + `<span>${o.label}</span>`,
      onclick: () => onPick(o.id),
    })));
  }

  // ---------- oggi ----------
  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
  }

  function renderToday() {
    $('#greeting').textContent = greeting();
    const occs = Generator.occasionsFor(state.profile || {});
    if (!occs.some((o) => o.id === state.occasion)) state.occasion = occs[0].id;
    $('#occasion-grid').replaceChildren(...occs.map((o) => el('button', {
      type: 'button', class: 'occasion', role: 'radio', 'aria-checked': String(o.id === state.occasion),
      html: Icons.svg(o.icon, 26) + `<span>${o.label}</span>`,
      onclick: () => {
        state.occasion = o.id;
        Store.set('lastOccasion', o.id);
        renderToday();
      },
    })));
    segmented($('#weather-seg'), WEATHER, state.weather, (id) => {
      state.weather = id;
      Store.set('lastWeather', id);
      renderToday();
    });
    const enough = state.items.length >= 2;
    $('#btn-generate').disabled = !enough;
    $('#generate-hint').innerHTML = enough ? ''
      : 'Per iniziare aggiungi qualche capo all\'<a href="#" data-go="wardrobe">armadio</a> o prova i <a href="#" data-action="demo">capi di esempio</a>.';
  }

  const meta = (occasionId, weatherId) => ({
    title: labelOf(OCCASIONS, occasionId),
    subtitle: labelOf(WEATHER, weatherId),
  });

  async function generate() {
    const recentIds = Store.get('recent', []);
    const res = Generator.generate(state.items, {
      occasionId: state.occasion, weatherId: state.weather, profile: state.profile || {}, recentIds,
    });
    if (res.error) {
      state.current = null;
      $('#result').classList.add('hidden');
      $('#result-error-text').textContent = res.error;
      $('#result-error').classList.remove('hidden');
      return;
    }
    const first = $('#result').classList.contains('hidden');
    state.current = { ...res, savedId: null };
    Store.set('recent', [...res.items.map((i) => i.id), ...recentIds].slice(0, 12));
    $('#result-error').classList.add('hidden');
    $('#result').classList.remove('hidden');
    await renderResult();
    if (first) $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function renderResult() {
    const c = state.current;
    if (!c) return;
    await Render.collage(c.items, $('#collage'), meta(c.occasion.id, c.weather.id));
    $('#result-items').replaceChildren(...c.items.map((item) => el('button', {
      type: 'button', class: 'strip-item', onclick: () => openItem(item),
    }, [el('img', { src: pictureOf(item), alt: '' }), el('span', { text: displayName(item) })])));
    $('#result-tips').replaceChildren(...c.notes.filter(Boolean).map((n) => el('li', { html: Icons.svg('bulb', 20) }, [el('span', { text: n })])));
    updateSaveButton();
  }

  function updateSaveButton() {
    const saved = Boolean(state.current && state.current.savedId);
    const b = $('#btn-save');
    b.setAttribute('aria-pressed', String(saved));
    b.querySelector('span').textContent = saved ? 'Salvato' : 'Salva';
  }

  function thumbOf(canvas) {
    const t = Imaging.makeCanvas(432, 540);
    const ctx = t.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, t.width, t.height);
    return Imaging.encodeAlpha(t, 0.85);
  }

  async function saveCurrent() {
    const c = state.current;
    if (!c) return;
    if (c.savedId) {
      show('favorites');
      return;
    }
    const fav = {
      id: uid(), occasion: c.occasion.id, weather: c.weather.id,
      itemIds: c.items.map((i) => i.id), savedAt: Date.now(), thumb: thumbOf($('#collage')),
    };
    await DB.put('favorites', fav);
    state.favorites.push(fav);
    c.savedId = fav.id;
    updateSaveButton();
    UI.toast('Outfit salvato nei preferiti');
  }

  async function shareCanvas(canvas, name) {
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      await Native.shareFile(blob, name, 'Il mio outfit');
    } catch (err) {
      console.error(err);
      UI.toast('Condivisione non riuscita');
    }
  }

  $('#btn-generate').addEventListener('click', generate);
  $('#btn-another').addEventListener('click', generate);
  $('#btn-save').addEventListener('click', saveCurrent);
  $('#btn-share').addEventListener('click', () => {
    if (state.current) shareCanvas($('#collage'), `outfit-${state.current.occasion.id}.png`);
  });

  // ---------- armadio ----------
  function renderWardrobe() {
    const counts = {};
    for (const i of state.items) counts[i.category] = (counts[i.category] || 0) + 1;
    if (state.filter !== 'all' && !counts[state.filter]) state.filter = 'all';
    $('#wardrobe-count').textContent = state.items.length ? `${state.items.length} ${state.items.length === 1 ? 'capo' : 'capi'}` : '';

    const filters = [{ id: 'all', short: 'Tutti' }, ...CATEGORIES.filter((c) => counts[c.id])];
    $('#category-filter').replaceChildren(...filters.map((c) => el('button', {
      type: 'button', class: 'chip', role: 'tab', 'aria-selected': String(state.filter === c.id),
      html: (c.icon ? Icons.svg(c.icon, 18) : '') + `<span>${c.short}</span>` + (c.id === 'all' ? '' : ` <small>${counts[c.id]}</small>`),
      onclick: () => { state.filter = c.id; renderWardrobe(); },
    })));
    $('#category-filter').classList.toggle('hidden', state.items.length < 2);

    const list = state.items
      .filter((i) => state.filter === 'all' || i.category === state.filter)
      .sort((a, b) => b.createdAt - a.createdAt);
    $('#item-grid').replaceChildren(...list.map((item) => el('button', {
      type: 'button', class: 'item-card', onclick: () => openItem(item), 'aria-label': displayName(item),
    }, [
      el('div', { class: 'thumb' }, [el('img', { src: pictureOf(item), alt: '', loading: 'lazy', class: hasCutout(item) ? '' : 'photo' })]),
      needsReview(item) ? el('span', { class: 'flag', title: 'Scontorno da controllare', html: Icons.svg('alert', 16) }) : null,
      el('div', { class: 'meta' }, [el('span', { class: 'dot', style: `background:${item.color}` }), el('span', { class: 'name', text: displayName(item) })]),
    ])));
    const empty = !state.items.length;
    $('#wardrobe-empty').classList.toggle('hidden', !empty);
    $('#demo-banner').classList.toggle('hidden', !state.items.some((i) => i.demo));
    $('#fab-add').classList.toggle('hidden', state.tab !== 'wardrobe' || empty);
  }

  function openAddSheet() {
    UI.open($('#add-sheet'));
  }

  for (const id of ['#input-camera', '#input-gallery']) {
    $(id).addEventListener('change', (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      UI.close($('#add-sheet'));
      if (state.tab !== 'wardrobe') show('wardrobe');
      if (files.length) processFiles(files);
    });
  }

  // Le foto vengono preparate una alla volta: scontorno automatico, ritocco,
  // colore; poi l'utente controlla la scheda e salva.
  async function processFiles(files) {
    state.queue.push(...files);
    if (state.processing) return;
    state.processing = true;
    try {
      while (state.queue.length) {
        const file = state.queue.shift();
        let item;
        UI.busy(true, 'Preparo il capo…');
        try {
          item = await prepareItem(file);
        } catch (err) {
          console.error(err);
          UI.toast('Non riesco a leggere questa foto. Prova con un\'altra immagine.');
          continue;
        } finally {
          UI.busy(false);
        }
        await openItem(item, { isNew: true });
      }
    } finally {
      state.processing = false;
    }
  }

  async function prepareItem(file) {
    const photo = await Imaging.fromFile(file);
    const res = await Imaging.autoMask(photo.image);
    const cut = res ? await Imaging.compose(photo.image, res.mask, { enhance: !photo.transparent }) : null;
    const color = Colors.dominant(cut ? cut.canvas : await Imaging.loadImage(photo.image));
    return {
      id: uid(), name: '', category: Store.get('lastCategory', 'top'), styles: ['casual'],
      seasons: SEASONS.map((s) => s.id), color,
      image: photo.image, mask: res ? res.mask.toDataURL('image/png') : null, cutout: cut ? cut.dataUrl : null,
      enhance: !photo.transparent, cutoutConfidence: res ? res.confidence : 0, createdAt: Date.now(),
    };
  }

  // ---------- scheda capo ----------
  const itemDlg = $('#item-dialog');
  const itemForm = $('#item-form');
  let editing = null; // { item, draft, isNew, resolve }

  function chipToggle(container, options, isOn, onToggle, role = 'checkbox') {
    container.replaceChildren(...options.map((o) => el('button', {
      type: 'button', class: 'chip', role, 'aria-checked': String(isOn(o.id)),
      html: (o.icon ? Icons.svg(o.icon, 18) : '') + `<span>${o.label}</span>`,
      onclick: () => onToggle(o.id),
    })));
  }

  function renderItemForm() {
    const d = editing.draft;
    $('#item-title').textContent = editing.isNew ? 'Nuovo capo' : displayName(editing.item);
    const img = $('#item-preview-img');
    img.src = pictureOf(d);
    $('#item-preview').classList.toggle('photo', !hasCutout(d));

    const warn = $('#cutout-warning');
    const editBtn = itemDlg.querySelector('[data-item="edit-cutout"] span');
    if (!d.cutout && !d.noCutout) {
      warn.classList.remove('hidden');
      $('#cutout-warning-text').textContent = 'Non sono riuscito a separare il capo dallo sfondo (forse hanno colori simili). Puoi scontornarlo a mano o tenere la foto intera.';
      editBtn.textContent = 'Scontorna a mano';
    } else if (d.cutout && !d.reviewed && d.cutoutConfidence < 0.35 && !d.demo) {
      warn.classList.remove('hidden');
      $('#cutout-warning-text').textContent = 'Lo sfondo era simile al capo: controlla che lo scontorno sia giusto.';
      editBtn.textContent = 'Controlla scontorno';
    } else {
      warn.classList.add('hidden');
      editBtn.textContent = 'Modifica scontorno';
    }

    const view = $('#item-view');
    view.classList.toggle('hidden', !d.cutout);
    if (d.cutout) {
      segmented(view, [{ id: 'cut', label: 'Scontornata' }, { id: 'photo', label: 'Foto intera' }], d.noCutout ? 'photo' : 'cut', (id) => {
        d.noCutout = id === 'photo';
        renderItemForm();
      });
    }
    $('#item-enhance').checked = d.enhance !== false;
    $('#item-enhance').closest('.switch-row').classList.toggle('hidden', !d.mask || d.demo);

    if (document.activeElement !== $('#item-name')) $('#item-name').value = d.name || '';
    chipToggle($('#item-category'), CATEGORIES.map((c) => ({ id: c.id, label: c.short, icon: c.icon })), (id) => d.category === id, (id) => {
      d.category = id;
      renderItemForm();
    }, 'radio');
    chipToggle($('#item-styles'), STYLES, (id) => d.styles.includes(id), (id) => {
      d.styles = d.styles.includes(id) ? d.styles.filter((s) => s !== id) : [...d.styles, id];
      renderItemForm();
    });
    chipToggle($('#item-seasons'), SEASONS, (id) => d.seasons.includes(id), (id) => {
      d.seasons = d.seasons.includes(id) ? d.seasons.filter((s) => s !== id) : [...d.seasons, id];
      renderItemForm();
    });

    $('#item-color-name').textContent = `· ${Colors.nearest(d.color).name}`;
    const palette = Colors.PALETTE.map((p) => p.hex.toLowerCase());
    const swatches = [];
    if (!palette.includes(d.color.toLowerCase())) swatches.push({ hex: d.color, name: 'Rilevato dalla foto' });
    swatches.push(...Colors.PALETTE.map((p) => ({ hex: p.hex, name: p.name })));
    const custom = el('input', { type: 'color', value: d.color, 'aria-label': 'Altro colore' });
    custom.addEventListener('input', () => { d.color = custom.value; d.colorManual = true; renderItemForm(); });
    $('#item-colors').replaceChildren(
      ...swatches.map((s) => el('button', {
        type: 'button', class: 'swatch', role: 'radio', style: `background:${s.hex}`, title: s.name, 'aria-label': s.name,
        'aria-checked': String(s.hex.toLowerCase() === d.color.toLowerCase()),
        onclick: () => { d.color = s.hex; d.colorManual = true; renderItemForm(); },
      })),
      el('span', { class: 'swatch custom', title: 'Altro colore' }, [custom]),
    );
  }

  function openItem(item, { isNew = false } = {}) {
    return new Promise((resolve) => {
      editing = {
        item, isNew, resolve,
        draft: { ...item, styles: [...item.styles], seasons: [...item.seasons] },
      };
      const left = state.queue.length;
      $('#item-queue').textContent = isNew && left ? `Ancora ${left} ${left === 1 ? 'foto' : 'foto'} da preparare` : '';
      itemDlg.querySelector('[data-item="delete"]').setAttribute('aria-label', isNew ? 'Scarta' : 'Elimina');
      renderItemForm();
      UI.open(itemDlg, { onBack: closeItem });
      itemDlg.querySelector('.page-body').scrollTop = 0;
    });
  }

  function finishItem(saved) {
    const { resolve } = editing;
    editing = null;
    UI.close(itemDlg);
    resolve(saved);
  }

  async function closeItem() {
    if (!editing) return;
    if (editing.isNew && !(await UI.ask({ title: 'Scartare questo capo?', message: 'La foto non verrà aggiunta all\'armadio.', ok: 'Scarta', danger: true }))) return;
    finishItem(false);
  }

  $('#item-name').addEventListener('input', (e) => { if (editing) editing.draft.name = e.target.value; });

  $('#item-enhance').addEventListener('change', async (e) => {
    const d = editing && editing.draft;
    if (!d || !d.mask) return;
    d.enhance = e.target.checked;
    UI.busy(true, 'Aggiorno la foto…');
    try {
      const cut = await Imaging.compose(d.image, d.mask, { enhance: d.enhance });
      if (cut) d.cutout = cut.dataUrl;
    } finally {
      UI.busy(false);
    }
    renderItemForm();
  });

  itemDlg.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-item]');
    if (!b || !editing) return;
    const action = b.dataset.item;
    if (action === 'close') closeItem();
    if (action === 'delete') deleteItem();
    if (action === 'edit-cutout') editCutout();
  });

  async function editCutout() {
    const d = editing.draft;
    const res = await CutoutEditor.open(d.image, d.mask);
    if (!res || !editing) return;
    if (!res.mask) {
      Object.assign(d, { mask: null, cutout: null, noCutout: true, reviewed: true });
    } else {
      UI.busy(true, 'Applico lo scontorno…');
      let cut;
      try {
        cut = await Imaging.compose(d.image, res.mask, { enhance: d.enhance !== false });
      } finally {
        UI.busy(false);
      }
      if (!cut) {
        UI.toast('Hai tolto tutta la foto: lo scontorno non è stato applicato.');
        return;
      }
      Object.assign(d, { mask: res.mask, cutout: cut.dataUrl, noCutout: false, reviewed: true, cutoutConfidence: 1 });
      if (!d.colorManual) d.color = Colors.dominant(cut.canvas);
    }
    renderItemForm();
  }

  async function deleteItem() {
    const { item, isNew } = editing;
    if (isNew) {
      finishItem(false);
      return;
    }
    if (!(await UI.ask({ title: 'Eliminare questo capo?', message: 'Verrà tolto dall\'armadio e dagli outfit salvati.', ok: 'Elimina', danger: true }))) return;
    await DB.remove('items', item.id);
    state.items = state.items.filter((i) => i.id !== item.id);
    if (state.current && state.current.items.includes(item)) {
      state.current = null;
      $('#result').classList.add('hidden');
    }
    finishItem(false);
    renderAll();
    UI.toast('Capo eliminato');
  }

  itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editing) return;
    const d = editing.draft;
    if (!d.styles.length) { UI.toast('Scegli almeno uno stile'); return; }
    if (!d.seasons.length) d.seasons = SEASONS.map((s) => s.id);
    d.name = (d.name || '').trim();
    if (!editing.isNew && (d.cutout || d.noCutout)) d.reviewed = true;
    const { item, isNew } = editing;
    Object.assign(item, d);
    Store.set('lastCategory', item.category);
    await DB.put('items', item);
    if (isNew) state.items.push(item);
    finishItem(true);
    renderAll();
    if (state.current && state.current.items.includes(item)) renderResult();
    UI.toast(isNew ? 'Capo aggiunto all\'armadio' : 'Modifiche salvate');
  });

  // ---------- capi di esempio ----------
  async function loadDemo() {
    if (state.items.some((i) => i.demo)) {
      UI.toast('I capi di esempio sono già nell\'armadio');
      show('wardrobe');
      return;
    }
    UI.busy(true, 'Preparo l\'armadio di esempio…');
    try {
      const items = await Demo.create((state.profile && state.profile.sex) || 'X', uid);
      for (const i of items) await DB.put('items', i);
      state.items.push(...items);
    } finally {
      UI.busy(false);
    }
    renderAll();
    UI.toast('Capi di esempio aggiunti');
  }

  $('#btn-remove-demo').addEventListener('click', async () => {
    if (!(await UI.ask({ title: 'Rimuovere i capi di esempio?', message: 'I tuoi capi restano dove sono.', ok: 'Rimuovi' }))) return;
    const demo = state.items.filter((i) => i.demo);
    for (const i of demo) await DB.remove('items', i.id);
    state.items = state.items.filter((i) => !i.demo);
    if (state.current && state.current.items.some((i) => i.demo)) {
      state.current = null;
      $('#result').classList.add('hidden');
    }
    renderAll();
  });

  // ---------- preferiti ----------
  const favDlg = $('#fav-dialog');
  let openFav = null;
  const dateIt = (t) => new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });

  function renderFavorites() {
    const favs = [...state.favorites].sort((a, b) => b.savedAt - a.savedAt);
    $('#fav-count').textContent = favs.length ? String(favs.length) : '';
    $('#fav-empty').classList.toggle('hidden', favs.length > 0);
    $('#fav-grid').replaceChildren(...favs.map((f) => {
      const pic = f.thumb ? el('img', { src: f.thumb, alt: '', loading: 'lazy' }) : el('div', { class: 'ph' });
      if (!f.thumb) makeFavThumb(f);
      return el('button', { type: 'button', class: 'fav-card', onclick: () => openFavorite(f) }, [
        pic,
        el('strong', { text: labelOf(OCCASIONS, f.occasion) }),
        el('small', { text: `${labelOf(WEATHER, f.weather)} · ${dateIt(f.savedAt)}` }),
      ]);
    }));
  }

  const favItems = (f) => f.itemIds.map((id) => state.items.find((i) => i.id === id)).filter(Boolean);

  async function makeFavThumb(f) {
    const items = favItems(f);
    if (!items.length) return;
    const c = Imaging.makeCanvas(1, 1);
    await Render.collage(items, c, meta(f.occasion, f.weather));
    f.thumb = thumbOf(c);
    await DB.put('favorites', f);
    if (state.tab === 'favorites') renderFavorites();
  }

  async function openFavorite(f) {
    openFav = f;
    const items = favItems(f);
    $('#fav-dialog-title').textContent = labelOf(OCCASIONS, f.occasion);
    $('#fav-meta').textContent = `${labelOf(WEATHER, f.weather)} · salvato il ${dateIt(f.savedAt)}` +
      (items.length < f.itemIds.length ? ' · alcuni capi sono stati eliminati' : '');
    UI.open(favDlg);
    await Render.collage(items, $('#fav-canvas'), meta(f.occasion, f.weather));
  }

  favDlg.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fav]');
    if (!b || !openFav) return;
    if (b.dataset.fav === 'close') UI.close(favDlg);
    if (b.dataset.fav === 'share') shareCanvas($('#fav-canvas'), `outfit-${openFav.occasion}.png`);
    if (b.dataset.fav === 'delete') {
      if (!(await UI.ask({ title: 'Eliminare questo outfit?', ok: 'Elimina', danger: true }))) return;
      await DB.remove('favorites', openFav.id);
      state.favorites = state.favorites.filter((x) => x.id !== openFav.id);
      if (state.current && state.current.savedId === openFav.id) { state.current.savedId = null; updateSaveButton(); }
      UI.close(favDlg);
      renderFavorites();
    }
  });

  // ---------- profilo ----------
  const SEXES = [{ id: 'F', label: 'Donna' }, { id: 'M', label: 'Uomo' }, { id: 'X', label: 'Altro' }];

  function saveProfile(patch) {
    state.profile = { ...(state.profile || { sex: 'X', age: 30 }), ...patch };
    Store.set('profile', state.profile);
  }

  function renderProfile() {
    const p = state.profile || { sex: 'X', age: 30 };
    segmented($('#profile-sex'), SEXES, p.sex, (id) => { saveProfile({ sex: id }); renderProfile(); });
    if (document.activeElement !== $('#profile-age')) $('#profile-age').value = p.age;
    $('#stat-items').textContent = state.items.length;
    $('#stat-favs').textContent = state.favorites.length;
    $('#btn-demo-profile').classList.toggle('hidden', state.items.some((i) => i.demo));
  }

  const clampAge = (v) => Math.min(110, Math.max(3, Math.round(Number(v) || 30)));
  $('#profile-age').addEventListener('change', (e) => {
    saveProfile({ age: clampAge(e.target.value) });
    renderProfile();
  });
  document.querySelectorAll('[data-age]').forEach((b) => b.addEventListener('click', () => {
    saveProfile({ age: clampAge((state.profile ? state.profile.age : 30) + Number(b.dataset.age)) });
    renderProfile();
  }));

  $('#btn-export').addEventListener('click', async () => {
    const data = { app: 'dailyoutfit', version: 2, exportedAt: new Date().toISOString(), profile: state.profile, items: state.items, favorites: state.favorites };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    try {
      await Native.shareFile(blob, `dailyoutfit-backup-${new Date().toISOString().slice(0, 10)}.json`, 'Backup DailyOutfit');
    } catch (err) {
      console.error(err);
      UI.toast('Non riesco a salvare la copia');
    }
  });

  $('#import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    // prima si controlla tutto il file; i dati attuali si toccano solo se è valido
    let backup;
    try {
      backup = Backup.validate(JSON.parse(await file.text()));
    } catch (err) {
      UI.toast(`Backup non valido: ${err instanceof SyntaxError ? 'il file è danneggiato' : err.message}`);
      return;
    }
    if (!(await UI.ask({ title: `Ripristinare ${backup.items.length} capi?`, message: 'I dati attuali su questo telefono verranno sostituiti.', ok: 'Ripristina', danger: true }))) return;
    UI.busy(true, 'Ripristino…');
    try {
      await DB.replaceAll(backup.items, backup.favorites); // tutto o niente
      if (backup.profile) { state.profile = backup.profile; Store.set('profile', backup.profile); }
      state.current = null;
      $('#result').classList.add('hidden');
      await load();
      UI.toast('Backup ripristinato');
    } catch (err) {
      console.error(err);
      UI.toast('Ripristino non riuscito: i tuoi dati non sono stati modificati.');
    } finally {
      UI.busy(false);
    }
  });

  $('#btn-wipe').addEventListener('click', async () => {
    if (!(await UI.ask({ title: 'Cancellare tutti i dati?', message: 'Capi, outfit salvati e profilo verranno eliminati da questo telefono. Non si può annullare.', ok: 'Cancella tutto', danger: true }))) return;
    await DB.replaceAll([], []);
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('dailyoutfit.')).forEach((k) => localStorage.removeItem(k));
    } catch { /* storage non disponibile */ }
    location.reload();
  });

  // privacy: si apre dentro l'app (funziona anche offline)
  $('#link-privacy').addEventListener('click', (e) => {
    e.preventDefault();
    const dlg = $('#privacy-dialog');
    const frame = dlg.querySelector('iframe');
    if (!frame.getAttribute('src') || frame.getAttribute('src') === 'about:blank') frame.src = 'privacy.html';
    UI.open(dlg);
  });
  $('#privacy-dialog').querySelector('[data-close]').addEventListener('click', () => UI.close($('#privacy-dialog')));

  // ---------- benvenuto ----------
  const ob = $('#onboarding');
  let obSex = 'F';
  function obStep(n) {
    ob.querySelectorAll('.ob-step').forEach((s) => s.classList.toggle('active', Number(s.dataset.step) === n));
    ob.dataset.step = n;
    ob.scrollTop = 0;
  }
  function renderObSex() {
    segmented($('#ob-sex'), SEXES, obSex, (id) => { obSex = id; renderObSex(); });
  }
  function startOnboarding() {
    $('#ob-art').replaceChildren(...['shirt', 'coat', 'loafers'].map((k) => el('img', {
      alt: '', src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(Demo.svgOf(Demo.ITEMS.find((d) => d.key === k))),
    })));
    renderObSex();
    ob.classList.remove('hidden');
    obStep(1);
  }
  function endOnboarding() {
    ob.classList.add('hidden');
  }
  ob.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ob]');
    if (!b) return;
    const a = b.dataset.ob;
    if (a === 'next') obStep(2);
    if (a === 'back') obStep(1);
    if (a === 'profile') {
      const age = Number($('#ob-age').value);
      if (!age || age < 3 || age > 110) {
        UI.toast('Inserisci un\'età valida');
        $('#ob-age').focus();
        return;
      }
      saveProfile({ sex: obSex, age: Math.round(age) });
      obStep(3);
    }
    if (a === 'photos') {
      endOnboarding();
      show('wardrobe');
      openAddSheet();
    }
    if (a === 'demo') {
      endOnboarding();
      await loadDemo();
      show('today');
    }
  });

  // ---------- tasto indietro (Android) ----------
  Native.onBackButton(() => {
    if (UI.back()) return;
    if (!ob.classList.contains('hidden')) {
      const step = Number(ob.dataset.step || 1);
      if (step > 1) obStep(step - 1);
      else Native.exitApp();
      return;
    }
    if (state.tab !== 'today') show('today');
    else Native.exitApp();
  });

  // ---------- capi delle versioni precedenti: scontorno in sottofondo ----------
  async function upgradeOldItems() {
    for (const item of state.items.filter((i) => i.cutout === undefined && i.mask === undefined)) {
      try {
        const res = await Imaging.autoMask(item.image);
        const cut = res ? await Imaging.compose(item.image, res.mask, { enhance: true }) : null;
        Object.assign(item, {
          mask: res ? res.mask.toDataURL('image/png') : null, cutout: cut ? cut.dataUrl : null,
          enhance: true, cutoutConfidence: res ? res.confidence : 0,
        });
      } catch (err) {
        console.warn('Scontorno non riuscito', err);
        Object.assign(item, { mask: null, cutout: null });
      }
      await DB.put('items', item);
      if (state.tab === 'wardrobe') renderWardrobe();
    }
  }

  // ---------- avvio ----------
  function renderAll() {
    renderToday();
    renderWardrobe();
    renderFavorites();
    renderProfile();
  }

  async function load() {
    state.items = await DB.all('items');
    state.favorites = await DB.all('favorites');
    renderAll();
  }

  Icons.hydrate();
  const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#appbar-date').textContent = today.charAt(0).toUpperCase() + today.slice(1);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && !Native.isNative && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  Native.appVersion().then((v) => { $('#app-version').textContent = v; });

  // su iPhone/iPad, nel browser, spiega come installarla dalla schermata Home
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !standalone && !Native.isNative && !Store.get('iosInstallHint', false)) {
    $('#ios-install').classList.remove('hidden');
  }
  $('#btn-ios-install-ok').addEventListener('click', () => {
    Store.set('iosInstallHint', true);
    $('#ios-install').classList.add('hidden');
  });

  load().then(() => {
    if (!state.profile) startOnboarding();
    upgradeOldItems();
  });
})();
