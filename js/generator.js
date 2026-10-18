// Motore di generazione: sceglie i capi adatti all'occasione, al meteo e al
// profilo, prova molte combinazioni e tiene le più armoniche.
const Generator = (() => {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // Pesi degli stili adattati all'età della persona.
  function styleWeights(occasion, profile) {
    const w = { ...occasion.styles };
    const age = Number(profile.age) || 30;
    const nudge = (id, d) => { if (w[id] > 0) w[id] = Math.max(0.5, w[id] + d); };
    if (age < 14) { nudge('sport', 0.5); nudge('casual', 0.5); nudge('smart', -0.5); }
    else if (age < 26) { nudge('casual', 0.5); }
    else if (age >= 50) { nudge('smart', 0.5); if (occasion.id !== 'sport') nudge('sport', -1); }
    return w;
  }

  function styleScore(item, weights) {
    const styles = item.styles && item.styles.length ? item.styles : ['casual'];
    return Math.max(...styles.map((s) => weights[s] || 0));
  }

  function seasonOk(item, weather) {
    return !item.seasons || !item.seasons.length || item.seasons.includes(weather.season);
  }

  // Occasioni disponibili in base all'età.
  function occasionsFor(profile) {
    const age = Number(profile.age) || 30;
    return OCCASIONS.filter((o) => {
      if (o.id === 'work' && age < 15) return false;
      if (o.id === 'date' && age < 13) return false;
      return true;
    });
  }

  function pools(items, weights, weather) {
    const byCat = {};
    for (const c of CATEGORIES) {
      const ofCat = items.filter((i) => i.category === c.id && styleScore(i, weights) > 0);
      const inSeason = ofCat.filter((i) => seasonOk(i, weather));
      // se nessun capo è di stagione, meglio un capo fuori stagione che niente
      byCat[c.id] = { list: inSeason.length ? inSeason : ofCat, relaxed: !inSeason.length && ofCat.length > 0 };
    }
    return byCat;
  }

  function buildCandidate(p, ctx) {
    const { occasion, weather, sex } = ctx;
    const out = [];
    const hasSeparates = p.top.list.length && p.bottom.list.length;
    const hasOnepiece = p.onepiece.list.length > 0;
    if (!hasSeparates && !hasOnepiece) return null;

    let onepieceChance = hasSeparates ? 0.3 : 1;
    if (occasion.preferOnepiece && occasion.preferOnepiece[sex]) onepieceChance = hasSeparates ? 0.6 : 1;
    if (hasOnepiece && Math.random() < onepieceChance) {
      out.push(pick(p.onepiece.list));
    } else if (hasSeparates) {
      out.push(pick(p.top.list), pick(p.bottom.list));
    } else {
      return null;
    }

    if (p.layer.list.length) {
      const chance = weather.layers ? 0.8 : weather.id === 'mild' ? 0.35 : 0;
      if (Math.random() < chance) out.push(pick(p.layer.list));
    }

    if (p.outerwear.list.length) {
      const required = occasion.requireOuterwear && occasion.requireOuterwear[sex];
      let chance = weather.outerwear === true ? 1 : weather.outerwear === 'optional' ? 0.45 : 0;
      if (occasion.preferOuterwear) chance = Math.max(chance, 0.7);
      if (required || Math.random() < chance) out.push(pick(p.outerwear.list));
    }

    if (p.shoes.list.length) out.push(pick(p.shoes.list));

    if (!occasion.noAccessory && p.accessory.list.length && Math.random() < 0.5) {
      out.push(pick(p.accessory.list));
    }
    return out;
  }

  function score(outfit, ctx) {
    const { weights, recent } = ctx;
    const style = outfit.reduce((s, i) => s + styleScore(i, weights), 0) / outfit.length;
    const harmony = Colors.harmony(outfit.map((i) => i.color));
    const repeats = outfit.filter((i) => recent.has(i.id)).length;
    const completeness = outfit.some((i) => i.category === 'shoes') ? 0.5 : 0;
    return { value: style * 2 + harmony.score * 1.5 - repeats * 0.8 + completeness, harmony };
  }

  function missingNotes(p, ctx) {
    const { occasion, weather, sex } = ctx;
    const notes = [];
    const occ = occasion.label.replace(/^\S+\s/, '').toLowerCase();
    if (!p.shoes.list.length) notes.push(`Nessun paio di scarpe adatto a "${occ}": aggiungine uno all'armadio.`);
    if (weather.outerwear === true && !p.outerwear.list.length) notes.push('Fa freddo e non hai un capospalla adatto: aggiungi una giacca o un cappotto.');
    if (occasion.requireOuterwear && occasion.requireOuterwear[sex] && !p.outerwear.list.length) {
      notes.push('Per una cerimonia ti consigliamo una giacca o un blazer elegante.');
    }
    const relaxed = CATEGORIES.filter((c) => p[c.id].relaxed).map((c) => c.label.split(' / ')[0].toLowerCase());
    if (relaxed.length) notes.push(`Non hai capi di stagione per: ${relaxed.join(', ')}. Ne ho usato uno fuori stagione.`);
    return notes;
  }

  function generate(items, { occasionId, weatherId, profile, recentIds = [] }) {
    const occasion = OCCASIONS.find((o) => o.id === occasionId);
    const weather = WEATHER.find((w) => w.id === weatherId) || WEATHER[1];
    const weights = styleWeights(occasion, profile);
    const ctx = { occasion, weather, weights, sex: profile.sex, recent: new Set(recentIds) };
    const p = pools(items, weights, weather);

    if (!(p.top.list.length && p.bottom.list.length) && !p.onepiece.list.length) {
      return {
        error: `Mancano capi adatti a "${occasion.label.replace(/^\S+\s/, '')}": servono almeno una parte sopra e una sotto (o un vestito intero) con uno stile compatibile.`,
      };
    }

    const seen = new Set();
    const candidates = [];
    for (let i = 0; i < 500; i++) {
      const c = buildCandidate(p, ctx);
      if (!c) continue;
      const key = c.map((x) => x.id).sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ items: c, ...score(c, ctx) });
    }
    candidates.sort((a, b) => b.value - a.value);

    // varietà: scegli a caso tra le migliori, favorendo le prime
    const top = candidates.slice(0, 6);
    const chosen = top[Math.min(top.length - 1, Math.floor(Math.random() ** 2 * top.length))];

    const order = CATEGORIES.map((c) => c.id);
    chosen.items.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));

    const notes = [chosen.harmony.reason, occasion.tip, ...sexAgeTips(occasion, profile), ...missingNotes(p, ctx)];
    return { occasion, weather, items: chosen.items, notes };
  }

  function sexAgeTips(occasion, profile) {
    const age = Number(profile.age) || 30;
    const tips = [];
    if (occasion.id === 'ceremony') {
      if (profile.sex === 'F') tips.push('Una borsa piccola e un gioiello semplice completano il look. Se è un matrimonio, evita il bianco.');
      if (profile.sex === 'M') tips.push('Scarpe e cintura dello stesso colore danno ordine all\'insieme.');
    }
    if (occasion.id === 'school' && age < 14) tips.push('Scegli capi che si possono sporcare senza pensieri.');
    return tips;
  }

  return { generate, occasionsFor };
})();
