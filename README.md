# DailyOutfit

Fotografa i tuoi vestiti e ricevi l'outfit giusto per ogni occasione: scuola, lavoro, cerimonia, pizza con amici, appuntamento, festa, sport, tempo libero.

App web e Android (Capacitor). Funziona interamente sul dispositivo: **nessun account, nessun server, nessuna intelligenza artificiale**, funziona anche offline.

## Funzioni

- **Armadio**: si aggiungono i capi con la fotocamera o dalla galleria. Lo sfondo viene tolto in automatico e il colore riconosciuto.
- **Scontorno senza AI** (`www/js/imaging.js`):
  - analizza i colori del bordo della foto, cioè lo sfondo, e lo fa "crescere" verso il centro fermandosi sui contorni del capo;
  - prova diverse ipotesi e tiene quella il cui contorno coincide meglio con i bordi reali;
  - se il risultato è incerto, lo segnala.
- **Editor dello scontorno** (`www/js/editor.js`): bacchetta magica, gomma, pennello «ripristina», zoom con due dita e annulla.
- **Ritocco**: schiarisce le foto scure e corregge la dominante gialla usando lo sfondo come riferimento neutro.
- **Outfit** (`www/js/generator.js`):
  - regole su occasione, stile, stagione, meteo, armonia dei colori, età e sesso;
  - molte combinazioni valutate, scelta tra le migliori;
  - consigli pratici.
- **Collage** (`www/js/render.js`): tavola 1080×1350 in stile rivista, da salvare o condividere.
- **Preferiti, profilo, backup** in un file JSON, e un **armadio di esempio** per provare subito.

## Struttura

```
www/                  l'app (è anche il sito web)
  index.html          interfaccia
  css/app.css         stile (chiaro/scuro automatico)
  js/imaging.js       scontorno, ritocco, ritaglio
  js/editor.js        editor dello scontorno
  js/generator.js     motore degli outfit
  js/render.js        collage
  js/app.js           schermate e logica
  js/demo.js          capi di esempio (vettoriali)
  privacy.html        informativa sulla privacy
android/              progetto Android (Capacitor 8)
store/                materiale per la scheda del Play Store
design/, assets/      sorgenti di icona e splash
```

## Sviluppo

```sh
npm install
npm run serve          # http://localhost:8080
npx cap sync android   # copia www/ nel progetto Android
npx cap open android   # apre Android Studio
```

## Pubblicazione

Tutti i passaggi (versione web, chiave di firma, build dell'AAB, Play Console, test chiuso, produzione) sono in **[DEPLOY.md](DEPLOY.md)**. I testi e la grafica per lo store sono in **[store/](store/listing-it.md)**.
