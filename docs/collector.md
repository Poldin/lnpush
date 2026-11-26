# Raccolta candidati LinkedIn

Lo script sul PC di Paolo cerca su Google, piano. Il server non chiama Google: riceve i risultati e tiene solo i profili `linkedin.com/in/…`. Brave è un provider opzionale, a pagamento, e non serve per il percorso normale.

Non c’è un cron. Su `/collect` i profili incollati finiscono direttamente in `contacts`. `/review` reindirizza a `/collect`.

## SQL da applicare

Nel SQL editor di Supabase, una volta, incolla ed esegui `supabase/profile_candidates.sql` se lo script locale deve ancora scrivere `profile_candidates`.

Crea `public.profile_candidates` e `public.collector_runs`. Il service role scrive.

Per `/collect`, incolla ed esegui anche `supabase/collect_direct_to_contacts.sql`. I membri attivi del team possono inserire e cancellare righe in `contacts`. Senza quel file il salvataggio dalla sessione firmata fallisce.

Le aziende da cercare sono i valori distinti di `contacts.company` con `active = true`. Non esiste una tabella aziende.

## Variabili

Sul progetto Vercel `lnpush`, oggi ci sono solo `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`.

Da aggiungere, tutte solo lato server (mai nel browser):

| Nome | Uso |
| --- | --- |
| `CRON_SECRET` | Token degli endpoint `/api/collect/*`. Lo stesso valore va in `LNPUSH_TOKEN` sul PC. |
| `SUPABASE_SERVICE_ROLE_KEY` | Il collector scrive i candidati. Non è la chiave publishable. |
| `BRAVE_SEARCH_API_KEY` | Opzionale. Senza questa chiave il pulsante **Collect all** non compare. |

`CRON_SECRET` non è ancora configurato.

## Script su Windows

Serve Node.js 20 o successivo. Nella cartella del repository, in PowerShell:

```powershell
npm install --no-save playwright
npx playwright install chromium
$env:LNPUSH_URL = "https://lnpush.vercel.app"
$env:LNPUSH_TOKEN = "<CRON_SECRET>"
node scripts/collect-local.mjs
```

In Prompt dei comandi (`cmd.exe`):

```bat
npm install --no-save playwright
npx playwright install chromium
set LNPUSH_URL=https://lnpush.vercel.app
set LNPUSH_TOKEN=<CRON_SECRET>
node scripts/collect-local.mjs
```

Playwright non è una dipendenza dell’app e non va committato. `--no-save` non modifica `package.json`.

Lo script:

1. chiede a `GET /api/collect/next?all=1` le aziende non ancora raccolte;
2. per ogni azienda apre Google con `site:linkedin.com/in "<Azienda>"`, pagine 1–6 (10 risultati, circa 60);
3. aspetta 20–30 secondi a caso fra una ricerca e l’altra;
4. invia ogni pagina a `POST /api/collect/ingest`.

Se Google mostra un captcha o una pagina di traffico anomalo, lo script si ferma e stampa un messaggio chiaro. Le aziende già ingerite restano segnate e al giro dopo vengono saltate. Per rifarne una, cancella la riga in `collector_runs` oppure lancia:

```powershell
node scripts/collect-local.mjs --company "Nome Azienda"
```

`--dry-run` invia `dry_run: true` e non scrive. `LNPUSH_HEADED=1` apre la finestra di Chrome se vuoi vedere la pagina.

## Endpoint

Tutte le chiamate curl usano `Authorization: Bearer <CRON_SECRET>`. Sostituisci il dominio se serve.

Prossima azienda non ancora raccolta (default 10; `n` da 1 a 1000):

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://lnpush.vercel.app/api/collect/next?n=3"
```

Tutte quelle ancora da raccogliere:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://lnpush.vercel.app/api/collect/next?all=1"
```

La risposta ha `companies`, `total` (aziende nei contatti) e `remaining` (non ancora in `collector_runs`).

Ingest di una pagina. Gli URL che non sono `/in/` si ignorano. I duplicati, già nei contatti o già candidati, non si reinseriscono. `collector_runs` si aggiorna.

```bash
curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"company":"Acme","source_query":"site:linkedin.com/in \"Acme\"","results":[{"title":"Ada Lovelace - Engineer | LinkedIn","url":"https://www.linkedin.com/in/Ada-Lovelace/?trk=1","snippet":"Engineer at Acme","rank":1}]}' \
  "https://lnpush.vercel.app/api/collect/ingest"
```

Prova senza scrivere (`dry_run` di default è `false`):

```bash
curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"company":"Acme","source_query":"site:linkedin.com/in \"Acme\"","dry_run":true,"results":[{"title":"Ada Lovelace - Engineer | LinkedIn","url":"https://it.linkedin.com/in/Ada-Lovelace/","snippet":"Engineer","rank":1}]}' \
  "https://lnpush.vercel.app/api/collect/ingest"
```

L’URL salvato è `https://www.linkedin.com/in/<slug>` in minuscolo, senza query e senza slash finale. Dal titolo `Nome - Headline | LinkedIn` escono nome e headline.

## Brave, solo se la chiave c’è

Senza `BRAVE_SEARCH_API_KEY` questi endpoint rispondono 503. Con la chiave, il run va a chunk da circa 250 secondi (`maxDuration` 300) finché non restano aziende.

Tre chiamate Brave per azienda (`count=20`, `offset` 0, 1 e 2), al massimo 60 profili `/in/`, una richiesta al secondo. `save` di default è `false` (non scrive). Manda un solo modo tra `company`, `companies` e `next`.

```bash
curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"company":"Acme","limit":60,"save":false}' \
  "https://lnpush.vercel.app/api/collect/run"

curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"companies":["Acme","Beta"],"save":true,"force":true}' \
  "https://lnpush.vercel.app/api/collect/run"

curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"next":5,"save":true,"include_results":false}' \
  "https://lnpush.vercel.app/api/collect/run"
```

`remaining` elenca le aziende del giro non iniziate perché è finito il tempo. Con più di 5 aziende i `results` si omettono, salvo `include_results: true`. `force: true` ripete anche un’azienda già raccolta.

Anteprima di una sola azienda, senza scrivere se manca `save=true`:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://lnpush.vercel.app/api/collect/preview?company=Acme&limit=60"

curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://lnpush.vercel.app/api/collect/preview?company=Acme&limit=60&save=true"
```

## Raccolta in pagina

Su `/collect` un membro del team incolla i risultati di Google. I profili nuovi vanno in `contacts`: `company` è l’azienda attiva, `full_name` il nome, `role` l’headline se c’è, `linkedin_url` normalizzato (`https://www.linkedin.com/in/<slug>`), `active` vero. Un URL già presente in `contacts` non viene reinserito. `/collect` non scrive `profile_candidates`.

Il numero accanto a ogni azienda conta i contatti attivi di quell’azienda. Sulla lista appena aggiunta, **Remove** cancella quel contatto.
