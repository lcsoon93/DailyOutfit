# Scheda Play Store (italiano)

Testi e risposte pronti da copiare nella Play Console. I file grafici sono in questa cartella.

## Grafica

| Elemento | File | Requisito Google |
|---|---|---|
| Icona dell'app | `icon-512.png` | 512×512 PNG a 32 bit, max 1 MB |
| Grafica in evidenza | `feature-graphic.png` | 1024×500 PNG/JPEG senza trasparenza |
| Screenshot telefono | `screenshots/1-today.png` … `6-favorites.png` | da 2 a 8, PNG/JPEG, lato tra 320 e 3840 px |

Gli screenshot usano l'armadio di esempio e una foto di prova: quando avrai qualche foto vera dei tuoi capi, conviene rifarli con quelle.

## Testi

**Nome dell'app** (max 30 caratteri)

```
DailyOutfit – Il tuo armadio
```

**Descrizione breve** (max 80 caratteri)

```
Fotografa i tuoi vestiti e ricevi l'outfit giusto per ogni occasione.
```

**Descrizione completa** (max 4000 caratteri)

```
Cosa mi metto oggi? DailyOutfit ti risponde usando i vestiti che hai davvero nell'armadio.

Fotografa i tuoi capi uno alla volta: lo sfondo viene tolto in automatico e il colore riconosciuto da solo. Poi scegli l'occasione — scuola, lavoro, cerimonia, pizza con amici, appuntamento, festa, sport o tempo libero — e il meteo: DailyOutfit abbina i capi giusti e ti mostra l'outfit completo in una tavola elegante, pronta da salvare o condividere.

COME FUNZIONA
• Fotografa o scegli dalla galleria i tuoi capi
• Lo sfondo sparisce da solo; se serve, lo ritocchi con un dito (bacchetta, gomma e pennello)
• Indica categoria, stile e stagione con pochi tocchi
• Scegli occasione e meteo e premi «Crea il mio outfit»
• Non ti convince? «Un altro» e ne ricevi subito uno nuovo

ABBINAMENTI SENSATI
• Stili adatti all'occasione: sportivo, casual, ufficio, elegante
• Colori che stanno bene insieme: base neutra con al massimo due colori protagonisti
• Capi di stagione in base al meteo, con maglione e giacca quando fa freddo
• Consigli pratici per ogni occasione e capi che non ripete troppo spesso
• Stili e consigli adattati a età e sesso

LA TUA PRIVACY PRIMA DI TUTTO
• Nessun account e nessuna registrazione
• Le foto e i dati restano solo sul tuo telefono: niente server, niente cloud
• Nessuna pubblicità e nessun tracciamento
• Funziona anche senza connessione
• Copia di sicurezza in un file, quando vuoi tu

Vuoi provarla subito? Carica l'armadio di esempio e crea il tuo primo outfit in pochi secondi.
```

**Note sulla versione 1.0.0**

```
Prima versione di DailyOutfit: armadio con scontorno automatico delle foto, outfit per 8 occasioni, preferiti, condivisione e backup.
```

## Classificazione e categorie

- **Tipo**: App · **Categoria**: Stile di vita · **Gratuita**
- **Tag** (fino a 5): Moda, Stile, Abbigliamento, Organizzazione, Lifestyle
- **Email di contatto**: obbligatoria e pubblica (usa un indirizzo che leggi davvero)
- **Norme sulla privacy**: URL pubblico della pagina `privacy.html` (vedi `DEPLOY.md`)

## Risposte per «Configura la tua app»

**Accesso all'app**: «Tutte le funzionalità sono disponibili senza accesso speciale» (non c'è login).

**Annunci**: «No, la mia app non contiene annunci».

**Classificazione dei contenuti** (questionario IARC): categoria «Tutti gli altri tipi di app»; rispondi **No** a violenza, sessualità, linguaggio volgare, sostanze, gioco d'azzardo, interazione tra utenti e condivisione della posizione. Risultato atteso: PEGI 3 / per tutti.

**Pubblico di destinazione**: fasce **13-15, 16-17, 18+**. Includere anche i minori di 13 anni farebbe rientrare l'app nelle norme Famiglie, con requisiti e revisioni aggiuntivi.

**App di notizie**: No. **App governativa**: No. **Funzionalità finanziarie**: nessuna. **App per la salute**: No.

**Sicurezza dei dati**:
- «La tua app raccoglie o condivide uno dei tipi di dati utente richiesti?» → **No**.
  Motivo: tutti i dati (profilo, foto, outfit) sono elaborati e conservati solo sul dispositivo e non vengono mai trasmessi allo sviluppatore né a terzi. L'app non contiene SDK di analisi, pubblicità o crash reporting.
- Il backup e la condivisione dell'immagine di un outfit partono solo da un'azione dell'utente tramite il pannello di condivisione di Android, e la destinazione la sceglie lui: le linee guida di Google escludono questi trasferimenti avviati dall'utente da ciò che va dichiarato. In caso di dubbio, rileggi la guida «Sicurezza dei dati» nella Play Console mentre compili il modulo.
- Il link all'informativa sulla privacy è comunque obbligatorio.
