import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const { Generator } = loadApp(['data.js', 'colors.js', 'generator.js']);
const all = ['summer', 'mid', 'winter'];
const item = (id, category, styles, color, seasons = all) => ({ id, category, styles, color, seasons });
const wardrobe = [
  item('tee', 'top', ['casual', 'sport'], '#f3f1ed'),
  item('shirt', 'top', ['smart', 'elegant'], '#a8c3e0'),
  item('jeans', 'bottom', ['casual'], '#45668f'),
  item('trousers', 'bottom', ['smart', 'elegant'], '#2b2b30'),
  item('joggers', 'bottom', ['sport'], '#6c7077'),
  item('dress', 'onepiece', ['elegant'], '#1e1e24'),
  item('blazer', 'outerwear', ['smart', 'elegant'], '#23314f', ['mid', 'winter']),
  item('sneakers', 'shoes', ['casual', 'sport'], '#f5f4f1'),
  item('loafers', 'shoes', ['smart', 'elegant'], '#7b4a2d'),
];
const profile = { sex: 'F', age: 30 };
const run = (occasionId, weatherId = 'mild', items = wardrobe) => Generator.generate(items, { occasionId, weatherId, profile, recentIds: [] });

test('ogni outfit ha sopra + sotto oppure un capo intero, senza doppioni', () => {
  for (const occ of ['school', 'work', 'ceremony', 'pizza', 'date', 'party', 'sport', 'weekend']) {
    for (let i = 0; i < 30; i++) {
      const res = run(occ);
      assert.ok(!res.error, `${occ}: ${res.error}`);
      const cats = res.items.map((x) => x.category);
      const separates = cats.includes('top') && cats.includes('bottom');
      const onepiece = cats.includes('onepiece');
      assert.ok(separates !== onepiece, `${occ}: ${cats.join(',')}`);
      assert.equal(new Set(res.items.map((x) => x.id)).size, res.items.length);
      assert.equal(new Set(cats.filter((c) => c !== 'accessory')).size, cats.filter((c) => c !== 'accessory').length);
    }
  }
});

test('lo sport usa solo capi sportivi', () => {
  for (let i = 0; i < 30; i++) {
    for (const x of run('sport').items) assert.ok(x.styles.includes('sport'), x.id);
  }
});

test('la cerimonia non propone capi solo casual o sportivi', () => {
  for (let i = 0; i < 30; i++) {
    for (const x of run('ceremony').items) assert.ok(x.styles.some((s) => s === 'elegant' || s === 'smart'), x.id);
  }
});

test('con il freddo arriva il capospalla, se c\'è', () => {
  for (let i = 0; i < 20; i++) {
    assert.ok(run('work', 'cold').items.some((x) => x.category === 'outerwear'));
  }
});

test('armadio incompleto: messaggio chiaro invece di un outfit sbagliato', () => {
  const res = run('school', 'mild', wardrobe.filter((x) => x.category !== 'bottom' && x.category !== 'onepiece'));
  assert.match(res.error, /parte sopra e una sotto/);
});

test('le occasioni seguono l\'età', () => {
  assert.ok(!Generator.occasionsFor({ age: 10 }).some((o) => o.id === 'work'));
  assert.ok(Generator.occasionsFor({ age: 30 }).some((o) => o.id === 'work'));
});

test('niente capi di formalità lontanissime insieme (tuta con mocassini o blazer)', () => {
  const mixed = [...wardrobe, item('hoodie', 'top', ['sport'], '#7a7d82')];
  const sportOnly = (x) => x.styles.every((st) => st === 'sport');
  const formalOnly = (x) => x.styles.every((st) => st === 'smart' || st === 'elegant');
  let prev = [];
  for (let i = 0; i < 400; i++) {
    const res = Generator.generate(mixed, { occasionId: 'pizza', weatherId: 'mild', profile, recentIds: prev });
    assert.ok(!(res.items.some(sportOnly) && res.items.some(formalOnly)), res.items.map((x) => x.id).join(','));
    prev = res.items.map((x) => x.id);
  }
});

test('«Un altro» non ripropone lo stesso outfit', () => {
  let prev = run('pizza').items.map((x) => x.id);
  for (let i = 0; i < 40; i++) {
    const next = Generator.generate(wardrobe, { occasionId: 'pizza', weatherId: 'mild', profile, recentIds: prev, avoidIds: prev }).items.map((x) => x.id);
    assert.notDeepEqual([...next].sort(), [...prev].sort());
    prev = next;
  }
});

test('outfit vari: richieste ripetute danno più combinazioni', () => {
  const seen = new Set();
  let recent = [];
  for (let i = 0; i < 20; i++) {
    const ids = Generator.generate(wardrobe, { occasionId: 'weekend', weatherId: 'mild', profile, recentIds: recent }).items.map((x) => x.id);
    seen.add([...ids].sort().join('|'));
    recent = [...ids, ...recent].slice(0, 12);
  }
  assert.ok(seen.size >= 3, `solo ${seen.size} combinazioni`);
});
