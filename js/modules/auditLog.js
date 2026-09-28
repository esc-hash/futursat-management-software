import { supabase }                  from '../supabaseClient.js';
import { getCurrentUser, getCurrentProfile } from './auth.js';

// ── Scrittura log ───────────────────────────────────────────
export async function logAction({ azione, modulo, record_id = '', record_label = '', valori_precedenti = null, valori_nuovi = null }) {
  try {
    const user    = await getCurrentUser();
    const profile = await getCurrentProfile();
    if (!user) return;
    await supabase.from('audit_log').insert({
      user_id:  user.id,
      user_email: user.email,
      user_role:  profile?.role ?? 'unknown',
      azione, modulo,
      record_id:  String(record_id),
      record_label,
      valori_precedenti,
      valori_nuovi,
    });
  } catch (e) {
    console.warn('[auditLog] write error:', e.message);
  }
}

// ── Lettura log ─────────────────────────────────────────────
export async function fetchAuditLog({ limit = 100, offset = 0, modulo = null, userId = null } = {}) {
  let q = supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (modulo)  q = q.eq('modulo',  modulo);
  if (userId)  q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// ── Mark as read ────────────────────────────────────────────
export async function markAsRead(logId) {
  const user = await getCurrentUser();
  if (!user) return;
  const { data: row } = await supabase.from('audit_log').select('letto_da').eq('id', logId).maybeSingle();
  const letto = row?.letto_da ?? [];
  if (letto.includes(user.id)) return;
  await supabase.from('audit_log').update({ letto_da: [...letto, user.id] }).eq('id', logId);
}

export async function markAllRead(logs) {
  for (const l of logs) await markAsRead(l.id);
}

// ── Realtime subscription ───────────────────────────────────
export function subscribeToAuditLog(callback) {
  return supabase
    .channel('audit-log-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_log' }, p => callback(p.new))
    .subscribe();
}

export function unsubscribe(channel) {
  if (channel) supabase.removeChannel(channel);
}

// ── Render pagina ───────────────────────────────────────────
export default {
  id: 'audit',
  title: 'Registro Attività',
  icon: '📋',
  requiredRoles: ['admin', 'amministrazione'],

  async render(container) {
    container.innerHTML = `
      <div class="page-wrap">
        <div class="page-header">
          <h1 class="page-title">📋 Registro Attività</h1>
          <p class="page-sub">Cronologia completa di ogni azione eseguita nel sistema.</p>
        </div>

        <div class="filter-row" style="margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap;">
          <select id="auditModulo" class="form-select" style="max-width:180px">
            <option value="">Tutti i moduli</option>
            <option value="clienti">Clienti</option>
            <option value="veicoli">Veicoli</option>
            <option value="documenti">Documenti</option>
            <option value="user_profiles">Utenti</option>
          </select>
          <select id="auditAzione" class="form-select" style="max-width:150px">
            <option value="">Tutte le azioni</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="LOGIN">LOGIN</option>
          </select>
          <button class="btn-primary" onclick="window._auditLoad()">🔍 Filtra</button>
          <button class="btn-ghost" onclick="window._auditLoad(true)" style="margin-left:auto">↻ Aggiorna</button>
        </div>

        <div class="table-card">
          <table class="data-table" id="auditTable">
            <thead><tr>
              <th>Quando</th><th>Utente</th><th>Ruolo</th>
              <th>Azione</th><th>Modulo</th><th>Record</th><th></th>
            </tr></thead>
            <tbody id="auditBody">
              <tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text3)">Caricamento…</td></tr>
            </tbody>
          </table>
        </div>

        <div style="margin-top:12px;display:flex;gap:10px;align-items:center">
          <button class="btn-ghost" id="auditPrev" onclick="window._auditPage(-1)">← Precedente</button>
          <span id="auditPageInfo" style="color:var(--text2);font-size:13px"></span>
          <button class="btn-ghost" id="auditNext" onclick="window._auditPage(1)">Successiva →</button>
        </div>
      </div>`;

    let page = 0;
    const PAGE = 50;
    let lastLogs = [];

    window._auditLoad = async (reset = false) => {
      if (reset) page = 0;
      const modulo = document.getElementById('auditModulo')?.value || null;
      const azione = document.getElementById('auditAzione')?.value || null;
      const tbody  = document.getElementById('auditBody');
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3)">Caricamento…</td></tr>';
      try {
        let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (modulo) q = q.eq('modulo',  modulo);
        if (azione) q = q.eq('azione', azione);
        const { data } = await q;
        lastLogs = data ?? [];
        _renderAuditRows(tbody, lastLogs);
        document.getElementById('auditPageInfo').textContent = `Pagina ${page + 1}`;
        document.getElementById('auditPrev').disabled = page === 0;
        document.getElementById('auditNext').disabled = lastLogs.length < PAGE;
      } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" style="color:var(--red);padding:20px">${e.message}</td></tr>`;
      }
    };

    window._auditPage = (dir) => { page = Math.max(0, page + dir); window._auditLoad(); };

    window._auditLoad();
  },
};

function _renderAuditRows(tbody, logs) {
  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text3)">Nessun risultato</td></tr>';
    return;
  }
  tbody.innerHTML = logs.map(l => {
    const d  = new Date(l.created_at);
    const dt = d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });
    const az = { CREATE:'🟢', UPDATE:'🟡', DELETE:'🔴', LOGIN:'🔵', LOGOUT:'⚪', READ:'⬜' }[l.azione] || '';
    const hasDiff = l.valori_precedenti || l.valori_nuovi;
    return `<tr>
      <td style="font-size:12px;color:var(--text2);white-space:nowrap">${dt}</td>
      <td style="font-size:12px">${l.user_email ?? '—'}</td>
      <td><span class="role-chip badge-${l.user_role}">${l.user_role ?? '—'}</span></td>
      <td><span style="font-size:11px;font-weight:700">${az} ${l.azione}</span></td>
      <td style="font-size:12px;color:var(--text2)">${l.modulo}</td>
      <td style="font-size:12px">${l.record_label || l.record_id || '—'}</td>
      <td>${hasDiff ? `<button class="btn-xs" onclick="window._auditDetail(${l.id})">diff</button>` : ''}</td>
    </tr>`;
  }).join('');
}

window._auditDetail = async (id) => {
  const { data } = await supabase.from('audit_log').select('*').eq('id', id).maybeSingle();
  if (!data) return;
  const old_ = data.valori_precedenti;
  const new_ = data.valori_nuovi;
  const keys = [...new Set([...Object.keys(old_ || {}), ...Object.keys(new_ || {})])];
  const rows = keys
    .filter(k => (old_?.[k] ?? null) !== (new_?.[k] ?? null))
    .map(k => `<tr>
      <td style="font-size:12px;font-weight:600;color:var(--text2)">${k}</td>
      <td style="font-size:12px;color:var(--red)">${old_?.[k] ?? '—'}</td>
      <td style="font-size:12px;color:var(--green)">${new_?.[k] ?? '—'}</td>
    </tr>`).join('');
  window.showModal('Dettaglio modifica', `
    <table class="data-table">
      <thead><tr><th>Campo</th><th>Prima</th><th>Dopo</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3" style="padding:20px;text-align:center;color:var(--text3)">Nessuna modifica tracciata</td></tr>'}</tbody>
    </table>`, '');
};
