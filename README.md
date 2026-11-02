# DailyOutfit

Fotografa i tuoi vestiti e ricevi l'outfit giusto per ogni occasione: scuola, lavoro, cerimonia, pizza con amici, appuntamento, festa, sport, tempo libero.

App web, Android e iOS (Capacitor). Funziona interamente sul dispositivo: **nessun account, nessun server, nessuna intelligenza artificiale**, funziona anche offline.

## Funzioni

- **Armadio**: si aggiungono i capi con la fotocamera o dalla galleria. Lo sfondo viene tolto in automatico e il colore riconosciuto.
- **Scontorno senza AI** (`www/js/segment.js`, eseguito in un Web Worker per non bloccare l'interfaccia):
  - analizza i colori del bordo della foto, cioè lo sfondo, e lo fa "crescere" verso il centro fermandosi sui contorni del capo;
  - prova diverse ipotesi e tiene quella il cui contorno coincide meglio con i bordi reali;
  - se lo sfondo è difficile (tovaglia a fantasia, colori simili al capo) fa una seconda prova confrontando i colori del centro con quelli dei bordi;
  - se il risultato è incerto, lo segnala.
- **Editor dello scontorno** (`www/js/editor.js`): riquadro (si inquadra il capo e il resto sparisce, anche su sfondi a fantasia), bacchetta magica, gomma, pennello «ripristina», zoom con due dita e annulla.
- **Ritocco**: schiarisce le foto scure e corregge la dominante gialla usando lo sfondo come riferimento neutro.
- **Outfit** (`www/js/generator.js`):
  - regole su occasione, stile, stagione, meteo, armonia dei colori, età e sesso;
  - coerenza di formalità tra i capi (niente tuta con mocassini);
  - molte combinazioni valutate, scelta casuale pesata tra le migliori, mai lo stesso outfit due volte di fila;
  - consigli pratici.
- **Collage** (`www/js/render.js`): tavola 1080×1350 in stile rivista, da salvare o condividere.
- **Preferiti, profilo, backup** in un file JSON, e un **armadio di esempio** per provare subito.

## Struttura

```
www/                  l'app (è anche il sito web)
  index.html          interfaccia
  css/app.css         stile (chiaro/scuro automatico)
  js/segment.js       calcolo dello scontorno (anche nel Web Worker segment-worker.js)
  js/imaging.js       foto, scontorno, ritocco, ritaglio
  js/editor.js        editor dello scontorno
  js/generator.js     motore degli outfit
  js/render.js        collage
  js/app.js           schermate e logica
  js/demo.js          capi di esempio (vettoriali)
  privacy.html        informativa sulla privacy
android/              progetto Android (Capacitor 8)
ios/                  progetto iOS (Capacitor 8, iOS 16+)
store/                materiale per la scheda del Play Store
design/, assets/      sorgenti di icona e splash
```

## Sviluppo

```sh
npm install
npm run serve          # http://localhost:8080
npm test               # test automatici (generatore, backup, scontorno)
npx cap sync android   # copia www/ nel progetto Android
npx cap open android   # apre Android Studio
```

## Pubblicazione

Tutti i passaggi sono in **[DEPLOY.md](DEPLOY.md)**:

- versione web;
- Android: chiave di firma, build dell'AAB, Play Console, test chiuso, produzione;
- iOS: certificato, profilo e TestFlight, senza bisogno di un Mac. I testi e la grafica per lo store sono in **[store/](store/listing-it.md)**.
