// Cataloghi: categorie dei capi, stili, stagioni, occasioni, meteo.
const CATEGORIES = [
  { id: 'top', label: 'Maglia / Camicia / T-shirt' },
  { id: 'bottom', label: 'Pantaloni / Gonna / Shorts' },
  { id: 'onepiece', label: 'Vestito / Tuta intera' },
  { id: 'layer', label: 'Maglione / Felpa / Cardigan' },
  { id: 'outerwear', label: 'Giacca / Blazer / Cappotto' },
  { id: 'shoes', label: 'Scarpe' },
  { id: 'accessory', label: 'Accessorio' },
];

const STYLES = [
  { id: 'sport', label: 'Sportivo' },
  { id: 'casual', label: 'Casual' },
  { id: 'smart', label: 'Smart / Ufficio' },
  { id: 'elegant', label: 'Elegante' },
];

const SEASONS = [
  { id: 'summer', label: 'Estate' },
  { id: 'mid', label: 'Mezza stagione' },
  { id: 'winter', label: 'Inverno' },
];

const WEATHER = [
  { id: 'hot', label: '☀️ Caldo', season: 'summer', layers: 0, outerwear: false },
  { id: 'mild', label: '⛅ Mite', season: 'mid', layers: 0, outerwear: 'optional' },
  { id: 'cold', label: '❄️ Freddo', season: 'winter', layers: 1, outerwear: true },
];

// Per ogni occasione: quanto è adatto ciascuno stile (0 = escluso).
const OCCASIONS = [
  {
    id: 'school', label: '🎒 Scuola / Università',
    styles: { sport: 2, casual: 3, smart: 1, elegant: 0 },
    tip: 'Comodità prima di tutto: scegli capi in cui stai bene seduto per ore.',
  },
  {
    id: 'work', label: '💼 Lavoro',
    styles: { sport: 0, casual: 1, smart: 3, elegant: 2 },
    preferOuterwear: true,
    tip: 'Linee pulite e colori sobri: un capo strutturato fa subito la differenza.',
  },
  {
    id: 'ceremony', label: '💍 Cerimonia',
    styles: { sport: 0, casual: 0, smart: 1, elegant: 3 },
    requireOuterwear: { M: true },
    preferOnepiece: { F: true },
    tip: 'Meglio un capo in più che uno in meno: in cerimonia la sobrietà vince.',
  },
  {
    id: 'pizza', label: '🍕 Pizza con amici',
    styles: { sport: 1, casual: 3, smart: 2, elegant: 0 },
    tip: 'Rilassato ma curato: un tocco di colore va benissimo.',
  },
  {
    id: 'date', label: '❤️ Appuntamento',
    styles: { sport: 0, casual: 2, smart: 3, elegant: 2 },
    tip: 'Punta su un capo che ti fa sentire sicuro di te.',
  },
  {
    id: 'party', label: '🎉 Festa / Serata',
    styles: { sport: 0, casual: 1, smart: 2, elegant: 3 },
    tip: 'La sera puoi osare di più con colori e accessori.',
  },
  {
    id: 'sport', label: '🏃 Sport / Palestra',
    styles: { sport: 3, casual: 0, smart: 0, elegant: 0 },
    noAccessory: true,
    tip: 'Tessuti tecnici e scarpe adatte all\'attività.',
  },
  {
    id: 'weekend', label: '🛍️ Tempo libero',
    styles: { sport: 2, casual: 3, smart: 1, elegant: 0 },
    tip: 'Giornata libera: comodo e con personalità.',
  },
];

const labelOf = (list, id) => (list.find((x) => x.id === id) || {}).label || id;
