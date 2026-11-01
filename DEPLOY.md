# Pubblicazione: web e Google Play

Questa guida porta DailyOutfit dal repository al Play Store. I passaggi segnati con **(una volta)** si fanno solo la prima volta.

Riepilogo dei tempi: account sviluppatore e verifica (qualche giorno) → test chiuso obbligatorio di **14 giorni** con almeno **12 tester** → richiesta di accesso alla produzione (alcuni giorni di revisione) → pubblicazione.

---

## 0. Cosa c'è nel repository

| Cartella | Contenuto |
|---|---|
| `www/` | l'app vera e propria (HTML, CSS, JS, font, icone, `privacy.html`) |
| `android/` | progetto Android (Capacitor 8, target Android 16 / API 36) |
| `.github/workflows/android.yml` | build automatica di APK di prova e AAB per il Play Store |
| `.github/workflows/pages.yml` | pubblicazione della versione web su GitHub Pages |
| `store/` | icona 512, grafica in evidenza, screenshot e testi della scheda (`listing-it.md`) |
| `assets/`, `design/` | sorgenti di icona e splash |

L'identificativo dell'app è **`io.github.lcsoon93.dailyoutfit`**. Dopo il primo caricamento sul Play Store **non si può più cambiare**: se ne vuoi un altro, deciditi ora.

---

## 1. Prima di tutto: completa la privacy **(una volta)**

Apri `www/privacy.html` e sostituisci:

- `[NOME DELLO SVILUPPATORE]` con il tuo nome o quello della tua attività;
- `[EMAIL DI CONTATTO]` (due volte) con l'email che userai anche nella Play Console.

Il Play Store chiede un **link pubblico** a questa pagina (vedi punto 3).

---

## 2. Provare l'app

**Nel browser** (serve Node.js 22 o successivo):

```sh
npm run serve
# apri http://localhost:8080
```

**Sul telefono Android**: a ogni modifica su `main`, GitHub compila l'app da solo.

1. Su GitHub apri **Actions → Android** e scegli l'ultima esecuzione verde.
2. In fondo, sotto **Artifacts**, scarica `dailyoutfit-N` (è uno zip).
3. Dentro c'è `app-debug.apk`: copialo sul telefono e aprilo. Android chiederà di consentire l'installazione da quella app (file manager o browser).

L'APK di prova non serve per il Play Store, che vuole il file `.aab` (punto 5).

---

## 3. Pubblicare la versione web (serve per il link alla privacy)

Il repository è **pubblico** e GitHub Pages è già attivo in modalità **«Deploy from a branch»** (main, radice). Gli indirizzi attuali sono:

- app: `https://lcsoon93.github.io/DailyOutfit/` (la radice rimanda a `/www/`)
- privacy: `https://lcsoon93.github.io/DailyOutfit/www/privacy.html`, da usare nella Play Console

**Consigliato:** in **Settings → Pages → Build and deployment → Source** scegli **GitHub Actions**, poi lancia **Actions → Web → Run workflow**. Da quel momento viene pubblicata solo la cartella `www/`, a ogni modifica, e gli indirizzi diventano più puliti:

- app: `https://lcsoon93.github.io/DailyOutfit/`
- privacy: `https://lcsoon93.github.io/DailyOutfit/privacy.html`

Il workflow «Web» controlla da solo la modalità: finché resta «Deploy from a branch» non pubblica nulla e non va in errore.

**Se un giorno rendi privato il repository**, GitHub Pages smette di funzionare con l'account gratuito. Alternative gratuite:

- *Netlify*: trascina la cartella `www` su app.netlify.com/drop, oppure collega il repository con «Publish directory» `www` e nessun comando di build.
- *Cloudflare Pages*: collega il repository, «Build output directory» `www`, nessun comando di build.

In quel caso aggiorna nella Play Console il link alla privacy.

---

## 4. La chiave di caricamento **(una volta)**

Google firma l'app che arriva sui telefoni («Firma dell'app di Google Play»). Tu firmi solo i file che carichi, con una tua **chiave di caricamento**.

