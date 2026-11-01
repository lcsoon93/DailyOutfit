// Armadio di esempio: capi disegnati in vettoriale per provare subito l'app
// (e per chi la valuta) senza dover fotografare nulla.
const Demo = (() => {
  function mix(hex, to, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const t = to === 'white' ? 255 : 0;
    return '#' + c.map((v) => Math.round(v + (t - v) * f).toString(16).padStart(2, '0')).join('');
  }
  const tones = (base) => ({
    base,
    dark: mix(base, 'black', 0.12),
    darker: mix(base, 'black', 0.28),
    light: mix(base, 'white', 0.35),
  });

  const sideShade = (c, l, r, top, bottom) =>
    `<path d="M${l} ${top} L${l + 22} ${top + 4} L${l + 20} ${bottom} L${l} ${bottom} Z" fill="${c.dark}" opacity=".55"/>` +
    `<path d="M${r} ${top} L${r - 22} ${top + 4} L${r - 20} ${bottom} L${r} ${bottom} Z" fill="${c.dark}" opacity=".55"/>`;

  const trousersShape = 'M112 40 L288 40 L298 92 L322 452 L232 458 L206 168 L194 168 L168 458 L78 452 L102 92 Z';
  const longSleeveBody = 'M150 50 L250 50 L304 70 L346 128 L376 330 L340 338 L314 196 L302 176 L302 440 L98 440 L98 176 L86 196 L60 338 L24 330 L54 128 L96 70 Z';
  const knitBody = 'M140 56 C160 80 240 80 260 56 L310 72 L350 130 L376 360 L338 368 L316 200 L308 186 L308 420 L92 420 L92 186 L84 200 L62 368 L24 360 L50 130 L90 72 Z';

  function shoe(c, sole, accent) {
    return `<path d="M40 300 C38 250 60 214 104 206 L150 204 C176 222 206 244 250 256 C310 270 352 278 362 300 L364 318 L40 318 Z" fill="${c.base}" stroke="${c.darker}" stroke-width="2"/>` +
      `<path d="M300 268 C330 274 356 284 362 300 L364 318 L330 318 C330 300 318 284 300 268 Z" fill="${c.dark}"/>` +
      `<path d="M40 300 C38 270 44 244 58 228 L76 232 C66 252 64 278 66 314 L40 318 Z" fill="${accent}"/>` +
      `<path d="M120 292 C170 282 220 282 272 292" stroke="${c.dark}" stroke-width="7" fill="none" stroke-linecap="round"/>` +
      [150, 172, 194, 216].map((x, i) => `<circle cx="${x}" cy="${214 + i * 12}" r="3.5" fill="${c.darker}"/>`).join('') +
      `<path d="M150 214 L194 238 M172 226 L216 250" stroke="${c.darker}" stroke-width="2.5" stroke-linecap="round"/>` +
      `<path d="M34 314 L368 314 C370 332 360 340 344 340 L50 340 C38 340 32 330 34 314 Z" fill="${sole}"/>` +
      `<path d="M38 326 L364 326" stroke="${mix(sole, 'black', 0.2)}" stroke-width="2"/>`;
  }

  function loafer(c) {
    return `<path d="M44 300 C42 266 60 246 96 240 L170 236 C200 238 236 252 268 264 C318 278 350 286 360 302 L362 316 L44 316 Z" fill="${c.base}" stroke="${c.darker}" stroke-width="2"/>` +
      `<path d="M190 246 C220 250 250 262 268 270 L262 284 C240 274 214 266 186 262 Z" fill="${c.dark}"/>` +
      `<path d="M100 252 C150 248 210 250 262 276" stroke="${c.light}" stroke-width="2" stroke-dasharray="5 5" fill="none" opacity=".7"/>` +
      `<path d="M300 276 C330 282 352 290 358 302" stroke="${c.light}" stroke-width="5" fill="none" opacity=".25" stroke-linecap="round"/>` +
      `<path d="M40 312 L366 312 C368 326 360 334 346 334 L52 334 C42 334 38 326 40 312 Z" fill="#3a2418"/>`;
  }

  const DRAW = {
    tshirt: (c) =>
      `<path d="M148 52 C166 74 234 74 252 52 L312 72 L372 150 L322 186 L294 160 L294 432 C230 440 170 440 106 432 L106 160 L78 186 L28 150 L88 72 Z" fill="${c.base}" stroke="${c.dark}" stroke-width="2"/>` +
      sideShade(c, 106, 294, 160, 432) +
      `<path d="M148 52 C166 74 234 74 252 52 L244 48 C228 64 172 64 156 48 Z" fill="${c.dark}"/>` +
      `<path d="M330 178 L368 152 M70 178 L32 152" stroke="${c.darker}" stroke-width="2" stroke-dasharray="4 4"/>` +
      `<path d="M150 250 C180 270 220 268 250 250 M170 330 C200 346 240 340 262 320" stroke="${c.dark}" stroke-width="6" fill="none" opacity=".45" stroke-linecap="round"/>` +
      `<path d="M110 420 C170 428 230 428 290 420" stroke="${c.darker}" stroke-width="2" stroke-dasharray="4 5" fill="none"/>`,
    shirt: (c) =>
      `<path d="${longSleeveBody}" fill="${c.base}" stroke="${c.dark}" stroke-width="2"/>` +
      sideShade(c, 98, 302, 176, 440) +
      `<path d="M24 330 L60 338 L57 360 L21 352 Z M376 330 L340 338 L343 360 L379 352 Z" fill="${c.dark}"/>` +
      `<path d="M156 46 L244 46 L250 50 L200 94 L150 50 Z" fill="${c.dark}"/>` +
      `<path d="M150 50 L200 94 L176 114 L134 62 Z M250 50 L200 94 L224 114 L266 62 Z" fill="${c.light}" stroke="${c.dark}" stroke-width="2"/>` +
      `<path d="M200 94 L200 440 M212 100 L212 440" stroke="${c.darker}" stroke-width="2" opacity=".6"/>` +
      [140, 190, 240, 290, 340, 390].map((y) => `<circle cx="206" cy="${y}" r="5" fill="${c.light}" stroke="${c.darker}" stroke-width="1.5"/>`).join('') +
      `<path d="M238 150 L284 150 L284 196 Q261 206 238 196 Z" fill="none" stroke="${c.darker}" stroke-width="2" opacity=".7"/>`,
    sweater: (c) =>
      `<path d="${knitBody}" fill="${c.base}" stroke="${c.dark}" stroke-width="2"/>` +
      sideShade(c, 92, 308, 186, 420) +
      `<path d="M140 56 C160 80 240 80 260 56 L252 50 C234 70 166 70 148 50 Z" fill="${c.dark}"/>` +
      `<path d="M92 420 L308 420 L308 448 L92 448 Z M24 360 L62 368 L58 394 L20 386 Z M376 360 L338 368 L342 394 L380 386 Z" fill="${c.dark}"/>` +
      Array.from({ length: 27 }, (_, i) => `<path d="M${96 + i * 8} 422 L${96 + i * 8} 446" stroke="${c.darker}" stroke-width="2" opacity=".35"/>`).join('') +
      `<path d="M150 120 L150 400 M200 96 L200 410 M250 120 L250 400" stroke="${c.light}" stroke-width="10" opacity=".18"/>`,
    hoodie: (c) =>
      `<path d="M138 74 C126 18 274 18 262 74 C252 104 148 104 138 74 Z" fill="${c.dark}"/>` +
      `<path d="${knitBody}" fill="${c.base}" stroke="${c.dark}" stroke-width="2"/>` +
      sideShade(c, 92, 308, 186, 420) +
      `<path d="M150 60 C166 100 234 100 250 60 C238 86 162 86 150 60 Z" fill="${c.darker}"/>` +
      `<path d="M186 90 L182 168 M214 90 L218 168" stroke="${c.light}" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M140 300 L260 300 L284 384 L116 384 Z" fill="none" stroke="${c.darker}" stroke-width="2.5"/>` +
      `<path d="M92 420 L308 420 L308 448 L92 448 Z M24 360 L62 368 L58 394 L20 386 Z M376 360 L338 368 L342 394 L380 386 Z" fill="${c.dark}"/>`,
    jeans: (c) => {
      const stitch = '#d39a4a';
      return `<path d="${trousersShape}" fill="${c.base}" stroke="${c.dark}" stroke-width="2"/>` +
        `<ellipse cx="150" cy="210" rx="24" ry="80" fill="${c.light}" opacity=".22"/><ellipse cx="250" cy="210" rx="24" ry="80" fill="${c.light}" opacity=".22"/>` +
        `<path d="M112 40 L288 40 L291 64 L109 64 Z" fill="${c.dark}"/>` +
        [128, 196, 264].map((x) => `<path d="M${x} 36 h10 v32 h-10 Z" fill="${c.darker}"/>`).join('') +
        `<path d="M200 64 L200 150 C200 166 212 170 224 160" stroke="${stitch}" stroke-width="2" fill="none" stroke-dasharray="4 3"/>` +
        `<path d="M112 70 C128 108 150 112 170 70 M288 70 C272 108 250 112 230 70" stroke="${stitch}" stroke-width="2" fill="none" stroke-dasharray="4 3"/>` +
        `<path d="M102 96 L80 446 M298 96 L320 446" stroke="${stitch}" stroke-width="2" stroke-dasharray="4 3"/>` +
        `<path d="M82 440 L166 446 M318 440 L234 446" stroke="${c.darker}" stroke-width="5"/>`;
    },
    chinos: (c) =>
      `<path d="${trousersShape}" fill="${c.base}" stroke="${c.dark}" stroke-width="2"/>` +
      `<path d="M112 40 L288 40 L291 64 L109 64 Z" fill="${c.dark}"/>` +
      [128, 196, 264].map((x) => `<path d="M${x} 38 h9 v28 h-9 Z" fill="${c.darker}"/>`).join('') +
      `<path d="M200 64 L200 140" stroke="${c.darker}" stroke-width="2"/>` +
      `<path d="M114 72 L150 120 M286 72 L250 120" stroke="${c.darker}" stroke-width="2"/>` +
      `<path d="M150 120 L126 446 M250 120 L274 446" stroke="${c.dark}" stroke-width="3" opacity=".7"/>`,
    trousers: (c) =>
      `<path d="${trousersShape}" fill="${c.base}" stroke="${c.light}" stroke-width="1.5" stroke-opacity=".4"/>` +
      `<path d="M112 40 L288 40 L291 62 L109 62 Z" fill="${c.dark}"/>` +
      `<path d="M150 70 L126 446 M250 70 L274 446" stroke="${c.light}" stroke-width="2.5" opacity=".35"/>` +
      `<path d="M200 62 L200 140" stroke="${c.light}" stroke-width="2" opacity=".3"/>`,
    joggers: (c) =>
      `<path d="M112 44 L288 44 L300 100 L304 420 L236 424 L206 172 L194 172 L164 424 L96 420 L100 100 Z" fill="${c.base}" stroke="${c.dark}" stroke-width="2"/>` +
      `<path d="M96 420 L164 424 L162 454 L98 450 Z M304 420 L236 424 L238 454 L302 450 Z" fill="${c.dark}"/>` +
      `<path d="M112 44 L288 44 L290 76 L110 76 Z" fill="${c.dark}"/>` +
      `<path d="M190 76 L182 124 M210 76 L218 124" stroke="${c.light}" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M104 104 L100 416 M296 104 L300 416" stroke="${c.light}" stroke-width="7" opacity=".55"/>`,
    blazer: (c) =>
      `<path d="M142 44 L258 44 L318 66 L352 124 L374 360 L338 366 L318 206 L314 196 L314 432 L86 432 L86 196 L82 206 L62 366 L26 360 L48 124 L82 66 Z" fill="${c.base}" stroke="${c.darker}" stroke-width="2"/>` +
      `<path d="M158 46 L242 46 L200 196 Z" fill="#eef0f2"/>` +
      `<path d="M142 44 L200 196 L176 150 L150 112 L160 92 L128 64 Z M258 44 L200 196 L224 150 L250 112 L240 92 L272 64 Z" fill="${c.dark}" stroke="${c.darker}" stroke-width="1.5"/>` +
      `<path d="M200 196 L200 432" stroke="${c.darker}" stroke-width="2"/>` +
      `<circle cx="206" cy="252" r="6" fill="${c.darker}"/><circle cx="206" cy="304" r="6" fill="${c.darker}"/>` +
      `<path d="M106 312 L170 312 L170 324 L106 324 Z M230 312 L294 312 L294 324 L230 324 Z M236 166 L282 166 L282 174 L236 174 Z" fill="${c.dark}"/>` +
      sideShade(c, 86, 314, 196, 432),
    coat: (c) =>
      `<path d="M140 40 L260 40 L322 62 L356 120 L380 380 L344 386 L322 210 L320 200 L330 466 L70 466 L80 200 L78 210 L56 386 L20 380 L44 120 L78 62 Z" fill="${c.base}" stroke="${c.darker}" stroke-width="2"/>` +
      `<path d="M150 42 L250 42 L200 150 Z" fill="#7d7a76"/>` +
      `<path d="M140 40 L200 200 L174 160 L132 110 L146 88 L118 60 Z M260 40 L200 200 L226 160 L268 110 L254 88 L282 60 Z" fill="${c.dark}" stroke="${c.darker}" stroke-width="1.5"/>` +
      [[176, 250], [224, 250], [176, 366], [224, 366]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="${c.darker}"/>`).join('') +
      `<path d="M80 300 L320 300 L321 326 L79 326 Z" fill="${c.dark}"/>` +
      `<path d="M186 296 h28 v34 h-28 Z" fill="none" stroke="${c.light}" stroke-width="3"/>` +
      `<path d="M100 380 L150 372 M250 372 L300 380" stroke="${c.darker}" stroke-width="3"/>` +
      sideShade(c, 80, 320, 200, 460),
    sneakers: (c) =>
      `<g transform="translate(14 -52) scale(.96)" opacity=".92">${shoe(tones(mix(c.base, 'black', 0.06)), '#d4cfc6', '#2f5d50')}</g>` +
      shoe(c, '#dcd7cf', '#2f5d50'),
    loafers: (c) =>
      `<g transform="translate(16 -48) scale(.96)">${loafer(tones(mix(c.base, 'black', 0.1)))}</g>` + loafer(c),
    bag: (c) =>
      `<path d="M138 190 C138 92 262 92 262 190" stroke="${c.darker}" stroke-width="16" fill="none" stroke-linecap="round"/>` +
      `<path d="M138 190 C138 96 262 96 262 190" stroke="${c.base}" stroke-width="8" fill="none" stroke-linecap="round"/>` +
      `<path d="M86 186 L314 186 L336 430 C336 440 328 446 318 446 L82 446 C72 446 64 440 64 430 Z" fill="${c.base}" stroke="${c.darker}" stroke-width="2"/>` +
      `<path d="M86 186 L314 186 L316 214 L84 214 Z" fill="${c.dark}"/>` +
      `<path d="M92 206 L308 206 M78 420 L322 420" stroke="${c.light}" stroke-width="2" stroke-dasharray="5 5" opacity=".8"/>` +
      `<path d="M188 214 h24 v28 h-24 Z" fill="#d4b26a" stroke="#9c7c3a" stroke-width="2"/>` +
      `<path d="M64 430 L86 186 L106 186 L92 446 Z M336 430 L314 186 L294 186 L308 446 Z" fill="${c.dark}" opacity=".5"/>`,
    dress: (c) =>
      `<path d="M162 40 L171 40 L179 98 L170 100 Z M238 40 L229 40 L221 98 L230 100 Z" fill="${c.base}"/>` +
      `<path d="M160 96 C180 112 220 112 240 96 L250 150 L244 196 L156 196 L150 150 Z" fill="${c.base}" stroke="${c.light}" stroke-width="1.5" stroke-opacity=".25"/>` +
      `<path d="M156 196 L244 196 L332 452 C262 468 138 468 68 452 Z" fill="${c.base}" stroke="${c.light}" stroke-width="1.5" stroke-opacity=".25"/>` +
      `<path d="M156 196 L244 196 L245 212 L155 212 Z" fill="${c.dark}"/>` +
      `<path d="M200 214 L196 458 M178 214 L136 454 M222 214 L264 454" stroke="${c.light}" stroke-width="3" opacity=".12"/>` +
      `<path d="M170 104 C190 114 210 114 230 104" stroke="${c.light}" stroke-width="2" fill="none" opacity=".3"/>`,
  };

  const ITEMS = [
    { key: 'tshirt', name: 'T-shirt bianca', category: 'top', styles: ['casual', 'sport'], seasons: ['summer', 'mid'], color: '#F3F1ED' },
    { key: 'shirt', name: 'Camicia azzurra', category: 'top', styles: ['smart', 'casual', 'elegant'], seasons: ['summer', 'mid', 'winter'], color: '#A8C3E0' },
    { key: 'sweater', name: 'Maglione grigio', category: 'layer', styles: ['casual', 'smart'], seasons: ['mid', 'winter'], color: '#9C9EA3' },
    { key: 'hoodie', name: 'Felpa salvia', category: 'layer', styles: ['sport', 'casual'], seasons: ['mid', 'winter'], color: '#6F7F6A' },
    { key: 'jeans', name: 'Jeans', category: 'bottom', styles: ['casual'], seasons: ['summer', 'mid', 'winter'], color: '#45668F' },
    { key: 'chinos', name: 'Chino beige', category: 'bottom', styles: ['casual', 'smart'], seasons: ['summer', 'mid'], color: '#CDB48D' },
    { key: 'trousers', name: 'Pantaloni neri', category: 'bottom', styles: ['smart', 'elegant'], seasons: ['summer', 'mid', 'winter'], color: '#2B2B30' },
    { key: 'joggers', name: 'Pantaloni tuta', category: 'bottom', styles: ['sport'], seasons: ['mid', 'winter'], color: '#6C7077' },
    { key: 'blazer', name: 'Blazer blu', category: 'outerwear', styles: ['smart', 'elegant'], seasons: ['mid', 'winter'], color: '#23314F' },
    { key: 'coat', name: 'Cappotto cammello', category: 'outerwear', styles: ['smart', 'elegant', 'casual'], seasons: ['winter'], color: '#B88956' },
    { key: 'sneakers', name: 'Sneakers bianche', category: 'shoes', styles: ['casual', 'sport', 'smart'], seasons: ['summer', 'mid', 'winter'], color: '#F5F4F1' },
    { key: 'loafers', name: 'Mocassini', category: 'shoes', styles: ['smart', 'elegant', 'casual'], seasons: ['summer', 'mid', 'winter'], color: '#7B4A2D' },
    { key: 'bag', name: 'Borsa cognac', category: 'accessory', styles: ['casual', 'smart', 'elegant'], seasons: ['summer', 'mid', 'winter'], color: '#A95F2E' },
    { key: 'dress', name: 'Abito nero', category: 'onepiece', styles: ['elegant', 'smart'], seasons: ['summer', 'mid', 'winter'], color: '#1E1E24', only: ['F', 'X'] },
  ];

  function svgOf(def) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480" width="800" height="960">${DRAW[def.key](tones(def.color))}</svg>`;
  }

  async function render(def) {
    const img = await Imaging.loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgOf(def)));
    const c = Imaging.makeCanvas(800, 960);
    c.getContext('2d').drawImage(img, 0, 0, 800, 960);
    return c.toDataURL('image/png');
  }

  // Crea i capi di esempio adatti al profilo (pronti da salvare).
  async function create(sex, uid) {
    const now = Date.now();
    const out = [];
    for (const [i, def] of ITEMS.entries()) {
      if (def.only && !def.only.includes(sex)) continue;
      const image = await render(def);
      const res = await Imaging.autoMask(image);
      const mask = res.mask.toDataURL('image/png');
      const cut = await Imaging.compose(image, res.mask, { enhance: false });
      out.push({
        id: uid(), name: def.name, category: def.category, styles: def.styles, seasons: def.seasons, color: def.color,
        image, mask, cutout: cut.dataUrl, enhance: false, cutoutConfidence: 1, demo: true, createdAt: now - i,
      });
    }
    return out;
  }

  return { create, svgOf, ITEMS };
})();
