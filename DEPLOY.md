# Pubblicazione: web e Google Play

Questa guida porta DailyOutfit dal repository al Play Store. I passaggi segnati con **(una volta)** si fanno solo la prima volta.

Riepilogo dei tempi: account sviluppatore e verifica (qualche giorno) → test chiuso obbligatorio di **14 giorni** con almeno **12 tester** → richiesta di accesso alla produzione (alcuni giorni di revisione) → pubblicazione.

---

## 0. Cosa c'è nel repository

| Cartella | Contenuto |
|---|---|
| `www/` | l'app vera e propria (HTML, CSS, JS, font, icone, `privacy.html`) |
| `android/` | progetto Android (Capacitor 8, target Android 16 / API 36) |
| `ios/` | progetto iOS (Capacitor 8, iOS 16 o successivo) |
| `.github/workflows/android.yml` | build automatica di APK di prova e AAB per il Play Store |
| `.github/workflows/ios.yml` | controllo della build iOS e caricamento su TestFlight (sezione 9) |
| `.github/workflows/pages.yml` | pubblicazione della versione web su GitHub Pages |
| `store/` | icona 512, grafica in evidenza, screenshot e testi della scheda (`listing-it.md`) |
| `assets/`, `design/` | sorgenti di icona e splash |

L'identificativo dell'app è **`io.github.lcsoon93.dailyoutfit`**. Dopo il primo caricamento sul Play Store **non si può più cambiare**: se ne vuoi un altro, deciditi ora.

---

## 1. La privacy

`www/privacy.html` indica come titolare **Luna's studio**, con contatto **lucapinto045@gmail.com**. Se cambi nome o email, aggiornali lì e usa gli stessi dati nella Play Console (nome sviluppatore ed email di contatto).

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

