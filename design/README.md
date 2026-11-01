# Grafica

Sorgenti vettoriali dell'icona dell'app.

- `icon.svg`: icona completa (Play Store, icone legacy, PWA).
- `icon-foreground.svg`: solo il simbolo, per l'icona adattiva di Android (lo sfondo è il colore `#B4532F`).

Le immagini PNG pronte sono in `assets/` (formato richiesto da `@capacitor/assets`), in `www/icons/` (versione web) e nelle cartelle `android/app/src/main/res/mipmap-*` e `drawable-*`.
Se modifichi l'icona, esporta di nuovo i PNG in `assets/` e rigenera le risorse Android con:

```sh
npx @capacitor/assets generate --android
```
