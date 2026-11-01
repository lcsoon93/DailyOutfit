// Strumenti comuni dell'interfaccia: creazione di elementi, finestre
// sovrapposte (con il tasto "indietro" di Android), avvisi e conferme.
const UI = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children)) if (c != null && c !== false) e.append(c);
    return e;
  }

  // Pila delle finestre aperte: "indietro" chiude sempre quella in cima.
  const stack = [];
  function open(dlg, { onBack } = {}) {
    if (!dlg.open) dlg.showModal();
    stack.push({ dlg, onBack });
  }
  function close(dlg) {
    const i = stack.findIndex((e) => e.dlg === dlg);
    if (i >= 0) stack.splice(i, 1);
    if (dlg.open) dlg.close();
  }
  function back() {
    const top = stack[stack.length - 1];
    if (!top) return false;
    if (top.onBack) top.onBack();
    else close(top.dlg);
    return true;
  }
  // il tasto Esc (o il gesto indietro nel browser) passa dalla stessa logica
  document.addEventListener('cancel', (e) => {
    if (e.target.tagName === 'DIALOG') {
      e.preventDefault();
      back();
    }
  }, true);
  // tocco sullo sfondo scuro, fuori da un pannello dal basso: chiude
  document.addEventListener('click', (e) => {
    const d = e.target;
    if (d.tagName !== 'DIALOG' || !d.classList.contains('sheet') || !stack.length || stack[stack.length - 1].dlg !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) back();
  });

  // avvisi e attesa vanno sopra la finestra aperta (le finestre modali
  // stanno in un livello superiore al resto della pagina)
  function host(node) {
    const top = stack.length ? stack[stack.length - 1].dlg : document.body;
    if (node.parentNode !== top) top.append(node);
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    host(t);
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // Conferma con il nostro stile (sostituisce window.confirm).
  function ask({ title, message = '', ok = 'Conferma', cancel = 'Annulla', danger = false }) {
    const dlg = $('#ask');
    $('#ask-title').textContent = title;
    $('#ask-message').textContent = message;
    const okBtn = $('#ask-ok'), cancelBtn = $('#ask-cancel');
    okBtn.textContent = ok;
    cancelBtn.textContent = cancel;
    okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    return new Promise((resolve) => {
      const done = (v) => {
        okBtn.onclick = cancelBtn.onclick = null;
        close(dlg);
        resolve(v);
      };
      okBtn.onclick = () => done(true);
      cancelBtn.onclick = () => done(false);
      open(dlg, { onBack: () => done(false) });
    });
  }

  // Schermata di attesa per le operazioni lunghe (elaborazione delle foto).
  let busyCount = 0;
  function busy(on, text = 'Un momento…') {
    busyCount = Math.max(0, busyCount + (on ? 1 : -1));
    if (on) {
      host($('#busy'));
      $('#busy-text').textContent = text;
    }
    $('#busy').classList.toggle('show', busyCount > 0);
  }

  return { $, el, open, close, back, toast, ask, busy, get depth() { return stack.length; } };
})();
