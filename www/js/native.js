// Ponte verso le funzioni del telefono quando l'app gira dentro Android
// (Capacitor): condivisione di file e tasto "indietro". Nel browser usa le
// alternative web (Web Share API o download).
const Native = (() => {
  const cap = window.Capacitor;
  const isNative = Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  const plugin = (name) => (isNative && cap.Plugins ? cap.Plugins[name] : null);

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  function download(blob, fileName) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // Condivide (o salva) un file. Restituisce false se l'utente annulla.
  async function shareFile(blob, fileName, title) {
    const fs = plugin('Filesystem'), share = plugin('Share');
    if (fs && share) {
      const { uri } = await fs.writeFile({ path: fileName, data: await blobToBase64(blob), directory: 'CACHE' });
      try {
        await share.share({ title, dialogTitle: title, files: [uri] });
      } catch (err) {
        if (/cancel/i.test(String(err && err.message))) return false;
        throw err;
      }
      return true;
    }
    const file = new File([blob], fileName, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
        return true;
      } catch (err) {
        if (err && err.name === 'AbortError') return false;
      }
    }
    download(blob, fileName);
    return true;
  }

  function onBackButton(handler) {
    const app = plugin('App');
    if (app) app.addListener('backButton', handler);
  }

  function exitApp() {
    const app = plugin('App');
    if (app) app.exitApp();
  }

  return { isNative, shareFile, download, onBackButton, exitApp };
})();
