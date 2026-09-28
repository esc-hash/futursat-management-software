-- ============================================================
-- FUTURSAT — Schema V2
-- Nuove tabelle: user_profiles, audit_log, documenti
-- ============================================================

-- ============================================================
-- TABELLA: user_profiles
-- Estende auth.users con ruolo e stato account
-- ============================================================
create table if not exists user_profiles (
  id                uuid references auth.users(id) on delete cascade primary key,
  full_name         text not null,
  email             text not null,
  role              text not null default 'agente'
                      check (role in ('admin','amministrazione','dipendente','agente')),
  stato_account     text not null default 'pending'
                      check (stato_account in ('pending','approved','rejected','suspended')),
  note_richiesta    text,
  note_admin        text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists idx_user_profiles_role         on user_profiles(role);
create index if not exists idx_user_profiles_stato        on user_profiles(stato_account);

-- ============================================================
-- TABELLA: audit_log
-- Registro automatico di ogni azione CRUD
-- ============================================================
create table if not exists audit_log (
  id                bigserial primary key,
  user_id           uuid references auth.users(id) on delete set null,
  user_email        text,
  user_role         text,
  azione            text not null
                      check (azione in ('CREATE','UPDATE','DELETE','READ','LOGIN','LOGOUT')),
  modulo            text not null,
  record_id         text,
  record_label      text,
  valori_precedenti jsonb,
  valori_nuovi      jsonb,
  letto_da          uuid[] default '{}',
  created_at        timestamptz default now()
);

create index if not exists idx_audit_log_user_id     on audit_log(user_id);
create index if not exists idx_audit_log_created_at  on audit_log(created_at desc);
create index if not exists idx_audit_log_modulo      on audit_log(modulo);
create index if not exists idx_audit_log_record_id   on audit_log(record_id);

-- ============================================================
-- TABELLA: documenti
-- Archivio PDF/JPG per cliente
-- ============================================================
create table if not exists documenti (
  id                bigserial primary key,
  cliente_id        bigint references clienti(id) on delete cascade,
  veicolo_id        bigint references veicoli(id) on delete set null,
  nome_file         text not null,
  nome_originale    text not null,
  tipo_file         text not null check (tipo_file in ('pdf','jpg','jpeg','png')),
  dimensione_bytes  bigint,
  storage_path      text not null,
  caricato_da       uuid references auth.users(id) on delete set null,
  caricato_da_email text,
  descrizione       text,
  created_at        timestamptz default now()
);

create index if not exists idx_documenti_cliente_id  on documenti(cliente_id);
create index if not exists idx_documenti_veicolo_id  on documenti(veicolo_id);
create index if not exists idx_documenti_created_at  on documenti(created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table user_profiles  enable row level security;
alter table audit_log      enable row level security;
alter table documenti      enable row level security;

-- Helper function: controlla se l'utente corrente è approvato con ruolo dato
create or replace function is_approved_role(required_roles text[])
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from user_profiles
    where id = auth.uid()
      and stato_account = 'approved'
      and role = any(required_roles)
  );
$$;

-- user_profiles: chiunque crea il proprio record al signup
create policy "Insert own profile" on user_profiles
  for insert to authenticated
  with check (id = auth.uid());

-- user_profiles: ognuno vede il proprio record
create policy "Select own profile" on user_profiles
  for select to authenticated
  using (id = auth.uid() or is_approved_role(array['admin']));

-- user_profiles: solo admin modifica profili
create policy "Admin manage profiles" on user_profiles
  for update to authenticated
  using (is_approved_role(array['admin']))
  with check (true);

-- audit_log: inserimento libero per autenticati (il JS controlla il contesto)
create policy "Insert audit log" on audit_log
  for insert to authenticated
  with check (true);

-- audit_log: lettura solo ad admin e amministrazione
create policy "Read audit log" on audit_log
  for select to authenticated
  using (is_approved_role(array['admin','amministrazione']));

-- audit_log: update per mark-as-read (qualsiasi approvato)
create policy "Update audit log read" on audit_log
  for update to authenticated
  using (is_approved_role(array['admin','amministrazione']))
  with check (true);

-- documenti: lettura per tutti gli approvati
create policy "Read documenti" on documenti
  for select to authenticated
  using (is_approved_role(array['admin','amministrazione','dipendente','agente']));

-- documenti: inserimento per tutti gli approvati
create policy "Insert documenti" on documenti
  for insert to authenticated
  with check (is_approved_role(array['admin','amministrazione','dipendente','agente']));

-- documenti: eliminazione solo admin/amministrazione
create policy "Delete documenti" on documenti
  for delete to authenticated
  using (is_approved_role(array['admin','amministrazione']));

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================
create trigger trg_user_profiles_updated_at
  before update on user_profiles
  for each row execute function update_updated_at();

-- ============================================================
-- STORAGE BUCKET (eseguire nella dashboard Supabase)
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('documenti-clienti', 'documenti-clienti', false);
--
-- Policy lettura storage:
-- create policy "Authenticated read documenti" on storage.objects for select
--   to authenticated using (bucket_id = 'documenti-clienti');
--
-- Policy upload:
-- create policy "Authenticated upload documenti" on storage.objects for insert
--   to authenticated with check (bucket_id = 'documenti-clienti');
--
-- Policy delete (admin):
-- create policy "Admin delete documenti" on storage.objects for delete
--   to authenticated using (bucket_id = 'documenti-clienti' and is_approved_role(array['admin','amministrazione']));
