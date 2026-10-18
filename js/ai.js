// Riconoscimento dei capi con Gemini: la chiave API la inserisce l'utente
// e resta salvata solo nel suo browser; le chiamate partono direttamente da qui.
const AI = (() => {
  const BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

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
      if (res.status === 429) {
        const err = new Error(/limit: 0/.test(msg) ? 'modello non incluso nel tuo piano' : 'quota esaurita, riprova più tardi');
        err.status = 429;
        throw err;
      }
      const err = new Error(res.status === 400 && /API key/i.test(msg) ? 'Chiave API non valida' : `${msg} (HTTP ${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // Modelli disponibili per la chiave adatti al riconoscimento delle foto.
  async function listModels(key) {
    const models = [];
    let pageToken = '';
    do {
      const data = await request(`/models?pageSize=200${pageToken ? '&pageToken=' + pageToken : ''}`, { key });
      for (const m of data.models || []) {
        const id = m.name.replace(/^models\//, '');
        if (!(m.supportedGenerationMethods || []).includes('generateContent') || !/gemini/.test(id)) continue;
        if (!/image|banana/.test(id) && !/embedding|tts|audio|live|robotics|computer-use|transcribe|customtools|omni/.test(id)) models.push({ id, label: m.displayName || id });
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return models;
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

  const save = (s) => Store.set('ai', s);

  return { DEFAULT_MODEL, settings, enabled, listModels, analyze, apply, save };
})();
