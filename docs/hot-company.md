# Azienda calda della settimana

La lista non usa più il piano virtuale (niente `cardsPerDay`, cooldown di giorni, `maxMembersPerContact`, `startDate`). L’ordine nasce solo dai click veri e dalla settimana calda.

La settimana inizia il **lunedì 00:00, Europe/Rome**. `week_start` è quella data, in formato `YYYY-MM-DD`.

## Come viene scelta

1. Se in `public.hot_weeks` c’è una riga per il lunedì corrente, quella `company` è calda. Il nome deve essere **identico** a `contacts.company` (spazi e maiuscole compresi).
2. Se non c’è una riga, la scelta è automatica e deterministica. Si parte dal lunedì `2026-11-23` e si ricalcola settimana per settimana fino a oggi:
   - una riga forzata vince su quella settimana e conta come «già stata calda»;
   - altrimenti si prende l’azienda mai calda, poi quella calda più indietro nel tempo;
   - a parità: più profili attivi con LinkedIn, poi meno click totali su quei profili, poi nome alfabetico italiano.
3. La settimana dopo una forzatura torna automatica, da sola. Non serve cancellare il futuro.

Lo storico automatico non è una tabella: l’app lo ricalcola dai contatti attuali, dai click attuali e dalle righe forzate. Se cambia un pareggio (nuovi profili o nuovi click), una settimana non forzata può spostarsi. Le settimane con riga in `hot_weeks` restano quelle che hai scritto.

Sulle card dell’azienda calda compare 🔥, la scritta **Hot company of the week** e uno sfondo di fiamme molto tenue.

## Anti-spam (48 ore)

Un profilo va **in fondo** alla lista di tutti, non sparisce, se negli ultimi 48 ore ha almeno 2 click del team (persone qualsiasi). Il conto è mobile: è «freddo» finché il **secondo click più recente** è ancora dentro le 48 ore. Un terzo click è permesso: non blocca il profilo, può solo tenerlo in fondo se due click restano nella finestra.

Un profilo che ho aperto sparisce dalla mia List finché il mio ultimo click su quel profilo ha meno di 10×24 ore. Dopo, torna come scheda «refresh»: prima del nome c’è 🔁. Un nuovo click lo nasconde di nuovo per 10 giorni e conta anche per l’anti-spam. Gli altri continuano a vedere i profili aperti da me.

Ordine della List, stabile per persona e per giorno (stesso hash di sempre):

1. caldi, non freddi, mai aperti da me
2. gli altri non freddi, mai aperti da me
3. refresh non freddi, prima i caldi
4. freddi in fondo: prima i caldi, e i mai aperti da me prima dei refresh

Il filtro azienda si applica dopo.

## SQL da lanciare una volta

File: `supabase/hot_weeks.sql`.

```sql
create table if not exists public.hot_weeks (
  week_start date primary key,
  company text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.hot_weeks enable row level security;

drop policy if exists hot_weeks_select_authenticated on public.hot_weeks;
create policy hot_weeks_select_authenticated
  on public.hot_weeks
  for select
  to authenticated
  using (true);

revoke all on table public.hot_weeks from public;
revoke all on table public.hot_weeks from anon;
grant select on table public.hot_weeks to authenticated;
```

I membri loggati possono solo leggere. Insert e update dal client non ci sono: si modifica dal SQL editor o dal table editor.

## Lunedì della settimana

```sql
select (timezone('Europe/Rome', now()))::date
  - (extract(isodow from timezone('Europe/Rome', now()))::int - 1) as week_start;
```

`isodow` 1 è lunedì. Per un giorno preciso:

```sql
select date '2026-12-03'
  - (extract(isodow from date '2026-12-03')::int - 1) as week_start;
```

## Nomi azienda validi

Copia il nome esatto da qui.

```sql
select company, count(*) as profiles
from public.contacts
where active is true
  and linkedin_url is not null
  and company is not null
  and btrim(company) <> ''
group by company
order by company;
```

## Forzare una settimana

```sql
insert into public.hot_weeks (week_start, company, note)
values ('2026-11-30', 'NOME ESATTO', 'voluta da Paolo');
```

## Forzare le prossime N settimane

Esempio: 4 lunedì a partire dal 2026-11-30. Cambia date e nomi.

```sql
insert into public.hot_weeks (week_start, company, note)
values
  ('2026-11-30', 'NOME 1', 'settimana 1'),
  ('2026-12-07', 'NOME 2', 'settimana 2'),
  ('2026-12-14', 'NOME 3', 'settimana 3'),
  ('2026-12-21', 'NOME 4', 'settimana 4');
```

Le settimane senza riga, prima o dopo, restano automatiche.

## Vedere le settimane forzate

```sql
select week_start, company, note, created_at
from public.hot_weeks
order by week_start;
```

## Cambiare una settimana forzata

```sql
update public.hot_weeks
set company = 'ALTRO NOME ESATTO',
    note = 'corretta'
where week_start = '2026-11-30';
```

## Annullare una forzatura

La settimana torna automatica.

```sql
delete from public.hot_weeks
where week_start = '2026-11-30';
```