- [x] Nome ed email del titolare inseriti in `www/privacy.html` (Luna's studio, lucapinto045@gmail.com)
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

---

## 9. iOS e TestFlight

L'app iOS è la stessa (cartella `www/`) dentro un progetto Xcode. **Non serve un Mac**: la compilano i computer macOS di GitHub, con Xcode 26, la versione che Apple richiede per i caricamenti. A ogni modifica il workflow **Actions → iOS** controlla che l'app compili. Quando lo lanci a mano, la firma e la carica su TestFlight.

### 9.1 Cosa serve **(una volta)**

- **Apple Developer Program**: 99 USD all'anno (in euro nella valuta locale), su developer.apple.com/programs/enroll. Il modo più rapido è l'app **Apple Developer** su iPhone, che verifica l'identità con un documento.
  - Servono un Apple Account con verifica in due passaggi, la maggiore età e il tuo **nome legale** nell'account: soprannomi o nomi di fantasia rallentano l'approvazione.
  - *Individuale*: sull'App Store il venditore mostrato è il tuo nome e cognome, non «Luna's studio».
  - *Organizzazione*: serve un'attività registrata con numero D-U-N-S. Solo così il venditore può essere il nome dell'attività.
- **«Il tuo Apple Account non è abilitato per App Store Connect»**: significa che l'iscrizione non è ancora completata o approvata, oppure che stai entrando con un Apple Account diverso da quello iscritto.
  - Dopo l'approvazione arriva un'email di benvenuto e l'accesso si attiva, a volte con qualche ora di ritardo.
  - Se dopo 48 ore dall'approvazione l'errore resta, scrivi al supporto (developer.apple.com/contact) indicando l'Enrollment ID.
- **OpenSSL** per creare il certificato: è già presente su macOS e Linux. Su Windows usa «Git Bash», che si installa con Git for Windows.

### 9.2 Identificativo dell'app **(una volta)**

Su developer.apple.com/account apri **Certificates, IDs & Profiles → Identifiers → +** e scegli **App IDs → App**.

- Descrizione: `DailyOutfit`
- Bundle ID **Explicit**: `io.github.lcsoon93.dailyoutfit`
- Nessuna capability aggiuntiva.

### 9.3 Certificato di distribuzione **(una volta l'anno)**

1. Crea la richiesta di certificato (CSR) e la sua chiave privata:

   ```sh
   openssl req -new -newkey rsa:2048 -nodes -keyout dailyoutfit-ios.key -out dailyoutfit-ios.csr -subj "/emailAddress=lucapinto045@gmail.com/CN=DailyOutfit/C=IT"
   ```

2. Vai su **Certificates → +** e scegli **Apple Distribution**. Carica `dailyoutfit-ios.csr` e scarica il certificato (`distribution.cer`).

3. Converti il certificato nel formato `.p12`. L'ultimo comando chiede una password: annotala.

   ```sh
   openssl x509 -in distribution.cer -inform DER -out distribution.pem -outform PEM
   openssl pkcs12 -export -inkey dailyoutfit-ios.key -in distribution.pem -out dailyoutfit-ios.p12 -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1
   ```

4. Conserva `dailyoutfit-ios.key`, `dailyoutfit-ios.p12` e la password in un posto sicuro, **mai nel repository**.

### 9.4 Profilo di provisioning **(una volta l'anno)**

1. Vai su **Profiles → +** e scegli **Distribution → App Store Connect**.
2. Seleziona l'App ID `DailyOutfit` e il certificato appena creato.
3. Come nome usa `DailyOutfit App Store`, poi scarica il file `.mobileprovision`.

### 9.5 L'app in App Store Connect **(una volta)**

Su appstoreconnect.apple.com vai in **App → + → Nuova app** e compila:

- piattaforma **iOS**;
- nome «DailyOutfit – Il tuo armadio» (deve essere unico su tutto l'App Store: se è già preso, scegline un altro);
- lingua **Italiano**;
- il bundle ID del punto 9.2;
- SKU `dailyoutfit`.

### 9.6 Chiave API di App Store Connect **(una volta)**

1. In App Store Connect vai su **Utenti e accesso → Integrazioni → App Store Connect API → Chiavi del team**.
2. Genera una chiave con ruolo **App Manager**.
3. Scarica il file `.p8`: si può scaricare **una sola volta**.
4. Annota il **Key ID** e l'**Issuer ID** che compaiono nella pagina.

Il **Team ID** lo trovi su developer.apple.com/account, in **Membership details**.

### 9.7 Segreti su GitHub **(una volta, poi a ogni rinnovo del certificato)**

Vai su **Settings → Secrets and variables → Actions → New repository secret** e crea:

| Nome | Valore |
|---|---|
| `APPLE_TEAM_ID` | il Team ID |
| `IOS_DISTRIBUTION_P12_BASE64` | `dailyoutfit-ios.p12` convertito in testo |
| `IOS_DISTRIBUTION_P12_PASSWORD` | la password del `.p12` |
| `IOS_PROFILE_BASE64` | il file `.mobileprovision` convertito in testo |
| `APP_STORE_CONNECT_KEY_ID` | il Key ID |
| `APP_STORE_CONNECT_ISSUER_ID` | l'Issuer ID |
| `APP_STORE_CONNECT_KEY_P8` | il contenuto del file `.p8` |

- Per convertire i file in testo usa gli stessi comandi del punto 4.
- Per il `.p8` aprilo con un editor di testo e copia tutto, comprese le righe `BEGIN` ed `END`.

### 9.8 Caricare una build su TestFlight

1. Vai su **Actions → iOS → Run workflow**, con «Firma e carica la build su TestFlight» spuntato. Se manca qualche segreto, la build si ferma e dice quale.
2. Dopo circa 15 minuti la build è caricata. App Store Connect la elabora per altri 10-30 minuti e poi compare in **TestFlight**.
3. Il numero di versione viene da `package.json`, quello della build dal contatore del workflow.

### 9.9 Tester

- **Interni** (fino a 100 persone del tuo team App Store Connect, **senza revisione**):
  1. In TestFlight crea un gruppo interno e aggiungi te stesso.
  2. Sull'iPhone installa l'app **TestFlight**, accetta l'invito e installa DailyOutfit.
- **Esterni** (fino a 10.000 persone, anche con link pubblico):
  1. Crea un gruppo esterno e aggiungi la build.
  2. Compila le «Informazioni sui test»: descrizione, email per i feedback, link alla privacy.
  3. Invia alla **revisione beta di Apple**, che richiede di solito un giorno o due solo per la prima build.
- Ogni build resta disponibile **90 giorni**.

### 9.10 Privacy sull'App Store

In **Privacy dell'app**, alla domanda «Raccogli dati da questa app?» rispondi **No**: l'etichetta sarà «Dati non raccolti». Il link alla privacy è lo stesso usato per Android.

### 9.11 Da sapere per iOS

- Certificato e profilo **scadono dopo un anno**: rifai i punti 9.3 e 9.4 e aggiorna i segreti.
- Per pubblicare sull'**App Store** (dopo TestFlight) servono la scheda con gli screenshot nel formato iPhone e la revisione di Apple.
  - Apple può rifiutare le app che sembrano «solo un sito web». DailyOutfit funziona offline, usa la fotocamera e salva i dati sul telefono, quindi dovrebbe passare, ma conviene sottolinearlo nelle note per il revisore.
- Se in futuro userai un Mac: `npx cap open ios` apre il progetto in Xcode. La configurazione «Release» usa la firma manuale con il profilo `DailyOutfit App Store`.
