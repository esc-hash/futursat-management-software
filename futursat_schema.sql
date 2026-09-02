-- ============================================================
-- FUTURSAT - Schema Database Supabase
-- Creato il: 2026-08-20
-- ============================================================

-- Abilita estensione UUID
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABELLA: clienti
-- Anagrafica clienti (unico record per Codice)
-- ============================================================
create table if not exists clienti (
  id                        bigint primary key,             -- Codice cliente
  tipo_abituale             text,
  ragione_sociale           text,
  rag_soc_supplement        text,
  classe                    text,
  gruppo                    text,
  indirizzo                 text,
  cap                       text,
  citta                     text,
  provincia                 text,
  tipo_morosita             text,
  stato_estero              text,
  nazione_p_iva             text,
  partita_iva               text,
  cod_fiscale               text,
  p_fisica                  text,
  indirizzo_sede_legale     text,
  citta_sede_legale         text,
  provincia_sede_legale     text,
  cap_sede_legale           text,
  forma_giuridica           text,
  operatore_creaz_mod       text,
  operatore_assegnato       text,
  note                      text,
  nazione_sede_legale       text,
  classificazione_cliente   text,
  canale                    text,
  filiale                   text,
  obsoleto                  boolean default false,
  telefono                  text,
  fax                       text,
  cod_agente_1              text,
  provv_agente_1            numeric,
  cod_agente_2              text,
  provv_agente_2            numeric,
  cod_pagamento             text,
  banca_cliente             text,
  cod_abi_cab_prg           text,
  sconto_1                  numeric,
  sconto_2                  numeric,
  cod_zona                  text,
  nota_commerciale          text,
  fido                      numeric,
  mese_esclus_pagam         integer,
  sec_mese_esclus_pagam     integer,
  descrizione_agente_1      text,
  descrizione_agente_2      text,
  descriz_pagamento         text,
  descrizione_abi           text,
  descrizione_cab           text,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

-- ============================================================
-- TABELLA: veicoli
-- Un record per ogni contratto/targa
-- ============================================================
create table if not exists veicoli (
  id                        bigserial primary key,
  cliente_id                bigint references clienti(id) on delete set null,
  ragione_sociale           text,
  numero_contratto          text,
  articolo                  text,
  canone                    numeric,
  tipo_mezzo                text,
  targa                     text not null,
  data_attivazione          date,
  data_sospensione          date,
  scad_da_fatturare         date,
  -- Colonne BLU da "mezzi in corso + WS"
  seriale_periferica        text,
  modello_periferica        text,
  produttore_periferica     text,
  installatore              text,
  data_installazione        date,
  marca                     text,
  modello                   text,
  colore                    text,
  data_ultima_posizione     timestamptz,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

-- Indice per ricerca rapida per targa (il campo più cercato!)
create index if not exists idx_veicoli_targa on veicoli (targa);
-- Indice per join con clienti
create index if not exists idx_veicoli_cliente_id on veicoli (cliente_id);
-- Ricerca targa case-insensitive
create index if not exists idx_veicoli_targa_lower on veicoli (lower(targa));

-- ============================================================
-- TRIGGER: aggiorna updated_at automaticamente
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_clienti_updated_at
  before update on clienti
  for each row execute function update_updated_at();

create trigger trg_veicoli_updated_at
  before update on veicoli
  for each row execute function update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS) - Supabase best practice
-- ============================================================
alter table clienti enable row level security;
alter table veicoli enable row level security;

-- Policy: solo utenti autenticati possono leggere
create policy "Autenticati possono leggere clienti"
  on clienti for select
  to authenticated
  using (true);

create policy "Autenticati possono leggere veicoli"
  on veicoli for select
  to authenticated
  using (true);

-- Policy: solo admins possono scrivere (aggiungi ruolo custom se necessario)
create policy "Autenticati possono modificare clienti"
  on clienti for all
  to authenticated
  using (true)
  with check (true);

create policy "Autenticati possono modificare veicoli"
  on veicoli for all
  to authenticated
  using (true)
  with check (true);
