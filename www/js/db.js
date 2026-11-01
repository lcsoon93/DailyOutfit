// Piccolo wrapper su IndexedDB: i capi (con foto) e gli outfit salvati
// restano nel browser dell'utente.
const DB = (() => {
  const NAME = 'dailyoutfit';
  const VERSION = 1;
  let dbPromise;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(NAME, VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('favorites')) db.createObjectStore('favorites', { keyPath: 'id' });
        };
        req.onsuccess = () => {
          const db = req.result;
          // un'altra scheda aggiorna il database: chiudi e riapri alla prossima richiesta
          db.onversionchange = () => { db.close(); dbPromise = null; };
          resolve(db);
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('database bloccato da un\'altra scheda aperta'));
      });
      // un'apertura fallita non deve restare memorizzata: si riprova la volta dopo
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  }

  // Esegue fn su uno o più archivi in una sola transazione: o va tutto a buon
  // fine, o non cambia niente.
  async function tx(stores, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      let result;
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('operazione annullata'));
      try {
        result = fn(Array.isArray(stores) ? stores.map((s) => t.objectStore(s)) : t.objectStore(stores));
      } catch (err) {
        // un errore immediato (es. un record senza chiave) annulla anche ciò che era già partito
        t.abort();
        reject(err);
      }
    });
  }

  return {
    all: (store) => tx(store, 'readonly', (s) => s.getAll()),
    put: (store, value) => tx(store, 'readwrite', (s) => s.put(value)),
    remove: (store, id) => tx(store, 'readwrite', (s) => s.delete(id)),
    clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
    // sostituisce armadio e preferiti in un colpo solo (ripristino, cancellazione)
    replaceAll: (items, favorites) => tx(['items', 'favorites'], 'readwrite', ([is, fs]) => {
      is.clear();
      fs.clear();
      items.forEach((i) => is.put(i));
      favorites.forEach((f) => fs.put(f));
    }),
  };
})();

// Profilo e preferenze leggere stanno in localStorage.
const Store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('dailyoutfit.' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('dailyoutfit.' + key, JSON.stringify(value));
    } catch { /* storage non disponibile */ }
  },
};