1. Crea la chiave. `keytool` è incluso in Java e in Android Studio; su Windows è in `C:\Program Files\Android\Android Studio\jbr\bin\`.

   ```sh
   keytool -genkeypair -v -keystore dailyoutfit-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   Scegli una password robusta. Alle domande su nome e organizzazione puoi rispondere come vuoi.

2. **Conserva il file `.jks` e la password in due posti sicuri**, per esempio un gestore di password e una copia offline. Non metterli mai nel repository: `.gitignore` li esclude già.

   Se la perdi non è una catastrofe: dalla Play Console si può chiedere a Google di reimpostarla. Ci vuole però qualche giorno.

3. Dai la chiave a GitHub, così la build automatica produce l'AAB già firmato. Vai su **Settings → Secrets and variables → Actions → New repository secret** e crea:

   | Nome | Valore |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | il file `.jks` convertito in testo (comando sotto) |
   | `ANDROID_KEYSTORE_PASSWORD` | la password della chiave |
   | `ANDROID_KEY_ALIAS` | `upload` |
   | `ANDROID_KEY_PASSWORD` | la password (la stessa, se non ne hai scelta una diversa) |

   Per convertire il file in testo:

   - macOS: `base64 -i dailyoutfit-upload.jks | pbcopy` (lo copia negli appunti)
   - Linux: `base64 -w0 dailyoutfit-upload.jks`
   - Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("dailyoutfit-upload.jks")) | Set-Clipboard`

Senza questi segreti la build funziona lo stesso, ma l'AAB non è firmato e il Play Store lo rifiuta. Nella pagina della build compare un avviso.

---

## 5. Ottenere l'AAB da caricare

**Strada consigliata, con GitHub Actions:**

1. Aggiorna il numero di versione in `package.json` (`"version": "1.0.0"` → `"1.0.1"` ecc.). È il nome della versione che vedono gli utenti.
2. Fai push su `main` oppure lancia **Actions → Android → Run workflow**.
3. Scarica l'artifact `dailyoutfit-N`: dentro c'è `app-release.aab`.

Il numero interno (`versionCode`) è il numero progressivo della build, quindi cresce sempre: è proprio quello che il Play Store richiede a ogni caricamento.

**In alternativa, sul tuo computer** (servono Node.js 22, JDK 21 e Android SDK, inclusi in Android Studio):

1. Crea `android/keystore.properties` (non va su git):

   ```properties
   storeFile=/percorso/assoluto/dailyoutfit-upload.jks
   storePassword=LA_TUA_PASSWORD
   keyAlias=upload
   keyPassword=LA_TUA_PASSWORD
   ```

2. Poi lancia:

   ```sh
   npm ci
   npx cap sync android
   cd android
   ./gradlew bundleRelease -PversionCode=2 -PversionName=1.0.1     # Windows: gradlew.bat ...
   ```

   Il file è in `android/app/build/outputs/bundle/release/app-release.aab`. Il `versionCode` deve essere più alto di quello dell'ultimo AAB caricato.

Con Android Studio puoi anche usare `npx cap open android` e poi **Build → Generate Signed App Bundle**.

---

## 6. Google Play Console

### 6.1 Account sviluppatore **(una volta)**

1. Vai su **play.google.com/console** e registrati con il tuo account Google. La quota di registrazione è di 25 USD, una tantum.
2. Scegli il tipo di account:
   - **Personale**: più semplice. Richiede il test chiuso del punto 6.4 prima della produzione.
   - **Organizzazione**: per un'azienda. Serve il numero D-U-N-S, ma il test chiuso obbligatorio non c'è.
3. Completa la **verifica dell'identità** e quella del telefono Android che ti viene chiesta. Possono servire alcuni giorni.

### 6.2 Crea l'app

**Crea app**: nome «DailyOutfit – Il tuo armadio», lingua predefinita **Italiano**, tipo **App**, **Gratuita**. Accetta le dichiarazioni.

### 6.3 «Configura la tua app» (dalla Dashboard)

Le risposte pronte sono in `store/listing-it.md`. Le voci da completare sono:

1. **Norme sulla privacy**: il link pubblico del punto 3.
2. **Accesso all'app**: tutte le funzionalità sono disponibili senza credenziali.
3. **Annunci**: nessuno.
4. **Classificazione dei contenuti**: questionario, con «No» a tutto.
5. **Pubblico di destinazione**: 13-15, 16-17, 18+.
6. **Sicurezza dei dati**: nessun dato raccolto né condiviso.
7. **App governative, funzionalità finanziarie, salute, notizie**: no.
8. **Categoria e contatti**: Stile di vita, più un'email pubblica.
9. **Scheda principale dello Store**: testi da `store/listing-it.md` e grafica da `store/`:
   - icona: `icon-512.png`;
   - grafica in evidenza: `feature-graphic.png`;
   - screenshot del telefono: `screenshots/*.png`.

### 6.4 Test chiuso: 12 tester per 14 giorni **(solo account personali nuovi)**

1. **Test → Test chiuso → Crea traccia** (oppure usa la traccia «Alpha»).
2. **Crea nuova release** e carica `app-release.aab`. Alla prima release accetta la **Firma dell'app di Google Play**.
3. Scrivi le note di rilascio (testo pronto in `store/listing-it.md`), salva e **invia per la revisione**.
4. **Tester**: aggiungi almeno **12 persone** con un elenco di email o un Gruppo Google. Condividi il link di adesione: ognuno deve accettare e installare l'app dal Play Store. Restano iscritti per **14 giorni consecutivi**, e conviene che la usino davvero.
5. Se in quei giorni carichi una nuova versione, crea una nuova release nella stessa traccia: il conteggio non si azzera.

### 6.5 Accesso alla produzione

Dopo i 14 giorni, nella Dashboard compare **Richiedi l'accesso alla produzione**. Rispondi al questionario su com'è andato il test e su chi è il pubblico dell'app. La revisione richiede qualche giorno.

### 6.6 Pubblicazione

1. **Produzione → Crea nuova release**: carica l'AAB oppure promuovi quello del test chiuso.
2. Scegli i paesi (per esempio solo l'Italia per iniziare).
3. Consiglio: **implementazione graduale**, prima al 20% degli utenti e poi al 100%.
4. Invia per la revisione: di solito servono da poche ore a qualche giorno.

---

## 7. Aggiornamenti

1. Modifica l'app e prova con `npm run serve`.
2. Aumenta `"version"` in `package.json`.
3. Push su `main`: GitHub crea il nuovo AAB.
4. Nella Play Console crea una nuova release (test o produzione) e caricalo.

---

## 8. Checklist prima della prima pubblicazione

- [ ] Segnaposto sostituiti in `www/privacy.html` (nome ed email)
- [ ] Pagina della privacy online, con un link pubblico funzionante
- [ ] Chiave di caricamento creata, con copia di sicurezza e segreti su GitHub
- [ ] L'ultima build su Actions è verde e senza avviso «AAB non firmato»
- [ ] APK di prova installato e provato su un telefono vero: foto, scontorno, outfit, condivisione, tasto indietro
- [ ] Screenshot rifatti con le tue foto (facoltativo ma consigliato)
- [ ] Identificativo `io.github.lcsoon93.dailyoutfit` confermato
- [ ] 12 tester pronti per il test chiuso

## Da sapere

- **Nessun server da pagare**: l'app funziona interamente sul telefono, quindi non ci sono costi di gestione oltre ai 25 USD iniziali.
- **I dati stanno sul telefono dell'utente**: se disinstalla l'app li perde, a meno che non abbia fatto «Salva copia» dal Profilo. Android può includerli nel proprio backup automatico, ma solo fino a 25 MB.
- **Requisiti di Google che cambiano ogni anno**: in particolare il «target API level», oggi Android 16 / API 36 per le app nuove. Una volta l'anno conviene aggiornare Capacitor (`npm install @capacitor/core@latest @capacitor/cli@latest @capacitor/android@latest`, poi `npx cap sync android`) e ricompilare.
