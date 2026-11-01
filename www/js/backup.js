// Controllo dei file di backup prima del ripristino: un file difettoso
// viene rifiutato per intero, senza toccare i dati attuali.
const Backup = (() => {
  const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  const isImage = (s) => typeof s === 'string' && s.startsWith('data:image/');
  const isId = (s) => typeof s === 'string' && s.length > 0 && s.length < 100;

  // Restituisce { items, favorites, profile } puliti, oppure lancia un errore
  // con il motivo leggibile.
  function validate(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.items)) throw new Error('non è un backup di DailyOutfit');
    if (data.app && data.app !== 'dailyoutfit') throw new Error('il file viene da un\'altra app');
    const ids = new Set();
    const items = data.items.map((it, n) => {
      const where = `capo n. ${n + 1}`;
      if (!it || typeof it !== 'object') throw new Error(`${where}: dati mancanti`);
      if (!isId(it.id) || ids.has(it.id)) throw new Error(`${where}: identificativo mancante o doppio`);
      if (!CATEGORIES.some((c) => c.id === it.category)) throw new Error(`${where}: categoria sconosciuta`);
      if (!isImage(it.image)) throw new Error(`${where}: foto mancante`);
      ids.add(it.id);
      const styles = Array.isArray(it.styles) ? it.styles.filter((s) => STYLES.some((x) => x.id === s)) : [];
      const seasons = Array.isArray(it.seasons) ? it.seasons.filter((s) => SEASONS.some((x) => x.id === s)) : [];
      return {
        ...it,
        name: typeof it.name === 'string' ? it.name.slice(0, 40) : '',
        styles: styles.length ? styles : ['casual'],
        seasons: seasons.length ? seasons : SEASONS.map((s) => s.id),
        color: isHex(it.color) ? it.color : '#8c8c8c',
        cutout: isImage(it.cutout) ? it.cutout : (it.cutout === undefined ? undefined : null),
        mask: isImage(it.mask) ? it.mask : (it.mask === undefined ? undefined : null),
        createdAt: Number(it.createdAt) || Date.now(),
      };
    });
    const favorites = (Array.isArray(data.favorites) ? data.favorites : [])
      .filter((f) => f && isId(f.id) && Array.isArray(f.itemIds))
      .map((f) => ({ ...f, itemIds: f.itemIds.filter((id) => ids.has(id)), thumb: isImage(f.thumb) ? f.thumb : undefined }))
      .filter((f) => f.itemIds.length);
    const p = data.profile;
    const profile = p && ['F', 'M', 'X'].includes(p.sex) && Number(p.age) >= 3 && Number(p.age) <= 110
      ? { sex: p.sex, age: Math.round(Number(p.age)) } : null;
    return { items, favorites, profile };
  }

  return { validate };
})();
