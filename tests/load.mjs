// Carica i moduli dell'app (script classici) in un contesto isolato di Node.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function loadApp(files) {
  const ctx = vm.createContext({ console });
  const code = files.map((f) => readFileSync(new URL(`../www/js/${f}`, import.meta.url), 'utf8')).join('\n;\n');
  // le dichiarazioni const di primo livello non diventano proprietà del contesto: le esportiamo noi
  vm.runInContext(`${code}\n;globalThis.__app = { CATEGORIES: typeof CATEGORIES !== 'undefined' ? CATEGORIES : null, STYLES: typeof STYLES !== 'undefined' ? STYLES : null, SEASONS: typeof SEASONS !== 'undefined' ? SEASONS : null, WEATHER: typeof WEATHER !== 'undefined' ? WEATHER : null, OCCASIONS: typeof OCCASIONS !== 'undefined' ? OCCASIONS : null, Colors: typeof Colors !== 'undefined' ? Colors : null, Generator: typeof Generator !== 'undefined' ? Generator : null, Backup: typeof Backup !== 'undefined' ? Backup : null, Segment: typeof Segment !== 'undefined' ? Segment : null };`, ctx);
  return ctx.__app;
}
