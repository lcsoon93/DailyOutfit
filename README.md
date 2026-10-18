# DailyOutfit

App web che, dopo aver caricato le foto dei tuoi vestiti e indicato sesso ed età, genera su richiesta un outfit adatto all'occasione: scuola, lavoro, cerimonia, pizza con amici, appuntamento, festa, sport, tempo libero.

## Come si usa

1. **Profilo**: imposta sesso ed età.
2. **Armadio**: carica le foto dei capi (meglio su sfondo neutro). Per ogni capo scegli categoria, stile (sportivo, casual, smart, elegante) e stagione; il colore viene riconosciuto in automatico dalla foto e si può correggere.
   Con il riconoscimento AI attivo (vedi sotto) questi campi vengono compilati da Gemini e tu devi solo confermare.
3. **Outfit**: scegli l'occasione e il meteo, poi premi *Genera outfit*. *Un altro* propone un'alternativa, *Salva* lo aggiunge ai preferiti.

## Riconoscimento AI con Gemini

In *Profilo → Riconoscimento AI* inserisci una chiave API di Gemini (si crea gratis su [Google AI Studio](https://aistudio.google.com/apikey)) e premi *Salva e verifica*: la chiave viene controllata e il menu *Modello* si riempie con i modelli disponibili per il tuo account (predefinito `gemini-3.5-flash-lite`, veloce ed economico).

Da quel momento ogni foto caricata viene inviata a Gemini, che restituisce nome, categoria, stili, stagioni e colore; nella scheda di un capo il pulsante *✨ Analizza con AI* ripete l'analisi.

La chiave è salvata solo nel `localStorage` del browser e le chiamate partono direttamente dal browser verso Google, senza server intermedi; non viene inclusa nei backup. Su Google AI Studio conviene limitare la chiave all'API Gemini.

## Avvio

Non serve installare nulla: apri `index.html` nel browser, oppure pubblica la cartella su un hosting statico (es. GitHub Pages).

Per lo sviluppo locale:

```sh
python3 -m http.server 8000
# poi apri http://localhost:8000
```

## Come funziona

- Tutti i dati (foto comprese) restano nel browser, in IndexedDB. Da *Profilo → Backup* si possono esportare e reimportare.
- Il generatore (`js/generator.js`) filtra i capi compatibili con l'occasione e la stagione, crea centinaia di combinazioni (parte sopra + sotto oppure vestito intero, eventuale maglione, capospalla, scarpe, accessorio) e assegna un punteggio in base a stile, armonia dei colori (`js/colors.js`) e capi usati di recente, poi sceglie tra le migliori.
- Età e sesso regolano le occasioni disponibili, il peso degli stili e alcune regole (es. giacca in cerimonia per l'uomo, vestito preferito per la donna).

## Struttura

```
index.html        interfaccia
css/style.css     stile (chiaro/scuro automatico)
js/db.js          salvataggio dati (IndexedDB + localStorage)
js/colors.js      riconoscimento colore e regole di abbinamento
js/ai.js          riconoscimento dei capi con Gemini
js/data.js        categorie, stili, stagioni, occasioni, meteo
js/generator.js   motore di generazione degli outfit
js/app.js         logica dell'interfaccia
```
