# Oggi — la lista LinkedIn del team

Pagina condivisa per Newtwen. Ogni persona apre il telefono, tocca il proprio nome e trova i profili di oggi. Il pulsante apre LinkedIn: se l'app è installata, il telefono la apre sul profilo. L'invito o il follow si fa a mano, lì.

Nessuno segna «fatto» o «accettato». La lista del giorno dopo è già decisa.

L'app non entra in LinkedIn, non invia richieste e non raccoglie dati dal social.

## Uso sul telefono

1. Apri la pagina e entra con l’email del team, oppure con il dispositivo se l’hai registrato.
2. Per ogni scheda tocca **Apri su LinkedIn**. Si apre il profilo.
3. Su LinkedIn scrivi due righe tue. Resta entro 10–20 inviti al giorno.

Per uscire, tocca **Esci**. La sessione resta sul telefono finché non esci.

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

## Contatti e team

Stanno su Supabase, tabelle `contacts` e `team_members`. Lo schema è in `supabase/schema.sql`.

Una riga diventa scheda solo se `active` è vero e `linkedin_url` è un profilo `linkedin.com/in/...`.

Ogni persona del team ha bisogno di un’email per ricevere il link di accesso. Al primo ingresso l’app scrive `auth_user_id`. Serve la policy nella sezione «DA APPLICARE» dello schema.

Un profilo già aperto da quella persona non le viene riassegnato. I profili che nessuno ha ancora aperto hanno la precedenza. L’apertura si registra in `clicks` quando si tocca **Apri su LinkedIn**.

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

## Accesso

Magic link via Supabase Auth, solo per le email in `team_members`. Dopo il primo ingresso si può registrare un passkey (impronta, volto o PIN). I passkey sono quelli nativi di Supabase Auth: vanno attivati nel dashboard.

Variabili d’ambiente, già impostate su Vercel:

```
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

In locale copiale in `.env.local`. La chiave publishable può arrivare al browser. Non usare la chiave `service_role`.

## Deploy su Vercel

1. Porta il repository su GitHub, GitLab o Bitbucket.
2. Su [vercel.com/new](https://vercel.com/new) importa il repository.
3. Vercel riconosce Next.js. Lascia build command (`npm run build`) e output predefiniti: non serve altra configurazione.
4. Le variabili `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` sono già nel progetto Vercel. Un nuovo deploy le legge in build.
5. Nel dashboard Supabase imposta Site URL `https://lnpush.vercel.app` e il redirect `https://lnpush.vercel.app/auth/callback`.
6. Apri il dominio dal telefono.

Contatti e team si aggiornano dalle tabelle Supabase. I numeri del piano restano in `data/config.json`. La giornata cambia a mezzanotte (Europe/Rome) senza un nuovo deploy.

## Sviluppo

```bash
npm install
npm test
npm run dev
```

Apri `http://localhost:3000`.

`npm test` controlla le regole: niente doppioni nello stesso giorno, pausa rispettata, al massimo 3 persone diverse per profilo, e la stessa persona non riceve due volte lo stesso profilo.

`npm run build` è il comando che esegue Vercel.
