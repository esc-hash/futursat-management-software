-- ============================================================
-- FUTURSAT — Trigger per audit automatico lato DB
-- Opzionale: registra CREATE/UPDATE/DELETE su veicoli e clienti
-- senza passare dal frontend (utile per import massivi via SQL)
-- ============================================================

-- Funzione generica audit
create or replace function fn_audit_log_auto()
returns trigger language plpgsql security definer as $$
declare
  v_azione    text;
  v_old       jsonb;
  v_new       jsonb;
begin
  if    TG_OP = 'INSERT' then v_azione := 'CREATE'; v_old := null;       v_new := to_jsonb(NEW);
  elsif TG_OP = 'UPDATE' then v_azione := 'UPDATE'; v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
  elsif TG_OP = 'DELETE' then v_azione := 'DELETE'; v_old := to_jsonb(OLD); v_new := null;
  end if;

  insert into audit_log (
    user_id, user_email, user_role,
    azione, modulo, record_id, record_label,
    valori_precedenti, valori_nuovi
  ) values (
    auth.uid(),
    coalesce(auth.jwt()->>'email', 'system'),
    coalesce(auth.jwt()->'user_metadata'->>'role', 'system'),
    v_azione,
    TG_TABLE_NAME,
    coalesce((v_new->>'id'), (v_old->>'id')),
    coalesce(v_new->>'ragione_sociale', v_new->>'targa', v_old->>'ragione_sociale', v_old->>'targa'),
    v_old,
    v_new
  );
  return coalesce(NEW, OLD);
end;
$$;

-- Attiva il trigger su veicoli
-- (commentato per default — abilitare solo se si vuole audit DB-level)
-- create or replace trigger trg_veicoli_audit
--   after insert or update or delete on veicoli
--   for each row execute function fn_audit_log_auto();

-- Attiva il trigger su clienti
-- create or replace trigger trg_clienti_audit
--   after insert or update or delete on clienti
--   for each row execute function fn_audit_log_auto();

-- ============================================================
-- Funzione: diff JSON (ritorna solo i campi cambiati tra old e new)
-- Utile per visualizzare le modifiche nell'audit log
-- ============================================================
create or replace function json_diff(old_val jsonb, new_val jsonb)
returns jsonb language sql immutable as $$
  select jsonb_object_agg(key, value)
  from jsonb_each(new_val)
  where new_val->key is distinct from old_val->key;
$$;
