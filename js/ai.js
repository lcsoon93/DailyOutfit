// Riconoscimento dei capi con Gemini: la chiave API la inserisce l'utente
// e resta salvata solo nel suo browser; le chiamate partono direttamente da qui.
const AI = (() => {
  const BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
  const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-lite-image';

  const settings = () => Store.get('ai', { key: '', model: DEFAULT_MODEL, enabled: true });
  const enabled = () => { const s = settings(); return Boolean(s.key && s.enabled); };

  const SCHEMA = {
    type: 'OBJECT',
    properties: {
      isClothing: { type: 'BOOLEAN' },
      name: { type: 'STRING' },
      category: { type: 'STRING', enum: CATEGORIES.map((c) => c.id) },
      styles: { type: 'ARRAY', items: { type: 'STRING', enum: STYLES.map((s) => s.id) } },
      seasons: { type: 'ARRAY', items: { type: 'STRING', enum: SEASONS.map((s) => s.id) } },
      color: { type: 'STRING' },
    },
    required: ['isClothing', 'name', 'category', 'styles', 'seasons', 'color'],
  };

  const PROMPT = `Analizza la foto di un capo d'abbigliamento e classificalo.
- isClothing: false se nella foto non c'è un capo, scarpe o accessorio.
- name: nome breve in italiano con tipo e colore, es. "Camicia bianca", "Jeans slim blu", "Sneakers bianche". Massimo 4 parole.
- category: ${CATEGORIES.map((c) => `${c.id} = ${c.label}`).join('; ')}.
- styles: tutti gli stili adatti tra ${STYLES.map((s) => `${s.id} (${s.label})`).join(', ')}. Una t-shirt basic è casual; una camicia può essere casual e smart; un abito da cerimonia è elegant; tuta e scarpe da running sono sport.
- seasons: stagioni in cui si indossa tra summer (estate), mid (mezza stagione), winter (inverno).
- color: colore principale del capo (non dello sfondo) in formato esadecimale #rrggbb.`;

  async function request(path, { key, method = 'GET', body } = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.error && data.error.message) || `HTTP ${res.status}`;
      const err = new Error(res.status === 400 && /API key/i.test(msg) ? 'Chiave API non valida' : `${msg} (HTTP ${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // Modelli disponibili per la chiave, che accettano generateContent,
  // divisi tra modelli di testo/visione e modelli che generano immagini.
  async function listModels(key) {
    const models = [], imageModels = [];
    let pageToken = '';
    do {
      const data = await request(`/models?pageSize=200${pageToken ? '&pageToken=' + pageToken : ''}`, { key });
      for (const m of data.models || []) {
        const id = m.name.replace(/^models\//, '');
        if (!(m.supportedGenerationMethods || []).includes('generateContent') || !/gemini/.test(id)) continue;
        if (/image|banana/.test(id)) imageModels.push({ id, label: m.displayName || id });
        else if (!/embedding|tts|audio|live/.test(id)) models.push({ id, label: m.displayName || id });
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return { models, imageModels };
  }

  async function analyze(dataUrl) {
    const { key, model } = settings();
    const data = await request(`/models/${encodeURIComponent(model || DEFAULT_MODEL)}:generateContent`, {
      key,
      method: 'POST',
      body: {
        contents: [{ role: 'user', parts: [imageData(dataUrl), { text: PROMPT }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA },
      },
    });
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    if (!text) throw new Error('Risposta vuota dal modello');
    return sanitize(JSON.parse(text));
  }

  // Non fidarsi ciecamente della risposta: tieni solo valori validi.
  function sanitize(r) {
    const valid = (list, ids) => (Array.isArray(ids) ? ids : []).filter((id) => list.some((x) => x.id === id));
    return {
      isClothing: r.isClothing !== false,
      name: String(r.name || '').slice(0, 40),
      category: CATEGORIES.some((c) => c.id === r.category) ? r.category : null,
      styles: [...new Set(valid(STYLES, r.styles))],
      seasons: [...new Set(valid(SEASONS, r.seasons))],
      color: /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color.toLowerCase() : null,
    };
  }

  // Applica il risultato al capo: i campi che l'AI non ha riconosciuto restano com'erano.
  function apply(item, r) {
    if (r.name) item.name = r.name;
    if (r.category) item.category = r.category;
    if (r.styles.length) item.styles = r.styles;
    if (r.seasons.length) item.seasons = r.seasons;
    if (r.color) item.color = r.color;
    item.aiTagged = true;
    return item;
  }

  const imageData = (dataUrl) => {
    const [, mime, data] = dataUrl.match(/^data:([^;]+);base64,(.*)$/) || [];
    return { inline_data: { mime_type: mime, data } };
  };

  // Valore speciale del menu: disegno vettoriale fatto dal modello di testo,
  // per chi non ha accesso ai modelli che generano immagini.
  const SVG_MODE = 'svg';
  const isImageModel = (id) => /image|banana/.test(id || '');

  function describe(items, profile) {
    const who = { F: 'una donna', M: 'un uomo' }[profile.sex] || 'una persona';
    const list = items.map((i, n) => `${n + 1}. ${i.name || labelOf(CATEGORIES, i.category)} (${labelOf(CATEGORIES, i.category).split(' / ')[0].toLowerCase()}, colore ${i.color})`).join('\n');
    return { who, list };
  }

  // Illustrazione 2D di una figura che indossa l'outfit, generata dai capi reali.
  // Usa un modello per immagini se disponibile, altrimenti il disegno SVG.
  async function illustrate(items, profile) {
    const { key, imageModel } = settings();
    if (imageModel === SVG_MODE || (imageModel && !isImageModel(imageModel))) return illustrateSvg(items, profile);

    const { who, list } = describe(items, profile);
    const prompt = `Crea un'illustrazione 2D in stile figurino di moda, a figura intera, di ${who} di circa ${profile.age} anni, in piedi e in posa naturale, che indossa ESATTAMENTE i capi delle foto allegate, rispettandone colori, fantasie e forme:
${list}
Formato verticale 3:4, sfondo chiaro e neutro, stile illustrazione flat elegante con contorni puliti, viso stilizzato, nessun testo, nessun logo.`;
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }, ...items.map((i) => imageData(i.image))] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    };
    const call = (model) => request(`/models/${encodeURIComponent(model)}:generateContent`, { key, method: 'POST', body });

    // Il modello salvato potrebbe non esistere per questa chiave: ne sceglie
    // uno tra quelli disponibili, o ripiega sul disegno SVG se non ce ne sono.
    let model = imageModel || DEFAULT_IMAGE_MODEL;
    let data;
    try {
      data = await call(model);
    } catch (err) {
      if (err.status !== 404 && err.status !== 400 && err.status !== 403) throw err;
      const fallback = await pickImageModel(key, model);
      save({ ...settings(), imageModel: fallback || SVG_MODE });
      if (!fallback) return illustrateSvg(items, profile);
      model = fallback;
      data = await call(model);
    }
    const parts = data.candidates?.[0]?.content?.parts || [];
    const img = parts.filter((p) => !p.thought).map((p) => p.inlineData || p.inline_data).find(Boolean);
    if (!img) {
      const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason;
      throw new Error(reason ? `nessuna immagine generata (${reason})` : 'nessuna immagine generata');
    }
    return `data:${img.mimeType || img.mime_type || 'image/png'};base64,${img.data}`;
  }

  async function illustrateSvg(items, profile) {
    const { key, model } = settings();
    const { who, list } = describe(items, profile);
    const prompt = `Disegna in SVG un figurino di moda 2D: ${who} di circa ${profile.age} anni, a figura intera, in piedi e frontale, che indossa questi capi (le foto allegate mostrano forma e fantasia; usa i colori indicati):
${list}
Requisiti:
- Un unico elemento <svg> con viewBox="0 0 600 800" e xmlns="http://www.w3.org/2000/svg".
- Stile flat elegante: sfondo chiaro neutro, figura slanciata con proporzioni da figurino, viso stilizzato senza dettagli, capelli semplici, pelle in tono naturale.
- Ogni capo disegnato con path dalla forma realistica (colletto, maniche, orli, pieghe con tonalità leggermente più scure per le ombre), sovrapposti nell'ordine corretto (scarpe, pantaloni o gonna, maglia, maglione, giacca).
- Niente testo, script, immagini esterne o font.
Rispondi solo con il codice SVG.`;
    const data = await request(`/models/${encodeURIComponent(model || DEFAULT_MODEL)}:generateContent`, {
      key,
      method: 'POST',
      body: {
        contents: [{ role: 'user', parts: [{ text: prompt }, ...items.map((i) => imageData(i.image))] }],
        generationConfig: { maxOutputTokens: 16384 },
      },
    });
    const text = (data.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
    const match = text.match(/<svg[\s\S]*<\/svg>/i);
    if (!match) {
      const reason = data.candidates?.[0]?.finishReason;
      throw new Error(reason === 'MAX_TOKENS' ? 'disegno troppo lungo, riprova' : 'il modello non ha restituito un disegno');
    }
    return svgToPng(sanitizeSvg(match[0]));
  }

  // Tiene solo elementi grafici: niente script, eventi o riferimenti esterni.
  function sanitizeSvg(markup) {
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const svg = doc.documentElement;
    if (svg.nodeName !== 'svg' || doc.querySelector('parsererror')) throw new Error('disegno non valido');
    svg.querySelectorAll('script, foreignObject, image, iframe, style').forEach((n) => n.remove());
    for (const n of [svg, ...svg.querySelectorAll('*')]) {
      for (const a of [...n.attributes]) {
        if (/^on/i.test(a.name) || (/href$/i.test(a.name) && !a.value.startsWith('#'))) n.removeAttribute(a.name);
      }
    }
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', '0 0 600 800');
    svg.setAttribute('width', '600');
    svg.setAttribute('height', '800');
    return new XMLSerializer().serializeToString(svg);
  }

  function svgToPng(svg) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 900; canvas.height = 1200;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f7f3ee';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('disegno non valido'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  const PREFERRED_IMAGE_MODELS = ['gemini-nano-banana-2.1', 'gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3-pro-image', 'gemini-2.5-flash-image'];

  async function pickImageModel(key, exclude) {
    const { imageModels } = await listModels(key);
    const ids = imageModels.map((m) => m.id).filter((id) => id !== exclude);
    return PREFERRED_IMAGE_MODELS.find((id) => ids.includes(id)) || ids[0] || null;
  }

  const save = (s) => Store.set('ai', s);

  return { DEFAULT_MODEL, DEFAULT_IMAGE_MODEL, SVG_MODE, illustrate, settings, enabled, listModels, analyze, apply, save };
})();
