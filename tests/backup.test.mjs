import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const { Backup } = loadApp(['data.js', 'backup.js']);
const img = 'data:image/jpeg;base64,AAAA';
// gli oggetti creati nel contesto isolato hanno prototipi diversi: si confrontano i valori
const plain = (v) => JSON.parse(JSON.stringify(v));
const good = (over = {}) => ({ id: 'a1', category: 'top', image: img, styles: ['casual'], seasons: ['summer'], color: '#ffffff', ...over });

test('un backup valido viene accettato e ripulito', () => {
  const res = Backup.validate({
    app: 'dailyoutfit',
    items: [good(), good({ id: 'b2', styles: ['inventato'], color: 'rosso' })],
    favorites: [{ id: 'f1', itemIds: ['a1', 'sparito'] }, { id: 'f2', itemIds: ['sparito'] }],
    profile: { sex: 'M', age: '41' },
  });
  assert.equal(res.items.length, 2);
  assert.deepEqual(plain(res.items[1].styles), ['casual']);
  assert.equal(res.items[1].color, '#8c8c8c');
  assert.deepEqual(plain(res.favorites.map((f) => f.itemIds)), [['a1']]);
  assert.deepEqual(plain(res.profile), { sex: 'M', age: 41 });
});

test('accetta anche i backup delle versioni precedenti (senza campo app)', () => {
  assert.equal(Backup.validate({ version: 1, items: [good()] }).items.length, 1);
});

test('un capo senza identificativo blocca tutto il ripristino', () => {
  assert.throws(() => Backup.validate({ items: [good(), good({ id: undefined })] }), /capo n. 2/);
});

test('identificativi doppi, categorie sconosciute e foto mancanti vengono rifiutati', () => {
  assert.throws(() => Backup.validate({ items: [good(), good()] }), /doppio/);
  assert.throws(() => Backup.validate({ items: [good({ category: 'cappelli' })] }), /categoria/);
  assert.throws(() => Backup.validate({ items: [good({ image: 'http://x/y.png' })] }), /foto/);
});

test('file che non sono backup di DailyOutfit', () => {
  assert.throws(() => Backup.validate({}), /non è un backup/);
  assert.throws(() => Backup.validate({ app: 'altro', items: [] }), /altra app/);
});
