# Oggi — la lista LinkedIn del team

Pagina condivisa per Newtwen. Ogni persona apre il telefono, tocca il proprio nome e trova i profili di oggi. Il pulsante apre LinkedIn: se l'app è installata, il telefono la apre sul profilo. L'invito o il follow si fa a mano, lì.

Nessuno segna «fatto» o «accettato». La lista del giorno dopo è già decisa.

L'app non entra in LinkedIn, non invia richieste e non raccoglie dati dal social.

## Uso sul telefono

1. Apri la pagina.
2. Tocca il tuo nome. Resta salvato su quel telefono.
3. Per ogni scheda tocca **Apri su LinkedIn**. Si apre il profilo.
4. Su LinkedIn scrivi due righe tue. Resta entro 10–20 inviti al giorno.

Per cambiare persona, tocca **Cambia**.

La pagina è pensata per il telefono: pulsanti alti, testo largo, una scheda sotto l'altra. Su uno schermo largo il link si apre in una scheda nuova, così la lista resta aperta. Sul telefono la navigazione resta nella stessa finestra, altrimenti iOS e Android non passano il profilo all'app di LinkedIn.

## Come viene scelta la lista

Il piano è calcolato dal codice, sempre uguale per tutti, senza database. Dipende dalla data, dagli id del team e dagli URL dei profili.

- Ogni profilo, in un dato giorno, va al massimo a una persona.
- Dopo l'assegnazione resta in pausa (`cooldownDays`, default 12). Un profilo assegnato il 24 novembre può tornare il 6 dicembre.
- Nel tempo lo stesso profilo arriva al massimo a 3 persone diverse del team (`maxMembersPerContact`).
- La stessa persona non riceve due volte lo stesso profilo.
- Senza URL di un profilo personale (`linkedin.com/in/...`) la riga non diventa una scheda.
- Con `affinityEnabled`, chi ha `"technical": true` riceve prima i gruppi tecnici. Gli altri ricevono prima il resto. Se il gruppo preferito è finito, si usa chiunque sia libero.
- Ogni persona vede al massimo `cardsPerDay` schede (default 5).

L'ordine delle righe nel CSV non cambia il piano. Lo cambiano: un profilo aggiunto o tolto, un id del team, `startDate`, i numeri in `data/config.json`.

La giornata cambia a mezzanotte di `timezone` (Europe/Rome).

La scheda non mostra il gruppo né un suggerimento Segui o Collegati. Su LinkedIn scegli tu.

## Modificare i contatti

File: `data/contacts.csv` (UTF-8, separato da virgole).

| Colonna | A cosa serve |
| --- | --- |
| Azienda | Nome azienda in scheda |
| Nome | Nome e cognome. Obbligatorio per avere una scheda |
| Ruolo | Ruolo in scheda |
| Gruppo | Categoria. Decide affinità tecnica e Segui/Collegati |
| LinkedIn | URL del profilo personale. Vuoto = nessuna scheda |
| Tag | Opzionale. Se è compilato, sostituisce il Gruppo per l'affinità tecnica |

Fonte, Affidabilita, Ruolo verificato e Note restano nel file per voi. La pagina non le mostra.

In Excel o Fogli Google salva in CSV UTF-8, così accenti e nomi sloveni restano intatti. Tieni le virgolette se un campo contiene una virgola. Nell'ultima riga di un JSON non mettere la virgola finale.

Poi fai commit e push: al deploy la lista si aggiorna.

Con pochi contatti la lista copre alcuni giorni e poi si svuota: ogni profilo può uscire al massimo tre volte, con la pausa in mezzo. Per averne ancora, aggiungi righe con un link `linkedin.com/in/...`.

## Modificare il team

File: `data/team.json`.

```json
{
  "members": [
    { "id": "paolo", "name": "Paolo", "technical": true },
    { "id": "andrea", "name": "Andrea", "technical": false },
    { "id": "membro-3", "name": "Membro 3", "technical": true }
  ]
}
```

- `name` è quello che si tocca sul telefono. Puoi cambiarlo quando vuoi.
- `id` lascialo stabile. Se lo cambi, per il piano è una persona nuova.
- `technical` a `true` dà priorità ai gruppi che contengono «tecnic» (o alla regex in config).

I tre nomi nel file sono segnaposto: sostituiscili con le persone vere.

## Configurazione

File: `data/config.json`.

- `cardsPerDay` — schede a persona, da 1 a 30. Default 5. Tienilo basso: LinkedIn limita gli inviti.
- `cooldownDays` — pausa dopo un'assegnazione. Default 12. Con 0, un altro membro può ricevere il profilo già dal giorno dopo.
- `maxMembersPerContact` — quante persone diverse del team possono ricevere quel profilo, in tutto. Default 3.
- `startDate` — primo giorno del piano, `YYYY-MM-DD`. Lo storico parte da qui e viene ricalcolato, non salvato.
- `timezone` — default `Europe/Rome`.
- `affinityEnabled` — `true` o `false`.
- `technicalGroupPattern` — regex, senza distinzione tra maiuscole e minuscole. Default `tecnic`.
- `followGroupPattern` — resta nel file, la pagina non lo usa.

## Password del team

Opzionale. Variabile d'ambiente `TEAM_PASSWORD`.

- Se è vuota o assente, la pagina è aperta a chi ha il link.
- Se è impostata, all'ingresso c'è una password condivisa, la stessa per tutti. Il browser la ricorda per circa sei mesi.

In locale crea `.env.local` (non va su git):

```
TEAM_PASSWORD=scegli-una-password
```

Puoi copiare `.env.example`.

## Deploy su Vercel

1. Porta il repository su GitHub, GitLab o Bitbucket.
2. Su [vercel.com/new](https://vercel.com/new) importa il repository.
3. Vercel riconosce Next.js. Lascia build command (`npm run build`) e output predefiniti: non serve altra configurazione.
4. Per la password: Project Settings → Environment Variables → aggiungi `TEAM_PASSWORD`. Poi rifai il deploy, così il valore entra nella build.
5. Apri il dominio dal telefono.

Per aggiornare contatti o team modifica i file in `data/` e fai push sul branch di produzione. La pagina si genera a ogni richiesta: a mezzanotte (Europe/Rome) la lista cambia senza un nuovo deploy.

## Sviluppo

```bash
npm install
npm test
npm run dev
```

Apri `http://localhost:3000`.

`npm test` controlla le regole: niente doppioni nello stesso giorno, pausa rispettata, al massimo 3 persone diverse per profilo, e la stessa persona non riceve due volte lo stesso profilo.

`npm run build` è il comando che esegue Vercel.
