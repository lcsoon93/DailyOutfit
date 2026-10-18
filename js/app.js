// Interfaccia: navigazione, armadio, profilo, generazione e preferiti.
(() => {
  const $ = (s) => document.querySelector(s);
  const state = {
    items: [],
    favorites: [],
    profile: Store.get('profile', { sex: '', age: '' }),
    occasion: Store.get('lastOccasion', 'school'),
    weather: Store.get('lastWeather', 'mild'),
    filter: 'all',
    current: null,
    editing: null,
    queue: [],
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const occName = (o) => o.label.replace(/^\S+\s/, '');

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c) e.append(c);
    return e;
  }

  // ---------- navigazione ----------
  function show(view) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
    if (view === 'outfit') renderOutfitControls();
    if (view === 'favorites') renderFavorites();
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.view)));

  // ---------- profilo ----------
  const profileForm = $('#profile-form');
  function fillProfile() {
    profileForm.sex.value = state.profile.sex || '';
    profileForm.age.value = state.profile.age || '';
  }
  profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    state.profile = { sex: profileForm.sex.value, age: Number(profileForm.age.value) };
    Store.set('profile', state.profile);
    $('#profile-saved').classList.remove('hidden');
    setTimeout(() => $('#profile-saved').classList.add('hidden'), 1800);
    renderOutfitControls();
  });

  // ---------- armadio ----------
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function fileToItem(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const max = 640;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return {
        id: uid(),
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 40),
        image: canvas.toDataURL('image/jpeg', 0.85),
        category: Store.get('lastCategory', 'top'),
        styles: ['casual'],
        seasons: ['summer', 'mid', 'winter'],
        color: Colors.dominant(canvas),
        createdAt: Date.now(),
        isNew: true,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Ogni foto viene preparata (e analizzata con l'AI, se attiva) e messa in coda:
  // l'utente può già rivedere la prima mentre le altre vengono elaborate.
  $('#file-input').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    const status = $('#ai-status');
    let aiFailed = false;
    for (const [n, f] of files.entries()) {
      let item;
      try {
        item = await fileToItem(f);
      } catch {
        toast(`Impossibile leggere ${f.name}`);
        continue;
      }
      if (AI.enabled() && !aiFailed) {
        status.textContent = `✨ Analisi con AI ${n + 1}/${files.length}…`;
        try {
          const r = await AI.analyze(item.image);
          AI.apply(item, r);
          if (!r.isClothing) toast(`${f.name}: non sembra un capo d'abbigliamento`);
        } catch (err) {
          aiFailed = true;
          toast(`Analisi AI non riuscita: ${err.message}`);
        }
      }
      state.queue.push(item);
      if (!dialog.open) nextInQueue();
    }
    status.textContent = '';
  });

  function nextInQueue() {
    if (!state.queue.length) return;
    openEditor(state.queue.shift());
  }

  function renderFilter() {
    const box = $('#category-filter');
    box.innerHTML = '';
    const opts = [{ id: 'all', label: 'Tutti' }, ...CATEGORIES];
    for (const c of opts) {
      const count = c.id === 'all' ? state.items.length : state.items.filter((i) => i.category === c.id).length;
      if (c.id !== 'all' && !count) continue;
      box.append(el('button', {
        class: 'chip' + (state.filter === c.id ? ' active' : ''),
        text: `${c.label.split(' / ')[0]} (${count})`,
        onclick: () => { state.filter = c.id; renderWardrobe(); },
      }));
    }
  }

  function renderWardrobe() {
    renderFilter();
    const grid = $('#wardrobe-grid');
    grid.innerHTML = '';
    const list = state.items
      .filter((i) => state.filter === 'all' || i.category === state.filter)
      .sort((a, b) => b.createdAt - a.createdAt);
    $('#wardrobe-empty').classList.toggle('hidden', state.items.length > 0);
    for (const item of list) {
      grid.append(el('button', { class: 'item-card', onclick: () => openEditor(item) }, [
        el('img', { src: item.image, alt: item.name, loading: 'lazy' }),
        el('div', { class: 'item-meta' }, [
          el('span', { class: 'swatch', style: `background:${item.color}` }),
          el('span', { class: 'item-name', text: item.name || labelOf(CATEGORIES, item.category) }),
        ]),
        el('div', { class: 'item-tags', text: item.styles.map((s) => labelOf(STYLES, s)).join(' · ') }),
      ]));
    }
  }

  // ---------- editor capo ----------
  const dialog = $('#item-dialog');
  const form = $('#item-form');
  form.category.append(...CATEGORIES.map((c) => el('option', { value: c.id, text: c.label })));
  $('#style-options').append(...STYLES.map((s) => el('label', {}, [el('input', { type: 'checkbox', name: 'styles', value: s.id }), s.label])));
  $('#season-options').append(...SEASONS.map((s) => el('label', {}, [el('input', { type: 'checkbox', name: 'seasons', value: s.id }), s.label])));
  form.color.addEventListener('input', () => { $('#color-name').textContent = Colors.nearest(form.color.value).name; });

  function openEditor(item) {
    state.editing = item;
    $('#item-preview').src = item.image;
    fillForm(item);
    $('#btn-delete-item').textContent = item.isNew ? 'Scarta' : 'Elimina';
    $('#btn-ai-item').classList.toggle('hidden', !AI.settings().key);
    dialog.showModal();
  }

  function fillForm(item) {
    form.name.value = item.name || '';
    form.category.value = item.category;
    form.querySelectorAll('[name=styles]').forEach((c) => { c.checked = item.styles.includes(c.value); });
    form.querySelectorAll('[name=seasons]').forEach((c) => { c.checked = item.seasons.includes(c.value); });
    form.color.value = item.color;
    $('#color-name').textContent = Colors.nearest(item.color).name;
  }

  $('#btn-ai-item').addEventListener('click', async () => {
    const btn = $('#btn-ai-item');
    const item = state.editing;
    btn.disabled = true;
    btn.textContent = 'Analisi…';
    try {
      const r = await AI.analyze(item.image);
      // compila solo il modulo: il capo cambia davvero quando l'utente salva
      fillForm(AI.apply({ ...item, styles: [...item.styles], seasons: [...item.seasons] }, r));
      if (!r.isClothing) toast('La foto non sembra un capo d\'abbigliamento');
    } catch (err) {
      toast(`Analisi AI non riuscita: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Analizza con AI';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = state.editing;
    const styles = [...form.querySelectorAll('[name=styles]:checked')].map((c) => c.value);
    const seasons = [...form.querySelectorAll('[name=seasons]:checked')].map((c) => c.value);
    if (!styles.length) { toast('Scegli almeno uno stile'); return; }
    Object.assign(item, {
      name: form.name.value.trim(),
      category: form.category.value,
      styles,
      seasons: seasons.length ? seasons : SEASONS.map((s) => s.id),
      color: form.color.value,
    });
    delete item.isNew;
    Store.set('lastCategory', item.category);
    await DB.put('items', item);
    if (!state.items.includes(item)) state.items.push(item);
    dialog.close();
    renderWardrobe();
    nextInQueue();
  });

  $('#btn-cancel-item').addEventListener('click', () => { dialog.close(); nextInQueue(); });

  $('#btn-delete-item').addEventListener('click', async () => {
    const item = state.editing;
    if (!item.isNew) {
      if (!confirm('Eliminare questo capo dall\'armadio?')) return;
      await DB.remove('items', item.id);
      state.items = state.items.filter((i) => i.id !== item.id);
    }
    dialog.close();
    renderWardrobe();
    nextInQueue();
  });

  // ---------- generazione ----------
  function renderOutfitControls() {
    const occs = Generator.occasionsFor(state.profile);
    if (!occs.some((o) => o.id === state.occasion)) state.occasion = occs[0].id;
    const ol = $('#occasion-list');
    ol.innerHTML = '';
    for (const o of occs) {
      ol.append(el('button', {
        class: 'chip' + (o.id === state.occasion ? ' active' : ''),
        text: o.label,
        onclick: () => { state.occasion = o.id; Store.set('lastOccasion', o.id); renderOutfitControls(); },
      }));
    }
    const wl = $('#weather-list');
    wl.innerHTML = '';
    for (const w of WEATHER) {
      wl.append(el('button', {
        class: 'chip' + (w.id === state.weather ? ' active' : ''),
        text: w.label,
        onclick: () => { state.weather = w.id; Store.set('lastWeather', w.id); renderOutfitControls(); },
      }));
    }

    const hint = $('#generate-hint');
    const btn = $('#btn-generate');
    if (!state.profile.sex || !state.profile.age) {
      hint.innerHTML = 'Prima completa il <a href="#" data-go="profile">profilo</a> con sesso ed età.';
      btn.disabled = true;
    } else if (state.items.length < 2) {
      hint.innerHTML = 'Carica almeno qualche capo nell\'<a href="#" data-go="wardrobe">armadio</a> per iniziare.';
      btn.disabled = true;
    } else {
      hint.textContent = `${state.items.length} capi nell'armadio.`;
      btn.disabled = false;
    }
  }

  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); show(go.dataset.go); }
  });

  function generate() {
    const recentIds = Store.get('recent', []);
    const res = Generator.generate(state.items, {
      occasionId: state.occasion,
      weatherId: state.weather,
      profile: state.profile,
      recentIds,
    });
    const box = $('#outfit-result');
    box.classList.remove('hidden');
    if (res.error) {
      state.current = null;
      $('#outfit-title').textContent = 'Non riesco a comporre un outfit';
      $('#outfit-items').innerHTML = '';
      $('#outfit-render').classList.add('hidden');
      $('#outfit-notes').innerHTML = '';
      $('#outfit-notes').append(el('p', { class: 'warn', text: res.error }));
      $('#btn-save').disabled = true;
      $('#btn-regenerate').disabled = true;
      return;
    }
    state.current = res;
    $('#outfit-render').classList.remove('hidden');
    Store.set('recent', [...res.items.map((i) => i.id), ...recentIds].slice(0, 12));
    $('#btn-save').disabled = false;
    $('#btn-regenerate').disabled = false;
    $('#outfit-title').textContent = `Outfit per: ${occName(res.occasion)}`;
    renderOutfitItems($('#outfit-items'), res.items);
    Render.collage(res.items, $('#collage-canvas'));
    resetIllustration();
    setRenderMode(state.renderMode === 'ai' ? 'collage' : state.renderMode);
    const notes = $('#outfit-notes');
    notes.innerHTML = '';
    notes.append(el('ul', {}, res.notes.map((n) => el('li', { text: n }))));
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderOutfitItems(container, items) {
    container.innerHTML = '';
    for (const i of items) {
      container.append(el('figure', { class: 'outfit-item' }, [
        el('img', { src: i.image, alt: i.name }),
        el('figcaption', {}, [
          el('strong', { text: labelOf(CATEGORIES, i.category).split(' / ')[0] }),
          el('span', { text: i.name || Colors.nearest(i.color).name }),
        ]),
      ]));
    }
  }

  // ---------- render 2D ----------
  state.renderMode = 'collage';
  function setRenderMode(mode) {
    state.renderMode = mode;
    document.querySelectorAll('.seg').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    $('#collage-canvas').classList.toggle('hidden', mode !== 'collage');
    $('#ai-render').classList.toggle('hidden', mode !== 'ai');
    $('#outfit-items').classList.toggle('hidden', mode !== 'items');
    const hasAi = Boolean(state.current && state.current.illustration);
    $('#btn-download').classList.toggle('hidden', mode === 'items' || (mode === 'ai' && !hasAi));
    $('#btn-reillustrate').classList.toggle('hidden', mode !== 'ai' || !hasAi);
    if (mode === 'ai' && !AI.settings().key) {
      $('#ai-render-msg').innerHTML = 'Per le illustrazioni serve la chiave API di Gemini: inseriscila nel <a href="#" data-go="profile">profilo</a>.';
      $('#btn-illustrate').classList.add('hidden');
    } else if (mode === 'ai' && state.current && state.current.illustrationError) {
      $('#ai-render-msg').textContent = `Illustrazione non riuscita: ${state.current.illustrationError}`;
      $('#ai-render-msg').classList.add('err');
      $('#btn-illustrate').textContent = '↻ Riprova';
      $('#btn-illustrate').classList.remove('hidden');
    } else if (mode === 'ai' && !hasAi) {
      $('#ai-render-msg').classList.remove('err');
      $('#btn-illustrate').textContent = '✨ Genera illustrazione';
      $('#ai-render-msg').textContent = 'Genera un\'illustrazione 2D di una figura che indossa questo outfit, partendo dalle foto dei tuoi capi.';
      $('#btn-illustrate').classList.remove('hidden');
    }
  }
  document.querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => setRenderMode(b.dataset.mode)));

  function resetIllustration() {
    $('#ai-image').classList.add('hidden');
    $('#ai-image').removeAttribute('src');
    $('#ai-placeholder').classList.remove('hidden', 'loading');
  }

  async function illustrate() {
    const outfit = state.current;
    if (!outfit) return;
    const ph = $('#ai-placeholder');
    resetIllustration();
    outfit.illustration = null;
    outfit.illustrationError = null;
    setRenderMode('ai');
    ph.classList.add('loading');
    $('#ai-render-msg').classList.remove('err');
    $('#ai-render-msg').textContent = 'Sto disegnando il tuo outfit… può richiedere qualche secondo.';
    try {
      const url = await AI.illustrate(outfit.items, state.profile);
      if (state.current !== outfit) return; // nel frattempo è stato generato un altro outfit
      outfit.illustration = url;
      $('#ai-image').src = url;
      $('#ai-image').classList.remove('hidden');
      ph.classList.add('hidden');
    } catch (err) {
      if (state.current !== outfit) return;
      outfit.illustrationError = err.message;
      console.error('Illustrazione AI non riuscita', err);
    } finally {
      ph.classList.remove('loading');
      if (state.current === outfit) setRenderMode(state.renderMode);
    }
  }
  $('#btn-illustrate').addEventListener('click', illustrate);
  $('#btn-reillustrate').addEventListener('click', illustrate);

  $('#btn-download').addEventListener('click', () => {
    if (!state.current) return;
    const ai = state.renderMode === 'ai' && state.current.illustration;
    const href = ai ? state.current.illustration : $('#collage-canvas').toDataURL('image/png');
    const ext = ai ? (href.match(/^data:image\/(\w+)/) || [, 'png'])[1].replace('jpeg', 'jpg') : 'png';
    const a = el('a', { href, download: `outfit-${state.current.occasion.id}-${new Date().toISOString().slice(0, 10)}.${ext}` });
    document.body.append(a);
    a.click();
    a.remove();
  });

  $('#btn-generate').addEventListener('click', generate);
  $('#btn-regenerate').addEventListener('click', generate);

  // ---------- preferiti ----------
  $('#btn-save').addEventListener('click', async () => {
    if (!state.current) return;
    const fav = {
      id: uid(),
      occasion: state.current.occasion.id,
      weather: state.current.weather.id,
      itemIds: state.current.items.map((i) => i.id),
      savedAt: Date.now(),
    };
    await DB.put('favorites', fav);
    state.favorites.push(fav);
    toast('Outfit salvato nei preferiti');
  });

  function renderFavorites() {
    const list = $('#favorites-list');
    list.innerHTML = '';
    const favs = [...state.favorites].sort((a, b) => b.savedAt - a.savedAt);
    $('#favorites-empty').classList.toggle('hidden', favs.length > 0);
    for (const f of favs) {
      const items = f.itemIds.map((id) => state.items.find((i) => i.id === id)).filter(Boolean);
      const occ = OCCASIONS.find((o) => o.id === f.occasion);
      const grid = el('div', { class: 'outfit-grid compact' });
      renderOutfitItems(grid, items);
      const thumb = el('canvas', { class: 'fav-collage' });
      if (items.length) Render.collage(items, thumb);
      list.append(el('div', { class: 'card' }, [
        el('div', { class: 'result-head' }, [
          el('h3', { text: `${occ ? occ.label : f.occasion} · ${labelOf(WEATHER, f.weather)}` }),
          el('button', {
            class: 'secondary',
            text: 'Rimuovi',
            onclick: async () => {
              await DB.remove('favorites', f.id);
              state.favorites = state.favorites.filter((x) => x.id !== f.id);
              renderFavorites();
            },
          }),
        ]),
        items.length < f.itemIds.length ? el('p', { class: 'hint', text: 'Alcuni capi sono stati eliminati dall\'armadio.' }) : null,
        items.length ? thumb : null,
        grid,
      ]));
    }
  }

  // ---------- impostazioni AI ----------
  const aiForm = $('#ai-form');
  function setModels(select, models, selected) {
    select.innerHTML = '';
    const ids = models.length ? [...models] : [{ id: selected, label: selected }];
    if (!ids.some((m) => m.id === selected)) ids.unshift({ id: selected, label: selected });
    for (const m of ids) select.append(el('option', { value: m.id, text: m.label === m.id ? m.id : `${m.label} (${m.id})` }));
    select.value = selected;
  }
  function fillAi() {
    const s = AI.settings();
    aiForm.key.value = s.key || '';
    aiForm.enabled.checked = s.enabled !== false;
    setModels(aiForm.model, [], s.model || AI.DEFAULT_MODEL);
    setModels(aiForm.imageModel, [], s.imageModel || AI.DEFAULT_IMAGE_MODEL);
  }
  const aiFormSettings = (key) => ({
    key,
    model: aiForm.model.value || AI.DEFAULT_MODEL,
    imageModel: aiForm.imageModel.value || AI.DEFAULT_IMAGE_MODEL,
    enabled: aiForm.enabled.checked,
  });
  aiForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const check = $('#ai-check');
    const key = aiForm.key.value.trim();
    const settings = aiFormSettings(key);
    AI.save(settings);
    if (!key) { check.textContent = 'Nessuna chiave inserita: il riconoscimento AI è disattivato.'; return; }
    check.className = 'hint';
    check.textContent = 'Verifico la chiave…';
    try {
      const { models, imageModels } = await AI.listModels(key);
      setModels(aiForm.model, models, settings.model);
      // se il modello immagine predefinito non c'è, scegline uno disponibile
      const imageModel = imageModels.some((m) => m.id === settings.imageModel) || !imageModels.length ? settings.imageModel : imageModels[0].id;
      setModels(aiForm.imageModel, imageModels, imageModel);
      AI.save(aiFormSettings(key));
      check.className = 'hint ok';
      check.textContent = `Chiave valida ✓ (${models.length} modelli di testo, ${imageModels.length} per immagini)`;
    } catch (err) {
      check.className = 'hint err';
      check.textContent = `Errore: ${err.message}`;
    }
  });
  aiForm.model.addEventListener('change', () => AI.save({ ...AI.settings(), model: aiForm.model.value }));
  aiForm.imageModel.addEventListener('change', () => AI.save({ ...AI.settings(), imageModel: aiForm.imageModel.value }));
  $('#btn-ai-remove').addEventListener('click', () => {
    AI.save({ ...AI.settings(), key: '', enabled: true });
    fillAi();
    $('#ai-check').className = 'hint';
    $('#ai-check').textContent = 'Chiave rimossa.';
  });

  // ---------- backup ----------
  $('#btn-export').addEventListener('click', () => {
    const data = { version: 1, profile: state.profile, items: state.items, favorites: state.favorites };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `dailyoutfit-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('#import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.items)) throw new Error('formato');
      if (!confirm(`Importare ${data.items.length} capi? I dati attuali verranno sostituiti.`)) return;
      await DB.clear('items');
      await DB.clear('favorites');
      for (const i of data.items) await DB.put('items', i);
      for (const f of data.favorites || []) await DB.put('favorites', f);
      if (data.profile) { state.profile = data.profile; Store.set('profile', data.profile); }
      await load();
      toast('Backup importato');
    } catch {
      toast('File di backup non valido');
    }
  });

  // ---------- avvio ----------
  async function load() {
    state.items = await DB.all('items');
    state.favorites = await DB.all('favorites');
    fillProfile();
    fillAi();
    renderWardrobe();
    renderOutfitControls();
    renderFavorites();
  }

  load().then(() => {
    if (!state.profile.sex || !state.profile.age) show('profile');
  });
})();
